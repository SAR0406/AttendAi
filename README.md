# AttendAi 🤖

**AI-powered meeting attendance for Zoom.** AttendAi sends a bot to join meetings in your place, delivers a real-time diarized transcript, and produces AI-generated notes — action items, decisions, key points, and open questions — the moment the meeting ends.

---

## Architecture

```
┌──────────────┐   schedule / join   ┌──────────────────┐
│   Next.js 14  │ ──────────────────▶ │  Fastify API      │
│   Dashboard   │ ◀────────────────── │  (Node.js)        │
└──────┬───────┘  realtime transcript └────────┬─────────┘
       │  Supabase Realtime                     │
       │                               Recall.ai bot
       │                                        │
       │                               Deepgram Nova-3
       │                               (real-time diarization)
       │                                        │
       │                            ┌───────────▼──────────┐
       │                            │  BullMQ + Redis       │
       │                            │  ─ transcript worker  │
       │                            │  ─ llm-notes worker   │
       │                            │  ─ screenshot worker  │
       │                            │  ─ deletion worker    │
       │                            └──────────────────────┘
       │                                        │
       │ Supabase (Postgres + RLS)    Cloudflare R2 (screenshots)
       └────────────────────────────────────────┘
```

### Stack

| Layer | Technology | Reason |
|---|---|---|
| Bot infrastructure | **Recall.ai** | Handles Zoom headless browser, bot policy, OAuth |
| Transcription | **Deepgram Nova-3** (default) or **NVIDIA Riva whisper-large-v3** | Real-time diarization, 300ms latency; Riva adds multi-language + translation |
| AI notes | **Claude claude-sonnet-4-6** | Best at structured extraction, long-context transcripts |
| Backend runtime | **Node.js + Fastify** | Webhook-heavy async I/O; 2–3× faster than Express |
| Job queue | **BullMQ + Redis** | Persistent jobs, retry logic, per-concern concurrency |
| Database | **Supabase (Postgres)** | Row-Level Security for multi-tenant isolation |
| File storage | **Cloudflare R2** | Zero egress cost vs. S3 |
| Auth | **Clerk** | Multi-org support out of the box |
| Frontend | **Next.js 14 App Router** | Server components + WebSocket-ready |

---

## Features

- 🤖 **Bot attendance** — Recall.ai bot joins Zoom with an explicit name (`AttendAi (Recording)`) to satisfy Zoom ToS §8 recording-consent requirements
- 📝 **Real-time diarized transcript** — speaker-labelled, streamed live to the dashboard via Supabase Realtime
- 🔤 **NVIDIA Riva ASR** — whisper-large-v3 via gRPC (`grpc.nvcf.nvidia.com:443`) as an alternative transcription backend with multi-language auto-detection and translation support
- ✨ **AI-generated meeting notes** — Claude extracts action items, decisions, key points, and open questions using a chunked transcript pipeline (10-min windows, 1-min overlap)
- 📸 **Smart screenshots** — content-change deduplication via pixel-diff; only meaningful frame changes are stored
- 🔒 **Multi-tenant isolation** — Postgres Row-Level Security ensures one org can never read another's data
- ♻️ **GDPR data deletion** — `DELETE /api/user-data` endpoint + background worker hard-deletes all data including R2 objects
- 🔁 **Webhook idempotency** — duplicate Recall.ai webhook delivery is handled via a dedup table
- 📊 **Audit log** — every meeting access, share, and deletion is recorded

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local Redis)
- Accounts: [Recall.ai](https://recall.ai), [Deepgram](https://deepgram.com), [Anthropic](https://anthropic.com), [Supabase](https://supabase.com), [Cloudflare R2](https://cloudflare.com/r2), [Clerk](https://clerk.com)

### 1. Clone & install

```bash
git clone https://github.com/SAR0406/AttendAi.git
cd AttendAi
npm install          # installs all workspaces
```

### 2. Set up environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Fill in the values in both `.env` files. See the [Configuration](#configuration) section below.

### 3. Set up the database

Open your Supabase SQL editor and run:

```bash
cat backend/src/db/schema.sql
```

Paste the contents into the Supabase SQL editor and execute.

### 4. Start local services

```bash
# Start Redis (required for BullMQ)
docker compose up redis -d

# Terminal 1 – API server
npm run dev:backend

# Terminal 2 – Background workers
npm run dev:workers

# Terminal 3 – Frontend
npm run dev:frontend
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### 5. Expose your local backend to Recall.ai webhooks

Use [ngrok](https://ngrok.com) or similar:

```bash
ngrok http 3001
# Then set BACKEND_URL=https://xxxx.ngrok.io in backend/.env
```

---

## Configuration

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3001) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS for server-side ops) |
| `REDIS_URL` | Redis connection URL |
| `RECALL_API_KEY` | Recall.ai API key |
| `RECALL_WEBHOOK_SECRET` | Recall.ai webhook signing secret |
| `DEEPGRAM_API_KEY` | Deepgram API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET_NAME` | R2 bucket name (default: `attendai-files`) |
| `R2_PUBLIC_URL` | R2 public CDN URL |
| `FRONTEND_URL` | Frontend URL for CORS (default: `http://localhost:3000`) |
| `BACKEND_URL` | Public URL of this backend (used in Recall.ai webhook URL) |
| `TRANSCRIPTION_PROVIDER` | `deepgram` (default) or `riva` |
| `NVIDIA_API_KEY` | NVIDIA API key (required when `TRANSCRIPTION_PROVIDER=riva`) |
| `RIVA_LANGUAGE_CODE` | BCP-47 language code for Riva, e.g. `en`, `fr`. Use `multi` for auto-detection (default: `en`) |
| `RIVA_TASK` | `transcribe` (default) or `translate` (translate audio to English) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (for client-side Realtime) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:3001`) |

---

## API Reference

### Meetings

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meetings?orgId=` | List meetings for an org |
| `POST` | `/api/meetings` | Schedule a meeting (or join immediately) |
| `GET` | `/api/meetings/:id` | Get meeting details |
| `DELETE` | `/api/meetings/:id/bot` | Stop the bot |
| `GET` | `/api/meetings/:id/transcript` | Get transcript segments (paginated) |

### Reports

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/reports/:meetingId` | Full report (meeting + notes + transcript + screenshots) |

### Webhooks

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/webhooks/recall` | Recall.ai event handler (idempotent) |

### Compliance

| Method | Endpoint | Description |
|---|---|---|
| `DELETE` | `/api/user-data` | GDPR + Zoom Marketplace data deletion |
| `GET` | `/health` | Health check |

---

## Pricing

| Plan | Limits | Price |
|---|---|---|
| Free | 5 meetings/mo · 30-min cap | $0 |
| Pro | Unlimited · 4-hr cap | $15/mo |
| Team | All features + CRM export | $12/seat/mo |
| Enterprise | Custom retention · SSO · API | Custom |

**COGS per meeting:** Recall.ai ~$0.10/min + Deepgram ~$0.008/min + Claude API ~$0.004/min ≈ **$0.11/min**. A 60-min meeting costs ~$6.60.

---

## NVIDIA Riva ASR Integration

AttendAi supports **NVIDIA Riva whisper-large-v3** as an alternative transcription backend. Riva runs on the NVIDIA API Catalog gRPC endpoint and provides:

- Offline (batch) and real-time streaming transcription
- Speaker diarization (who said what)
- Multi-language auto-detection (`RIVA_LANGUAGE_CODE=multi`)
- Translation to English (`RIVA_TASK=translate`)

### How it works

```
Meeting ends
     │
     ▼
Recall.ai downloads audio recording
     │
     ▼
Riva worker sends audio to grpc.nvcf.nvidia.com:443
     │   (gRPC Recognize RPC, whisper-large-v3 model)
     ▼
Diarized word-level results returned
     │
     ▼
Grouped by speaker → TranscriptSegment[]
     │
     ▼
Saved to Supabase → Claude notes generated
```

### Switching to Riva

Set the following in `backend/.env`:

```bash
TRANSCRIPTION_PROVIDER=riva
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxx
RIVA_LANGUAGE_CODE=en        # or "multi" for auto-detection
RIVA_TASK=transcribe         # or "translate" for translation to English
```

You can obtain your NVIDIA API key at [build.nvidia.com](https://build.nvidia.com).

### Equivalent Python CLI commands (for reference)

**English transcription:**
```bash
python python-clients/scripts/asr/transcribe_file_offline.py \
    --server grpc.nvcf.nvidia.com:443 --use-ssl \
    --metadata function-id "b702f636-f60c-4a3d-a6f4-f3568c13bd7d" \
    --metadata "authorization" "Bearer $NVIDIA_API_KEY" \
    --language-code en \
    --input-file <path_to_audio_file>
```

**French → English translation:**
```bash
python python-clients/scripts/asr/transcribe_file_offline.py \
    --server grpc.nvcf.nvidia.com:443 --use-ssl \
    --metadata function-id "b702f636-f60c-4a3d-a6f4-f3568c13bd7d" \
    --metadata "authorization" "Bearer $NVIDIA_API_KEY" \
    --language-code fr \
    --custom-configuration "task:translate" \
    --input-file <path_to_audio_file>
```

The AttendAi backend matches this exactly — the gRPC metadata (`function-id` + `authorization`) and the `custom_configuration` map are built automatically from your environment variables.

### Audio format requirements

Riva expects audio in **Mono, 16-bit** format. Supported encodings: WAV (LINEAR_PCM), FLAC, OPUS. The `encoding` and `sample_rate_hertz` options are configurable in `RivaTranscribeOptions` in `backend/src/services/rivaService.ts`.

---

- **Recording consent** (Zoom ToS §8): Bot is named `AttendAi (Recording)` — visible to all participants
- **Data residency**: Storage layer is region-selectable; configure R2 and Supabase regions per customer
- **GDPR deletion**: `DELETE /api/user-data` queues a job that hard-deletes all Postgres rows and R2 objects
- **Audit log**: All meeting access, sharing, and deletion events are recorded in `audit_events`
- **Multi-tenant RLS**: Postgres Row-Level Security — a leaked JWT from org A cannot read org B's data

---

## Project Structure

```
AttendAi/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Fastify server bootstrap
│   │   ├── db/
│   │   │   ├── client.ts         # Supabase client
│   │   │   └── schema.sql        # Full DB schema + RLS policies
│   │   ├── queue/
│   │   │   └── index.ts          # BullMQ queues + Redis client
│   │   ├── routes/
│   │   │   ├── meetings.ts       # Meeting CRUD
│   │   │   ├── webhooks.ts       # Recall.ai webhook handler
│   │   │   └── reports.ts        # Full meeting report
│   │   ├── services/
│   │   │   ├── recallService.ts  # Recall.ai bot lifecycle + audio download
│   │   │   ├── claudeService.ts  # Claude notes + transcript chunking
│   │   │   ├── rivaService.ts    # NVIDIA Riva gRPC ASR client (whisper-large-v3)
│   │   │   ├── storageService.ts # Cloudflare R2 upload/delete
│   │   │   └── screenshotService.ts # Frame deduplication
│   │   ├── proto/
│   │   │   ├── riva_asr.proto    # NVIDIA Riva ASR service definition
│   │   │   └── riva_audio.proto  # Audio encoding definitions
│   │   └── workers/
│   │       └── index.ts          # All BullMQ workers
│   ├── Dockerfile
│   ├── Dockerfile.workers
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (Clerk + Tailwind)
│   │   ├── page.tsx              # Landing page
│   │   ├── dashboard/page.tsx    # Meeting list dashboard
│   │   └── meetings/[id]/page.tsx # Meeting detail + live transcript
│   ├── components/
│   │   ├── MeetingCard.tsx
│   │   └── ScheduleMeetingModal.tsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Development

```bash
# Run tests
npm test

# Type-check all workspaces
npm run typecheck

# Lint all workspaces
npm run lint
```

---

## License

MIT