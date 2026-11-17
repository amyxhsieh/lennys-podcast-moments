'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import GuestCard from './GuestCard';
import { clipMatchesQuery, generateClipsFromTranscript } from '../utils/search';
import styles from './Carousel3D.module.css';

interface Episode {
  slug: string;
  guest: string;
  title: string;
  videoId: string;
  description?: string;
  keywords?: string[];
  matchedKeywords?: string[];
}

interface Clip {
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  previewText?: string;
}

interface Carousel3DProps {
  episodes: Episode[];
  clips: any[];
  transcriptIndex?: Record<string, any[]>;
  searchQuery?: string;
  initialEpisodeSlug?: string; // Episode to center on initially
  /** RAG clips keyed by episode slug from hybrid search */
  ragClipsBySlug?: Record<string, Clip[]>;
}

export default function Carousel3D({ episodes, clips, transcriptIndex = {}, searchQuery = '', initialEpisodeSlug, ragClipsBySlug = {} }: Carousel3DProps) {
  // Find initial index based on episode slug if provided
  const getInitialIndex = () => {
    if (initialEpisodeSlug) {
      const index = episodes.findIndex(ep => ep.slug === initialEpisodeSlug);
      return index !== -1 ? index : 0;
    }
    return 0;
  };
  
  const [currentIndex, setCurrentIndex] = useState(getInitialIndex());
  const containerRef = useRef<HTMLDivElement>(null);

  // Get clips for each episode (RAG, pre-generated, or generate from transcript)
  const getClipsForEpisode = useCallback((episodeSlug: string): Clip[] => {
    if (!episodeSlug || !searchQuery) return [];

    const episode = episodes.find((ep) => ep.slug === episodeSlug);
    const matchedKeywords = episode?.matchedKeywords || [];

    // Prefer RAG clips from hybrid/vector search
    const ragClips = ragClipsBySlug[episodeSlug];
    if (ragClips && ragClips.length > 0) {
      return [...ragClips].sort((a, b) => a.startSeconds - b.startSeconds);
    }
    
    // Pre-generated clips via query + synonyms + matched tags
    const preGeneratedClips = clips.filter((clip: any) => {
      if (clip.episodeSlug !== episodeSlug) return false;
      return clipMatchesQuery(clip.keyword || '', searchQuery, matchedKeywords);
    });
    
    if (preGeneratedClips.length > 0) {
      const mappedClips = preGeneratedClips.map(clip => ({
        startSeconds: clip.startSeconds || clip.startTime || 0,
        endSeconds: clip.endSeconds || clip.endTime || 0,
        startTimestamp: clip.startTimestamp || '',
        endTimestamp: clip.endTimestamp || '',
        previewText: clip.previewText || clip.preview || ''
      }));
      return mappedClips.sort((a, b) => a.startSeconds - b.startSeconds);
    }
    
    // Generate from transcript (query + synonyms)
    if (transcriptIndex[episodeSlug]) {
      const generatedClips = generateClipsFromTranscript(
        searchQuery,
        episodeSlug,
        transcriptIndex,
        matchedKeywords
      );
      if (generatedClips.length > 0) {
        const mappedClips = generatedClips.map(clip => ({
          startSeconds: clip.startSeconds,
          endSeconds: clip.endSeconds,
          startTimestamp: clip.startTimestamp,
          endTimestamp: clip.endTimestamp,
          previewText: clip.previewText || ''
        }));
        return mappedClips.sort((a, b) => a.startSeconds - b.startSeconds);
      }
    }

    // Last resort: any clip on this episode so the card remains playable
    const anyClips = clips
      .filter((clip: any) => clip.episodeSlug === episodeSlug)
      .map((clip) => ({
        startSeconds: clip.startSeconds || clip.startTime || 0,
        endSeconds: clip.endSeconds || clip.endTime || 0,
        startTimestamp: clip.startTimestamp || '',
        endTimestamp: clip.endTimestamp || '',
        previewText: clip.previewText || clip.preview || '',
      }))
      .sort((a, b) => a.startSeconds - b.startSeconds)
      .slice(0, 3);

    return anyClips;
  }, [clips, transcriptIndex, searchQuery, ragClipsBySlug, episodes]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + episodes.length) % episodes.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % episodes.length);
  };

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

  if (!episodes || episodes.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No episodes found matching your search.</p>
      </div>
    );
  }

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carouselWrapper} ref={containerRef}>
        <button 
          className={styles.navButton} 
          onClick={handlePrev}
          aria-label="Previous episode"
        >
          <span className="material-icons">chevron_left</span>
        </button>

        <div className={styles.carouselTrack}>
          {episodes.map((episode, index) => {
            // Calculate offset with wrapping for infinite loop effect
            let offset = index - currentIndex;
            
            // Handle wrapping: if offset is too far, wrap it around
            if (offset > episodes.length / 2) {
              offset -= episodes.length;
            } else if (offset < -episodes.length / 2) {
              offset += episodes.length;
            }
            
            const episodeClips = getClipsForEpisode(episode.slug);
            const clipCount = episodeClips.length;
            const firstClip = episodeClips[0];
            const isCenter = offset === 0;
            
            return (
              <div
                key={episode.slug}
                className={`${styles.cardWrapper} ${isCenter ? styles.center : ''}`}
                style={{
                  transform: `
                    translateX(${offset * 600}px)
                    translateZ(${isCenter ? '0px' : '-200px'})
                    rotateY(${offset * -15}deg)
                    scale(${isCenter ? 1 : 0.7})
                  `,
                  opacity: Math.abs(offset) > 1 ? 0 : isCenter ? 1 : 0.4,
                  visibility: Math.abs(offset) > 1 ? 'hidden' : 'visible',
                  zIndex: isCenter ? 10 : Math.abs(offset) > 1 ? 0 : 5 - Math.abs(offset),
                  pointerEvents: isCenter ? 'auto' : 'none',
                }}
              >
                <GuestCard
                  episode={episode}
                  clipCount={clipCount}
                  firstClip={firstClip}
                  isCenter={isCenter}
                  searchQuery={searchQuery}
                />
              </div>
            );
          })}
        </div>

        <button 
          className={styles.navButton} 
          onClick={handleNext}
          aria-label="Next episode"
        >
          <span className="material-icons">chevron_right</span>
        </button>
      </div>

      {/* Pagination dots */}
      <div className={styles.pagination}>
        {episodes.map((_, index) => (
          <button
            key={index}
            className={`${styles.dot} ${index === currentIndex ? styles.activeDot : ''}`}
            onClick={() => handleDotClick(index)}
            aria-label={`Go to episode ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
