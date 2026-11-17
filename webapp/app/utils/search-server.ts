/**
 * Server-only hybrid search with local RAG vectors.
 * Do not import this from client components.
 */

import 'server-only';
import type { VectorHit } from './rag';
import {
  chunksToClips,
  loadRagIndex,
  searchChunksByLexical,
  searchChunksByVector,
} from './rag';
import { canEmbedQueries, embedQueryText } from './embed';
import { hybridSearch, type SearchResult } from './search';

function mergeVectorHitsIntoResults(
  resultMap: Map<string, SearchResult>,
  hits: VectorHit[],
  episodes: any[],
  weight: number,
  matchType: SearchResult['matchType']
) {
  const byEpisode = new Map<string, VectorHit[]>();
  for (const hit of hits) {
    const list = byEpisode.get(hit.chunk.episodeSlug) || [];
    list.push(hit);
    byEpisode.set(hit.chunk.episodeSlug, list);
  }

  for (const [slug, episodeHits] of byEpisode) {
    const best = Math.max(...episodeHits.map((h) => h.score));
    const episode = episodes.find((e) => e.slug === slug);
    if (!episode) continue;

    const ragClips = chunksToClips(episodeHits, slug, 5);
    const existing = resultMap.get(slug);
    if (existing) {
      existing.score += best * weight;
      existing.matchType = 'hybrid';
      if (!existing.ragClips || existing.ragClips.length === 0) {
        existing.ragClips = ragClips;
      }
    } else {
      resultMap.set(slug, {
        episodeSlug: slug,
        guest: episode.guest,
        title: episode.title,
        videoId: episode.videoId,
        score: best * weight,
        matchType,
        ragClips,
      });
    }
  }
}

/**
 * Hybrid search with local/static vector RAG when index is available.
 * Query embeddings use free Ollama by default (or HF / OpenAI via env).
 */
export async function hybridSearchWithRag(
  query: string,
  keywords: Record<string, any>,
  episodes: any[],
  transcriptIndex?: Record<string, any[]>
): Promise<SearchResult[]> {
  const baseResults = hybridSearch(query, keywords, episodes, transcriptIndex);
  const resultMap = new Map<string, SearchResult>(
    baseResults.map((r) => [r.episodeSlug, { ...r }])
  );

  const rag = loadRagIndex();

  // Lexical chunk search always when RAG files exist (no embedder needed)
  if (rag) {
    const lexicalHits = searchChunksByLexical(query, 40);
    mergeVectorHitsIntoResults(resultMap, lexicalHits, episodes, 1.2, 'hybrid');
  }

  // Semantic vector search when an embedder is configured
  if (rag && canEmbedQueries(rag.manifest)) {
    const queryVec = await embedQueryText(query, rag.manifest);
    if (queryVec) {
      const vectorHits = searchChunksByVector(queryVec, 40);
      mergeVectorHitsIntoResults(resultMap, vectorHits, episodes, 1.5, 'vector');
    }
  }

  return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
}
