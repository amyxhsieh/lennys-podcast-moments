/**
 * Local/static RAG loader + vector helpers (server-side only).
 */

import 'server-only';
import fs from 'fs';
import path from 'path';

export interface RagChunk {
  id: string;
  episodeSlug: string;
  guest: string;
  title: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  keywords: string[];
}

export interface RagManifest {
  model: string;
  dimensions: number;
  provider?: string;
  chunkCount: number;
  episodeCount: number;
  windowSeconds: number;
  overlapSeconds: number;
  contentHash: string;
  buildDate: string;
}

export interface RelatedEpisodeRef {
  slug: string;
  score: number;
}

type RagCache = {
  manifest: RagManifest;
  chunks: RagChunk[];
  embeddings: Float32Array; // flat row-major [chunkCount * dims]
  episodeEmbeddings: Record<string, number[]>;
  relatedEpisodes: Record<string, RelatedEpisodeRef[]>;
};

let cache: RagCache | null = null;
let loadAttempted = false;

function ragDir(): string {
  return path.join(process.cwd(), 'data', 'rag');
}

export function isRagAvailable(): boolean {
  const dir = ragDir();
  return (
    fs.existsSync(path.join(dir, 'manifest.json')) &&
    fs.existsSync(path.join(dir, 'chunks.json')) &&
    fs.existsSync(path.join(dir, 'embeddings.f32'))
  );
}

export function loadRagIndex(): RagCache | null {
  if (cache) return cache;
  if (loadAttempted) return null;
  loadAttempted = true;

  try {
    const dir = ragDir();
    const manifestPath = path.join(dir, 'manifest.json');
    const chunksPath = path.join(dir, 'chunks.json');
    const embeddingsPath = path.join(dir, 'embeddings.f32');
    const episodeEmbPath = path.join(dir, 'episode-embeddings.json');
    const relatedPath = path.join(dir, 'related-episodes.json');

    if (
      !fs.existsSync(manifestPath) ||
      !fs.existsSync(chunksPath) ||
      !fs.existsSync(embeddingsPath)
    ) {
      return null;
    }

    const manifest: RagManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf-8')
    );
    const chunks: RagChunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
    const buffer = fs.readFileSync(embeddingsPath);
    const expectedBytes = manifest.chunkCount * manifest.dimensions * 4;
    if (buffer.length < expectedBytes) {
      console.warn(
        `RAG embeddings size mismatch: got ${buffer.length}, expected ${expectedBytes}`
      );
      return null;
    }

    // Copy floats into a dedicated Float32Array (Buffer views can be misaligned)
    const embeddings = new Float32Array(
      manifest.chunkCount * manifest.dimensions
    );
    for (let i = 0; i < embeddings.length; i++) {
      embeddings[i] = buffer.readFloatLE(i * 4);
    }

    const episodeEmbeddings = fs.existsSync(episodeEmbPath)
      ? JSON.parse(fs.readFileSync(episodeEmbPath, 'utf-8'))
      : {};
    const relatedEpisodes = fs.existsSync(relatedPath)
      ? JSON.parse(fs.readFileSync(relatedPath, 'utf-8'))
      : {};

    cache = {
      manifest,
      chunks,
      embeddings,
      episodeEmbeddings,
      relatedEpisodes,
    };
    return cache;
  } catch (err) {
    console.error('Failed to load RAG index:', err);
    return null;
  }
}

export function cosineFlat(
  query: Float32Array | number[],
  matrix: Float32Array,
  rowIndex: number,
  dims: number
): number {
  let dot = 0;
  const offset = rowIndex * dims;
  for (let d = 0; d < dims; d++) {
    dot += query[d] * matrix[offset + d];
  }
  return dot;
}

export function l2Normalize(vec: number[] | Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export interface VectorHit {
  chunk: RagChunk;
  score: number;
  index: number;
}

export function searchChunksByVector(
  queryVec: Float32Array,
  topK = 40
): VectorHit[] {
  const rag = loadRagIndex();
  if (!rag) return [];

  const { chunks, embeddings, manifest } = rag;
  const dims = manifest.dimensions;
  const scored: { index: number; score: number }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    scored.push({
      index: i,
      score: cosineFlat(queryVec, embeddings, i, dims),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ index, score }) => ({
    chunk: chunks[index],
    score,
    index,
  }));
}

export function searchChunksByLexical(
  query: string,
  topK = 40
): VectorHit[] {
  const rag = loadRagIndex();
  if (!rag) return [];

  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return [];

  const scored: VectorHit[] = [];
  for (let i = 0; i < rag.chunks.length; i++) {
    const chunk = rag.chunks[i];
    const text = chunk.text.toLowerCase();
    let score = 0;
    if (text.includes(queryLower)) {
      score = 1.0;
    } else {
      const matches = queryWords.filter((w) => text.includes(w)).length;
      score = matches / queryWords.length;
    }
    if (score > 0.3) {
      scored.push({ chunk, score, index: i });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function getRelatedEpisodeSlugs(slug: string): RelatedEpisodeRef[] {
  const rag = loadRagIndex();
  if (!rag) return [];
  return rag.relatedEpisodes[slug] || [];
}

export function findSimilarChunks(
  episodeSlug: string,
  startSeconds: number,
  topK = 12
): VectorHit[] {
  const rag = loadRagIndex();
  if (!rag) return [];

  // Find chunk closest to the current playback window
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < rag.chunks.length; i++) {
    const c = rag.chunks[i];
    if (c.episodeSlug !== episodeSlug) continue;
    const mid = (c.startSeconds + c.endSeconds) / 2;
    const dist = Math.abs(mid - startSeconds);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return [];

  const dims = rag.manifest.dimensions;
  const queryOffset = bestIdx * dims;
  const queryVec = rag.embeddings.subarray(queryOffset, queryOffset + dims);

  const scored: VectorHit[] = [];
  for (let i = 0; i < rag.chunks.length; i++) {
    const chunk = rag.chunks[i];
    // Prefer other episodes; skip near-identical window on same episode
    if (
      chunk.episodeSlug === episodeSlug &&
      Math.abs(chunk.startSeconds - startSeconds) < 90
    ) {
      continue;
    }
    const score = cosineFlat(queryVec, rag.embeddings, i, dims);
    scored.push({ chunk, score, index: i });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Merge nearby chunk hits for one episode into clip-sized windows.
 */
export function chunksToClips(
  hits: VectorHit[],
  episodeSlug: string,
  maxClips = 5
): Array<{
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  previewText: string;
  score: number;
  episodeSlug: string;
  guest: string;
  videoId: string;
  keyword?: string;
}> {
  const episodeHits = hits
    .filter((h) => h.chunk.episodeSlug === episodeSlug)
    .sort((a, b) => a.chunk.startSeconds - b.chunk.startSeconds);

  if (episodeHits.length === 0) return [];

  const groups: VectorHit[][] = [];
  let current: VectorHit[] = [episodeHits[0]];

  for (let i = 1; i < episodeHits.length; i++) {
    const prev = current[current.length - 1].chunk;
    const next = episodeHits[i].chunk;
    if (next.startSeconds - prev.endSeconds <= 180) {
      current.push(episodeHits[i]);
    } else {
      groups.push(current);
      current = [episodeHits[i]];
    }
  }
  groups.push(current);

  const clips = groups.map((group) => {
    const start = group[0].chunk.startSeconds;
    const rawEnd = group[group.length - 1].chunk.endSeconds;
    const end = Math.min(Math.max(rawEnd, start + 60), start + 600);
    const length = end - start;
    const avgScore =
      group.reduce((s, h) => s + h.score, 0) / Math.max(group.length, 1);
    // Prefer 2–8 minute windows
    const lengthScore =
      length >= 120 && length <= 480
        ? 1
        : length < 120
          ? length / 120
          : Math.max(0, 1 - (length - 480) / 300);

    return {
      startSeconds: start,
      endSeconds: end,
      startTimestamp: formatTimestamp(start),
      endTimestamp: formatTimestamp(end),
      previewText: group[0].chunk.text.slice(0, 200),
      score: avgScore * 0.7 + lengthScore * 0.3,
      episodeSlug,
      guest: group[0].chunk.guest,
      videoId: group[0].chunk.videoId,
    };
  });

  return clips.sort((a, b) => b.score - a.score).slice(0, maxClips);
}
