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

/** Build a loadPackageDefinition mock that returns a constructor-compatible class */
function makeGrpcMock(clientInstance: object) {
  // Use a regular function (not arrow) so it can be invoked with `new`
  // When a constructor returns an object, `new` uses that object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function RivaSpeechRecognition(this: any) {
    // copy all methods onto `this`
    Object.assign(this, clientInstance);
  }
  return {
    nvidia: { riva: { asr: { RivaSpeechRecognition } } },
  };
}

describe('rivaService – metadata builder', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws if NVIDIA_API_KEY is not set', async () => {
    const savedKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;

    const grpcMod = await import('@grpc/grpc-js');
    const protoMod = await import('@grpc/proto-loader');

    vi.mocked(protoMod.loadSync).mockReturnValue({} as ReturnType<typeof protoMod.loadSync>);
    vi.mocked(grpcMod.loadPackageDefinition).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeGrpcMock({ Recognize: vi.fn() }) as any,
    );

    vi.resetModules();
    const { transcribeAudio } = await import('../../services/rivaService');

    await expect(transcribeAudio(Buffer.from('test'))).rejects.toThrow('NVIDIA_API_KEY');

    if (savedKey !== undefined) process.env.NVIDIA_API_KEY = savedKey;
  });
});

describe('rivaService – response parsing (parseRivaResponse via transcribeAudio)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NVIDIA_API_KEY = 'test-key';
  });

  it('parses word-level diarized response into speaker-grouped segments', async () => {
    const mockResponse = {
      results: [
        {
          audio_processed: 10,
          alternatives: [
            {
              transcript: 'Hello world goodbye',
              confidence: 0.99,
              words: [
                { word: 'Hello',   start_time: 0, end_time: 1, speaker_tag: 1 },
                { word: 'world',   start_time: 1, end_time: 2, speaker_tag: 1 },
                { word: 'goodbye', start_time: 3, end_time: 4, speaker_tag: 2 },
              ],
            },
          ],
        },
      ],
    };

    const grpcMod = await import('@grpc/grpc-js');
    const protoMod = await import('@grpc/proto-loader');

    vi.mocked(protoMod.loadSync).mockReturnValue({} as ReturnType<typeof protoMod.loadSync>);
    vi.mocked(grpcMod.loadPackageDefinition).mockReturnValue(
      makeGrpcMock({
        Recognize: vi.fn(
          (_req: unknown, _meta: unknown, cb: (err: null, res: typeof mockResponse) => void) => {
            cb(null, mockResponse);
          },
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );

    vi.resetModules();
    const { transcribeAudio } = await import('../../services/rivaService');

    const segments = await transcribeAudio(Buffer.from('audio'), { languageCode: 'en' });

    // Speaker 1 turn: "Hello world" → one segment
    // Speaker 2 turn: "goodbye"    → one segment
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
    const grpcMod = await import('@grpc/grpc-js');
    const protoMod = await import('@grpc/proto-loader');

    vi.mocked(protoMod.loadSync).mockReturnValue({} as ReturnType<typeof protoMod.loadSync>);
    vi.mocked(grpcMod.loadPackageDefinition).mockReturnValue(
      makeGrpcMock({
        Recognize: vi.fn(
          (
            _req: unknown,
            _meta: unknown,
            cb: (err: null, res: { results: never[] }) => void,
          ) => { cb(null, { results: [] }); },
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );

    vi.resetModules();
    const { transcribeAudio } = await import('../../services/rivaService');

    const segments = await transcribeAudio(Buffer.from('audio'));
    expect(segments).toEqual([]);
  });
});
