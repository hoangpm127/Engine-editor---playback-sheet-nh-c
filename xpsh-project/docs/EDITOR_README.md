# XPSH Piano Editor v1 - Documentation

## 📦 Files Created

### Editor Components (4 files)

1. **editor_ops.ts** (350+ lines)
   - `insertNote()` - Add new note to score
   - `deleteNote()` - Remove note from score
   - `findNoteAt()` - Find note at click position
   - `updateNote()` - Modify note properties
   - `clearAllNotes()` - Remove all notes
   - `measureBeatToTick()` - Convert measure/beat → tick
   - `tickToMeasureBeat()` - Convert tick → measure/beat
   - `validateScore()` - Validate score structure

2. **exportXpsh.ts** (250+ lines)
   - `downloadXpsh()` - Download score as .xpsh file
   - `loadXpshFile()` - Load .xpsh from File object
   - `createEmptyScore()` - Create blank score template
   - `updateMetadata()` - Update title/composer/etc
   - `updateTempo()` - Change tempo
   - `copyToClipboard()` - Copy JSON to clipboard

3. **ScoreCanvas.tsx** (400+ lines)
   - SVG-based staff rendering
   - 2 staffs (Treble/Bass)
   - 8 measures per staff
   - Click-to-add notes
   - Note selection with visual feedback
   - Pitch/tick coordinate mapping

4. **XpshEditorPage.tsx** (450+ lines)
   - Main editor page
   - Duration selector (quarter/half/whole)
   - Track selector (RH/LH)
   - Keyboard shortcuts
   - Import/Export functionality
   - Integrated playback player
   - Instructions panel

---

## 🎯 Features

### ✅ Core Editing
- [x] Add notes by clicking on staff
- [x] Delete notes (click + Delete key)
- [x] Select notes (visual highlight)
- [x] Duration selection (whole, half, quarter)
- [x] Track selection (RH/LH)

### ✅ Staff Rendering
- [x] Treble staff (RH)
- [x] Bass staff (LH)
- [x] 8 measures display
- [x] Measure numbers
- [x] Staff lines and dividers
- [x] Note heads (filled circles)
- [x] Duration indicators (horizontal lines)

### ✅ File Operations
- [x] Export to .xpsh (JSON download)
- [x] Import from .xpsh file
- [x] Edit title metadata
- [x] Auto-filename from title

### ✅ Playback
- [x] Integrated XpshPlayer
- [x] Play current score
- [x] Tempo control
- [x] Collapsible player panel

### ✅ User Experience
- [x] Keyboard shortcuts
- [x] Visual feedback (selected notes)
- [x] Note count display
- [x] Instructions panel
- [x] Responsive controls

---

## 🎹 Usage Guide

### Adding Notes

1. **Select Duration**: Click Quarter, Half, or Whole (or press 1, 2, 3)
2. **Select Track**: Click RH or LH (or press R, L)
3. **Click on Staff**: Click at desired pitch and timing
4. **Note appears**: Orange circle with duration line

### Editing Notes

- **Select**: Click on any note (turns orange)
- **Delete**: Press `Delete` or `Backspace` key
- **Deselect**: Press `Esc` key

### File Operations

- **Export**: Click "Export .xpsh" → Downloads `<title>.xpsh`
- **Import**: Click "Import" → Select .xpsh or .json file
- **Edit Title**: Type in title field → Auto-updates metadata

### Playback

1. Click "Show Player"
2. Adjust tempo if desired (40-240 BPM)
3. Click "Play"
4. Use Pause/Stop controls

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Quarter note |
| `2` | Half note |
| `3` | Whole note |
| `R` | Right hand (RH) track |
| `L` | Left hand (LH) track |
| `Delete` / `Backspace` | Delete selected note |
| `Esc` | Deselect note |

---

## 🏗️ Architecture

### Component Hierarchy

```
XpshEditorPage (Main)
├── Header (Title editor)
├── Controls Panel
│   ├── Duration selector
│   ├── Track selector
│   ├── Actions (Delete, Clear)
│   ├── File ops (Export, Import)
│   └── Playback toggle
├── ScoreCanvas (SVG rendering)
│   ├── Treble Staff
│   ├── Bass Staff
│   └── Notes
├── XpshPlayer (Playback)
└── Instructions
```

### Data Flow

```
User Click → ScoreCanvas
              ↓
         Coordinate mapping (X→tick, Y→pitch)
              ↓
         onCanvasClick(pitch, tick, trackId)
              ↓
         insertNote(score, params)
              ↓
         setState(newScore)
              ↓
         ScoreCanvas re-renders
```

### State Management

```typescript
// Main state
const [score, setScore] = useState<XPSHScore>()
const [selectedNoteId, setSelectedNoteId] = useState<string | null>()
const [currentDuration, setCurrentDuration] = useState<DurationType>()
const [currentTrack, setCurrentTrack] = useState<'track_rh' | 'track_lh'>()
```

---

## 🎨 Coordinate Mapping

### X Coordinate → Tick

```typescript
// Canvas X → measure/beat → tick
xToTick(x: number): number {
  const relativeX = x - 50;  // Remove left padding
  const measureIndex = Math.floor(relativeX / MEASURE_WIDTH);
  const beatFraction = (relativeX % MEASURE_WIDTH) / MEASURE_WIDTH;
  const beatIndex = Math.floor(beatFraction * 4);
  
  return (measureIndex * 4 + beatIndex) * 480;
}
```

### Y Coordinate → Pitch

```typescript
// Canvas Y → staff → pitch
yToPitch(y: number): { pitch: number, trackId: string } {
  const isBassStaff = y > (TREBLE_STAFF_Y + STAFF_HEIGHT + 40);
  const staffY = isBassStaff ? BASS_STAFF_Y : TREBLE_STAFF_Y;
  const middlePitch = isBassStaff ? BASS_MIDDLE_PITCH : TREBLE_MIDDLE_PITCH;
  
  const halfStep = STAFF_LINE_SPACING / 2;
  const offset = y - (staffY + STAFF_HEIGHT / 2);
  const pitch = middlePitch - Math.round(offset / halfStep);
  
  return { pitch, trackId: isBassStaff ? 'track_lh' : 'track_rh' };
}
```

### Tick → X Coordinate

```typescript
// Tick → measure/beat → canvas X
tickToX(tick: number): number {
  const totalBeats = tick / 480;
  const measureIndex = Math.floor(totalBeats / 4);
  const beatIndex = totalBeats % 4;
  
  return 50 + measureIndex * MEASURE_WIDTH + (beatIndex / 4) * MEASURE_WIDTH;
}
```

### Pitch → Y Coordinate

```typescript
// Pitch → staff position → canvas Y
pitchToY(pitch: number, isBasStaff: boolean): number {
  const staffY = isBasStaff ? BASS_STAFF_Y : TREBLE_STAFF_Y;
  const middlePitch = isBasStaff ? BASS_MIDDLE_PITCH : TREBLE_MIDDLE_PITCH;
  const middleLineY = staffY + STAFF_HEIGHT / 2;
  
  const halfStep = STAFF_LINE_SPACING / 2;
  const offset = (middlePitch - pitch) * halfStep;
  
  return middleLineY + offset;
}
```

---

## 📐 Constants

### Staff Layout

```typescript
STAFF_LINE_SPACING = 10      // Pixels between staff lines
STAFF_HEIGHT = 40            // 5 lines = 4 spaces
MEASURE_WIDTH = 120          // Width of each measure
TOTAL_MEASURES = 8           // 8 measures
NOTE_RADIUS = 6              // Note head radius
```

### Pitch Reference

```typescript
TREBLE_MIDDLE_PITCH = 71     // B4 on middle line
BASS_MIDDLE_PITCH = 50       // D3 on middle line
```

### Duration Values (Ticks)

```typescript
quarter: 480    // 1 beat
half: 960       // 2 beats  
whole: 1920     // 4 beats
```

---

## 🔧 API Reference

### editor_ops.ts

#### insertNote(score, params)

```typescript
function insertNote(
  score: XPSHScore, 
  params: InsertNoteParams
): XPSHScore

interface InsertNoteParams {
  pitch: number;           // 48-84 (C3-C6)
  start_tick: number;      // 0-15360 (8 measures)
  dur_tick: number;        // 480, 960, or 1920
  velocity?: number;       // Default: 80
  trackId: string;         // "track_rh" or "track_lh"
}
```

#### deleteNote(score, noteId)

```typescript
function deleteNote(
  score: XPSHScore,
  noteId: string
): XPSHScore
```

#### findNoteAt(score, pitch, tick, tolerance)

```typescript
function findNoteAt(
  score: XPSHScore,
  pitch: number,
  start_tick: number,
  tolerance?: number  // Default: 100 ticks
): { note: XPSHNote; trackId: string } | null
```

### exportXpsh.ts

#### downloadXpsh(score, filename)

```typescript
function downloadXpsh(
  score: XPSHScore,
  filename?: string  // Optional, defaults to title
): void
```

#### loadXpshFile(file)

```typescript
async function loadXpshFile(
  file: File
): Promise<XPSHScore>
```

#### createEmptyScore(title)

```typescript
function createEmptyScore(
  title?: string  // Default: "Untitled"
): XPSHScore
```

### ScoreCanvas Component

```typescript
interface ScoreCanvasProps {
  score: XPSHScore;
  selectedNoteId: string | null;
  onNoteClick: (noteId: string, pitch: number, tick: number) => void;
  onCanvasClick: (pitch: number, tick: number, trackId: string) => void;
}
```

---

## 🚀 Setup Instructions

### Next.js App Router

```bash
# Create editor page
mkdir -p app/editor
cp XpshEditorPage.tsx app/editor/page.tsx

# Copy components to lib
cp editor_ops.ts lib/
cp exportXpsh.ts lib/
cp ScoreCanvas.tsx lib/

# Update imports in page.tsx
# Change './file' to '@/lib/file'
```

### Next.js Pages Router

```bash
# Create page
cp XpshEditorPage.tsx pages/editor.tsx

# Copy components to lib
mkdir -p lib
cp editor_ops.ts lib/
cp exportXpsh.ts lib/
cp ScoreCanvas.tsx lib/

# Update imports
```

### Standalone React App

```bash
# Copy all files to src/
cp *.ts src/
cp *.tsx src/

# Import in App.tsx
import XpshEditorPage from './XpshEditorPage';
```

---

## 🎓 Examples

### Basic Usage

```typescript
import XpshEditorPage from '@/lib/XpshEditorPage';

export default function EditorRoute() {
  return <XpshEditorPage />;
}
```

### Programmatically Add Notes

```typescript
import { insertNote, DURATION_VALUES } from '@/lib/editor_ops';

// Add C4 quarter note at measure 1, beat 1
const newScore = insertNote(score, {
  pitch: 60,              // C4
  start_tick: 0,          // Measure 1, beat 1
  dur_tick: DURATION_VALUES.quarter,
  velocity: 80,
  trackId: 'track_rh'
});
```

### Create Score from Scratch

```typescript
import { createEmptyScore } from '@/lib/exportXpsh';
import { insertNote } from '@/lib/editor_ops';

let score = createEmptyScore('C Major Scale');

// Add C major scale
const pitches = [60, 62, 64, 65, 67, 69, 71, 72];  // C4-C5
pitches.forEach((pitch, i) => {
  score = insertNote(score, {
    pitch,
    start_tick: i * 480,  // Each beat
    dur_tick: 480,
    velocity: 80,
    trackId: 'track_rh'
  });
});
```

---

## 🐛 Troubleshooting

### Notes Not Appearing

**Problem**: Clicked on staff but no note appears.

**Solutions**:
1. Check selected duration (Quarter/Half/Whole)
2. Check selected track (RH/LH)
3. Verify pitch range (C3-C6 only)
4. Check browser console for errors

### Can't Delete Note

**Problem**: Delete key doesn't work.

**Solutions**:
1. Click note first to select (should turn orange)
2. Verify note is selected (check "Selected: ✓")
3. Press Delete or Backspace key
4. Make sure focus is on page (click anywhere first)

### Export Not Working

**Problem**: Export button doesn't download file.

**Solutions**:
1. Check browser's download settings
2. Verify popup blocker isn't blocking
3. Try different browser
4. Check browser console for errors

### Staff Layout Issues

**Problem**: Staff looks misaligned or notes in wrong position.

**Solutions**:
1. Check browser zoom (100% recommended)
2. Clear browser cache
3. Verify SVG rendering support
4. Try different browser

---

## 📊 Limitations (Phase 2)

Current version has these limitations:

- ❌ **No chords** - Only single notes
- ❌ **No ties** - Each note is independent
- ❌ **No pedal** - No sustain pedal support
- ❌ **Fixed 8 measures** - Can't add/remove measures
- ❌ **Fixed 4/4** - No other time signatures
- ❌ **Limited durations** - Only whole, half, quarter
- ❌ **No accidentals** - Sharps/flats not shown (but stored in pitch)
- ❌ **No rests** - Silence = no notes
- ❌ **No undo/redo** - Manual delete only

These will be addressed in future phases.

---

## 🎯 Future Enhancements (Phase 3+)

### Phase 3: Advanced Editing
- [ ] Chord support (multiple notes at same time/track)
- [ ] Copy/paste notes
- [ ] Undo/redo stack
- [ ] Drag to move notes
- [ ] Resize duration visually
- [ ] Dotted notes (1.5x duration)

### Phase 4: Visual Improvements
- [ ] Accidentals rendering (♯ ♭)
- [ ] Rest symbols
- [ ] Beam grouping (eighth notes)
- [ ] Stems (note flags)
- [ ] Dynamic marks (pp, ff)
- [ ] Slurs and ties

### Phase 5: Score Management
- [ ] Variable measure count
- [ ] Time signature changes
- [ ] Key signature
- [ ] Multiple pages
- [ ] Zoom in/out
- [ ] Print support

---

## 📞 Quick Reference

### File Structure

```
lib/
├── xpsh_helpers.ts          # Core types & utilities
├── xpsh_timeline.ts         # Timeline compiler
├── useAudioScheduler.ts     # Playback scheduler
├── XpshPlayer.tsx           # Playback component
├── editor_ops.ts            # ⭐ Editor operations
├── exportXpsh.ts            # ⭐ File import/export
├── ScoreCanvas.tsx          # ⭐ SVG staff rendering
└── XpshEditorPage.tsx       # ⭐ Main editor

⭐ = New in Phase 2
```

### Import Patterns

```typescript
// Editor operations
import { insertNote, deleteNote, DURATION_VALUES } from '@/lib/editor_ops';

// File operations
import { downloadXpsh, loadXpshFile, createEmptyScore } from '@/lib/exportXpsh';

// Components
import { ScoreCanvas } from '@/lib/ScoreCanvas';
import XpshEditorPage from '@/lib/XpshEditorPage';
```

---

## ✅ Status

**Phase 2: Complete** ✓

- Total new code: ~1,450 lines
- 4 new files created
- Full editing functionality
- Import/Export working
- Playback integrated
- Keyboard shortcuts implemented
- Instructions included

**Ready for**: Production testing and Phase 3 planning

---

## 📄 License

Internal project - See root for license details.
