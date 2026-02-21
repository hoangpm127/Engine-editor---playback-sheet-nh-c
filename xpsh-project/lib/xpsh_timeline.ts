/**
 * XPSH Timeline Compiler – v1.1
 * Supports: chord, rest, pedal (CC64), ties, tuplets (triplet), voices
 * Backward-compatible with v1.0 (notes[])
 */

import { XPSHScore, XPSHEvent, tickToMs, getTrackEvents } from '@/lib/xpsh_helpers';

// ============================================================================
// Types
// ============================================================================

export interface NoteOnEvent {
  t: number;
  type: 'on';
  pitch: number;
  vel: number;
  noteId: string;
  track: string;
}

export interface NoteOffEvent {
  t: number;
  type: 'off';
  pitch: number;
  noteId: string;
  track: string;
}

/** CC64 sustain pedal: value 127 = pedal down, 0 = pedal up */
export interface CC64Event {
  t: number;
  type: 'cc64';
  value: number;
  track: string;
}

export type TimelineEvent = NoteOnEvent | NoteOffEvent | CC64Event;

export interface CompiledTimeline {
  events: TimelineEvent[];
  totalDurationMs: number;
  tempo_bpm: number;
  ticks_per_quarter: number;
}

// ============================================================================
// Internal: Tie chain resolution
// ============================================================================

type TieKey = string; // `${eventId}:${pitch}`

interface TieResolution {
  tieStops: Set<TieKey>;
  tieChainEndTick: Map<TieKey, number>;
}

function buildTieResolution(events: XPSHEvent[]): TieResolution {
  const evById = new Map<string, XPSHEvent>(events.map(e => [e.id, e]));
  const tieStops = new Set<TieKey>();
  const tieChainEndTick = new Map<TieKey, number>();

  function chainEnd(evId: string, pitch: number, depth = 0): number {
    if (depth > 100) return 0;
    const ev = evById.get(evId);
    if (!ev) return 0;
    const ref = ev.ties?.find(t => t.pitch === pitch && t.start && t.toEventId);
    if (!ref || !ref.toEventId) return ev.start_tick + ev.dur_tick;
    return chainEnd(ref.toEventId, pitch, depth + 1);
  }

  for (const ev of events) {
    if (!ev.ties) continue;
    for (const tie of ev.ties) {
      if (tie.stop) tieStops.add(`${ev.id}:${tie.pitch}`);
      // First link in a chain (start=true, stop=false)
      if (tie.start && !tie.stop && tie.toEventId) {
        tieChainEndTick.set(`${ev.id}:${tie.pitch}`, chainEnd(ev.id, tie.pitch));
      }
    }
  }

  return { tieStops, tieChainEndTick };
}

// ============================================================================
// Internal: Tuplet scaling
// ============================================================================

function buildTupletScaling(events: XPSHEvent[]): Map<string, { effectiveStartTick: number; effectiveDurTick: number }> {
  const groups = new Map<string, XPSHEvent[]>();
  for (const ev of events) {
    if (ev.tuplet?.groupId) {
      if (!groups.has(ev.tuplet.groupId)) groups.set(ev.tuplet.groupId, []);
      groups.get(ev.tuplet.groupId)!.push(ev);
    }
  }

  const scaled = new Map<string, { effectiveStartTick: number; effectiveDurTick: number }>();

  for (const groupEvents of groups.values()) {
    const ratio = groupEvents[0].tuplet!.normal / groupEvents[0].tuplet!.actual; // e.g. 2/3
    const groupStart = Math.min(...groupEvents.map(e => e.start_tick));
    for (const ev of groupEvents) {
      const offset = ev.start_tick - groupStart;
      scaled.set(ev.id, {
        effectiveStartTick: groupStart + Math.round(offset * ratio),
        effectiveDurTick: Math.round(ev.dur_tick * ratio),
      });
    }
  }

  return scaled;
}

// ============================================================================
// Internal: Pedal sustain fallback
// ============================================================================

interface PedalRange { startMs: number; endMs: number; trackId: string; }

function applyPedalSustain(events: TimelineEvent[], pedalRanges: PedalRange[]): TimelineEvent[] {
  if (pedalRanges.length === 0) return events;
  return events.map(ev => {
    if (ev.type !== 'off') return ev;
    for (const r of pedalRanges) {
      if (ev.track === r.trackId && ev.t > r.startMs && ev.t < r.endMs) {
        return { ...ev, t: r.endMs };
      }
    }
    return ev;
  });
}

// ============================================================================
// Main Compiler
// ============================================================================

/**
 * Compile XPSHScore → CompiledTimeline.
 * Handles v1.0 (notes[]) and v1.1 (events[]) tracks transparently via getTrackEvents().
 */
export function compileTimeline(score: XPSHScore): CompiledTimeline {
  const rawEvents: TimelineEvent[] = [];
  const tempo = score.timing.tempo_bpm;
  const tpq   = score.timing.ticks_per_quarter;
  const ms    = (tick: number) => tickToMs(tick, tempo, tpq);

  const pedalRanges: PedalRange[] = [];

  for (const track of score.tracks) {
    const evts = getTrackEvents(track);
    const { tieStops, tieChainEndTick } = buildTieResolution(evts);
    const tupletScale = buildTupletScaling(evts);

    for (const ev of evts) {
      const scale    = tupletScale.get(ev.id);
      const startTick = scale ? scale.effectiveStartTick : ev.start_tick;
      const durTick   = scale ? scale.effectiveDurTick   : ev.dur_tick;
      const startMs  = ms(startTick);
      const endMs    = ms(startTick + durTick);

      // ── Pedal ───────────────────────────────────────────────────────────
      if (ev.type === 'pedal') {
        rawEvents.push({ t: startMs, type: 'cc64', value: 127, track: track.id });
        rawEvents.push({ t: endMs,   type: 'cc64', value: 0,   track: track.id });
        pedalRanges.push({ startMs, endMs, trackId: track.id });
        continue;
      }

      // ── Rest ────────────────────────────────────────────────────────────
      if (ev.type === 'rest') continue;

      // ── Chord ───────────────────────────────────────────────────────────
      if (ev.type === 'chord' && ev.pitches && ev.pitches.length > 0) {
        const vel = ev.velocity ?? 64;

        for (const pitch of ev.pitches) {
          const key: TieKey = `${ev.id}:${pitch}`;
          const isTieStop = tieStops.has(key);

          if (!isTieStop) {
            rawEvents.push({ t: startMs, type: 'on', pitch, vel, noteId: ev.id, track: track.id });
            const chainEnd = tieChainEndTick.get(key);
            const offMs = chainEnd !== undefined ? ms(chainEnd) : endMs;
            rawEvents.push({ t: offMs, type: 'off', pitch, noteId: ev.id, track: track.id });
          }
          // If isTieStop, NoteOn is suppressed; NoteOff was already emitted by the chain head.
        }
      }
    }
  }

  // Pedal sustain fallback: extend NoteOff that falls inside a pedal range
  const events = applyPedalSustain(rawEvents, pedalRanges);

  // Sort: time asc; at equal time: cc64 < off < on
  events.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const rank = (e: TimelineEvent) => e.type === 'cc64' ? 0 : e.type === 'off' ? 1 : 2;
    return rank(a) - rank(b);
  });

  const totalDurationMs = Math.max(
    events.length > 0 ? Math.max(...events.map(e => e.t)) : 0,
    ms(8 * 4 * tpq)   // always cover all 8 canvas measures
  );

  return { events, totalDurationMs, tempo_bpm: tempo, ticks_per_quarter: tpq };
}

// ============================================================================
// Utilities
// ============================================================================

export function getEventsInRange(
  timeline: CompiledTimeline,
  startMs: number,
  endMs: number
): TimelineEvent[] {
  return timeline.events.filter(e => e.t >= startMs && e.t < endMs);
}

export function retimeTimeline(
  originalTimeline: CompiledTimeline,
  newTempoBpm: number
): CompiledTimeline {
  const ratio = originalTimeline.tempo_bpm / newTempoBpm;
  const newEvents = originalTimeline.events.map(ev => ({ ...ev, t: ev.t / ratio }));
  const minDurationMs = 8 * 4 * 60000 / newTempoBpm; // 8 measures at new tempo
  const totalDurationMs = Math.max(
    newEvents.length > 0 ? Math.max(...newEvents.map(e => e.t)) : 0,
    minDurationMs
  );
  return { events: newEvents, totalDurationMs, tempo_bpm: newTempoBpm, ticks_per_quarter: originalTimeline.ticks_per_quarter };
}

export function debugTimeline(timeline: CompiledTimeline, maxEvents = 30): void {
  console.log(`=== Timeline | ${timeline.tempo_bpm}BPM | ${timeline.totalDurationMs.toFixed(0)}ms | ${timeline.events.length} events ===`);
  timeline.events.slice(0, maxEvents).forEach((ev, i) => {
    if (ev.type === 'on')   console.log(`[${i}] ${ev.t.toFixed(1)}ms ON  p=${ev.pitch} v=${ev.vel}`);
    if (ev.type === 'off')  console.log(`[${i}] ${ev.t.toFixed(1)}ms OFF p=${ev.pitch}`);
    if (ev.type === 'cc64') console.log(`[${i}] ${ev.t.toFixed(1)}ms CC64=${ev.value} trk=${ev.track}`);
  });
  if (timeline.events.length > maxEvents) console.log(`...and ${timeline.events.length - maxEvents} more`);
}


