import 'dotenv/config';
import { Worker } from 'bullmq';
import { redis } from '../queue';
import { supabase } from '../db/client';
import { getBotTranscript } from '../services/recallService';
import { generateMeetingNotes } from '../services/claudeService';
import {
  shouldCaptureFrame,
  compressFrame,
} from '../services/screenshotService';
import { uploadFile, deleteFile } from '../services/storageService';

const connection = { connection: redis };

// ─────────────────────────────────────────────────────────────────────────────
// Transcript Worker
// Fetches the complete post-meeting transcript from Recall.ai and upserts it.
// Concurrency: 5 – each handles one meeting at a time.
// ─────────────────────────────────────────────────────────────────────────────
const transcriptWorker = new Worker(
  'transcript-processing',
  async (job) => {
    const { meetingId, botId } = job.data as { meetingId: string; botId: string };
    console.log(`[transcript] Processing meeting ${meetingId}`);

    const rawSegments = await getBotTranscript(botId);

    // Flatten word-level segments into utterance rows
    const rows = rawSegments.flatMap((seg) => {
      const words = seg.words ?? [];
      if (words.length === 0) return [];
      return [
        {
          meeting_id: meetingId,
          speaker: seg.speaker,
          text: words.map((w) => w.text).join(' '),
          start_time: words[0]?.start ?? 0,
          end_time: words[words.length - 1]?.end ?? 0,
          is_final: true,
        },
      ];
    });

    if (rows.length > 0) {
      // Upsert in batches of 100 to avoid request-size limits
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        await supabase.from('transcript_segments').insert(rows.slice(i, i + batchSize));
      }
    }

    // Update duration
    const lastSeg = rawSegments[rawSegments.length - 1];
    const lastWord = lastSeg?.words?.[lastSeg.words.length - 1];
    if (lastWord) {
      await supabase
        .from('meetings')
        .update({ duration_secs: Math.ceil(lastWord.end) })
        .eq('id', meetingId);
    }

    console.log(`[transcript] Done – ${rows.length} segments saved`);
  },
  { ...connection, concurrency: 5 },
);

// ─────────────────────────────────────────────────────────────────────────────
// Notes Worker (LLM)
// Generates AI meeting notes using Claude with chunked transcript processing.
// Concurrency: 20 – mostly waiting on Claude API responses.
// ─────────────────────────────────────────────────────────────────────────────
const notesWorker = new Worker(
  'llm-notes',
  async (job) => {
    const { meetingId, orgId } = job.data as { meetingId: string; orgId: string };
    console.log(`[notes] Generating notes for meeting ${meetingId}`);

    const { data: segments } = await supabase
      .from('transcript_segments')
      .select('speaker, text, start_time, end_time')
      .eq('meeting_id', meetingId)
      .eq('is_final', true)
      .order('start_time');

    const mappedSegments = (segments ?? []).map((s) => ({
      speaker: s.speaker as string,
      text: s.text as string,
      startTime: s.start_time as number,
      endTime: s.end_time as number,
    }));

    const notes = await generateMeetingNotes(mappedSegments);

    // Upsert notes row
    const { data: existing } = await supabase
      .from('meeting_notes')
      .select('id')
      .eq('meeting_id', meetingId)
      .single();

    if (existing) {
      await supabase
        .from('meeting_notes')
        .update({ ...notes, raw_llm_json: notes, org_id: orgId })
        .eq('meeting_id', meetingId);
    } else {
      await supabase.from('meeting_notes').insert({
        meeting_id: meetingId,
        org_id: orgId,
        ...notes,
        raw_llm_json: notes,
      });
    }

    console.log(`[notes] Done for meeting ${meetingId}`);
  },
  { ...connection, concurrency: 20 },
);

// ─────────────────────────────────────────────────────────────────────────────
// Screenshot Worker
// Downloads screenshots from Recall.ai, deduplicates them, and uploads to R2.
// ─────────────────────────────────────────────────────────────────────────────
const screenshotWorker = new Worker(
  'screenshot-processing',
  async (job) => {
    const { meetingId, botId, orgId } = job.data as {
      meetingId: string;
      botId: string;
      orgId: string;
    };
    console.log(`[screenshot] Processing screenshots for meeting ${meetingId}`);

    // Fetch screenshot list from Recall.ai
    const resp = await fetch(
      `https://us-east-1.recall.ai/api/v1/bot/${botId}/screenshots/`,
      {
        headers: {
          Authorization: `Token ${process.env.RECALL_API_KEY}`,
        },
      },
    );

    if (!resp.ok) {
      console.error(`[screenshot] Failed to fetch screenshots: ${resp.status}`);
      return;
    }

    const data = await resp.json() as {
      results?: { image_url: string; timestamp: number }[];
    };
    const screenshotList = data.results ?? [];

    let lastFrameBuffer: Buffer | null = null;
    let savedCount = 0;

    for (const shot of screenshotList) {
      // Download the frame
      const imgResp = await fetch(shot.image_url);
      if (!imgResp.ok) continue;
      const frameBuffer = Buffer.from(await imgResp.arrayBuffer());

      // Content-change deduplication
      const capture = await shouldCaptureFrame(frameBuffer, lastFrameBuffer);
      if (!capture) continue;

      lastFrameBuffer = frameBuffer;

      // Compress and upload to R2
      const compressed = await compressFrame(frameBuffer);
      const key = `screenshots/${orgId}/${meetingId}/${shot.timestamp}.jpg`;
      const { publicUrl } = await uploadFile(key, compressed, 'image/jpeg');

      await supabase.from('screenshots').insert({
        meeting_id: meetingId,
        org_id: orgId,
        r2_key: key,
        public_url: publicUrl,
        captured_at: shot.timestamp,
      });

      savedCount++;
    }

    console.log(
      `[screenshot] Done – ${savedCount}/${screenshotList.length} unique screenshots saved`,
    );
  },
  { ...connection, concurrency: 5 },
);

// ─────────────────────────────────────────────────────────────────────────────
// Data Deletion Worker (GDPR + Zoom Marketplace requirement)
// Hard-deletes all data for a user or org, including R2 objects.
// ─────────────────────────────────────────────────────────────────────────────
const deletionWorker = new Worker(
  'data-deletion',
  async (job) => {
    const { userId, orgId } = job.data as { userId?: string; orgId?: string };
    console.log(`[deletion] Starting data deletion for userId=${userId} orgId=${orgId}`);

    // Find all meetings for this user/org
    let query = supabase.from('meetings').select('id');
    if (orgId) query = query.eq('org_id', orgId);
    if (userId) query = query.eq('user_id', userId);
    const { data: meetings } = await query;

    for (const m of meetings ?? []) {
      const meetingId = m.id as string;

      // Delete R2 screenshots
      const { data: screenshots } = await supabase
        .from('screenshots')
        .select('r2_key')
        .eq('meeting_id', meetingId);

      await Promise.allSettled(
        (screenshots ?? []).map((s) => deleteFile(s.r2_key as string)),
      );

      // Cascade deletes transcript_segments, notes, screenshots via FK
      await supabase.from('meetings').delete().eq('id', meetingId);
    }

    // Audit the deletion
    if (orgId) {
      await supabase.from('audit_events').insert({
        org_id: orgId,
        action: 'data_deletion',
        resource: orgId ? 'organization' : 'user',
        resource_id: orgId ?? userId,
        metadata: { userId, orgId },
      });
    }

    console.log(`[deletion] Completed for userId=${userId} orgId=${orgId}`);
  },
  { ...connection, concurrency: 2 },
);

// Wire up event logging
for (const [name, worker] of Object.entries({
  transcript: transcriptWorker,
  notes: notesWorker,
  screenshot: screenshotWorker,
  deletion: deletionWorker,
})) {
  worker.on('completed', (job) => console.log(`[${name}] Job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    console.error(`[${name}] Job ${job?.id} failed:`, err),
  );
}

console.log('AttendAi workers started – listening for jobs…');
