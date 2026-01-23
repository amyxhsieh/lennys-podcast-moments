import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Parse timestamp string (HH:MM:SS) to seconds
 */
function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Extract transcript segments with timestamps
 */
function extractTranscriptSegments(content: string) {
  const segments: Array<{
    speaker: string;
    timestamp: string;
    timestampSeconds: number;
    text: string;
  }> = [];
  const lines = content.split('\n');

  // Skip frontmatter
  let inFrontmatter = true; // Start in frontmatter
  let currentSpeaker: string | null = null;
  let currentTimestamp: string | null = null;
  let currentText: string[] = [];

  for (const line of lines) {
    // Skip frontmatter - frontmatter is between two --- lines
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter; // Toggle: first --- enters frontmatter, second --- exits it
      continue;
    }
    // Skip lines while in frontmatter
    if (inFrontmatter) continue;

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    // Handle both Promise and direct params (Next.js 15+ uses Promise)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { slug } = resolvedParams;
    
    if (!slug) {
      return NextResponse.json(
        { error: 'Episode slug is required' },
        { status: 400 }
      );
    }
    
    const searchParams = request.nextUrl.searchParams;
    const startSeconds = searchParams.get('start');
    const endSeconds = searchParams.get('end');

    if (!startSeconds || !endSeconds) {
      return NextResponse.json(
        { error: 'start and end parameters required' },
        { status: 400 }
      );
    }

    const start = parseInt(startSeconds);
    const end = parseInt(endSeconds);

    if (isNaN(start) || isNaN(end)) {
      return NextResponse.json(
        { error: 'Invalid start or end time' },
        { status: 400 }
      );
    }

    // Add buffer time: 30 seconds before clip start, 15 seconds after clip end
    const BUFFER_BEFORE = 30;
    const BUFFER_AFTER = 15;
    const expandedStart = Math.max(0, start - BUFFER_BEFORE);
    const expandedEnd = end + BUFFER_AFTER;

    // Load transcript file
    // In Next.js API routes, process.cwd() is the webapp directory
    // We need to go up one level to reach the project root
    const projectRoot = path.resolve(process.cwd(), '..');
    const transcriptPath = path.join(
      projectRoot,
      'episodes',
      slug,
      'transcript.md'
    );

    console.log('Transcript API called:', {
      slug,
      start,
      end,
      cwd: process.cwd(),
      projectRoot,
      transcriptPath,
      exists: fs.existsSync(transcriptPath)
    });
    
    if (!fs.existsSync(transcriptPath)) {
      console.error('Transcript file not found:', transcriptPath);
      return NextResponse.json(
        { 
          error: 'Transcript file not found',
          details: {
            slug,
            path: transcriptPath,
            cwd: process.cwd(),
            projectRoot
          }
        },
        { status: 404 }
      );
    }

    let content: string;
    try {
      content = fs.readFileSync(transcriptPath, 'utf-8');
    } catch (readError) {
      console.error('Error reading transcript file:', readError);
      return NextResponse.json(
        { error: 'Failed to read transcript file', details: String(readError) },
        { status: 500 }
      );
    }

    let allSegments;
    try {
      allSegments = extractTranscriptSegments(content);
      console.log(`Extracted ${allSegments.length} segments from transcript`);
      
      // Debug: Show first and last few segments to verify extraction
      if (allSegments.length > 0) {
        console.log('First 3 segments:', allSegments.slice(0, 3).map(s => ({
          timestamp: s.timestamp,
          timestampSeconds: s.timestampSeconds,
          textLength: s.text.length
        })));
        console.log('Last 3 segments:', allSegments.slice(-3).map(s => ({
          timestamp: s.timestamp,
          timestampSeconds: s.timestampSeconds,
          textLength: s.text.length
        })));
      }
    } catch (parseError) {
      console.error('Error parsing transcript:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse transcript', details: String(parseError) },
        { status: 500 }
      );
    }

    // Filter segments that fall within the expanded clip time range (with buffer)
    // Transcript segments only have START timestamps (when speaker changes)
    // Segment END is implicitly the next segment's START time
    // We need to include segments that overlap the clip period, including:
    // - Segments that start before clip start but continue into the clip (their "end" is after clip start)
    // - Segments that start during the clip period
    // - Segments that start before clip end (even if they continue past it)
    const clipSegments = allSegments.filter((segment, index) => {
      const segmentStart = segment.timestampSeconds;
      const nextSegment = allSegments[index + 1];
      // Segment end is the next segment's start time (when speaker changes)
      // If no next segment, estimate end as start + 60 seconds
      const segmentEnd = nextSegment ? nextSegment.timestampSeconds : segmentStart + 60;
      
      // Include segment if it overlaps with the expanded range:
      // Segment overlaps if: segmentStart < expandedEnd AND segmentEnd > expandedStart
      // This ensures we get:
      // - Segments starting before clip but continuing into clip (segmentStart < expandedStart but segmentEnd > expandedStart)
      // - Segments starting during clip (segmentStart >= expandedStart and segmentStart <= expandedEnd)
      // - Segments starting before clip end but continuing past it (segmentStart < expandedEnd but segmentEnd > expandedEnd)
      const overlaps = segmentStart < expandedEnd && segmentEnd > expandedStart;
      
      // Debug: Log segments near the clip range to see why they're not matching
      if (Math.abs(segmentStart - start) < 60 || Math.abs(segmentStart - end) < 60) {
        console.log(`Segment near clip: ${segment.timestamp} (${segmentStart}s) - ${nextSegment?.timestamp || 'end'} (${segmentEnd}s), overlaps: ${overlaps}, expandedRange: ${expandedStart}-${expandedEnd}`);
      }
      
      return overlaps;
    });

    // Debug: Show sample segments around the clip range
    const sampleSegmentsAroundRange = allSegments
      .filter(s => Math.abs(s.timestampSeconds - start) < 300 || Math.abs(s.timestampSeconds - end) < 300)
      .slice(0, 10)
      .map(s => ({
        timestamp: s.timestamp,
        timestampSeconds: s.timestampSeconds,
        textPreview: s.text.substring(0, 50)
      }));

    console.log(`Transcript API results:`, {
      totalSegments: allSegments.length,
      clipRange: `${start}-${end} seconds (${Math.floor(start/60)}:${start%60} - ${Math.floor(end/60)}:${end%60})`,
      expandedRange: `${expandedStart}-${expandedEnd} seconds (${Math.floor(expandedStart/60)}:${expandedStart%60} - ${Math.floor(expandedEnd/60)}:${expandedEnd%60})`,
      segmentsInRange: clipSegments.length,
      firstSegmentTime: clipSegments[0]?.timestampSeconds,
      lastSegmentTime: clipSegments[clipSegments.length - 1]?.timestampSeconds,
      firstSegmentTimestamp: clipSegments[0]?.timestamp,
      lastSegmentTimestamp: clipSegments[clipSegments.length - 1]?.timestamp,
      totalTextLength: clipSegments.reduce((sum, s) => sum + s.text.length, 0),
      // Show segments near the clip range for debugging
      sampleSegmentsAroundRange,
      // Show first few segments if found
      firstFewSegments: clipSegments.slice(0, 5).map(s => ({
        timestamp: s.timestamp,
        timestampSeconds: s.timestampSeconds,
        textLength: s.text.length,
        textPreview: s.text.substring(0, 100)
      }))
    });
    
    // If no segments found, try a more inclusive approach
    let finalSegments = clipSegments;
    if (clipSegments.length === 0 && allSegments.length > 0) {
      console.warn('⚠️ No segments found with overlap detection. Trying inclusive fallback...');
      // Find segments within a wider range (up to 5 minutes before/after)
      const searchWindow = 300; // 5 minutes
      const closestBefore = allSegments.filter(s => 
        s.timestampSeconds < expandedStart && s.timestampSeconds >= expandedStart - searchWindow
      );
      const closestAfter = allSegments.filter(s => 
        s.timestampSeconds > expandedEnd && s.timestampSeconds <= expandedEnd + searchWindow
      );
      
      // Also try to find segments that might overlap if we expand the range more
      const widerStart = Math.max(0, expandedStart - 60); // 1 minute before
      const widerEnd = expandedEnd + 60; // 1 minute after
      const widerRangeSegments = allSegments.filter((s, idx) => {
        const segStart = s.timestampSeconds;
        const nextSeg = allSegments[idx + 1];
        const segEnd = nextSeg ? nextSeg.timestampSeconds : segStart + 60;
        // Use overlap detection, not just start time
        return segStart < widerEnd && segEnd > widerStart;
      });
      
      console.warn('⚠️ No segments found in exact range. Searching nearby segments:', {
        clipRange: `${start}-${end} seconds (${Math.floor(start/60)}:${start%60} - ${Math.floor(end/60)}:${end%60})`,
        expandedRange: `${expandedStart}-${expandedEnd} seconds`,
        totalSegments: allSegments.length,
        segmentsBefore: closestBefore.length,
        segmentsAfter: closestAfter.length,
        widerRangeSegments: widerRangeSegments.length,
        firstSegmentInFile: allSegments[0]?.timestamp,
        lastSegmentInFile: allSegments[allSegments.length - 1]?.timestamp,
        sampleBefore: closestBefore[0] ? {
          timestamp: closestBefore[0].timestamp,
          seconds: closestBefore[0].timestampSeconds,
          distance: expandedStart - closestBefore[0].timestampSeconds
        } : null,
        sampleAfter: closestAfter[0] ? {
          timestamp: closestAfter[0].timestamp,
          seconds: closestAfter[0].timestampSeconds,
          distance: closestAfter[0].timestampSeconds - expandedEnd
        } : null
      });
      
      // Use the wider range segments if available, otherwise use closest before/after
      if (widerRangeSegments.length > 0) {
        finalSegments = widerRangeSegments;
        console.log(`✅ Using ${widerRangeSegments.length} segments from wider range`);
      } else if (closestBefore.length > 0 || closestAfter.length > 0) {
        finalSegments = [...closestBefore, ...closestAfter];
        console.log(`✅ Using ${finalSegments.length} nearby segments as fallback`);
      } else {
        // Last resort: include all segments that start within 2 minutes of the clip range
        const veryWideRange = allSegments.filter(s => 
          s.timestampSeconds >= expandedStart - 120 && s.timestampSeconds <= expandedEnd + 120
        );
        if (veryWideRange.length > 0) {
          finalSegments = veryWideRange;
          console.log(`✅ Using ${veryWideRange.length} segments from very wide range (2 min buffer)`);
        }
      }
    }

    // Return segments with original clip boundaries for highlighting
    return NextResponse.json({
      segments: finalSegments,
      startSeconds: start, // Original clip start (without buffer)
      endSeconds: end, // Original clip end (without buffer)
      expandedStartSeconds: expandedStart, // Expanded start (with buffer)
      expandedEndSeconds: expandedEnd // Expanded end (with buffer)
    });
  } catch (error) {
    console.error('Transcript API error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch transcript',
        details: errorMessage,
        stack: errorStack
      },
      { status: 500 }
    );
  }
}
