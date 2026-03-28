# Changelog

All notable changes to AttendAi are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

---

## [2.0.0] — 2026-03-28 (latest on `main`)

### Added
- **Multi-provider file storage** — Backblaze B2, MinIO, Supabase Storage, local disk, and AWS S3 as drop-in alternatives to Cloudflare R2 (`STORAGE_PROVIDER` env var).
- **Modern UI/UX redesign** — shared component library, accessibility improvements, responsive layouts.
- **Auth middleware** — per-route Clerk JWT validation on the backend.
- **Meeting search & filter** — full-text search and date/status filters on the dashboard.
- **GDPR export** — `GET /api/user-data` returns a ZIP archive of all user data.
- **NVIDIA NIM LLM support** — GLM-5 / Minimax-2.5 as default AI notes provider (`LLM_PROVIDER=nim`).
- **Recording import** — `POST /api/meetings` with `recordingUrl` skips Recall.ai; requires `TRANSCRIPTION_PROVIDER=riva`.

### Changed
- Fastify upgraded **4 → 5.8.4** (breaking: plugin API).
- Next.js upgraded **14 → 15.5.14** (App Router, React Server Components).
- Vitest upgraded **1 → 4.1.2**.

### Fixed
- Webhook idempotency across all Recall.ai event types.
- Duplicate transcript segment insertion under high-concurrency Deepgram streams.

---

## [1.0.0] — initial release

- Recall.ai bot joins Zoom meetings and streams real-time diarized transcripts via Deepgram Nova-3.
- BullMQ workers for transcript, AI notes, screenshot, and data-deletion jobs.
- Supabase Postgres with Row-Level Security for multi-tenant isolation.
- Cloudflare R2 for screenshot storage.
- Clerk authentication with multi-org support.

---

## Git commands — keeping `main` up to date

### Clone the repo and get the latest

```bash
git clone https://github.com/SAR0406/AttendAi.git
cd AttendAi
git checkout main
git pull origin main
```

### Day-to-day development workflow

```bash
# 1. Start from the latest main
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/my-new-feature

# 3. Make changes, then stage and commit
git add .
git commit -m "feat: describe your change"

# 4. Push the branch and open a Pull Request
git push origin feature/my-new-feature
# → Open a PR on GitHub targeting main
```

### Merge a feature branch into main (after PR is approved)

```bash
git checkout main
git pull origin main
git merge --no-ff feature/my-new-feature
git push origin main
```

### Tag a new release version

```bash
# Bump version in package.json files first, then:
git add package.json backend/package.json frontend/package.json CHANGELOG.md
git commit -m "chore: release v2.1.0"
git tag -a v2.1.0 -m "Release v2.1.0"
git push origin main --tags
```

### Force main to match a specific branch (emergency only)

```bash
# ⚠️  Use only when you need to hard-reset main to another branch
git checkout main
git reset --hard origin/feature/my-branch
git push --force-with-lease origin main
```

### Check which branches are ahead of main

```bash
git fetch --all
git log main..origin/feature/my-branch --oneline
```
