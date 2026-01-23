#!/usr/bin/env node

/**
 * Build data files from episodes and index markdown files
 * Outputs structured JSON for the webapp
 */

const fs = require('fs');
const path = require('path');

const EPISODES_DIR = path.join(__dirname, '..', 'episodes');
const INDEX_DIR = path.join(__dirname, '..', 'index');
const OUTPUT_DIR = path.join(__dirname, '..', 'webapp', 'public', 'data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Parse timestamp string (HH:MM:SS) to seconds
 */
function timestampToSeconds(timestamp) {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Extract frontmatter from markdown file
 */
function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = {};
  const lines = frontmatterMatch[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Handle array values (keywords)
    if (key === 'keywords' && value.startsWith('-')) {
      frontmatter[key] = [];
      continue;
    }

    if (key === 'keywords' && Array.isArray(frontmatter[key])) {
      const keyword = value.replace(/^- /, '').trim();
      if (keyword) frontmatter[key].push(keyword);
      continue;
    }

    // Handle numeric values
    if (value.includes('.')) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        frontmatter[key] = num;
        continue;
      }
    }

    frontmatter[key] = value;
  }

  return frontmatter;
}

/**
 * Extract transcript segments with timestamps
 */
function extractTranscriptSegments(content) {
  const segments = [];
  const lines = content.split('\n');

  // Skip frontmatter
  let inFrontmatter = true;
  let currentSpeaker = null;
  let currentTimestamp = null;
  let currentText = [];

  for (const line of lines) {
    // Skip frontmatter (between first and second ---)
    if (line.trim().startsWith('---')) {
      if (inFrontmatter) {
        inFrontmatter = false; // After first ---, we're past frontmatter
      }
      continue; // Skip the --- lines themselves
    }
    if (inFrontmatter) continue; // Skip lines before first ---

    // Skip headers
    if (line.startsWith('#') || line.trim() === '') continue;

    // Match timestamp pattern: "Speaker (HH:MM:SS):" or "(HH:MM:SS):"
    const timestampMatch = line.match(/^([^(]+)?\s*\((\d{1,2}:\d{2}:\d{2})\):/);
    if (timestampMatch) {
      // Save previous segment
      if (currentTimestamp !== null && currentText.length > 0) {
        segments.push({
          speaker: currentSpeaker || 'Unknown',
          timestamp: currentTimestamp,
          timestampSeconds: timestampToSeconds(currentTimestamp),
          text: currentText.join(' ').trim()
        });
      }

      currentSpeaker = timestampMatch[1]?.trim() || null;
      currentTimestamp = timestampMatch[2];
      currentText = [];
    } else if (currentTimestamp !== null) {
      // Continue current segment
      currentText.push(line.trim());
    }
  }

  // Add last segment
  if (currentTimestamp !== null && currentText.length > 0) {
    segments.push({
      speaker: currentSpeaker || 'Unknown',
      timestamp: currentTimestamp,
      timestampSeconds: timestampToSeconds(currentTimestamp),
      text: currentText.join(' ').trim()
    });
  }

  return segments;
}

/**
 * Find keyword mentions in transcript segments
 */
function findKeywordMentions(segments, keyword) {
  const keywordLower = keyword.toLowerCase();
  const mentions = [];

  for (const segment of segments) {
    const textLower = segment.text.toLowerCase();
    if (textLower.includes(keywordLower)) {
      mentions.push({
        timestamp: segment.timestamp,
        timestampSeconds: segment.timestampSeconds,
        text: segment.text,
        speaker: segment.speaker
      });
    }
  }

  return mentions;
}

/**
 * Group nearby mentions into clips (within 3-minute window)
 */
function groupMentionsIntoClips(mentions, minClipLength = 60, maxClipLength = 600) {
  if (mentions.length === 0) return [];

  const clips = [];
  let currentClip = {
    start: mentions[0].timestampSeconds,
    end: mentions[0].timestampSeconds,
    mentions: [mentions[0]]
  };

  for (let i = 1; i < mentions.length; i++) {
    const mention = mentions[i];
    const timeSinceLastMention = mention.timestampSeconds - currentClip.end;

    // If within 3 minutes (180 seconds), merge into current clip
    if (timeSinceLastMention <= 180) {
      currentClip.end = mention.timestampSeconds;
      currentClip.mentions.push(mention);
    } else {
      // Finalize current clip
      const clipLength = currentClip.end - currentClip.start;
      if (clipLength >= minClipLength && clipLength <= maxClipLength) {
        clips.push({
          startSeconds: currentClip.start,
          endSeconds: Math.min(currentClip.end + 60, currentClip.start + maxClipLength), // Add 1 min buffer
          startTimestamp: secondsToTimestamp(currentClip.start),
          endTimestamp: secondsToTimestamp(Math.min(currentClip.end + 60, currentClip.start + maxClipLength)),
          mentionCount: currentClip.mentions.length,
          previewText: currentClip.mentions[0].text.substring(0, 200)
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
  if (clipLength >= minClipLength && clipLength <= maxClipLength) {
    clips.push({
      startSeconds: currentClip.start,
      endSeconds: Math.min(currentClip.end + 60, currentClip.start + maxClipLength),
      startTimestamp: secondsToTimestamp(currentClip.start),
      endTimestamp: secondsToTimestamp(Math.min(currentClip.end + 60, currentClip.start + maxClipLength)),
      mentionCount: currentClip.mentions.length,
      previewText: currentClip.mentions[0].text.substring(0, 200)
    });
  }

  return clips;
}

/**
 * Extract related terms from keyword (for context analysis)
 */
function getRelatedTerms(keyword) {
  // Common related terms for better context matching
  const relatedTermsMap = {
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
  
  const keywordLower = keyword.toLowerCase();
  for (const [key, terms] of Object.entries(relatedTermsMap)) {
    if (keywordLower.includes(key) || key.includes(keywordLower)) {
      return terms;
    }
  }
  return [];
}

/**
 * Analyze content relevancy of a clip
 */
function analyzeContentRelevancy(clip, segments, keyword) {
  let relevancyScore = 0;
  
  // Get segments within this clip
  const clipSegments = segments.filter(seg => 
    seg.timestampSeconds >= clip.startSeconds && 
    seg.timestampSeconds <= clip.endSeconds
  );
  
  if (clipSegments.length === 0) return 0;
  
  // Combine all text in the clip
  const clipText = clipSegments.map(seg => seg.text || '').join(' ').toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  // 1. Count related terms (30% weight)
  const relatedTerms = getRelatedTerms(keyword);
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
  const uniqueSpeakers = new Set(clipSegments.map(seg => seg.speaker).filter(Boolean));
  const speakerScore = uniqueSpeakers.size > 1 ? 1.0 : 0.5;
  relevancyScore += speakerScore * 0.2;
  
  // 4. Position in episode (10% weight) - earlier clips slightly preferred
  // Normalize position: 0 = start, 1 = end
  const episodeLength = segments.length > 0 ? segments[segments.length - 1].timestampSeconds : 3600;
  const positionRatio = clip.startSeconds / Math.max(episodeLength, 1);
  const positionScore = 1.0 - (positionRatio * 0.3); // Slight preference for earlier (max 30% boost)
  relevancyScore += positionScore * 0.1;
  
  return Math.min(relevancyScore, 1.0); // Cap at 1.0
}

/**
 * Score clips by relevance (with content relevancy)
 */
function scoreClips(clips, segments, keyword) {
  return clips.map(clip => {
    const length = clip.endSeconds - clip.startSeconds;
    const density = clip.mentionCount / (length / 60); // mentions per minute

    // Length score: prefer clips between 3-8 minutes
    const lengthScore = length >= 180 && length <= 480 ? 1.0 : 
                       length < 180 ? length / 180 : 
                       Math.max(0, 1 - (length - 480) / 300);

    // Content relevancy score
    const relevancyScore = analyzeContentRelevancy(clip, segments, keyword);

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
 * Convert seconds to HH:MM:SS format
 */
function secondsToTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Build episodes data
 */
function buildEpisodesData() {
  const episodes = [];
  const episodeDirs = fs.readdirSync(EPISODES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const slug of episodeDirs) {
    const transcriptPath = path.join(EPISODES_DIR, slug, 'transcript.md');
    if (!fs.existsSync(transcriptPath)) continue;

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || !frontmatter.video_id) continue;

    const segments = extractTranscriptSegments(content);

    episodes.push({
      slug,
      guest: frontmatter.guest || 'Unknown',
      title: frontmatter.title || '',
      videoId: frontmatter.video_id,
      youtubeUrl: frontmatter.youtube_url || `https://www.youtube.com/watch?v=${frontmatter.video_id}`,
      publishDate: frontmatter.publish_date || '',
      description: frontmatter.description || '',
      duration: frontmatter.duration || '',
      durationSeconds: frontmatter.duration_seconds || 0,
      viewCount: frontmatter.view_count || 0,
      keywords: frontmatter.keywords || [],
      segmentCount: segments.length
    });
  }

  return episodes.sort((a, b) => {
    // Sort by publish date descending
    if (a.publishDate && b.publishDate) {
      return b.publishDate.localeCompare(a.publishDate);
    }
    return 0;
  });
}

/**
 * Build keywords index
 */
function buildKeywordsIndex() {
  const keywords = {};
  const keywordFiles = fs.readdirSync(INDEX_DIR)
    .filter(file => file.endsWith('.md') && file !== 'README.md' && file !== 'episodes.md');

  for (const file of keywordFiles) {
    const keywordSlug = path.basename(file, '.md');
    const content = fs.readFileSync(path.join(INDEX_DIR, file), 'utf-8');
    
    // Extract keyword name from first line (e.g., "# AI")
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const keywordName = titleMatch ? titleMatch[1].trim() : keywordSlug;

    // Extract episode links
    const episodeLinks = content.match(/\[([^\]]+)\]\(\.\.\/episodes\/([^\/]+)\/transcript\.md\)/g) || [];
    const episodes = episodeLinks.map(link => {
      const match = link.match(/\[([^\]]+)\]\(\.\.\/episodes\/([^\/]+)\/transcript\.md\)/);
      return {
        guest: match[1],
        slug: match[2]
      };
    });

    keywords[keywordSlug] = {
      name: keywordName,
      slug: keywordSlug,
      episodeCount: episodes.length,
      episodes: episodes
    };
  }

  return keywords;
}

/**
 * Build transcript search index - creates searchable segments for fallback search
 */
function buildTranscriptIndex(episodes) {
  const index = {};
  
  for (const episode of episodes) {
    const transcriptPath = path.join(EPISODES_DIR, episode.slug, 'transcript.md');
    if (!fs.existsSync(transcriptPath)) continue;

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const segments = extractTranscriptSegments(content);
    
    if (segments.length === 0) continue;
    
    // Store segments for this episode
    index[episode.slug] = segments.map(seg => ({
      text: seg.text.toLowerCase(),
      timestamp: seg.timestamp,
      timestampSeconds: seg.timestampSeconds,
      speaker: seg.speaker
    }));
  }
  
  return index;
}

/**
 * Build clips data - returns flat array of clips
 */
function buildClipsData(episodes, keywords) {
  const clipsArray = [];
  const MAX_CLIPS_PER_KEYWORD_PER_EPISODE = 5;

  let processedCount = 0;
  let clipsFoundCount = 0;
  
  for (const [keywordSlug, keywordData] of Object.entries(keywords)) {
    for (const episodeRef of keywordData.episodes) {
      processedCount++;
      const episode = episodes.find(e => e.slug === episodeRef.slug);
      if (!episode) {
        if (processedCount <= 5) console.log(`   Skipping: Episode not found for slug: ${episodeRef.slug}`);
        continue;
      }

      const transcriptPath = path.join(EPISODES_DIR, episode.slug, 'transcript.md');
      if (!fs.existsSync(transcriptPath)) {
        if (processedCount <= 5) console.log(`   Skipping: Transcript not found for: ${episode.slug}`);
        continue;
      }

      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const segments = extractTranscriptSegments(content);
      
      if (segments.length === 0) {
        if (processedCount <= 5) console.log(`   Skipping: No segments found for: ${episode.slug}`);
        continue;
      }
      
      // Find keyword mentions (case-insensitive)
      // Try multiple variations of the keyword
      const keywordVariations = [
        keywordData.name,
        keywordSlug.replace(/-/g, ' '),
        keywordSlug
      ];
      let mentions = [];
      for (const variation of keywordVariations) {
        mentions = findKeywordMentions(segments, variation);
        if (mentions.length > 0) break;
      }
      
      if (mentions.length === 0) {
        if (processedCount <= 5) console.log(`   No mentions found for keyword "${keywordData.name}" in episode ${episode.slug} (tried: ${keywordVariations.join(', ')})`);
        continue;
      }
      
      clipsFoundCount++;

      // Group into clips
      const rawClips = groupMentionsIntoClips(mentions);
      const scoredClips = scoreClips(rawClips, segments, keywordData.name);
      
      // Take top N clips
      const topClips = scoredClips.slice(0, MAX_CLIPS_PER_KEYWORD_PER_EPISODE);

      // Add each clip to the array
      for (const clip of topClips) {
        clipsArray.push({
          ...clip,
          episodeSlug: episode.slug,
          keyword: keywordData.name,
          keywordSlug: keywordSlug,
          guest: episode.guest,
          videoId: episode.videoId
        });
      }
    }
  }

  return clipsArray;
}

/**
 * Main build function
 */
function main() {
  console.log('Building data files...\n');

  console.log('1. Building episodes data...');
  const episodes = buildEpisodesData();
  console.log(`   Found ${episodes.length} episodes`);

  console.log('2. Building keywords index...');
  const keywords = buildKeywordsIndex();
  console.log(`   Found ${Object.keys(keywords).length} keywords`);

  console.log('3. Building transcript search index...');
  const transcriptIndex = buildTranscriptIndex(episodes);
  console.log(`   Indexed ${Object.keys(transcriptIndex).length} episodes`);

  console.log('4. Building clips data (this may take a while)...');
  const clips = buildClipsData(episodes, keywords);
  console.log(`   Done - Generated ${clips.length} clips`);

  console.log('\n5. Writing JSON files...');
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'episodes.json'),
    JSON.stringify(episodes, null, 2)
  );
  console.log('   ✓ episodes.json');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'keywords.json'),
    JSON.stringify(keywords, null, 2)
  );
  console.log('   ✓ keywords.json');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'clips.json'),
    JSON.stringify(clips, null, 2)
  );
  console.log('   ✓ clips.json');

  // Write transcript index (compressed format for faster loading)
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'transcript-index.json'),
    JSON.stringify(transcriptIndex, null, 2)
  );
  console.log('   ✓ transcript-index.json');

  // Build summary stats
  const stats = {
    totalEpisodes: episodes.length,
    totalKeywords: Object.keys(keywords).length,
    totalClips: clips.length,
    buildDate: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'stats.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log('   ✓ stats.json');

  console.log('\n✅ Build complete!');
  console.log(`   ${stats.totalEpisodes} episodes`);
  console.log(`   ${stats.totalKeywords} keywords`);
  console.log(`   ${stats.totalClips} clips`);
}

if (require.main === module) {
  main();
}

module.exports = { buildEpisodesData, buildKeywordsIndex, buildClipsData };
