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

// ============================================================================
// Staff geometry cache — populated from real VexFlow stave after each draw
// ============================================================================

interface StaveGeom {
  staveX:     number;  // stave.getX() — absolute canvas X of stave left edge
  noteStartX: number;  // stave.getNoteStartX() — absolute canvas X where notes begin
  staveWidth: number;  // stave.getWidth()
  topLineY:   number;  // stave.getYForLine(0) — absolute canvas Y of top staff line
  spacing:    number;  // stave.getSpacingBetweenLines() — px between staff lines
}

// Diatonic semitone steps going UP from each letter (C=0 … B=6):
// C→D=2, D→E=2, E→F=1, F→G=2, G→A=2, A→B=2, B→C=1
const DIATONIC_UP = [2, 2, 1, 2, 2, 2, 1];

// Middle line (VF line index 2 from top) reference pitches:
// Treble: B4 = MIDI 71 (letter B = index 6)
// Bass:   D3 = MIDI 50 (letter D = index 1)
const CLEF_REF = {
  treble: { midi: 71, letter: 6 },
  bass:   { midi: 50, letter: 1 },
} as const;

/** Diatonic step from middle line → MIDI pitch (positive = up, negative = down) */
function staffStepToMidi(clef: 'treble' | 'bass', step: number): number {
  const { midi: ref, letter: refL } = CLEF_REF[clef];
  let midi = ref, letter = refL;
  if (step > 0) {
    for (let i = 0; i < step; i++)  { midi += DIATONIC_UP[letter];          letter = (letter + 1) % 7; }
  } else {
    for (let i = 0; i < -step; i++) { midi -= DIATONIC_UP[(letter + 6) % 7]; letter = (letter + 6) % 7; }
  }
  return Math.max(21, Math.min(108, midi));
}

/** MIDI pitch → diatonic staff step (0 = middle line) using dP() arithmetic */
function midiToStaffStep(clef: 'treble' | 'bass', pitch: number): number {
  return dP(pitch) - dP(CLEF_REF[clef].midi);
}

/** Snap mouse Y → nearest diatonic MIDI pitch using stave geometry */
function snapPitch(ry: number, isBass: boolean, geom: StaveGeom): number {
  const sp2  = geom.spacing / 2;
  const midY = geom.topLineY + 2 * geom.spacing;  // Y of middle line (line index 2)
  const step = Math.round((midY - ry) / sp2);
  return staffStepToMidi(isBass ? 'bass' : 'treble', step);
}

/** MIDI pitch → absolute canvas Y, exact same arithmetic VexFlow uses internally */
function pitchToStaveY(pitch: number, isBass: boolean, geom: StaveGeom): number {
  const step = midiToStaffStep(isBass ? 'bass' : 'treble', pitch);
  return geom.topLineY + 2 * geom.spacing - step * (geom.spacing / 2);
}

/** Snap mouse X → absolute tick using stave geometry (invertible) */
function snapTickFn(rx: number, measIdx: number, snapTpq: number, geom: StaveGeom): number {
  const noteW   = geom.staveX + geom.staveWidth - geom.noteStartX - 8;
  const relX    = Math.max(0, rx - geom.noteStartX);
  const rawTick = (relX / Math.max(noteW, 1)) * (4 * TPQ);
  const snapped = Math.round(rawTick / snapTpq) * snapTpq;
  return measIdx * 4 * TPQ + Math.max(0, Math.min(4 * TPQ - snapTpq, snapped));
}

/** Absolute tick → ghost X — exact inverse of snapTickFn for zero-offset ghost placement */
function tickToStaveX(tick: number, measIdx: number, geom: StaveGeom): number {
  const noteW      = geom.staveX + geom.staveWidth - geom.noteStartX - 8;
  const tickInMeas = tick - measIdx * 4 * TPQ;
  return geom.noteStartX + (tickInMeas / (4 * TPQ)) * noteW;
}

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

// ============================================================================
// Default note-start X fallbacks (before first VexFlow render)
// ============================================================================

const DEFAULT_NOTE_START: number[] = Array.from({ length: N_MEAS }, (_, m) => {
  return measX(m) + (posInLine(m) === 0 ? 82 : 12);
});

/** tick → canvas X using per-measure note-start X — used by pedal overlay only */
function tickToOverlayX(tick: number, noteStartX: number[] = DEFAULT_NOTE_START): number {
  const m          = Math.min(N_MEAS - 1, Math.floor(tick / (4 * TPQ)));
  const beatInMeas = (tick % (4 * TPQ)) / TPQ;
  const naL        = noteStartX[m];
  const naW        = measX(m) + measWidth(m) - naL - 8;
  return naL + (beatInMeas / 4) * naW;
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
   * Real VexFlow top-staff-line Y per system per clef.
   * Key: line index.  Used by pedal overlay fallback.
   */
  const staffTopYRef = useRef<{ treble: number[]; bass: number[] }>({ treble: [], bass: [] });

  /**
   * Stave geometry cache keyed `${line}:${pos}:treble` / `${line}:${pos}:bass`.
   * Populated after each VexFlow draw. Used by snapPitch / snapTickFn / pitchToStaveY.
   */
  const staveGeomRef = useRef<Map<string, StaveGeom>>(new Map());

  const [hoverPos, setHoverPos] = useState<{
    x: number; y: number;
    pitch: number; tick: number;
    isBass: boolean; staveTopY: number; staveBotY: number; line: number;
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

          // Real top-staff-line Y from VexFlow.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tTopY = (trebleStave as any).getYForLine(0) as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bTopY = (bassStave   as any).getYForLine(0) as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const spac  = ((trebleStave as any).getSpacingBetweenLines?.() ?? VFS) as number;

          if (pos === 0) {
            staffTopYRef.current.treble[line] = tTopY;
            staffTopYRef.current.bass[line]   = bTopY;
          }

          // Populate stave geometry cache for snap functions (all measures, both clefs)
          const tGeomEntry: StaveGeom = { staveX: mx, noteStartX, staveWidth: mw, topLineY: tTopY, spacing: spac };
          const bGeomEntry: StaveGeom = { staveX: mx, noteStartX, staveWidth: mw, topLineY: bTopY, spacing: spac };
          staveGeomRef.current.set(`${line}:${pos}:treble`, tGeomEntry);
          staveGeomRef.current.set(`${line}:${pos}:bass`,   bGeomEntry);

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
              const bucket = isBass ? newTickActualX.bass : newTickActualX.treble;

              for (const { sn, tick, evId, pitches } of snEvPairs) {
                try {
                  const ax = sn.getAbsoluteX ? sn.getAbsoluteX() : null;
                  if (typeof ax === 'number' && isFinite(ax)) {
                    // Deduplicate: real position overrides pre-populated beat-0 entry
                    const existingIdx = bucket.findIndex(([t]) => t === tick);
                    if (existingIdx >= 0) bucket[existingIdx] = [tick, ax];
                    else bucket.push([tick, ax]);

                    // Read real note head Y from VexFlow after draw (most accurate).
                    // sn.getYs() returns Y for each key in the chord, in key order.
                    let realYs: number[] | null = null;
                    try {
                      const ys = sn.getYs?.();
                      if (Array.isArray(ys) && ys.length === pitches.length) realYs = ys;
                    } catch { /* not yet available */ }

                    // Register click hit targets with real (or computed) cy
                    for (let ki = 0; ki < pitches.length; ki++) {
                      const pitch = pitches[ki];
                      const cy = (realYs && typeof realYs[ki] === 'number' && isFinite(realYs[ki]))
                        ? realYs[ki]
                        : pitchToStaveY(pitch, isBass, isBass ? bGeomEntry : tGeomEntry);
                      noteHitsRef.current.push({
                        eventId:   evId,
                        pitch,
                        startTick: tick,
                        cx: ax,
                        cy,
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
  // Mouse events
  // ============================================================================

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Which system line and position within that line?
    const line    = Math.min(N_LINES - 1, Math.floor(y / SYSTEM_H));
    const posHere = (() => {
      for (let p = N_PER_LINE - 1; p >= 0; p--) {
        if (x >= measX(line * N_PER_LINE + p)) return p;
      }
      return 0;
    })();

    // Block the clef/time-sig area in the first measure of each system
    if (posHere === 0 && x < FIRST_W * 0.36) { setHoverPos(null); return; }

    const measIdx = line * N_PER_LINE + posHere;

    // Look up stave geometry for both clefs (to determine treble/bass boundary)
    const tGeom = staveGeomRef.current.get(`${line}:${posHere}:treble`);
    const bGeom = staveGeomRef.current.get(`${line}:${posHere}:bass`);

    // Fallback Y values before first VexFlow render
    const trebleTop = tGeom?.topLineY ?? staffTopYRef.current.treble[line] ?? (line * SYSTEM_H + TREBLE_TOP);
    const bassTop   = bGeom?.topLineY ?? staffTopYRef.current.bass[line]   ?? (line * SYSTEM_H + BASS_TOP);
    const sp        = tGeom?.spacing  ?? VFS;

    const trebleBotY = trebleTop + 4 * sp;
    const bassBotY   = bassTop   + 4 * sp;
    const boundary   = (trebleBotY + bassTop) / 2;
    const isBass     = y > boundary;

    // Pick the correct geometry object; build a minimal fallback if not yet cached
    const geom: StaveGeom = (isBass ? bGeom : tGeom) ?? {
      staveX:     measX(measIdx),
      noteStartX: measX(measIdx) + (posHere === 0 ? 82 : 12),
      staveWidth: measWidth(measIdx),
      topLineY:   isBass ? bassTop : trebleTop,
      spacing:    sp,
    };

    const topLineY = isBass ? bassTop : trebleTop;
    const botLineY = isBass ? bassBotY : trebleBotY;

    const LEDGER_ZONE = 4 * sp;
    if (y < topLineY - LEDGER_ZONE || y > botLineY + LEDGER_ZONE) { setHoverPos(null); return; }

    const snapTpq = DURATION_VALUES[currentDuration];
    const pitch   = snapPitch(y, isBass, geom);
    const noteY   = pitchToStaveY(pitch, isBass, geom);
    const tick    = snapTickFn(x, measIdx, snapTpq, geom);
    const ghostX  = tickToStaveX(tick, measIdx, geom);

    const next = { x: ghostX, y: noteY, pitch, tick, isBass, staveTopY: topLineY, staveBotY: botLineY, line };
    hoverPosRef.current = next;
    setHoverPos(next);
  }, [currentDuration]);

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
    const { x: nx, y: ny, pitch, isBass, staveTopY, staveBotY, line } = hoverPos;
    const dur = GHOST_DUR[currentDuration];

    const isWhole  = dur >= 1920;
    const isHalf   = dur >= 960 && dur < 1920;
    const hasFlag1 = dur <= 240 && dur > 120;
    const hasFlag2 = dur <= 120;
    const gc       = editorTool === 'pedal' ? '#7c3aed' : '#2563eb';

    // Stem direction: above middle line → stem down; at/below → stem up
    // Matches VexFlow single-voice note stem direction
    const step   = midiToStaffStep(isBass ? 'bass' : 'treble', pitch);
    const stemUp = step <= 0;
    const sBaseX   = stemUp ? nx + OVL_NRX - 0.5 : nx - OVL_NRX + 0.5;
    const sTipY    = stemUp ? ny - OVL_STEM       : ny + OVL_STEM;
    const d        = stemUp ? 1 : -1;

    // Ledger lines above/below staff
    const topY = staveTopY;
    const botY = staveBotY;
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
      const py = staveBotY + 22;
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
        const bassBotY = (staffTopYRef.current.bass[line] ?? bassTopY(line)) + 4 * VFS;
        const py   = bassBotY + 22;
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
          {/* Ghost + pedal overlay */}
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
