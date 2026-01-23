/**
 * Timestamp utilities for converting between formats
 */

/**
 * Parse timestamp string (HH:MM:SS) to seconds
 */
export function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Convert seconds to HH:MM:SS format
 */
export function secondsToTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to YouTube URL parameter (e.g., ?t=123)
 */
export function secondsToYouTubeTime(seconds: number): string {
  return seconds.toString();
}

/**
 * Format timestamp for display (e.g., "1:23:45" -> "1h 23m")
 */
export function formatTimestampDisplay(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format duration string (e.g., "1:13:28" -> seconds)
 */
export function durationToSeconds(duration: string): number {
  return timestampToSeconds(duration);
}
