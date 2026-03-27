import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/client';
import { transcriptQueue } from '../queue';
import { createBot, stopBot } from '../services/recallService';

const ScheduleMeetingSchema = z.object({
  title: z.string().optional(),
  zoomJoinUrl: z.string().url().optional(),
  recordingUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
}).refine((data) => data.zoomJoinUrl || data.recordingUrl, {
  message: 'Provide a Zoom join URL or a recording URL',
  path: ['zoomJoinUrl'],
}).refine((data) => !(data.zoomJoinUrl && data.recordingUrl), {
  message: 'Choose either a Zoom join URL or a recording URL',
  path: ['zoomJoinUrl'],
}).refine((data) => !(data.recordingUrl && data.scheduledAt), {
  message: 'Recording imports cannot be scheduled',
  path: ['recordingUrl'],
});

export const meetingsRouter: FastifyPluginAsync = async (app) => {
  /** List meetings for an org */
  app.get<{ Querystring: { orgId: string; page?: string } }>(
    '/',
    async (req, reply) => {
      const { orgId, page = '1' } = req.query;
      if (!orgId) return reply.status(400).send({ error: 'orgId required' });

      const limit = 20;
      const offset = (Number(page) - 1) * limit;

      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return reply.status(500).send({ error: error.message });
      return { meetings: data };
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
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.format() });

    const { title, zoomJoinUrl, recordingUrl, scheduledAt, orgId, userId } = parsed.data;
    const meetingId = uuidv4();

    // Persist the meeting row first
    const { error: dbErr } = await supabase.from('meetings').insert({
      id: meetingId,
      org_id: orgId,
      user_id: userId,
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
      const offset = (Number(page) - 1) * limit;

      const { data, error } = await supabase
        .from('transcript_segments')
        .select('*')
        .eq('meeting_id', id)
        .eq('is_final', true)
        .order('start_time')
        .range(offset, offset + limit - 1);

      if (error) return reply.status(500).send({ error: error.message });
      return { segments: data };
    },
  );
};
