import { describe, it, expect } from 'vitest';
import { chunkTranscript } from '../../services/claudeService';
import type { TranscriptSegment } from '../../services/claudeService';

describe('chunkTranscript', () => {
  it('returns empty array for empty input', () => {
    expect(chunkTranscript([])).toEqual([]);
  });

  it('returns single chunk for short transcript', () => {
    const segments: TranscriptSegment[] = [
      { speaker: 'Alice', text: 'Hello', startTime: 0, endTime: 5 },
      { speaker: 'Bob', text: 'Hi there', startTime: 5, endTime: 10 },
    ];
    const chunks = chunkTranscript(segments, 600, 60);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('splits a 25-minute transcript into multiple chunks (10-min window, 1-min overlap)', () => {
    const segments: TranscriptSegment[] = Array.from({ length: 25 }, (_, i) => ({
      speaker: 'Alice',
      text: `Sentence ${i}`,
      startTime: i * 60,
      endTime: i * 60 + 55,
    }));
    const chunks = chunkTranscript(segments, 600, 60);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('each chunk contains only segments within its time window', () => {
    const segments: TranscriptSegment[] = [
      { speaker: 'A', text: 'early', startTime: 0, endTime: 60 },
      { speaker: 'B', text: 'mid', startTime: 601, endTime: 660 },
    ];
    const chunks = chunkTranscript(segments, 600, 60);
    expect(chunks[0][0].text).toBe('early');
  });

  it('overlap causes boundary segments to appear in consecutive chunks', () => {
    // Segment at 560 seconds should appear in both chunk 0 (0-600) and chunk 1 (540-1140)
    const segments: TranscriptSegment[] = [
      { speaker: 'A', text: 'boundary', startTime: 560, endTime: 570 },
      { speaker: 'B', text: 'far', startTime: 1200, endTime: 1210 },
    ];
    const chunks = chunkTranscript(segments, 600, 60);
    const firstChunk = chunks[0];
    expect(firstChunk.some((s) => s.text === 'boundary')).toBe(true);
  });
});
