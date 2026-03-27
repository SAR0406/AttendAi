import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the gRPC modules so these tests run without native bindings
vi.mock('@grpc/grpc-js', () => ({
  credentials: { createSsl: vi.fn(() => ({})) },
  Metadata: class {
    private entries: Record<string, string> = {};
    add(key: string, value: string) { this.entries[key] = value; }
    get(key: string) { return [this.entries[key]]; }
    getMap() { return this.entries; }
  },
  loadPackageDefinition: vi.fn(),
  ServiceError: class extends Error {},
}));

vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({})),
}));

describe('rivaService – metadata builder', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws if NVIDIA_API_KEY is not set', async () => {
    const savedKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;

    // Set up a valid gRPC mock so the client initialises successfully
    const grpcMod = await import('@grpc/grpc-js');
    const protoMod = await import('@grpc/proto-loader');

    vi.mocked(protoMod.loadSync).mockReturnValue({} as ReturnType<typeof protoMod.loadSync>);

    const mockClientInstance = { Recognize: vi.fn() };
    vi.mocked(grpcMod.loadPackageDefinition).mockReturnValue({
      nvidia: { riva: { asr: { RivaSpeechRecognition: vi.fn(() => mockClientInstance) } } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.resetModules();
    const { transcribeAudio } = await import('../../services/rivaService');

    await expect(transcribeAudio(Buffer.from('test'))).rejects.toThrow(
      'NVIDIA_API_KEY',
    );

    if (savedKey !== undefined) process.env.NVIDIA_API_KEY = savedKey;
  });
});

describe('rivaService – response parsing (parseRivaResponse via transcribeAudio)', () => {
  it('parses word-level diarized response into speaker-grouped segments', async () => {
    // We test the exported parseRivaResponse indirectly by mocking the gRPC
    // client and calling transcribeAudio.
    process.env.NVIDIA_API_KEY = 'test-key';

    const grpcMod = await import('@grpc/grpc-js');
    const protoMod = await import('@grpc/proto-loader');

    // Mock proto loader to return dummy definition
    vi.mocked(protoMod.loadSync).mockReturnValue({} as ReturnType<typeof protoMod.loadSync>);

    // Mock gRPC client that calls the callback with a synthetic response
    const mockResponse = {
      results: [
        {
          audio_processed: 10,
          alternatives: [
            {
              transcript: 'Hello world goodbye',
              confidence: 0.99,
              words: [
                { word: 'Hello', start_time: 0, end_time: 1, speaker_tag: 1 },
                { word: 'world', start_time: 1, end_time: 2, speaker_tag: 1 },
                { word: 'goodbye', start_time: 3, end_time: 4, speaker_tag: 2 },
              ],
            },
          ],
        },
      ],
    };

    const mockClientInstance = {
      Recognize: vi.fn((_req: unknown, _meta: unknown, cb: (err: null, res: typeof mockResponse) => void) => {
        cb(null, mockResponse);
      }),
    };

    vi.mocked(grpcMod.loadPackageDefinition).mockReturnValue({
      nvidia: {
        riva: {
          asr: {
            RivaSpeechRecognition: vi.fn(() => mockClientInstance),
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Reset the module so the lazy-loaded client is re-created
    vi.resetModules();
    const { transcribeAudio } = await import('../../services/rivaService');

    const segments = await transcribeAudio(Buffer.from('audio'), { languageCode: 'en' });

    // Speaker 1 turns: "Hello world" → one segment
    // Speaker 2 turn:  "goodbye"    → one segment
    expect(segments.length).toBe(2);
    expect(segments[0].speaker).toBe('Speaker 1');
    expect(segments[0].text).toBe('Hello world');
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBe(2);

    expect(segments[1].speaker).toBe('Speaker 2');
    expect(segments[1].text).toBe('goodbye');
    expect(segments[1].startTime).toBe(3);
    expect(segments[1].endTime).toBe(4);
  });

  it('returns empty array when results list is empty', async () => {
    process.env.NVIDIA_API_KEY = 'test-key';

    const grpcMod = await import('@grpc/grpc-js');
    const protoMod = await import('@grpc/proto-loader');

    vi.mocked(protoMod.loadSync).mockReturnValue({} as ReturnType<typeof protoMod.loadSync>);

    const mockClientInstance = {
      Recognize: vi.fn((_req: unknown, _meta: unknown, cb: (err: null, res: { results: never[] }) => void) => {
        cb(null, { results: [] });
      }),
    };

    vi.mocked(grpcMod.loadPackageDefinition).mockReturnValue({
      nvidia: { riva: { asr: { RivaSpeechRecognition: vi.fn(() => mockClientInstance) } } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.resetModules();
    const { transcribeAudio } = await import('../../services/rivaService');

    const segments = await transcribeAudio(Buffer.from('audio'));
    expect(segments).toEqual([]);
  });
});
