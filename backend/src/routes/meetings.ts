import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/client';
import { transcriptQueue } from '../queue';
import { createBot, stopBot } from '../services/recallService';
import { isUuid } from '../utils/ids';

const DEFAULT_ORG_NAME = 'Personal';

async function resolveOrgId(
  orgId: string,
  orgName?: string,
  createIfMissing = false,
): Promise<{ orgId: string | null; error?: 'lookup' | 'insert' | 'not_found' }> {
  if (isUuid(orgId)) {
    // Verify the org exists to avoid FK errors when creating users/meetings.
    const { data: orgRow, error: orgLookupErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .single();

    if (orgLookupErr) {
      console.error('[meetings] Failed to lookup org by id', orgLookupErr);
      return { orgId: null, error: 'lookup' };
    }
    return orgRow?.id ? { orgId: orgRow.id as string } : { orgId: null, error: 'not_found' };
  }

  const { data: orgRow, error: orgLookupErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('clerk_id', orgId)
    .single();

  if (orgLookupErr) {
    console.error('[meetings] Failed to lookup org by clerk_id', orgLookupErr);
    return { orgId: null, error: 'lookup' };
  }
  if (orgRow?.id) return { orgId: orgRow.id as string };
  if (!createIfMissing) return { orgId: null, error: 'not_found' };

  // Treat empty, whitespace-only, or undefined org names as unset and fall back to the default.
  const name = orgName?.trim() || DEFAULT_ORG_NAME;
  const { data: newOrg, error: orgInsertErr } = await supabase
    .from('organizations')
    .insert({ name, clerk_id: orgId })
    .select('id')
    .single();

  if (orgInsertErr) {
    if (orgInsertErr.code === '23505') {
      const { data: existingOrg, error: existingErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('clerk_id', orgId)
        .single();
      if (existingErr) {
        console.error('[meetings] Failed to re-fetch org after conflict', existingErr);
        return { orgId: null, error: 'insert' };
      }
      if (existingOrg?.id) return { orgId: existingOrg.id as string };
    }
    console.error('[meetings] Failed to create org', orgInsertErr);
    return { orgId: null, error: 'insert' };
  }
  if (!newOrg) {
    console.error('[meetings] Failed to create org: no data returned');
    return { orgId: null, error: 'insert' };
  }
  return { orgId: newOrg.id as string };
}

async function resolveUserId(
  userId: string,
  orgId: string,
  userEmail?: string,
  userName?: string,
): Promise<{ userId: string | null; error?: 'lookup' | 'insert' | 'missing_email' }> {
  const { data: userRow, error: userLookupErr } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', userId)
    .single();

  if (userLookupErr) {
    console.error('[meetings] Failed to lookup user', userLookupErr);
    return { userId: null, error: 'lookup' };
  }
  if (userRow?.id) return { userId: userRow.id as string };
  if (!userEmail) return { userId: null, error: 'missing_email' };

  const { data: newUser, error: userInsertErr } = await supabase
    .from('users')
    .insert({
      org_id: orgId,
      clerk_id: userId,
      email: userEmail,
      name: userName ?? null,
    })
    .select('id')
    .single();

  if (userInsertErr) {
    if (userInsertErr.code === '23505') {
      const { data: existingUser, error: existingErr } = await supabase
        .from('users')
        .select('id')
        .eq('clerk_id', userId)
        .single();
      if (existingErr) {
        console.error('[meetings] Failed to re-fetch user after conflict', existingErr);
        return { userId: null, error: 'insert' };
      }
      if (existingUser?.id) return { userId: existingUser.id as string };
    }
    console.error('[meetings] Failed to create user', userInsertErr);
    return { userId: null, error: 'insert' };
  }
  if (!newUser) {
    console.error('[meetings] Failed to create user: no data returned');
    return { userId: null, error: 'insert' };
  }
  return { userId: newUser.id as string };
}

const ScheduleMeetingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  zoomJoinUrl: z.string().url().optional(),
  recordingUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
  orgId: z.string().min(1),
  orgName: z.string().min(1).max(255).optional(),
  userEmail: z.string().email().optional(),
  userName: z.string().min(1).max(255).optional(),
  /** Clerk user IDs can be UUIDs or the "user_xxx" format */
  userId: z.string().min(1),
}).refine((data) => data.zoomJoinUrl || data.recordingUrl, {
  message: 'Provide a Zoom join URL or a recording URL',
  path: ['zoomJoinUrl'],
}).refine((data) => !(data.zoomJoinUrl && data.recordingUrl), {
  message: 'Choose either a Zoom join URL or a recording URL',
  path: ['recordingUrl'],
}).refine((data) => !(data.recordingUrl && data.scheduledAt), {
  message: 'Recording imports cannot be scheduled',
  path: ['scheduledAt'],
});

export const meetingsRouter: FastifyPluginAsync = async (app) => {
  /** List meetings for an org */
  app.get<{ Querystring: { orgId: string; page?: string; search?: string; status?: string; sort?: string } }>(
    '/',
    async (req, reply) => {
      const { orgId, page = '1', search, status, sort = 'newest' } = req.query;
      if (!orgId) return reply.status(400).send({ error: 'orgId required' });
      if (search && search.length > 200) return reply.status(400).send({ error: 'search too long' });

      const limit = 20;
      const pageNum = Math.max(1, Number(page));
      const offset = (pageNum - 1) * limit;

      const { orgId: resolvedOrgId, error: orgError } = await resolveOrgId(orgId);
      if (!resolvedOrgId) {
        if (orgError === 'lookup' || orgError === 'insert') {
          return reply.status(500).send({ error: 'Unable to resolve organization' });
        }
        return { meetings: [], total: 0, page: pageNum, limit };
      }

      let query = supabase
        .from('meetings')
        .select('*', { count: 'exact' })
        .eq('org_id', resolvedOrgId);

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      if (status) {
        query = query.eq('status', status);
      }

      query = query
        .order('created_at', { ascending: sort === 'oldest' })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) return reply.status(500).send({ error: error.message });
      return { meetings: data, total: count ?? 0, page: pageNum, limit };
    },
  );

  /** Get a single meeting (with notes + segments summary) */
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;

    const [{ data: meeting, error: mErr }, { data: notes }, { data: screenshots }] =
      await Promise.all([
        supabase.from('meetings').select('*').eq('id', id).single(),
        supabase.from('meeting_notes').select('*').eq('meeting_id', id).single(),
        supabase
          .from('screenshots')
          .select('id, public_url, captured_at')
          .eq('meeting_id', id)
          .order('captured_at'),
      ]);

    if (mErr) return reply.status(404).send({ error: 'Meeting not found' });
    return { meeting, notes, screenshots };
  });

  /** Schedule (or immediately start) a bot for a meeting, or import a recording */
  app.post('/', async (req, reply) => {
    const parsed = ScheduleMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; ');
      return reply.status(400).send({ error: message });
    }

    const {
      title,
      zoomJoinUrl,
      recordingUrl,
      scheduledAt,
      orgId,
      orgName,
      userEmail,
      userName,
      userId,
    } = parsed.data;
    const meetingId = uuidv4();

    const { orgId: resolvedOrgId, error: orgError } = await resolveOrgId(orgId, orgName, true);
    if (!resolvedOrgId) {
      const status = orgError === 'not_found' ? 400 : 500;
      const message = orgError === 'not_found' ? 'Organization not found' : 'Unable to resolve organization';
      return reply.status(status).send({ error: message });
    }

    const { userId: resolvedUserId, error: userError } = await resolveUserId(
      userId,
      resolvedOrgId,
      userEmail,
      userName,
    );
    if (!resolvedUserId) {
      if (userError === 'missing_email') {
        return reply.status(400).send({
          error: 'User not found; include userEmail to auto-create the user record',
        });
      }
      return reply.status(500).send({ error: 'Unable to resolve user' });
    }

    // Persist the meeting row first
    const { error: dbErr } = await supabase.from('meetings').insert({
      id: meetingId,
      org_id: resolvedOrgId,
      user_id: resolvedUserId,
      title: title ?? 'Untitled Meeting',
      zoom_join_url: zoomJoinUrl ?? recordingUrl,
      status: recordingUrl ? 'processing' : scheduledAt ? 'scheduled' : 'joining',
      scheduled_at: scheduledAt ?? null,
    });

    if (dbErr) return reply.status(500).send({ error: dbErr.message });

    if (recordingUrl) {
      if ((process.env.TRANSCRIPTION_PROVIDER ?? 'deepgram') !== 'riva') {
        return reply.status(400).send({
          error: 'Recording imports require TRANSCRIPTION_PROVIDER=riva',
        });
      }

      await transcriptQueue.add('process-transcript', {
        meetingId,
        orgId,
        audioUrl: recordingUrl,
        enqueueNotes: true,
      });

      return reply.status(201).send({ meetingId, status: 'processing' });
    }

    // If no scheduled time, join immediately
    if (!scheduledAt) {
      try {
        if (!zoomJoinUrl) {
          return reply.status(400).send({ error: 'Zoom join URL required' });
        }
        const webhookBase = `${process.env.BACKEND_URL ?? 'http://localhost:3001'}/api/webhooks`;
        const bot = await createBot({
          meetingUrl: zoomJoinUrl,
          webhookUrl: `${webhookBase}/recall`,
        });

        await supabase
          .from('meetings')
          .update({ recall_bot_id: bot.id, status: 'joining' })
          .eq('id', meetingId);

        return reply.status(201).send({ meetingId, botId: bot.id, status: 'joining' });
      } catch (err) {
        await supabase
          .from('meetings')
          .update({ status: 'failed' })
          .eq('id', meetingId);
        return reply.status(502).send({ error: `Bot creation failed: ${String(err)}` });
      }
    }

    return reply.status(201).send({ meetingId, status: 'scheduled' });
  });

  /** Manually stop a bot */
  app.delete<{ Params: { id: string } }>('/:id/bot', async (req, reply) => {
    const { id } = req.params;
    const { data: meeting, error } = await supabase
      .from('meetings')
      .select('recall_bot_id')
      .eq('id', id)
      .single();

    if (error || !meeting) return reply.status(404).send({ error: 'Meeting not found' });
    if (!meeting.recall_bot_id) return reply.status(400).send({ error: 'No active bot' });

    await stopBot(meeting.recall_bot_id as string);
    return { message: 'Bot stop requested' };
  });

  /** Get transcript segments for a meeting (paginated) */
  app.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    '/:id/transcript',
    async (req, reply) => {
      const { id } = req.params;
      const { page = '1' } = req.query;
      const limit = 100;
      const offset = (Math.max(1, Number(page)) - 1) * limit;

      const { data, error, count } = await supabase
        .from('transcript_segments')
        .select('*', { count: 'exact' })
        .eq('meeting_id', id)
        .eq('is_final', true)
        .order('start_time')
        .range(offset, offset + limit - 1);

      if (error) return reply.status(500).send({ error: error.message });
      return { segments: data, total: count ?? 0 };
    },
  );
};
