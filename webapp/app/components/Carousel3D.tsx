'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import GuestCard from './GuestCard';
import { generateClipsFromTranscript } from '../utils/search';
import styles from './Carousel3D.module.css';

interface Episode {
  slug: string;
  guest: string;
  title: string;
  videoId: string;
  description?: string;
  keywords?: string[];
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
}

export default function Carousel3D({ episodes, clips, transcriptIndex = {}, searchQuery = '' }: Carousel3DProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get clips for each episode (pre-generated or generate from transcript)
  const getClipsForEpisode = useCallback((episodeSlug: string): Clip[] => {
    if (!episodeSlug || !searchQuery) return [];
    
    const queryLower = searchQuery.toLowerCase().trim();
    
    // First, try to find pre-generated clips
    const preGeneratedClips = clips.filter((clip: any) => {
      if (clip.episodeSlug !== episodeSlug) return false;
      const clipKeyword = (clip.keyword || '').toLowerCase();
      return clipKeyword.includes(queryLower) || queryLower.includes(clipKeyword);
    });
    
    // If pre-generated clips exist, use them
    if (preGeneratedClips.length > 0) {
      return preGeneratedClips.map(clip => ({
        startSeconds: clip.startSeconds || clip.startTime || 0,
        endSeconds: clip.endSeconds || clip.endTime || 0,
        startTimestamp: clip.startTimestamp || '',
        endTimestamp: clip.endTimestamp || '',
        previewText: clip.previewText || clip.preview || ''
      }));
    }
    
    // Otherwise, generate clips from transcript if available
    if (transcriptIndex[episodeSlug]) {
      const generatedClips = generateClipsFromTranscript(searchQuery, episodeSlug, transcriptIndex);
      return generatedClips.map(clip => ({
        startSeconds: clip.startSeconds,
        endSeconds: clip.endSeconds,
        startTimestamp: clip.startTimestamp,
        endTimestamp: clip.endTimestamp,
        previewText: clip.previewText || ''
      }));
    }
    
    return [];
  }, [clips, transcriptIndex, searchQuery]);

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
