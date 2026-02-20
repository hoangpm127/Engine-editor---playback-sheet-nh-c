/**
 * Command Pattern – PHASE 6: Undo/Redo
 * Each command knows how to execute() and undo() itself.
 */

import { XPSHScore, XPSHNote, XPSHTrack, XPSHEvent, AccidentalType } from './xpsh_helpers';
import {
  insertNote, deleteNote, InsertNoteParams,
  insertEvent, deleteEvent, findEventById, setAccidental, addTie, addPedalRange, applyTripletGroup,
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
// v1.1 SetAccidentalCommand
// ============================================================================

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
