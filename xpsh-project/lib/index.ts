/**
 * XPSH Playback Engine - Main Export
 * Centralized exports cho tất cả XPSH playback components
 */

// ============================================================================
// Type Definitions & Helpers
// ============================================================================

export type {
  XPSHScore,
  XPSHTrack,
  XPSHNote,
  XPSHMetadata,
  XPSHTiming,
  XPSHTimeSignature
} from '@/lib/xpsh_helpers';

export {
  tickToMs,
  msToTick,
  pitchToName,
  nameToPitch,
  newId,
  resetIdCounter,
  TICKS_PER_QUARTER,
  DEFAULT_TEMPO_BPM,
  DEFAULT_TIME_SIGNATURE,
  PIANO_PITCH_RANGE,
  DEFAULT_VELOCITY
} from '@/lib/xpsh_helpers';

// ============================================================================
// Timeline Compiler
// ============================================================================

export type {
  NoteOnEvent,
  NoteOffEvent,
  TimelineEvent,
  CompiledTimeline
} from '@/lib/xpsh_timeline';

export {
  compileTimeline,
  getEventsInRange,
  retimeTimeline,
  debugTimeline
} from '@/lib/xpsh_timeline';

// ============================================================================
// Audio Scheduler
// ============================================================================

export type {
  AudioSchedulerOptions,
  AudioSchedulerState,
  AudioSchedulerControls
} from '@/lib/useAudioScheduler';

export {
  useAudioScheduler
} from '@/lib/useAudioScheduler';

// ============================================================================
// Player Component
// ============================================================================

export type {
  XpshPlayerProps
} from '@/components/XpshPlayer';

export {
  XpshPlayer
} from '@/components/XpshPlayer';

// ============================================================================
// Version Info
// ============================================================================

export const XPSH_ENGINE_VERSION = '1.0.0';
export const XPSH_FORMAT_VERSION = '1.0.0';
