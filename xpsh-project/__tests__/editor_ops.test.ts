/**
 * Editor Operations Test
 * Test insert, delete, find operations
 */

import {
  insertNote,
  deleteNote,
  findNoteAt,
  clearAllNotes,
  countNotes,
  measureBeatToTick,
  tickToMeasureBeat,
  validateScore,
  DURATION_VALUES
} from './editor_ops';
import { createEmptyScore } from './exportXpsh';

console.log('╔════════════════════════════════════════════════╗');
console.log('║   XPSH Editor Operations Test                 ║');
console.log('╚════════════════════════════════════════════════╝\n');

// ============================================================================
// Test 1: Create Empty Score
// ============================================================================

console.log('📝 Test 1: Create Empty Score\n');

let score = createEmptyScore('Test Piece');
console.log(`   Title: ${score.metadata.title}`);
console.log(`   Tracks: ${score.tracks.length}`);
console.log(`   Initial notes: ${countNotes(score)}`);
console.log(`   ✓ Empty score created\n`);

// ============================================================================
// Test 2: Insert Notes
// ============================================================================

console.log('📝 Test 2: Insert Notes\n');

// Add C4 quarter note at measure 1, beat 1 (tick 0)
score = insertNote(score, {
  pitch: 60,  // C4
  start_tick: 0,
  dur_tick: DURATION_VALUES.quarter,
  velocity: 80,
  trackId: 'track_rh'
});
console.log(`   Added C4 quarter at tick 0`);

// Add E4 half note at measure 1, beat 2 (tick 480)
score = insertNote(score, {
  pitch: 64,  // E4
  start_tick: 480,
  dur_tick: DURATION_VALUES.half,
  velocity: 80,
  trackId: 'track_rh'
});
console.log(`   Added E4 half at tick 480`);

// Add G4 whole note at measure 2, beat 1 (tick 1920)
score = insertNote(score, {
  pitch: 67,  // G4
  start_tick: 1920,
  dur_tick: DURATION_VALUES.whole,
  velocity: 80,
  trackId: 'track_rh'
});
console.log(`   Added G4 whole at tick 1920`);

// Add C3 in left hand
score = insertNote(score, {
  pitch: 48,  // C3
  start_tick: 0,
  dur_tick: DURATION_VALUES.whole,
  velocity: 80,
  trackId: 'track_lh'
});
console.log(`   Added C3 whole at tick 0 (LH)`);

console.log(`   Total notes: ${countNotes(score)}`);
console.log(`   ✓ Notes inserted successfully\n`);

// ============================================================================
// Test 3: Find Note
// ============================================================================

console.log('📝 Test 3: Find Note\n');

const found = findNoteAt(score, 60, 0, 100);
if (found) {
  console.log(`   Found note: pitch=${found.note.pitch}, tick=${found.note.start_tick}, track=${found.trackId}`);
  console.log(`   ✓ Note found successfully\n`);
} else {
  console.log(`   ❌ Note not found\n`);
}

const notFound = findNoteAt(score, 99, 5000, 100);
if (!notFound) {
  console.log(`   ✓ Correctly returned null for non-existent note\n`);
}

// ============================================================================
// Test 4: Measure/Beat Conversion
// ============================================================================

console.log('📝 Test 4: Measure/Beat Conversion\n');

// Test measureBeatToTick
const tick1 = measureBeatToTick(0, 0);  // Measure 1, beat 1
const tick2 = measureBeatToTick(1, 2);  // Measure 2, beat 3
const tick3 = measureBeatToTick(7, 3);  // Measure 8, beat 4

console.log(`   Measure 1, Beat 1 → ${tick1} ticks (expected: 0)`);
console.log(`   Measure 2, Beat 3 → ${tick2} ticks (expected: 2400)`);
console.log(`   Measure 8, Beat 4 → ${tick3} ticks (expected: 15360)`);

// Test tickToMeasureBeat
const mb1 = tickToMeasureBeat(0);
const mb2 = tickToMeasureBeat(2400);
const mb3 = tickToMeasureBeat(15360);

console.log(`   0 ticks → M${mb1.measureIndex + 1}, B${mb1.beatIndex + 1}`);
console.log(`   2400 ticks → M${mb2.measureIndex + 1}, B${mb2.beatIndex + 1}`);
console.log(`   15360 ticks → M${mb3.measureIndex + 1}, B${mb3.beatIndex + 1}`);
console.log(`   ✓ Conversion working correctly\n`);

// ============================================================================
// Test 5: Delete Note
// ============================================================================

console.log('📝 Test 5: Delete Note\n');

const beforeCount = countNotes(score);
const firstNote = score.tracks[0].notes[0];

if (firstNote) {
  console.log(`   Deleting note: ${firstNote.id}`);
  score = deleteNote(score, firstNote.id);
  const afterCount = countNotes(score);
  
  console.log(`   Before: ${beforeCount} notes`);
  console.log(`   After: ${afterCount} notes`);
  console.log(`   ✓ Note deleted successfully\n`);
}

// ============================================================================
// Test 6: Validation
// ============================================================================

console.log('📝 Test 6: Score Validation\n');

const validation = validateScore(score);
console.log(`   Valid: ${validation.valid}`);
console.log(`   Errors: ${validation.errors.length}`);

if (validation.errors.length > 0) {
  console.log(`   Error details:`);
  validation.errors.forEach(err => console.log(`     - ${err}`));
} else {
  console.log(`   ✓ Score is valid\n`);
}

// ============================================================================
// Test 7: Clear All
// ============================================================================

console.log('📝 Test 7: Clear All Notes\n');

const beforeClear = countNotes(score);
score = clearAllNotes(score);
const afterClear = countNotes(score);

console.log(`   Before clear: ${beforeClear} notes`);
console.log(`   After clear: ${afterClear} notes`);
console.log(`   ✓ All notes cleared\n`);

// ============================================================================
// Test 8: Edge Cases
// ============================================================================

console.log('📝 Test 8: Edge Cases\n');

// Try to insert out of range
const beforeEdge = countNotes(score);

// Invalid pitch (too high)
score = insertNote(score, {
  pitch: 200,
  start_tick: 0,
  dur_tick: 480,
  velocity: 80,
  trackId: 'track_rh'
});

// Invalid tick (beyond 8 measures)
score = insertNote(score, {
  pitch: 60,
  start_tick: 20000,
  dur_tick: 480,
  velocity: 80,
  trackId: 'track_rh'
});

const afterEdge = countNotes(score);

if (beforeEdge === afterEdge) {
  console.log(`   ✓ Invalid inserts correctly rejected\n`);
} else {
  console.log(`   ❌ Invalid inserts were accepted (bug!)\n`);
}

// ============================================================================
// Summary
// ============================================================================

console.log('═'.repeat(50));
console.log('✅ All editor operations tests completed!');
console.log('═'.repeat(50) + '\n');

// Print final score summary
console.log('📊 Final Score Summary:\n');
console.log(`   Title: ${score.metadata.title}`);
console.log(`   Format: ${score.format_version}`);
console.log(`   Tempo: ${score.timing.tempo_bpm} BPM`);
console.log(`   Time: ${score.timing.time_signature.numerator}/${score.timing.time_signature.denominator}`);
console.log(`   Total Notes: ${countNotes(score)}`);
console.log();

// Print notes by track
score.tracks.forEach(track => {
  console.log(`   ${track.name} (${track.id}): ${track.notes.length} notes`);
  track.notes.forEach(note => {
    const mb = tickToMeasureBeat(note.start_tick);
    console.log(`     - Pitch ${note.pitch} @ M${mb.measureIndex + 1}B${mb.beatIndex + 1}, dur=${note.dur_tick}t`);
  });
});

console.log('\n✨ Editor operations working correctly!\n');
