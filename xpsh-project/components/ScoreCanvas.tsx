/**
 * ScoreCanvas — VexFlow-based music notation renderer
 * Sử dụng thư viện VexFlow 4.x để hiển thị nốt nhạc chuẩn
 *
 * Layout: 2 systems × 4 measures each  →  CW ≈ 740px (fits viewport without scroll)
 * Coordinate math uses VF_OFFSET=40 (hardcoded — confirmed: stave(0,Y,w).getYForLine(0) = Y+40)
 */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  XPSHScore, AccidentalType,
  pitchToName, getTrackEvents
} from '@/lib/xpsh_helpers';
import { DURATION_VALUES } from '@/lib/editor_ops';
import type { DurationType } from '@/lib/editor_ops';

// ============================================================================
// MIDI ↔ VexFlow helpers
// ============================================================================

const SHARP_NAMES = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
const FLAT_NAMES  = ['c','db','d','eb','e','f','gb','g','ab','a','bb','b'];
const IS_NAT      = [true,false,true,false,true,true,false,true,false,true,false,true];
const C2D         = [0,0,1,1,2,3,3,4,4,5,5,6];
const D2C         = [0,2,4,5,7,9,11];

function dP(pitch: number) { return Math.floor(pitch / 12) * 7 + C2D[pitch % 12]; }

/** MIDI pitch → [vexflow key string, accidental string | null] */
function midiToVexKey(pitch: number, acc?: AccidentalType | null): [string, string | null] {
  const sem = pitch % 12;
  const oct = Math.floor(pitch / 12) - 1;
  if (acc === 'flat')        return [`${FLAT_NAMES[sem]}/${oct}`,  IS_NAT[sem] ? null : 'b'];
  if (acc === 'doubleFlat')  return [`${FLAT_NAMES[sem]}/${oct}`,  'bb'];
  if (acc === 'natural')     return [`${SHARP_NAMES[sem]}/${oct}`, IS_NAT[sem] ? null : 'n'];
  if (acc === 'doubleSharp') return [`${SHARP_NAMES[sem]}/${oct}`, '##'];
  return [`${SHARP_NAMES[sem]}/${oct}`, IS_NAT[sem] ? null : '#'];
}

/** dur_tick → [vexflow duration string, dots count] */
function ticksToVexDur(ticks: number): [string, number] {
  if (ticks >= 2880) return ['w',  1];
  if (ticks >= 1920) return ['w',  0];
  if (ticks >= 1440) return ['h',  1];
  if (ticks >= 960)  return ['h',  0];
  if (ticks >= 720)  return ['q',  1];
  if (ticks >= 480)  return ['q',  0];
  if (ticks >= 360)  return ['8',  1];
  if (ticks >= 240)  return ['8',  0];
  if (ticks >= 180)  return ['16', 1];
  if (ticks >= 120)  return ['16', 0];
  if (ticks >= 90)   return ['32', 1];
  return ['32', 0];
}

/** Fill gap ticks with appropriately-sized rest StaveNotes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRests(gapTicks: number, StaveNote: any): any[] {
  const SIZES: [number, string][] = [
    [1920,'w'],[960,'h'],[480,'q'],[240,'8'],[120,'16'],[60,'32'],
  ];
  const out = [];
  let rem = gapTicks;
  for (const [t, dur] of SIZES) {
    while (rem >= t) {
      out.push(new StaveNote({ keys: ['b/4'], duration: dur + 'r' }));
      rem -= t;
    }
  }
  return out;
}

// ============================================================================
// Layout constants
// ============================================================================

const TPQ        = 480;
const N_MEAS     = 8;
const N_PER_LINE = 4;               // measures per system
const N_LINES    = 2;               // number of systems

const MEAS_W  = 160;
const FIRST_W = 240;                // first measure of each system (has clef)
const CW      = FIRST_W + MEAS_W * (N_PER_LINE - 1) + 20;   // 740px

/**
 * VexFlow: stave(x, Y, w).getYForLine(0) === Y + 40
 * Verified empirically: node -e "require('vexflow').Stave; new Stave(0,30,200).getYForLine(0)" → 70
 */
const VF_OFFSET = 40;

/** Stave constructor Y within each system (relative to system top Y) */
const TREBLE_Y = 20;
const BASS_Y   = 110;

/** Actual rendered top staff line within each system (= constructor Y + VF_OFFSET) */
const TREBLE_TOP = TREBLE_Y + VF_OFFSET;   // 60px from system top
const BASS_TOP   = BASS_Y   + VF_OFFSET;   // 150px from system top

/** px per space between staff lines, px per diatonic half-step = VFS/2 */
const VFS = 10;

/** Height per system: treble staff + gap + bass staff + margin */
const SYSTEM_H = 220;

const CH = N_LINES * SYSTEM_H + 10;   // total canvas height

/** Diatonic positions for top staff lines: F5 = treble top, A3 = bass top */
const TR_TOP_DP = dP(77); // F5
const BS_TOP_DP = dP(57); // A3

// ============================================================================
// Per-system coordinate helpers
// ============================================================================

function lineOf(m: number)    { return Math.floor(m / N_PER_LINE); }
function posInLine(m: number) { return m % N_PER_LINE; }

/** Canvas X of measure's left edge (resets to 0 at each system start) */
function measX(m: number): number {
  const pos = posInLine(m);
  return pos === 0 ? 0 : FIRST_W + (pos - 1) * MEAS_W;
}
function measWidth(m: number): number { return posInLine(m) === 0 ? FIRST_W : MEAS_W; }

/** Canvas Y origin of system `line` */
function sysY(line: number): number { return line * SYSTEM_H; }

/** Absolute canvas Y of the top staff line for a given system */
function trebleTopY(line: number): number { return sysY(line) + TREBLE_TOP; }
function bassTopY  (line: number): number { return sysY(line) + BASS_TOP;   }

/**
 * MIDI pitch → absolute canvas Y.
 * topLineY = real Y of the top staff line (from staffTopYRef or hardcoded fallback).
 */
function pitchToAbsY(pitch: number, isBass: boolean, topLineY: number): number {
  const topDP = isBass ? BS_TOP_DP : TR_TOP_DP;
  return topLineY + (topDP - dP(pitch)) * (VFS / 2);
}

/** Absolute canvas Y → nearest diatonic MIDI pitch */
function absYToPitch(y: number, isBass: boolean, topLineY: number): number {
  const topDP = isBass ? BS_TOP_DP : TR_TOP_DP;
  const steps = Math.round((y - topLineY) / (VFS / 2));
  const total = topDP - steps;
  const oct   = Math.floor(total / 7);
  const diat  = ((total % 7) + 7) % 7;
  return Math.max(36, Math.min(96, oct * 12 + D2C[diat]));
}

// ============================================================================
// Default note-start X fallbacks (before first VexFlow render)
// ============================================================================

const DEFAULT_NOTE_START: number[] = Array.from({ length: N_MEAS }, (_, m) => {
  return measX(m) + (posInLine(m) === 0 ? 82 : 12);
});

/** tick → canvas X using per-measure note-start X */
function tickToOverlayX(tick: number, noteStartX: number[] = DEFAULT_NOTE_START): number {
  const m          = Math.min(N_MEAS - 1, Math.floor(tick / (4 * TPQ)));
  const beatInMeas = (tick % (4 * TPQ)) / TPQ;
  const naL        = noteStartX[m];
  const naW        = measX(m) + measWidth(m) - naL - 8;
  return naL + (beatInMeas / 4) * naW;
}

/**
 * Given absolute canvas (x, y), return the measure index m and the
 * beat-snapped absolute tick. Uses Y to identify which system we are in.
 */
function xyToTick(
  x: number, y: number,
  snapTicks: number,
  noteStartX: number[] = DEFAULT_NOTE_START,
): { m: number; tick: number } {
  const line = Math.min(N_LINES - 1, Math.floor(y / SYSTEM_H));
  // Which measure in this line?
  let foundM = line * N_PER_LINE;
  for (let pos = 0; pos < N_PER_LINE; pos++) {
    const thisM = line * N_PER_LINE + pos;
    const mEnd  = measX(thisM) + measWidth(thisM);
    if (pos === N_PER_LINE - 1 || x < mEnd) { foundM = thisM; break; }
  }
  const naL      = noteStartX[foundM];
  const naW      = measX(foundM) + measWidth(foundM) - naL - 8;
  const xIn      = Math.max(0, x - naL);
  const fracTick = Math.min(4 * TPQ - 1, (xIn / Math.max(naW, 1)) * 4 * TPQ);
  const snapped  = Math.round(fracTick / snapTicks) * snapTicks;
  return { m: foundM, tick: foundM * 4 * TPQ + Math.max(0, snapped) };
}

// ============================================================================
// Ghost overlay drawing constants (match VexFlow engraving metrics)
// ============================================================================

const OVL_SLS  = VFS;
const OVL_NRX  = 6.5;
const OVL_NRY  = 4.5;
const OVL_ANG  = -20;
const OVL_STEM = 35;
const OVL_LHW  = OVL_NRX + 5;

// ============================================================================
// Props + types
// ============================================================================

export interface ScoreCanvasProps {
  score: XPSHScore;
  selectedNoteId: string | null;
  onNoteClick: (noteId: string, pitch: number, tick: number) => void;
  onCanvasClick: (pitch: number, tick: number, trackId: string) => void;
  currentVoice?: 1 | 2;
  chordMode?: boolean;
  currentDuration?: DurationType;
  editorTool?: 'note' | 'tie' | 'pedal' | 'triplet';
}

interface NoteHit {
  eventId: string;
  pitch: number;
  startTick: number;
  cx: number;
  cy: number;
}

// ============================================================================
// Component
// ============================================================================

export function ScoreCanvas({
  score,
  selectedNoteId,
  onNoteClick,
  onCanvasClick,
  currentVoice = 1,
  chordMode    = false,
  currentDuration = 'quarter',
  editorTool   = 'note',
}: ScoreCanvasProps) {
  const containerRef      = useRef<HTMLDivElement>(null);
  const wrapperRef        = useRef<HTMLDivElement>(null);
  const noteHitsRef       = useRef<NoteHit[]>([]);
  const hoverPosRef       = useRef<typeof hoverPos>(null);
  const measNoteStartXRef = useRef<number[]>([...DEFAULT_NOTE_START]);
  // Sorted [tick, x][] from getAbsoluteX(), SEPARATED by clef to avoid cross-contamination.
  const tickActualXRef    = useRef<{ treble: [number, number][]; bass: [number, number][] }>(
    { treble: [], bass: [] },
  );
  /**
   * Real VexFlow top-staff-line Y per system per clef, populated from stave.getYForLine(0)
   * after each draw. Indexed by system line number (0 = first system, 1 = second, etc.).
   * Falls back to hardcoded trebleTopY(line) / bassTopY(line) before first render.
   */
  const staffTopYRef = useRef<{ treble: number[]; bass: number[] }>({ treble: [], bass: [] });

  const [hoverPos, setHoverPos] = useState<{
    x: number; y: number;
    pitch: number; tick: number;
    isBass: boolean; staveTopY: number; line: number;
  } | null>(null);

  // ============================================================================
  // VexFlow render
  // ============================================================================

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    noteHitsRef.current    = [];
    tickActualXRef.current = { treble: [], bass: [] };

    import('vexflow').then((VF) => {
      const { Renderer, Stave, StaveNote, StaveConnector, Voice, Formatter, Accidental } = VF;
      if (!containerRef.current) return;

      const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
      renderer.resize(CW, CH);
      const ctx = renderer.getContext();

      // Cream background rect
      const svgEl = containerRef.current.querySelector('svg');
      if (svgEl) {
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', String(CW));
        bg.setAttribute('height', String(CH));
        bg.setAttribute('fill', '#fffef8');
        svgEl.insertBefore(bg, svgEl.firstChild);
      }

      const newTickActualX: { treble: [number, number][]; bass: [number, number][] } = { treble: [], bass: [] };

      for (let line = 0; line < N_LINES; line++) {
        const sy = sysY(line);

        for (let pos = 0; pos < N_PER_LINE; pos++) {
          const m  = line * N_PER_LINE + pos;
          const mx = measX(m);
          const mw = measWidth(m);

          const trebleStave = new Stave(mx, sy + TREBLE_Y, mw);
          const bassStave   = new Stave(mx, sy + BASS_Y,   mw);

          if (pos === 0) {
            trebleStave.addClef('treble');
            bassStave.addClef('bass');
            if (line === 0) {
              trebleStave.addTimeSignature('4/4');
              bassStave.addTimeSignature('4/4');
            }
          }

          trebleStave.setContext(ctx).draw();
          bassStave.setContext(ctx).draw();

          // ── Latch real VexFlow metrics after draw ──────────────────────────
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const noteStartX = (trebleStave as any).getNoteStartX();
          measNoteStartXRef.current[m] = noteStartX;

          // Real top-staff-line Y from VexFlow (may differ from our hardcoded constant)
          // Only need to store once per system since all measures in same system share Y.
          if (pos === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            staffTopYRef.current.treble[line] = (trebleStave as any).getYForLine(0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            staffTopYRef.current.bass[line]   = (bassStave   as any).getYForLine(0);
            // ── CALIBRATION LOG (remove once aligned) ──
            console.log(`[ScoreCanvas] system${line}: trebleTopY=${staffTopYRef.current.treble[line]} bassTopY=${staffTopYRef.current.bass[line]} noteStartX=${noteStartX}`);
          }

          // Pre-populate beat-0 calibration (will be overridden by real sn.getAbsoluteX() below)
          newTickActualX.treble.push([m * 4 * TPQ, noteStartX]);
          newTickActualX.bass.push([m * 4 * TPQ, noteStartX]);

          // Grand staff brace + left barline connector
          if (StaveConnector && pos === 0) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const SC = StaveConnector as any;
              new SC(trebleStave, bassStave).setType(SC.type?.BRACE      ?? 'brace'     ).setContext(ctx).draw();
              new SC(trebleStave, bassStave).setType(SC.type?.SINGLE_LEFT ?? 'singleLeft').setContext(ctx).draw();
            } catch { /* StaveConnector API varies — skip gracefully */ }
          }

          // ── Render notes for each track ────────────────────────────────
          for (const track of score.tracks) {
            const isBass = track.id === 'track_lh';
            const stave  = isBass ? bassStave : trebleStave;
            const mStart = m * 4 * TPQ;
            const mEnd   = (m + 1) * 4 * TPQ;

            const evts = getTrackEvents(track)
              .filter(ev =>
                (ev.type === 'chord' || ev.type === 'rest') &&
                ev.start_tick >= mStart &&
                ev.start_tick < mEnd
              )
              .sort((a, b) => a.start_tick - b.start_tick);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vfNotes: any[] = [];
            // Collect chord events with their StaveNote for post-draw calibration
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const snEvPairs: { sn: any; tick: number; evId: string; pitches: number[] }[] = [];
            let cursor = mStart;

            for (const ev of evts) {
              if (ev.start_tick > cursor) {
                vfNotes.push(...makeRests(ev.start_tick - cursor, StaveNote));
              }
              const [vDur] = ticksToVexDur(ev.dur_tick);

              if (ev.type === 'rest') {
                vfNotes.push(new StaveNote({ keys: ['b/4'], duration: vDur + 'r' }));
              } else if (ev.type === 'chord' && ev.pitches) {
                const sorted = [...ev.pitches].sort((a, b) => a - b);
                const keys: string[]          = [];
                const accs: (string | null)[] = [];

                for (const pitch of sorted) {
                  const accType = ev.accidentals?.find(a => a.pitch === pitch)?.accidental;
                  const [key, accStr] = midiToVexKey(pitch, accType);
                  keys.push(key);
                  accs.push(accStr);
                }

                const sn = new StaveNote({ keys, duration: vDur });
                accs.forEach((acc, idx) => {
                  if (acc) {
                    try { sn.addModifier(new Accidental(acc), idx); } catch { /* skip */ }
                  }
                });

                if (ev.id === selectedNoteId) {
                  sn.setStyle({ fillStyle: '#d97706', strokeStyle: '#d97706' });
                }

                vfNotes.push(sn);
                // Will register noteHit + calibrate X after draw() so we use real getAbsoluteX()
                snEvPairs.push({ sn, tick: ev.start_tick, evId: ev.id, pitches: sorted });
              }

              cursor = ev.start_tick + ev.dur_tick;
            }

            if (cursor < mEnd) vfNotes.push(...makeRests(mEnd - cursor, StaveNote));
            if (vfNotes.length === 0) vfNotes.push(new StaveNote({ keys: ['b/4'], duration: 'wr' }));

            try {
              const voice = new Voice({ numBeats: 4, beatValue: 4 });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (voice as any).setMode && (voice as any).setMode(2); // SOFT — no strict beat count
              voice.addTickables(vfNotes);
              new Formatter()
                .joinVoices([voice])
                .format([voice], mw - (pos === 0 ? 90 : 25));
              voice.draw(ctx, stave);

              // After draw: read real X, calibrate tick→X, and register note hit targets
              const bucket       = isBass ? newTickActualX.bass : newTickActualX.treble;
              const realTopLineY = staffTopYRef.current[isBass ? 'bass' : 'treble'][line]
                ?? (isBass ? bassTopY(line) : trebleTopY(line));

              for (const { sn, tick, evId, pitches } of snEvPairs) {
                try {
                  const ax = sn.getAbsoluteX ? sn.getAbsoluteX() : null;
                  if (typeof ax === 'number' && isFinite(ax)) {
                    // Deduplicate: real position overrides pre-populated beat-0 entry
                    const existingIdx = bucket.findIndex(([t]) => t === tick);
                    if (existingIdx >= 0) bucket[existingIdx] = [tick, ax];
                    else bucket.push([tick, ax]);

                    // Register click hit targets with real cx and calibrated cy
                    for (const pitch of pitches) {
                      noteHitsRef.current.push({
                        eventId:   evId,
                        pitch,
                        startTick: tick,
                        cx: ax,
                        cy: pitchToAbsY(pitch, isBass, realTopLineY),
                      });
                    }
                  }
                } catch { /* ignore */ }
              }
            } catch (err) {
              console.warn('VexFlow render error', m, isBass ? 'bass' : 'treble', err);
            }
          }
        }
      }

      // Sort both maps by tick and commit
      newTickActualX.treble.sort((a, b) => a[0] - b[0]);
      newTickActualX.bass.sort((a, b) => a[0] - b[0]);
      tickActualXRef.current = newTickActualX;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, selectedNoteId]);

  // ============================================================================
  // Ghost X: interpolate/extrapolate from real VexFlow note positions
  // ============================================================================

  const resolveGhostX = useCallback((tick: number, isBass: boolean): number => {
    const txArr  = isBass ? tickActualXRef.current.bass : tickActualXRef.current.treble;
    const m      = Math.min(N_MEAS - 1, Math.floor(tick / (4 * TPQ)));
    const mStart = m * 4 * TPQ;
    const mEnd   = mStart + 4 * TPQ;
    const naL    = measNoteStartXRef.current[m];
    const naW    = measX(m) + measWidth(m) - naL - 8;

    let before: [number, number] | null = null;
    let after:  [number, number] | null = null;
    for (const [t, x] of txArr) {
      if (t < mStart || t >= mEnd) continue;
      if (t <= tick && (!before || t > before[0])) before = [t, x];
      if (t >  tick && (!after  || t < after[0]))  after  = [t, x];
    }

    if (before && after) {
      const [t0, x0] = before, [t1, x1] = after;
      return x0 + (x1 - x0) * (tick - t0) / (t1 - t0);
    }
    if (before) {
      const [t0, x0] = before;
      const remW = measX(m) + measWidth(m) - 8 - x0;
      return x0 + (tick - t0) / Math.max(mEnd - t0, 1) * remW;
    }
    if (after) {
      const [t1, x1] = after;
      return naL + (tick - mStart) / Math.max(t1 - mStart, 1) * (x1 - naL);
    }
    // No notes in this measure — pure linear estimate
    return naL + ((tick % (4 * TPQ)) / TPQ / 4) * naW;
  }, []);

  // ============================================================================
  // Mouse events
  // ============================================================================

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Which system line is the cursor on?
    const line = Math.min(N_LINES - 1, Math.floor(y / SYSTEM_H));

    // Block the clef/time-sig area in the first measure of each system
    // First measure (pos=0) starts at x=0; clef area is roughly x < FIRST_W * 0.36
    const posHere = (() => {
      for (let pos = N_PER_LINE - 1; pos >= 0; pos--) {
        if (x >= measX(line * N_PER_LINE + pos)) return pos;
      }
      return 0;
    })();
    if (posHere === 0 && x < FIRST_W * 0.36) {
      setHoverPos(null);
      return;
    }

    // Use real VexFlow top-line Y if available, otherwise fall back to hardcoded constant
    const realTrebleTopY = staffTopYRef.current.treble[line] ?? trebleTopY(line);
    const realBassTopY   = staffTopYRef.current.bass[line]   ?? bassTopY(line);

    // Assign to closest staff by distance from each staff's mid-line (absolute Y)
    const trebleMid = realTrebleTopY + 2 * VFS;
    const bassMid   = realBassTopY   + 2 * VFS;
    const isBass    = Math.abs(y - bassMid) < Math.abs(y - trebleMid);
    const topLineY  = isBass ? realBassTopY : realTrebleTopY;

    // Only respond within ±4 ledger lines of the assigned staff
    if (y < topLineY - 4 * VFS || y > topLineY + 8 * VFS) {
      setHoverPos(null);
      return;
    }

    const pitch     = absYToPitch(y, isBass, topLineY);
    const noteY     = pitchToAbsY(pitch, isBass, topLineY);
    const snapTicks = DURATION_VALUES[currentDuration];
    const { tick }  = xyToTick(x, y, snapTicks, measNoteStartXRef.current);
    const ghostX    = resolveGhostX(tick, isBass);
    const staveTopY = topLineY;

    const next = { x: ghostX, y: noteY, pitch, tick, isBass, staveTopY, line };
    hoverPosRef.current = next;
    setHoverPos(next);
  }, [currentDuration, resolveGhostX]);

  const handleMouseLeave = useCallback(() => {
    hoverPosRef.current = null;
    setHoverPos(null);
  }, []);

  // ============================================================================
  // Click handler
  // ============================================================================

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Hit-test existing notes first
    let closest: NoteHit | null = null;
    let closestDist = Infinity;
    for (const nh of noteHitsRef.current) {
      const d = Math.hypot(x - nh.cx, y - nh.cy);
      if (d < 14 && d < closestDist) { closest = nh; closestDist = d; }
    }
    if (closest) {
      onNoteClick(closest.eventId, closest.pitch, closest.startTick);
      return;
    }

    // Use the exact values ghost was drawn with (hoverPosRef = same as last mousemove)
    const hp = hoverPosRef.current;
    if (!hp) return;
    onCanvasClick(hp.pitch, hp.tick, hp.isBass ? 'track_lh' : 'track_rh');
  }, [onNoteClick, onCanvasClick]);

  // ============================================================================
  // Ghost note render
  // ============================================================================

  const GHOST_DUR: Record<DurationType, number> = {
    whole: 1920, half: 960, quarter: 480, eighth: 240, sixteenth: 120, thirtysecond: 60,
  };

  const renderGhost = () => {
    if (!hoverPos || editorTool === 'tie') return null;
    const { x: nx, y: ny, pitch, isBass, staveTopY, line } = hoverPos;
    const dur = GHOST_DUR[currentDuration];

    const isWhole  = dur >= 1920;
    const isHalf   = dur >= 960 && dur < 1920;
    const hasFlag1 = dur <= 240 && dur > 120;
    const hasFlag2 = dur <= 120;
    const gc       = editorTool === 'pedal' ? '#7c3aed' : '#2563eb';

    // Stem direction: VexFlow renders single-voice with ALL stems UP in treble,
    // ALL stems DOWN in bass. Match that, not the music-theory pitch rule.
    const stemUp = !isBass;
    const sBaseX   = stemUp ? nx + OVL_NRX - 0.5 : nx - OVL_NRX + 0.5;
    const sTipY    = stemUp ? ny - OVL_STEM       : ny + OVL_STEM;
    const d        = stemUp ? 1 : -1;

    // Ledger lines above/below staff
    const topY = staveTopY;
    const botY = staveTopY + 4 * OVL_SLS;
    const ledgers: React.ReactElement[] = [];
    if (ny < topY - OVL_SLS / 3) {
      for (let ly = topY - OVL_SLS; ly >= ny - 1; ly -= OVL_SLS)
        ledgers.push(<line key={ly} x1={nx - OVL_LHW} x2={nx + OVL_LHW} y1={ly} y2={ly}
          stroke={gc} strokeWidth={1.2} opacity={0.6} />);
    } else if (ny > botY + OVL_SLS / 3) {
      for (let ly = botY + OVL_SLS; ly <= ny + 1; ly += OVL_SLS)
        ledgers.push(<line key={ly} x1={nx - OVL_LHW} x2={nx + OVL_LHW} y1={ly} y2={ly}
          stroke={gc} strokeWidth={1.2} opacity={0.6} />);
    }

    if (editorTool === 'pedal') {
      const py = sysY(line) + BASS_TOP + 4 * VFS + 22;
      return <g opacity={0.45} style={{ pointerEvents: 'none' }}>
        <line x1={nx} x2={nx + MEAS_W} y1={py} y2={py}
          stroke={gc} strokeWidth={2} strokeDasharray="5 3" />
        <text x={nx + 3} y={py - 4} fontSize={11} fill={gc}>𝆮</text>
        <rect x={nx - 22} y={ny - 26} width={44} height={18} rx={4} fill="#1e293b" opacity={0.8} />
        <text x={nx} y={ny - 13} textAnchor="middle" fontSize={11} fill="white" fontWeight="700">
          {pitchToName(pitch)}
        </text>
      </g>;
    }

    return (
      <g opacity={0.42} style={{ pointerEvents: 'none' }}>
        {ledgers}
        {isWhole ? (
          <>
            <ellipse cx={nx} cy={ny} rx={OVL_NRX + 2.5} ry={OVL_NRY + 0.5}
              fill="white" stroke={gc} strokeWidth={2.2} />
            <ellipse cx={nx - 0.5} cy={ny} rx={OVL_NRX - 0.5} ry={OVL_NRY - 2}
              fill="white" stroke="none" transform={`rotate(-12 ${nx} ${ny})`} />
          </>
        ) : (
          <>
            <ellipse cx={nx} cy={ny} rx={OVL_NRX} ry={OVL_NRY}
              fill={isHalf ? 'white' : gc} stroke={gc} strokeWidth={1.6}
              transform={`rotate(${OVL_ANG} ${nx} ${ny})`} />
            {isHalf && (
              <ellipse cx={nx} cy={ny} rx={OVL_NRX - 2} ry={OVL_NRY - 2}
                fill="white" stroke="none" transform={`rotate(${OVL_ANG} ${nx} ${ny})`} />
            )}
            <line
              x1={sBaseX} y1={stemUp ? ny - OVL_NRY + 1 : ny + OVL_NRY - 1}
              x2={sBaseX} y2={sTipY}
              stroke={gc} strokeWidth={1.6}
            />
            {(hasFlag1 || hasFlag2) && (
              <>
                <path
                  d={`M ${sBaseX} ${sTipY} C ${sBaseX+13} ${sTipY+10*d} ${sBaseX+14} ${sTipY+19*d} ${sBaseX+5} ${sTipY+26*d}`}
                  fill="none" stroke={gc} strokeWidth={1.7}
                />
                {hasFlag2 && (
                  <path
                    d={`M ${sBaseX} ${sTipY+8*d} C ${sBaseX+13} ${sTipY+18*d} ${sBaseX+14} ${sTipY+27*d} ${sBaseX+5} ${sTipY+34*d}`}
                    fill="none" stroke={gc} strokeWidth={1.7}
                  />
                )}
              </>
            )}
          </>
        )}
        {/* Pitch name label, above or below stem tip */}
        <rect
          x={nx - 22} y={stemUp ? ny - OVL_STEM - 22 : ny + OVL_STEM + 4}
          width={44} height={17} rx={4} fill="#1e293b" opacity={0.85}
        />
        <text
          x={nx} y={stemUp ? ny - OVL_STEM - 9 : ny + OVL_STEM + 17}
          textAnchor="middle" fontSize={11} fill="white" fontWeight="700"
        >
          {pitchToName(pitch)}
        </text>
      </g>
    );
  };

  /** Pedal span overlay (drawn outside VexFlow) */
  const renderPedalOverlay = () => {
    const els: React.ReactElement[] = [];
    for (const track of score.tracks) {
      if (track.id !== 'track_lh') continue;
      for (const ev of getTrackEvents(track)) {
        if (ev.type !== 'pedal') continue;
        const m    = Math.min(N_MEAS - 1, Math.floor(ev.start_tick / (4 * TPQ)));
        const line = lineOf(m);
        const py   = sysY(line) + BASS_TOP + 4 * VFS + 22;
        const x1   = tickToOverlayX(ev.start_tick, measNoteStartXRef.current);
        const x2   = tickToOverlayX(ev.start_tick + ev.dur_tick, measNoteStartXRef.current);
        els.push(<g key={ev.id}>
          <line x1={x1} x2={x2} y1={py} y2={py} stroke="#7c3aed" strokeWidth={2.5} />
          <text x={x1 + 2} y={py - 5} fontSize={12} fill="#7c3aed">𝆮</text>
          <line x1={x2 - 3} x2={x2} y1={py - 7} y2={py} stroke="#7c3aed" strokeWidth={1.5} />
        </g>);
      }
    }
    return els;
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          width: CW, height: CH,
          cursor: editorTool === 'pedal' ? 'col-resize' : 'crosshair',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* VexFlow rendering target — no pointer events, purely visual */}
        <div
          ref={containerRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: CW, height: CH,
            pointerEvents: 'none',
            background: '#fffef8', borderRadius: 8,
            boxShadow: '0 1px 4px rgba(0,0,0,.10)',
          }}
        />

        {/* Ghost + pedal SVG overlay — no pointer events */}
        <svg
          width={CW} height={CH}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          {/* Calibration lines: show computed staff-top Y vs VexFlow actual.
              Thin dashed green = treble top, orange = bass top.
              Remove once alignment is confirmed. */}
          {Array.from({ length: N_LINES }, (_, li) => (
            <g key={li}>
              <line x1={0} x2={CW}
                y1={staffTopYRef.current.treble[li] ?? trebleTopY(li)}
                y2={staffTopYRef.current.treble[li] ?? trebleTopY(li)}
                stroke="#16a34a" strokeWidth={1} strokeDasharray="4 3" opacity={0.45} />
              <line x1={0} x2={CW}
                y1={staffTopYRef.current.bass[li] ?? bassTopY(li)}
                y2={staffTopYRef.current.bass[li] ?? bassTopY(li)}
                stroke="#ea580c" strokeWidth={1} strokeDasharray="4 3" opacity={0.45} />
            </g>
          ))}
          {renderPedalOverlay()}
          {renderGhost()}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '4px 8px',
        fontSize: 12, color: '#64748b', flexWrap: 'wrap',
      }}>
        {([['#0f172a','Bè 1'],['#1d4ed8','Bè 2'],['#d97706','Đang chọn']] as [string,string][]).map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={14} height={12}>
              <ellipse cx={7} cy={6} rx={5.5} ry={3.8} fill={c} transform="rotate(-20 7 6)" />
            </svg>
            <span>{l}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={22} height={4}>
            <line x1={0} x2={22} y1={2} y2={2} stroke="#7c3aed" strokeWidth={2}/>
          </svg>
          <span>Pedal</span>
        </div>
        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
          {chordMode
            ? '🎵 Hợp Âm — click cùng beat để thêm nốt'
            : 'Di chuột → xem preview • Click khuông → thêm nốt • Click nốt → chọn'}
        </span>
      </div>
    </div>
  );
}
