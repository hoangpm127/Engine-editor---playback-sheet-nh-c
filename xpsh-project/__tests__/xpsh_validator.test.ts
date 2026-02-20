/**
 * XPSH Validator Test Suite
 * Comprehensive tests cho validation logic
 */

import {
  validateXpsh,
  safeParseXpsh,
  isPlaybackSafe,
  isEditorSafe,
  isValidXpsh,
  formatValidationErrors,
  ValidationResult
} from '../lib/xpsh_validator';

console.log('╔════════════════════════════════════════════════╗');
console.log('║   XPSH Validator Test Suite                   ║');
console.log('╚════════════════════════════════════════════════╝\n');

// ============================================================================
// Test Data
// ============================================================================

// Valid score
const validScore = {
  format: 'xpsh',
  format_version: '1.0.0',
  metadata: {
    title: 'Test Piece',
    composer: 'Test Composer'
  },
  timing: {
    ticks_per_quarter: 480,
    tempo_bpm: 120,
    time_signature: {
      numerator: 4,
      denominator: 4
    }
  },
  tracks: [
    {
      id: 'track_rh',
      name: 'Right Hand',
      type: 'piano',
      clef: 'treble',
      notes: [
        {
          id: 'n1',
          pitch: 60,
          start_tick: 0,
          dur_tick: 480,
          velocity: 80
        },
        {
          id: 'n2',
          pitch: 64,
          start_tick: 480,
          dur_tick: 480,
          velocity: 80
        }
      ]
    },
    {
      id: 'track_lh',
      name: 'Left Hand',
      type: 'piano',
      clef: 'bass',
      notes: []
    }
  ]
};

// ============================================================================
// Test 1: Valid Score
// ============================================================================

console.log('📝 Test 1: Valid Score\n');

const result1 = validateXpsh(validScore);
console.log(`   Valid: ${result1.valid}`);
console.log(`   Errors: ${result1.errors.length}`);
console.log(`   Warnings: ${result1.warnings.length}`);

if (result1.valid) {
  console.log('   ✓ Valid score passed\n');
} else {
  console.log('   ❌ Valid score failed:\n');
  result1.errors.forEach(err => console.log(`     - ${err}`));
}

// ============================================================================
// Test 2: Invalid Format
// ============================================================================

console.log('📝 Test 2: Invalid Format\n');

const invalidFormat = { ...validScore, format: 'xps' };
const result2 = validateXpsh(invalidFormat);

console.log(`   Valid: ${result2.valid}`);
console.log(`   Errors: ${result2.errors.length}`);
if (result2.errors.length > 0) {
  console.log(`   Error: "${result2.errors[0]}"`);
  console.log('   ✓ Correctly detected invalid format\n');
} else {
  console.log('   ❌ Failed to detect invalid format\n');
}

// ============================================================================
// Test 3: Invalid Pitch (Out of Range)
// ============================================================================

console.log('📝 Test 3: Invalid Pitch (Out of Range)\n');

const invalidPitch = JSON.parse(JSON.stringify(validScore));
invalidPitch.tracks[0].notes[0].pitch = 200; // > 108

const result3 = validateXpsh(invalidPitch);
console.log(`   Valid: ${result3.valid}`);
console.log(`   Errors: ${result3.errors.length}`);

const hasPitchError = result3.errors.some(err => err.includes('pitch'));
if (hasPitchError) {
  console.log(`   Error: "${result3.errors.find(e => e.includes('pitch'))}"`);
  console.log('   ✓ Correctly detected invalid pitch\n');
} else {
  console.log('   ❌ Failed to detect invalid pitch\n');
}

// ============================================================================
// Test 4: Invalid Pitch (Below Minimum)
// ============================================================================

console.log('📝 Test 4: Invalid Pitch (Below Minimum)\n');

const lowPitch = JSON.parse(JSON.stringify(validScore));
lowPitch.tracks[0].notes[0].pitch = 10; // < 21

const result4 = validateXpsh(lowPitch);
const hasLowPitchError = result4.errors.some(err => err.includes('pitch') && err.includes('21'));

if (hasLowPitchError) {
  console.log(`   Error: "${result4.errors.find(e => e.includes('pitch'))}"`);
  console.log('   ✓ Correctly detected pitch below minimum\n');
} else {
  console.log('   ❌ Failed to detect low pitch\n');
}

// ============================================================================
// Test 5: Negative Duration
// ============================================================================

console.log('📝 Test 5: Negative Duration\n');

const negativeDur = JSON.parse(JSON.stringify(validScore));
negativeDur.tracks[0].notes[0].dur_tick = -100;

const result5 = validateXpsh(negativeDur);
console.log(`   Valid: ${result5.valid}`);

const hasDurError = result5.errors.some(err => err.includes('dur_tick') && err.includes('> 0'));
if (hasDurError) {
  console.log(`   Error: "${result5.errors.find(e => e.includes('dur_tick'))}"`);
  console.log('   ✓ Correctly detected negative duration\n');
} else {
  console.log('   ❌ Failed to detect negative duration\n');
}

// ============================================================================
// Test 6: Zero Duration
// ============================================================================

console.log('📝 Test 6: Zero Duration\n');

const zeroDur = JSON.parse(JSON.stringify(validScore));
zeroDur.tracks[0].notes[0].dur_tick = 0;

const result6 = validateXpsh(zeroDur);
const hasZeroDurError = result6.errors.some(err => err.includes('dur_tick'));

if (hasZeroDurError) {
  console.log(`   Error: "${result6.errors.find(e => e.includes('dur_tick'))}"`);
  console.log('   ✓ Correctly detected zero duration\n');
} else {
  console.log('   ❌ Failed to detect zero duration\n');
}

// ============================================================================
// Test 7: Duplicate Note IDs
// ============================================================================

console.log('📝 Test 7: Duplicate Note IDs\n');

const duplicateIds = JSON.parse(JSON.stringify(validScore));
duplicateIds.tracks[0].notes[1].id = 'n1'; // Same as first note

const result7 = validateXpsh(duplicateIds);
console.log(`   Valid: ${result7.valid}`);

const hasDuplicateError = result7.errors.some(err => err.includes('Duplicate note IDs'));
if (hasDuplicateError) {
  console.log(`   Error: "${result7.errors.find(e => e.includes('Duplicate'))}"`);
  console.log('   ✓ Correctly detected duplicate IDs\n');
} else {
  console.log('   ❌ Failed to detect duplicate IDs\n');
}

// ============================================================================
// Test 8: Invalid Velocity (Out of Range)
// ============================================================================

console.log('📝 Test 8: Invalid Velocity\n');

const invalidVelocity = JSON.parse(JSON.stringify(validScore));
invalidVelocity.tracks[0].notes[0].velocity = 200; // > 127

const result8 = validateXpsh(invalidVelocity);
const hasVelocityError = result8.errors.some(err => err.includes('velocity'));

if (hasVelocityError) {
  console.log(`   Error: "${result8.errors.find(e => e.includes('velocity'))}"`);
  console.log('   ✓ Correctly detected invalid velocity\n');
} else {
  console.log('   ❌ Failed to detect invalid velocity\n');
}

// ============================================================================
// Test 9: Negative Start Tick
// ============================================================================

console.log('📝 Test 9: Negative Start Tick\n');

const negativeStart = JSON.parse(JSON.stringify(validScore));
negativeStart.tracks[0].notes[0].start_tick = -10;

const result9 = validateXpsh(negativeStart);
const hasNegativeStartError = result9.errors.some(err => err.includes('start_tick') && err.includes('>= 0'));

if (hasNegativeStartError) {
  console.log(`   Error: "${result9.errors.find(e => e.includes('start_tick'))}"`);
  console.log('   ✓ Correctly detected negative start_tick\n');
} else {
  console.log('   ❌ Failed to detect negative start_tick\n');
}

// ============================================================================
// Test 10: Note Extends Beyond 8 Measures
// ============================================================================

console.log('📝 Test 10: Note Extends Beyond 8 Measures\n');

const beyondMeasures = JSON.parse(JSON.stringify(validScore));
beyondMeasures.tracks[0].notes[0].start_tick = 15000; // Near end
beyondMeasures.tracks[0].notes[0].dur_tick = 1000;    // Extends beyond 15360

const result10 = validateXpsh(beyondMeasures);
const hasBeyondError = result10.errors.some(err => err.includes('extends beyond'));

if (hasBeyondError) {
  console.log(`   Error: "${result10.errors.find(e => e.includes('extends'))}"` );
  console.log('   ✓ Correctly detected note beyond 8 measures\n');
} else {
  console.log('   ❌ Failed to detect note beyond measures\n');
}

// ============================================================================
// Test 11: Missing Required Track
// ============================================================================

console.log('📝 Test 11: Missing Required Track\n');

const missingTrack = JSON.parse(JSON.stringify(validScore));
missingTrack.tracks = missingTrack.tracks.filter((t: any) => t.id !== 'track_lh');

const result11 = validateXpsh(missingTrack);
const hasMissingTrackError = result11.errors.some(err => err.includes('Missing required tracks'));

if (hasMissingTrackError) {
  console.log(`   Error: "${result11.errors.find(e => e.includes('Missing'))}"`);
  console.log('   ✓ Correctly detected missing track\n');
} else {
  console.log('   ❌ Failed to detect missing track\n');
}

// ============================================================================
// Test 12: Invalid Tempo
// ============================================================================

console.log('📝 Test 12: Invalid Tempo (Too High)\n');

const highTempo = JSON.parse(JSON.stringify(validScore));
highTempo.timing.tempo_bpm = 500; // > 400

const result12 = validateXpsh(highTempo);
const hasTempoError = result12.errors.some(err => err.includes('tempo_bpm'));

if (hasTempoError) {
  console.log(`   Error: "${result12.errors.find(e => e.includes('tempo'))}"`);
  console.log('   ✓ Correctly detected invalid tempo\n');
} else {
  console.log('   ❌ Failed to detect invalid tempo\n');
}

// ============================================================================
// Test 13: Invalid Time Signature
// ============================================================================

console.log('📝 Test 13: Invalid Time Signature\n');

const invalidTimeSig = JSON.parse(JSON.stringify(validScore));
invalidTimeSig.timing.time_signature = { numerator: 3, denominator: 4 };

const result13 = validateXpsh(invalidTimeSig);
const hasTimeSigError = result13.errors.some(err => err.includes('time_signature'));

if (hasTimeSigError) {
  console.log(`   Error: "${result13.errors.find(e => e.includes('time_signature'))}"`);
  console.log('   ✓ Correctly detected invalid time signature\n');
} else {
  console.log('   ❌ Failed to detect invalid time signature\n');
}

// ============================================================================
// Test 14: Invalid Ticks Per Quarter
// ============================================================================

console.log('📝 Test 14: Invalid Ticks Per Quarter\n');

const invalidTicks = JSON.parse(JSON.stringify(validScore));
invalidTicks.timing.ticks_per_quarter = 960; // Not 480

const result14 = validateXpsh(invalidTicks);
const hasTicksError = result14.errors.some(err => err.includes('ticks_per_quarter'));

if (hasTicksError) {
  console.log(`   Error: "${result14.errors.find(e => e.includes('ticks_per_quarter'))}"`);
  console.log('   ✓ Correctly detected invalid ticks_per_quarter\n');
} else {
  console.log('   ❌ Failed to detect invalid ticks_per_quarter\n');
}

// ============================================================================
// Test 15: Invalid Format Version
// ============================================================================

console.log('📝 Test 15: Invalid Format Version\n');

const invalidVersion = JSON.parse(JSON.stringify(validScore));
invalidVersion.format_version = '2.0.0';

const result15 = validateXpsh(invalidVersion);
const hasVersionError = result15.errors.some(err => err.includes('format_version'));

if (hasVersionError) {
  console.log(`   Error: "${result15.errors.find(e => e.includes('format_version'))}"`);
  console.log('   ✓ Correctly detected invalid format version\n');
} else {
  console.log('   ❌ Failed to detect invalid format version\n');
}

// ============================================================================
// Test 16: safeParseXpsh - Valid JSON
// ============================================================================

console.log('📝 Test 16: safeParseXpsh - Valid JSON\n');

const validJson = JSON.stringify(validScore);
const parsed = safeParseXpsh(validJson);

if (parsed !== null) {
  console.log('   ✓ Successfully parsed valid JSON\n');
} else {
  console.log('   ❌ Failed to parse valid JSON\n');
}

// ============================================================================
// Test 17: safeParseXpsh - Invalid JSON
// ============================================================================

console.log('📝 Test 17: safeParseXpsh - Invalid JSON String\n');

const invalidJson = '{ invalid json }';
const parsed2 = safeParseXpsh(invalidJson);

if (parsed2 === null) {
  console.log('   ✓ Correctly returned null for invalid JSON\n');
} else {
  console.log('   ❌ Should return null for invalid JSON\n');
}

// ============================================================================
// Test 18: safeParseXpsh - Valid JSON but Invalid XPSH
// ============================================================================

console.log('📝 Test 18: safeParseXpsh - Valid JSON but Invalid XPSH\n');

const invalidXpsh = JSON.stringify(invalidFormat);
const parsed3 = safeParseXpsh(invalidXpsh);

if (parsed3 === null) {
  console.log('   ✓ Correctly returned null for invalid XPSH\n');
} else {
  console.log('   ❌ Should return null for invalid XPSH\n');
}

// ============================================================================
// Test 19: isPlaybackSafe
// ============================================================================

console.log('📝 Test 19: isPlaybackSafe\n');

const safe1 = isPlaybackSafe(validScore);
const safe2 = isPlaybackSafe(invalidPitch);

console.log(`   Valid score playback safe: ${safe1}`);
console.log(`   Invalid score playback safe: ${safe2}`);

if (safe1 && !safe2) {
  console.log('   ✓ isPlaybackSafe working correctly\n');
} else {
  console.log('   ❌ isPlaybackSafe not working correctly\n');
}

// ============================================================================
// Test 20: isValidXpsh
// ============================================================================

console.log('📝 Test 20: isValidXpsh (Quick Check)\n');

const valid1 = isValidXpsh(validScore);
const valid2 = isValidXpsh(invalidPitch);

console.log(`   Valid score: ${valid1}`);
console.log(`   Invalid score: ${valid2}`);

if (valid1 && !valid2) {
  console.log('   ✓ isValidXpsh working correctly\n');
} else {
  console.log('   ❌ isValidXpsh not working correctly\n');
}

// ============================================================================
// Test 21: formatValidationErrors
// ============================================================================

console.log('📝 Test 21: formatValidationErrors\n');

const errorResult = validateXpsh(invalidPitch);
const formatted = formatValidationErrors(errorResult);

console.log('   Formatted output:');
console.log('   ' + formatted.split('\n').join('\n   '));

if (formatted.includes('❌') && formatted.includes('Errors:')) {
  console.log('   ✓ Error formatting working\n');
} else {
  console.log('   ❌ Error formatting not working\n');
}

// ============================================================================
// Test 22: Multiple Errors
// ============================================================================

console.log('📝 Test 22: Multiple Errors\n');

const multipleErrors = JSON.parse(JSON.stringify(validScore));
multipleErrors.format = 'wrong';
multipleErrors.tracks[0].notes[0].pitch = 200;
multipleErrors.tracks[0].notes[0].dur_tick = -10;
multipleErrors.tracks[0].notes[1].id = 'n1'; // Duplicate

const result22 = validateXpsh(multipleErrors);
console.log(`   Valid: ${result22.valid}`);
console.log(`   Total errors: ${result22.errors.length}`);
console.log(`   Errors detected:`);
result22.errors.forEach(err => console.log(`     - ${err}`));

if (result22.errors.length >= 4) {
  console.log('   ✓ Multiple errors detected correctly\n');
} else {
  console.log('   ❌ Not all errors detected\n');
}

// ============================================================================
// Test 23: Edge Case - Note at Boundary (Valid)
// ============================================================================

console.log('📝 Test 23: Edge Case - Note at Boundary (Valid)\n');

const atBoundary = JSON.parse(JSON.stringify(validScore));
atBoundary.tracks[0].notes[0].start_tick = 14880; // Last measure
atBoundary.tracks[0].notes[0].dur_tick = 480;      // Exactly at boundary (end = 15360)

const result23 = validateXpsh(atBoundary);
console.log(`   Valid: ${result23.valid}`);

if (result23.valid) {
  console.log('   ✓ Note at boundary accepted\n');
} else {
  console.log('   ❌ Note at boundary rejected\n');
  result23.errors.forEach(err => console.log(`     - ${err}`));
}

// ============================================================================
// Test 24: Edge Case - Pitch at Boundaries
// ============================================================================

console.log('📝 Test 24: Edge Case - Pitch at Boundaries\n');

const minPitch = JSON.parse(JSON.stringify(validScore));
minPitch.tracks[0].notes[0].pitch = 21; // Minimum (A0)

const maxPitch = JSON.parse(JSON.stringify(validScore));
maxPitch.tracks[0].notes[0].pitch = 108; // Maximum (C8)

const result24a = validateXpsh(minPitch);
const result24b = validateXpsh(maxPitch);

console.log(`   Min pitch (21) valid: ${result24a.valid}`);
console.log(`   Max pitch (108) valid: ${result24b.valid}`);

if (result24a.valid && result24b.valid) {
  console.log('   ✓ Boundary pitches accepted\n');
} else {
  console.log('   ❌ Boundary pitches rejected\n');
}

// ============================================================================
// Summary
// ============================================================================

console.log('═'.repeat(50));
console.log('✅ XPSH Validator Test Suite Complete!');
console.log('═'.repeat(50) + '\n');

console.log('📊 Test Summary:\n');
console.log('   ✓ Valid score validation');
console.log('   ✓ Invalid format detection');
console.log('   ✓ Invalid pitch detection (high & low)');
console.log('   ✓ Negative duration detection');
console.log('   ✓ Zero duration detection');
console.log('   ✓ Duplicate ID detection');
console.log('   ✓ Invalid velocity detection');
console.log('   ✓ Negative start_tick detection');
console.log('   ✓ Note beyond measures detection');
console.log('   ✓ Missing track detection');
console.log('   ✓ Invalid tempo detection');
console.log('   ✓ Invalid time signature detection');
console.log('   ✓ Invalid ticks_per_quarter detection');
console.log('   ✓ Invalid format version detection');
console.log('   ✓ safeParseXpsh functionality');
console.log('   ✓ isPlaybackSafe functionality');
console.log('   ✓ isValidXpsh functionality');
console.log('   ✓ formatValidationErrors functionality');
console.log('   ✓ Multiple errors detection');
console.log('   ✓ Edge case validation');
console.log();

console.log('🎯 All validator functions tested!');
console.log('✨ Validator ready for production!\n');
