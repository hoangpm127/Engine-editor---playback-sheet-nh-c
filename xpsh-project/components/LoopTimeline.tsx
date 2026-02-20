/**
 * Loop Timeline Component
 * Visual timeline để chọn A-B loop points theo measure
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Constants
// ============================================================================

const TOTAL_MEASURES = 8;
const TICKS_PER_MEASURE = 1920; // 4 beats * 480 ticks/beat

// ============================================================================
// Types
// ============================================================================

export interface LoopRange {
  measureA: number | null;  // Measure index (0-7), null = chưa chọn
  measureB: number | null;  // Measure index (0-7), null = chưa chọn
}

export interface LoopTimelineProps {
  /** Current playback position (ms) */
  currentMs: number;
  
  /** Total duration (ms) */
  durationMs: number;
  
  /** Tempo (BPM) */
  tempo: number;
  
  /** Loop enabled state */
  loopEnabled: boolean;
  
  /** Loop range (measures) */
  loopRange: LoopRange;
  
  /** Callback khi select measure A */
  onSetA: (measure: number) => void;
  
  /** Callback khi select measure B */
  onSetB: (measure: number) => void;
  
  /** Callback khi toggle loop */
  onToggleLoop: () => void;
  
  /** Callback khi click measure để seek */
  onSeekToMeasure: (measure: number) => void;
  
  /** Callback khi clear loop range */
  onClearLoop: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert measure index sang tick
 */
function measureToTick(measure: number): number {
  return measure * TICKS_PER_MEASURE;
}

/**
 * Convert tick sang ms
 */
function tickToMs(tick: number, tempo: number): number {
  const quarterNoteDurationMs = (60 / tempo) * 1000;
  return (tick / 480) * quarterNoteDurationMs;
}

/**
 * Convert ms sang measure (approximate)
 */
function msToMeasure(ms: number, tempo: number): number {
  const quarterNoteDurationMs = (60 / tempo) * 1000;
  const measureDurationMs = quarterNoteDurationMs * 4; // 4 beats
  return ms / measureDurationMs;
}

// ============================================================================
// LoopTimeline Component
// ============================================================================

export function LoopTimeline({
  currentMs,
  durationMs,
  tempo,
  loopEnabled,
  loopRange,
  onSetA,
  onSetB,
  onToggleLoop,
  onSeekToMeasure,
  onClearLoop
}: LoopTimelineProps) {
  
  // ========================================================================
  // State
  // ========================================================================
  
  const [hoverMeasure, setHoverMeasure] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState<'A' | 'B'>('A');
  
  // ========================================================================
  // Computed Values
  // ========================================================================
  
  // Calculate current measure position
  const currentMeasure = useMemo(() => {
    return msToMeasure(currentMs, tempo);
  }, [currentMs, tempo]);
  
  // Calculate loop range in measures
  const loopStartMeasure = loopRange.measureA;
  const loopEndMeasure = loopRange.measureB;
  
  // Validate loop range (A should be before B)
  const isValidLoop = useMemo(() => {
    if (loopStartMeasure === null || loopEndMeasure === null) return false;
    return loopStartMeasure < loopEndMeasure;
  }, [loopStartMeasure, loopEndMeasure]);
  
  // ========================================================================
  // Handlers
  // ========================================================================
  
  /**
   * Handle click on measure
   */
  const handleMeasureClick = useCallback((measure: number) => {
    if (selectionMode === 'A') {
      onSetA(measure);
      setSelectionMode('B'); // Auto switch to B after setting A
    } else {
      onSetB(measure);
      setSelectionMode('A'); // Auto switch to A after setting B
    }
  }, [selectionMode, onSetA, onSetB]);
  
  /**
   * Handle double click to seek
   */
  const handleMeasureDoubleClick = useCallback((measure: number) => {
    onSeekToMeasure(measure);
  }, [onSeekToMeasure]);
  
  /**
   * Check if measure is in loop range
   */
  const isInLoopRange = useCallback((measure: number): boolean => {
    if (!isValidLoop || loopStartMeasure === null || loopEndMeasure === null) {
      return false;
    }
    return measure >= loopStartMeasure && measure <= loopEndMeasure;
  }, [isValidLoop, loopStartMeasure, loopEndMeasure]);
  
  // ========================================================================
  // Render
  // ========================================================================
  
  return (
    <div className="loop-timeline" style={styles.container}>
      
      {/* Header Controls */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={styles.title}>Practice Mode - Loop A→B</h3>
          <div style={styles.instructions}>
            Single click: {selectionMode === 'A' ? 'Set A' : 'Set B'} | 
            Double click: Seek to measure
          </div>
        </div>
        
        <div style={styles.controls}>
          {/* Selection Mode Buttons */}
          <div style={styles.buttonGroup}>
            <button
              onClick={() => setSelectionMode('A')}
              style={{
                ...styles.modeButton,
                ...(selectionMode === 'A' ? styles.modeButtonActive : {})
              }}
            >
              Set A
            </button>
            <button
              onClick={() => setSelectionMode('B')}
              style={{
                ...styles.modeButton,
                ...(selectionMode === 'B' ? styles.modeButtonActive : {})
              }}
            >
              Set B
            </button>
          </div>
          
          {/* Loop Toggle */}
          <button
            onClick={onToggleLoop}
            disabled={!isValidLoop}
            style={{
              ...styles.loopButton,
              ...(loopEnabled ? styles.loopButtonActive : {}),
              ...(!isValidLoop ? styles.buttonDisabled : {})
            }}
          >
            {loopEnabled ? '🔁 Loop ON' : '🔁 Loop OFF'}
          </button>
          
          {/* Clear Loop */}
          {(loopStartMeasure !== null || loopEndMeasure !== null) && (
            <button
              onClick={onClearLoop}
              style={styles.clearButton}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      
      {/* Loop Range Info */}
      {isValidLoop && (
        <div style={styles.loopInfo}>
          Loop: M{(loopStartMeasure ?? 0) + 1} → M{(loopEndMeasure ?? 0) + 1}
          {loopEnabled && <span style={styles.loopActiveIndicator}> ● ACTIVE</span>}
        </div>
      )}
      
      {/* Timeline Measures */}
      <div style={styles.timeline}>
        {Array.from({ length: TOTAL_MEASURES }, (_, i) => {
          const measureNum = i + 1; // Display as 1-8
          const isLoopStart = loopStartMeasure === i;
          const isLoopEnd = loopEndMeasure === i;
          const inLoop = isInLoopRange(i);
          const isCurrent = currentMeasure >= i && currentMeasure < i + 1;
          const isHovered = hoverMeasure === i;
          
          return (
            <div
              key={i}
              style={{
                ...styles.measure,
                ...(inLoop ? styles.measureInLoop : {}),
                ...(isCurrent ? styles.measureCurrent : {}),
                ...(isHovered ? styles.measureHover : {})
              }}
              onClick={() => handleMeasureClick(i)}
              onDoubleClick={() => handleMeasureDoubleClick(i)}
              onMouseEnter={() => setHoverMeasure(i)}
              onMouseLeave={() => setHoverMeasure(null)}
            >
              {/* Measure Number */}
              <div style={styles.measureNumber}>
                {measureNum}
              </div>
              
              {/* A/B Markers */}
              <div style={styles.markers}>
                {isLoopStart && (
                  <div style={styles.markerA}>A</div>
                )}
                {isLoopEnd && (
                  <div style={styles.markerB}>B</div>
                )}
              </div>
              
              {/* Current Position Indicator */}
              {isCurrent && (
                <div 
                  style={{
                    ...styles.currentIndicator,
                    left: `${((currentMeasure - i) * 100)}%`
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6'
  },
  
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#212529'
  },
  
  instructions: {
    fontSize: '12px',
    color: '#6c757d'
  },
  
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  
  buttonGroup: {
    display: 'flex',
    gap: '4px',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  
  modeButton: {
    padding: '6px 16px',
    border: 'none',
    backgroundColor: '#fff',
    color: '#495057',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  
  modeButtonActive: {
    backgroundColor: '#007bff',
    color: '#fff'
  },
  
  loopButton: {
    padding: '6px 16px',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#495057',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  
  loopButtonActive: {
    backgroundColor: '#28a745',
    color: '#fff',
    borderColor: '#28a745'
  },
  
  clearButton: {
    padding: '6px 12px',
    border: '1px solid #dc3545',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#dc3545',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  
  loopInfo: {
    padding: '8px 12px',
    backgroundColor: '#e7f3ff',
    border: '1px solid #b3d9ff',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#004085',
    marginBottom: '12px'
  },
  
  loopActiveIndicator: {
    color: '#28a745',
    fontWeight: 700
  },
  
  timeline: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: '8px',
    marginTop: '12px'
  },
  
  measure: {
    position: 'relative',
    height: '80px',
    backgroundColor: '#fff',
    border: '2px solid #dee2e6',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  
  measureInLoop: {
    backgroundColor: '#e7f3ff',
    borderColor: '#007bff'
  },
  
  measureCurrent: {
    borderColor: '#28a745',
    borderWidth: '3px',
    boxShadow: '0 0 8px rgba(40, 167, 69, 0.3)'
  },
  
  measureHover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
  },
  
  measureNumber: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#495057'
  },
  
  markers: {
    position: 'absolute',
    top: '4px',
    left: '0',
    right: '0',
    display: 'flex',
    justifyContent: 'space-around',
    fontSize: '11px',
    fontWeight: 700
  },
  
  markerA: {
    padding: '2px 8px',
    backgroundColor: '#007bff',
    color: '#fff',
    borderRadius: '3px'
  },
  
  markerB: {
    padding: '2px 8px',
    backgroundColor: '#dc3545',
    color: '#fff',
    borderRadius: '3px'
  },
  
  currentIndicator: {
    position: 'absolute',
    bottom: 0,
    width: '3px',
    height: '100%',
    backgroundColor: '#28a745',
    opacity: 0.7,
    pointerEvents: 'none'
  }
};
