/**
 * Player Demo Page
 * Demo trang để test XPSH Player với sample file
 */

'use client';

import React, { useState, useEffect } from 'react';
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPlayer } from '@/components/XpshPlayer';
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';

// ============================================================================
// Demo Page Component
// ============================================================================

export default function PlayerDemo() {
  const [score, setScore] = useState<XPSHScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ========================================================================
  // Load Sample Score
  // ========================================================================

  useEffect(() => {
    async function loadScore() {
      try {
        setLoading(true);
        setError(null);

        // Load sample_simple_scale.xpsh.json
        const response = await fetch('/samples/sample_simple_scale.xpsh.json');
        
        if (!response.ok) {
          throw new Error(`Failed to load score: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Validate XPSH format
        const validationResult = validateXpsh(data);
        if (!validationResult.valid) {
          const errorMessage = formatValidationErrors(validationResult);
          throw new Error(`Invalid XPSH file:\n${errorMessage}`);
        }

        setScore(data as XPSHScore);
      } catch (err) {
        console.error('Error loading score:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadScore();
  }, []);

  // ========================================================================
  // Render
  // ========================================================================

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p>Loading score...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <h2 style={styles.errorTitle}>❌ Error</h2>
          <p style={styles.errorMessage}>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <p>No score loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.pageTitle}>🎹 XPSH Player Demo</h1>
        <p style={styles.pageSubtitle}>Piano Sheet Playback Engine v1</p>
      </header>

      <main style={styles.main}>
        <XpshPlayer score={score} autoPlay={false} />
      </main>

      <footer style={styles.footer}>
        <div style={styles.documentation}>
          <h3>📖 Instructions</h3>
          <ul style={styles.instructionList}>
            <li><strong>Play:</strong> Start playback from current position</li>
            <li><strong>Pause:</strong> Pause playback (can resume)</li>
            <li><strong>Stop:</strong> Stop and reset to beginning</li>
            <li><strong>Tempo:</strong> Adjust playback speed (40-240 BPM)</li>
          </ul>
        </div>

        <div style={styles.technicalInfo}>
          <h3>⚙️ Technical Info</h3>
          <ul style={styles.infoList}>
            <li>Format: XPSH v1.0.0</li>
            <li>Audio: Web Audio API</li>
            <li>Scheduling: Lookahead 200ms</li>
            <li>Synthesizer: Simple Oscillator (Sine wave)</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    color: '#fff',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px'
  },
  pageTitle: {
    fontSize: '48px',
    fontWeight: 'bold',
    margin: '0 0 12px 0',
    background: 'linear-gradient(to right, #60a5fa, #a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  pageSubtitle: {
    fontSize: '18px',
    color: '#94a3b8',
    margin: 0
  },
  main: {
    marginBottom: '48px'
  },
  footer: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px'
  },
  documentation: {
    backgroundColor: '#1e293b',
    padding: '24px',
    borderRadius: '12px'
  },
  technicalInfo: {
    backgroundColor: '#1e293b',
    padding: '24px',
    borderRadius: '12px'
  },
  instructionList: {
    lineHeight: '1.8',
    color: '#cbd5e1'
  },
  infoList: {
    lineHeight: '1.8',
    color: '#cbd5e1'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '20px'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '5px solid #334155',
    borderTop: '5px solid #60a5fa',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '16px',
    textAlign: 'center'
  },
  errorTitle: {
    fontSize: '32px',
    margin: 0,
    color: '#ef4444'
  },
  errorMessage: {
    fontSize: '18px',
    color: '#cbd5e1',
    maxWidth: '500px'
  },
  retryButton: {
    padding: '12px 32px',
    fontSize: '16px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: 'white',
    cursor: 'pointer',
    marginTop: '16px'
  }
};
