'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import SearchInput from './components/SearchInput';
import KeywordTags from './components/KeywordTags';
import Carousel3D from './components/Carousel3D';
import SparkAnimation from './components/SparkAnimation';
import VideoMosaicBackground from './components/VideoMosaicBackground';
import LogoSpark from './components/LogoSpark';
import { clipMatchesQuery, generateClipsFromTranscript } from './utils/search';
import styles from './page.module.css';

interface Episode {
  slug: string;
  guest: string;
  title: string;
  videoId: string;
  publishDate: string;
  description: string;
  keywords?: string[];
  viewCount?: number;
}

interface Keyword {
  slug: string;
  name: string;
  episodeCount: number;
}

interface SearchResult {
  episodeSlug: string;
  guest: string;
  title: string;
  videoId: string;
  score: number;
  matchType: 'keyword' | 'fulltext' | 'hybrid' | 'transcript' | 'vector';
  matchedKeywords?: string[];
  ragClips?: Array<{
    startSeconds: number;
    endSeconds: number;
    startTimestamp: string;
    endTimestamp: string;
    previewText: string;
    score: number;
  }>;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [transcriptIndex, setTranscriptIndex] = useState<Record<string, any[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  
  // Read the "from" parameter to restore carousel position when returning from detail page
  const returnFromEpisode = searchParams.get('from');

  // Handle search
  const handleSearch = async (
    query: string, 
    episodesData?: Episode[], 
    clipsData?: any[],
    transcriptIndexData?: Record<string, any[]>,
    skipUrlUpdate: boolean = false
  ) => {
    const currentClips = clipsData || clips;
    const currentTranscriptIndex = transcriptIndexData || transcriptIndex;
    setSearchQuery(query);
    
    // Update URL with search query (unless we're restoring from URL)
    if (!skipUrlUpdate) {
      if (query.trim()) {
        router.push(`/?q=${encodeURIComponent(query.trim())}`, { scroll: false });
      } else {
        router.push('/', { scroll: false });
      }
    }
    
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const results = await response.json();

      // Keep API matches. Prefer episodes that can surface a clip, but do not
      // drop keyword hits when clips are sparse (e.g. "user research").
      const ranked = (Array.isArray(results) ? results : []).map(
        (result: SearchResult) => {
          const matched = result.matchedKeywords || [];
          const hasRag = !!(result.ragClips && result.ragClips.length > 0);
          const hasClip = currentClips.some(
            (clip: any) =>
              clip.episodeSlug === result.episodeSlug &&
              clipMatchesQuery(clip.keyword || '', query, matched)
          );
          const canGenerate =
            !!currentTranscriptIndex[result.episodeSlug] &&
            generateClipsFromTranscript(
              query,
              result.episodeSlug,
              currentTranscriptIndex,
              matched
            ).length > 0;
          return {
            ...result,
            score:
              result.score + (hasRag || hasClip || canGenerate ? 0.25 : 0),
          };
        }
      );

      setSearchResults(ranked.sort((a: SearchResult, b: SearchResult) => b.score - a.score));
      setIsSearching(false);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  // Load data on mount and restore search from URL
  useEffect(() => {
    async function loadData() {
      try {
        const [episodesRes, keywordsRes, clipsRes, transcriptIndexRes] = await Promise.all([
          fetch('/data/episodes.json'),
          fetch('/data/keywords.json'),
          fetch('/data/clips.json'),
          fetch('/data/transcript-index.json').catch(() => null) // Optional, may not exist
        ]);

        const episodesData = await episodesRes.json();
        const keywordsData = await keywordsRes.json();
        const clipsData = await clipsRes.json();
        const transcriptIndexData = transcriptIndexRes?.ok ? await transcriptIndexRes.json() : {};

        setEpisodes(episodesData);
        // keywords.json is an array
        setKeywords(Array.isArray(keywordsData) ? keywordsData : Object.values(keywordsData));
        // clips.json is an array
        setClips(Array.isArray(clipsData) ? clipsData : []);
        setTranscriptIndex(transcriptIndexData || {});
        setIsLoading(false);
        
        // Restore search query from URL after data is loaded
        const queryParam = searchParams.get('q');
        if (queryParam) {
          setSearchQuery(queryParam);
          // Trigger search with loaded data, skipping URL update
          handleSearch(queryParam, episodesData, Array.isArray(clipsData) ? clipsData : [], transcriptIndexData, true);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
        setIsLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to URL changes (browser back/forward buttons)
  useEffect(() => {
    // Skip if data not loaded yet
    if (episodes.length === 0 || clips.length === 0) return;
    
    const queryParam = searchParams.get('q');
    const urlQuery = queryParam || '';
    
    // Only update if URL query differs from current state
    if (urlQuery !== searchQuery) {
      if (urlQuery) {
        // URL has a query - restore search from URL (skip URL update to prevent loop)
        handleSearch(urlQuery, episodes, clips, transcriptIndex, true);
      } else {
        // URL has no query - clear search
        setSearchQuery('');
        setSearchResults([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Handle keyword click
  const handleKeywordClick = (keywordName: string) => {
    handleSearch(keywordName);
  };


  const hasResults = searchResults.length > 0;
  const showCarousel = hasResults || searchQuery;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {!showCarousel ? (
          <>
            {/* Landing view */}
            <VideoMosaicBackground episodes={episodes} />
            <SparkAnimation />
            <div className={styles.hero}>
              <div className={styles.logoWrapper}>
        <Image
                  src="/lennypodcastlogo.png"
                  alt="Lenny's Podcast"
                  width={160}
                  height={160}
                  priority
          className={styles.logo}
                />
              </div>
              <h1 className={styles.tagline}>Learn from podcast moments</h1>
              <div className={styles.searchSection}>
                <SearchInput onSearch={handleSearch} autoFocus />
              </div>
              <div className={styles.keywordsSection}>
                <p className={styles.keywordsLabel}>Popular topics</p>
                <KeywordTags 
                  keywords={keywords}
                  episodes={episodes}
                  onKeywordClick={handleKeywordClick}
                />
              </div>
              <p className={styles.footerText}>
                Built with love from{' '}
                <a 
                  href="https://x.com/lennysan" 
              target="_blank"
              rel="noopener noreferrer"
                  className={styles.footerLink}
                >
                  Lenny's Podcast
                </a>
                .
          </p>
        </div>
          </>
        ) : (
          <>
            {/* Results view */}
            <div className={styles.resultsHeader}>
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsSearching(false);
                  router.push('/', { scroll: false });
                }}
                className={styles.backButton}
              >
                ← Back
              </button>
              <h2 className={styles.resultsTitle}>
                {searchQuery ? `Clips for "${searchQuery}"` : 'Search clips'}
              </h2>
              {searchResults.length > 0 && (
                <p className={styles.resultsCount}>
                  {searchResults.length} {searchResults.length === 1 ? 'episode' : 'episodes'} found
                </p>
              )}
            </div>
            {isSearching ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner}></div>
                <p className={styles.loadingText}>Searching episodes...</p>
              </div>
            ) : (
              <Carousel3D 
                episodes={searchResults.map(result => {
                const episode = episodes.find(e => e.slug === result.episodeSlug);
                if (!episode) {
                  console.warn('Episode not found for slug:', result.episodeSlug);
                  return null;
                }
                // Use episode data as source of truth, only keep search metadata
                // Explicitly set all fields to ensure no override from search result
                const episodeData = {
                  slug: episode.slug,
                  guest: episode.guest,
                  title: episode.title,
                  videoId: episode.videoId,
                  description: episode.description,
                  publishDate: episode.publishDate,
                  viewCount: episode.viewCount,
                  keywords: episode.keywords,
                  episodeSlug: episode.slug,
                  // Only preserve search-specific fields
                  score: result.score,
                  matchType: result.matchType,
                  matchedKeywords: result.matchedKeywords
                };
                
                // Debug: Log if there's a mismatch
                if (result.guest && result.guest !== episode.guest) {
                  console.warn(`⚠️ Guest name mismatch for ${result.episodeSlug}: Search result has "${result.guest}", Episode data has "${episode.guest}". Using episode data.`);
                }
                
                return episodeData;
              }).filter((ep): ep is NonNullable<typeof ep> => ep !== null)}
                clips={clips}
                transcriptIndex={transcriptIndex}
                searchQuery={searchQuery}
                initialEpisodeSlug={returnFromEpisode || undefined}
                ragClipsBySlug={Object.fromEntries(
                  searchResults
                    .filter((r) => r.ragClips && r.ragClips.length > 0)
                    .map((r) => [r.episodeSlug, r.ragClips!])
                )}
              />
                    )}
                  </>
                )}
                {/* Logo in bottom-right corner - only show on search results, not homepage */}
                {showCarousel && (
                  <Link href="/">
                    <div 
                      className={styles.bottomLogo}
                      onMouseEnter={() => setIsLogoHovered(true)}
                      onMouseLeave={() => setIsLogoHovered(false)}
                    >
                      <LogoSpark isHovered={isLogoHovered} />
            <Image
                        src="/lennypodcastlogo.png"
                        alt="Lenny's Podcast"
                        width={64}
                        height={64}
                        className={styles.brandLogo}
                      />
        </div>
                  </Link>
                )}
      </main>
    </div>
          );
        }

export default function Home() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Loading...</p>
          </div>
        </main>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
