/**
 * Recall.ai service – manages meeting bot lifecycle.
 * Docs: https://docs.recall.ai
 */

export interface RecallBotOptions {
  meetingUrl: string;
  botName?: string;
  webhookUrl?: string;
}

export interface RecallBot {
  id: string;
  status: string;
  meeting_url: string;
}

const RECALL_BASE = 'https://us-east-1.recall.ai/api/v1';

function headers() {
  return {
    Authorization: `Token ${process.env.RECALL_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Spawn a Recall.ai bot that joins the meeting and starts recording/transcribing.
 * The bot is named explicitly to satisfy Zoom ToS §8 recording-consent requirements.
 */
export async function createBot(opts: RecallBotOptions): Promise<RecallBot> {
  const botName = opts.botName ?? 'AttendAi (Recording)';
  const body = {
    meeting_url: opts.meetingUrl,
    bot_name: botName,
    transcription_options: {
      provider: 'deepgram',
      language: 'en',
    },
    real_time_transcription: {
      destination_url: opts.webhookUrl,
      partial_results: true,
    },
    recording: {
      // screenshots are captured server-side by the bot
      video: true,
      audio: true,
    },
  };

  const resp = await fetch(`${RECALL_BASE}/bot/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Recall.ai createBot failed: ${resp.status} ${text}`);
  }

  return resp.json() as Promise<RecallBot>;
}

/** Retrieve bot status */
export async function getBot(botId: string): Promise<RecallBot> {
  const resp = await fetch(`${RECALL_BASE}/bot/${botId}/`, { headers: headers() });
  if (!resp.ok) throw new Error(`Recall.ai getBot failed: ${resp.status}`);
  return resp.json() as Promise<RecallBot>;
}

/** Stop (leave) a bot from its meeting */
export async function stopBot(botId: string): Promise<void> {
  const resp = await fetch(`${RECALL_BASE}/bot/${botId}/leave_call/`, {
    method: 'POST',
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Recall.ai stopBot failed: ${resp.status}`);
}

/**
 * Retrieve the URL of the bot's recorded audio file.
 * Returns null if the recording is not yet available.
 */
export async function getBotAudioUrl(botId: string): Promise<string | null> {
  const resp = await fetch(`${RECALL_BASE}/bot/${botId}/`, { headers: headers() });
  if (!resp.ok) throw new Error(`Recall.ai getBotAudioUrl failed: ${resp.status}`);
  const data = await resp.json() as {
    recordings?: { audio?: { download_url?: string } }[];
  };
  return data.recordings?.[0]?.audio?.download_url ?? null;
}

/** Fetch the full transcript after the meeting ends */
export async function getBotTranscript(
  botId: string,
): Promise<{ speaker: string; words: { text: string; start: number; end: number }[] }[]> {
  const resp = await fetch(`${RECALL_BASE}/bot/${botId}/transcript/`, { headers: headers() });
  if (!resp.ok) throw new Error(`Recall.ai getTranscript failed: ${resp.status}`);
  const data = await resp.json() as { results?: { speaker: string; words: { text: string; start: number; end: number }[] }[] };
  return data.results ?? [];
}
