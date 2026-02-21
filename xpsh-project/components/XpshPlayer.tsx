/**
 * XPSH Player Component
 * Piano playback với tempo control và visualization
 */

'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { XPSHScore } from '@/lib/xpsh_helpers';
import { compileTimeline, retimeTimeline, CompiledTimeline } from '@/lib/xpsh_timeline';
import { useAudioScheduler } from '@/lib/useAudioScheduler';

// ============================================================================
// Simple Piano Synthesizer (Web Audio API)
// ============================================================================

class SimplePianoSynth {
  private audioContext: AudioContext;
  private activeNotes: Map<number, { oscillators: OscillatorNode[]; gain: GainNode }> = new Map();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  private midiToFreq(pitch: number): number {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  noteOn(pitch: number, velocity: number, when: number): void {
    // Stop any previous instance of this pitch cleanly
    const existing = this.activeNotes.get(pitch);
    if (existing) {
      const t = Math.max(when, this.audioContext.currentTime);
      existing.gain.gain.cancelScheduledValues(t);
      existing.gain.gain.setValueAtTime(0, t);
      existing.oscillators.forEach(o => { try { o.stop(t + 0.01); } catch { /* */ } });
      this.activeNotes.delete(pitch);
    }

    const freq  = this.midiToFreq(pitch);
    const vel   = (velocity / 127) * 0.55; // master volume

    // Master gain — piano ADSR
    const masterGain = this.audioContext.createGain();
    masterGain.gain.setValueAtTime(0, when);
    masterGain.gain.linearRampToValueAtTime(vel, when + 0.002);          // 2ms attack
    masterGain.gain.exponentialRampToValueAtTime(vel * 0.35, when + 0.1); // 100ms decay
    masterGain.connect(this.audioContext.destination);

    const oscillators: OscillatorNode[] = [];
    const makeOsc = (type: OscillatorType, freqHz: number, gainVal: number) => {
      const osc = this.audioContext.createOscillator();
      osc.type = type;
      osc.frequency.value = freqHz;
      const g = this.audioContext.createGain();
      g.gain.value = gainVal;
      osc.connect(g);
      g.connect(masterGain);
      osc.start(when);
      oscillators.push(osc);
    };

    makeOsc('triangle', freq,         1.00); // fundamental
    makeOsc('triangle', freq * 2,     0.28); // 2nd harmonic — brightness
    makeOsc('sine',     freq * 3,     0.10); // 3rd harmonic — warmth
    makeOsc('sine',     freq * 1.003, 0.18); // slightly detuned copy — chorus

    this.activeNotes.set(pitch, { oscillators, gain: masterGain });
  }

  noteOff(pitch: number, when: number): void {
    const active = this.activeNotes.get(pitch);
    if (!active) return;
    const { oscillators, gain } = active;
    const t = Math.max(when, this.audioContext.currentTime);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75); // 750ms release
    oscillators.forEach(o => { try { o.stop(t + 0.80); } catch { /* */ } });
    this.activeNotes.delete(pitch);
    // Deferred disconnect so no click artifacts
    const cleanupMs = (Math.max(0, when - this.audioContext.currentTime) + 0.85) * 1000;
    setTimeout(() => { try { gain.disconnect(); } catch { /* */ } }, cleanupMs);
  }

  stopAll(): void {
    const now = this.audioContext.currentTime;
    this.activeNotes.forEach(({ oscillators, gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      oscillators.forEach(o => { try { o.stop(now + 0.06); } catch { /* */ } });
    });
    this.activeNotes.clear();
  }
}

// ============================================================================
// XpshPlayer Component
// ============================================================================

export interface XpshPlayerProps {
  score: XPSHScore;
  autoPlay?: boolean;
  /** Called every animation frame during playback with current position in ms */
  onTimeUpdate?: (ms: number, isPlaying: boolean, tempo: number) => void;
  /** Called once controls are ready — gives parent play/pause/stop handles */
  onReady?: (controls: { play: () => void; pause: () => void; stop: () => void }) => void;
}

export function XpshPlayer({ score, autoPlay = false, onTimeUpdate, onReady }: XpshPlayerProps) {
  // ========================================================================
  // State
  // ========================================================================

  const [tempo, setTempo] = useState(score.timing.tempo_bpm);

  // ========================================================================
  // Single AudioContext — owned here, shared with scheduler
  // Initialised synchronously so the ref is populated before useAudioScheduler
  // ========================================================================

  const audioCtxRef = useRef<AudioContext | null>(null);
  const synthRef    = useRef<SimplePianoSynth | null>(null);

  // Safe synchronous init (browser only; 'use client' ensures no SSR conflict)
  if (typeof window !== 'undefined' && !audioCtxRef.current) {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      synthRef.current    = new SimplePianoSynth(ctx);
    } catch { /* will retry on first play() */ }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      synthRef.current?.stopAll();
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      synthRef.current    = null;
    };
  }, []);

  // ========================================================================
  // Timeline Compilation
  // ========================================================================

  const baseTimeline = useMemo(() => compileTimeline(score), [score]);
  const timeline     = useMemo(() => retimeTimeline(baseTimeline, tempo), [baseTimeline, tempo]);

  // ========================================================================
  // Audio Callbacks — use the SAME AudioContext the scheduler sees
  // ========================================================================

  const handleNoteOn = useCallback((pitch: number, velocity: number, when: number) => {
    // Ensure synth exists (lazy fallback if init was deferred)
    if (!synthRef.current && audioCtxRef.current) {
      synthRef.current = new SimplePianoSynth(audioCtxRef.current);
    }
    synthRef.current?.noteOn(pitch, velocity, when);
  }, []);

  const handleNoteOff = useCallback((pitch: number, when: number) => {
    synthRef.current?.noteOff(pitch, when);
  }, []);

  // ========================================================================
  // Audio Scheduler — receives our AudioContext so both share one clock
  // ========================================================================

  const [state, controls] = useAudioScheduler(
    timeline,
    handleNoteOn,
    handleNoteOff,
    {
      lookaheadMs: 80,
      scheduleIntervalMs: 20,
      audioContext: audioCtxRef.current,
    }
  );

  // ========================================================================
  // Expose controls to parent
  // ========================================================================

  useEffect(() => {
    onReady?.(controls);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]); // controls identity is stable from useAudioScheduler

  // ========================================================================
  // Emit playback position to parent (cursor line)
  // ========================================================================

  useEffect(() => {
    onTimeUpdate?.(state.currentMs, state.isPlaying, tempo);
  }, [state.currentMs, state.isPlaying, tempo, onTimeUpdate]);

  // ========================================================================
  // Auto Play
  // ========================================================================

  useEffect(() => {
    if (autoPlay && audioContextRef.current) {
      // Small delay để đảm bảo audio context ready
      const timer = setTimeout(() => {
        controls.play();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, controls]);

  // ========================================================================
  // Tempo Change Handler
  // ========================================================================

  const handleTempoChange = useCallback((newTempo: number) => {
    setTempo(newTempo);
  }, []);

  // ========================================================================
  // Format Time Display
  // ========================================================================

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="xpsh-player" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{score.metadata.title}</h2>
        {score.metadata.composer && (
          <p style={styles.composer}>{score.metadata.composer}</p>
        )}
      </div>

      {/* Time Display */}
      <div style={styles.timeDisplay}>
        <span style={styles.currentTime}>{formatTime(state.currentMs)}</span>
        <span style={styles.separator}>/</span>
        <span style={styles.totalTime}>{formatTime(state.durationMs)}</span>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressContainer}>
        <div
          style={{
            ...styles.progressBar,
            width: `${(state.currentMs / state.durationMs) * 100}%`
          }}
        />
      </div>

      {/* Playback Controls */}
      <div style={styles.controls}>
        <button
          onClick={controls.play}
          disabled={state.isPlaying}
          style={styles.button}
        >
          ▶ Play
        </button>
        <button
          onClick={controls.pause}
          disabled={!state.isPlaying}
          style={styles.button}
        >
          ⏸ Pause
        </button>
        <button
          onClick={controls.stop}
          style={styles.button}
        >
          ⏹ Stop
        </button>
      </div>

      {/* Tempo Control */}
      <div style={styles.tempoControl}>
        <label style={styles.tempoLabel}>
          Tempo: <strong>{tempo}</strong> BPM
        </label>
        <input
          type="range"
          min="40"
          max="240"
          value={tempo}
          onChange={(e) => handleTempoChange(Number(e.target.value))}
          style={styles.tempoSlider}
          disabled={state.isPlaying}
        />
        <div style={styles.tempoMarks}>
          <span>40</span>
          <span>120</span>
          <span>240</span>
        </div>
      </div>

      {/* Info */}
      <div style={styles.info}>
        <div>Status: {state.isPlaying ? '🎵 Playing' : '⏸ Paused'}</div>
        <div>Events: {timeline.events.length}</div>
        <div>Tracks: {score.tracks.length}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '24px',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
    borderBottom: '2px solid #ddd',
    paddingBottom: '16px'
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333'
  },
  composer: {
    margin: 0,
    fontSize: '14px',
    color: '#666'
  },
  timeDisplay: {
    textAlign: 'center',
    fontSize: '32px',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#333'
  },
  currentTime: {
    color: '#007bff'
  },
  separator: {
    margin: '0 8px',
    color: '#999'
  },
  totalTime: {
    color: '#666'
  },
  progressContainer: {
    width: '100%',
    height: '8px',
    backgroundColor: '#ddd',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '24px'
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007bff',
    transition: 'width 0.1s linear'
  },
  controls: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '24px'
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '100px'
  },
  tempoControl: {
    marginBottom: '24px'
  },
  tempoLabel: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '16px',
    textAlign: 'center',
    color: '#333'
  },
  tempoSlider: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    outline: 'none',
    cursor: 'pointer'
  },
  tempoMarks: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#999',
    marginTop: '4px'
  },
  info: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#666'
  }
};
