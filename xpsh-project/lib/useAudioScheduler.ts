/**
 * Audio Scheduler Hook - PHASE 5: HARDENED
 * Quản lý playback scheduling với lookahead technique
 * 
 * IMPROVEMENTS:
 * - NoteRegistry: Track active notes, prevent stuck notes
 * - Scheduler safety: Prevent double scheduling, handle seek properly
 * - Loop safety: Clear timers before restart
 * - Memory safety: Proper cleanup on unmount
 * - Debug mode: Optional logging for troubleshooting
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { CompiledTimeline, TimelineEvent } from '@/lib/xpsh_timeline';

// ============================================================================
// Types
// ============================================================================

export interface AudioSchedulerOptions {
  lookaheadMs?: number;        // Thời gian lookahead (default: 200ms)
  scheduleIntervalMs?: number; // Interval giữa các lần schedule (default: 50ms)
  debugMode?: boolean;         // Enable debug logging (default: false)
}

export interface AudioSchedulerState {
  isPlaying: boolean;
  currentMs: number;
  durationMs: number;
  activeNoteCount: number;     // PHASE 5: Track active notes
}

export interface AudioSchedulerControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (ms: number) => void;
  killAllNotes: () => void;    // PHASE 5: Emergency note kill
}

// ============================================================================
// NoteRegistry - PHASE 5
// ============================================================================

/**
 * Registry to track active (sounding) notes
 * Prevents stuck notes by ensuring all notes are turned off on stop/seek
 */
class NoteRegistry {
  private activeNotes = new Map<number, number>(); // pitch -> audioWhen scheduled
  private debugMode: boolean;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  /**
   * Register a note as active
   */
  noteOn(pitch: number, when: number): void {
    this.activeNotes.set(pitch, when);
    if (this.debugMode) {
      console.log(`[NoteRegistry] NoteOn: pitch=${pitch}, when=${when.toFixed(3)}, active=${this.activeNotes.size}`);
    }
  }

  /**
   * Unregister a note
   */
  noteOff(pitch: number): void {
    this.activeNotes.delete(pitch);
    if (this.debugMode) {
      console.log(`[NoteRegistry] NoteOff: pitch=${pitch}, active=${this.activeNotes.size}`);
    }
  }

  /**
   * Get all active note pitches
   */
  getActiveNotes(): number[] {
    return Array.from(this.activeNotes.keys());
  }

  /**
   * Get count of active notes
   */
  getActiveCount(): number {
    return this.activeNotes.size;
  }

  /**
   * Clear all active notes
   */
  clear(): void {
    if (this.debugMode && this.activeNotes.size > 0) {
      console.log(`[NoteRegistry] Clearing ${this.activeNotes.size} active notes`);
    }
    this.activeNotes.clear();
  }

  /**
   * Check if a note is active
   */
  isActive(pitch: number): boolean {
    return this.activeNotes.has(pitch);
  }
}

// ============================================================================
// Audio Scheduler Hook - PHASE 5: HARDENED
// ============================================================================

/**
 * Custom hook để schedule và playback timeline events
 * 
 * PHASE 5 IMPROVEMENTS:
 * - NoteRegistry tracks active notes, prevents stuck notes
 * - Scheduler won't schedule events before current playhead
 * - Proper cleanup on seek to prevent double scheduling
 * - Loop safety with timer cleanup
 * - Memory safety with AudioContext cleanup
 * - Debug mode for troubleshooting
 * 
 * @param timeline - CompiledTimeline để play
 * @param onNoteOn - Callback khi note bật (pitch, velocity, when)
 * @param onNoteOff - Callback khi note tắt (pitch, when)
 * @param options - Scheduler options
 * @returns [state, controls]
 */
export function useAudioScheduler(
  timeline: CompiledTimeline | null,
  onNoteOn: (pitch: number, velocity: number, when: number) => void,
  onNoteOff: (pitch: number, when: number) => void,
  options: AudioSchedulerOptions = {}
): [AudioSchedulerState, AudioSchedulerControls] {
  const {
    lookaheadMs = 200,
    scheduleIntervalMs = 50,
    debugMode = false
  } = options;

  // ========================================================================
  // State
  // ========================================================================

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [activeNoteCount, setActiveNoteCount] = useState(0);

  // ========================================================================
  // Refs (không trigger re-render)
  // ========================================================================

  const audioContextRef = useRef<AudioContext | null>(null);
  const scheduleTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Tracking state
  const playStartTimeRef = useRef<number>(0);      // AudioContext time khi bắt đầu play
  const playStartOffsetRef = useRef<number>(0);    // Offset trong timeline (ms)
  const lastScheduledTimeRef = useRef<number>(0);  // Thời gian đã schedule gần nhất
  const scheduledEventsRef = useRef<Set<string>>(new Set()); // Tracking scheduled events
  
  // PHASE 5: Note Registry
  const noteRegistryRef = useRef<NoteRegistry>(new NoteRegistry(debugMode));
  
  // PHASE 5: Scheduler index optimization
  const lastScheduledIndexRef = useRef<number>(0); // Avoid re-scanning all events

  // Update debug mode on registry
  useEffect(() => {
    noteRegistryRef.current = new NoteRegistry(debugMode);
  }, [debugMode]);

  // ========================================================================
  // Initialize AudioContext - PHASE 5: Improved cleanup
  // ========================================================================

  useEffect(() => {
    // Tạo AudioContext (lazy initialization)
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (debugMode) {
        console.log('[AudioScheduler] AudioContext created');
      }
    }

    return () => {
      // PHASE 5: Comprehensive cleanup khi unmount
      if (debugMode) {
        console.log('[AudioScheduler] Unmounting - cleaning up');
      }
      
      // Clear all timers
      if (scheduleTimerRef.current) {
        clearInterval(scheduleTimerRef.current);
        scheduleTimerRef.current = null;
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Kill all active notes
      const activeNotes = noteRegistryRef.current.getActiveNotes();
      if (activeNotes.length > 0 && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        activeNotes.forEach(pitch => {
          onNoteOff(pitch, now);
        });
      }
      noteRegistryRef.current.clear();
      
      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        
        if (debugMode) {
          console.log('[AudioScheduler] AudioContext closed');
        }
      }
    };
  }, [debugMode, onNoteOff]); // Include onNoteOff in deps

  // ========================================================================
  // Current Time Update (với requestAnimationFrame) - PHASE 5: Improved
  // ========================================================================

  useEffect(() => {
    if (!isPlaying || !audioContextRef.current) {
      // PHASE 5: Dừng animation frame với proper cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Update current time continuously
    const updateCurrentTime = () => {
      if (!audioContextRef.current || !isPlaying) return;

      const audioTime = audioContextRef.current.currentTime;
      const elapsed = (audioTime - playStartTimeRef.current) * 1000; // Convert to ms
      const newCurrentMs = playStartOffsetRef.current + elapsed;

      setCurrentMs(newCurrentMs);
      
      // PHASE 5: Update active note count
      setActiveNoteCount(noteRegistryRef.current.getActiveCount());

      // Kiểm tra nếu đã đến cuối
      if (timeline && newCurrentMs >= timeline.totalDurationMs) {
        if (debugMode) {
          console.log('[AudioScheduler] Reached end of timeline');
        }
        
        // Dừng playback
        pause();
        setCurrentMs(timeline.totalDurationMs);
      } else {
        // Continue animation loop
        animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null; // PHASE 5: Ensure null
      }
    };
  }, [isPlaying, timeline, debugMode]);

  // ========================================================================
  // Scheduler Loop - PHASE 5: HARDENED
  // ========================================================================

  useEffect(() => {
    if (!isPlaying || !timeline || !audioContextRef.current) {
      // PHASE 5: Clear scheduler with proper cleanup
      if (scheduleTimerRef.current) {
        if (debugMode) {
          console.log('[AudioScheduler] Clearing schedule timer');
        }
        clearInterval(scheduleTimerRef.current);
        scheduleTimerRef.current = null;
      }
      return;
    }

    // PHASE 5: Schedule events ahead of time (HARDENED)
    const scheduleAhead = () => {
      if (!audioContextRef.current || !timeline) return;

      const audioTime = audioContextRef.current.currentTime;
      const elapsed = (audioTime - playStartTimeRef.current) * 1000;
      const currentTimelineMs = playStartOffsetRef.current + elapsed;
      
      // PHASE 5: Don't schedule events in the past
      const scheduleFrom = Math.max(lastScheduledTimeRef.current, currentTimelineMs);
      const scheduleUntil = currentTimelineMs + lookaheadMs;
      
      if (debugMode && scheduleFrom < scheduleUntil) {
        console.log(`[AudioScheduler] Scheduling window: [${scheduleFrom.toFixed(1)}ms, ${scheduleUntil.toFixed(1)}ms]`);
      }
      
      let eventsScheduled = 0;
      
      // PHASE 5: Start from last index to avoid re-scanning
      const events = timeline.events;
      const startIndex = lastScheduledIndexRef.current;
      
      for (let i = startIndex; i < events.length; i++) {
        const event = events[i];
        
        // PHASE 5: Skip events before schedule window
        if (event.t < scheduleFrom) {
          lastScheduledIndexRef.current = i + 1;
          continue;
        }
        
        // Stop nếu vượt quá schedule window
        if (event.t >= scheduleUntil) break;
        
        // PHASE 5: Skip nếu đã schedule (double scheduling prevention)
        const eventKey = `${(event as any).noteId ?? (event as any).value ?? ''}_${event.type}_${event.t}`;
        if (scheduledEventsRef.current.has(eventKey)) {
          continue;
        }
        
        // Tính thời gian chơi trong AudioContext time
        const timeFromStart = event.t - playStartOffsetRef.current;
        const audioWhen = playStartTimeRef.current + (timeFromStart / 1000);
        
        // PHASE 5: Don't schedule events in the past (safety check)
        if (audioWhen < audioTime - 0.001) { // 1ms tolerance
          if (debugMode) {
            console.warn(`[AudioScheduler] Skipping past event: ${(event as any).noteId ?? event.type} at ${event.t}ms (would be ${audioWhen.toFixed(3)}s, now is ${audioTime.toFixed(3)}s)`);
          }
          continue;
        }
        
        // Schedule event
        if (event.type === 'on') {
          onNoteOn(event.pitch, event.vel, audioWhen);
          // PHASE 5: Track active note
          noteRegistryRef.current.noteOn(event.pitch, audioWhen);
          
          if (debugMode) {
            console.log(`[AudioScheduler] NoteOn: pitch=${event.pitch}, vel=${event.vel}, when=${audioWhen.toFixed(3)}s`);
          }
        } else if (event.type === 'off') {
          onNoteOff(event.pitch, audioWhen);
          // PHASE 5: Untrack note
          noteRegistryRef.current.noteOff(event.pitch);
          
          if (debugMode) {
            console.log(`[AudioScheduler] NoteOff: pitch=${event.pitch}, when=${audioWhen.toFixed(3)}s`);
          }
        } else if (event.type === 'cc64') {
          // CC64 pedal — Web Audio API has no direct sustain pedal support
          // Extended NoteOff via pedalSustain fallback handles actual sustain
          if (debugMode) {
            console.log(`[AudioScheduler] CC64 value=${(event as any).value} at ${audioWhen.toFixed(3)}s (skipped — handled by NoteOff extension)`);
          }
        }
        
        // Mark as scheduled
        scheduledEventsRef.current.add(eventKey);
        eventsScheduled++;
      }
      
      if (debugMode && eventsScheduled > 0) {
        console.log(`[AudioScheduler] Scheduled ${eventsScheduled} events`);
      }
      
      // Update last scheduled time
      lastScheduledTimeRef.current = scheduleUntil;
    };

    // PHASE 5: Clear any existing timer before starting new one (loop safety)
    if (scheduleTimerRef.current) {
      clearInterval(scheduleTimerRef.current);
    }

    // Schedule ngay lập tức
    scheduleAhead();
    
    // Schedule định kỳ
    scheduleTimerRef.current = window.setInterval(scheduleAhead, scheduleIntervalMs);
    
    if (debugMode) {
      console.log(`[AudioScheduler] Started schedule timer (interval: ${scheduleIntervalMs}ms)`);
    }

    return () => {
      // PHASE 5: Proper cleanup
      if (scheduleTimerRef.current) {
        clearInterval(scheduleTimerRef.current);
        scheduleTimerRef.current = null;
        
        if (debugMode) {
          console.log('[AudioScheduler] Schedule timer cleaned up');
        }
      }
    };
  }, [isPlaying, timeline, lookaheadMs, scheduleIntervalMs, onNoteOn, onNoteOff, debugMode]);

  // ========================================================================
  // Control Functions - PHASE 5: HARDENED
  // ========================================================================

  /**
   * PHASE 5: Helper to kill all active notes
   */
  const killAllActiveNotes = useCallback(() => {
    if (!audioContextRef.current) return;
    
    const activeNotes = noteRegistryRef.current.getActiveNotes();
    if (activeNotes.length > 0) {
      const now = audioContextRef.current.currentTime;
      
      if (debugMode) {
        console.log(`[AudioScheduler] Killing ${activeNotes.length} active notes`);
      }
      
      activeNotes.forEach(pitch => {
        onNoteOff(pitch, now);
      });
      
      noteRegistryRef.current.clear();
      setActiveNoteCount(0);
    }
  }, [onNoteOff, debugMode]);

  const play = useCallback(() => {
    if (!audioContextRef.current || !timeline) return;

    if (debugMode) {
      console.log(`[AudioScheduler] Play from ${currentMs.toFixed(1)}ms`);
    }

    // Resume AudioContext nếu bị suspend (do browser policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    // PHASE 5: Reset scheduler state properly
    playStartTimeRef.current = audioContextRef.current.currentTime;
    playStartOffsetRef.current = currentMs;
    lastScheduledTimeRef.current = currentMs;
    scheduledEventsRef.current.clear();
    
    // PHASE 5: Reset index for optimization
    lastScheduledIndexRef.current = 0;

    setIsPlaying(true);
  }, [timeline, currentMs, debugMode]);

  const pause = useCallback(() => {
    if (debugMode) {
      console.log(`[AudioScheduler] Pause at ${currentMs.toFixed(1)}ms`);
    }
    
    // PHASE 5: Kill active notes on pause to prevent stuck notes
    killAllActiveNotes();
    
    setIsPlaying(false);
  }, [killAllActiveNotes, currentMs, debugMode]);

  const stop = useCallback(() => {
    if (debugMode) {
      console.log('[AudioScheduler] Stop');
    }
    
    // PHASE 5: Kill all active notes
    killAllActiveNotes();
    
    setIsPlaying(false);
    setCurrentMs(0);
    
    // PHASE 5: Reset all scheduler state
    lastScheduledTimeRef.current = 0;
    scheduledEventsRef.current.clear();
    lastScheduledIndexRef.current = 0;
    playStartTimeRef.current = 0;
    playStartOffsetRef.current = 0;
  }, [killAllActiveNotes, debugMode]);

  const seek = useCallback((ms: number) => {
    const clampedMs = Math.max(0, Math.min(ms, timeline?.totalDurationMs || 0));
    
    if (debugMode) {
      console.log(`[AudioScheduler] Seek to ${clampedMs.toFixed(1)}ms (was ${currentMs.toFixed(1)}ms)`);
    }
    
    // PHASE 5: Kill all active notes before seek (prevents stuck notes)
    killAllActiveNotes();
    
    setCurrentMs(clampedMs);
    
    // PHASE 5: Reset scheduling completely
    lastScheduledTimeRef.current = clampedMs;
    scheduledEventsRef.current.clear();
    lastScheduledIndexRef.current = 0;
    
    // PHASE 5: Update start time nếu đang play (prevents tempo drift)
    if (isPlaying && audioContextRef.current) {
      playStartTimeRef.current = audioContextRef.current.currentTime;
      playStartOffsetRef.current = clampedMs;
      
      if (debugMode) {
        console.log(`[AudioScheduler] Reset playStartTime to ${playStartTimeRef.current.toFixed(3)}s`);
      }
    }
  }, [timeline, isPlaying, killAllActiveNotes, currentMs, debugMode]);

  /**
   * PHASE 5: Emergency function to kill all notes
   * Useful for panic button or debugging
   */
  const killAllNotes = useCallback(() => {
    if (debugMode) {
      console.log('[AudioScheduler] EMERGENCY: Kill all notes');
    }
    killAllActiveNotes();
  }, [killAllActiveNotes, debugMode]);

  // ========================================================================
  // Return State & Controls - PHASE 5
  // ========================================================================

  const state: AudioSchedulerState = {
    isPlaying,
    currentMs,
    durationMs: timeline?.totalDurationMs || 0,
    activeNoteCount // PHASE 5: Expose active note count
  };

  const controls: AudioSchedulerControls = {
    play,
    pause,
    stop,
    seek,
    killAllNotes // PHASE 5: Emergency note kill
  };

  return [state, controls];
}
