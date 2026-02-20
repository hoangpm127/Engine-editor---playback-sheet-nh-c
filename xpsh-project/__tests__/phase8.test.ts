/**
 * Phase 8 Unit Tests
 * Tests: chord events, accidentals, ties, pedal, triplets, voices
 * Covers: validator v1.1, compileTimeline tie/pedal/tuplet, editor_ops v1.1
 */

import { validateXpsh } from '../lib/xpsh_validator';
import { compileTimeline } from '../lib/xpsh_timeline';
import {
  insertEvent,
  deleteEvent,
  findEventById,
  findEventAt,
  insertOrUpdateChordPitch,
  setAccidental,
  setVoice,
  addTie,
  addPedalRange,
  applyTripletGroup,
  getEventsInTickRange,
  countEvents,
} from '../lib/editor_ops';
import { XPSHScore, XPSHEvent } from '../lib/xpsh_helpers';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal v1.1 score with given track events */
function makeScore(rhEvents: XPSHEvent[], lhEvents: XPSHEvent[] = []): XPSHScore {
  return {
    format: 'xpsh',
    format_version: '1.1.0',
    metadata: { title: 'Phase8 Test', composer: 'Test', created_at: '2025-01-01' },
    timing: { tempo_bpm: 120, ticks_per_quarter: 480, time_signature: '4/4', total_ticks: 15360 },
    tracks: [
      { id: 'RH', name: 'Right Hand', type: 'melody', clef: 'treble', events: rhEvents },
      { id: 'LH', name: 'Left Hand', type: 'bass', clef: 'bass', events: lhEvents },
    ],
  } as unknown as XPSHScore;
}

/** Build a minimal chord event */
function makeChord(id: string, start: number, dur: number, pitches: number[], voice: 1 | 2 = 1): XPSHEvent {
  return { id, start_tick: start, dur_tick: dur, voice, type: 'chord', pitches, velocity: 80 };
}

/** Build a rest event */
function makeRest(id: string, start: number, dur: number, voice: 1 | 2 = 1): XPSHEvent {
  return { id, start_tick: start, dur_tick: dur, voice, type: 'rest' };
}

/** Build a pedal event */
function makePedal(id: string, start: number, dur: number): XPSHEvent {
  return { id, start_tick: start, dur_tick: dur, voice: 1, type: 'pedal' };
}

console.log('╔══════════════════════════════════════════════════╗');
console.log('║        Phase 8 Unit Test Suite                  ║');
console.log('╚══════════════════════════════════════════════════╝\n');

// ============================================================================
// 1. VALIDATOR – v1.1 chord events
// ============================================================================
console.log('=== 1. Validator: Chord Events ===\n');

{
  const score = makeScore([makeChord('e1', 0, 480, [60, 64, 67])]);
  const r = validateXpsh(score);
  console.log(`[1.1] Chord event with valid pitches [] → valid=${r.valid} errors=${JSON.stringify(r.errors)}`);
  console.assert(r.valid === true, 'FAIL: valid chord should pass');

  const score2 = makeScore([{ id: 'e1', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord', pitches: [] } as unknown as XPSHEvent]);
  const r2 = validateXpsh(score2);
  console.log(`[1.2] Chord event with empty pitches[] → valid=${r2.valid} errors=${JSON.stringify(r2.errors)}`);
  console.assert(r2.valid === false, 'FAIL: chord with no pitches should fail');

  const score3 = makeScore([{ id: 'e1', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord', pitches: [5] } as unknown as XPSHEvent]);
  const r3 = validateXpsh(score3);
  console.log(`[1.3] Chord with pitch 5 (< 21) → valid=${r3.valid} errors=${JSON.stringify(r3.errors)}`);
  console.assert(r3.valid === false, 'FAIL: pitch out of range should fail');
}

// ============================================================================
// 2. VALIDATOR – accidentals
// ============================================================================
console.log('\n=== 2. Validator: Accidentals ===\n');

{
  const ev: XPSHEvent = {
    id: 'e1', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord',
    pitches: [61], velocity: 80,
    accidentals: [{ pitch: 61, accidental: 'sharp' }],
  };
  const r = validateXpsh(makeScore([ev]));
  console.log(`[2.1] Valid accidental 'sharp' → valid=${r.valid}`);
  console.assert(r.valid === true, 'FAIL: sharp accidental should be valid');

  const ev2: XPSHEvent = {
    id: 'e1', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord',
    pitches: [61], velocity: 80,
    accidentals: [{ pitch: 61, accidental: 'halfSharp' as any }],
  };
  const r2 = validateXpsh(makeScore([ev2]));
  console.log(`[2.2] Invalid accidental 'halfSharp' → valid=${r2.valid} errors=${JSON.stringify(r2.errors)}`);
  console.assert(r2.valid === false, 'FAIL: invalid accidental type should fail');

  const ev3: XPSHEvent = {
    id: 'e1', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord',
    pitches: [60, 64], velocity: 80,
    accidentals: [{ pitch: 65, accidental: 'flat' }], // pitch 65 not in pitches[]
  };
  const r3 = validateXpsh(makeScore([ev3]));
  console.log(`[2.3] Accidental pitch not in pitches[] → valid=${r3.valid} errors=${JSON.stringify(r3.errors)}`);
  console.assert(r3.valid === false, 'FAIL: accidental for non-present pitch should fail');
}

// ============================================================================
// 3. VALIDATOR – ties
// ============================================================================
console.log('\n=== 3. Validator: Ties ===\n');

{
  const e1: XPSHEvent = { id: 'e1', start_tick: 0,   dur_tick: 480, voice: 1, type: 'chord', pitches: [60], ties: [{ pitch: 60, start: true, stop: false, toEventId: 'e2' }] };
  const e2: XPSHEvent = { id: 'e2', start_tick: 480, dur_tick: 480, voice: 1, type: 'chord', pitches: [60], ties: [{ pitch: 60, start: false, stop: true }] };
  const r = validateXpsh(makeScore([e1, e2]));
  console.log(`[3.1] Valid tie chain e1→e2 → valid=${r.valid}`);
  console.assert(r.valid === true, 'FAIL: valid tie should pass');

  const e3: XPSHEvent = { id: 'e3', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord', pitches: [60], ties: [{ pitch: 60, start: true, stop: false, toEventId: 'eX' }] };
  const r2 = validateXpsh(makeScore([e3]));
  console.log(`[3.2] Tie toEventId 'eX' not found → valid=${r2.valid} errors=${JSON.stringify(r2.errors)}`);
  console.assert(r2.valid === false, 'FAIL: tie to missing event should fail');

  const e4: XPSHEvent = { id: 'e4', start_tick: 0, dur_tick: 480, voice: 1, type: 'chord', pitches: [64], ties: [{ pitch: 60, start: true, stop: false, toEventId: 'e5' }] };
  const e5: XPSHEvent = { id: 'e5', start_tick: 480, dur_tick: 480, voice: 1, type: 'chord', pitches: [60] };
  const r3 = validateXpsh(makeScore([e4, e5]));
  console.log(`[3.3] Tie pitch 60 not in pitches[64] → valid=${r3.valid} errors=${JSON.stringify(r3.errors)}`);
  console.assert(r3.valid === false, 'FAIL: tie on non-present pitch should fail');
}

// ============================================================================
// 4. VALIDATOR – voice values
// ============================================================================
console.log('\n=== 4. Validator: Voice Values ===\n');

{
  const ev1 = { ...makeChord('e1', 0, 480, [60]), voice: 1 as 1 | 2 };
  const ev2 = { ...makeChord('e2', 0, 480, [64]), voice: 2 as 1 | 2 };
  const r = validateXpsh(makeScore([ev1, ev2]));
  console.log(`[4.1] Voices 1 and 2 → valid=${r.valid}`);
  console.assert(r.valid === true, 'FAIL: voices 1 and 2 should be valid');

  const ev3 = { ...makeChord('e3', 480, 480, [67]), voice: 3 as any };
  const r2 = validateXpsh(makeScore([ev3]));
  console.log(`[4.2] Voice 3 (invalid) → valid=${r2.valid} errors=${JSON.stringify(r2.errors)}`);
  console.assert(r2.valid === false, 'FAIL: voice 3 should fail');
}

// ============================================================================
// 5. VALIDATOR – pedal
// ============================================================================
console.log('\n=== 5. Validator: Pedal Events ===\n');

{
  const ev = makePedal('p1', 0, 1920);
  const r = validateXpsh(makeScore([], [ev]));
  console.log(`[5.1] Valid pedal event dur=1920 → valid=${r.valid}`);
  console.assert(r.valid === true, 'FAIL: valid pedal should pass');

  const ev2 = { ...makePedal('p2', 0, 0), dur_tick: 0 };
  const r2 = validateXpsh(makeScore([], [ev2]));
  console.log(`[5.2] Pedal with dur_tick=0 → valid=${r2.valid} errors=${JSON.stringify(r2.errors)}`);
  console.assert(r2.valid === false, 'FAIL: pedal dur_tick=0 should fail');
}

// ============================================================================
// 6. VALIDATOR – triplet group
// ============================================================================
console.log('\n=== 6. Validator: Triplet Groups ===\n');

{
  const makeTriNote = (id: string, start: number, dur: number): XPSHEvent => ({
    id, start_tick: start, dur_tick: dur, voice: 1, type: 'chord', pitches: [60],
    tuplet: { type: 'triplet', actual: 3, normal: 2, groupId: 'g1' },
  });
  const e1 = makeTriNote('t1', 0, 320);
  const e2 = makeTriNote('t2', 320, 320);
  const e3 = makeTriNote('t3', 640, 320);
  const r = validateXpsh(makeScore([e1, e2, e3]));
  console.log(`[6.1] Valid triplet group (3 notes, groupId=g1) → valid=${r.valid}`);
  console.assert(r.valid === true, 'FAIL: valid triplet should pass');

  // 2 notes in a triplet group (incomplete)
  const r2 = validateXpsh(makeScore([e1, e2]));
  console.log(`[6.2] Incomplete triplet (2/3 notes) → valid=${r2.valid} warnings=${JSON.stringify(r2.warnings)}`);
  // incomplete groups should produce warning or error but still be invalid
  console.assert(r2.errors.length > 0 || r2.warnings.length > 0, 'FAIL: incomplete triplet should warn/error');
}

// ============================================================================
// 7. COMPILER – chord events produce correct NoteOn count
// ============================================================================
console.log('\n=== 7. Compiler: Chord NoteOn Count ===\n');

{
  const chord = makeChord('e1', 0, 480, [60, 64, 67]);
  const score = makeScore([chord]);
  const tl = compileTimeline(score);
  const onEvents = tl.events.filter(e => e.type === 'on');
  const offEvents = tl.events.filter(e => e.type === 'off');
  console.log(`[7.1] Chord [C4,E4,G4] → NoteOn=${onEvents.length}, NoteOff=${offEvents.length}`);
  console.assert(onEvents.length === 3, `FAIL: expected 3 NoteOn, got ${onEvents.length}`);
  console.assert(offEvents.length === 3, `FAIL: expected 3 NoteOff, got ${offEvents.length}`);
}

// ============================================================================
// 8. COMPILER – tie suppresses re-attack
// ============================================================================
console.log('\n=== 8. Compiler: Tie Suppresses Re-attack ===\n');

{
  const e1: XPSHEvent = { id: 'e1', start_tick: 0,   dur_tick: 480, voice: 1, type: 'chord', pitches: [60],
    ties: [{ pitch: 60, start: true, stop: false, toEventId: 'e2' }] };
  const e2: XPSHEvent = { id: 'e2', start_tick: 480, dur_tick: 480, voice: 1, type: 'chord', pitches: [60],
    ties: [{ pitch: 60, start: false, stop: true }] };
  const score = makeScore([e1, e2]);

  // validate first
  const vr = validateXpsh(score);
  console.log(`[8.0] Validation → valid=${vr.valid} errors=${JSON.stringify(vr.errors)}`);
  console.assert(vr.valid === true, 'FAIL: tie score should validate');

  const tl = compileTimeline(score);
  const onC4 = tl.events.filter(e => e.type === 'on' && (e as any).pitch === 60);
  const offC4 = tl.events.filter(e => e.type === 'off' && (e as any).pitch === 60);
  console.log(`[8.1] Tie C4 q→q → NoteOn(C4)=${onC4.length} NoteOff(C4)=${offC4.length}`);
  // Tie: only 1 NoteOn (not 2), and NoteOff deferred to end of chain (960 total ticks)
  console.assert(onC4.length === 1, `FAIL: tied note should have 1 NoteOn, got ${onC4.length}`);
  console.assert(offC4.length === 1, `FAIL: tied note should have 1 NoteOff, got ${offC4.length}`);

  const bpm = score.timing.tempo_bpm;
  const ticksPerBeat = 480;
  const msPerTick = (60 / bpm) / ticksPerBeat * 1000;
  const expectedOffMs = 960 * msPerTick;
  const actualOffMs = (offC4[0] as any).t;
  console.log(`[8.2] NoteOff(C4) at ${actualOffMs.toFixed(1)}ms (expected ≈${expectedOffMs.toFixed(1)}ms)`);
  console.assert(Math.abs(actualOffMs - expectedOffMs) < 1, `FAIL: NoteOff should be at chain end`);
}

// ============================================================================
// 9. COMPILER – pedal events generate CC64
// ============================================================================
console.log('\n=== 9. Compiler: Pedal CC64 Events ===\n');

{
  const note: XPSHEvent = makeChord('n1', 0, 480, [48]);
  const pedal: XPSHEvent = makePedal('p1', 0, 1920);
  const score = makeScore([note], [pedal]);
  const tl = compileTimeline(score);
  const cc64 = tl.events.filter(e => e.type === 'cc64');
  const cc64down = cc64.filter(e => (e as any).value === 127);
  const cc64up   = cc64.filter(e => (e as any).value === 0);
  console.log(`[9.1] Pedal 0-1920 → CC64 down=${cc64down.length} up=${cc64up.length}`);
  console.assert(cc64down.length === 1, `FAIL: expected 1 CC64 down, got ${cc64down.length}`);
  console.assert(cc64up.length === 1,   `FAIL: expected 1 CC64 up, got ${cc64up.length}`);

  const bpm = score.timing.tempo_bpm;
  const msPerTick = (60 / bpm) / 480 * 1000;
  const upMs = 1920 * msPerTick;
  const actualUp = (cc64up[0] as any).t;
  console.log(`[9.2] CC64 up at ${actualUp.toFixed(1)}ms (expected ${upMs.toFixed(1)}ms)`);
  console.assert(Math.abs(actualUp - upMs) < 1, `FAIL: CC64 up should be at pedal end`);
}

// ============================================================================
// 10. COMPILER – triplet timing scaled 2/3
// ============================================================================
console.log('\n=== 10. Compiler: Triplet Timing ===\n');

{
  const makeTriNote = (id: string, start: number): XPSHEvent => ({
    id, start_tick: start, dur_tick: 320, voice: 1, type: 'chord', pitches: [60],
    tuplet: { type: 'triplet', actual: 3, normal: 2, groupId: 'grp' },
  });
  const [t1, t2, t3] = [makeTriNote('t1', 0), makeTriNote('t2', 320), makeTriNote('t3', 640)];
  const score = makeScore([t1, t2, t3]);

  const vr = validateXpsh(score);
  console.log(`[10.0] Validation → valid=${vr.valid} errors=${JSON.stringify(vr.errors)}`);
  console.assert(vr.valid === true, 'FAIL: triplet score should validate');

  const tl = compileTimeline(score);
  const ons = tl.events.filter(e => e.type === 'on').sort((a, b) => (a as any).t - (b as any).t);
  const bpm = score.timing.tempo_bpm;
  const msPerTick = (60 / bpm) / 480 * 1000;
  const ratio = 2 / 3;
  const expected = [0, 320, 640].map(tick => tick * ratio * msPerTick);

  console.log(`[10.1] Triplet NoteOn times: ${ons.map(e => (e as any).t.toFixed(1)).join(', ')}ms`);
  console.log(`       Expected:             ${expected.map(t => t.toFixed(1)).join(', ')}ms`);
  for (let i = 0; i < 3; i++) {
    console.assert(Math.abs((ons[i] as any).t - expected[i]) < 2, `FAIL: triplet note ${i+1} timing off`);
  }
}

// ============================================================================
// 11. EDITOR OPS – insertEvent and findEventById
// ============================================================================
console.log('\n=== 11. Editor Ops: insertEvent / findEventById ===\n');

{
  const baseScore = makeScore([]);
  const score = insertEvent(baseScore, {
    trackId: 'RH', start_tick: 0, dur_tick: 480,
    voice: 1, type: 'chord', pitches: [60], velocity: 80,
  });
  const firstTrack = score.tracks.find((t: any) => t.id === 'RH');
  const insertedId = (firstTrack?.events ?? [])[0]?.id ?? '';
  const found = findEventById(score, insertedId);
  console.log(`[11.1] insertEvent → findEventById found=${found !== null} id=${insertedId}`);
  console.assert(found !== null, 'FAIL: inserted event not found');
  console.assert(found?.event.id === insertedId, 'FAIL: wrong event returned');
  console.assert(found?.trackId === 'RH', 'FAIL: wrong trackId');
}

// ============================================================================
// 12. EDITOR OPS – insertOrUpdateChordPitch (chord mode)
// ============================================================================
console.log('\n=== 12. Editor Ops: insertOrUpdateChordPitch ===\n');

{
  const baseScore = makeScore([makeChord('e1', 0, 480, [60])]);

  // Add pitch 64 to existing event at tick 0, voice 1
  const score2 = insertOrUpdateChordPitch(baseScore, { trackId: 'RH', start_tick: 0, dur_tick: 480, pitch: 64, voice: 1, velocity: 80 });
  const found = findEventById(score2, 'e1');
  console.log(`[12.1] Add E4 to existing chord → pitches=${JSON.stringify(found?.event.pitches)}`);
  console.assert(found?.event.pitches?.includes(64), 'FAIL: E4 not added to chord');

  // Adding a new pitch to empty tick creates new event
  const score3 = insertOrUpdateChordPitch(baseScore, { trackId: 'RH', start_tick: 960, dur_tick: 480, pitch: 67, voice: 1, velocity: 80 });
  const newEv = findEventAt(score3, 960, 1, 'RH', 0);
  console.log(`[12.2] insertOrUpdateChordPitch at new tick → event=${newEv !== null}`);
  console.assert(newEv !== null, 'FAIL: new chord not created');
  console.assert(newEv?.pitches?.includes(67), 'FAIL: G4 not in new chord');
}

// ============================================================================
// 13. EDITOR OPS – setAccidental
// ============================================================================
console.log('\n=== 13. Editor Ops: setAccidental ===\n');

{
  const score = makeScore([makeChord('e1', 0, 480, [61])]);
  const score2 = setAccidental(score, 'e1', 61, 'sharp');
  const ev = findEventById(score2, 'e1')?.event;
  const acc = ev?.accidentals?.find((a: {pitch: number; accidental: string}) => a.pitch === 61);
  console.log(`[13.1] setAccidental(61, 'sharp') → accidental=${acc?.accidental}`);
  console.assert(acc?.accidental === 'sharp', 'FAIL: accidental not set');

  const score3 = setAccidental(score2, 'e1', 61, 'none');
  const ev3 = findEventById(score3, 'e1')?.event;
  const acc3 = ev3?.accidentals?.find((a: {pitch: number; accidental: string}) => a.pitch === 61);
  console.log(`[13.2] setAccidental(61, 'none') → removed=${acc3 === undefined}`);
  console.assert(acc3 === undefined, 'FAIL: accidental with none should be removed');
}

// ============================================================================
// 14. EDITOR OPS – addTie
// ============================================================================
console.log('\n=== 14. Editor Ops: addTie ===\n');

{
  const e1 = makeChord('e1', 0,   480, [60]);
  const e2 = makeChord('e2', 480, 480, [60]);
  const score = makeScore([e1, e2]);
  const score2 = addTie(score, 'e1', 'e2', 60);

  const ev1 = findEventById(score2, 'e1')?.event;
  const ev2 = findEventById(score2, 'e2')?.event;
  const tie1 = ev1?.ties?.find((t: {pitch: number}) => t.pitch === 60);
  const tie2 = ev2?.ties?.find((t: {pitch: number}) => t.pitch === 60);

  console.log(`[14.1] addTie(e1→e2, pitch=60) → e1.tie.start=${tie1?.start} toEventId=${tie1?.toEventId}`);
  console.assert(tie1?.start === true, 'FAIL: tie start not set on e1');
  console.assert(tie1?.toEventId === 'e2', 'FAIL: toEventId not set correctly');
  console.log(`[14.2] e2.tie.stop=${tie2?.stop}`);
  console.assert(tie2?.stop === true, 'FAIL: tie stop not set on e2');
}

// ============================================================================
// 15. EDITOR OPS – addPedalRange
// ============================================================================
console.log('\n=== 15. Editor Ops: addPedalRange ===\n');

{
  const score = makeScore([]);
  const score2 = addPedalRange(score, 'LH', 0, 1920);
  const lh = score2.tracks.find((t: {id: string}) => t.id === 'LH');
  const pedalEvs = ((lh as any)?.events ?? []).filter((e: {type: string}) => e.type === 'pedal');
  console.log(`[15.1] addPedalRange(LH, 0, 1920) → pedal events=${pedalEvs.length}`);
  console.assert(pedalEvs.length === 1, 'FAIL: pedal event not created');
  console.assert(pedalEvs[0].dur_tick === 1920, 'FAIL: pedal dur_tick wrong');
}

// ============================================================================
// 16. EDITOR OPS – applyTripletGroup
// ============================================================================
console.log('\n=== 16. Editor Ops: applyTripletGroup ===\n');

{
  const e1 = makeChord('t1', 0,   320, [60]);
  const e2 = makeChord('t2', 320, 320, [62]);
  const e3 = makeChord('t3', 640, 320, [64]);
  const score = makeScore([e1, e2, e3]);
  const score2 = applyTripletGroup(score, ['t1', 't2', 't3']);

  const ev1 = findEventById(score2, 't1')?.event;
  const ev2 = findEventById(score2, 't2')?.event;
  const ev3 = findEventById(score2, 't3')?.event;

  console.log(`[16.1] applyTripletGroup → t1.tuplet=${JSON.stringify(ev1?.tuplet)}`);
  console.assert(ev1?.tuplet?.type === 'triplet', 'FAIL: tuplet type not set');
  console.assert(ev1?.tuplet?.groupId === ev2?.tuplet?.groupId, 'FAIL: groupIds differ');
  console.assert(ev2?.tuplet?.groupId === ev3?.tuplet?.groupId, 'FAIL: groupIds differ');
  console.assert(ev1?.tuplet?.actual === 3, 'FAIL: actual not 3');
  console.assert(ev1?.tuplet?.normal === 2, 'FAIL: normal not 2');
}

// ============================================================================
// 17. EDITOR OPS – setVoice
// ============================================================================
console.log('\n=== 17. Editor Ops: setVoice ===\n');

{
  const ev = makeChord('e1', 0, 480, [60], 1);
  const score = makeScore([ev]);
  const score2 = setVoice(score, 'e1', 2);
  const ev2 = findEventById(score2, 'e1')?.event;
  console.log(`[17.1] setVoice(e1, 2) → voice=${ev2?.voice}`);
  console.assert(ev2?.voice === 2, 'FAIL: voice not changed to 2');
}

// ============================================================================
// 18. EDITOR OPS – countEvents / getEventsInTickRange
// ============================================================================
console.log('\n=== 18. Editor Ops: countEvents / getEventsInTickRange ===\n');

{
  const events = [
    makeChord('e1', 0, 480, [60]),
    makeChord('e2', 480, 480, [62]),
    makeChord('e3', 960, 480, [64]),
    makeRest('r1', 1440, 480),
  ];
  const score = makeScore(events);
  const total = countEvents(score);
  console.log(`[18.1] countEvents → ${total}`);
  console.assert(total === 4, `FAIL: expected 4 events, got ${total}`);

  const inRange = getEventsInTickRange(score, 'RH', 480, 960);
  console.log(`[18.2] getEventsInTickRange(480-960) → ${inRange.length} events`);
  console.assert(inRange.length === 1, `FAIL: expected 1 event in [480,960), got ${inRange.length}`);
  console.assert(inRange[0].id === 'e2', 'FAIL: wrong event in range');
}

// ============================================================================
// 19. End-to-end: Two Voices compile without crash
// ============================================================================
console.log('\n=== 19. Two Voices: Compile Without Crash ===\n');

{
  const ev1 = makeChord('v1a', 0,    480, [72], 1);
  const ev2 = makeChord('v1b', 480,  480, [71], 1);
  const ev3 = makeChord('v2a', 0,    960, [64], 2);
  const score = makeScore([ev1, ev2, ev3]);
  let error: unknown = null;
  let tl: ReturnType<typeof compileTimeline> | null = null;
  try {
    tl = compileTimeline(score);
  } catch (e) {
    error = e;
  }
  console.log(`[19.1] Two voices compile → error=${error}`);
  console.assert(error === null, `FAIL: compile threw error: ${error}`);
  const v1ons = tl?.events.filter(e => e.type === 'on' && [72, 71].includes((e as any).pitch)) ?? [];
  const v2ons = tl?.events.filter(e => e.type === 'on' && (e as any).pitch === 64) ?? [];
  console.log(`[19.2] V1 NoteOn=${v1ons.length}, V2 NoteOn=${v2ons.length}`);
  console.assert(v1ons.length === 2, `FAIL: V1 should have 2 NoteOn, got ${v1ons.length}`);
  console.assert(v2ons.length === 1, `FAIL: V2 should have 1 NoteOn, got ${v2ons.length}`);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║              All Phase 8 Tests Done             ║');
console.log('╚══════════════════════════════════════════════════╝');
