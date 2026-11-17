import { NextRequest, NextResponse } from 'next/server';
import { getRelatedEpisodeSlugs, isRagAvailable } from '@/app/utils/rag';
import fs from 'fs';
import path from 'path';

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

function buildKeywordMap(keywords: Record<string, any>): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const data of Object.values(keywords)) {
    for (const ep of data.episodes || []) {
      if (!map[ep.slug]) map[ep.slug] = [];
      map[ep.slug].push(data.name);
    }
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug');
    const topic = request.nextUrl.searchParams.get('topic')?.toLowerCase().trim();

    if (!slug) {
      return NextResponse.json(
        { error: 'slug query param is required' },
        { status: 400 }
      );
    }

    const dataDir = path.join(process.cwd(), 'public', 'data');
    const episodesPath = path.join(dataDir, 'episodes.json');
    const keywordsPath = path.join(dataDir, 'keywords.json');

    if (!fs.existsSync(episodesPath)) {
      return NextResponse.json(
        { error: 'episodes.json not found' },
        { status: 500 }
      );
    }

    const episodes = JSON.parse(fs.readFileSync(episodesPath, 'utf-8'));
    const episodeBySlug = new Map(
      episodes.map((e: any) => [e.slug, e])
    );

    let relatedRefs = getRelatedEpisodeSlugs(slug);

    // Fallback: keyword Jaccard only when RAG related map missing
    if (relatedRefs.length === 0 && fs.existsSync(keywordsPath)) {
      const keywords = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
      const keywordMap = buildKeywordMap(keywords);
      const sourceKws = keywordMap[slug] || [];
      relatedRefs = Object.keys(keywordMap)
        .filter((s) => s !== slug)
        .map((s) => ({
          slug: s,
          score: jaccard(sourceKws, keywordMap[s] || []),
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }

    let results = relatedRefs
      .map((ref) => {
        const ep = episodeBySlug.get(ref.slug) as any;
        if (!ep) return null;
        return {
          slug: ep.slug,
          guest: ep.guest,
          title: ep.title,
          videoId: ep.videoId,
          score: ref.score,
        };
      })
      .filter(Boolean) as Array<{
      slug: string;
      guest: string;
      title: string;
      videoId: string;
      score: number;
    }>;

    // Session boost: prefer episodes whose keywords/title match current topic
    if (topic) {
      const keywords = fs.existsSync(keywordsPath)
        ? JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'))
        : {};
      const keywordMap = buildKeywordMap(keywords);
      results = results
        .map((r) => {
          const kws = (keywordMap[r.slug] || []).map((k) => k.toLowerCase());
          const titleHit = (r.title || '').toLowerCase().includes(topic);
          const kwHit = kws.some(
            (k) => k.includes(topic) || topic.includes(k)
          );
          return {
            ...r,
            score: r.score + (kwHit || titleHit ? 0.15 : 0),
          };
        })
        .sort((a, b) => b.score - a.score);
    }

    return NextResponse.json({
      source: isRagAvailable() ? 'rag+keywords' : 'keywords',
      related: results.slice(0, 8),
    });
  } catch (error) {
    console.error('Related episodes error:', error);
    return NextResponse.json(
      { error: 'Failed to load related episodes' },
      { status: 500 }
    );
  }
}
