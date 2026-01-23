import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    // Handle both Promise and direct params (Next.js 15+ uses Promise)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { slug } = resolvedParams;
    
    if (!slug) {
      return NextResponse.json(
        { error: 'Episode slug is required' },
        { status: 400 }
      );
    }

    const dataDir = path.join(process.cwd(), 'public', 'data');
    const episodesPath = path.join(dataDir, 'episodes.json');

    if (!fs.existsSync(episodesPath)) {
      return NextResponse.json(
        { error: 'Data files not found' },
        { status: 500 }
      );
    }

    const episodes = JSON.parse(fs.readFileSync(episodesPath, 'utf-8'));
    const episode = episodes.find((e: any) => e.slug === slug);

    if (!episode) {
      console.error(`Episode not found for slug: ${slug}`);
      console.log(`Available slugs (first 10):`, episodes.slice(0, 10).map((e: any) => e.slug));
      return NextResponse.json(
        { error: 'Episode not found', slug },
        { status: 404 }
      );
    }

    return NextResponse.json(episode);
  } catch (error) {
    console.error('Episode fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch episode' },
      { status: 500 }
    );
  }
}
