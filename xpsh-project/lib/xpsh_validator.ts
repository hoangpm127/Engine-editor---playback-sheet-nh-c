/**
 * XPSH Validator
 * Validates XPSH format và safe parsing cho files
 */

import { XPSHScore, XPSHNote, XPSHTrack, XPSHEvent, AccidentalType } from './xpsh_helpers';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

const VALID_FORMAT = 'xpsh';
const VALID_FORMAT_VERSIONS = ['1.0.0', '1.1.0'];
const VALID_ACCIDENTALS: AccidentalType[] = ['none', 'sharp', 'flat', 'natural', 'doubleSharp', 'doubleFlat'];
const VALID_EVENT_TYPES = ['chord', 'rest', 'pedal'];
const REQUIRED_TICKS_PER_QUARTER = 480;
const MIN_TEMPO_BPM = 1;
const MAX_TEMPO_BPM = 400;
const REQUIRED_TIME_SIGNATURE = [4, 4] as const;
const REQUIRED_TRACK_IDS = ['track_rh', 'track_lh'] as const;
const MIN_PITCH = 21;  // A0
const MAX_PITCH = 108; // C8
const MIN_VELOCITY = 1;
const MAX_VELOCITY = 127;
const TICKS_PER_MEASURE = 1920; // 4 beats * 480 ticks
const MAX_MEASURES = 8;
const MAX_TICKS = MAX_MEASURES * TICKS_PER_MEASURE; // 15360

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate XPSH score toàn diện
 * 
 * @param score - Unknown data để validate
 * @returns ValidationResult với errors và warnings
 */
export function validateXpsh(score: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if score is object
  if (!score || typeof score !== 'object') {
    errors.push('Score must be an object');
    return { valid: false, errors, warnings };
  }

  const s = score as Record<string, any>;

  // ========================================================================
  // 1. Format & Version Validation
  // ========================================================================

  if (s.format !== VALID_FORMAT) {
    errors.push(`Invalid format: expected "${VALID_FORMAT}", got "${s.format}"`);
  }

  if (!VALID_FORMAT_VERSIONS.includes(s.format_version)) {
    errors.push(`Invalid format_version: expected one of ${VALID_FORMAT_VERSIONS.join(', ')}, got "${s.format_version}"`);
  }
  const isV11 = s.format_version === '1.1.0';

  // ========================================================================
  // 2. Timing Validation
  // ========================================================================

  if (!s.timing || typeof s.timing !== 'object') {
    errors.push('Missing or invalid timing object');
    return { valid: false, errors, warnings };
  }

  const timing = s.timing;

  // Ticks per quarter
  if (timing.ticks_per_quarter !== REQUIRED_TICKS_PER_QUARTER) {
    errors.push(`Invalid ticks_per_quarter: expected ${REQUIRED_TICKS_PER_QUARTER}, got ${timing.ticks_per_quarter}`);
  }

  // Tempo
  if (typeof timing.tempo_bpm !== 'number') {
    errors.push('tempo_bpm must be a number');
  } else if (timing.tempo_bpm <= MIN_TEMPO_BPM || timing.tempo_bpm >= MAX_TEMPO_BPM) {
    errors.push(`tempo_bpm must be between ${MIN_TEMPO_BPM} and ${MAX_TEMPO_BPM}, got ${timing.tempo_bpm}`);
  }

  // Time signature
  if (!timing.time_signature || typeof timing.time_signature !== 'object') {
    errors.push('Missing or invalid time_signature');
  } else {
    const ts = timing.time_signature;
    if (ts.numerator !== REQUIRED_TIME_SIGNATURE[0] || ts.denominator !== REQUIRED_TIME_SIGNATURE[1]) {
      errors.push(`Invalid time_signature: expected ${REQUIRED_TIME_SIGNATURE[0]}/${REQUIRED_TIME_SIGNATURE[1]}, got ${ts.numerator}/${ts.denominator}`);
    }
  }

  // ========================================================================
  // 3. Metadata Validation (warnings only)
  // ========================================================================

  if (!s.metadata || typeof s.metadata !== 'object') {
    warnings.push('Missing metadata object');
  } else {
    if (!s.metadata.title || typeof s.metadata.title !== 'string') {
      warnings.push('Missing or invalid title in metadata');
    }
  }

  // ========================================================================
  // 4. Tracks Validation
  // ========================================================================

  if (!Array.isArray(s.tracks)) {
    errors.push('tracks must be an array');
    return { valid: false, errors, warnings };
  }

  // Check required tracks exist
  const trackIds = s.tracks.map((t: any) => t?.id).filter(Boolean);
  const missingTracks = REQUIRED_TRACK_IDS.filter(id => !trackIds.includes(id));
  
  if (missingTracks.length > 0) {
    errors.push(`Missing required tracks: ${missingTracks.join(', ')}`);
  }

  // Check for duplicate track IDs
  const duplicateTrackIds = trackIds.filter(
    (id: string, index: number) => trackIds.indexOf(id) !== index
  );
  if (duplicateTrackIds.length > 0) {
    errors.push(`Duplicate track IDs: ${duplicateTrackIds.join(', ')}`);
  }

  // ========================================================================
  // 5. Notes / Events Validation
  // ========================================================================

  const allNoteIds = new Set<string>();
  const duplicateNoteIds: string[] = [];

  s.tracks.forEach((track: any, trackIndex: number) => {
    const trackId = track?.id || `track_${trackIndex}`;

    // ---- v1.1 events[] ----
    if (isV11) {
      if (!track.events || !Array.isArray(track.events)) {
        errors.push(`Track "${trackId}" (v1.1): events must be an array`);
        return;
      }

      // Collect all event IDs in this track for tie validation
      const trackEventIds = new Set<string>(track.events.map((e: any) => e?.id).filter(Boolean));

      // Check tuplet group consistency
      const tupletGroups: Record<string, { actual: number; normal: number }> = {};

      track.events.forEach((ev: any, evIndex: number) => {
        const label = `Track "${trackId}", Event ${evIndex}(${ev?.id ?? '?'})`;

        // ID
        if (!ev.id || typeof ev.id !== 'string') {
          errors.push(`${label}: missing or invalid id`);
        } else {
          if (allNoteIds.has(ev.id)) duplicateNoteIds.push(ev.id);
          else allNoteIds.add(ev.id);
        }

        // type
        if (!VALID_EVENT_TYPES.includes(ev.type)) {
          errors.push(`${label}: type must be one of ${VALID_EVENT_TYPES.join('/')}, got "${ev.type}"`);
        }

        // voice
        if (ev.voice !== 1 && ev.voice !== 2) {
          errors.push(`${label}: voice must be 1 or 2, got ${ev.voice}`);
        }

        // start_tick
        if (typeof ev.start_tick !== 'number' || !Number.isInteger(ev.start_tick) || ev.start_tick < 0) {
          errors.push(`${label}: start_tick must be a non-negative integer`);
        } else if (ev.start_tick >= MAX_TICKS) {
          errors.push(`${label}: start_tick ${ev.start_tick} >= max ${MAX_TICKS}`);
        }

        // dur_tick
        if (typeof ev.dur_tick !== 'number' || !Number.isInteger(ev.dur_tick) || ev.dur_tick <= 0) {
          errors.push(`${label}: dur_tick must be a positive integer`);
        }

        // type-specific checks
        if (ev.type === 'chord') {
          if (!Array.isArray(ev.pitches) || ev.pitches.length === 0) {
            errors.push(`${label}: chord event must have at least one pitch in pitches[]`);
          } else {
            ev.pitches.forEach((p: any, pi: number) => {
              if (typeof p !== 'number' || !Number.isInteger(p) || p < MIN_PITCH || p > MAX_PITCH) {
                errors.push(`${label}: pitches[${pi}]=${p} must be integer in [${MIN_PITCH},${MAX_PITCH}]`);
              }
            });
          }
          // velocity (optional, default 64)
          if (ev.velocity !== undefined) {
            if (typeof ev.velocity !== 'number' || ev.velocity < MIN_VELOCITY || ev.velocity > MAX_VELOCITY) {
              errors.push(`${label}: velocity must be 1-127, got ${ev.velocity}`);
            }
          }
          // accidentals
          if (ev.accidentals && Array.isArray(ev.accidentals)) {
            ev.accidentals.forEach((acc: any, ai: number) => {
              if (!VALID_ACCIDENTALS.includes(acc?.accidental)) {
                errors.push(`${label}: accidentals[${ai}].accidental "${acc?.accidental}" is not valid`);
              }
            });
          }
          // ties
          if (ev.ties && Array.isArray(ev.ties)) {
            ev.ties.forEach((tie: any, ti: number) => {
              if (tie.start && tie.toEventId) {
                if (!trackEventIds.has(tie.toEventId)) {
                  errors.push(`${label}: ties[${ti}].toEventId "${tie.toEventId}" not found in same track`);
                }
              }
              if (tie.start && !tie.toEventId) {
                errors.push(`${label}: ties[${ti}] has start=true but no toEventId`);
              }
            });
          }
        }

        if (ev.type === 'pedal') {
          if (typeof ev.dur_tick !== 'number' || ev.dur_tick <= 0) {
            errors.push(`${label}: pedal event must have dur_tick > 0`);
          }
        }

        // tuplet consistency
        if (ev.tuplet) {
          const { groupId, actual, normal } = ev.tuplet;
          if (!groupId) {
            errors.push(`${label}: tuplet.groupId is required`);
          } else if (tupletGroups[groupId]) {
            if (tupletGroups[groupId].actual !== actual || tupletGroups[groupId].normal !== normal) {
              errors.push(`${label}: tuplet groupId "${groupId}" has inconsistent actual/normal ratio`);
            }
          } else {
            tupletGroups[groupId] = { actual, normal };
          }
        }
      });

      return; // skip v1.0 notes check for this track
    }

    // ---- v1.0 notes[] ----
    if (!track.notes || !Array.isArray(track.notes)) {
      errors.push(`Track "${trackId}": notes must be an array`);
      return;
    }

    track.notes.forEach((note: any, noteIndex: number) => {
      const noteLabel = `Track "${trackId}", Note ${noteIndex}`;

      // ID validation
      if (!note.id || typeof note.id !== 'string') {
        errors.push(`${noteLabel}: missing or invalid id`);
      } else {
        // Check for duplicate IDs
        if (allNoteIds.has(note.id)) {
          duplicateNoteIds.push(note.id);
        } else {
          allNoteIds.add(note.id);
        }
      }

      // Pitch validation
      if (typeof note.pitch !== 'number') {
        errors.push(`${noteLabel}: pitch must be a number`);
      } else if (!Number.isInteger(note.pitch)) {
        errors.push(`${noteLabel}: pitch must be an integer`);
      } else if (note.pitch < MIN_PITCH || note.pitch > MAX_PITCH) {
        errors.push(`${noteLabel}: pitch must be between ${MIN_PITCH} and ${MAX_PITCH}, got ${note.pitch}`);
      }

      // Start tick validation
      if (typeof note.start_tick !== 'number') {
        errors.push(`${noteLabel}: start_tick must be a number`);
      } else if (!Number.isInteger(note.start_tick)) {
        errors.push(`${noteLabel}: start_tick must be an integer`);
      } else if (note.start_tick < 0) {
        errors.push(`${noteLabel}: start_tick must be >= 0, got ${note.start_tick}`);
      } else if (note.start_tick >= MAX_TICKS) {
        errors.push(`${noteLabel}: start_tick must be < ${MAX_TICKS} (${MAX_MEASURES} measures), got ${note.start_tick}`);
      }

      // Duration validation
      if (typeof note.dur_tick !== 'number') {
        errors.push(`${noteLabel}: dur_tick must be a number`);
      } else if (!Number.isInteger(note.dur_tick)) {
        errors.push(`${noteLabel}: dur_tick must be an integer`);
      } else if (note.dur_tick <= 0) {
        errors.push(`${noteLabel}: dur_tick must be > 0, got ${note.dur_tick}`);
      }

      // Check if note extends beyond max measures
      if (typeof note.start_tick === 'number' && typeof note.dur_tick === 'number') {
        const endTick = note.start_tick + note.dur_tick;
        if (endTick > MAX_TICKS) {
          errors.push(`${noteLabel}: note extends beyond ${MAX_MEASURES} measures (end_tick: ${endTick}, max: ${MAX_TICKS})`);
        }
      }

      // Velocity validation
      if (typeof note.velocity !== 'number') {
        errors.push(`${noteLabel}: velocity must be a number`);
      } else if (!Number.isInteger(note.velocity)) {
        errors.push(`${noteLabel}: velocity must be an integer`);
      } else if (note.velocity < MIN_VELOCITY || note.velocity > MAX_VELOCITY) {
        errors.push(`${noteLabel}: velocity must be between ${MIN_VELOCITY} and ${MAX_VELOCITY}, got ${note.velocity}`);
      }
    });
  });

  // Report duplicate note IDs
  if (duplicateNoteIds.length > 0) {
    errors.push(`Duplicate note IDs found: ${[...new Set(duplicateNoteIds)].join(', ')}`);
  }

  // ========================================================================
  // Return Result
  // ========================================================================

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// Safe Parse Function
// ============================================================================

/**
 * Safe parse JSON string thành XPSH score
 * 
 * @param jsonString - JSON string để parse
 * @returns XPSHScore nếu valid, null nếu invalid
 */
export function safeParseXpsh(jsonString: string): XPSHScore | null {
  try {
    // Parse JSON
    const parsed = JSON.parse(jsonString);
    
    // Validate
    const result = validateXpsh(parsed);
    
    if (!result.valid) {
      console.error('XPSH validation failed:', result.errors);
      return null;
    }

    // Log warnings if any
    if (result.warnings.length > 0) {
      console.warn('XPSH validation warnings:', result.warnings);
    }

    // Return as XPSHScore
    return parsed as XPSHScore;
  } catch (error) {
    console.error('Failed to parse XPSH JSON:', error);
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate file trước khi load vào player
 * Hiển thị errors nếu có
 * 
 * @param score - Score để validate
 * @returns true nếu safe để play, false nếu có errors
 */
export function isPlaybackSafe(score: unknown): boolean {
  const result = validateXpsh(score);
  
  if (!result.valid) {
    console.error('Cannot playback: validation errors found');
    result.errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }

  return true;
}

/**
 * Validate file trước khi load vào editor
 * Editor có thể accept một số warnings nhưng không accept errors
 * 
 * @param score - Score để validate
 * @returns true nếu safe để edit, false nếu có errors
 */
export function isEditorSafe(score: unknown): boolean {
  const result = validateXpsh(score);
  
  if (!result.valid) {
    console.error('Cannot load into editor: validation errors found');
    result.errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }

  // Log warnings but allow editing
  if (result.warnings.length > 0) {
    console.warn('Editor warnings:');
    result.warnings.forEach(warn => console.warn(`  - ${warn}`));
  }

  return true;
}

/**
 * Format validation errors cho user display
 * 
 * @param result - ValidationResult
 * @returns Formatted error message
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'File is valid';
  }

  let message = '❌ Validation Failed:\n\n';
  
  if (result.errors.length > 0) {
    message += 'Errors:\n';
    result.errors.forEach((err, i) => {
      message += `  ${i + 1}. ${err}\n`;
    });
  }

  if (result.warnings.length > 0) {
    message += '\nWarnings:\n';
    result.warnings.forEach((warn, i) => {
      message += `  ${i + 1}. ${warn}\n`;
    });
  }

  return message;
}

/**
 * Quick validation check - return boolean only
 * 
 * @param score - Score để validate
 * @returns true nếu valid, false nếu invalid
 */
export function isValidXpsh(score: unknown): boolean {
  return validateXpsh(score).valid;
}
