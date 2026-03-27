import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db/client';
import { getPresignedUrl } from '../services/storageService';

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
};
