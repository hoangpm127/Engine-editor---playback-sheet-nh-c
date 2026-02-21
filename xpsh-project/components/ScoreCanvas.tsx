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
import { DURATION_VALUES, KEY_SIG_STRINGS } from '@/lib/editor_ops';
import type { DurationType } from '@/lib/editor_ops';

// ============================================================================
// MIDI ↔ VexFlow helpers
// ============================================================================

const SHARP_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLAT_NAMES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
const IS_NAT = [true, false, true, false, true, true, false, true, false, true, false, true];
const C2D = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

function dP(pitch: number) { return Math.floor(pitch / 12) * 7 + C2D[pitch % 12]; }

/** MIDI pitch → [vexflow key string, accidental string | null] */
function midiToVexKey(pitch: number, acc?: AccidentalType | null): [string, string | null] {
  const sem = pitch % 12;
  const oct = Math.floor(pitch / 12) - 1;
  if (acc === 'flat') return [`${FLAT_NAMES[sem]}/${oct}`, IS_NAT[sem] ? null : 'b'];
  if (acc === 'doubleFlat') return [`${FLAT_NAMES[sem]}/${oct}`, 'bb'];
  if (acc === 'natural') return [`${SHARP_NAMES[sem]}/${oct}`, IS_NAT[sem] ? null : 'n'];
  if (acc === 'doubleSharp') return [`${SHARP_NAMES[sem]}/${oct}`, '##'];
  return [`${SHARP_NAMES[sem]}/${oct}`, IS_NAT[sem] ? null : '#'];
}

/** dur_tick → [vexflow duration string, dots count] */
function ticksToVexDur(ticks: number): [string, number] {
  if (ticks >= 2880) return ['w', 1];
  if (ticks >= 1920) return ['w', 0];
  if (ticks >= 1440) return ['h', 1];
  if (ticks >= 960) return ['h', 0];
  if (ticks >= 720) return ['q', 1];
  if (ticks >= 480) return ['q', 0];
  if (ticks >= 360) return ['8', 1];
  if (ticks >= 240) return ['8', 0];
  if (ticks >= 180) return ['16', 1];
  if (ticks >= 120) return ['16', 0];
  if (ticks >= 90) return ['32', 1];
  return ['32', 0];
}

/** Fill gap ticks with appropriately-sized rest StaveNotes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRests(gapTicks: number, StaveNote: any, clef: 'treble' | 'bass' = 'treble'): any[] {
  const SIZES: [number, string][] = [
    [1920, 'w'], [960, 'h'], [480, 'q'], [240, '8'], [120, '16'], [60, '32'],
  ];
  // Rest key: use mid-staff reference per clef so VexFlow centres rest correctly
  const restKey = clef === 'bass' ? 'd/3' : 'b/4';
  const out = [];
  let rem = gapTicks;
  for (const [t, dur] of SIZES) {
    while (rem >= t) {
      out.push(new StaveNote({ keys: [restKey], duration: dur + 'r', clef }));
      rem -= t;
    }
  }
  return out;
}

// ============================================================================
// Layout constants
// ============================================================================

const TPQ = 480;
const N_MEAS = 8;
const N_PER_LINE = 4;               // measures per system
const N_LINES = 2;               // number of systems

const MEAS_W = 160;
const FIRST_W = 240;                // first measure of each system (has clef)
const CW = FIRST_W + MEAS_W * (N_PER_LINE - 1) + 20;   // 740px

/**
 * VexFlow: stave(x, Y, w).getYForLine(0) === Y + 40
 * Verified empirically: node -e "require('vexflow').Stave; new Stave(0,30,200).getYForLine(0)" → 70
 */
const VF_OFFSET = 40;

/** Stave constructor Y within each system (relative to system top Y) */
const TREBLE_Y = 20;
const BASS_Y = 110;

/** Actual rendered top staff line within each system (= constructor Y + VF_OFFSET) */
const TREBLE_TOP = TREBLE_Y + VF_OFFSET;   // 60px from system top
const BASS_TOP = BASS_Y + VF_OFFSET;   // 150px from system top

/** px per space between staff lines, px per diatonic half-step = VFS/2 */
const VFS = 10;

/** Height per system: treble staff + gap + bass staff + margin */
const SYSTEM_H = 220;

const CH = N_LINES * SYSTEM_H + 10;   // total canvas height

// ============================================================================
// Staff geometry cache — populated from real VexFlow stave after each draw
// ============================================================================

interface StaveGeom {
  staveX: number;  // stave.getX() — absolute canvas X of stave left edge
  noteStartX: number;  // stave.getNoteStartX() — absolute canvas X where notes begin
  staveWidth: number;  // stave.getWidth()
  topLineY: number;  // stave.getYForLine(0) — absolute canvas Y of top staff line
  spacing: number;  // stave.getSpacingBetweenLines() — px between staff lines
}

// Diatonic semitone steps going UP from each letter (C=0 … B=6):
// C→D=2, D→E=2, E→F=1, F→G=2, G→A=2, A→B=2, B→C=1
const DIATONIC_UP = [2, 2, 1, 2, 2, 2, 1];

// Middle line (VF line index 2 from top) reference pitches:
// Treble: B4 = MIDI 71 (letter B = index 6)
// Bass:   D3 = MIDI 50 (letter D = index 1)
const CLEF_REF = {
  treble: { midi: 71, letter: 6 },
  bass: { midi: 50, letter: 1 },
} as const;

/** Diatonic step from middle line → MIDI pitch (positive = up, negative = down) */
function staffStepToMidi(clef: 'treble' | 'bass', step: number): number {
  const { midi: ref, letter: refL } = CLEF_REF[clef];
  let midi = ref, letter = refL;
  if (step > 0) {
    for (let i = 0; i < step; i++) { midi += DIATONIC_UP[letter]; letter = (letter + 1) % 7; }
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
  const sp2 = geom.spacing / 2;
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
  const noteW = geom.staveX + geom.staveWidth - geom.noteStartX - 8;
  const relX = Math.max(0, rx - geom.noteStartX);
  const rawTick = (relX / Math.max(noteW, 1)) * (4 * TPQ);
  const snapped = Math.round(rawTick / snapTpq) * snapTpq;
  return measIdx * 4 * TPQ + Math.max(0, Math.min(4 * TPQ - snapTpq, snapped));
}

/** Absolute tick → ghost X — exact inverse of snapTickFn for zero-offset ghost placement */
function tickToStaveX(tick: number, measIdx: number, geom: StaveGeom): number {
  const noteW = geom.staveX + geom.staveWidth - geom.noteStartX - 8;
  const tickInMeas = tick - measIdx * 4 * TPQ;
  return geom.noteStartX + (tickInMeas / (4 * TPQ)) * noteW;
}

/**
 * Look up ghost X from the calibrated tick→X table populated by VexFlow's getAbsoluteX().
 * Falls back to linear tickToStaveX() if no calibration data is available yet.
 * Uses per-clef buckets (treble/bass) to avoid cross-contamination.
 */
function snapTickToRealX(
  tick: number,
  isBass: boolean,
  tickActualX: { treble: [number, number][]; bass: [number, number][] },
  measIdx: number,
  geom: StaveGeom,
): number {
  const bucket = isBass ? tickActualX.bass : tickActualX.treble;
  const measStart = measIdx * 4 * TPQ;
  const measEnd = measStart + 4 * TPQ;
  const inMeas = bucket.filter(([t]) => t >= measStart && t < measEnd);
  if (inMeas.length === 0) return tickToStaveX(tick, measIdx, geom);

  // Exact match
  const exact = inMeas.find(([t]) => t === tick);
  if (exact) return exact[1];

  // Interpolate between surrounding calibration points
  const before = [...inMeas].filter(([t]) => t <= tick).at(-1);
  const after = inMeas.find(([t]) => t > tick);
  if (before && after) {
    const ratio = (tick - before[0]) / (after[0] - before[0]);
    return before[1] + ratio * (after[1] - before[1]);
  }
  if (before) return before[1];
  if (after) return after[1];
  return tickToStaveX(tick, measIdx, geom);
}

// ============================================================================
// Per-system coordinate helpers
// ============================================================================

function lineOf(m: number) { return Math.floor(m / N_PER_LINE); }
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
function bassTopY(line: number): number { return sysY(line) + BASS_TOP; }

// ============================================================================
// Default note-start X fallbacks (before first VexFlow render)
// ============================================================================

const DEFAULT_NOTE_START: number[] = Array.from({ length: N_MEAS }, (_, m) => {
  return measX(m) + (posInLine(m) === 0 ? 82 : 12);
});

/** tick → canvas X using per-measure note-start X — used by pedal overlay only */
function tickToOverlayX(tick: number, noteStartX: number[] = DEFAULT_NOTE_START): number {
  const m = Math.min(N_MEAS - 1, Math.floor(tick / (4 * TPQ)));
  const beatInMeas = (tick % (4 * TPQ)) / TPQ;
  const naL = noteStartX[m];
  const naW = measX(m) + measWidth(m) - naL - 8;
  return naL + (beatInMeas / 4) * naW;
}

// (Ghost overlay constants removed — ghost is now rendered by VexFlow, not manual SVG)

// ============================================================================
// Props + types
// ============================================================================

export interface ScoreCanvasProps {
  score: XPSHScore;
  selectedNoteId: string | null;
  onNoteClick: (noteId: string, pitch: number, tick: number) => void;
  onCanvasClick: (pitch: number, tick: number, trackId: string) => void;
  onMoveNote?: (eventId: string, newPitch: number, newTick: number, newTrackId: string, prevTrackId: string) => void;
  currentVoice?: 1 | 2;
  chordMode?: boolean;
  currentDuration?: DurationType;
  editorTool?: 'note' | 'tie' | 'pedal' | 'triplet';
  keySig?: number;
  timeSig?: string;
  /** Current playback position in MIDI ticks — renders a vertical cursor line when set */
  playbackTick?: number;
}

interface NoteHit {
  eventId: string;
  pitch: number;
  startTick: number;
  cx: number;
  cy: number;
  trackId: string;
}

// ============================================================================
// Component
// ============================================================================

export function ScoreCanvas({
  score,
  selectedNoteId,
  onNoteClick,
  onCanvasClick,
  onMoveNote,
  currentVoice = 1,
  chordMode = false,
  currentDuration = 'quarter',
  editorTool = 'note',
  keySig = 0,
  timeSig = '4/4',
  playbackTick,
}: ScoreCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Secondary VexFlow renderer — ghost note only, same size, positioned identically */
  const ghostDivRef = useRef<HTMLDivElement>(null);
  /** requestAnimationFrame handle to throttle ghost re-renders */
  const ghostRafRef = useRef<number | null>(null);
  const noteHitsRef = useRef<NoteHit[]>([]);
  const hoverPosRef = useRef<typeof hoverPos>(null);
  /** Drag state: set on mouseDown over a note, cleared on mouseUp */
  const dragRef = useRef<{ noteHit: NoteHit; moved: boolean; startX: number; startY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverOnNote, setHoverOnNote] = useState(false);
  const measNoteStartXRef = useRef<number[]>([...DEFAULT_NOTE_START]);
  // Sorted [tick, x][] from getAbsoluteX(), SEPARATED by clef to avoid cross-contamination.
  const tickActualXRef = useRef<{ treble: [number, number][]; bass: [number, number][] }>(
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

  /** Debug: lưu thông tin ghost khi click để so sánh với real note sau render */
  const lastClickRef = useRef<{ pitch: number; ghostY: number; ghostX: number; isBass: boolean; tick: number } | null>(null);
  /** Debug: tránh spam API — chỉ log khi pitch hover thay đổi */
  const lastGhostPitchRef = useRef<number>(-1);

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
    noteHitsRef.current = [];
    tickActualXRef.current = { treble: [], bass: [] };

    import('vexflow').then((VF) => {
      const { Renderer, Stave, StaveNote, StaveConnector, Voice, Formatter, Accidental, Beam, Tuplet, StaveTie, Articulation: VFArticulation, Fingering: VFFingering } = VF as any;
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
          const m = line * N_PER_LINE + pos;
          const mx = measX(m);
          const mw = measWidth(m);

          const trebleStave = new Stave(mx, sy + TREBLE_Y, mw);
          const bassStave = new Stave(mx, sy + BASS_Y, mw);

          if (pos === 0) {
            trebleStave.addClef('treble');
            bassStave.addClef('bass');
            // Key signature (all systems)
            const keyStr = KEY_SIG_STRINGS[keySig] ?? 'C';
            if (keyStr !== 'C') {
              try { trebleStave.addKeySignature(keyStr); } catch { /* skip */ }
              try { bassStave.addKeySignature(keyStr); } catch { /* skip */ }
            }
            if (line === 0) {
              trebleStave.addTimeSignature(timeSig);
              bassStave.addTimeSignature(timeSig);
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
          const bTopY = (bassStave as any).getYForLine(0) as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const spac = ((trebleStave as any).getSpacingBetweenLines?.() ?? VFS) as number;

          if (pos === 0) {
            staffTopYRef.current.treble[line] = tTopY;
            staffTopYRef.current.bass[line] = bTopY;
          }

          // Populate stave geometry cache for snap functions (all measures, both clefs)
          const tGeomEntry: StaveGeom = { staveX: mx, noteStartX, staveWidth: mw, topLineY: tTopY, spacing: spac };
          const bGeomEntry: StaveGeom = { staveX: mx, noteStartX, staveWidth: mw, topLineY: bTopY, spacing: spac };
          staveGeomRef.current.set(`${line}:${pos}:treble`, tGeomEntry);
          staveGeomRef.current.set(`${line}:${pos}:bass`, bGeomEntry);

          // Pre-populate beat-0 calibration (will be overridden by real sn.getAbsoluteX() below)
          newTickActualX.treble.push([m * 4 * TPQ, noteStartX]);
          newTickActualX.bass.push([m * 4 * TPQ, noteStartX]);

          // Grand staff brace + left barline connector
          if (StaveConnector && pos === 0) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const SC = StaveConnector as any;
              new SC(trebleStave, bassStave).setType(SC.type?.BRACE ?? 'brace').setContext(ctx).draw();
              new SC(trebleStave, bassStave).setType(SC.type?.SINGLE_LEFT ?? 'singleLeft').setContext(ctx).draw();
            } catch { /* StaveConnector API varies — skip gracefully */ }
          }

          // ── Render notes for each track (multi-voice aware) ────────────────
          for (const track of score.tracks) {
            const isBass = track.id === 'track_lh';
            const clef: 'treble' | 'bass' = isBass ? 'bass' : 'treble';
            const stave = isBass ? bassStave : trebleStave;
            const mStart = m * 4 * TPQ;
            const mEnd = (m + 1) * 4 * TPQ;

            const allEvts = getTrackEvents(track)
              .filter(ev =>
                (ev.type === 'chord' || ev.type === 'rest') &&
                ev.start_tick >= mStart &&
                ev.start_tick < mEnd
              )
              .sort((a, b) => a.start_tick - b.start_tick);

            // Split by voice (1 = stems up, 2 = stems down per engraving convention)
            const v1Evts = allEvts.filter(ev => (ev.voice ?? 1) === 1);
            const v2Evts = allEvts.filter(ev => ev.voice === 2);
            const hasMultiVoice = v2Evts.length > 0;

            // VexFlow stem direction constants
            const STEM_UP = 1;
            const STEM_DOWN = -1;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const snEvPairs: { sn: any; tick: number; evId: string; pitches: number[]; ties?: import('@/lib/xpsh_helpers').TieRef[]; tupletGroupId?: string; dynamicText?: string; dynamicIsBass: boolean }[] = [];

            /**
             * Build a VexFlow notes array for one voice lane.
             * stemDir: STEM_UP | STEM_DOWN | null (null = auto, used for single-voice)
             */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const buildVoiceNotes = (evts: typeof allEvts, stemDir: number | null): any[] => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const notes: any[] = [];
              let cur = mStart;
              for (const ev of evts) {
                if (ev.start_tick > cur) {
                  const rests = makeRests(ev.start_tick - cur, StaveNote, clef);
                  if (stemDir !== null) rests.forEach((r: any) => { try { r.setStemDirection(stemDir); } catch { /* skip */ } });
                  notes.push(...rests);
                }
                const [vDur, vDots] = ticksToVexDur(ev.dur_tick);
                if (ev.type === 'rest') {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const rn: any = new StaveNote({ keys: [isBass ? 'd/3' : 'b/4'], duration: vDur + 'r', clef });
                  if (vDots > 0) try { rn.addDotToAll(); } catch { /* skip */ }
                  if (stemDir !== null) try { rn.setStemDirection(stemDir); } catch { /* skip */ }
                  notes.push(rn);
                } else if (ev.type === 'chord' && ev.pitches) {
                  const sorted = [...ev.pitches].sort((a, b) => a - b);
                  const keys: string[] = [];
                  const accs: (string | null)[] = [];
                  for (const pitch of sorted) {
                    const accType = ev.accidentals?.find(a => a.pitch === pitch)?.accidental;
                    const [key, accStr] = midiToVexKey(pitch, accType);
                    keys.push(key); accs.push(accStr);
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sn: any = new StaveNote({ keys, duration: vDur, clef });
                  if (vDots > 0) try { sn.addDotToAll(); } catch { /* skip */ }
                  // Multi-voice: forced. Single-voice: Middle Line Rule via midiToStaffStep.
                  const effectiveStemDir = stemDir !== null ? stemDir : (() => {
                    const steps = sorted.map((p: number) => midiToStaffStep(clef, p));
                    const farthest = steps.reduce((m: number, s: number) => Math.abs(s) > Math.abs(m) ? s : m, steps[0] ?? 0);
                    return farthest >= 0 ? STEM_DOWN : STEM_UP;
                  })();
                  try { sn.setStemDirection(effectiveStemDir); } catch { /* skip */ }
                  accs.forEach((acc, idx) => {
                    if (acc) try { sn.addModifier(new Accidental(acc), idx); } catch { /* skip */ }
                  });
                  // Articulations
                  const artMap: Record<string, string> = {
                    staccato: 'a.', tenuto: 'a-', accent: 'a>',
                    marcato: 'a^', fermata: 'afermataj',
                  };
                  if (VFArticulation && ev.articulations) {
                    ev.articulations.forEach((art: string) => {
                      const code = artMap[art];
                      if (code) try { sn.addModifier(new VFArticulation(code)); } catch { /* skip */ }
                    });
                  }
                  // Fingering (top pitch gets finger number if only one pitch, else parallel)
                  if (VFFingering && ev.fingering) {
                    ev.fingering.forEach((f: number, idx: number) => {
                      if (f > 0) try { sn.addModifier(new VFFingering(String(f)), idx); } catch { /* skip */ }
                    });
                  }
                  if (ev.id === selectedNoteId) {
                    sn.setStyle({ fillStyle: '#d97706', strokeStyle: '#d97706' });
                  }
                  notes.push(sn);
                  snEvPairs.push({ sn, tick: ev.start_tick, evId: ev.id, pitches: sorted, ties: ev.ties, tupletGroupId: ev.tuplet?.groupId, dynamicText: ev.dynamic, dynamicIsBass: isBass });
                }
                cur = ev.start_tick + ev.dur_tick;
              }
              if (cur < mEnd) {
                const rests = makeRests(mEnd - cur, StaveNote, clef);
                if (stemDir !== null) rests.forEach((r: any) => { try { r.setStemDirection(stemDir); } catch { /* skip */ } });
                notes.push(...rests);
              }
              if (notes.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const wr: any = new StaveNote({ keys: [isBass ? 'd/3' : 'b/4'], duration: 'wr', clef });
                if (stemDir !== null) try { wr.setStemDirection(stemDir); } catch { /* skip */ }
                notes.push(wr);
              }
              return notes;
            };

            try {
              const fmt = new Formatter();
              // Helper: draw beams for a notes array
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const drawBeams = (notesArr: any[], sd?: number) => {
                if (!Beam) return;
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const cfg: any = {};
                  if (sd !== undefined) cfg.stem_direction = sd;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const beams = (Beam as any).generateBeams(notesArr, cfg);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  beams.forEach((b: any) => { try { b.setContext(ctx).draw(); } catch { /* skip */ } });
                } catch { /* skip */ }
              };

              // Helper: draw tuplet brackets
              const drawTuplets = () => {
                if (!Tuplet) return;
                const groups = new Map<string, any[]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
                for (const { sn, tupletGroupId } of snEvPairs) {
                  if (!tupletGroupId) continue;
                  const arr = groups.get(tupletGroupId) ?? [];
                  arr.push(sn);
                  groups.set(tupletGroupId, arr);
                }
                groups.forEach((tupNotes) => {
                  if (tupNotes.length < 2) return;
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const t = new (Tuplet as any)(tupNotes, { numNotes: tupNotes.length, notesOccupied: tupNotes.length - 1, location: -1 });
                    t.setContext(ctx).draw();
                  } catch { /* skip */ }
                });
              };

              // Helper: draw ties (within-measure; cross-measure ties need a second pass)
              const drawTies = () => {
                if (!StaveTie) return;
                const evMap = new Map<string, { sn: any; pitches: number[] }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
                for (const { evId, sn, pitches } of snEvPairs) evMap.set(evId, { sn, pitches });
                for (const { sn, pitches, ties } of snEvPairs) {
                  if (!ties) continue;
                  for (const tie of ties) {
                    if (!tie.start || !tie.toEventId) continue;
                    const target = evMap.get(tie.toEventId);
                    if (!target) continue;
                    const fi = pitches.indexOf(tie.pitch);
                    const li = target.pitches.indexOf(tie.pitch);
                    if (fi < 0 || li < 0) continue;
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      new (StaveTie as any)({
                        first_note: sn, first_indices: [fi],
                        last_note: target.sn, last_indices: [li],
                      }).setContext(ctx).draw();
                    } catch { /* skip */ }
                  }
                }
              };

              if (hasMultiVoice) {
                // ── Two-voice layout: Voice 1 stem-up, Voice 2 stem-down ──────
                const v1Notes = buildVoiceNotes(v1Evts, STEM_UP);
                const v2Notes = buildVoiceNotes(v2Evts, STEM_DOWN);
                // Multi-voice rest offset: V1 rests float up, V2 rests down
                v1Notes.forEach((n: any) => { if (n.isRest?.()) try { n.setYShift(-10); } catch { /* skip */ } });
                v2Notes.forEach((n: any) => { if (n.isRest?.()) try { n.setYShift(10); } catch { /* skip */ } });
                const voice1 = new Voice({ numBeats: 4, beatValue: 4 });
                const voice2 = new Voice({ numBeats: 4, beatValue: 4 });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (voice1 as any).setMode?.((VF as any).Voice?.Mode?.SOFT ?? 2);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (voice2 as any).setMode?.((VF as any).Voice?.Mode?.SOFT ?? 2);
                voice1.addTickables(v1Notes);
                voice2.addTickables(v2Notes);
                fmt.joinVoices([voice1, voice2]).format([voice1, voice2], mw - (pos === 0 ? 90 : 25));
                voice1.draw(ctx, stave);
                voice2.draw(ctx, stave);
                drawBeams(v1Notes, STEM_UP);
                drawBeams(v2Notes, STEM_DOWN);
              } else {
                // ── Single voice: Middle Line Rule (VexFlow auto-stem) ─────────
                const v1Notes = buildVoiceNotes(v1Evts.length > 0 ? v1Evts : allEvts, null);
                const voice1 = new Voice({ numBeats: 4, beatValue: 4 });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (voice1 as any).setMode?.((VF as any).Voice?.Mode?.SOFT ?? 2);
                voice1.addTickables(v1Notes);
                fmt.joinVoices([voice1]).format([voice1], mw - (pos === 0 ? 90 : 25));
                voice1.draw(ctx, stave);
                drawBeams(v1Notes);
              }
              drawTuplets();
              drawTies();

              // After draw: calibrate tick→X and register note hit targets
              const bucket = isBass ? newTickActualX.bass : newTickActualX.treble;
              for (const { sn, tick, evId, pitches, dynamicText, dynamicIsBass } of snEvPairs) {
                try {
                  const ax = sn.getAbsoluteX ? sn.getAbsoluteX() : null;
                  if (typeof ax === 'number' && isFinite(ax)) {
                    const existingIdx = bucket.findIndex(([t]) => t === tick);
                    if (existingIdx >= 0) bucket[existingIdx] = [tick, ax];
                    else bucket.push([tick, ax]);

                    // Render dynamic mark as SVG text below the stave
                    if (dynamicText) {
                      const svgElem = containerRef.current?.querySelector('svg');
                      if (svgElem) {
                        const botY = (dynamicIsBass ? bGeomEntry : tGeomEntry).topLineY + 4 * VFS + 20;
                        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        txt.setAttribute('x', String(ax));
                        txt.setAttribute('y', String(botY));
                        txt.setAttribute('font-size', '13');
                        txt.setAttribute('font-family', 'serif');
                        txt.setAttribute('font-style', 'italic');
                        txt.setAttribute('font-weight', '700');
                        txt.setAttribute('fill', '#1d4ed8');
                        txt.setAttribute('text-anchor', 'start');
                        txt.textContent = dynamicText;
                        svgElem.appendChild(txt);
                      }
                    }

                    let realYs: number[] | null = null;
                    try {
                      const ys = sn.getYs?.();
                      if (Array.isArray(ys) && ys.length === pitches.length) realYs = ys;
                    } catch { /* skip */ }

                    for (let ki = 0; ki < pitches.length; ki++) {
                      const pitch = pitches[ki];
                      const cy = (realYs && typeof realYs[ki] === 'number' && isFinite(realYs[ki]))
                        ? realYs[ki]
                        : pitchToStaveY(pitch, isBass, isBass ? bGeomEntry : tGeomEntry);
                      noteHitsRef.current.push({ eventId: evId, pitch, startTick: tick, cx: ax, cy, trackId: isBass ? 'track_lh' : 'track_rh' });
                      if (lastClickRef.current
                        && lastClickRef.current.tick === tick
                        && lastClickRef.current.pitch === pitch) {
                        const lc = lastClickRef.current;
                        fetch('/api/log', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: 'real', pitch, pitchName: pitchToName(pitch), realY: cy, realX: ax, ghostY: lc.ghostY, ghostX: lc.ghostX, isBass, tick, eventId: evId }),
                        }).catch(() => { });
                        lastClickRef.current = null;
                      }
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
  }, [score, selectedNoteId, keySig, timeSig]);

  // ============================================================================
  // Ghost note — VexFlow renderer (exact same Formatter pipeline as main)
  // ============================================================================

  useEffect(() => {
    // Cancel any pending frame
    if (ghostRafRef.current !== null) {
      cancelAnimationFrame(ghostRafRef.current);
      ghostRafRef.current = null;
    }

    if (!hoverPos || editorTool === 'tie') {
      if (ghostDivRef.current) ghostDivRef.current.innerHTML = '';
      return;
    }

    const hp = hoverPos; // capture snapshot

    ghostRafRef.current = requestAnimationFrame(() => {
      ghostRafRef.current = null;
      if (!ghostDivRef.current) return;
      ghostDivRef.current.innerHTML = '';

      import('vexflow').then((VF) => {
        const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam } = VF;
        if (!ghostDivRef.current || !hp) return;

        // ── Resolve measure / stave geometry ──────────────────────────────────
        const measIdx  = Math.floor(hp.tick / (4 * TPQ));
        const line     = lineOf(measIdx);
        const pos      = posInLine(measIdx);
        const mx       = measX(measIdx);
        const mw       = measWidth(measIdx);
        const staveConstructorY = hp.isBass ? sysY(line) + BASS_Y : sysY(line) + TREBLE_Y;
        const snapTpq  = DURATION_VALUES[currentDuration];
        const [ghostVDur] = ticksToVexDur(snapTpq); // ghost always uses plain duration (no dots on preview)
        const clef     = hp.isBass ? 'bass' : 'treble';

        // ── Ghost renderer (same canvas size + position as main) ───────────────
        const renderer = new Renderer(ghostDivRef.current!, Renderer.Backends.SVG);
        renderer.resize(CW, CH);
        const ctx = renderer.getContext();

        // ── Ghost stave — identical to main render config ─────────────────────
        // IMPORTANT: stave.draw() MUST be called before voice.draw() so VexFlow
        // can initialise its internal SVG group references (ctx element, etc.).
        // DO NOT remove stave elements before voice.draw() — VexFlow appends
        // note heads as children of the stave SVG group; removing it first
        // causes notes to appear at Y≈0 (top of canvas, wrong by ~6 lines).
        // Instead we hide stave lines AFTER voice.draw() using CSS opacity.
        const stave = new Stave(mx, staveConstructorY, mw);
        if (pos === 0) {
          stave.addClef(clef);
          if (line === 0) stave.addTimeSignature(timeSig);
        }
        stave.setContext(ctx).draw();

        // ── Collect real events for this measure (for Formatter spacing) ───────
        const track    = score.tracks.find(t => t.id === (hp.isBass ? 'track_lh' : 'track_rh'));
        const mStart   = measIdx * 4 * TPQ;
        const mEnd     = (measIdx + 1) * 4 * TPQ;
        const evts     = track
          ? getTrackEvents(track)
              .filter(ev => ev.start_tick >= mStart && ev.start_tick < mEnd)
              .sort((a, b) => a.start_tick - b.start_tick)
          : [];

        // ── Build voice: real notes invisible + ghost note visible ─────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vfNotes: any[] = [];
        let cursor      = mStart;
        let ghostInserted = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertGhost = (sn?: any) => {
          if (sn) {
            // chord-mode: add ghost pitch to existing note — not implemented yet, skip
          } else {
            const [gKey, gAcc] = midiToVexKey(hp.pitch);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gn: any = new StaveNote({ keys: [gKey], duration: ghostVDur, clef });
            if (gAcc) try { gn.addModifier(new Accidental(gAcc), 0); } catch { /* skip */ }
            // Middle Line Rule for ghost note
            const ghostStep = midiToStaffStep(clef, hp.pitch);
            try { gn.setStemDirection(ghostStep >= 0 ? -1 : 1); } catch { /* skip */ }
            gn.setStyle({ fillStyle: 'rgba(37,99,235,0.55)', strokeStyle: 'rgba(37,99,235,0.55)' });
            vfNotes.push(gn);
          }
          ghostInserted = true;
          cursor = hp.tick + snapTpq;
        };

        for (const ev of evts) {
          // Insert ghost before this event if tick fits in the gap
          if (!ghostInserted && hp.tick >= cursor && hp.tick < ev.start_tick) {
            if (hp.tick > cursor) vfNotes.push(...makeRests(hp.tick - cursor, StaveNote, clef));
            insertGhost();
          }

          // Skip events that overlap with the inserted ghost
          if (ev.start_tick < cursor) continue;

          if (ev.start_tick > cursor) vfNotes.push(...makeRests(ev.start_tick - cursor, StaveNote, clef));

          const [vDur] = ticksToVexDur(ev.dur_tick);
          if (ev.type === 'rest') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rn: any = new StaveNote({ keys: [clef === 'bass' ? 'd/3' : 'b/4'], duration: vDur + 'r', clef });
            rn.setStyle({ fillStyle: 'rgba(0,0,0,0)', strokeStyle: 'rgba(0,0,0,0)' });
            vfNotes.push(rn);
          } else if (ev.type === 'chord' && ev.pitches) {
            const sorted = [...ev.pitches].sort((a, b) => a - b);
            const keys: string[] = [];
            const accs: (string | null)[] = [];
            for (const p of sorted) {
              const accType = ev.accidentals?.find(a => a.pitch === p)?.accidental;
              const [key, accStr] = midiToVexKey(p, accType);
              keys.push(key); accs.push(accStr);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // clef MUST match the stave so VexFlow maps key strings to correct line numbers
            const sn: any = new StaveNote({ keys, duration: vDur, clef });
            accs.forEach((acc, idx) => { if (acc) try { sn.addModifier(new Accidental(acc), idx); } catch { /* skip */ } });
            // Invisible spacing note — needed for Formatter to replicate exact main layout
            sn.setStyle({ fillStyle: 'rgba(0,0,0,0)', strokeStyle: 'rgba(0,0,0,0)' });
            vfNotes.push(sn);
          }
          cursor = ev.start_tick + ev.dur_tick;
        }

        // Ghost after all existing events
        if (!ghostInserted && hp.tick >= cursor) {
          if (hp.tick > cursor) vfNotes.push(...makeRests(hp.tick - cursor, StaveNote, clef));
          insertGhost();
        }

        // Fill remainder of measure with rests for correct total duration
        if (cursor < mEnd) vfNotes.push(...makeRests(mEnd - cursor, StaveNote, clef));
        if (vfNotes.length === 0) return;

        // ── Format + draw (SAME width/params as main render) ──────────────────
        try {
          const voice = new Voice({ numBeats: 4, beatValue: 4 });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (voice as any).setMode?.((VF as any).Voice?.Mode?.SOFT ?? 2);
          voice.addTickables(vfNotes);
          new Formatter()
            .joinVoices([voice])
            .format([voice], mw - (pos === 0 ? 90 : 25));
          voice.draw(ctx, stave);

          // Hide stave lines/clef/timesig AFTER voice.draw() so VexFlow's
          // internal SVG group references remain intact during note drawing.
          // Using opacity:0 instead of DOM removal to preserve group structure.
          if (ghostDivRef.current) {
            ghostDivRef.current.querySelectorAll(
              '.vf-stave path, .vf-stave line, .vf-timesig, .vf-clef, .vf-barline'
            ).forEach((el) => ((el as HTMLElement).style.opacity = '0'));
          }

          // ── Post-draw: compare VF ghost Y vs snapPitch Y ──────────────────
          // Read actual rendered ellipse CY from DOM for delta diagnosis
          try {
            const ellipses = ghostDivRef.current?.querySelectorAll('ellipse');
            const vfCY = ellipses && ellipses.length > 0
              ? parseFloat(ellipses[ellipses.length - 1].getAttribute('cy') ?? 'NaN')
              : null;
            const vfCX = ellipses && ellipses.length > 0
              ? parseFloat(ellipses[ellipses.length - 1].getAttribute('cx') ?? 'NaN')
              : null;
            const deltaY = vfCY !== null && !isNaN(vfCY) ? (vfCY - hp.y).toFixed(2) : 'N/A';
            const msg = `[GHOST●] pitch=${hp.pitch}(${pitchToName(hp.pitch)}) ` +
              `snapY=${hp.y.toFixed(1)} vfY=${vfCY?.toFixed(1) ?? '?'} ΔY=${deltaY} ` +
              `snapX=${hp.x.toFixed(1)} vfX=${vfCX?.toFixed(1) ?? '?'} ` +
              `clef=${clef} meas=${measIdx}`;
            console.log(msg);
            fetch('/api/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'ghost_vf', pitch: hp.pitch,
                pitchName: pitchToName(hp.pitch),
                snapY: hp.y, vfY: vfCY, deltaY: parseFloat(deltaY) || 0,
                isBass: hp.isBass, clef, measIdx,
              }),
            }).catch(() => { });
          } catch { /* DOM readback error — ignore */ }
        } catch (err) {
          console.warn('Ghost VF render error', err);
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverPos, score, currentDuration, editorTool]);

  // ============================================================================
  // Mouse events
  // ============================================================================

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Mark drag as moved once cursor travels > 4px from mouse-down point
    if (dragRef.current && !dragRef.current.moved) {
      const dx = x - dragRef.current.startX;
      const dy = y - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) { dragRef.current.moved = true; }
    }

    // Which system line and position within that line?
    const line = Math.min(N_LINES - 1, Math.floor(y / SYSTEM_H));
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
    const bassTop = bGeom?.topLineY ?? staffTopYRef.current.bass[line] ?? (line * SYSTEM_H + BASS_TOP);
    const sp = tGeom?.spacing ?? VFS;

    const trebleBotY = trebleTop + 4 * sp;
    const bassBotY = bassTop + 4 * sp;
    const boundary = (trebleBotY + bassTop) / 2;
    const isBass = y > boundary;

    // Pick the correct geometry object; build a minimal fallback if not yet cached
    const geom: StaveGeom = (isBass ? bGeom : tGeom) ?? {
      staveX: measX(measIdx),
      noteStartX: measX(measIdx) + (posHere === 0 ? 82 : 12),
      staveWidth: measWidth(measIdx),
      topLineY: isBass ? bassTop : trebleTop,
      spacing: sp,
    };

    const topLineY = isBass ? bassTop : trebleTop;
    const botLineY = isBass ? bassBotY : trebleBotY;

    const LEDGER_ZONE = 4 * sp;
    if (y < topLineY - LEDGER_ZONE || y > botLineY + LEDGER_ZONE) { setHoverPos(null); return; }

    const snapTpq = DURATION_VALUES[currentDuration];
    const pitch = snapPitch(y, isBass, geom);
    const noteY = pitchToStaveY(pitch, isBass, geom);
    const tick = snapTickFn(x, measIdx, snapTpq, geom);
    // Use calibrated real VexFlow note X when available; fall back to linear
    const ghostX = snapTickToRealX(tick, isBass, tickActualXRef.current, measIdx, geom);

    const next = { x: ghostX, y: noteY, pitch, tick, isBass, staveTopY: topLineY, staveBotY: botLineY, line };
    hoverPosRef.current = next;
    setHoverPos(next);

    // Detect if cursor is hovering over an existing note (for grab cursor)
    const onNote = noteHitsRef.current.some(nh => Math.hypot(x - nh.cx, y - nh.cy) < 14);
    setHoverOnNote(onNote);

    // Log ghost khi pitch thay đổi (không spam mỗi pixel)
    if (pitch !== lastGhostPitchRef.current) {
      lastGhostPitchRef.current = pitch;
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ghost', pitch, pitchName: pitchToName(pitch), ghostY: noteY, ghostX, isBass, measIdx }),
      }).catch(() => { });
    }
  }, [currentDuration]);

  const handleMouseLeave = useCallback(() => {
    hoverPosRef.current = null;
    setHoverPos(null);
    setHoverOnNote(false);
    // Cancel drag if mouse leaves canvas
    if (dragRef.current) { dragRef.current = null; setIsDragging(false); }
  }, []);

  // ============================================================================
  // Drag handlers
  // ============================================================================

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let closest: NoteHit | null = null;
    let closestDist = Infinity;
    for (const nh of noteHitsRef.current) {
      const d = Math.hypot(x - nh.cx, y - nh.cy);
      if (d < 14 && d < closestDist) { closest = nh; closestDist = d; }
    }
    if (closest) {
      dragRef.current = { noteHit: closest, moved: false, startX: x, startY: y };
      setIsDragging(true);
      e.stopPropagation();
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const hp = hoverPosRef.current;
    if (drag.moved && hp && onMoveNote) {
      const newTrackId = hp.isBass ? 'track_lh' : 'track_rh';
      onMoveNote(drag.noteHit.eventId, hp.pitch, hp.tick, newTrackId, drag.noteHit.trackId);
    }
    dragRef.current = null;
    setIsDragging(false);
    e.stopPropagation();
  }, [onMoveNote]);

  // ============================================================================
  // Click handler
  // ============================================================================

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // If a drag just ended (moved), suppress click so we don’t insert a new note
    if (dragRef.current?.moved) { dragRef.current = null; setIsDragging(false); return; }
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

    // Log click với ghost info
    lastClickRef.current = { pitch: hp.pitch, ghostY: hp.y, ghostX: hp.x, isBass: hp.isBass, tick: hp.tick };
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'click', pitch: hp.pitch, pitchName: pitchToName(hp.pitch), ghostY: hp.y, ghostX: hp.x, isBass: hp.isBass, tick: hp.tick }),
    }).catch(() => { });

    onCanvasClick(hp.pitch, hp.tick, hp.isBass ? 'track_lh' : 'track_rh');
  }, [onNoteClick, onCanvasClick]);

  // (renderGhost() removed — ghost is now rendered by VexFlow in ghostDivRef useEffect above)

  /** Pedal span overlay (drawn outside VexFlow) */
  const renderPedalOverlay = () => {
    const els: React.ReactElement[] = [];
    for (const track of score.tracks) {
      if (track.id !== 'track_lh') continue;
      for (const ev of getTrackEvents(track)) {
        if (ev.type !== 'pedal') continue;
        const m = Math.min(N_MEAS - 1, Math.floor(ev.start_tick / (4 * TPQ)));
        const line = lineOf(m);
        const bassBotY = (staffTopYRef.current.bass[line] ?? bassTopY(line)) + 4 * VFS;
        const py = bassBotY + 22;
        const x1 = tickToOverlayX(ev.start_tick, measNoteStartXRef.current);
        const x2 = tickToOverlayX(ev.start_tick + ev.dur_tick, measNoteStartXRef.current);
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
          cursor: isDragging ? 'grabbing' : hoverOnNote ? 'grab' : (editorTool === 'pedal' ? 'col-resize' : 'crosshair'),
        userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
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

        {/* Playback cursor — spans only the system row it is currently in */}
        {playbackTick !== undefined && (() => {
          const clampedTick = Math.min(playbackTick, (N_MEAS - 1) * 4 * TPQ + 4 * TPQ - 1);
          const cx = tickToOverlayX(clampedTick, measNoteStartXRef.current);
          const cursorMeas  = Math.min(N_MEAS - 1, Math.floor(clampedTick / (4 * TPQ)));
          const cursorLine  = Math.floor(cursorMeas / N_PER_LINE);
          const lineTop     = sysY(cursorLine);
          return (
            <div
              style={{
                position: 'absolute',
                left: cx - 1,
                top: lineTop,
                width: 2,
                height: SYSTEM_H,
                background: 'rgba(59,130,246,0.85)',
                pointerEvents: 'none',
                zIndex: 8,
                borderRadius: 1,
                boxShadow: '0 0 8px rgba(59,130,246,0.55)',
              }}
            />
          );
        })()}

        {/* Ghost note — VexFlow renderer, identical size + origin as main renderer */}
        <div
          ref={ghostDivRef}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />

        {/* Pedal + pitch-name label SVG overlay */}
        <svg
          width={CW} height={CH}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          {renderPedalOverlay()}
          {/* Pitch name tooltip — uses hoverPos Y/X for placement */}
          {hoverPos && editorTool !== 'tie' && (() => {
            const { x: nx, y: ny, pitch } = hoverPos;
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={nx - 22} y={ny - 52} width={44} height={17} rx={4} fill="#1e293b" opacity={0.85} />
                <text x={nx} y={ny - 39} textAnchor="middle" fontSize={11} fill="white" fontWeight="700">
                  {pitchToName(pitch)}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '4px 8px',
        fontSize: 12, color: '#64748b', flexWrap: 'wrap',
      }}>
        {([['#0f172a', 'Bè 1'], ['#1d4ed8', 'Bè 2'], ['#d97706', 'Đang chọn']] as [string, string][]).map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={14} height={12}>
              <ellipse cx={7} cy={6} rx={5.5} ry={3.8} fill={c} transform="rotate(-20 7 6)" />
            </svg>
            <span>{l}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={22} height={4}>
            <line x1={0} x2={22} y1={2} y2={2} stroke="#7c3aed" strokeWidth={2} />
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
