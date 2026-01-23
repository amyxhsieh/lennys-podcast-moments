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
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Throttle mouse tracking to every 50ms for better performance
      if (!throttleTimeoutRef.current) {
        throttleTimeoutRef.current = setTimeout(() => {
          setMousePos({ x: e.clientX, y: e.clientY });
          throttleTimeoutRef.current = null;
        }, 50);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, []);

  // Create a scattered collage of video tiles with random positions and sizes
  // Use a grid-based approach with randomness to ensure even distribution
  const gridItems = episodes.slice(0, 30).map((episode, index) => {
    // Smaller tiles: Random size between 120px and 280px
    const size = 120 + Math.random() * 160;
    
    // Distribute in a 6x5 grid pattern with randomness to avoid clustering
    const gridCols = 6;
    const gridRows = 5;
    const gridCol = index % gridCols;
    const gridRow = Math.floor(index / gridCols);
    
    // Calculate base position from grid, then add randomness within the grid cell
    const cellWidth = 100 / gridCols;
    const cellHeight = 100 / gridRows;
    const left = gridCol * cellWidth + (Math.random() * cellWidth * 0.7);
    const top = gridRow * cellHeight + (Math.random() * cellHeight * 0.7);
    
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
              src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1&mute=1&controls=0&showinfo=0&modestbranding=1&loop=1&playlist=${item.videoId}&start=${item.startTime}&rel=0&disablekb=1&fs=0&vq=small`}
              className={styles.videoFrame}
              allow="autoplay; encrypted-media"
              title={item.guest}
              loading={index < 10 ? 'eager' : 'lazy'}
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
