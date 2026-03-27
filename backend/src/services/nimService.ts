import type { MeetingExtraction, TranscriptSegment } from './claudeService';
import { chunkTranscript } from './claudeService';

const DEFAULT_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NIM_MODEL = 'glm-5';

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

interface NimChatResponse {
  choices?: { message?: { content?: string }; text?: string }[];
}

function getNimConfig() {
  const apiKey = process.env.NIM_API_KEY ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NIM_API_KEY or NVIDIA_API_KEY environment variable is not set');
  }

  const baseUrl = process.env.NIM_API_BASE_URL ?? DEFAULT_NIM_BASE_URL;
  const model = process.env.NIM_MODEL ?? process.env.LLM_MODEL ?? DEFAULT_NIM_MODEL;
  const enableWebSearch =
    process.env.NIM_ENABLE_WEB_SEARCH === 'true' || process.env.NIM_ENABLE_WEB_SEARCH === '1';

  return { apiKey, baseUrl, model, enableWebSearch };
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

async function nimChat(system: string, user: string, maxTokens: number): Promise<string> {
  const { apiKey, baseUrl, model, enableWebSearch } = getNimConfig();
  const payload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  if (enableWebSearch) {
    payload.tools = [{ type: 'web_search' }];
    payload.tool_choice = 'auto';
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`NIM chat completion failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as NimChatResponse;
  return (
    data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.text ??
    ''
  );
}

async function extractChunk(chunk: TranscriptSegment[]): Promise<MeetingExtraction> {
  const text = await nimChat(EXTRACTION_SYSTEM, formatChunk(chunk), 1024);
  try {
    return JSON.parse(text) as MeetingExtraction;
  } catch {
    return { summary: text, action_items: [], decisions: [], key_points: [], questions: [] };
  }
}

export async function generateMeetingNotes(
  segments: TranscriptSegment[],
): Promise<MeetingExtraction> {
  if (segments.length === 0) {
    return { summary: 'No transcript available.', action_items: [], decisions: [], key_points: [], questions: [] };
  }

  const chunks = chunkTranscript(segments);
  const chunkResults = await Promise.all(chunks.map(extractChunk));

  if (chunkResults.length === 1) return chunkResults[0];

  const mergedText = await nimChat(MERGE_SYSTEM, JSON.stringify(chunkResults), 2048);
  try {
    return JSON.parse(mergedText) as MeetingExtraction;
  } catch {
    return chunkResults[0];
  }
}
