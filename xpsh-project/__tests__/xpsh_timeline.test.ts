/**
 * Timeline Test
 * Test compileTimeline function với sample score
 */

import { compileTimeline, debugTimeline, retimeTimeline } from './xpsh_timeline';
import { XPSHScore } from './xpsh_helpers';
import sampleScore from './sample_simple_scale.xpsh.json';

// ============================================================================
// Test Timeline Compilation
// ============================================================================

console.log('╔════════════════════════════════════════════════╗');
console.log('║   XPSH Timeline Test                          ║');
console.log('╚════════════════════════════════════════════════╝\n');

// Load sample score
const score = sampleScore as XPSHScore;

console.log('📄 Score Info:');
console.log(`   Title: ${score.metadata.title}`);
console.log(`   Tempo: ${score.timing.tempo_bpm} BPM`);
console.log(`   Time Signature: ${score.timing.time_signature.numerator}/${score.timing.time_signature.denominator}`);
console.log(`   Tracks: ${score.tracks.length}`);
console.log(`   Total Notes: ${score.tracks.reduce((sum, t) => sum + t.notes.length, 0)}\n`);

// Compile timeline
console.log('⚙️  Compiling timeline...\n');
const timeline = compileTimeline(score);

// Debug output
debugTimeline(timeline, 30);

// ============================================================================
// Test Tempo Change
// ============================================================================

console.log('\n\n📊 Testing Tempo Changes:\n');

const tempos = [60, 120, 180, 240];
tempos.forEach(tempo => {
  const retimed = retimeTimeline(timeline, tempo);
  console.log(`   @ ${tempo} BPM: Duration = ${retimed.totalDurationMs.toFixed(0)}ms (${(retimed.totalDurationMs / 1000).toFixed(2)}s)`);
});

// ============================================================================
// Test Event Statistics
// ============================================================================

console.log('\n\n📈 Event Statistics:\n');

const onEvents = timeline.events.filter(e => e.type === 'on');
const offEvents = timeline.events.filter(e => e.type === 'off');

console.log(`   Total Events: ${timeline.events.length}`);
console.log(`   Note On Events: ${onEvents.length}`);
console.log(`   Note Off Events: ${offEvents.length}`);

// Group by track
const eventsByTrack = timeline.events.reduce((acc, event) => {
  if (event.type === 'on') {
    acc[event.track] = (acc[event.track] || 0) + 1;
  }
  return acc;
}, {} as Record<string, number>);

console.log('\n   Events by Track:');
Object.entries(eventsByTrack).forEach(([track, count]) => {
  console.log(`     ${track}: ${count} notes`);
});

// Pitch range
const pitches = onEvents.map(e => e.pitch);
const minPitch = Math.min(...pitches);
const maxPitch = Math.max(...pitches);

console.log(`\n   Pitch Range: ${minPitch} - ${maxPitch}`);

// Velocity stats
const velocities = onEvents.map(e => e.vel);
const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;

console.log(`   Average Velocity: ${avgVelocity.toFixed(1)}`);

// ============================================================================
// Test Timeline Validation
// ============================================================================

console.log('\n\n✅ Timeline Validation:\n');

let isValid = true;

// Check 1: Events sorted by time
let lastTime = -1;
for (const event of timeline.events) {
  if (event.t < lastTime) {
    console.log(`   ❌ Events not sorted! Found ${event.t}ms after ${lastTime}ms`);
    isValid = false;
    break;
  }
  lastTime = event.t;
}
if (isValid) {
  console.log('   ✓ Events properly sorted by time');
}

// Check 2: Every ON has matching OFF
const noteOnOff = new Map<string, { on: boolean; off: boolean }>();
for (const event of timeline.events) {
  if (!noteOnOff.has(event.noteId)) {
    noteOnOff.set(event.noteId, { on: false, off: false });
  }
  const state = noteOnOff.get(event.noteId)!;
  if (event.type === 'on') state.on = true;
  else state.off = true;
}

let allMatched = true;
noteOnOff.forEach((state, noteId) => {
  if (!state.on || !state.off) {
    console.log(`   ❌ Note ${noteId} missing ${!state.on ? 'ON' : 'OFF'} event`);
    allMatched = false;
  }
});
if (allMatched) {
  console.log('   ✓ All notes have matching ON/OFF events');
}

// Check 3: No negative times
const hasNegative = timeline.events.some(e => e.t < 0);
if (!hasNegative) {
  console.log('   ✓ No negative times');
} else {
  console.log('   ❌ Found negative time values');
  isValid = false;
}

// Check 4: Valid pitch range
const invalidPitch = onEvents.find(e => e.pitch < 0 || e.pitch > 127);
if (!invalidPitch) {
  console.log('   ✓ All pitches in valid MIDI range (0-127)');
} else {
  console.log(`   ❌ Invalid pitch found: ${invalidPitch.pitch}`);
  isValid = false;
}

// Check 5: Valid velocity range
const invalidVel = onEvents.find(e => e.vel < 1 || e.vel > 127);
if (!invalidVel) {
  console.log('   ✓ All velocities in valid range (1-127)');
} else {
  console.log(`   ❌ Invalid velocity found: ${invalidVel.vel}`);
  isValid = false;
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(50));
if (isValid) {
  console.log('✅ All tests passed! Timeline is valid.');
} else {
  console.log('❌ Some tests failed. Please check errors above.');
}
console.log('='.repeat(50) + '\n');
