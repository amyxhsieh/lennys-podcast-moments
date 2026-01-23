'use client';

import styles from './KeywordTags.module.css';

interface Keyword {
  slug: string;
  name: string;
  episodeCount: number;
}

interface Episode {
  slug: string;
  keywords?: string[];
  viewCount?: number;
}

interface KeywordTagsProps {
  keywords: Keyword[];
  episodes: Episode[];
  onKeywordClick: (keyword: string) => void;
  maxDisplay?: number;
}

export default function KeywordTags({ 
  keywords, 
  episodes,
  onKeywordClick,
  maxDisplay = 5 
}: KeywordTagsProps) {
  // Calculate popularity score combining episode count and total views
  const keywordsWithScore = keywords.map(keyword => {
    // Find all episodes that contain this keyword
    const keywordEpisodes = episodes.filter(episode => 
      episode.keywords?.some(k => 
        k.toLowerCase() === keyword.name.toLowerCase() ||
        k.toLowerCase() === keyword.slug.toLowerCase()
      )
    );
    
    // Calculate total views for this keyword
    const totalViews = keywordEpisodes.reduce((sum, ep) => sum + (ep.viewCount || 0), 0);
    
    // Combined score: episode count weighted by average views
    // Using a formula that balances both factors
    const avgViews = keywordEpisodes.length > 0 ? totalViews / keywordEpisodes.length : 0;
    const popularityScore = keyword.episodeCount * (1 + Math.log10(Math.max(avgViews, 1) / 1000 + 1));
    
    return {
      ...keyword,
      totalViews,
      popularityScore
    };
  });
  
  // Sort by popularity score and take top N
  const topKeywords = keywordsWithScore
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, maxDisplay);

  return (
    <div className={styles.keywordTags}>
      {topKeywords.map((keyword) => (
        <button
          key={keyword.slug}
          onClick={() => onKeywordClick(keyword.name)}
          className={styles.keywordTag}
        >
          <span className={styles.keywordName}>{keyword.name}</span>
        </button>
      ))}
    </div>
  );
}
