/**
 * Practice Mode Demo Page
 * Demo trang để test XPSH Practice Player với A-B loop
 */

'use client';

import React, { useState, useEffect } from 'react';
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPracticePlayer } from '@/components/XpshPracticePlayer';
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';

// ============================================================================
// Demo Page Component
// ============================================================================

export default function PracticeDemo() {
  const [score, setScore] = useState<XPSHScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState<string>('sample_simple_scale');

  // ========================================================================
  // Available Samples
  // ========================================================================

  const samples = [
    { id: 'sample_simple_scale', name: 'Simple Scale (C Major)', file: '/samples/sample_simple_scale.xpsh.json' },
    { id: 'sample_two_hands', name: 'Two Hands Demo', file: '/samples/sample_two_hands.xpsh.json' }
  ];

  // ========================================================================
  // Load Sample Score
  // ========================================================================

  useEffect(() => {
    async function loadScore() {
      try {
        setLoading(true);
        setError(null);

        const sample = samples.find(s => s.id === selectedSample);
        if (!sample) {
          throw new Error('Sample not found');
        }

        // Load sample file
        const response = await fetch(sample.file);
        
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
  }, [selectedSample]);

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
          <div style={styles.errorDetails}>
            <p><strong>Troubleshooting:</strong></p>
            <ul>
              <li>Make sure sample files (.xpsh.json) are in the <code>public/</code> folder</li>
              <li>Check browser console for detailed error messages</li>
              <li>Verify the JSON file is valid XPSH format</li>
            </ul>
          </div>
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
      {/* Page Header */}
      <header style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🎹 XPSH Practice Mode Demo</h1>
        <p style={styles.pageSubtitle}>
          Practice with A-B Loop & Measure Seeking
        </p>
      </header>

      {/* Sample Selector */}
      <div style={styles.sampleSelector}>
        <label style={styles.sampleLabel}>Select Sample:</label>
        <select 
          value={selectedSample}
          onChange={(e) => setSelectedSample(e.target.value)}
          style={styles.sampleSelect}
        >
          {samples.map(sample => (
            <option key={sample.id} value={sample.id}>
              {sample.name}
            </option>
          ))}
        </select>
      </div>

      {/* Practice Player */}
      <XpshPracticePlayer score={score} autoPlay={false} />

      {/* Instructions */}
      <div style={styles.instructions}>
        <h3 style={styles.instructionsTitle}>📖 How to Use Practice Mode</h3>
        
        <div style={styles.instructionSection}>
          <h4 style={styles.instructionSubtitle}>1️⃣ Set Loop Points</h4>
          <ul style={styles.instructionList}>
            <li>Click "Set A" button, then click on a measure to set start point (A)</li>
            <li>Click "Set B" button, then click on a measure to set end point (B)</li>
            <li>The loop region (A→B) will be highlighted in blue</li>
          </ul>
        </div>

        <div style={styles.instructionSection}>
          <h4 style={styles.instructionSubtitle}>2️⃣ Enable Loop</h4>
          <ul style={styles.instructionList}>
            <li>Once A and B are set, click "Loop ON" to enable looping</li>
            <li>During playback, when reaching measure B+1, it will jump back to measure A</li>
            <li>Click "Loop OFF" to disable looping</li>
          </ul>
        </div>

        <div style={styles.instructionSection}>
          <h4 style={styles.instructionSubtitle}>3️⃣ Seek to Measure</h4>
          <ul style={styles.instructionList}>
            <li><strong>Double-click</strong> on any measure to jump to that position</li>
            <li>Useful for quickly navigating to specific sections</li>
          </ul>
        </div>

        <div style={styles.instructionSection}>
          <h4 style={styles.instructionSubtitle}>4️⃣ Adjust Tempo</h4>
          <ul style={styles.instructionList}>
            <li>Use the tempo slider to practice at slower speeds (40-240 BPM)</li>
            <li>Cannot change tempo while playing (pause first)</li>
          </ul>
        </div>

        <div style={styles.instructionSection}>
          <h4 style={styles.instructionSubtitle}>💡 Tips</h4>
          <ul style={styles.instructionList}>
            <li><strong>Start small:</strong> Loop 1-2 measures for difficult passages</li>
            <li><strong>Slow down:</strong> Reduce tempo to 50-70% for practicing</li>
            <li><strong>Gradual increase:</strong> Slowly increase tempo as you improve</li>
            <li><strong>Clear loop:</strong> Click "Clear" to reset and set new loop points</li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>XPSH Practice Mode v1.0 | Built with Next.js + Web Audio API</p>
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
    padding: '40px 20px',
    backgroundColor: '#f0f2f5',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  
  pageHeader: {
    textAlign: 'center',
    marginBottom: '32px'
  },
  
  pageTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#212529',
    margin: '0 0 8px 0'
  },
  
  pageSubtitle: {
    fontSize: '18px',
    color: '#6c757d',
    margin: 0
  },
  
  sampleSelector: {
    maxWidth: '900px',
    margin: '0 auto 24px auto',
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  
  sampleLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#495057'
  },
  
  sampleSelect: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#495057',
    cursor: 'pointer'
  },
  
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px'
  },
  
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e9ecef',
    borderTop: '4px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  
  errorContainer: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '32px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    textAlign: 'center'
  },
  
  errorTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: '16px'
  },
  
  errorMessage: {
    fontSize: '16px',
    color: '#495057',
    marginBottom: '16px',
    fontFamily: 'monospace',
    backgroundColor: '#f8f9fa',
    padding: '12px',
    borderRadius: '4px'
  },
  
  errorDetails: {
    textAlign: 'left',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '6px',
    fontSize: '14px'
  },
  
  retryButton: {
    padding: '12px 32px',
    fontSize: '16px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#007bff',
    color: '#fff',
    cursor: 'pointer'
  },
  
  instructions: {
    maxWidth: '900px',
    margin: '40px auto 0 auto',
    padding: '32px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  
  instructionsTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: '24px',
    borderBottom: '2px solid #e9ecef',
    paddingBottom: '12px'
  },
  
  instructionSection: {
    marginBottom: '24px'
  },
  
  instructionSubtitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#495057',
    marginBottom: '8px'
  },
  
  instructionList: {
    marginLeft: '20px',
    color: '#6c757d',
    lineHeight: 1.8
  },
  
  footer: {
    textAlign: 'center',
    marginTop: '40px',
    padding: '20px',
    color: '#6c757d',
    fontSize: '14px'
  }
};
