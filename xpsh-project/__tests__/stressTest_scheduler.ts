/**
 * PHASE 5: Stress Test - Audio Scheduler Hardening
 *
 * Tests: spam seek, rapid loop toggle, continuous tempo changes.
 * Run in browser console or integrate into a test page with debugMode=true.
 *
 * HOW TO USE:
 *   1. Open the Player Demo or Practice Demo page
 *   2. Open DevTools console
 *   3. Paste / import this file and call runAllStressTests()
 *
 * Expected results are documented per test.
 */

// ============================================================================
// Test Utilities
// ============================================================================

function log(tag: string, msg: string) {
  console.log(`[STRESS-TEST][${tag}] ${msg}`);
}

function logPass(tag: string, msg: string) {
  console.log(`%c✅ PASS [${tag}] ${msg}`, 'color: green');
}

function logFail(tag: string, msg: string) {
  console.error(`%c❌ FAIL [${tag}] ${msg}`, 'color: red');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Checks that no audio is still sounding (activeNoteCount === 0) */
function assertNoStuckNotes(activeCount: number, context: string) {
  if (activeCount === 0) {
    logPass('NoteRegistry', `No stuck notes after ${context}`);
  } else {
    logFail('NoteRegistry', `${activeCount} stuck note(s) after ${context}`);
  }
}

// ============================================================================
// Test 1: SPAM SEEK – 20 seeks in quick succession
// ============================================================================

/**
 * What it tests:
 *   - Each seek must: kill active notes, reset scheduler index, reset playStartTime
 * How to run:
 *   - Call stressTestSpamSeek(controls, state, 20)
 * Expected result:
 *   - No stuck notes after each seek
 *   - activeNoteCount remains 0 throughout
 *   - Console shows 20 "Seek to X ms" logs
 *   - No AudioContext errors
 */
export async function stressTestSpamSeek(
  controls: { play: () => void; stop: () => void; seek: (ms: number) => void },
  getActiveNoteCount: () => number,
  durationMs: number,
  iterations = 20
) {
  log('SpamSeek', `Starting ${iterations} rapid seeks`);
  controls.play();
  await sleep(200); // Let some notes schedule

  for (let i = 0; i < iterations; i++) {
    const targetMs = Math.random() * durationMs;
    controls.seek(targetMs);
    await sleep(20); // 20ms between seeks – must not cause AudioContext crash
    
    const active = getActiveNoteCount();
    if (active > 0) {
      // Notes from pre-seek scheduling may still be sounding; warn after 50ms
    }
  }

  // After final seek, stop and verify
  controls.stop();
  await sleep(100);
  assertNoStuckNotes(getActiveNoteCount(), '20 rapid seeks');
  log('SpamSeek', 'Done');
}

// ============================================================================
// Test 2: RAPID LOOP TOGGLE – flip loop on/off 30 times
// ============================================================================

/**
 * What it tests:
 *   - Loop restart must clear existing setInterval before creating new one
 *   - No doubled scheduler (notes fire twice at same time)
 * How to run:
 *   - Call stressTestLoopToggle(controls, setLoopEnabled, getActiveNoteCount)
 * Expected result:
 *   - No double-scheduled events in the console
 *   - Note density stays constant (not 2x)
 *   - No AudioContext errors
 * How to verify double-scheduling:
 *   - Enable debugMode=true; look for duplicate NoteOn logs at same timestamp
 */
export async function stressTestLoopToggle(
  controls: { play: () => void; stop: () => void },
  setLoopEnabled: (enabled: boolean) => void,
  getActiveNoteCount: () => number,
  iterations = 30
) {
  log('LoopToggle', `Toggling loop ${iterations} times`);
  controls.play();

  for (let i = 0; i < iterations; i++) {
    setLoopEnabled(i % 2 === 0);  // alternate on/off
    await sleep(50);
  }
  
  // Force loop off and stop
  setLoopEnabled(false);
  controls.stop();
  await sleep(150);
  
  assertNoStuckNotes(getActiveNoteCount(), '30 loop toggles');
  log('LoopToggle', 'Done');
}

// ============================================================================
// Test 3: CONTINUOUS TEMPO CHANGE
// ============================================================================

/**
 * What it tests:
 *   - Tempo change re-compiles timeline; scheduler must reset index
 *   - playStartTime must be recalculated after tempo change
 * How to run:
 *   - Call stressTestTempoChange(controls, setTempo, getActiveNoteCount)
 * Expected result:
 *   - Playback stays in sync (no noticeable drift)
 *   - No stuck notes
 *   - Scheduler logs show fresh scheduling windows after each tempo change
 * Tempo range tested: 40 BPM → 240 BPM (MIDI legal range)
 */
export async function stressTestTempoChange(
  controls: { play: () => void; stop: () => void },
  setTempo: (bpm: number) => void,
  getActiveNoteCount: () => number,
  iterations = 20
) {
  log('TempoChange', `Changing tempo ${iterations} times`);
  controls.play();

  const tempos = [40, 60, 80, 100, 120, 160, 180, 200, 240, 120];
  for (let i = 0; i < iterations; i++) {
    const bpm = tempos[i % tempos.length];
    setTempo(bpm);
    await sleep(100); // 100ms between changes
    log('TempoChange', `  → ${bpm} BPM`);
  }

  controls.stop();
  await sleep(150);
  assertNoStuckNotes(getActiveNoteCount(), `${iterations} tempo changes`);
  log('TempoChange', 'Done');
}

// ============================================================================
// Test 4: CONCURRENT SEEK + PLAY/PAUSE
// ============================================================================

/**
 * What it tests:
 *   - Rapid interleaving of play/pause/seek must not leave orphaned intervals
 * Expected result:
 *   - Only ONE setInterval active at any time (verify via browser performance tab)
 *   - No stuck notes, no crash
 */
export async function stressTestSeekAndToggle(
  controls: { play: () => void; pause: () => void; stop: () => void; seek: (ms: number) => void },
  getActiveNoteCount: () => number,
  durationMs: number
) {
  log('SeekAndToggle', 'Starting seek+play/pause interleave test');

  for (let i = 0; i < 15; i++) {
    controls.play();
    await sleep(30);
    controls.seek(Math.random() * durationMs * 0.8);
    await sleep(20);
    controls.pause();
    await sleep(20);
  }

  controls.stop();
  await sleep(150);
  assertNoStuckNotes(getActiveNoteCount(), 'seek+toggle interleave');
  log('SeekAndToggle', 'Done');
}

// ============================================================================
// Test 5: MEMORY LEAK CHECK (rapid mount / unmount simulation)
// ============================================================================

/**
 * What it tests:
 *   - clearInterval and cancelAnimationFrame must be called on cleanup
 *   - AudioContext must be closed on destroy
 * How to verify:
 *   - Open Chrome DevTools → Performance → Memory
 *   - Record while navigating between pages (mount/unmount) 10 times
 *   - Heap should not grow continuously
 * 
 * NOTE: This test is MANUAL – run in browser performance profiler.
 *
 * Steps:
 *   1. Open Player Demo page
 *   2. Start Chrome Performance recording
 *   3. Navigate away (e.g., back to home) 5 times
 *   4. Navigate back to Player Demo 5 times
 *   5. Stop recording
 *   6. Inspect heap: should plateau, not grow linearly
 */
export const memoryLeakCheckInstructions = `
MANUAL TEST – Memory Leak Check
================================
1. Open Player Demo with debugMode=true (pass debugMode option to useAudioScheduler)
2. Open Chrome DevTools → Memory tab
3. Take initial heap snapshot
4. Navigate away from page (triggers unmount) → navigate back → repeat x10
5. Take second heap snapshot
6. Compare: AudioContext objects should be closed (0 active)
   Verify console shows: "[AudioScheduler] AudioContext closed"
7. setInterval count should not grow (check Performance → Timeline)
`;

// ============================================================================
// Test 6: DEBUG MODE LOG VERIFICATION
// ============================================================================

/**
 * What it tests:
 *   - All expected debug log events fire when debugMode=true
 *   - Log format is consistent
 * Expected console output:
 *   [AudioScheduler] AudioContext created
 *   [AudioScheduler] Play from X.Xms
 *   [AudioScheduler] Started schedule timer (interval: 50ms)
 *   [AudioScheduler] Scheduling window: [Xms, Xms]
 *   [NoteRegistry] NoteOn: pitch=XX, when=X.XXXs, active=N
 *   [NoteRegistry] NoteOff: pitch=XX, when=X.XXXs, active=N
 *   [AudioScheduler] Seek to X.Xms (was Y.Yms)
 *   [NoteRegistry] Clearing N active notes
 *   [AudioScheduler] Reset playStartTime to X.XXXs
 *   [AudioScheduler] Schedule timer cleaned up
 *   [AudioScheduler] Unmounting - cleaning up
 *   [AudioScheduler] AudioContext closed
 */
export async function stressTestDebugLogs(
  controls: { play: () => void; stop: () => void; seek: (ms: number) => void },
  durationMs: number
) {
  log('DebugLogs', 'Expect logs: AudioContext created, Play, NoteOn/Off, Seek, Pause, Stop, Cleanup');
  
  controls.play();
  await sleep(300);
  
  controls.seek(durationMs * 0.5);
  await sleep(300);
  
  controls.stop();
  await sleep(100);
  
  log('DebugLogs', 'Check console for expected log lines above');
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

/**
 * Run all stress tests sequentially.
 * 
 * Usage in React component (add a "Stress Test" button):
 * 
 *   import { runAllStressTests } from '@/__tests__/stressTest_scheduler';
 * 
 *   <button onClick={() =>
 *     runAllStressTests(controls, state, setLoopEnabled, setTempo)
 *   }>
 *     Run Stress Tests
 *   </button>
 */
export async function runAllStressTests(
  controls: {
    play: () => void;
    pause: () => void;
    stop: () => void;
    seek: (ms: number) => void;
    killAllNotes: () => void;
  },
  state: { durationMs: number; activeNoteCount: number },
  setLoopEnabled: (enabled: boolean) => void,
  setTempo: (bpm: number) => void
) {
  const getActiveNoteCount = () => state.activeNoteCount;
  const { durationMs } = state;

  console.group('🔥 PHASE 5 STRESS TESTS');
  
  console.group('Test 1: Spam Seek (20x)');
  await stressTestSpamSeek(controls, getActiveNoteCount, durationMs);
  console.groupEnd();
  
  await sleep(500); // cooldown
  
  console.group('Test 2: Loop Toggle (30x)');
  await stressTestLoopToggle(controls, setLoopEnabled, getActiveNoteCount);
  console.groupEnd();
  
  await sleep(500);
  
  console.group('Test 3: Tempo Change (20x)');
  await stressTestTempoChange(controls, setTempo, getActiveNoteCount);
  console.groupEnd();
  
  await sleep(500);
  
  console.group('Test 4: Seek + Toggle Interleave (15x)');
  await stressTestSeekAndToggle(controls, getActiveNoteCount, durationMs);
  console.groupEnd();
  
  await sleep(500);
  
  console.group('Test 5: Debug Log Verification');
  await stressTestDebugLogs(controls, durationMs);
  console.groupEnd();
  
  console.log('%c✅ All automated stress tests complete. Check results above.', 'font-weight: bold; color: cyan');
  console.log('Test 5 (Memory Leak) is MANUAL – see memoryLeakCheckInstructions export.');
  console.groupEnd();
}
