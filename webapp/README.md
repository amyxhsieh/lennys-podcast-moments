# Lenny's Podcast Moments Web App

A searchable web application that helps users discover and explore meaningful moments from Lenny's Podcast (269 episodes).

## Features

- **Search Interface**: Search by keywords or full-text across all episodes
- **3D Carousel**: Browse search results in an interactive 3D carousel
- **Video Previews**: Hover over cards to see muted video previews (YouTube-style)
- **Clip Detail View**: Watch clips with synced transcripts
- **Smart Clip Extraction**: Automatically extracts relevant clips from episodes based on keywords

## Setup

### 1. Install Dependencies

```bash
cd webapp
npm install
```

### 2. Build Data Files

Before running the app, you need to generate the data files from your episode transcripts:

```bash
# From the project root
node scripts/build-data.js
```

This will:
- Parse all episode transcripts from `episodes/`
- Extract clips based on keywords from `index/`
- Generate JSON files in `webapp/public/data/`:
  - `episodes.json` - All episode metadata
  - `keywords.json` - Keyword index
  - `clips.json` - Auto-extracted clips
  - `stats.json` - Build statistics

### 3. Run Development Server

```bash
cd webapp
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
webapp/
├── app/
│   ├── api/              # API routes
│   │   ├── search/       # Search endpoint
│   │   └── episodes/     # Episode detail endpoint
│   ├── components/       # React components
│   │   ├── Carousel3D.tsx
│   │   ├── GuestCard.tsx
│   │   ├── SearchInput.tsx
│   │   ├── KeywordTags.tsx
│   │   └── TranscriptPanel.tsx
│   ├── episode/[slug]/   # Episode detail page
│   ├── styles/           # Design system
│   ├── utils/            # Utility functions
│   └── page.tsx          # Landing/search page
├── public/
│   └── data/             # Generated JSON data files
└── types/                # TypeScript definitions
```

## Design System

- **Colors**: White background (#FFFFFF), text (#222222), orange accents (#F7881D, #FFDFC8, #FFF4EA)
- **Typography**: 
  - Headings: Bricolage Grotesque (bold)
  - Body: SF Pro Display / system fonts
- **All text**: Sentence case

## Key Components

### Search Interface
- Centered logo and tagline
- Search input with debounced search
- Popular keyword tags

### 3D Carousel
- Horizontal scrollable carousel
- 3D perspective transforms
- Center card auto-focuses
- Mouse/touch drag support

### Guest Cards
- YouTube thumbnail
- Guest name and episode title
- Clip count badge
- Hover: Muted video preview with unmute button

### Clip Detail View
- YouTube embedded player
- Clip thumbnails (if multiple clips)
- Synced transcript panel
- Guest info sidebar
- Link to full episode

## API Endpoints

- `GET /api/search?q={query}` - Hybrid search (keyword + full-text)
- `GET /api/episodes/[slug]` - Get episode details

## Data Format

### Episodes JSON
```json
{
  "slug": "brian-chesky",
  "guest": "Brian Chesky",
  "title": "Brian Chesky's new playbook",
  "videoId": "4ef0juAMqoE",
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "publishDate": "2023-11-12",
  "duration": "1:13:28",
  "keywords": ["leadership", "product management"]
}
```

### Clips JSON
```json
{
  "ai": {
    "brian-chesky": [
      {
        "startSeconds": 300,
        "endSeconds": 600,
        "startTimestamp": "00:05:00",
        "endTimestamp": "00:10:00",
        "mentionCount": 5,
        "previewText": "..."
      }
    ]
  }
}
```

## Future Enhancements

- AI chat feature (placeholder included)
- Full transcript parsing for clip detail view
- User accounts and saved clips
- Video clip downloads
- Comments and discussions

## Notes

- YouTube autoplay policy: Videos start muted on hover (browser requirement)
- Clip extraction: Groups keyword mentions within 3-minute windows
- Max clips: Top 5 clips per episode per keyword (ranked by relevance)
