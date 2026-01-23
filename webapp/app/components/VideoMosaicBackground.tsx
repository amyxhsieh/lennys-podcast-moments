'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './VideoMosaicBackground.module.css';

interface VideoMosaicBackgroundProps {
  episodes: Array<{
    videoId: string;
    guest: string;
  }>;
}

export default function VideoMosaicBackground({ episodes }: VideoMosaicBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Create a scattered collage of video tiles with random positions and sizes
  const gridItems = episodes.slice(0, 30).map((episode, index) => {
    // Random size between 150px and 350px
    const size = 150 + Math.random() * 200;
    // Random position
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    // Random rotation between -15 and 15 degrees
    const rotation = (Math.random() - 0.5) * 30;
    // Random start time
    const startTime = Math.floor(30 + Math.random() * 270);
    
    return {
      id: index,
      videoId: episode.videoId,
      guest: episode.guest,
      size,
      left,
      top,
      rotation,
      startTime,
    };
  });

  return (
    <div className={styles.mosaicContainer} ref={containerRef}>
      {/* Video collage */}
      <div className={styles.videoGrid}>
        {gridItems.map((item, index) => (
          <div 
            key={item.id} 
            className={styles.videoTile}
            style={{
              width: `${item.size}px`,
              height: `${item.size * 0.6}px`,
              left: `${item.left}%`,
              top: `${item.top}%`,
              transform: `rotate(${item.rotation}deg)`,
            }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1&mute=1&controls=0&showinfo=0&modestbranding=1&loop=1&playlist=${item.videoId}&start=${item.startTime}&rel=0&disablekb=1&fs=0`}
              className={styles.videoFrame}
              allow="autoplay; encrypted-media"
              title={item.guest}
              loading={index < 15 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>

      {/* Spotlight overlay that follows cursor */}
      <div
        className={styles.spotlightOverlay}
        style={{
          background: `radial-gradient(circle at ${mousePos.x}px ${mousePos.y}px, 
            rgba(15, 15, 15, 0.2) 0px, 
            rgba(15, 15, 15, 0.35) 20px, 
            rgba(15, 15, 15, 0.5) 40px, 
            rgba(15, 15, 15, 0.65) 60px, 
            rgba(15, 15, 15, 0.78) 80px,
            rgba(15, 15, 15, 0.88) 100px,
            rgba(15, 15, 15, 0.95) 125px,
            rgba(15, 15, 15, 1) 160px)`,
        }}
      />

      {/* Additional glow effect around cursor */}
      <div
        className={styles.cursorGlow}
        style={{
          left: `${mousePos.x}px`,
          top: `${mousePos.y}px`,
        }}
      />
    </div>
  );
}
