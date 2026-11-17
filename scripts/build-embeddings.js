#!/usr/bin/env node

/**
 * Build local/static RAG index: time-window chunks + embeddings.
 *
 * Prerequisites:
 *   - Run `node scripts/build-data.js` first (needs episodes.json + keywords.json)
 *   - Default: EMBEDDING_PROVIDER=openai + OPENAI_API_KEY
 *   - Optional: ollama or huggingface
 *
 * Outputs (API-only, not public):
 *   webapp/data/rag/chunks.json
 *   webapp/data/rag/embeddings.f32
 *   webapp/data/rag/manifest.json
 *   webapp/data/rag/episode-embeddings.json
 *   webapp/data/rag/related-episodes.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getEmbedConfig, embedTexts } = require('./lib/embed');

const ROOT = path.join(__dirname, '..');
const EPISODES_DIR = path.join(ROOT, 'episodes');
const PUBLIC_DATA = path.join(ROOT, 'webapp', 'public', 'data');
const RAG_DIR = path.join(ROOT, 'webapp', 'data', 'rag');

const WINDOW_SECONDS = 120;
const OVERLAP_SECONDS = 40;
const STEP_SECONDS = WINDOW_SECONDS - OVERLAP_SECONDS; // 80
const RELATED_TOP_N = 8;

function loadEnvFile() {
  const candidates = [
    path.join(ROOT, '.env'),
    path.join(ROOT, 'webapp', '.env'),
    path.join(ROOT, 'webapp', '.env.local'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function timestampToSeconds(timestamp) {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractTranscriptSegments(content) {
  const segments = [];
  const lines = content.split('\n');
  let inFrontmatter = true;
  let currentSpeaker = null;
  let currentTimestamp = null;
  let currentText = [];

  for (const line of lines) {
    if (line.trim().startsWith('---')) {
      if (inFrontmatter) inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;
    if (line.startsWith('#') || line.trim() === '') continue;

    const timestampMatch = line.match(/^([^(]+)?\s*\((\d{1,2}:\d{2}:\d{2})\):/);
    if (timestampMatch) {
      if (currentTimestamp !== null && currentText.length > 0) {
        segments.push({
          speaker: currentSpeaker || 'Unknown',
          timestamp: currentTimestamp,
          timestampSeconds: timestampToSeconds(currentTimestamp),
          text: currentText.join(' ').trim(),
        });
      }
      const newSpeaker = timestampMatch[1]?.trim();
      if (newSpeaker) currentSpeaker = newSpeaker;
      currentTimestamp = timestampMatch[2];
      currentText = [];
    } else if (currentTimestamp !== null) {
      currentText.push(line.trim());
    }
  }

  if (currentTimestamp !== null && currentText.length > 0) {
    segments.push({
      speaker: currentSpeaker || 'Unknown',
      timestamp: currentTimestamp,
      timestampSeconds: timestampToSeconds(currentTimestamp),
      text: currentText.join(' ').trim(),
    });
  }

  return segments;
}

function buildEpisodeKeywordMap(keywords) {
  const map = {};
  for (const [, data] of Object.entries(keywords)) {
    for (const ep of data.episodes || []) {
      if (!map[ep.slug]) map[ep.slug] = [];
      map[ep.slug].push(data.name);
    }
  }
  return map;
}

function buildChunksForEpisode(episode, segments, keywordNames) {
  if (!segments.length) return [];

  const maxTime = segments[segments.length - 1].timestampSeconds;
  const chunks = [];
  let chunkIndex = 0;

  for (let start = 0; start <= maxTime; start += STEP_SECONDS) {
    const end = start + WINDOW_SECONDS;
    const windowSegs = segments.filter(
      (s) => s.timestampSeconds >= start && s.timestampSeconds < end
    );
    if (windowSegs.length === 0) continue;

    const text = windowSegs
      .map((s) => s.text)
      .join(' ')
      .trim()
      .replace(/\s+/g, ' ');

    if (text.length < 80) continue;

    const actualStart = windowSegs[0].timestampSeconds;
    const actualEnd = Math.max(
      actualStart + 30,
      windowSegs[windowSegs.length - 1].timestampSeconds
    );

    chunks.push({
      id: `${episode.slug}:${chunkIndex}`,
      episodeSlug: episode.slug,
      guest: episode.guest,
      title: episode.title,
      videoId: episode.videoId,
      startSeconds: actualStart,
      endSeconds: Math.min(actualEnd + 30, actualStart + WINDOW_SECONDS + 30),
      text,
      keywords: keywordNames,
    });
    chunkIndex += 1;
  }

  return chunks;
}

function hashChunks(chunks) {
  const payload = chunks.map((c) => `${c.id}|${c.text}`).join('\n');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  return Float32Array.from(vec, (v) => v / norm);
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // assumes L2-normalized
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

async function embedAll(chunks, config) {
  const vectors = new Array(chunks.length);
  const batchSize = config.batchSize || 1;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text.slice(0, 8000));
    process.stdout.write(
      `\r   Embedding ${Math.min(i + batch.length, chunks.length)}/${chunks.length} (${config.provider}/${config.model})...`
    );
    const batchVecs = await embedTexts(texts, config);
    for (let j = 0; j < batchVecs.length; j++) {
      // Adapt if model returns unexpected dims (e.g. first Ollama call)
      if (batchVecs[j].length !== config.dimensions) {
        config.dimensions = batchVecs[j].length;
      }
      vectors[i + j] = batchVecs[j];
    }
  }
  process.stdout.write('\n');
  return vectors;
}

function writeEmbeddingsBinary(vectors, outPath, dims) {
  const count = vectors.length;
  const buffer = Buffer.alloc(count * dims * 4);
  for (let i = 0; i < count; i++) {
    for (let d = 0; d < dims; d++) {
      buffer.writeFloatLE(vectors[i][d], (i * dims + d) * 4);
    }
  }
  fs.writeFileSync(outPath, buffer);
}

function readEmbeddingsBinary(filePath, count, dims) {
  const buffer = fs.readFileSync(filePath);
  const vectors = [];
  for (let i = 0; i < count; i++) {
    const vec = new Float32Array(dims);
    for (let d = 0; d < dims; d++) {
      vec[d] = buffer.readFloatLE((i * dims + d) * 4);
    }
    vectors.push(vec);
  }
  return vectors;
}

function buildEpisodeEmbeddings(chunks, vectors, dims) {
  const byEpisode = {};
  for (let i = 0; i < chunks.length; i++) {
    const slug = chunks[i].episodeSlug;
    if (!byEpisode[slug]) byEpisode[slug] = [];
    byEpisode[slug].push(vectors[i]);
  }

  const episodeEmbeddings = {};
  for (const [slug, vecs] of Object.entries(byEpisode)) {
    const mean = new Float32Array(dims);
    for (const v of vecs) {
      for (let d = 0; d < dims; d++) mean[d] += v[d];
    }
    for (let d = 0; d < dims; d++) mean[d] /= vecs.length;
    episodeEmbeddings[slug] = Array.from(l2Normalize(mean));
  }
  return episodeEmbeddings;
}

function buildRelatedEpisodes(episodeEmbeddings, episodeKeywordMap) {
  const slugs = Object.keys(episodeEmbeddings);
  const related = {};

  for (const slug of slugs) {
    const scored = [];
    for (const other of slugs) {
      if (other === slug) continue;
      const cos = cosine(episodeEmbeddings[slug], episodeEmbeddings[other]);
      const jac = jaccard(
        episodeKeywordMap[slug] || [],
        episodeKeywordMap[other] || []
      );
      scored.push({
        slug: other,
        score: 0.6 * cos + 0.4 * jac,
        cosine: cos,
        keywordOverlap: jac,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    related[slug] = scored.slice(0, RELATED_TOP_N).map((r) => ({
      slug: r.slug,
      score: Number(r.score.toFixed(4)),
    }));
  }

  return related;
}

async function main() {
  loadEnvFile();
  const embedConfig = getEmbedConfig();

  console.log('Building RAG embeddings...\n');
  console.log(
    `Provider: ${embedConfig.provider} / model: ${embedConfig.model} (dims≈${embedConfig.dimensions})`
  );

  const episodesPath = path.join(PUBLIC_DATA, 'episodes.json');
  const keywordsPath = path.join(PUBLIC_DATA, 'keywords.json');

  if (!fs.existsSync(episodesPath) || !fs.existsSync(keywordsPath)) {
    console.error('Missing episodes.json or keywords.json. Run build-data.js first.');
    process.exit(1);
  }

  const episodes = JSON.parse(fs.readFileSync(episodesPath, 'utf-8'));
  const keywords = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
  const episodeKeywordMap = buildEpisodeKeywordMap(keywords);

  console.log('1. Building time-window chunks...');
  const chunks = [];
  for (const episode of episodes) {
    const transcriptPath = path.join(EPISODES_DIR, episode.slug, 'transcript.md');
    if (!fs.existsSync(transcriptPath)) continue;
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const segments = extractTranscriptSegments(content);
    const keywordNames = episodeKeywordMap[episode.slug] || episode.keywords || [];
    chunks.push(...buildChunksForEpisode(episode, segments, keywordNames));
  }
  console.log(`   ${chunks.length} chunks from ${episodes.length} episodes`);

  const contentHash = hashChunks(chunks);
  fs.mkdirSync(RAG_DIR, { recursive: true });

  const manifestPath = path.join(RAG_DIR, 'manifest.json');
  const embeddingsPath = path.join(RAG_DIR, 'embeddings.f32');
  let vectors = null;
  let dims = embedConfig.dimensions;

  if (fs.existsSync(manifestPath) && fs.existsSync(embeddingsPath)) {
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (
      prev.contentHash === contentHash &&
      prev.model === embedConfig.model &&
      prev.provider === embedConfig.provider &&
      prev.chunkCount === chunks.length
    ) {
      console.log('2. Chunks unchanged — reusing existing embeddings');
      dims = prev.dimensions;
      vectors = readEmbeddingsBinary(embeddingsPath, chunks.length, dims);
    }
  }

  if (!vectors) {
    if (embedConfig.provider === 'ollama') {
      console.log(
        '2. Embedding chunks with Ollama (free/local)...\n' +
          `   Ensure Ollama is running and the model is pulled:\n` +
          `   ollama pull ${embedConfig.model}`
      );
    } else if (embedConfig.provider === 'huggingface') {
      console.log('2. Embedding chunks with Hugging Face Inference...');
    } else {
      console.log('2. Embedding chunks with OpenAI...');
    }

    vectors = await embedAll(chunks, embedConfig);
    dims = embedConfig.dimensions;
    // Ensure all vectors match dims (truncate/pad shouldn't be needed)
    writeEmbeddingsBinary(vectors, embeddingsPath, dims);
    console.log(`   Wrote ${path.relative(ROOT, embeddingsPath)} (${dims}-d)`);
  }

  console.log('3. Writing chunks + episode embeddings...');
  const chunksOut = chunks.map((c) => ({
    id: c.id,
    episodeSlug: c.episodeSlug,
    guest: c.guest,
    title: c.title,
    videoId: c.videoId,
    startSeconds: c.startSeconds,
    endSeconds: c.endSeconds,
    text: c.text,
    keywords: c.keywords,
  }));
  fs.writeFileSync(
    path.join(RAG_DIR, 'chunks.json'),
    JSON.stringify(chunksOut)
  );

  const episodeEmbeddings = buildEpisodeEmbeddings(chunks, vectors, dims);
  fs.writeFileSync(
    path.join(RAG_DIR, 'episode-embeddings.json'),
    JSON.stringify(episodeEmbeddings)
  );

  console.log('4. Precomputing related episodes...');
  const related = buildRelatedEpisodes(episodeEmbeddings, episodeKeywordMap);
  fs.writeFileSync(
    path.join(RAG_DIR, 'related-episodes.json'),
    JSON.stringify(related, null, 2)
  );

  const manifest = {
    provider: embedConfig.provider,
    model: embedConfig.model,
    dimensions: dims,
    chunkCount: chunks.length,
    episodeCount: Object.keys(episodeEmbeddings).length,
    windowSeconds: WINDOW_SECONDS,
    overlapSeconds: OVERLAP_SECONDS,
    contentHash,
    buildDate: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n✅ RAG build complete!');
  console.log(`   ${manifest.chunkCount} chunks`);
  console.log(`   ${manifest.episodeCount} episode embeddings`);
  console.log(`   Provider: ${manifest.provider} / ${manifest.model}`);
  console.log(`   Output: ${path.relative(ROOT, RAG_DIR)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildChunksForEpisode,
  extractTranscriptSegments,
  hashChunks,
  cosine,
  jaccard,
};
