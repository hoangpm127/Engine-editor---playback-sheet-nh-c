/**
 * XPSH Editor Page
 * Web-based piano score editor với playback
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { XPSHScore } from '@/lib/xpsh_helpers';
import { ScoreCanvas } from '@/components/ScoreCanvas';
import { XpshPlayer } from '@/components/XpshPlayer';
import {
  insertNote,
  deleteNote,
  clearAllNotes,
  countNotes,
  DurationType,
  DURATION_VALUES
} from '@/lib/editor_ops';
import {
  downloadXpsh,
  createEmptyScore,
  updateMetadata,
  loadXpshFile
} from '@/lib/exportXpsh';

// ============================================================================
// Component
// ============================================================================

export default function XpshEditorPage() {
  // ==========================================================================
  // State
  // ==========================================================================

  const [score, setScore] = useState<XPSHScore>(() => 
    createEmptyScore('My Piano Piece')
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentDuration, setCurrentDuration] = useState<DurationType>('quarter');
  const [currentTrack, setCurrentTrack] = useState<'track_rh' | 'track_lh'>('track_rh');
  const [showPlayer, setShowPlayer] = useState(false);
  const [title, setTitle] = useState('My Piano Piece');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================================================
  // Note Operations
  // ==========================================================================

  const handleCanvasClick = useCallback((pitch: number, tick: number, trackId: string) => {
    // Insert note với current duration và track
    const newScore = insertNote(score, {
      pitch,
      start_tick: tick,
      dur_tick: DURATION_VALUES[currentDuration],
      velocity: 80,
      trackId: currentTrack  // Use selected track instead of inferred from click
    });
    setScore(newScore);
    setSelectedNoteId(null);
  }, [score, currentDuration, currentTrack]);

  const handleNoteClick = useCallback((noteId: string, pitch: number, tick: number) => {
    // Select note
    setSelectedNoteId(noteId);
  }, []);

  const handleDeleteNote = useCallback(() => {
    if (!selectedNoteId) return;

    const newScore = deleteNote(score, selectedNoteId);
    setScore(newScore);
    setSelectedNoteId(null);
  }, [score, selectedNoteId]);

  const handleClearAll = useCallback(() => {
    if (!confirm('Are you sure you want to clear all notes?')) return;

    const newScore = clearAllNotes(score);
    setScore(newScore);
    setSelectedNoteId(null);
  }, [score]);

  // ==========================================================================
  // Keyboard Shortcuts
  // ==========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteNote();
      }

      // Escape key - deselect
      if (e.key === 'Escape') {
        setSelectedNoteId(null);
      }

      // Number keys - duration
      if (e.key === '1') setCurrentDuration('quarter');
      if (e.key === '2') setCurrentDuration('half');
      if (e.key === '3') setCurrentDuration('whole');

      // R/L keys - track
      if (e.key === 'r' || e.key === 'R') setCurrentTrack('track_rh');
      if (e.key === 'l' || e.key === 'L') setCurrentTrack('track_lh');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteNote]);

  // ==========================================================================
  // File Operations
  // ==========================================================================

  const handleExport = useCallback(() => {
    downloadXpsh(score);
  }, [score]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const loadedScore = await loadXpshFile(file);
      setScore(loadedScore);
      setTitle(loadedScore.metadata.title);
      setSelectedNoteId(null);
    } catch (error) {
      alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setScore(updateMetadata(score, { title: newTitle }));
  }, [score]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.pageTitle}>🎹 XPSH Piano Editor</h1>
          <div style={styles.titleEditor}>
            <label style={styles.label}>Title:</label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              style={styles.titleInput}
            />
          </div>
        </div>
      </header>

      {/* Controls */}
      <div style={styles.controls}>
        {/* Duration Selection */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>Duration (1,2,3):</label>
          <div style={styles.buttonGroup}>
            <button
              onClick={() => setCurrentDuration('quarter')}
              style={{
                ...styles.button,
                ...(currentDuration === 'quarter' ? styles.buttonActive : {})
              }}
            >
              ♩ Quarter
            </button>
            <button
              onClick={() => setCurrentDuration('half')}
              style={{
                ...styles.button,
                ...(currentDuration === 'half' ? styles.buttonActive : {})
              }}
            >
              𝅗𝅥 Half
            </button>
            <button
              onClick={() => setCurrentDuration('whole')}
              style={{
                ...styles.button,
                ...(currentDuration === 'whole' ? styles.buttonActive : {})
              }}
            >
              𝅝 Whole
            </button>
          </div>
        </div>

        {/* Track Selection */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>Track (R/L):</label>
          <div style={styles.buttonGroup}>
            <button
              onClick={() => setCurrentTrack('track_rh')}
              style={{
                ...styles.button,
                ...(currentTrack === 'track_rh' ? styles.buttonActive : {})
              }}
            >
              RH (Right)
            </button>
            <button
              onClick={() => setCurrentTrack('track_lh')}
              style={{
                ...styles.button,
                ...(currentTrack === 'track_lh' ? styles.buttonActive : {})
              }}
            >
              LH (Left)
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>Actions:</label>
          <div style={styles.buttonGroup}>
            <button
              onClick={handleDeleteNote}
              disabled={!selectedNoteId}
              style={styles.button}
            >
              🗑️ Delete (Del)
            </button>
            <button
              onClick={handleClearAll}
              style={styles.button}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* File Operations */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>File:</label>
          <div style={styles.buttonGroup}>
            <button onClick={handleExport} style={styles.buttonPrimary}>
              💾 Export .xpsh
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.button}
            >
              📂 Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xpsh,.json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Playback */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>Playback:</label>
          <button
            onClick={() => setShowPlayer(!showPlayer)}
            style={styles.buttonPrimary}
          >
            {showPlayer ? '🎵 Hide Player' : '▶️ Show Player'}
          </button>
        </div>

        {/* Info */}
        <div style={styles.info}>
          <span>Notes: {countNotes(score)}</span>
          <span>Selected: {selectedNoteId ? '✓' : '—'}</span>
        </div>
      </div>

      {/* Score Canvas */}
      <div style={styles.canvasWrapper}>
        <ScoreCanvas
          score={score}
          selectedNoteId={selectedNoteId}
          onNoteClick={handleNoteClick}
          onCanvasClick={handleCanvasClick}
        />
      </div>

      {/* Player (collapsible) */}
      {showPlayer && (
        <div style={styles.playerContainer}>
          <h3 style={styles.sectionTitle}>Playback</h3>
          <XpshPlayer score={score} autoPlay={false} />
        </div>
      )}

      {/* Instructions */}
      <div style={styles.instructions}>
        <h3 style={styles.sectionTitle}>📖 Instructions</h3>
        <div style={styles.instructionGrid}>
          <div style={styles.instructionCard}>
            <h4>🖱️ Mouse</h4>
            <ul>
              <li>Click on staff to add note</li>
              <li>Click on note to select</li>
              <li>Orange = selected</li>
            </ul>
          </div>
          <div style={styles.instructionCard}>
            <h4>⌨️ Keyboard</h4>
            <ul>
              <li><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> - Duration</li>
              <li><kbd>R</kbd> <kbd>L</kbd> - RH/LH track</li>
              <li><kbd>Delete</kbd> - Remove note</li>
              <li><kbd>Esc</kbd> - Deselect</li>
            </ul>
          </div>
          <div style={styles.instructionCard}>
            <h4>📝 Notes</h4>
            <ul>
              <li>8 measures, 4/4 time</li>
              <li>Range: C3 to C6</li>
              <li>Duration line shows length</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  header: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '24px',
    flexWrap: 'wrap'
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: 0,
    color: '#111827'
  },
  titleEditor: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  titleInput: {
    fontSize: '18px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    minWidth: '250px'
  },
  controls: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap'
  },
  label: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#374151',
    minWidth: '120px'
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  buttonActive: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderColor: '#3b82f6'
  },
  buttonPrimary: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#10b981',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  info: {
    display: 'flex',
    gap: '20px',
    fontSize: '14px',
    color: '#6b7280',
    marginLeft: 'auto'
  },
  canvasWrapper: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  playerContainer: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#111827'
  },
  instructions: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  instructionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px'
  },
  instructionCard: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  }
};
