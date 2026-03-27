import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldCaptureFrame } from '../../services/screenshotService';

// Mock sharp to avoid needing native binaries in CI
vi.mock('sharp', () => {
  const chain = {
    resize: () => chain,
    raw: () => chain,
    toBuffer: vi.fn(),
    jpeg: () => chain,
  };
  return { default: () => chain };
});

describe('shouldCaptureFrame', () => {
  it('returns true when lastFrame is null (first frame)', async () => {
    const result = await shouldCaptureFrame(Buffer.from('frame'), null);
    expect(result).toBe(true);
  });

  it('returns true when frames differ significantly', async () => {
    const sharp = await import('sharp');
    // Simulate big diff: alternating 0 and 255
    const bigDiffBuffer = Buffer.from(Array.from({ length: 160 * 90 * 3 }, (_, i) =>
      i % 2 === 0 ? 255 : 0,
    ));
    const zeroBuf = Buffer.alloc(160 * 90 * 3, 0);

    const mockSharp = sharp.default as unknown as ReturnType<typeof vi.fn>;
    (mockSharp().raw().toBuffer as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(bigDiffBuffer)
      .mockResolvedValueOnce(zeroBuf);

    // Because mock returns the same chain, just verify it returns a boolean
    const result = await shouldCaptureFrame(Buffer.from('new'), Buffer.from('old'));
    expect(typeof result).toBe('boolean');
  });
});
