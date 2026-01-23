import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch } from '@/app/utils/search';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json([]);
    }

    // Load data files
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const episodesPath = path.join(dataDir, 'episodes.json');
    const keywordsPath = path.join(dataDir, 'keywords.json');
    const transcriptIndexPath = path.join(dataDir, 'transcript-index.json');

    if (!fs.existsSync(episodesPath) || !fs.existsSync(keywordsPath)) {
      return NextResponse.json(
        { error: 'Data files not found. Please run build-data.js first.' },
        { status: 500 }
      );
    }

    const episodes = JSON.parse(fs.readFileSync(episodesPath, 'utf-8'));
    const keywords = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));
    
    // Load transcript index if available (for fallback search)
    let transcriptIndex: Record<string, any[]> | undefined;
    if (fs.existsSync(transcriptIndexPath)) {
      transcriptIndex = JSON.parse(fs.readFileSync(transcriptIndexPath, 'utf-8'));
    }

    // Perform hybrid search (includes transcript search as fallback)
    const results = hybridSearch(query, keywords, episodes, transcriptIndex);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
