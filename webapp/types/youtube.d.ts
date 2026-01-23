/**
 * YouTube IFrame API types
 */

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YTPlayerOptions {
  videoId?: string;
  width?: number;
  height?: number;
  playerVars?: {
    autoplay?: 0 | 1;
    controls?: 0 | 1 | 2;
    disablekb?: 0 | 1;
    enablejsapi?: 0 | 1;
    end?: number;
    fs?: 0 | 1;
    iv_load_policy?: 1 | 3;
    loop?: 0 | 1;
    modestbranding?: 0 | 1;
    origin?: string;
    playlist?: string;
    playsinline?: 0 | 1;
    rel?: 0 | 1;
    start?: number;
  };
  events?: {
    onReady?: (event: YT.PlayerEvent) => void;
    onStateChange?: (event: YT.OnStateChangeEvent) => void;
    onPlaybackQualityChange?: (event: YT.OnPlaybackQualityChangeEvent) => void;
    onPlaybackRateChange?: (event: YT.OnPlaybackRateChangeEvent) => void;
    onError?: (event: YT.OnErrorEvent) => void;
    onApiChange?: (event: YT.PlayerEvent) => void;
  };
}

declare namespace YT {
  class Player {
    constructor(containerId: string | HTMLElement, options: YTPlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoUrl(): string;
    getVideoEmbedCode(): string;
    getPlaylist(): string[];
    getPlaylistIndex(): number;
    getVideoLoadedFraction(): number;
    getPlayerState(): number;
    getPlaybackQuality(): string;
    getPlaybackRate(): number;
    getAvailablePlaybackRates(): number[];
    getVolume(): number;
    isMuted(): boolean;
    mute(): void;
    unMute(): void;
    setVolume(volume: number): void;
    setSize(width: number, height: number): void;
    setPlaybackQuality(suggestedQuality: string): void;
    setPlaybackRate(suggestedRate: number): void;
    setLoop(loopPlaylists: boolean): void;
    setShuffle(shufflePlaylist: boolean): void;
    getOptions(): string[];
    getOption(module: string, option: string): string | number;
    setOption(module: string, option: string, value: string | number): void;
    cueVideoById(videoId: string, startSeconds?: number, suggestedQuality?: string): void;
    cueVideoByUrl(mediaContentUrl: string, startSeconds?: number, suggestedQuality?: string): void;
    loadVideoById(videoId: string, startSeconds?: number, suggestedQuality?: string): void;
    loadVideoByUrl(mediaContentUrl: string, startSeconds?: number, suggestedQuality?: string): void;
    cuePlaylist(playlist: string[], index?: number, startSeconds?: number, suggestedQuality?: string): void;
    loadPlaylist(playlist: string[], index?: number, startSeconds?: number, suggestedQuality?: string): void;
    playVideoAt(index: number): void;
    nextVideo(): void;
    previousVideo(): void;
    destroy(): void;
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: number;
  }

  interface OnPlaybackQualityChangeEvent extends PlayerEvent {
    data: string;
  }

  interface OnPlaybackRateChangeEvent extends PlayerEvent {
    data: number;
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }

  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }
}

export {};
