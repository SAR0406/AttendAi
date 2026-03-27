import type { MeetingExtraction, TranscriptSegment } from './claudeService';
import { generateMeetingNotes as generateClaudeNotes } from './claudeService';
import { generateMeetingNotes as generateNimNotes } from './nimService';

type LlmProvider = 'nim' | 'claude';

const LLM_PROVIDER: LlmProvider =
  (process.env.LLM_PROVIDER as LlmProvider | undefined) ?? 'nim';

export async function generateMeetingNotes(
  segments: TranscriptSegment[],
): Promise<MeetingExtraction> {
  if (LLM_PROVIDER === 'claude') {
    return generateClaudeNotes(segments);
  }
  return generateNimNotes(segments);
}
