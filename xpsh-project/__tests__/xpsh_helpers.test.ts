/**
 * XPSH Helpers Test Suite
 * Kiểm tra các function trong xpsh_helpers.ts
 */

import {
  tickToMs,
  msToTick,
  pitchToName,
  nameToPitch,
  newId,
  resetIdCounter,
  TICKS_PER_QUARTER,
  DEFAULT_TEMPO_BPM
} from './xpsh_helpers';

// ============================================================================
// Test Helper Functions
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    testsFailed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const passed = actual === expected;
  if (passed) {
    console.log(`✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual:   ${actual}`);
    testsFailed++;
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
    console.error(`✗ FAIL: ${message} (no error thrown)`);
    testsFailed++;
  } catch (error) {
    console.log(`✓ PASS: ${message}`);
    testsPassed++;
  }
}

// ============================================================================
// Timing Conversion Tests
// ============================================================================

function testTimingConversions(): void {
  console.log('\n=== Testing Timing Conversions ===');
  
  // Test 1: tickToMs(480, 120) should return 500
  assertEqual(tickToMs(480, 120), 500, 'tickToMs(480, 120) = 500ms');
  
  // Test 2: tickToMs(960, 120) should return 1000 (half note)
  assertEqual(tickToMs(960, 120), 1000, 'tickToMs(960, 120) = 1000ms');
  
  // Test 3: tickToMs(1920, 120) should return 2000 (whole note)
  assertEqual(tickToMs(1920, 120), 2000, 'tickToMs(1920, 120) = 2000ms');
  
  // Test 4: tickToMs(240, 120) should return 250 (eighth note)
  assertEqual(tickToMs(240, 120), 250, 'tickToMs(240, 120) = 250ms');
  
  // Test 5: msToTick(500, 120) should return 480
  assertEqual(msToTick(500, 120), 480, 'msToTick(500, 120) = 480 ticks');
  
  // Test 6: msToTick(1000, 120) should return 960
  assertEqual(msToTick(1000, 120), 960, 'msToTick(1000, 120) = 960 ticks');
  
  // Test 7: Round trip conversion
  const originalTick = 480;
  const ms = tickToMs(originalTick, 120);
  const backToTick = msToTick(ms, 120);
  assertEqual(backToTick, originalTick, 'Round trip tick->ms->tick preserves value');
  
  // Test 8: Error handling - invalid tpq
  assertThrows(() => tickToMs(480, 120, 0), 'tickToMs throws on tpq=0');
  
  // Test 9: Error handling - invalid tempo
  assertThrows(() => tickToMs(480, -1), 'tickToMs throws on negative tempo');
}

// ============================================================================
// Pitch Conversion Tests
// ============================================================================

function testPitchConversions(): void {
  console.log('\n=== Testing Pitch Conversions ===');
  
  // Test 10: pitchToName(60) should return "C4" (Middle C)
  assertEqual(pitchToName(60), 'C4', 'pitchToName(60) = "C4"');
  
  // Test 11: nameToPitch("C4") should return 60
  assertEqual(nameToPitch('C4'), 60, 'nameToPitch("C4") = 60');
  
  // Test 12: A4 = 69 (440Hz reference)
  assertEqual(nameToPitch('A4'), 69, 'nameToPitch("A4") = 69');
  assertEqual(pitchToName(69), 'A4', 'pitchToName(69) = "A4"');
  
  // Test 13: C3 = 48 (Bass clef)
  assertEqual(nameToPitch('C3'), 48, 'nameToPitch("C3") = 48');
  assertEqual(pitchToName(48), 'C3', 'pitchToName(48) = "C3"');
  
  // Test 14: C5 = 72
  assertEqual(nameToPitch('C5'), 72, 'nameToPitch("C5") = 72');
  assertEqual(pitchToName(72), 'C5', 'pitchToName(72) = "C5"');
  
  // Test 15: Sharp notes
  assertEqual(nameToPitch('C#4'), 61, 'nameToPitch("C#4") = 61');
  assertEqual(pitchToName(61), 'C#4', 'pitchToName(61) = "C#4"');
  
  // Test 16: Flat notes (Db4 = C#4 = 61)
  assertEqual(nameToPitch('Db4'), 61, 'nameToPitch("Db4") = 61');
  
  // Test 17: More sharps
  assertEqual(nameToPitch('F#4'), 66, 'nameToPitch("F#4") = 66');
  assertEqual(pitchToName(66), 'F#4', 'pitchToName(66) = "F#4"');
  
  // Test 18: More flats (Gb4 = F#4 = 66)
  assertEqual(nameToPitch('Gb4'), 66, 'nameToPitch("Gb4") = 66');
  
  // Test 19: D4 = 62
  assertEqual(nameToPitch('D4'), 62, 'nameToPitch("D4") = 62');
  assertEqual(pitchToName(62), 'D4', 'pitchToName(62) = "D4"');
  
  // Test 20: E4 = 64
  assertEqual(nameToPitch('E4'), 64, 'nameToPitch("E4") = 64');
  assertEqual(pitchToName(64), 'E4', 'pitchToName(64) = "E4"');
  
  // Test 21: F4 = 65
  assertEqual(nameToPitch('F4'), 65, 'nameToPitch("F4") = 65');
  
  // Test 22: G4 = 67
  assertEqual(nameToPitch('G4'), 67, 'nameToPitch("G4") = 67');
  
  // Test 23: B4 = 71
  assertEqual(nameToPitch('B4'), 71, 'nameToPitch("B4") = 71');
  
  // Test 24: Round trip conversion
  const originalPitch = 60;
  const name = pitchToName(originalPitch);
  const backToPitch = nameToPitch(name);
  assertEqual(backToPitch, originalPitch, 'Round trip pitch->name->pitch preserves value');
  
  // Test 25: Error handling - invalid pitch
  assertThrows(() => pitchToName(128), 'pitchToName throws on pitch > 127');
  assertThrows(() => pitchToName(-1), 'pitchToName throws on negative pitch');
  
  // Test 26: Error handling - invalid note name
  assertThrows(() => nameToPitch('X4'), 'nameToPitch throws on invalid note letter');
  assertThrows(() => nameToPitch('C'), 'nameToPitch throws on missing octave');
  assertThrows(() => nameToPitch('c4'), 'nameToPitch throws on lowercase note');
}

// ============================================================================
// ID Generation Tests
// ============================================================================

function testIdGeneration(): void {
  console.log('\n=== Testing ID Generation ===');
  
  // Reset counter for consistent testing
  resetIdCounter();
  
  // Test 27: ID format
  const id1 = newId('n');
  assert(id1.startsWith('n_'), 'newId("n") starts with "n_"');
  
  // Test 28: IDs are unique
  const id2 = newId('n');
  assert(id1 !== id2, 'newId generates unique IDs');
  
  // Test 29: Different prefixes
  const trackId = newId('track');
  assert(trackId.startsWith('track_'), 'newId("track") starts with "track_"');
  
  // Test 30: Reset counter works
  resetIdCounter();
  const id3 = newId('test');
  assert(id3.includes('_1'), 'resetIdCounter resets counter to 0');
}

// ============================================================================
// Constants Tests
// ============================================================================

function testConstants(): void {
  console.log('\n=== Testing Constants ===');
  
  // Test 31: TICKS_PER_QUARTER
  assertEqual(TICKS_PER_QUARTER, 480, 'TICKS_PER_QUARTER = 480');
  
  // Test 32: DEFAULT_TEMPO_BPM
  assertEqual(DEFAULT_TEMPO_BPM, 120, 'DEFAULT_TEMPO_BPM = 120');
}

// ============================================================================
// Integration Tests
// ============================================================================

function testIntegration(): void {
  console.log('\n=== Integration Tests ===');
  
  // Test 33: C Major Scale timing
  // 8 quarter notes @ 120 BPM should be 4000ms total (4 seconds)
  const noteDuration = tickToMs(480, 120); // 500ms per quarter note
  const totalDuration = noteDuration * 8;  // 4000ms
  assertEqual(totalDuration, 4000, 'C Major Scale (8 quarters @ 120 BPM) = 4000ms');
  
  // Test 34: Verify all scale pitches
  const scaleNotes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const expectedPitches = [60, 62, 64, 65, 67, 69, 71, 72];
  
  scaleNotes.forEach((note, i) => {
    assertEqual(nameToPitch(note), expectedPitches[i], `Scale note ${note} = ${expectedPitches[i]}`);
  });
}

// ============================================================================
// Run All Tests
// ============================================================================

function runAllTests(): void {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   XPSH Helpers Test Suite                     ║');
  console.log('╚════════════════════════════════════════════════╝');
  
  testTimingConversions();
  testPitchConversions();
  testIdGeneration();
  testConstants();
  testIntegration();
  
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('='.repeat(50));
  
  if (testsFailed === 0) {
    console.log('\n✓ All tests passed! 🎉');
  } else {
    console.log(`\n✗ ${testsFailed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runAllTests();
