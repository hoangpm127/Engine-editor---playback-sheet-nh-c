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
  private activeNotes: Map<number, { oscillator: OscillatorNode; gain: GainNode }> = new Map();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Convert MIDI pitch to frequency
   * Formula: f = 440 * 2^((pitch - 69) / 12)
   */
  private midiToFreq(pitch: number): number {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  /**
   * Play note với scheduled time
   */
  noteOn(pitch: number, velocity: number, when: number): void {
    const freq = this.midiToFreq(pitch);
    const gain = velocity / 127;

    // Tạo oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine'; // Piano-like sound (tạm thời)
    oscillator.frequency.value = freq;

    // Tạo gain node cho volume control
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0;
    
    // Connect: oscillator -> gain -> destination
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Start oscillator
    oscillator.start(when);

    // Envelope: attack
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(gain * 0.3, when + 0.01);

    // Store active note
    this.activeNotes.set(pitch, { oscillator, gain: gainNode });
  }

  /**
   * Stop note với scheduled time
   */
  noteOff(pitch: number, when: number): void {
    const active = this.activeNotes.get(pitch);
    if (!active) return;

    const { oscillator, gain } = active;

    // Envelope: release
    gain.gain.setValueAtTime(gain.gain.value, when);
    gain.gain.linearRampToValueAtTime(0, when + 0.3);

    // Stop oscillator sau khi release
    oscillator.stop(when + 0.3);

    // Remove from active notes
    this.activeNotes.delete(pitch);
  }

  /**
   * Stop tất cả notes ngay lập tức
   */
  stopAll(): void {
    const now = this.audioContext.currentTime;
    this.activeNotes.forEach(({ oscillator, gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      oscillator.stop(now + 0.05);
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
}

export function XpshPlayer({ score, autoPlay = false }: XpshPlayerProps) {
  // ========================================================================
  // State
  // ========================================================================

  const [tempo, setTempo] = useState(score.timing.tempo_bpm);
  const synthRef = useRef<SimplePianoSynth | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // ========================================================================
  // Timeline Compilation
  // ========================================================================

  // Compile timeline từ score
  const baseTimeline = useMemo(() => {
    return compileTimeline(score);
  }, [score]);

  // Retime timeline theo tempo hiện tại
  const timeline = useMemo(() => {
    return retimeTimeline(baseTimeline, tempo);
  }, [baseTimeline, tempo]);

  // ========================================================================
  // Initialize Audio
  // ========================================================================

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create AudioContext
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create synthesizer
    synthRef.current = new SimplePianoSynth(audioContextRef.current);

    return () => {
      // Cleanup
      if (synthRef.current) {
        synthRef.current.stopAll();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // ========================================================================
  // Audio Callbacks
  // ========================================================================

  const handleNoteOn = useCallback((pitch: number, velocity: number, when: number) => {
    synthRef.current?.noteOn(pitch, velocity, when);
  }, []);

  const handleNoteOff = useCallback((pitch: number, when: number) => {
    synthRef.current?.noteOff(pitch, when);
  }, []);

  // ========================================================================
  // Audio Scheduler
  // ========================================================================

  const [state, controls] = useAudioScheduler(
    timeline,
    handleNoteOn,
    handleNoteOff,
    {
      lookaheadMs: 200,
      scheduleIntervalMs: 50
    }
  );

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
