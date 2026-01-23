/**
 * Search utilities for hybrid keyword + full-text search
 */

export interface SearchResult {
  episodeSlug: string;
  guest: string;
  title: string;
  videoId: string;
  score: number;
  matchType: 'keyword' | 'fulltext' | 'hybrid' | 'transcript';
  matchedKeywords?: string[];
}

/**
 * Fuzzy keyword matching
 */
export function fuzzyMatch(query: string, keyword: string): boolean {
  const queryLower = query.toLowerCase().trim();
  const keywordLower = keyword.toLowerCase().trim();
  
  // Exact match
  if (keywordLower === queryLower) return true;
  
  // Contains match
  if (keywordLower.includes(queryLower) || queryLower.includes(keywordLower)) return true;
  
  // Word boundary match
  const words = keywordLower.split(/[\s-]+/);
  return words.some(word => word.startsWith(queryLower) || queryLower.startsWith(word));
}

/**
 * Score full-text match
 */
export function scoreFullTextMatch(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact phrase match
  if (textLower.includes(queryLower)) {
    return 1.0;
  }
  
  // Word matches
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  const textWords = textLower.split(/\s+/);
  
  let matches = 0;
  for (const queryWord of queryWords) {
    if (textWords.some(tw => tw.includes(queryWord) || queryWord.includes(tw))) {
      matches++;
    }
  }
  
  return matches / queryWords.length;
}

/**
 * Search episodes by keyword
 */
export function searchByKeyword(
  query: string,
  keywords: Record<string, any>,
  episodes: any[]
): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  
  // Find matching keywords
  const matchingKeywords: string[] = [];
  for (const [keywordSlug, keywordData] of Object.entries(keywords)) {
    if (fuzzyMatch(query, keywordData.name) || fuzzyMatch(query, keywordSlug)) {
      matchingKeywords.push(keywordSlug);
    }
  }
  
  if (matchingKeywords.length === 0) return results;
  
  // Get episodes for matching keywords
  const episodeMap = new Map<string, SearchResult>();
  
  for (const keywordSlug of matchingKeywords) {
    const keywordData = keywords[keywordSlug];
    for (const episodeRef of keywordData.episodes) {
      const episode = episodes.find(e => e.slug === episodeRef.slug);
      if (!episode) continue;
      
      const existing = episodeMap.get(episode.slug);
      if (existing) {
        existing.score += 1.0;
        existing.matchedKeywords = [...(existing.matchedKeywords || []), keywordData.name];
      } else {
        episodeMap.set(episode.slug, {
          episodeSlug: episode.slug,
          guest: episode.guest,
          title: episode.title,
          videoId: episode.videoId,
          score: 1.0,
          matchType: 'keyword',
          matchedKeywords: [keywordData.name]
        });
      }
    }
  }
  
  return Array.from(episodeMap.values());
}

/**
 * Search episodes by full-text
 */
export function searchByFullText(
  query: string,
  episodes: any[],
  transcripts?: Record<string, string>
): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  
  for (const episode of episodes) {
    // Search in title
    const titleScore = scoreFullTextMatch(query, episode.title);
    
    // Search in guest name
    const guestScore = scoreFullTextMatch(query, episode.guest);
    
    // Search in description
    const descScore = scoreFullTextMatch(query, episode.description || '');
    
    // Search in keywords array
    const keywordScore = episode.keywords?.some((k: string) => 
      k.toLowerCase().includes(queryLower)
    ) ? 0.3 : 0;
    
    const totalScore = titleScore * 0.4 + guestScore * 0.3 + descScore * 0.2 + keywordScore * 0.1;
    
    if (totalScore > 0.1) {
      results.push({
        episodeSlug: episode.slug,
        guest: episode.guest,
        title: episode.title,
        videoId: episode.videoId,
        score: totalScore,
        matchType: 'fulltext'
      });
    }
  }
  
  return results;
}

/**
 * Search episodes by transcript content (fallback when no keyword matches)
 */
export function searchByTranscript(
  query: string,
  episodes: any[],
  transcriptIndex: Record<string, any[]>
): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  if (queryWords.length === 0) return results;
  
  for (const episode of episodes) {
    const segments = transcriptIndex[episode.slug];
    if (!segments || segments.length === 0) continue;
    
    // Find segments containing the query
    let matchCount = 0;
    let firstMatchTime = 0;
    
    for (const segment of segments) {
      const text = segment.text || '';
      // Check if all query words appear in this segment
      const allWordsMatch = queryWords.every(word => text.includes(word));
      if (allWordsMatch) {
        matchCount++;
        if (firstMatchTime === 0) {
          firstMatchTime = segment.timestampSeconds;
        }
      }
    }
    
    // Score based on match frequency and position
    if (matchCount > 0) {
      const density = matchCount / segments.length;
      const positionScore = firstMatchTime < 1800 ? 1.0 : 0.7; // Prefer early mentions
      const score = density * 0.6 + positionScore * 0.4;
      
      results.push({
        episodeSlug: episode.slug,
        guest: episode.guest,
        title: episode.title,
        videoId: episode.videoId,
        score: score * 0.8, // Slightly lower than keyword matches
        matchType: 'fulltext'
      });
    }
  }
  
  return results;
}

/**
 * Generate clips from transcript matches for a query
 */
export function generateClipsFromTranscript(
  query: string,
  episodeSlug: string,
  transcriptIndex: Record<string, any[]>
): any[] {
  const segments = transcriptIndex[episodeSlug];
  if (!segments || segments.length === 0) return [];
  
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  // Find matching segments
  const mentions: any[] = [];
  for (const segment of segments) {
    const text = segment.text || '';
    // Check if query appears in segment
    if (text.includes(queryLower) || queryWords.every(word => text.includes(word))) {
      mentions.push({
        timestamp: segment.timestamp,
        timestampSeconds: segment.timestampSeconds,
        text: segment.text,
        speaker: segment.speaker
      });
    }
  }
  
  if (mentions.length === 0) return [];
  
  // Group mentions into clips (similar to build-data.js logic)
  const clips: any[] = [];
  let currentClip = {
    start: mentions[0].timestampSeconds,
    end: mentions[0].timestampSeconds,
    mentions: [mentions[0]]
  };
  
  for (let i = 1; i < mentions.length; i++) {
    const mention = mentions[i];
    const timeSinceLastMention = mention.timestampSeconds - currentClip.end;
    
    // If within 3 minutes, merge into current clip
    if (timeSinceLastMention <= 180) {
      currentClip.end = mention.timestampSeconds;
      currentClip.mentions.push(mention);
    } else {
      // Finalize current clip
      const clipLength = currentClip.end - currentClip.start;
      if (clipLength >= 60 && clipLength <= 600) {
        clips.push({
          startSeconds: currentClip.start,
          endSeconds: Math.min(currentClip.end + 60, currentClip.start + 600),
          startTimestamp: formatTimestamp(currentClip.start),
          endTimestamp: formatTimestamp(Math.min(currentClip.end + 60, currentClip.start + 600)),
          mentionCount: currentClip.mentions.length,
          previewText: currentClip.mentions[0].text.substring(0, 200),
          keyword: query,
          episodeSlug: episodeSlug
        });
      }
      
      // Start new clip
      currentClip = {
        start: mention.timestampSeconds,
        end: mention.timestampSeconds,
        mentions: [mention]
      };
    }
  }
  
  // Add final clip
  const clipLength = currentClip.end - currentClip.start;
  if (clipLength >= 60 && clipLength <= 600) {
    clips.push({
      startSeconds: currentClip.start,
      endSeconds: Math.min(currentClip.end + 60, currentClip.start + 600),
      startTimestamp: formatTimestamp(currentClip.start),
      endTimestamp: formatTimestamp(Math.min(currentClip.end + 60, currentClip.start + 600)),
      mentionCount: currentClip.mentions.length,
      previewText: currentClip.mentions[0].text.substring(0, 200),
      keyword: query,
      episodeSlug: episodeSlug
    });
  }
  
  // Score clips with content relevancy heuristics
  return scoreClipsWithRelevancy(clips, segments, query).slice(0, 5); // Top 5 clips
}

/**
 * Extract related terms from query (for context analysis)
 */
function getRelatedTerms(query: string): string[] {
  const queryLower = query.toLowerCase();
  const relatedTermsMap: Record<string, string[]> = {
    'product management': ['strategy', 'roadmap', 'prioritization', 'feature', 'user', 'customer', 'launch'],
    'product strategy': ['roadmap', 'vision', 'goals', 'planning', 'execution', 'metrics'],
    'growth': ['acquisition', 'retention', 'metrics', 'experiment', 'funnel', 'conversion'],
    'leadership': ['team', 'management', 'culture', 'vision', 'decision', 'strategy'],
    'ai': ['machine learning', 'model', 'algorithm', 'data', 'training', 'neural'],
    'startup': ['founder', 'funding', 'venture', 'scale', 'growth', 'product'],
    'design': ['user experience', 'interface', 'usability', 'prototype', 'research'],
    'engineering': ['code', 'development', 'architecture', 'system', 'scalability', 'performance'],
    'marketing': ['campaign', 'brand', 'advertising', 'content', 'social', 'audience'],
    'sales': ['customer', 'revenue', 'pipeline', 'deal', 'negotiation', 'close']
  };
  
  for (const [key, terms] of Object.entries(relatedTermsMap)) {
    if (queryLower.includes(key) || key.includes(queryLower)) {
      return terms;
    }
  }
  return [];
}

/**
 * Analyze content relevancy of a clip
 */
function analyzeContentRelevancy(
  clip: any,
  segments: any[],
  query: string
): number {
  let relevancyScore = 0;
  
  // Get segments within this clip
  const clipSegments = segments.filter((seg: any) => 
    seg.timestampSeconds >= clip.startSeconds && 
    seg.timestampSeconds <= clip.endSeconds
  );
  
  if (clipSegments.length === 0) return 0;
  
  // Combine all text in the clip
  const clipText = clipSegments.map((seg: any) => seg.text || '').join(' ').toLowerCase();
  const queryLower = query.toLowerCase();
  
  // 1. Count related terms (30% weight)
  const relatedTerms = getRelatedTerms(query);
  let relatedTermCount = 0;
  for (const term of relatedTerms) {
    if (clipText.includes(term)) {
      relatedTermCount++;
    }
  }
  const relatedTermScore = Math.min(relatedTermCount / Math.max(relatedTerms.length, 1), 1.0);
  relevancyScore += relatedTermScore * 0.3;
  
  // 2. Check for discussion patterns (40% weight)
  // Questions indicate active discussion
  const questionWords = ['how', 'why', 'what', 'when', 'where', 'who', 'which'];
  const questionCount = questionWords.reduce((count, word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    return count + (clipText.match(regex) || []).length;
  }, 0);
  const questionScore = Math.min(questionCount / 10, 1.0); // Normalize to max 1.0
  
  // Explanation indicators
  const explanationPhrases = ['because', 'since', 'due to', 'as a result', 'therefore', 'so', 'means', 'explain'];
  const explanationCount = explanationPhrases.reduce((count, phrase) => {
    const regex = new RegExp(phrase, 'gi');
    return count + (clipText.match(regex) || []).length;
  }, 0);
  const explanationScore = Math.min(explanationCount / 5, 1.0);
  
  const discussionScore = (questionScore * 0.6 + explanationScore * 0.4);
  relevancyScore += discussionScore * 0.4;
  
  // 3. Multiple speakers (20% weight)
  const uniqueSpeakers = new Set(clipSegments.map((seg: any) => seg.speaker).filter(Boolean));
  const speakerScore = uniqueSpeakers.size > 1 ? 1.0 : 0.5;
  relevancyScore += speakerScore * 0.2;
  
  // 4. Position in episode (10% weight) - earlier clips slightly preferred
  const episodeLength = segments.length > 0 ? segments[segments.length - 1].timestampSeconds : 3600;
  const positionRatio = clip.startSeconds / Math.max(episodeLength, 1);
  const positionScore = 1.0 - (positionRatio * 0.3); // Slight preference for earlier (max 30% boost)
  relevancyScore += positionScore * 0.1;
  
  return Math.min(relevancyScore, 1.0); // Cap at 1.0
}

/**
 * Score clips with content relevancy heuristics
 */
function scoreClipsWithRelevancy(
  clips: any[],
  segments: any[],
  query: string
): any[] {
  return clips.map(clip => {
    const length = clip.endSeconds - clip.startSeconds;
    const density = clip.mentionCount / (length / 60); // mentions per minute

    // Length score: prefer clips between 3-8 minutes
    const lengthScore = length >= 180 && length <= 480 ? 1.0 : 
                       length < 180 ? length / 180 : 
                       Math.max(0, 1 - (length - 480) / 300);

    // Content relevancy score
    const relevancyScore = analyzeContentRelevancy(clip, segments, query);

    // Combined score: density (40%) + length (30%) + relevancy (30%)
    const score = (density * 0.4) + (lengthScore * 0.3) + (relevancyScore * 0.3);

    return {
      ...clip,
      score,
      relevancyScore // Store for debugging
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Format seconds to HH:MM:SS
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hybrid search combining keyword, full-text, and transcript search
 */
export function hybridSearch(
  query: string,
  keywords: Record<string, any>,
  episodes: any[],
  transcriptIndex?: Record<string, any[]>
): SearchResult[] {
  const keywordResults = searchByKeyword(query, keywords, episodes);
  const fullTextResults = searchByFullText(query, episodes);
  
  // Merge results
  const resultMap = new Map<string, SearchResult>();
  
  // Add keyword results (highest weight)
  for (const result of keywordResults) {
    result.score *= 2.0; // Boost keyword matches
    result.matchType = 'hybrid';
    resultMap.set(result.episodeSlug, result);
  }
  
  // Merge full-text results
  for (const result of fullTextResults) {
    const existing = resultMap.get(result.episodeSlug);
    if (existing) {
      existing.score += result.score;
      existing.matchType = 'hybrid';
    } else {
      resultMap.set(result.episodeSlug, result);
    }
  }
  
  // If no keyword matches and transcript index available, search transcripts
  if (keywordResults.length === 0 && transcriptIndex) {
    const transcriptResults = searchByTranscript(query, episodes, transcriptIndex);
    for (const result of transcriptResults) {
      const existing = resultMap.get(result.episodeSlug);
      if (existing) {
        existing.score += result.score * 0.5; // Lower weight for transcript-only matches
        existing.matchType = 'hybrid';
      } else {
        result.matchType = 'transcript';
        resultMap.set(result.episodeSlug, result);
      }
    }
  }
  
  // Sort by score descending
  return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
}
