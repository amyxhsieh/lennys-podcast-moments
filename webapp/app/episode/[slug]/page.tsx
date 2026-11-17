'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import TranscriptPanel from '@/app/components/TranscriptPanel';
import LogoSpark from '@/app/components/LogoSpark';
import { secondsToTimestamp } from '@/app/utils/timestamp';
import { formatDescription } from '@/app/utils/formatDescription';
import {
  clipMatchesQuery,
  expandQueryTerms,
  generateClipsFromTranscript,
} from '@/app/utils/search';
import styles from './page.module.css';

interface Episode {
  slug: string;
  guest: string;
  title: string;
  videoId: string;
  youtubeUrl: string;
  publishDate: string;
  description: string;
  duration: string;
  viewCount: number;
}

interface Clip {
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  previewText?: string;
}

interface RelatedEpisode {
  slug: string;
  guest: string;
  title: string;
  videoId: string;
  score: number;
}

interface RelatedClip {
  episodeSlug: string;
  guest: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  previewText: string;
  score: number;
  keyword?: string;
}

export default function EpisodeDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const clipStartParam = searchParams.get('clip');
  const topicParam = searchParams.get('topic'); // Search query/keyword
  const fromParam = searchParams.get('from'); // Episode to return to in carousel
  
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClip, setCurrentClip] = useState<Clip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showReadMore, setShowReadMore] = useState(false);
  const [clipNotification, setClipNotification] = useState<string | null>(null);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [relatedEpisodes, setRelatedEpisodes] = useState<RelatedEpisode[]>([]);
  const [relatedClips, setRelatedClips] = useState<RelatedClip[]>([]);
  const playerRef = useRef<any>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const timeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clipAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if description needs "Read more" button
  useEffect(() => {
    if (descriptionRef.current && episode?.description) {
      const element = descriptionRef.current;
      // Check if content is truncated by comparing scroll height with client height
      setShowReadMore(element.scrollHeight > element.clientHeight);
    }
  }, [episode?.description]);

  // Load episode data
  useEffect(() => {
    async function loadEpisode() {
      try {
        // Try API route first
        const response = await fetch(`/api/episodes/${slug}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.videoId) {
            setEpisode(data);
            setIsLoading(false);
            return;
          }
        }
        
        // Fallback: load directly from JSON
        console.log('API failed, loading from JSON directly...');
        const episodesResponse = await fetch('/data/episodes.json');
        const allEpisodes = await episodesResponse.json();
        const foundEpisode = allEpisodes.find((e: Episode) => e.slug === slug);
        
        if (foundEpisode && foundEpisode.videoId) {
          setEpisode(foundEpisode);
        } else {
          console.error(`Episode not found: ${slug}`);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load episode:', error);
        setIsLoading(false);
      }
    }

    if (slug) {
      loadEpisode();
    }
  }, [slug]);

  // Load clips for this episode, filtered by topic if provided
  useEffect(() => {
    async function loadClips() {
      try {
        const [clipsResponse, keywordsResponse, transcriptIndexResponse] = await Promise.all([
          fetch('/data/clips.json'),
          fetch('/data/keywords.json'),
          fetch('/data/transcript-index.json').catch(() => null) // Optional
        ]);
        
        const allClipsArray = await clipsResponse.json();
        const keywordsData = await keywordsResponse.json();
        const transcriptIndexData = transcriptIndexResponse?.ok ? await transcriptIndexResponse.json() : {};
        
        // Convert keywords object to array if needed
        const keywordsArray = Array.isArray(keywordsData) ? keywordsData : Object.values(keywordsData);
        
        // Ensure clips is an array
        const clipsArray = Array.isArray(allClipsArray) ? allClipsArray : [];
        
        // Find clips for this episode, filtered by topic/keyword if provided
        const episodeClips: Clip[] = [];
        
        if (topicParam) {
          const topicLower = topicParam.toLowerCase().trim();
          const expanded = expandQueryTerms(topicLower);
          console.log('🔍 Searching for topic:', topicParam, 'in episode:', slug);

          const matchingKeywords: string[] = [];
          for (const keywordData of keywordsArray) {
            const keywordName = (keywordData.name || '').toLowerCase();
            if (
              expanded.some((term) => clipMatchesQuery(keywordName, term)) ||
              clipMatchesQuery(keywordName, topicLower)
            ) {
              matchingKeywords.push(keywordData.name);
            }
          }

          console.log('📋 Found', matchingKeywords.length, 'matching keywords:', matchingKeywords);

          for (const clip of clipsArray) {
            if (
              clip.episodeSlug === slug &&
              clipMatchesQuery(clip.keyword || '', topicLower, matchingKeywords)
            ) {
              episodeClips.push({
                startSeconds: clip.startSeconds || clip.startTime || 0,
                endSeconds: clip.endSeconds || clip.endTime || 0,
                startTimestamp:
                  clip.startTimestamp ||
                  secondsToTimestamp(clip.startSeconds || clip.startTime || 0),
                endTimestamp:
                  clip.endTimestamp ||
                  secondsToTimestamp(clip.endSeconds || clip.endTime || 0),
                previewText: clip.previewText || clip.preview || '',
              });
            }
          }

          if (episodeClips.length === 0 && transcriptIndexData[slug]) {
            console.log('📝 No pre-generated clips found, searching transcript...');
            const generatedClips = generateClipsFromTranscript(
              topicParam,
              slug,
              transcriptIndexData,
              matchingKeywords
            );
            console.log('🎬 Generated', generatedClips.length, 'clips from transcript');

            for (const clip of generatedClips) {
              episodeClips.push({
                startSeconds: clip.startSeconds,
                endSeconds: clip.endSeconds,
                startTimestamp: clip.startTimestamp,
                endTimestamp: clip.endTimestamp,
                previewText: clip.previewText || '',
              });
            }
          }

          // Any clip on episode as last resort so detail page isn't empty
          if (episodeClips.length === 0) {
            for (const clip of clipsArray) {
              if (clip.episodeSlug === slug) {
                episodeClips.push({
                  startSeconds: clip.startSeconds || 0,
                  endSeconds: clip.endSeconds || 0,
                  startTimestamp:
                    clip.startTimestamp ||
                    secondsToTimestamp(clip.startSeconds || 0),
                  endTimestamp:
                    clip.endTimestamp || secondsToTimestamp(clip.endSeconds || 0),
                  previewText: clip.previewText || '',
                });
              }
            }
          }

          // RAG hybrid search clips as additional fallback
          if (episodeClips.length === 0) {
            try {
              const searchRes = await fetch(
                `/api/search?q=${encodeURIComponent(topicParam)}`
              );
              if (searchRes.ok) {
                const searchResults = await searchRes.json();
                const match = Array.isArray(searchResults)
                  ? searchResults.find((r: any) => r.episodeSlug === slug)
                  : null;
                if (match?.ragClips?.length) {
                  for (const clip of match.ragClips) {
                    episodeClips.push({
                      startSeconds: clip.startSeconds,
                      endSeconds: clip.endSeconds,
                      startTimestamp: clip.startTimestamp,
                      endTimestamp: clip.endTimestamp,
                      previewText: clip.previewText || '',
                    });
                  }
                }
              }
            } catch (e) {
              console.warn('RAG clip fallback failed', e);
            }
          }
          
          console.log('🎬 Total clips found:', episodeClips.length);
        } else {
          // No topic filter - show all clips for this episode
          for (const clip of clipsArray) {
            if (clip.episodeSlug === slug) {
              episodeClips.push({
                startSeconds: clip.startSeconds || clip.startTime || 0,
                endSeconds: clip.endSeconds || clip.endTime || 0,
                startTimestamp: clip.startTimestamp || secondsToTimestamp(clip.startSeconds || clip.startTime || 0),
                endTimestamp: clip.endTimestamp || secondsToTimestamp(clip.endSeconds || clip.endTime || 0),
                previewText: clip.previewText || clip.preview || ''
              });
            }
          }
        }
        
        // Sort clips by start time
        episodeClips.sort((a, b) => a.startSeconds - b.startSeconds);
        
        setClips(episodeClips);
        
        // Set current clip from URL param or first clip
        if (clipStartParam) {
          const startSeconds = parseInt(clipStartParam);
          const clip = episodeClips.find(c => c.startSeconds === startSeconds);
          if (clip) {
            setCurrentClip(clip);
          } else if (episodeClips.length > 0) {
            setCurrentClip(episodeClips[0]);
          }
        } else if (episodeClips.length > 0) {
          setCurrentClip(episodeClips[0]);
        } else {
          // No clips found
          setCurrentClip(null);
        }
      } catch (error) {
        console.error('Failed to load clips:', error);
        setClips([]);
        setCurrentClip(null);
      }
    }

    if (slug) {
      loadClips();
    }
  }, [slug, clipStartParam, topicParam]);

  // Initialize YouTube IFrame API
  useEffect(() => {
    if (!episode || !currentClip || playerReady) {
      return;
    }

    // Function to advance to next clip (defined inside useEffect to access current state)
    const advanceToNextClip = () => {
      if (!currentClip || clips.length === 0) return;
      
      const currentIndex = clips.findIndex(c => c.startSeconds === currentClip.startSeconds);
      if (currentIndex === -1) return;
      
      // Check if there's a next clip
      if (currentIndex < clips.length - 1) {
        const nextClip = clips[currentIndex + 1];
        
        // Show notification
        setClipNotification(`Now playing: Clip ${currentIndex + 2} of ${clips.length}`);
        
        // Clear notification after 3 seconds
        setTimeout(() => {
          setClipNotification(null);
        }, 3000);
        
        // Brief pause (1.5 seconds) before advancing
        clipAdvanceTimeoutRef.current = setTimeout(() => {
          setCurrentClip(nextClip);
          setPlayerReady(false); // Force reinitialization
          // Player will reinitialize with new clip
        }, 1500);
      } else {
        // Last clip - just pause
        if (playerRef.current) {
          playerRef.current.pauseVideo();
        }
      }
    };

    function initializePlayer() {
      if (!currentClip || !episode) return;
      const startTime = currentClip.startSeconds;
      const endTime = currentClip.endSeconds;
      
      // @ts-ignore
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId: episode.videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          start: startTime,
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            // Seek to clip start time
            setTimeout(() => {
              if (playerRef.current) {
                playerRef.current.seekTo(startTime, true);
              }
            }, 500);

            // Monitor playback to enforce clip boundaries
            timeCheckIntervalRef.current = setInterval(() => {
              if (playerRef.current) {
                try {
                  const currentTime = playerRef.current.getCurrentTime();
                  const playerState = playerRef.current.getPlayerState();
                  
                  // @ts-ignore
                  const PLAYING = window.YT.PlayerState.PLAYING;
                  // @ts-ignore
                  const ENDED = window.YT.PlayerState.ENDED;
                  
                  // If playing and past end time, advance to next clip
                  if ((playerState === PLAYING || playerState === ENDED) && currentTime >= endTime) {
                    // Clear any existing timeout
                    if (clipAdvanceTimeoutRef.current) {
                      clearTimeout(clipAdvanceTimeoutRef.current);
                    }
                    // Pause and advance to next clip after brief pause
                    playerRef.current.pauseVideo();
                    advanceToNextClip();
                  }
                  // If before start time (user scrubbed backwards), jump to start
                  else if (currentTime < startTime) {
                    playerRef.current.seekTo(startTime, true);
                  }
                } catch (e) {
                  // Player might not be ready
                }
              }
            }, 250); // Check every 250ms for smooth looping
          },
          onStateChange: (event: any) => {
            // @ts-ignore
            if (event.data === window.YT.PlayerState.ENDED) {
              // Clear any existing timeout
              if (clipAdvanceTimeoutRef.current) {
                clearTimeout(clipAdvanceTimeoutRef.current);
              }
              // Advance to next clip after brief pause
              advanceToNextClip();
            }
          },
        },
      });
    }

    // Check if API is already loaded
    // @ts-ignore
    if (window.YT && window.YT.Player) {
      initializePlayer();
    } else {
      // Load YouTube IFrame API
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }

      // @ts-ignore
      window.onYouTubeIframeAPIReady = initializePlayer;
    }

    return () => {
      // Cleanup
      if (timeCheckIntervalRef.current) {
        clearInterval(timeCheckIntervalRef.current);
      }
      if (clipAdvanceTimeoutRef.current) {
        clearTimeout(clipAdvanceTimeoutRef.current);
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      setPlayerReady(false);
    };
  }, [episode, currentClip, clips]);

  // Reinitialize player when clip changes
  useEffect(() => {
    if (currentClip && playerRef.current && playerReady) {
      // When clip changes, destroy old player and reset to trigger reinitialization
      try {
        if (playerRef.current.destroy) {
          playerRef.current.destroy();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      setPlayerReady(false);
      playerRef.current = null;
      
      // Small delay to ensure cleanup completes
      setTimeout(() => {
        // The main useEffect will reinitialize the player
      }, 100);
    }
  }, [currentClip]);

  const handleClipClick = (clip: Clip) => {
    // Set new clip - this will trigger useEffect to reinitialize player
    setCurrentClip(clip);
    setPlayerReady(false); // Force reinitialization
    
    // If player exists, try to seek immediately (but it will be reinitialized)
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {
        // Ignore errors
      }
      playerRef.current = null;
    }
  };

  // Load related episodes + clips
  useEffect(() => {
    if (!slug) return;

    async function loadRelated() {
      try {
        const start = currentClip?.startSeconds ?? Number(clipStartParam) ?? 0;
        const topicQs = topicParam
          ? `&topic=${encodeURIComponent(topicParam)}`
          : '';
        const keywordQs = topicParam
          ? `&keyword=${encodeURIComponent(topicParam)}`
          : '';

        const [episodesRes, clipsRes] = await Promise.all([
          fetch(`/api/related/episodes?slug=${encodeURIComponent(slug)}${topicQs}`),
          fetch(
            `/api/related/clips?slug=${encodeURIComponent(slug)}&start=${start}${keywordQs}${topicQs}`
          ),
        ]);

        if (episodesRes.ok) {
          const data = await episodesRes.json();
          setRelatedEpisodes(Array.isArray(data.related) ? data.related : []);
        }
        if (clipsRes.ok) {
          const data = await clipsRes.json();
          setRelatedClips(Array.isArray(data.related) ? data.related : []);
        }
      } catch (err) {
        console.warn('Failed to load related content', err);
      }
    }

    loadRelated();
    // Re-fetch related clips when the active clip changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, topicParam, currentClip?.startSeconds, clipStartParam]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading episode...</div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>Episode not found</div>
      </div>
    );
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${episode.videoId}/maxresdefault.jpg`;

  const handleBack = () => {
    // Navigate back to search results with topic query and carousel position preserved
    if (topicParam) {
      const params = new URLSearchParams();
      params.set('q', topicParam);
      if (fromParam) {
        params.set('from', fromParam);
      }
      router.push(`/?${params.toString()}`);
    } else {
      router.push('/');
    }
  };

  return (
    <div className={styles.page}>
      {/* Clip notification toast */}
      {clipNotification && (
        <div className={styles.clipNotification}>
          {clipNotification}
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <button 
            onClick={handleBack}
            className={styles.backButton}
          >
            ← Back
          </button>
          <div className={styles.videoSection}>
            {currentClip ? (
              <div className={styles.videoWrapper}>
                <div id="youtube-player" className={styles.youtubePlayer}></div>
              </div>
            ) : (
              <div className={styles.noClipMessage}>
                <p>No clips found for this topic.</p>
              </div>
            )}
            {currentClip && (
              <div className={styles.clipInfo}>
                <p className={styles.clipTimeRange}>
                  Clip: {currentClip.startTimestamp} - {currentClip.endTimestamp}
                  <span className={styles.clipDuration}>
                    ({Math.round((currentClip.endSeconds - currentClip.startSeconds) / 60)} min)
                  </span>
                </p>
              </div>
            )}
            
            {clips.length > 1 && (
              <div className={styles.clipThumbnails}>
                {clips.map((clip, index) => (
                  <button
                    key={index}
                    onClick={() => handleClipClick(clip)}
                    className={`${styles.clipThumbnail} ${
                      currentClip?.startSeconds === clip.startSeconds ? styles.active : ''
                    }`}
                  >
                    <Image
                      src={thumbnailUrl}
                      alt={`Clip ${index + 1}`}
                      width={160}
                      height={90}
                      unoptimized
                    />
                    <div className={styles.clipTime}>{clip.startTimestamp}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.transcriptSection}>
            {currentClip && (
              <TranscriptPanel
                episodeSlug={slug}
                clip={currentClip}
                playerRef={playerRef}
              />
            )}
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.guestInfo}>
            <h2 className={styles.guestName}>{episode.guest}</h2>
            <h3 className={styles.episodeTitle}>{episode.title}</h3>
            {topicParam && (
              <div className={styles.topicBadge}>
                <span className={styles.topicLabel}>Topic:</span>
                <span className={styles.topicName}>{topicParam}</span>
              </div>
            )}
            {clips.length > 0 && (
              <p className={styles.clipCount}>
                {clips.length} {clips.length === 1 ? 'clip' : 'clips'} about this topic
              </p>
            )}
            {episode.publishDate && (
              <p className={styles.publishDate}>
                Published: {new Date(episode.publishDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            )}
            {episode.description && (
              <div>
                <p 
                  ref={descriptionRef}
                  className={`${styles.description} ${!isDescriptionExpanded ? styles.descriptionCollapsed : ''}`}
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {formatDescription(episode.description)}
                </p>
                {showReadMore && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className={styles.readMoreButton}
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <a
              href={episode.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.youtubeLink}
            >
              Watch full episode on YouTube →
            </a>
          </div>

          {relatedClips.length > 0 && (
            <div className={styles.relatedSection}>
              <h3 className={styles.relatedTitle}>More moments like this</h3>
              <ul className={styles.relatedList}>
                {relatedClips.slice(0, 5).map((clip) => {
                  const hrefParams = new URLSearchParams();
                  hrefParams.set('clip', String(clip.startSeconds));
                  if (topicParam) hrefParams.set('topic', topicParam);
                  if (fromParam) hrefParams.set('from', fromParam);
                  return (
                    <li key={`${clip.episodeSlug}-${clip.startSeconds}`}>
                      <Link
                        href={`/episode/${clip.episodeSlug}?${hrefParams.toString()}`}
                        className={styles.relatedItem}
                      >
                        <span className={styles.relatedGuest}>{clip.guest}</span>
                        <span className={styles.relatedMeta}>
                          {clip.startTimestamp}
                          {clip.keyword ? ` · ${clip.keyword}` : ''}
                        </span>
                        {clip.previewText && (
                          <span className={styles.relatedPreview}>
                            {clip.previewText.slice(0, 100)}
                            {clip.previewText.length > 100 ? '…' : ''}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {relatedEpisodes.length > 0 && (
            <div className={styles.relatedSection}>
              <h3 className={styles.relatedTitle}>Related episodes</h3>
              <ul className={styles.relatedList}>
                {relatedEpisodes.slice(0, 5).map((ep) => {
                  const hrefParams = new URLSearchParams();
                  if (topicParam) hrefParams.set('topic', topicParam);
                  if (fromParam) hrefParams.set('from', fromParam);
                  const qs = hrefParams.toString();
                  return (
                    <li key={ep.slug}>
                      <Link
                        href={`/episode/${ep.slug}${qs ? `?${qs}` : ''}`}
                        className={styles.relatedItem}
                      >
                        <div className={styles.relatedThumbWrap}>
                          <Image
                            src={`https://img.youtube.com/vi/${ep.videoId}/mqdefault.jpg`}
                            alt=""
                            width={80}
                            height={45}
                            unoptimized
                            className={styles.relatedThumb}
                          />
                        </div>
                        <span className={styles.relatedGuest}>{ep.guest}</span>
                        <span className={styles.relatedMeta}>{ep.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
        {/* Logo in bottom-right corner */}
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
      </div>
    </div>
  );
}
