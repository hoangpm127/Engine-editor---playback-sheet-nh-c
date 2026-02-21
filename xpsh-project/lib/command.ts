/**
 * Command Pattern – PHASE 6: Undo/Redo
 * Each command knows how to execute() and undo() itself.
 */

import { XPSHScore, XPSHNote, XPSHTrack, XPSHEvent, AccidentalType } from './xpsh_helpers';
import {
  insertNote, deleteNote, InsertNoteParams,
  insertEvent, deleteEvent, findEventById, moveEvent,
  setAccidental, addTie, addPedalRange, applyTripletGroup,
  setEventDynamic, toggleEventArticulation, setEventFingering,
  setScoreKeySig, setScoreTimeSig,
  InsertEventParams, VoiceNumber
} from './editor_ops';

// ============================================================================
// Base interface
// ============================================================================

export interface Command {
  /** Human-readable label for debugging / future display */
  readonly label: string;
  /** Apply the command. Returns the new score. */
  execute(score: XPSHScore): XPSHScore;
  /** Revert the command. Returns the previous score. */
  undo(score: XPSHScore): XPSHScore;
}

// ============================================================================
// InsertNoteCommand
// ============================================================================

/**
 * Command that inserts a note into a track.
 * Undo removes the note by the ID that was generated at execute() time.
 */
export class InsertNoteCommand implements Command {
  readonly label: string;

  private readonly params: InsertNoteParams;
  /** The note ID generated when the command first executed – set on first execute(). */
  private insertedNoteId: string | null = null;
  /** Snapshot of the note actually inserted so we can perfectly undo. */
  private insertedNote: XPSHNote | null = null;

  constructor(params: InsertNoteParams) {
    this.params = { ...params };
    this.label = `Insert note pitch=${params.pitch} tick=${params.start_tick} on ${params.trackId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const before = score;
    const after = insertNote(score, this.params);

    // Find the new note (the one that is in after but not in before)
    if (this.insertedNote === null) {
      for (const track of after.tracks) {
        if (track.id !== this.params.trackId) continue;
        const beforeTrack = before.tracks.find((t: XPSHTrack) => t.id === this.params.trackId);
        const beforeIds = new Set((beforeTrack?.notes ?? []).map((n: XPSHNote) => n.id));
        const newNote = (track.notes ?? []).find((n: XPSHNote) => !beforeIds.has(n.id));
        if (newNote) {
          this.insertedNote = newNote;
          this.insertedNoteId = newNote.id;
          break;
        }
      }
    }

    return after;
  }

  undo(score: XPSHScore): XPSHScore {
    if (!this.insertedNoteId) return score; // nothing to undo
    return deleteNote(score, this.insertedNoteId);
  }
}

// ============================================================================
// DeleteNoteCommand
// ============================================================================

/**
 * Command that deletes a note.
 * Undo re-inserts the exact note (preserving its original ID).
 */
export class DeleteNoteCommand implements Command {
  readonly label: string;

  private readonly noteId: string;
  /** The note snapshot captured before deletion for undo. */
  private deletedNote: XPSHNote | null = null;
  /** Track the note belonged to. */
  private trackId: string | null = null;

  constructor(noteId: string) {
    this.noteId = noteId;
    this.label = `Delete note id=${noteId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    // Capture the note before deleting so we can restore it
    for (const track of score.tracks) {
      const note = (track.notes ?? []).find((n: XPSHNote) => n.id === this.noteId);
      if (note) {
        this.deletedNote = { ...note };
        this.trackId = track.id;
        break;
      }
    }

    return deleteNote(score, this.noteId);
  }

  undo(score: XPSHScore): XPSHScore {
    if (!this.deletedNote || !this.trackId) return score;

    const note = this.deletedNote;
    const trackId = this.trackId;

    // Re-insert with the exact same note object (preserves id)
    const newScore = {
      ...score,
      tracks: score.tracks.map((track: XPSHTrack): XPSHTrack => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          notes: [...(track.notes ?? []), note as XPSHNote]
        };
      })
    };

    return newScore;
  }
}

// ============================================================================
// v1.1 InsertEventCommand
// ============================================================================

export class InsertEventCommand implements Command {
  readonly label: string;
  private readonly params: InsertEventParams;
  private insertedEventId: string | null = null;

  constructor(params: InsertEventParams) {
    this.params = { ...params };
    this.label = `Insert event type=${params.type} tick=${params.start_tick} on ${params.trackId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const before = score;
    const after = insertEvent(score, this.params);

    if (this.insertedEventId === null) {
      for (const track of after.tracks) {
        if (track.id !== this.params.trackId) continue;
        const beforeTrack = before.tracks.find(t => t.id === this.params.trackId);
        const beforeIds = new Set((beforeTrack?.events ?? []).map(e => e.id));
        const newEv = (track.events ?? []).find(e => !beforeIds.has(e.id));
        if (newEv) { this.insertedEventId = newEv.id; break; }
      }
    }
    return after;
  }

  undo(score: XPSHScore): XPSHScore {
    if (!this.insertedEventId) return score;
    return deleteEvent(score, this.insertedEventId);
  }
}

// ============================================================================
// v1.1 DeleteEventCommand
// ============================================================================

export class DeleteEventCommand implements Command {
  readonly label: string;
  private readonly eventId: string;
  private deleted: XPSHEvent | null = null;
  private trackId: string | null = null;

  constructor(eventId: string) {
    this.eventId = eventId;
    this.label = `Delete event id=${eventId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const found = findEventById(score, this.eventId);
    if (found) { this.deleted = { ...found.event }; this.trackId = found.trackId; }
    return deleteEvent(score, this.eventId);
  }

  undo(score: XPSHScore): XPSHScore {
    if (!this.deleted || !this.trackId) return score;
    const ev = this.deleted;
    const tid = this.trackId;
    return {
      ...score,
      tracks: score.tracks.map(track =>
        track.id !== tid ? track : {
          ...track,
          events: [...(track.events ?? []), ev]
        }
      )
    };
  }
}

// ============================================================================
// v1.1 MoveEventCommand
// ============================================================================

/**
 * Move a chord event to a new tick / pitch (supports cross-track drag).
 * Fully undo-able.
 */
export class MoveEventCommand implements Command {
  readonly label: string;
  private readonly eventId: string;
  private readonly newStartTick: number;
  private readonly newPitches: number[];
  private readonly newTrackId: string;
  private prevStartTick = 0;
  private prevPitches: number[] = [];
  private prevTrackId = '';

  constructor(eventId: string, newStartTick: number, newPitches: number[], newTrackId: string) {
    this.eventId = eventId;
    this.newStartTick = newStartTick;
    this.newPitches = newPitches;
    this.newTrackId = newTrackId;
    this.label = `Move event ${eventId} → tick=${newStartTick} pitches=[${newPitches}] track=${newTrackId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const found = findEventById(score, this.eventId);
    if (found) {
      this.prevStartTick = found.event.start_tick;
      this.prevPitches   = found.event.pitches ? [...found.event.pitches] : [];
      this.prevTrackId   = found.trackId;
    } else {
      // v1.0 note fallback
      for (const track of score.tracks) {
        const n = (track.notes ?? []).find(n2 => n2.id === this.eventId);
        if (n) { this.prevStartTick = n.start_tick; this.prevPitches = [n.pitch]; this.prevTrackId = track.id; break; }
      }
    }
    return moveEvent(score, this.eventId, this.newStartTick, this.newPitches, this.prevTrackId, this.newTrackId);
  }

  undo(score: XPSHScore): XPSHScore {
    return moveEvent(score, this.eventId, this.prevStartTick, this.prevPitches, this.newTrackId, this.prevTrackId);
  }
}


export class SetAccidentalCommand implements Command {
  readonly label: string;
  private readonly eventId: string;
  private readonly pitch: number;
  private readonly newAcc: AccidentalType;
  private prevAcc: AccidentalType = 'none';

  constructor(eventId: string, pitch: number, accidental: AccidentalType) {
    this.eventId = eventId;
    this.pitch = pitch;
    this.newAcc = accidental;
    this.label = `Set accidental ${accidental} on pitch=${pitch}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const found = findEventById(score, this.eventId);
    if (found) {
      const prev = (found.event.accidentals ?? []).find(a => a.pitch === this.pitch);
      this.prevAcc = prev?.accidental ?? 'none';
    }
    return setAccidental(score, this.eventId, this.pitch, this.newAcc);
  }

  undo(score: XPSHScore): XPSHScore {
    return setAccidental(score, this.eventId, this.pitch, this.prevAcc);
  }
}

// ============================================================================
// SetDynamicCommand
// ============================================================================

export class SetDynamicCommand implements Command {
  readonly label: string;
  private readonly eventId: string;
  private readonly newDynamic: string | null;
  private prevDynamic: string | null = null;

  constructor(eventId: string, dynamic: string | null) {
    this.eventId = eventId;
    this.newDynamic = dynamic;
    this.label = `Set dynamic ${dynamic ?? 'none'} on event ${eventId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const found = findEventById(score, this.eventId);
    this.prevDynamic = found?.event.dynamic ?? null;
    return setEventDynamic(score, this.eventId, this.newDynamic);
  }

  undo(score: XPSHScore): XPSHScore {
    return setEventDynamic(score, this.eventId, this.prevDynamic);
  }
}

// ============================================================================
// ToggleArticulationCommand
// ============================================================================

export class ToggleArticulationCommand implements Command {
  readonly label: string;
  private readonly eventId: string;
  private readonly articulation: string;

  constructor(eventId: string, articulation: string) {
    this.eventId = eventId;
    this.articulation = articulation;
    this.label = `Toggle articulation ${articulation} on event ${eventId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    return toggleEventArticulation(score, this.eventId, this.articulation);
  }

  undo(score: XPSHScore): XPSHScore {
    // Toggling is its own inverse
    return toggleEventArticulation(score, this.eventId, this.articulation);
  }
}

// ============================================================================
// SetFingeringCommand
// ============================================================================

export class SetFingeringCommand implements Command {
  readonly label: string;
  private readonly eventId: string;
  private readonly newFingering: number[];
  private prevFingering: number[] = [];

  constructor(eventId: string, fingering: number[]) {
    this.eventId = eventId;
    this.newFingering = fingering;
    this.label = `Set fingering [${fingering}] on event ${eventId}`;
  }

  execute(score: XPSHScore): XPSHScore {
    const found = findEventById(score, this.eventId);
    this.prevFingering = found?.event.fingering ?? [];
    return setEventFingering(score, this.eventId, this.newFingering);
  }

  undo(score: XPSHScore): XPSHScore {
    return setEventFingering(score, this.eventId, this.prevFingering);
  }
}

// ============================================================================
// SetScoreMetaCommand (key sig / time sig)
// ============================================================================

export class SetScoreMetaCommand implements Command {
  readonly label: string;
  private readonly type: 'keySig' | 'timeSig';
  private readonly newVal: number | string;
  private prevKeySig = 0;
  private prevTimeSig = '4/4';

  constructor(type: 'keySig' | 'timeSig', value: number | string) {
    this.type = type;
    this.newVal = value;
    this.label = `Set ${type} = ${value}`;
  }

  execute(score: XPSHScore): XPSHScore {
    this.prevKeySig = score.timing.key_sig ?? 0;
    const ts = score.timing.time_signature;
    this.prevTimeSig = `${ts.numerator}/${ts.denominator}`;
    if (this.type === 'keySig') return setScoreKeySig(score, this.newVal as number);
    return setScoreTimeSig(score, this.newVal as string);
  }

  undo(score: XPSHScore): XPSHScore {
    if (this.type === 'keySig') return setScoreKeySig(score, this.prevKeySig);
    return setScoreTimeSig(score, this.prevTimeSig);
  }
}
