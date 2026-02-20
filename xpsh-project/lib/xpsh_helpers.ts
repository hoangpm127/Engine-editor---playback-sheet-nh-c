/**
 * XPSH v1 Format Helper Functions
 * Provides type definitions and utility functions for working with XPSH piano score files
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Time signature object */
export interface XPSHTimeSignature {
  numerator: number;      // Số beat trong 1 ô nhịp (phải là 4 cho phase 0)
  denominator: number;    // Loại note = 1 beat (phải là 4 cho phase 0)
}

/** Timing information */
export interface XPSHTiming {
  ticks_per_quarter: number;   // Số tick trong 1 quarter note (phải là 480)
  tempo_bpm: number;           // Tempo tính bằng beats per minute
  time_signature: XPSHTimeSignature;
}

/** Metadata information */
export interface XPSHMetadata {
  title: string;
  composer?: string;
  arranger?: string;
  copyright?: string;
  created_at?: string;    // ISO 8601 format
  modified_at?: string;   // ISO 8601 format
}

/** Note object (v1.0 – kept for backward-compat) */
export interface XPSHNote {
  id: string;           // ID duy nhất của note
  pitch: number;        // MIDI pitch (60 = C4, middle C)
  start_tick: number;   // Thời điểm bắt đầu (tính bằng tick)
  dur_tick: number;     // Độ dài note (tính bằng tick)
  velocity: number;     // Độ mạnh khi gõ phím (1-127)
}

// ============================================================================
// v1.1 Types
// ============================================================================

/** Explicit accidental for a specific pitch in a chord */
export type AccidentalType =
  | 'none'
  | 'sharp'
  | 'flat'
  | 'natural'
  | 'doubleSharp'
  | 'doubleFlat';

/** Accidental annotation attached to one pitch inside an event */
export interface PitchAccidental {
  pitch: number;
  accidental: AccidentalType;
}

/** Tie reference stored on one pitch inside an event */
export interface TieRef {
  pitch: number;
  start: boolean;
  stop: boolean;
  /** ID of the next event in the tie chain (required when start=true) */
  toEventId?: string;
}

/** Tuplet grouping metadata */
export interface TupletInfo {
  type: 'triplet';
  actual: number;     // 3
  normal: number;     // 2
  groupId: string;    // shared across all events in the group
}

/**
 * v1.1 Event – replaces XPSHNote inside a track.
 * type="chord"  → pitches[] contains 1..N MIDI pitches
 * type="rest"   → pitches[] absent / empty
 * type="pedal"  → sustain pedal range; pitches absent
 */
export interface XPSHEvent {
  id: string;
  start_tick: number;
  dur_tick: number;
  voice: 1 | 2;
  type: 'chord' | 'rest' | 'pedal';
  /** MIDI pitches (1..N). Required for type="chord" */
  pitches?: number[];
  /** Per-pitch display accidentals */
  accidentals?: PitchAccidental[];
  /** Velocity 1-127. Applies to all pitches in the chord */
  velocity?: number;
  /** Tie info per pitch */
  ties?: TieRef[];
  /** Tuplet grouping info */
  tuplet?: TupletInfo;
}

/** Track object (staff) */
export interface XPSHTrack {
  id: string;           // ID duy nhất của track
  name: string;         // "RH" hoặc "LH"
  type: string;         // "piano"
  clef?: string;        // "treble" hoặc "bass"
  /** v1.0 note list (backward-compat) */
  notes?: XPSHNote[];
  /** v1.1 event list */
  events?: XPSHEvent[];
}

/** Complete XPSH score */
export interface XPSHScore {
  format?: string;
  format_version: string;
  metadata: XPSHMetadata;
  timing: XPSHTiming;
  tracks: XPSHTrack[];
}

// ============================================================================
// v1.1 Helpers
// ============================================================================

/**
 * Returns unified event list from a track regardless of format version.
 * v1.0 notes are wrapped as single-pitch chord events.
 */
export function getTrackEvents(track: XPSHTrack): XPSHEvent[] {
  if (track.events && track.events.length > 0) return track.events;
  if (track.notes && track.notes.length > 0) {
    return track.notes.map(n => ({
      id: n.id,
      start_tick: n.start_tick,
      dur_tick: n.dur_tick,
      voice: 1 as const,
      type: 'chord' as const,
      pitches: [n.pitch],
      velocity: n.velocity
    }));
  }
  return [];
}

/**
 * Returns unified note-like list from a track (for backward-compat display).
 * Maps v1.1 chord events to flat XPSHNote[].
 */
export function getTrackNotes(track: XPSHTrack): XPSHNote[] {
  if (track.notes && (!track.events || track.events.length === 0)) return track.notes;
  const evts = getTrackEvents(track);
  const out: XPSHNote[] = [];
  for (const ev of evts) {
    if (ev.type !== 'chord' || !ev.pitches) continue;
    for (const p of ev.pitches) {
      out.push({ id: `${ev.id}_p${p}`, pitch: p, start_tick: ev.start_tick, dur_tick: ev.dur_tick, velocity: ev.velocity ?? 64 });
    }
  }
  return out;
}

// ============================================================================
// Timing Conversion Functions
// ============================================================================

/**
 * Convert tick to milliseconds
 * Formula: ms = (tick / ticks_per_quarter) * (60000 / tempo_bpm)
 * 
 * @param tick - Số tick cần convert
 * @param tempoBpm - Tempo tính bằng BPM
 * @param tpq - Ticks per quarter (mặc định 480)
 * @returns Thời gian tính bằng milliseconds
 * 
 * @example
 * tickToMs(480, 120, 480) // returns 500 (1 quarter note @ 120 BPM = 500ms)
 */
export function tickToMs(tick: number, tempoBpm: number, tpq: number = 480): number {
  if (tpq <= 0 || tempoBpm <= 0) {
    throw new Error('tpq and tempoBpm must be positive');
  }
  return (tick / tpq) * (60000 / tempoBpm);
}

/**
 * Convert milliseconds to tick
 * Formula: tick = (ms * tempo_bpm * ticks_per_quarter) / 60000
 * 
 * @param ms - Thời gian tính bằng milliseconds
 * @param tempoBpm - Tempo tính bằng BPM
 * @param tpq - Ticks per quarter (mặc định 480)
 * @returns Số tick
 * 
 * @example
 * msToTick(500, 120, 480) // returns 480 (500ms @ 120 BPM = 1 quarter note)
 */
export function msToTick(ms: number, tempoBpm: number, tpq: number = 480): number {
  if (tpq <= 0 || tempoBpm <= 0) {
    throw new Error('tpq and tempoBpm must be positive');
  }
  return (ms * tempoBpm * tpq) / 60000;
}

// ============================================================================
// Pitch Conversion Functions
// ============================================================================

/** Bảng ánh xạ note name -> offset từ C */
const NOTE_OFFSETS: { [key: string]: number } = {
  'C': 0,
  'D': 2,
  'E': 4,
  'F': 5,
  'G': 7,
  'A': 9,
  'B': 11
};

/** Bảng ánh xạ MIDI pitch -> note name (C, C#, D, ...) */
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI pitch number to note name
 * 
 * @param pitch - MIDI pitch number (0-127)
 * @returns Note name (e.g., "C4", "C#4", "Db4")
 * 
 * @example
 * pitchToName(60) // returns "C4"
 * pitchToName(61) // returns "C#4"
 * pitchToName(69) // returns "A4"
 */
export function pitchToName(pitch: number): string {
  if (pitch < 0 || pitch > 127) {
    throw new Error('Pitch must be between 0 and 127');
  }
  
  const octave = Math.floor(pitch / 12) - 1;  // MIDI octave starts at C-1 (pitch 0)
  const noteIndex = pitch % 12;
  const noteName = PITCH_NAMES[noteIndex];
  
  return `${noteName}${octave}`;
}

/**
 * Convert note name to MIDI pitch number
 * Supports both sharp (#) and flat (b) notation
 * 
 * @param name - Note name (e.g., "C4", "C#4", "Db4")
 * @returns MIDI pitch number
 * 
 * @example
 * nameToPitch("C4")   // returns 60
 * nameToPitch("C#4")  // returns 61
 * nameToPitch("Db4")  // returns 61
 * nameToPitch("A4")   // returns 69
 */
export function nameToPitch(name: string): number {
  // Parse note name: C4, C#4, Db4, etc.
  const match = name.match(/^([A-G])(#|b)?(-?\d+)$/);
  
  if (!match) {
    throw new Error(`Invalid note name: ${name}`);
  }
  
  const [, noteLetter, accidental, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  
  // Lấy offset cơ bản của note
  const baseOffset = NOTE_OFFSETS[noteLetter];
  if (baseOffset === undefined) {
    throw new Error(`Invalid note letter: ${noteLetter}`);
  }
  
  // Xử lý dấu thăng (#) hoặc giáng (b)
  let offset = baseOffset;
  if (accidental === '#') {
    offset += 1;
  } else if (accidental === 'b') {
    offset -= 1;
  }
  
  // Tính MIDI pitch: (octave + 1) * 12 + offset
  // MIDI octave -1 bắt đầu từ pitch 0
  const pitch = (octave + 1) * 12 + offset;
  
  if (pitch < 0 || pitch > 127) {
    throw new Error(`Pitch out of range: ${pitch} (from ${name})`);
  }
  
  return pitch;
}

// ============================================================================
// ID Generation
// ============================================================================

/** Counter cho việc tạo ID unique */
let idCounter = 0;

/**
 * Generate a unique ID with a prefix
 * ID format: {prefix}_{timestamp}_{counter}
 * 
 * @param prefix - Prefix cho ID (e.g., "n", "track")
 * @returns Unique ID string
 * 
 * @example
 * newId("n")     // returns "n_1739577600000_1"
 * newId("track") // returns "track_1739577600000_2"
 */
export function newId(prefix: string): string {
  idCounter++;
  const timestamp = Date.now();
  return `${prefix}_${timestamp}_${idCounter}`;
}

/**
 * Reset ID counter (useful for testing)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ============================================================================
// Constants
// ============================================================================

/** Tick resolution cố định cho XPSH v1 */
export const TICKS_PER_QUARTER = 480;

/** Tempo mặc định (BPM) */
export const DEFAULT_TEMPO_BPM = 120;

/** Time signature mặc định (4/4) */
export const DEFAULT_TIME_SIGNATURE: XPSHTimeSignature = {
  numerator: 4,
  denominator: 4
};

/** Khoảng MIDI pitch của piano chuẩn (A0 - C8) */
export const PIANO_PITCH_RANGE = {
  min: 21,  // A0
  max: 108  // C8
};

/** Velocity mặc định */
export const DEFAULT_VELOCITY = 64;
