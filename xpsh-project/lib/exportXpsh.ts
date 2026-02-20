/**
 * Export XPSH
 * Functions để export XPSH score thành file JSON
 */

import { XPSHScore } from '@/lib/xpsh_helpers';

// ============================================================================
// Export to JSON
// ============================================================================

/**
 * Export XPSH score thành JSON string
 * 
 * @param score - XPSH score
 * @param pretty - Format JSON với indent (default: true)
 * @returns JSON string
 */
export function scoreToJson(score: XPSHScore, pretty: boolean = true): string {
  if (pretty) {
    return JSON.stringify(score, null, 2);
  }
  return JSON.stringify(score);
}

// ============================================================================
// Download File
// ============================================================================

/**
 * Download XPSH score dưới dạng file .xpsh
 * 
 * @param score - XPSH score
 * @param filename - Tên file (không cần extension)
 */
export function downloadXpsh(score: XPSHScore, filename?: string): void {
  // Tạo filename từ title nếu không được provide
  const defaultFilename = sanitizeFilename(score.metadata.title || 'untitled');
  const finalFilename = filename || defaultFilename;

  // Convert score to JSON
  const json = scoreToJson(score, true);

  // Tạo blob
  const blob = new Blob([json], { type: 'application/json' });

  // Tạo URL
  const url = URL.createObjectURL(blob);

  // Tạo link element
  const link = document.createElement('a');
  link.href = url;
  link.download = `${finalFilename}.xpsh`;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Import from JSON
// ============================================================================

/**
 * Parse JSON string thành XPSH score
 * 
 * @param json - JSON string
 * @returns XPSH score
 * @throws Error nếu JSON invalid
 */
export function jsonToScore(json: string): XPSHScore {
  try {
    const score = JSON.parse(json) as XPSHScore;
    
    // Basic validation
    if (!score.format_version) {
      throw new Error('Missing format_version');
    }
    if (!score.metadata) {
      throw new Error('Missing metadata');
    }
    if (!score.timing) {
      throw new Error('Missing timing');
    }
    if (!score.tracks) {
      throw new Error('Missing tracks');
    }

    return score;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse XPSH: ${error.message}`);
    }
    throw new Error('Failed to parse XPSH: Unknown error');
  }
}

// ============================================================================
// Load from File
// ============================================================================

/**
 * Load XPSH score từ File object
 * 
 * @param file - File object
 * @returns Promise<XPSHScore>
 */
export async function loadXpshFile(file: File): Promise<XPSHScore> {
  // Check file extension
  if (!file.name.endsWith('.xpsh') && !file.name.endsWith('.json')) {
    throw new Error('Invalid file type. Expected .xpsh or .json');
  }

  // Read file content
  const text = await file.text();

  // Parse JSON
  return jsonToScore(text);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sanitize filename (remove invalid characters)
 * 
 * @param filename - Raw filename
 * @returns Sanitized filename
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_\-]/gi, '_')  // Replace invalid chars with underscore
    .replace(/_+/g, '_')              // Collapse multiple underscores
    .replace(/^_|_$/g, '')            // Remove leading/trailing underscores
    .toLowerCase()
    .substring(0, 50);                // Limit length
}

// ============================================================================
// Copy to Clipboard
// ============================================================================

/**
 * Copy XPSH score JSON to clipboard
 * 
 * @param score - XPSH score
 * @returns Promise<void>
 */
export async function copyToClipboard(score: XPSHScore): Promise<void> {
  const json = scoreToJson(score, true);
  
  try {
    await navigator.clipboard.writeText(json);
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = json;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

// ============================================================================
// Create Empty Score
// ============================================================================

/**
 * Tạo XPSH score rỗng (v1.1 – events[])
 */
export function createEmptyScore(title: string = 'Untitled'): XPSHScore {
  const now = new Date().toISOString();

  return {
    format: 'xpsh',
    format_version: '1.1.0',
    metadata: {
      title,
      composer: '',
      arranger: '',
      copyright: '',
      created_at: now,
      modified_at: now
    },
    timing: {
      ticks_per_quarter: 480,
      tempo_bpm: 120,
      time_signature: {
        numerator: 4,
        denominator: 4
      }
    },
    tracks: [
      {
        id: 'track_rh',
        name: 'RH',
        type: 'piano',
        clef: 'treble',
        events: []
      },
      {
        id: 'track_lh',
        name: 'LH',
        type: 'piano',
        clef: 'bass',
        events: []
      }
    ]
  };
}

// ============================================================================
// Update Metadata
// ============================================================================

/**
 * Update score metadata (title, composer, etc.)
 * 
 * @param score - XPSH score
 * @param metadata - Metadata updates
 * @returns Updated score
 */
export function updateMetadata(
  score: XPSHScore,
  metadata: Partial<XPSHScore['metadata']>
): XPSHScore {
  return {
    ...score,
    metadata: {
      ...score.metadata,
      ...metadata,
      modified_at: new Date().toISOString()
    }
  };
}

// ============================================================================
// Update Tempo
// ============================================================================

/**
 * Update tempo của score
 * 
 * @param score - XPSH score
 * @param tempoBpm - Tempo mới (BPM)
 * @returns Updated score
 */
export function updateTempo(score: XPSHScore, tempoBpm: number): XPSHScore {
  if (tempoBpm < 40 || tempoBpm > 240) {
    console.warn(`Tempo ${tempoBpm} out of range [40, 240]`);
    return score;
  }

  return {
    ...score,
    timing: {
      ...score.timing,
      tempo_bpm: tempoBpm
    }
  };
}

// ============================================================================
// File Size Estimation
// ============================================================================

/**
 * Estimate file size (bytes)
 * 
 * @param score - XPSH score
 * @returns Estimated size in bytes
 */
export function estimateFileSize(score: XPSHScore): number {
  const json = scoreToJson(score, false);
  return new Blob([json]).size;
}

/**
 * Format file size for display
 * 
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.2 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
