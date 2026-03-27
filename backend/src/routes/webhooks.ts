import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db/client';
import { transcriptQueue, notesQueue, screenshotQueue } from '../queue';

/** Recall.ai event types we handle */
type RecallEventType =
  | 'bot.joining_call'
  | 'bot.in_call_not_recording'
  | 'bot.in_call_recording'
  | 'bot.recording_permission_denied'
  | 'bot.call_ended'
  | 'bot.done'
  | 'bot.fatal'
  | 'transcript.partial_transcript'
  | 'transcript.final_transcript';

interface RecallWebhookEvent {
  event: RecallEventType;
  data: {
    bot_id?: string;
    transcript?: {
      speaker: string;
      words: { text: string; start: number; end: number }[];
    };
    screenshot?: {
      image_url: string;
      timestamp: number;
    };
  };
}

/**
 * Central webhook handler for Recall.ai events.
 * All handlers are idempotent – duplicate delivery is handled via webhook_events table.
 */
export const webhooksRouter: FastifyPluginAsync = async (app) => {
  app.post<{ Body: RecallWebhookEvent }>('/recall', async (req, reply) => {
    const event = req.body;
    const botId = event.data?.bot_id;

    if (!botId) return reply.status(400).send({ error: 'Missing bot_id' });

    // ── Idempotency check ──────────────────────────────────────────────────
    // Recall.ai may retry webhooks; we deduplicate using a composite event id.
    const externalId = `${botId}:${event.event}:${Date.now()}`;
    // For stateful events (transcript partials) we skip dedup – they're not retriable.
    const dedupEvents: RecallEventType[] = [
      'bot.call_ended',
      'bot.done',
      'bot.fatal',
      'bot.in_call_recording',
    ];

    if (dedupEvents.includes(event.event)) {
      const { data: existing } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('external_id', `${botId}:${event.event}`)
        .single();

      if (existing) {
        app.log.info({ botId, event: event.event }, 'Duplicate webhook – skipping');
        return reply.status(200).send({ message: 'already processed' });
      }

      await supabase
        .from('webhook_events')
        .insert({ external_id: `${botId}:${event.event}`, event_type: event.event });
    }
    // ── End idempotency ────────────────────────────────────────────────────

    // Lookup meeting by bot id
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, org_id')
      .eq('recall_bot_id', botId)
      .single();

    if (!meeting) {
      app.log.warn({ botId }, 'No meeting found for bot – ignoring webhook');
      return reply.status(200).send({ message: 'ignored' });
    }

    const meetingId = meeting.id as string;
    const orgId = meeting.org_id as string;

    switch (event.event) {
      case 'bot.joining_call':
        await supabase
          .from('meetings')
          .update({ status: 'joining' })
          .eq('id', meetingId);
        break;

      case 'bot.in_call_recording':
        await supabase
          .from('meetings')
          .update({ status: 'in_progress', started_at: new Date().toISOString() })
          .eq('id', meetingId);
        break;

      case 'bot.recording_permission_denied':
        app.log.warn({ botId, meetingId }, 'Recording permission denied by host');
        await supabase
          .from('meetings')
          .update({ status: 'failed' })
          .eq('id', meetingId);
        break;

      case 'transcript.partial_transcript':
      case 'transcript.final_transcript': {
        const seg = event.data.transcript;
        if (!seg) break;

        const words = seg.words ?? [];
        const text = words.map((w) => w.text).join(' ');
        const startTime = words[0]?.start ?? 0;
        const endTime = words[words.length - 1]?.end ?? 0;

        await supabase.from('transcript_segments').insert({
          meeting_id: meetingId,
          org_id: orgId,
          speaker: seg.speaker,
          text,
          start_time: startTime,
          end_time: endTime,
          is_final: event.event === 'transcript.final_transcript',
        });
        break;
      }

      case 'bot.call_ended':
        await supabase
          .from('meetings')
          .update({
            status: 'processing',
            ended_at: new Date().toISOString(),
          })
          .eq('id', meetingId);

        // Enqueue post-processing jobs
        await Promise.all([
          transcriptQueue.add('process-transcript', { meetingId, botId }),
          notesQueue.add('generate-notes', { meetingId, orgId }),
          screenshotQueue.add('process-screenshots', { meetingId, botId, orgId }),
        ]);
        break;

      case 'bot.done':
        // Final state – meeting fully processed
        await supabase
          .from('meetings')
          .update({ status: 'completed' })
          .eq('id', meetingId);
        break;

      case 'bot.fatal':
        await supabase
          .from('meetings')
          .update({ status: 'failed' })
          .eq('id', meetingId);
        break;

      default:
        app.log.debug({ event: event.event }, 'Unhandled webhook event type');
    }

    return reply.status(200).send({ message: 'ok' });
  });

  /** Verify webhook is reachable (used by Recall.ai during setup) */
  app.get('/recall', async (_req, reply) => reply.status(200).send({ ok: true }));
};
