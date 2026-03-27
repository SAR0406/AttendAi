import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface MeetingExtraction {
  summary: string;
  action_items: string[];
  decisions: string[];
  key_points: string[];
  questions: string[];
}

/**
 * Group transcript segments into overlapping 10-minute chunks.
 * 1-minute overlap preserves cross-boundary context.
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  windowSecs = 600,
  overlapSecs = 60,
): TranscriptSegment[][] {
  if (segments.length === 0) return [];

  const chunks: TranscriptSegment[][] = [];
  let chunkStart = segments[0].startTime;
  const lastEnd = segments[segments.length - 1].endTime;

  while (chunkStart < lastEnd) {
    const chunkEnd = chunkStart + windowSecs;
    const chunk = segments.filter(
      (s) => s.startTime >= chunkStart && s.startTime < chunkEnd,
    );
    if (chunk.length > 0) chunks.push(chunk);
    chunkStart += windowSecs - overlapSecs;
  }

  return chunks;
}

function formatChunk(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
    .join('\n');
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const EXTRACTION_SYSTEM = `You are an expert meeting analyst. Extract structured information from the meeting transcript chunk provided.
Return ONLY valid JSON with these fields:
- summary: string (2-3 sentence overview)
- action_items: string[] (specific tasks with owner if mentioned)
- decisions: string[] (confirmed decisions made)
- key_points: string[] (important discussion points)
- questions: string[] (open questions or follow-ups)

Use speaker names from diarization labels. Be concise and factual.`;

const MERGE_SYSTEM = `You are an expert meeting analyst. You have received extraction results from multiple chunks of the same meeting.
Merge them into one clean, deduplicated report.
Return ONLY valid JSON with these fields:
- summary: string (comprehensive 3-4 sentence overview of the full meeting)
- action_items: string[] (deduplicated, specific tasks with owners)
- decisions: string[] (deduplicated confirmed decisions)
- key_points: string[] (deduplicated key discussion points)
- questions: string[] (open questions or follow-ups)`;

/** Extract structured information from a single chunk */
async function extractChunk(chunk: TranscriptSegment[]): Promise<MeetingExtraction> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: formatChunk(chunk) }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    return JSON.parse(text) as MeetingExtraction;
  } catch {
    return { summary: text, action_items: [], decisions: [], key_points: [], questions: [] };
  }
}

/** Full pipeline: chunk → extract per chunk → merge & deduplicate */
export async function generateMeetingNotes(
  segments: TranscriptSegment[],
): Promise<MeetingExtraction> {
  if (segments.length === 0) {
    return { summary: 'No transcript available.', action_items: [], decisions: [], key_points: [], questions: [] };
  }

  const chunks = chunkTranscript(segments);

  // Extract from all chunks in parallel (I/O-bound, so high concurrency is fine)
  const chunkResults = await Promise.all(chunks.map(extractChunk));

  if (chunkResults.length === 1) return chunkResults[0];

  // Merge pass – deduplicate across chunks
  const merged = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: MERGE_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(chunkResults) }],
  });

  const mergedText =
    merged.content[0].type === 'text' ? merged.content[0].text : '{}';
  try {
    return JSON.parse(mergedText) as MeetingExtraction;
  } catch {
    return chunkResults[0];
  }
}
