import sharp from 'sharp';

/**
 * Determine whether a new video frame is meaningfully different from the last
 * captured screenshot by computing an average pixel difference.
 * Avoids capturing near-identical frames (e.g., static slides unchanged for minutes).
 *
 * @param newFrame     Raw JPEG/PNG buffer from the bot
 * @param lastFrame    Last captured buffer, or null if first frame
 * @param threshold    Average per-channel pixel diff (0-255) above which to capture
 */
export async function shouldCaptureFrame(
  newFrame: Buffer,
  lastFrame: Buffer | null,
  threshold = 15,
): Promise<boolean> {
  if (!lastFrame) return true;

  try {
    // Resize both to a small thumbnail for fast comparison
    const [resizedNew, resizedLast] = await Promise.all([
      sharp(newFrame).resize(160, 90).raw().toBuffer(),
      sharp(lastFrame).resize(160, 90).raw().toBuffer(),
    ]);

    const len = Math.min(resizedNew.length, resizedLast.length);
    let totalDiff = 0;
    for (let i = 0; i < len; i++) {
      totalDiff += Math.abs((resizedNew[i] as number) - (resizedLast[i] as number));
    }
    const avgDiff = totalDiff / len;
    return avgDiff > threshold;
  } catch {
    // If comparison fails, default to capturing
    return true;
  }
}

/** Convert a raw frame buffer to compressed JPEG for storage */
export async function compressFrame(frame: Buffer): Promise<Buffer> {
  return sharp(frame).jpeg({ quality: 80 }).toBuffer();
}
