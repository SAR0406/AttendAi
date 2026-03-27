import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db/client';
import { getPresignedUrl } from '../services/storageService';

function formatTimestamp(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildMarkdown(
  meeting: Record<string, unknown>,
  notes: Record<string, unknown> | null,
  segments: { speaker: string; text: string; start_time: number }[],
): string {
  const lines: string[] = [];
  lines.push(`# ${String(meeting.title ?? 'Meeting')}`);
  lines.push('');
  if (meeting.started_at) {
    lines.push(`**Date:** ${new Date(String(meeting.started_at)).toLocaleString()}`);
  }
  if (meeting.duration_secs) {
    const secs = Number(meeting.duration_secs);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    lines.push(`**Duration:** ${h > 0 ? `${h}h ${m}m` : `${m}m`}`);
  }
  lines.push(`**Status:** ${String(meeting.status ?? '').replace(/_/g, ' ')}`);
  lines.push('');

  if (notes?.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(String(notes.summary));
    lines.push('');
  }

  const sections: { key: string; label: string; icon: string }[] = [
    { key: 'action_items', label: 'Action Items', icon: '✅' },
    { key: 'decisions',    label: 'Decisions',    icon: '🔒' },
    { key: 'key_points',   label: 'Key Points',   icon: '💡' },
    { key: 'questions',    label: 'Open Questions', icon: '❓' },
  ];

  if (notes) {
    for (const { key, label, icon } of sections) {
      const items = notes[key];
      if (Array.isArray(items) && items.length > 0) {
        lines.push(`## ${icon} ${label}`);
        lines.push('');
        (items as string[]).forEach((item) => lines.push(`- ${item}`));
        lines.push('');
      }
    }
  }

  if (segments.length > 0) {
    lines.push('## Transcript');
    lines.push('');
    segments.forEach((s) => {
      lines.push(`**[${formatTimestamp(s.start_time)}] ${s.speaker}:** ${s.text}`);
    });
  }

  return lines.join('\n');
}

export const reportsRouter: FastifyPluginAsync = async (app) => {
  /** Get the full meeting report (notes + transcript + screenshots) */
  app.get<{ Params: { meetingId: string } }>(
    '/:meetingId',
    async (req, reply) => {
      const { meetingId } = req.params;

      const [
        { data: meeting, error: mErr },
        { data: notes },
        { data: segments },
        { data: screenshots },
      ] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', meetingId).single(),
        supabase.from('meeting_notes').select('*').eq('meeting_id', meetingId).single(),
        supabase
          .from('transcript_segments')
          .select('speaker, text, start_time, end_time')
          .eq('meeting_id', meetingId)
          .eq('is_final', true)
          .order('start_time'),
        supabase
          .from('screenshots')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('captured_at'),
      ]);

      if (mErr || !meeting) return reply.status(404).send({ error: 'Meeting not found' });

      // Attach pre-signed URLs for screenshots (R2 private objects)
      const screenshotsWithUrls = await Promise.all(
        (screenshots ?? []).map(async (s) => ({
          ...s,
          url: await getPresignedUrl(s.r2_key as string),
        })),
      );

      return {
        meeting,
        notes,
        transcript: segments ?? [],
        screenshots: screenshotsWithUrls,
      };
    },
  );

  /**
   * Export meeting notes + transcript as a Markdown file download.
   * GET /api/reports/:meetingId/export
   */
  app.get<{ Params: { meetingId: string } }>(
    '/:meetingId/export',
    async (req, reply) => {
      const { meetingId } = req.params;

      const [
        { data: meeting, error: mErr },
        { data: notes },
        { data: segments },
      ] = await Promise.all([
        supabase.from('meetings').select('*').eq('id', meetingId).single(),
        supabase.from('meeting_notes').select('*').eq('meeting_id', meetingId).single(),
        supabase
          .from('transcript_segments')
          .select('speaker, text, start_time')
          .eq('meeting_id', meetingId)
          .eq('is_final', true)
          .order('start_time'),
      ]);

      if (mErr || !meeting) return reply.status(404).send({ error: 'Meeting not found' });

      const markdown = buildMarkdown(
        meeting as Record<string, unknown>,
        notes as Record<string, unknown> | null,
        (segments ?? []) as { speaker: string; text: string; start_time: number }[],
      );

      const filename = `${String(meeting.title ?? 'meeting')
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()}-notes.md`;

      return reply
        .status(200)
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(markdown);
    },
  );
};
