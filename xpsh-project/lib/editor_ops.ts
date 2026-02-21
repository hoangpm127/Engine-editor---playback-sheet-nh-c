/**
 * Editor Operations
 * Functions để thao tác với XPSH score (insert, delete, modify notes)
 */

import {
  XPSHScore, XPSHNote, XPSHTrack, XPSHEvent,
  AccidentalType, TieRef, TupletInfo, newId
} from '@/lib/xpsh_helpers';

// ============================================================================
// Types
// ============================================================================

/** Duration values (ticks) */
export const DURATION_VALUES = {
  whole: 1920,         // 4 quarters
  half: 960,           // 2 quarters
  quarter: 480,        // 1 quarter
  eighth: 240,         // 1/8 note
  sixteenth: 120,      // 1/16 note
  thirtysecond: 60,    // 1/32 note
} as const;

export type DurationType = keyof typeof DURATION_VALUES;

/** Default voice for new events */
export type VoiceNumber = 1 | 2;

/** Insert note parameters */
export interface InsertNoteParams {
  pitch: number;           // MIDI pitch (C3=48, C6=84)
  start_tick: number;      // Thời điểm bắt đầu
  dur_tick: number;        // Độ dài (whole/half/quarter)
  velocity?: number;       // Velocity (default: 80)
  trackId: string;         // "track_rh" hoặc "track_lh"
}

// ============================================================================
// Insert Note
// ============================================================================

/**
 * Insert note mới vào score
 * 
 * @param score - XPSH score hiện tại
 * @param params - Insert parameters
 * @returns Score mới với note đã insert
 */
export function insertNote(score: XPSHScore, params: InsertNoteParams): XPSHScore {
  const { pitch, start_tick, dur_tick, velocity = 80, trackId } = params;

  // Validate pitch range (C3=48 to C6=84)
  if (pitch < 48 || pitch > 84) {
    console.warn(`Pitch ${pitch} out of range [48, 84]`);
    return score;
  }

  // Validate start_tick (8 measures = 8 * 4 * 480 = 15360 ticks)
  const maxTick = 8 * 4 * 480;
  if (start_tick < 0 || start_tick >= maxTick) {
    console.warn(`start_tick ${start_tick} out of range [0, ${maxTick})`);
    return score;
  }

  // Validate duration
  if (start_tick + dur_tick > maxTick) {
    console.warn(`Note extends beyond 8 measures`);
    return score;
  }

  // Tạo note mới
  const newNote: XPSHNote = {
    id: newId('n'),
    pitch,
    start_tick,
    dur_tick,
    velocity
  };

  // Clone score
  const newScore = { ...score };
  newScore.tracks = score.tracks.map(track => {
    if (track.id === trackId) {
      // Add note to this track
      return {
        ...track,
        notes: [...(track.notes ?? []), newNote]
      };
    }
    return track;
  });

  return newScore;
}

// ============================================================================
// Delete Note
// ============================================================================

/**
 * Delete note khỏi score
 * 
 * @param score - XPSH score hiện tại
 * @param noteId - ID của note cần xóa
 * @returns Score mới với note đã xóa
 */
export function deleteNote(score: XPSHScore, noteId: string): XPSHScore {
  const newScore = { ...score };
  newScore.tracks = score.tracks.map(track => ({
    ...track,
    notes: (track.notes ?? []).filter(note => note.id !== noteId)
  }));

  return newScore;
}

// ============================================================================
// Find Note
// ============================================================================

/**
 * Tìm note tại vị trí click (với tolerance)
 * 
 * @param score - XPSH score
 * @param pitch - Pitch tìm kiếm
 * @param start_tick - Tick tìm kiếm
 * @param tolerance - Tolerance (ticks)
 * @returns Note tìm được hoặc null
 */
export function findNoteAt(
  score: XPSHScore,
  pitch: number,
  start_tick: number,
  tolerance: number = 100
): { note: XPSHNote; trackId: string } | null {
  for (const track of score.tracks) {
    for (const note of (track.notes ?? [])) {
      if (note.pitch !== pitch) continue;

      // Check time range with tolerance
      const isInRange =
        start_tick >= note.start_tick - tolerance &&
        start_tick <= note.start_tick + note.dur_tick + tolerance;

      if (isInRange) {
        return { note, trackId: track.id };
      }
    }
  }

  return null;
}

// ============================================================================
// Update Note
// ============================================================================

/**
 * Update note properties
 * 
 * @param score - XPSH score hiện tại
 * @param noteId - ID của note cần update
 * @param updates - Properties to update
 * @returns Score mới với note đã update
 */
export function updateNote(
  score: XPSHScore,
  noteId: string,
  updates: Partial<Omit<XPSHNote, 'id'>>
): XPSHScore {
  const newScore = { ...score };
  newScore.tracks = score.tracks.map(track => ({
    ...track,
    notes: (track.notes ?? []).map(note =>
      note.id === noteId ? { ...note, ...updates } : note
    )
  }));

  return newScore;
}

// ============================================================================
// Clear All Notes
// ============================================================================

/**
 * Xóa tất cả notes trong score
 * 
 * @param score - XPSH score hiện tại
 * @returns Score mới với tất cả notes đã xóa
 */
export function clearAllNotes(score: XPSHScore): XPSHScore {
  const newScore = { ...score };
  newScore.tracks = score.tracks.map(track => ({
    ...track,
    notes: []
  }));

  return newScore;
}

// ============================================================================
// Get Track by ID
// ============================================================================

/**
 * Lấy track theo ID
 * 
 * @param score - XPSH score
 * @param trackId - Track ID
 * @returns Track hoặc null
 */
export function getTrack(score: XPSHScore, trackId: string): XPSHTrack | null {
  return score.tracks.find(t => t.id === trackId) || null;
}

// ============================================================================
// Count Notes
// ============================================================================

/**
 * Đếm tổng số notes trong score
 * 
 * @param score - XPSH score
 * @returns Tổng số notes
 */
export function countNotes(score: XPSHScore): number {
  return score.tracks.reduce((sum, track) => sum + (track.notes?.length ?? 0), 0);
}

// ============================================================================
// Coordinate Mapping Helpers
// ============================================================================

/**
 * Convert measure index và beat index sang start_tick
 * 
 * @param measureIndex - Measure index (0-7)
 * @param beatIndex - Beat index (0-3)
 * @returns start_tick
 */
export function measureBeatToTick(measureIndex: number, beatIndex: number): number {
  // Mỗi measure có 4 beats
  // Mỗi beat = 480 ticks (1 quarter note)
  return (measureIndex * 4 + beatIndex) * 480;
}

/**
 * Convert start_tick sang measure index và beat index
 * 
 * @param tick - Start tick
 * @returns { measureIndex, beatIndex, remainder }
 */
export function tickToMeasureBeat(tick: number): {
  measureIndex: number;
  beatIndex: number;
  remainder: number;
} {
  const totalBeats = Math.floor(tick / 480);
  const measureIndex = Math.floor(totalBeats / 4);
  const beatIndex = totalBeats % 4;
  const remainder = tick % 480;

  return { measureIndex, beatIndex, remainder };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate score structure
 * 
 * @param score - XPSH score
 * @returns Validation result
 */
export function validateScore(score: XPSHScore): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check version
  if (score.format_version !== '1.0.0') {
    errors.push(`Invalid format_version: ${score.format_version}`);
  }

  // Check tracks
  if (score.tracks.length !== 2) {
    errors.push(`Expected 2 tracks, got ${score.tracks.length}`);
  }

  // Check track names
  const trackNames = score.tracks.map(t => t.name);
  if (!trackNames.includes('RH') || !trackNames.includes('LH')) {
    errors.push(`Missing RH or LH track`);
  }

  // Check notes
  const maxTick = 8 * 4 * 480;
  for (const track of score.tracks) {
    for (const note of (track.notes ?? [])) {
      // Check pitch range
      if (note.pitch < 21 || note.pitch > 108) {
        errors.push(`Note ${note.id}: pitch ${note.pitch} out of piano range`);
      }

      // Check tick range
      if (note.start_tick < 0 || note.start_tick >= maxTick) {
        errors.push(`Note ${note.id}: start_tick ${note.start_tick} out of range`);
      }

      // Check duration
      if (note.start_tick + note.dur_tick > maxTick) {
        errors.push(`Note ${note.id}: extends beyond 8 measures`);
      }

      // Check velocity
      if (note.velocity < 1 || note.velocity > 127) {
        errors.push(`Note ${note.id}: velocity ${note.velocity} out of range`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// v1.1 Event Operations
// ============================================================================

/** Parameters for creating a new chord/rest/pedal event */
export interface InsertEventParams {
  start_tick: number;
  dur_tick: number;
  voice: VoiceNumber;
  type: 'chord' | 'rest' | 'pedal';
  pitches?: number[];         // Required for type="chord"
  accidentals?: { pitch: number; accidental: AccidentalType }[];
  velocity?: number;
  trackId: string;
}

/**
 * Insert a new v1.1 event into a track.
 */
export function insertEvent(score: XPSHScore, params: InsertEventParams): XPSHScore {
  const { trackId, ...rest } = params;
  const newEvent: XPSHEvent = {
    id: newId('ev'),
    start_tick: rest.start_tick,
    dur_tick: rest.dur_tick,
    voice: rest.voice,
    type: rest.type,
    pitches: rest.pitches,
    accidentals: rest.accidentals ?? [],
    velocity: rest.velocity ?? 64,
  };

  return {
    ...score,
    tracks: score.tracks.map(track =>
      track.id !== trackId ? track : {
        ...track,
        events: [...(track.events ?? []), newEvent],
      }
    ),
  };
}

/**
 * Delete a v1.1 event by id from all tracks.
 */
export function deleteEvent(score: XPSHScore, eventId: string): XPSHScore {
  return {
    ...score,
    tracks: score.tracks.map(track => ({
      ...track,
      events: (track.events ?? []).filter(ev => ev.id !== eventId),
    })),
  };
}

/**
 * Move a note/event to a new tick and/or pitch, optionally across tracks.
 * Supports both v1.0 (notes[]) and v1.1 (events[]) storage.
 */
export function moveEvent(
  score: XPSHScore,
  eventId: string,
  newStartTick: number,
  newPitches: number[],
  prevTrackId: string,
  newTrackId: string,
): XPSHScore {
  if (newTrackId === prevTrackId) {
    return {
      ...score,
      tracks: score.tracks.map(track => ({
        ...track,
        events: (track.events ?? []).map(ev =>
          ev.id !== eventId ? ev : { ...ev, start_tick: newStartTick, pitches: newPitches }
        ),
        notes: (track.notes ?? []).map(n =>
          n.id !== eventId ? n : { ...n, start_tick: newStartTick, pitch: newPitches[0] ?? n.pitch }
        ),
      })),
    };
  }
  // Cross-track: lift event out of old track, drop into new track
  let movedEv: XPSHEvent | null = null;
  let movedNote: XPSHNote | null = null;
  const step1: XPSHScore = {
    ...score,
    tracks: score.tracks.map(track => {
      if (track.id !== prevTrackId) return track;
      const ev = (track.events ?? []).find(e => e.id === eventId);
      if (ev) movedEv = { ...ev, start_tick: newStartTick, pitches: newPitches, voice: 1 as const };
      const n = (track.notes ?? []).find(n2 => n2.id === eventId);
      if (n) movedNote = { ...n, start_tick: newStartTick, pitch: newPitches[0] ?? n.pitch };
      return {
        ...track,
        events: (track.events ?? []).filter(e => e.id !== eventId),
        notes:  (track.notes  ?? []).filter(n2 => n2.id !== eventId),
      };
    }),
  };
  return {
    ...step1,
    tracks: step1.tracks.map(track => {
      if (track.id !== newTrackId) return track;
      return {
        ...track,
        events: movedEv  ? [...(track.events ?? []), movedEv]  : (track.events ?? []),
        notes:  movedNote ? [...(track.notes  ?? []), movedNote] : (track.notes  ?? []),
      };
    }),
  };
}

/**
 * Find event by id across all tracks.
 */
export function findEventById(
  score: XPSHScore,
  eventId: string
): { event: XPSHEvent; trackId: string } | null {
  for (const track of score.tracks) {
    const ev = (track.events ?? []).find(e => e.id === eventId);
    if (ev) return { event: ev, trackId: track.id };
  }
  return null;
}

/**
 * Find the chord event at (start_tick, voice, trackId).
 * Returns null if none found.
 */
export function findEventAt(
  score: XPSHScore,
  start_tick: number,
  voice: VoiceNumber,
  trackId: string,
  tolerance = 60
): XPSHEvent | null {
  const track = score.tracks.find(t => t.id === trackId);
  if (!track) return null;
  return (track.events ?? []).find(ev =>
    ev.voice === voice &&
    ev.type === 'chord' &&
    Math.abs(ev.start_tick - start_tick) <= tolerance
  ) ?? null;
}

/**
 * Add a pitch to an existing chord event, or create a new chord event if none exists.
 * Chord-mode: clicking pitch on same beat/voice merges into one chord.
 */
export function insertOrUpdateChordPitch(
  score: XPSHScore,
  params: {
    pitch: number;
    start_tick: number;
    dur_tick: number;
    voice: VoiceNumber;
    trackId: string;
    velocity?: number;
  }
): XPSHScore {
  const { pitch, start_tick, dur_tick, voice, trackId, velocity = 64 } = params;
  const existing = findEventAt(score, start_tick, voice, trackId);

  if (existing) {
    // Add pitch to existing chord (if not already there)
    const pitches = existing.pitches ?? [];
    if (pitches.includes(pitch)) return score; // already present
    return updateEvent(score, existing.id, { pitches: [...pitches, pitch] });
  }

  // Create new chord event
  return insertEvent(score, { start_tick, dur_tick, voice, type: 'chord', pitches: [pitch], velocity, trackId });
}

/**
 * Set or update the accidental for a specific pitch inside a chord event.
 */
export function setAccidental(
  score: XPSHScore,
  eventId: string,
  pitch: number,
  accidental: AccidentalType
): XPSHScore {
  const found = findEventById(score, eventId);
  if (!found) return score;
  const ev = found.event;
  const accs = (ev.accidentals ?? []).filter(a => a.pitch !== pitch);
  if (accidental !== 'none') accs.push({ pitch, accidental });
  return updateEvent(score, eventId, { accidentals: accs });
}

/**
 * Change the voice of an event.
 */
export function setVoice(
  score: XPSHScore,
  eventId: string,
  voice: VoiceNumber
): XPSHScore {
  return updateEvent(score, eventId, { voice });
}

/**
 * Create a tie from (fromEventId, pitch) → (toEventId, pitch).
 * Validates that both events exist in same track and have the pitch.
 */
export function addTie(
  score: XPSHScore,
  fromEventId: string,
  toEventId: string,
  pitch: number
): XPSHScore {
  const fromFound = findEventById(score, fromEventId);
  const toFound = findEventById(score, toEventId);

  if (!fromFound || !toFound) {
    console.warn('addTie: one or both events not found');
    return score;
  }
  if (fromFound.trackId !== toFound.trackId) {
    console.warn('addTie: events must be in the same track');
    return score;
  }
  if (!fromFound.event.pitches?.includes(pitch) || !toFound.event.pitches?.includes(pitch)) {
    console.warn(`addTie: pitch ${pitch} not found in both events`);
    return score;
  }

  // Update fromEvent: add tie start
  const fromTies = (fromFound.event.ties ?? []).filter(t => t.pitch !== pitch);
  fromTies.push({ pitch, start: true, stop: false, toEventId });

  // Update toEvent: add tie stop
  const toTies = (toFound.event.ties ?? []).filter(t => t.pitch !== pitch);
  toTies.push({ pitch, start: false, stop: true });

  return updateEvent(
    updateEvent(score, fromEventId, { ties: fromTies }),
    toEventId,
    { ties: toTies }
  );
}

/**
 * Add a sustain pedal event to a track.
 */
export function addPedalRange(
  score: XPSHScore,
  trackId: string,
  start_tick: number,
  dur_tick: number
): XPSHScore {
  const newEvent: XPSHEvent = {
    id: newId('ped'),
    start_tick,
    dur_tick,
    voice: 1,
    type: 'pedal',
  };
  return {
    ...score,
    tracks: score.tracks.map(track =>
      track.id !== trackId ? track : {
        ...track,
        events: [...(track.events ?? []), newEvent],
      }
    ),
  };
}

/**
 * Apply triplet tuplet to a group of existing event IDs.
 * All events must already exist; this function assigns the same groupId to them.
 */
export function applyTripletGroup(
  score: XPSHScore,
  eventIds: string[]
): XPSHScore {
  if (eventIds.length === 0) return score;
  const groupId = newId('trip');
  const tuplet: TupletInfo = { type: 'triplet', actual: 3, normal: 2, groupId };

  let updated = score;
  for (const id of eventIds) {
    updated = updateEvent(updated, id, { tuplet });
  }
  return updated;
}

/**
 * Remove pitch from an existing chord event.
 * If the chord would be empty, removes the event entirely.
 */
export function removeChordPitch(
  score: XPSHScore,
  eventId: string,
  pitch: number
): XPSHScore {
  const found = findEventById(score, eventId);
  if (!found) return score;
  const pitches = (found.event.pitches ?? []).filter(p => p !== pitch);
  if (pitches.length === 0) return deleteEvent(score, eventId);
  return updateEvent(score, eventId, { pitches });
}

/**
 * Generic update of any XPSHEvent field.
 */
export function updateEvent(
  score: XPSHScore,
  eventId: string,
  updates: Partial<Omit<XPSHEvent, 'id'>>
): XPSHScore {
  return {
    ...score,
    tracks: score.tracks.map(track => ({
      ...track,
      events: (track.events ?? []).map(ev =>
        ev.id === eventId ? { ...ev, ...updates } : ev
      ),
    })),
  };
}

/**
 * Count total events (and legacy notes) in score.
 */
export function countEvents(score: XPSHScore): number {
  return score.tracks.reduce((sum, t) => {
    const evts = (t.events ?? []).filter(e => e.type !== 'pedal').length;
    const notes = (t.notes ?? []).length;
    return sum + evts + notes;
  }, 0);
}

/**
 * Collect all event IDs selected/present in a tick range on a track.
 */
export function getEventsInTickRange(
  score: XPSHScore,
  trackId: string,
  startTick: number,
  endTick: number
): XPSHEvent[] {
  const track = score.tracks.find(t => t.id === trackId);
  if (!track) return [];
  return (track.events ?? []).filter(ev =>
    ev.start_tick >= startTick && ev.start_tick < endTick
  );
}

// ============================================================================
// Annotation helpers (dynamic, articulation, fingering)
// ============================================================================

/** Set / clear dynamic on an event. Pass null to remove. */
export function setEventDynamic(score: XPSHScore, eventId: string, dynamic: string | null): XPSHScore {
  return updateEvent(score, eventId, { dynamic: dynamic ?? undefined });
}

/** Toggle one articulation symbol on an event. */
export function toggleEventArticulation(score: XPSHScore, eventId: string, articulation: string): XPSHScore {
  const found = findEventById(score, eventId);
  if (!found) return score;
  const existing = found.event.articulations ?? [];
  const next = existing.includes(articulation)
    ? existing.filter(a => a !== articulation)
    : [...existing, articulation];
  return updateEvent(score, eventId, { articulations: next.length > 0 ? next : undefined });
}

/** Set fingering array (parallel to pitches[]). */
export function setEventFingering(score: XPSHScore, eventId: string, fingering: number[]): XPSHScore {
  return updateEvent(score, eventId, { fingering });
}

// ============================================================================
// Score-level meta setters (key sig, time sig)
// ============================================================================

const KEY_SIG_STRINGS: Record<number, string> = {
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
  [-1]: 'F', [-2]: 'Bb', [-3]: 'Eb', [-4]: 'Ab', [-5]: 'Db', [-6]: 'Gb', [-7]: 'Cb',
};
export { KEY_SIG_STRINGS };

export function setScoreKeySig(score: XPSHScore, keySig: number): XPSHScore {
  return { ...score, timing: { ...score.timing, key_sig: keySig } };
}

export function setScoreTimeSig(score: XPSHScore, timeSig: string): XPSHScore {
  const parts = timeSig.split('/');
  const numerator = parseInt(parts[0] ?? '4', 10);
  const denominator = parseInt(parts[1] ?? '4', 10);
  return { ...score, timing: { ...score.timing, time_signature: { numerator, denominator } } };
}

