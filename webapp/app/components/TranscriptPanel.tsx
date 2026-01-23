'use client';

import { useState, useEffect } from 'react';
import styles from './TranscriptPanel.module.css';

interface Clip {
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  previewText?: string;
}

interface TranscriptSegment {
  speaker: string;
  timestamp: string;
  timestampSeconds: number;
  text: string;
}

interface TranscriptPanelProps {
  episodeSlug: string;
  clip: Clip;
  playerRef: React.RefObject<any>;
}

export default function TranscriptPanel({ episodeSlug, clip, playerRef }: TranscriptPanelProps) {
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load transcript segments from transcript-index.json directly (no API call)
  useEffect(() => {
    async function loadTranscript() {
      setIsLoading(true);
      try {
        // Load transcript-index.json directly
        const transcriptIndexResponse = await fetch('/data/transcript-index.json');
        if (!transcriptIndexResponse.ok) {
          throw new Error('Failed to load transcript index');
        }
        
        const transcriptIndex = await transcriptIndexResponse.json();
        const episodeSegments = transcriptIndex[episodeSlug];
        
        if (!episodeSegments || episodeSegments.length === 0) {
          // Fallback to preview text if no segments found
          setTranscriptSegments([]);
          setIsLoading(false);
          return;
        }
        
        // Add buffer time: 30 seconds before clip start, 15 seconds after clip end
        // Buffer helps us find segments that start before clip but continue into it
        const BUFFER_BEFORE = 30;
        const BUFFER_AFTER = 15;
        const expandedStart = Math.max(0, clip.startSeconds - BUFFER_BEFORE);
        const expandedEnd = clip.endSeconds + BUFFER_AFTER;
        
        // Filter segments that overlap with the clip range (not expanded range)
        // This ensures transcript starts exactly where clip starts, matching previewText behavior
        const clipSegments = episodeSegments.filter((segment: TranscriptSegment, index: number) => {
          const segmentStart = segment.timestampSeconds;
          const nextSegment = episodeSegments[index + 1];
          const segmentEnd = nextSegment ? nextSegment.timestampSeconds : segmentStart + 60;
          
          // Include segment if it overlaps with the ACTUAL clip range (not expanded)
          // This matches previewText behavior - transcript starts exactly at clip start
          // But we use expanded range to search, then filter to actual clip range
          const overlapsClip = segmentStart < clip.endSeconds && segmentEnd > clip.startSeconds;
          
          // Also include segments that are very close to clip start (within buffer) to catch context
          const isNearClipStart = segmentStart >= expandedStart && segmentStart <= clip.startSeconds + 5;
          
          return overlapsClip || isNearClipStart;
        });
        
        if (clipSegments.length > 0) {
          // Store segments for formatted display with speaker names
          setTranscriptSegments(clipSegments.filter((seg: TranscriptSegment) => seg.text.trim().length > 0));
        } else {
          // No segments found
          setTranscriptSegments([]);
        }
      } catch (error) {
        console.error('Failed to load transcript:', error);
        setTranscriptSegments([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (episodeSlug && clip && clip.startSeconds !== undefined && clip.endSeconds !== undefined) {
      loadTranscript();
    }
  }, [episodeSlug, clip]);

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Transcript</h3>
        <p className={styles.loading}>Loading transcript...</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Transcript</h3>
      <div className={styles.transcriptText}>
        {transcriptSegments.length > 0 ? (
          <div className={styles.textContent}>
            {transcriptSegments.map((segment, index) => {
              const prevSegment = index > 0 ? transcriptSegments[index - 1] : null;
              const isNewSpeaker = !prevSegment || prevSegment.speaker !== segment.speaker;
              const text = segment.text.trim();
              
              if (!text) return null;
              
              return (
                <p key={index} className={styles.paragraph}>
                  {isNewSpeaker && (
                    <span className={styles.speaker}>{segment.speaker || 'Speaker'}:</span>
                  )}
                  <span className={styles.speech}>{text}</span>
                </p>
              );
            })}
          </div>
        ) : (
          <p className={styles.textContent}>
            {clip.previewText || 'Transcript not available for this clip segment.'}
          </p>
        )}
      </div>
      <div className={styles.clipInfo}>
        <p className={styles.clipRange}>
          Clip: {clip.startTimestamp} - {clip.endTimestamp}
        </p>
      </div>
    </div>
  );
}
