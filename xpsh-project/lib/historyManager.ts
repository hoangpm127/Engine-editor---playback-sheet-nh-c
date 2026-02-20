/**
 * History Manager – PHASE 6: Undo/Redo
 *
 * Maintains undoStack and redoStack of Command objects.
 * Designed to be used as a React ref so mutations don't cause re-renders.
 *
 * Usage:
 *   const history = useRef(new HistoryManager(50));
 *
 *   // execute a command
 *   const newScore = history.current.execute(new InsertNoteCommand(params), score);
 *   setScore(newScore);
 *
 *   // undo
 *   const prev = history.current.undo(score);
 *   if (prev !== null) setScore(prev);
 *
 *   // redo
 *   const next = history.current.redo(score);
 *   if (next !== null) setScore(next);
 */

import { XPSHScore } from './xpsh_helpers';
import { Command } from './command';

// ============================================================================
// HistoryManager
// ============================================================================

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  // --------------------------------------------------------------------------
  // Core operations
  // --------------------------------------------------------------------------

  /**
   * Execute a command, push to undoStack, clear redoStack.
   * Returns the new score after execution.
   */
  execute(command: Command, score: XPSHScore): XPSHScore {
    const newScore = command.execute(score);

    this.undoStack.push(command);

    // Enforce max stack size (drop oldest)
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }

    // Executing a new command invalidates any redo history
    this.redoStack = [];

    return newScore;
  }

  /**
   * Undo the last command.
   * Returns the reverted score, or null if nothing to undo.
   */
  undo(score: XPSHScore): XPSHScore | null {
    const command = this.undoStack.pop();
    if (!command) return null;

    const prevScore = command.undo(score);
    this.redoStack.push(command);

    return prevScore;
  }

  /**
   * Redo the last undone command.
   * Returns the re-applied score, or null if nothing to redo.
   */
  redo(score: XPSHScore): XPSHScore | null {
    const command = this.redoStack.pop();
    if (!command) return null;

    const nextScore = command.execute(score);
    this.undoStack.push(command);

    return nextScore;
  }

  // --------------------------------------------------------------------------
  // Introspection helpers (useful for toolbar button disabled states)
  // --------------------------------------------------------------------------

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  /** Label of the command that would be undone next (for tooltip). */
  get nextUndoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  /** Label of the command that would be redone next (for tooltip). */
  get nextRedoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  /**
   * Clear both stacks (e.g., after loading a new file).
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
