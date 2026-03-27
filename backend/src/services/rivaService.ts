/**
 * NVIDIA Riva ASR service – gRPC client for whisper-large-v3.
 *
 * Connects to the NVIDIA API Catalog endpoint:
 *   grpc.nvcf.nvidia.com:443
 *
 * Authentication uses the NVIDIA API key passed as gRPC metadata:
 *   function-id: b702f636-f60c-4a3d-a6f4-f3568c13bd7d
 *   authorization: Bearer <NVIDIA_API_KEY>
 *
 * Supports:
 *   - Offline (batch) transcription via Recognize RPC
 *   - Streaming transcription via StreamingRecognize RPC
 *   - Speaker diarization (who said what)
 *   - Multi-language auto-detection (languageCode = "multi")
 *   - Translation (task = "translate")
 *
 * Usage matches the Python CLI:
 *   python transcribe_file_offline.py --server grpc.nvcf.nvidia.com:443 \
 *     --use-ssl \
 *     --metadata function-id "b702f636-f60c-4a3d-a6f4-f3568c13bd7d" \
 *     --metadata "authorization" "Bearer $NVIDIA_API_KEY" \
 *     --language-code en \
 *     --input-file <path_to_audio_file>
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import type { TranscriptSegment } from './claudeService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RIVA_SERVER = 'grpc.nvcf.nvidia.com:443';
const RIVA_FUNCTION_ID = 'b702f636-f60c-4a3d-a6f4-f3568c13bd7d';
const PROTO_DIR = path.join(__dirname, '..', 'proto');

// ─────────────────────────────────────────────────────────────────────────────
// Proto loading (lazy – loaded once on first use)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _asrClient: any = null;

function getAsrClient() {
  if (_asrClient) return _asrClient;

  const packageDef = protoLoader.loadSync(
    path.join(PROTO_DIR, 'riva_asr.proto'),
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR],
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grpcObj = grpc.loadPackageDefinition(packageDef) as any;
  const RivaSpeechRecognition =
    grpcObj?.nvidia?.riva?.asr?.RivaSpeechRecognition;

  if (!RivaSpeechRecognition) {
    throw new Error('Failed to load RivaSpeechRecognition from proto definition');
  }

  _asrClient = new RivaSpeechRecognition(
    RIVA_SERVER,
    grpc.credentials.createSsl(),
  );

  return _asrClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata builder
// ─────────────────────────────────────────────────────────────────────────────

function buildMetadata(): grpc.Metadata {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY environment variable is not set');
  }

  const meta = new grpc.Metadata();
  meta.add('function-id', RIVA_FUNCTION_ID);
  meta.add('authorization', `Bearer ${apiKey}`);
  return meta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface RivaTranscribeOptions {
  /** BCP-47 language code, e.g. "en", "fr". Use "multi" for auto-detection. */
  languageCode?: string;
  /** Sample rate in Hz (default: 16000) */
  sampleRateHertz?: number;
  /**
   * Task override. Pass "translate" to translate the audio into English.
   * Maps to --custom-configuration "task:translate" in the Python CLI.
   */
  task?: 'transcribe' | 'translate';
  /** Enable speaker diarization (who said what). Default: true */
  enableDiarization?: boolean;
  /** Max number of speakers for diarization. Default: 10 */
  maxSpeakerCount?: number;
  /** Audio encoding. Default: LINEAR_PCM */
  encoding?: 'LINEAR_PCM' | 'FLAC' | 'OGGOPUS' | 'MULAW';
}

/**
 * Transcribe an audio buffer using NVIDIA Riva (offline / batch mode).
 *
 * Returns transcript segments compatible with the rest of the AttendAi
 * pipeline (same shape as TranscriptSegment from claudeService).
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  opts: RivaTranscribeOptions = {},
): Promise<TranscriptSegment[]> {
  const {
    languageCode = 'en',
    sampleRateHertz = 16000,
    task,
    enableDiarization = true,
    maxSpeakerCount = 10,
    encoding = 'LINEAR_PCM',
  } = opts;

  const client = getAsrClient();
  const metadata = buildMetadata();

  // Build custom configuration map (used for task:translate, etc.)
  const customConfiguration: Record<string, string> = {};
  if (task === 'translate') {
    customConfiguration['task'] = 'translate';
  }

  const request = {
    config: {
      encoding,
      sample_rate_hertz: sampleRateHertz,
      language_code: languageCode,
      max_alternatives: 1,
      enable_automatic_punctuation: true,
      enable_word_time_offsets: true,
      diarization_config: {
        enable_speaker_diarization: enableDiarization,
        max_speaker_count: maxSpeakerCount,
      },
      custom_configuration: customConfiguration,
    },
    audio: audioBuffer,
  };

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.Recognize(request, metadata, (err: grpc.ServiceError | null, response: any) => {
      if (err) {
        reject(new Error(`Riva Recognize RPC failed: ${err.message}`));
        return;
      }

      const segments = parseRivaResponse(response);
      resolve(segments);
    });
  });
}

/**
 * Streaming transcription using NVIDIA Riva.
 *
 * Feeds audio chunks into a bidirectional stream and yields transcript
 * segments as they arrive. Suitable for real-time meeting transcription
 * when integrated with a custom audio pipeline.
 *
 * @param audioChunks  AsyncIterable of raw PCM audio chunks
 * @param opts         Transcription options
 * @param onSegment    Callback for each transcript segment (partial + final)
 */
export async function transcribeStream(
  audioChunks: AsyncIterable<Buffer>,
  opts: RivaTranscribeOptions = {},
  onSegment: (segment: TranscriptSegment, isFinal: boolean) => void,
): Promise<void> {
  const {
    languageCode = 'en',
    sampleRateHertz = 16000,
    task,
    enableDiarization = true,
    maxSpeakerCount = 10,
    encoding = 'LINEAR_PCM',
  } = opts;

  const client = getAsrClient();
  const metadata = buildMetadata();

  const customConfiguration: Record<string, string> = {};
  if (task === 'translate') {
    customConfiguration['task'] = 'translate';
  }

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = client.StreamingRecognize(metadata) as any;

    call.on('data', (response: unknown) => {
      const segments = parseStreamingResponse(response);
      for (const { segment, isFinal } of segments) {
        onSegment(segment, isFinal);
      }
    });

    call.on('error', (err: grpc.ServiceError) => {
      reject(new Error(`Riva StreamingRecognize RPC failed: ${err.message}`));
    });

    call.on('end', () => resolve());

    // Send the streaming config as the first message
    call.write({
      streaming_config: {
        config: {
          encoding,
          sample_rate_hertz: sampleRateHertz,
          language_code: languageCode,
          max_alternatives: 1,
          enable_automatic_punctuation: true,
          enable_word_time_offsets: true,
          diarization_config: {
            enable_speaker_diarization: enableDiarization,
            max_speaker_count: maxSpeakerCount,
          },
          custom_configuration: customConfiguration,
        },
        interim_results: true,
      },
    });

    // Pipe audio chunks into the stream
    void (async () => {
      try {
        for await (const chunk of audioChunks) {
          call.write({ audio_content: chunk });
        }
        call.end();
      } catch (err) {
        call.destroy(err instanceof Error ? err : new Error(String(err)));
        reject(err);
      }
    })();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Riva RecognizeResponse into AttendAi TranscriptSegments.
 * Groups word-level results by speaker_tag to produce utterances.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRivaResponse(response: any): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  if (!response?.results) return segments;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const result of response.results as any[]) {
    const alt = result.alternatives?.[0];
    if (!alt?.transcript) continue;

    const words: { word: string; start_time: number; end_time: number; speaker_tag: number }[] =
      alt.words ?? [];

    if (words.length === 0) {
      // No word-level detail – produce one segment for the whole utterance
      segments.push({
        speaker: `Speaker 1`,
        text: alt.transcript as string,
        startTime: 0,
        endTime: result.audio_processed ?? 0,
      });
      continue;
    }

    // Group consecutive words by speaker_tag → produce one segment per
    // speaker turn so downstream Claude chunking works correctly.
    let currentSpeaker = words[0]?.speaker_tag ?? 1;
    let turnWords: typeof words = [];

    for (const w of words) {
      if (w.speaker_tag !== currentSpeaker && turnWords.length > 0) {
        segments.push(buildSegment(currentSpeaker, turnWords));
        turnWords = [];
        currentSpeaker = w.speaker_tag;
      }
      turnWords.push(w);
    }
    if (turnWords.length > 0) {
      segments.push(buildSegment(currentSpeaker, turnWords));
    }
  }

  return segments;
}

function buildSegment(
  speakerTag: number,
  words: { word: string; start_time: number; end_time: number }[],
): TranscriptSegment {
  return {
    speaker: `Speaker ${speakerTag}`,
    text: words.map((w) => w.word).join(' '),
    startTime: words[0]?.start_time ?? 0,
    endTime: words[words.length - 1]?.end_time ?? 0,
  };
}

/**
 * Parse a single StreamingRecognizeResponse into labeled segments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStreamingResponse(
  response: unknown,
): { segment: TranscriptSegment; isFinal: boolean }[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = response as any;
  const out: { segment: TranscriptSegment; isFinal: boolean }[] = [];

  for (const result of (r?.results ?? []) as unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    const alt = res.alternatives?.[0];
    if (!alt?.transcript) continue;

    const words: { word: string; start_time: number; end_time: number; speaker_tag: number }[] =
      alt.words ?? [];

    const text = alt.transcript as string;
    const isFinal = Boolean(res.is_final);

    if (words.length === 0) {
      out.push({
        segment: { speaker: 'Speaker 1', text, startTime: 0, endTime: 0 },
        isFinal,
      });
    } else {
      // Group by speaker turn
      const segments = parseRivaResponse({ results: [{ alternatives: [alt] }] });
      for (const seg of segments) {
        out.push({ segment: seg, isFinal });
      }
    }
  }

  return out;
}
