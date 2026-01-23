'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import TranscriptPanel from '@/app/components/TranscriptPanel';
import LogoSpark from '@/app/components/LogoSpark';
import { secondsToTimestamp } from '@/app/utils/timestamp';
import { formatDescription } from '@/app/utils/formatDescription';
import { generateClipsFromTranscript } from '@/app/utils/search';
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

export default function EpisodeDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const clipStartParam = searchParams.get('clip');
  const topicParam = searchParams.get('topic'); // Search query/keyword
  
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClip, setCurrentClip] = useState<Clip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showReadMore, setShowReadMore] = useState(false);
  const [clipNotification, setClipNotification] = useState<string | null>(null);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
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
          // Filter by specific topic/keyword
          const topicLower = topicParam.toLowerCase().trim();
          console.log('🔍 Searching for topic:', topicParam, 'in episode:', slug);
          
          // Find matching keywords (by name or slug)
          const matchingKeywords: string[] = [];
          for (const keywordData of keywordsArray) {
            const keywordName = (keywordData.name || '').toLowerCase();
            const keywordSlug = (keywordData.slug || '').toLowerCase();
            
            // Match if topic matches keyword name or slug
            const nameMatch = keywordName.includes(topicLower) || topicLower.includes(keywordName);
            const slugMatch = keywordSlug.includes(topicLower) || topicLower.includes(keywordSlug);
            
            if (nameMatch || slugMatch) {
              console.log('✅ Matched keyword:', keywordData.slug, 'name:', keywordData.name);
              matchingKeywords.push(keywordData.name.toLowerCase());
            }
          }
          
          console.log('📋 Found', matchingKeywords.length, 'matching keywords:', matchingKeywords);
          
          // Filter clips: find clips for this episode that match the topic keywords
          for (const clip of clipsArray) {
            // Check if clip is for this episode and matches one of the keywords
            if (clip.episodeSlug === slug) {
              const clipKeyword = (clip.keyword || '').toLowerCase();
              const matches = matchingKeywords.some(keyword => 
                clipKeyword.includes(keyword) || keyword.includes(clipKeyword)
              );
              
              if (matches) {
                // Convert clip format to our Clip interface
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
          
          // If no pre-generated clips found, try transcript search
          if (episodeClips.length === 0 && transcriptIndexData[slug]) {
            console.log('📝 No pre-generated clips found, searching transcript...');
            const generatedClips = generateClipsFromTranscript(topicParam, slug, transcriptIndexData);
            console.log('🎬 Generated', generatedClips.length, 'clips from transcript');
            
            for (const clip of generatedClips) {
              episodeClips.push({
                startSeconds: clip.startSeconds,
                endSeconds: clip.endSeconds,
                startTimestamp: clip.startTimestamp,
                endTimestamp: clip.endTimestamp,
                previewText: clip.previewText || ''
              });
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
    // Navigate back to search results with topic query preserved
    if (topicParam) {
      router.push(`/?q=${encodeURIComponent(topicParam)}`);
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
        </aside>
        {/* Logo in bottom-right corner */}
        <div 
          className={styles.bottomLogo}
          onMouseEnter={() => setIsLogoHovered(true)}
          onMouseLeave={() => setIsLogoHovered(false)}
        >
          <LogoSpark isHovered={isLogoHovered} />
          <Image
            src="/Lenny Podcast Logo.webp"
            alt="Lenny's Podcast"
            width={80}
            height={80}
            className={styles.brandLogo}
          />
        </div>
      </div>
    </div>
  );
}
