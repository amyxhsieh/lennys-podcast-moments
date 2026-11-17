# Lenny's Podcast Moments Web App

Searchable web app for discovering moments from Lenny's Podcast (~299 episodes).

## Features

- **Hybrid search**: keywords + full-text + transcript + optional local vector RAG
- **Query synonyms**: e.g. `user research` → customer research / UX; `user testing` → UX / usability / A/B testing
- **3D carousel** of matching episodes with clip previews
- **Clip detail view** with synced transcript
- **Related episodes / moments** on the episode page
- **Graceful fallback**: without OpenAI / RAG files, keyword + transcript search still works

## Setup

### 1. Install

```bash
# From repo root
cd webapp && npm install && cd ..
```

Root scripts also work: `npm run dev`, `npm run build-data`, `npm run build:rag`.

### 2. Environment (OpenAI)

Copy `.env.example` → `.env.local`:

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=512
```

**Gemini is not used.** Optional alternative: `EMBEDDING_PROVIDER=ollama` (local only).

For production (Vercel), set the same `OPENAI_API_KEY` / `EMBEDDING_PROVIDER` in project env vars.

### 3. Build data files

```bash
# From repo root
node scripts/build-data.js
# or: npm run build-data
```

Outputs in `webapp/public/data/`:

- `episodes.json`, `keywords.json`, `clips.json`
- `transcript-index.json` (needed for on-the-fly clip generation)
- `stats.json`

### 4. Build RAG index (semantic search)

```bash
node scripts/build-embeddings.js
# or: npm run build:rag
# or: npm run build:all   # data + rag
```

Writes API-only files under `webapp/data/rag/` (gitignored binaries):

- `chunks.json`, `embeddings.f32`, `manifest.json`
- `episode-embeddings.json`, `related-episodes.json`

Idempotent when chunk content hash is unchanged. First build calls OpenAI once per chunk; each search embeds the query once.

### 5. Run

```bash
npm run dev
# or: cd webapp && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
webapp/
├── app/
│   ├── api/
│   │   ├── search/           # hybridSearchWithRag
│   │   ├── related/episodes/
│   │   ├── related/clips/
│   │   └── episodes/
│   ├── components/
│   ├── episode/[slug]/       # detail + related UI
│   ├── utils/
│   │   ├── search.ts         # client-safe search + synonyms
│   │   ├── search-server.ts  # server RAG hybrid (do not import in client)
│   │   ├── rag.ts            # load local vectors (server-only)
│   │   └── embed.ts          # OpenAI / ollama / HF (server-only)
│   └── page.tsx
├── data/rag/                 # local static vectors (API-only)
├── public/data/              # generated JSON for the UI
└── .env.local                # secrets (gitignored)
```

Repo scripts:

- `scripts/build-data.js` — episodes, keywords, clips, transcript-index
- `scripts/build-embeddings.js` — chunk + embed + related-episodes
- `scripts/lib/embed.js` — shared embed providers for the build script

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/search?q=` | Hybrid search (keyword + full-text + transcript + vectors) |
| `GET /api/related/episodes?slug=&topic=` | Related episodes |
| `GET /api/related/clips?slug=&start=&keyword=` | Similar moments |
| `GET /api/episodes/[slug]` | Episode details |

## Search behavior notes

- Synonyms expand queries so sparse tags (e.g. no exact `user-research` keyword) still surface related episodes/clips.
- UI keeps API matches even when pre-generated clips are thin; clips can come from synonyms, transcript generation, or any episode clip as fallback.
- `transcript-index.json` must exist for client-side clip generation — run `build-data.js` if searches look empty.

## Design

- Colors: white `#FFFFFF`, text `#222222`, orange accents `#F7881D` / `#FFDFC8` / `#FFF4EA`
- Headings: Bricolage Grotesque; body: system / SF Pro
- Sentence case

## Notes

- YouTube hover previews start muted (browser autoplay policy)
- Keyword clips: mentions grouped in ~3-minute windows; top 5 per episode/keyword
- Default embeddings: OpenAI `text-embedding-3-small` at 512 dimensions, stored as local Float32 (no Pinecone/Upstash)
