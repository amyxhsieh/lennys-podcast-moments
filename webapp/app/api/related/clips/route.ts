import { NextRequest, NextResponse } from 'next/server';
import {
  findSimilarChunks,
  formatTimestamp,
  isRagAvailable,
} from '@/app/utils/rag';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const slug = params.get('slug');
    const startParam = params.get('start');
    const keyword = params.get('keyword')?.toLowerCase().trim();
    const topic = params.get('topic')?.toLowerCase().trim();

    if (!slug) {
      return NextResponse.json(
        { error: 'slug query param is required' },
        { status: 400 }
      );
    }

    const startSeconds = startParam ? Number(startParam) : 0;
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const clipsPath = path.join(dataDir, 'clips.json');

    const results: Array<{
      episodeSlug: string;
      guest: string;
      videoId: string;
      startSeconds: number;
      endSeconds: number;
      startTimestamp: string;
      endTimestamp: string;
      previewText: string;
      score: number;
      keyword?: string;
      source: 'keyword' | 'vector';
    }> = [];

    // 1) Same-keyword clips from precomputed clips.json
    if (fs.existsSync(clipsPath)) {
      const clips = JSON.parse(fs.readFileSync(clipsPath, 'utf-8')) as any[];
      const matchKey = keyword || topic || '';
      if (matchKey) {
        const sameKeyword = clips
          .filter((c) => {
            if (c.episodeSlug === slug) {
              // Exclude near-current window on same episode
              if (Math.abs((c.startSeconds || 0) - startSeconds) < 90) {
                return false;
              }
            }
            const k = (c.keyword || c.keywordSlug || '').toLowerCase();
            return (
              k.includes(matchKey) ||
              matchKey.includes(k) ||
              (c.keywordSlug || '').toLowerCase().includes(matchKey)
            );
          })
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 8);

        for (const c of sameKeyword) {
          results.push({
            episodeSlug: c.episodeSlug,
            guest: c.guest,
            videoId: c.videoId,
            startSeconds: c.startSeconds,
            endSeconds: c.endSeconds,
            startTimestamp: c.startTimestamp || formatTimestamp(c.startSeconds),
            endTimestamp: c.endTimestamp || formatTimestamp(c.endSeconds),
            previewText: c.previewText || '',
            score: (c.score || 0.5) + 0.2, // slight boost for keyword match
            keyword: c.keyword,
            source: 'keyword',
          });
        }
      }
    }

    // 2) Vector-similar chunks when RAG index exists
    if (isRagAvailable()) {
      const hits = findSimilarChunks(slug, startSeconds || 0, 16);
      for (const hit of hits) {
        const c = hit.chunk;
        // Deduplicate against keyword results (same episode + close start)
        const dup = results.some(
          (r) =>
            r.episodeSlug === c.episodeSlug &&
            Math.abs(r.startSeconds - c.startSeconds) < 60
        );
        if (dup) continue;

        results.push({
          episodeSlug: c.episodeSlug,
          guest: c.guest,
          videoId: c.videoId,
          startSeconds: c.startSeconds,
          endSeconds: c.endSeconds,
          startTimestamp: formatTimestamp(c.startSeconds),
          endTimestamp: formatTimestamp(c.endSeconds),
          previewText: c.text.slice(0, 200),
          score: hit.score,
          source: 'vector',
        });
      }
    }

    // Topic boost
    if (topic) {
      for (const r of results) {
        const hay = `${r.previewText} ${r.keyword || ''}`.toLowerCase();
        if (hay.includes(topic)) r.score += 0.1;
      }
    }

    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      source: isRagAvailable() ? 'keyword+vector' : 'keyword',
      related: results.slice(0, 8),
    });
  } catch (error) {
    console.error('Related clips error:', error);
    return NextResponse.json(
      { error: 'Failed to load related clips' },
      { status: 500 }
    );
  }
}
