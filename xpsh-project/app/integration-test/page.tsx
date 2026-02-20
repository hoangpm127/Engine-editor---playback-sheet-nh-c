/**
 * XPSH Phase 8 Integration Test Page
 * Loads 3 sample files: chords+accidentals, ties+pedal+triplet, two voices
 * Tests: validate → render → play
 */

'use client';

import React, { useState, useEffect } from 'react';
import { XPSHScore } from '@/lib/xpsh_helpers';
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';
import { ScoreCanvas } from '@/components/ScoreCanvas';
import { XpshPlayer } from '@/components/XpshPlayer';
import { compileTimeline, debugTimeline, TimelineEvent } from '@/lib/xpsh_timeline';

// ============================================================================
// Types
// ============================================================================

interface SampleTest {
  id: string;
  title: string;
  url: string;
  description: string;
  passCriteria: string[];
}

interface TestResult {
  sample: SampleTest;
  score: XPSHScore | null;
  loading: boolean;
  error: string | null;
  validationPassed: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  timelineEvents: number;
  noteOnCount: number;
  pedalDownCount: number;
  status: 'pending' | 'pass' | 'fail';
}

// ============================================================================
// Sample definitions
// ============================================================================

const SAMPLES: SampleTest[] = [
  {
    id: 'chords',
    title: '1. Chords + Accidentals',
    url: '/samples/sample_chords_accidentals.xpsh.json',
    description: 'Tests multiple noteheads per event (C/D/Eb major chords), sharp and flat accidentals, double-flat symbol.',
    passCriteria: [
      'validateXpsh passes',
      'All chord events have pitches[]',
      'Timeline has ≥ 2 NoteOn per chorded event',
      'Canvas renders multiple noteheads at same tick',
    ],
  },
  {
    id: 'ties-pedal-triplet',
    title: '2. Ties + Pedal + Triplet',
    url: '/samples/sample_ties_pedal_triplet.xpsh.json',
    description: 'Tests tie chain (C4 quarter→half→quarter = no re-attack), CC64 pedal events, triplet group scaling (3 notes in 960 ticks).',
    passCriteria: [
      'validateXpsh passes',
      'Tie stops cause suppressed NoteOn (tied pitches ≤ NoteOn count)',
      'CC64 down/up events present in timeline',
      'Triplet: 3 NoteOn events in ~640ms at 90BPM',
    ],
  },
  {
    id: 'two-voices',
    title: '3. Two Voices',
    url: '/samples/sample_two_voices.xpsh.json',
    description: 'Tests voice 1 (melody) and voice 2 (harmony) coexisting on same track/tick without crash.',
    passCriteria: [
      'validateXpsh passes',
      'Voice 1 and voice 2 events present',
      'No playback crash – all pitches compile to NoteOn/NoteOff',
      'Canvas distinguishes voice colors',
    ],
  },
];

// ============================================================================
// Component
// ============================================================================

export default function IntegrationTestPage() {
  const [results, setResults] = useState<TestResult[]>(
    SAMPLES.map(s => ({
      sample: s,
      score: null,
      loading: true,
      error: null,
      validationPassed: false,
      validationErrors: [],
      validationWarnings: [],
      timelineEvents: 0,
      noteOnCount: 0,
      pedalDownCount: 0,
      status: 'pending',
    }))
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [showDebugIdx, setShowDebugIdx] = useState<number | null>(null);

  // ── Load all samples ────────────────────────────────────────────────────

  useEffect(() => {
    SAMPLES.forEach(async (sample, idx) => {
      try {
        const resp = await fetch(sample.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        const data = await resp.json();

        const vResult = validateXpsh(data);
        let timelineEvents = 0, noteOnCount = 0, pedalDownCount = 0;

        if (vResult.valid) {
          const score = data as XPSHScore;
          try {
            const timeline = compileTimeline(score);
            timelineEvents = timeline.events.length;
            noteOnCount = timeline.events.filter((e: TimelineEvent) => e.type === 'on').length;
            pedalDownCount = timeline.events.filter((e: TimelineEvent) => e.type === 'cc64' && (e as {value: number}).value === 127).length;
          } catch (compileErr) {
            console.error('Compile error:', compileErr);
          }
        }

        setResults((prev: TestResult[]) => prev.map((r: TestResult, i: number) =>
          i !== idx ? r : {
            ...r,
            score: vResult.valid ? (data as XPSHScore) : null,
            loading: false,
            error: null,
            validationPassed: vResult.valid,
            validationErrors: vResult.errors,
            validationWarnings: vResult.warnings,
            timelineEvents,
            noteOnCount,
            pedalDownCount,
            status: vResult.valid ? 'pass' : 'fail',
          }
        ));
      } catch (err) {
        setResults((prev: TestResult[]) => prev.map((r: TestResult, i: number) =>
          i !== idx ? r : {
            ...r,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            status: 'fail',
          }
        ));
      }
    });
  }, []);

  const activeResult = results[activeIdx];

  return (
    <div style={s.page}>
      <header style={s.header}>
        <h1 style={s.title}>🧪 Phase 8 Integration Tests</h1>
        <p style={s.subtitle}>Validates chords, accidentals, ties, pedal, triplets, and two voices</p>
      </header>

      {/* Summary bar */}
      <div style={s.summaryBar}>
        {results.map((r: TestResult, idx: number) => (
          <button
            key={r.sample.id}
            onClick={() => setActiveIdx(idx)}
            style={{
              ...s.summaryBtn,
              ...(activeIdx === idx ? s.summaryBtnActive : {}),
              ...(r.status === 'pass' ? s.summaryPass : r.status === 'fail' ? s.summaryFail : {}),
            }}
          >
            {r.loading ? '⏳' : r.status === 'pass' ? '✅' : '❌'} {r.sample.title}
          </button>
        ))}
      </div>

      {/* Active test detail */}
      <div style={s.detail}>
        {/* Test header */}
        <div style={s.detailHeader}>
          <h2 style={s.detailTitle}>{activeResult.sample.title}</h2>
          <p style={s.detailDesc}>{activeResult.sample.description}</p>
        </div>

        {/* Status */}
        <div style={s.statusRow}>
          {activeResult.loading && <span style={s.badge}>⏳ Loading…</span>}
          {!activeResult.loading && activeResult.error && (
            <span style={{ ...s.badge, ...s.badgeFail }}>❌ Load Error: {activeResult.error}</span>
          )}
          {!activeResult.loading && !activeResult.error && (
            <>
              <span style={{ ...s.badge, ...(activeResult.validationPassed ? s.badgePass : s.badgeFail) }}>
                {activeResult.validationPassed ? '✅ Validation PASS' : '❌ Validation FAIL'}
              </span>
              <span style={s.badge}>📊 {activeResult.timelineEvents} timeline events</span>
              <span style={s.badge}>🎵 {activeResult.noteOnCount} NoteOn</span>
              {activeResult.pedalDownCount > 0 && (
                <span style={{ ...s.badge, ...s.badgePedal }}>🦶 {activeResult.pedalDownCount} Pedal ↓</span>
              )}
            </>
          )}
        </div>

        {/* Validation errors/warnings */}
        {activeResult.validationErrors.length > 0 && (
          <div style={s.errorBox}>
            <strong>Validation Errors:</strong>
            <ul>{activeResult.validationErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        {activeResult.validationWarnings.length > 0 && (
          <div style={s.warnBox}>
            <strong>Warnings:</strong>
            <ul>{activeResult.validationWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {/* Pass criteria checklist */}
        <div style={s.criteria}>
          <h3 style={s.criteriaTitle}>Pass Criteria</h3>
          <ul style={s.criteriaList}>
            {activeResult.sample.passCriteria.map((c, i) => (
              <li key={i} style={s.criteriaItem}>
                <span style={activeResult.status === 'pass' ? s.checkPass : s.checkPending}>
                  {activeResult.status === 'pass' ? '✅' : activeResult.status === 'fail' ? '❌' : '⏳'}
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Score canvas */}
        {activeResult.score && (
          <div style={s.canvasSection}>
            <h3 style={s.sectionTitle}>Score Preview</h3>
            <ScoreCanvas
              score={activeResult.score}
              selectedNoteId={null}
              onNoteClick={() => {}}
              onCanvasClick={() => {}}
            />
          </div>
        )}

        {/* Playback */}
        {activeResult.score && (
          <div style={s.playerSection}>
            <h3 style={s.sectionTitle}>Playback Test</h3>
            <p style={s.playerHint}>
              {activeResult.sample.id === 'chords' && '→ Should hear multiple pitches simultaneously (chords).'}
              {activeResult.sample.id === 'ties-pedal-triplet' && '→ C4 should sustain across tie; three fast notes (triplet) at beat 3; LH notes sustained by pedal.'}
              {activeResult.sample.id === 'two-voices' && '→ Should hear melody + harmony layers without crash.'}
            </p>
            <XpshPlayer score={activeResult.score} autoPlay={false} />
          </div>
        )}

        {/* Debug toggle */}
        <div style={s.debugRow}>
          <button onClick={() => setShowDebugIdx((i: number | null) => i === activeIdx ? null : activeIdx)}
            style={s.debugBtn}>
            {showDebugIdx === activeIdx ? 'Hide Debug' : '🔍 Show Timeline Debug'}
          </button>
          {showDebugIdx === activeIdx && activeResult.score && (
            <DebugPanel score={activeResult.score} />
          )}
        </div>
      </div>

      {/* All tests overview */}
      <div style={s.overview}>
        <h2 style={s.overviewTitle}>All Tests Summary</h2>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Test</th>
              <th style={s.th}>Validation</th>
              <th style={s.th}>NoteOn</th>
              <th style={s.th}>Pedal ↓</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r: TestResult) => (
              <tr key={r.sample.id} style={{ cursor: 'pointer' }} onClick={() => setActiveIdx(results.indexOf(r))}>
                <td style={s.td}>{r.sample.title}</td>
                <td style={s.td}>{r.loading ? '…' : r.validationPassed ? '✅ PASS' : '❌ FAIL'}</td>
                <td style={s.td}>{r.noteOnCount}</td>
                <td style={s.td}>{r.pedalDownCount}</td>
                <td style={{ ...s.td, fontWeight: 'bold', color: r.status === 'pass' ? '#059669' : r.status === 'fail' ? '#dc2626' : '#92400e' }}>
                  {r.loading ? 'loading…' : r.status.toUpperCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Debug Panel sub-component
// ============================================================================

function DebugPanel({ score }: { score: XPSHScore }) {
  const [log, setLog] = useState<string>('');

  useEffect(() => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
      const timeline = compileTimeline(score);
      debugTimeline(timeline, 40);
    } finally {
      console.log = orig;
    }
    setLog(lines.join('\n'));
  }, [score]);

  return (
    <pre style={{
      marginTop: 12, padding: 16, background: '#1e293b', color: '#94a3b8',
      borderRadius: 8, fontSize: 12, overflowX: 'auto', maxHeight: 300,
    }}>
      {log}
    </pre>
  );
}

// ============================================================================
// Styles
// ============================================================================

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#f8fafc', padding: 24, fontFamily: 'system-ui, sans-serif' },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', margin: 0, color: '#0f172a' },
  subtitle: { color: '#64748b', marginTop: 6 },
  summaryBar: { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  summaryBtn: {
    padding: '10px 18px', borderRadius: 8, border: '2px solid #e2e8f0',
    background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 14,
  },
  summaryBtnActive: { borderColor: '#3b82f6', color: '#1d4ed8' },
  summaryPass: { borderColor: '#86efac' },
  summaryFail: { borderColor: '#fca5a5' },

  detail: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  detailHeader: { marginBottom: 16 },
  detailTitle: { fontSize: 22, fontWeight: 'bold', margin: 0 },
  detailDesc: { color: '#475569', marginTop: 6 },

  statusRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  badge: { padding: '4px 12px', borderRadius: 20, background: '#f1f5f9', fontSize: 13, border: '1px solid #e2e8f0' },
  badgePass: { background: '#dcfce7', borderColor: '#86efac', color: '#15803d' },
  badgeFail: { background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' },
  badgePedal: { background: '#ede9fe', borderColor: '#c4b5fd', color: '#5b21b6' },

  errorBox: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 12, color: '#7f1d1d', fontSize: 14 },
  warnBox: { background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 16px', marginBottom: 12, color: '#713f12', fontSize: 14 },

  criteria: { marginBottom: 20 },
  criteriaTitle: { fontSize: 16, fontWeight: 600, marginBottom: 8 },
  criteriaList: { listStyle: 'none', padding: 0, margin: 0 },
  criteriaItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 14, color: '#374151' },
  checkPass: { fontSize: 16 },
  checkPending: { fontSize: 16 },

  canvasSection: { marginBottom: 20 },
  playerSection: { marginBottom: 20 },
  playerHint: { color: '#6b7280', fontSize: 14, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 10 },

  debugRow: { marginTop: 12 },
  debugBtn: { padding: '6px 14px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 13 },

  overview: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  overviewTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontWeight: 600 },
  td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9' },
};
