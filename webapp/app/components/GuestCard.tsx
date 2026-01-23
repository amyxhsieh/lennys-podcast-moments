'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './GuestCard.module.css';

interface Episode {
  slug: string;
  guest: string;
  title: string;
  videoId: string;
  description?: string;
}

interface GuestCardProps {
  episode: Episode;
  clipCount: number;
  firstClip?: any;
  isCenter?: boolean;
  searchQuery?: string;
}

export default function GuestCard({ 
  episode, 
  clipCount, 
  firstClip,
  isCenter = false,
  searchQuery = ''
}: GuestCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  const thumbnailUrl = `https://img.youtube.com/vi/${episode.videoId}/maxresdefault.jpg`;
  const getVideoUrl = (muted: boolean) => {
    if (!firstClip) return null;
    const muteParam = muted ? '1' : '0';
    return `https://www.youtube.com/embed/${episode.videoId}?autoplay=1&mute=${muteParam}&start=${firstClip.startSeconds}&controls=0&modestbranding=1&rel=0`;
  };
  const videoUrl = getVideoUrl(isMuted);

  const handleClick = () => {
    const slug = episode.slug || '';
    if (!slug) {
      console.error('No slug found for episode:', episode);
      return;
    }
    
    const params = new URLSearchParams();
    if (firstClip && typeof firstClip.startSeconds !== 'undefined') {
      params.set('clip', firstClip.startSeconds.toString());
    }
    if (searchQuery) {
      params.set('topic', searchQuery);
      // Also include the episode slug so we can return to it in the carousel
      params.set('from', slug);
    }
    
    const queryString = params.toString();
    router.push(`/episode/${slug}${queryString ? `?${queryString}` : ''}`);
  };

  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(false);
  };

  // Truncate description to ~150 characters
  const truncatedDescription = episode.title 
    ? episode.title.length > 150 
      ? episode.title.substring(0, 150) + '...'
      : episode.title
    : 'Click to explore clips from this episode';

  return (
    <div className={styles.cardContainer}>
      {/* Thumbnail/Video section */}
      <div
        className={`${styles.thumbnailSection} ${isCenter ? styles.center : ''} ${!isCenter ? styles.dimmed : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
      >
        {/* Thumbnail */}
        <img
          src={thumbnailUrl}
          alt={episode.guest}
          className={styles.thumbnail}
          style={{ opacity: isHovered && videoUrl ? 0 : 1 }}
        />

        {/* Video preview on hover */}
        {isHovered && videoUrl && (
          <div 
            className={styles.videoPreviewWrapper}
            onClick={handleClick}
          >
            <iframe
              key={isMuted ? 'muted' : 'unmuted'} // Force re-render when mute state changes
              ref={videoRef}
              src={videoUrl}
              className={styles.videoPreview}
              allow="autoplay; encrypted-media"
              title={`Preview of ${episode.guest}`}
            />
          </div>
        )}

        {/* Clip count badge */}
        {clipCount > 0 && (
          <div className={styles.clipBadge}>
            <span className="material-icons">play_circle</span>
            <span>{clipCount} {clipCount === 1 ? 'clip' : 'clips'}</span>
          </div>
        )}

        {/* Unmute button when hovering video */}
        {isHovered && videoUrl && isMuted && (
          <button
            className={styles.unmuteButton}
            onClick={handleUnmute}
            aria-label="Unmute video"
          >
            <span className="material-icons">volume_off</span>
          </button>
        )}
      </div>

      {/* Text panel - only show for center card */}
      {isCenter && (
        <div className={styles.textPanel}>
          <h3 className={styles.guestName}>{episode.guest}</h3>
          <p className={styles.description}>{truncatedDescription}</p>
          <button className={styles.exploreButton} onClick={handleClick}>
            Explore clips
            <span className="material-icons">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  );
}
