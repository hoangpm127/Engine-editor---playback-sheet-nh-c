# XPSH Playback Engine v1

## 📦 Files Created

### Core Engine Files
1. **xpsh_timeline.ts** - Timeline compiler từ XPSH score
2. **useAudioScheduler.ts** - Audio scheduling hook với lookahead
3. **XpshPlayer.tsx** - Main player component với UI controls
4. **player-demo.tsx** - Demo page

### Supporting Files
- **xpsh_helpers.ts** - Type definitions và utilities
- **XPSH_v1_SPEC.md** - Format specification
- **sample_simple_scale.xpsh.json** - Sample score (C major scale)
- **sample_two_hands.xpsh.json** - Sample score (two hands)

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ hoặc mới hơn
- Next.js 13+ (App Router hoặc Pages Router)
- TypeScript 5+

### Installation

#### 1. Dependencies
Các file đã tạo **KHÔNG yêu cầu thư viện external** ngoài React/Next.js standard.

```json
// package.json - No additional dependencies needed!
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

#### 2. File Structure (Next.js App Router)

```
your-project/
├── app/
│   └── player-demo/
│       └── page.tsx          ← Copy player-demo.tsx content here
├── lib/                      ← Create this folder
│   ├── xpsh_helpers.ts
│   ├── xpsh_timeline.ts
│   ├── useAudioScheduler.ts
│   └── XpshPlayer.tsx
├── public/
│   ├── sample_simple_scale.xpsh.json
│   └── sample_two_hands.xpsh.json
└── package.json
```

#### 3. File Structure (Next.js Pages Router)

```
your-project/
├── pages/
│   └── player-demo.tsx       ← Copy player-demo.tsx content here
├── lib/                      ← Create this folder
│   ├── xpsh_helpers.ts
│   ├── xpsh_timeline.ts
│   ├── useAudioScheduler.ts
│   └── XpshPlayer.tsx
├── public/
│   ├── sample_simple_scale.xpsh.json
│   └── sample_two_hands.xpsh.json
└── package.json
```

---

## 🎯 Quick Start

### Step 1: Copy Files

```bash
# Create lib directory
mkdir lib

# Copy TypeScript files to lib/
cp xpsh_helpers.ts lib/
cp xpsh_timeline.ts lib/
cp useAudioScheduler.ts lib/
cp XpshPlayer.tsx lib/

# Copy sample files to public/
cp sample_simple_scale.xpsh.json public/
cp sample_two_hands.xpsh.json public/
```

### Step 2: Update Import Paths

In **player-demo.tsx**, update imports:

```typescript
// Change from:
import { XPSHScore } from './xpsh_helpers';
import { XpshPlayer } from './XpshPlayer';

// To:
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPlayer } from '@/lib/XpshPlayer';
```

In **XpshPlayer.tsx**, update imports:

```typescript
import { XPSHScore } from './xpsh_helpers';
import { compileTimeline, retimeTimeline, CompiledTimeline } from './xpsh_timeline';
import { useAudioScheduler } from './useAudioScheduler';
```

### Step 3: Create Page (App Router)

Create `app/player-demo/page.tsx`:

```typescript
import PlayerDemo from './player-demo';
export default PlayerDemo;
```

Or copy the content of `player-demo.tsx` directly.

### Step 4: Run Development Server

```bash
npm run dev
```

Navigate to: **http://localhost:3000/player-demo**

---

## 🎹 Usage

### Basic Example

```typescript
import { XpshPlayer } from '@/lib/XpshPlayer';
import { XPSHScore } from '@/lib/xpsh_helpers';

function MyPage() {
  const score: XPSHScore = {
    format_version: "1.0.0",
    // ... your score data
  };

  return <XpshPlayer score={score} autoPlay={false} />;
}
```

### Load Score from File

```typescript
const [score, setScore] = useState<XPSHScore | null>(null);

useEffect(() => {
  fetch('/sample_simple_scale.xpsh.json')
    .then(res => res.json())
    .then(data => setScore(data));
}, []);

if (!score) return <div>Loading...</div>;
return <XpshPlayer score={score} />;
```

---

## ⚙️ Technical Details

### Architecture

```
User Input → XpshPlayer Component
              ↓
         compileTimeline() → Timeline Events
              ↓
         useAudioScheduler() → Scheduling Logic
              ↓
         SimplePianoSynth → Web Audio API
              ↓
         Browser Audio Output
```

### Timeline Compilation

**xpsh_timeline.ts** converts XPSH score thành array of events:

```typescript
{
  t: number,           // Time in milliseconds
  type: 'on' | 'off',  // Note on/off
  pitch: number,       // MIDI pitch (60 = C4)
  vel: number,         // Velocity (1-127)
  noteId: string       // Unique note ID
}
```

### Scheduling Strategy

**useAudioScheduler** sử dụng **lookahead scheduling**:

1. **Lookahead window**: 200ms trước current time
2. **Schedule interval**: Mỗi 50ms check events mới
3. **Precision**: Web Audio API scheduled time (sub-millisecond accuracy)
4. **Cursor update**: requestAnimationFrame (~60fps)

### Audio Synthesis

**SimplePianoSynth** (tạm thời):
- Oscillator type: Sine wave
- Envelope: Simple attack/release
- Polyphonic: Support multiple notes simultaneously

**Future improvement**: Thay thế bằng soundfont samples để âm thanh realistic hơn.

---

## 🎛️ Component Props

### XpshPlayer

```typescript
interface XpshPlayerProps {
  score: XPSHScore;    // Required: XPSH score object
  autoPlay?: boolean;  // Optional: Auto-start playback (default: false)
}
```

---

## 🔧 Customization

### Change Tempo Range

In **XpshPlayer.tsx**:

```typescript
<input
  type="range"
  min="40"   // ← Change minimum tempo
  max="240"  // ← Change maximum tempo
  value={tempo}
  // ...
/>
```

### Change Lookahead Time

In **XpshPlayer.tsx**:

```typescript
const [state, controls] = useAudioScheduler(
  timeline,
  handleNoteOn,
  handleNoteOff,
  {
    lookaheadMs: 200,        // ← Increase for more stable playback
    scheduleIntervalMs: 50   // ← Decrease for more responsive scheduling
  }
);
```

### Styling

All styles are inline CSS-in-JS. To customize, edit the `styles` object trong **XpshPlayer.tsx**:

```typescript
const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#f5f5f5',  // ← Change background color
    borderRadius: '12px',        // ← Change border radius
    // ... other styles
  }
};
```

---

## 🐛 Troubleshooting

### Audio Not Playing

**Problem**: Click Play nhưng không có audio.

**Solution**:
1. Check browser console cho errors
2. Verify AudioContext được khởi tạo (cần user gesture trong Chrome)
3. Check file path của sample score
4. Verify sample file format đúng

### Tempo Slider Not Working During Playback

**Behavior**: Đã disable tempo slider khi đang play (by design).

**Reason**: Changing tempo mid-playback cần re-calculate toàn bộ timeline.

**Workaround**: Pause → Change tempo → Resume.

### Timeline Events Empty

**Problem**: Events array trống hoặc không có audio events.

**Solution**:
1. Verify XPSH file format đúng
2. Check `score.tracks[]` có notes không
3. Check `note.start_tick` và `note.dur_tick` > 0

---

## 📚 API Reference

### compileTimeline(score)

```typescript
function compileTimeline(score: XPSHScore): CompiledTimeline
```

Compile XPSH score thành timeline events.

### retimeTimeline(timeline, newTempoBpm)

```typescript
function retimeTimeline(
  originalTimeline: CompiledTimeline,
  newTempoBpm: number
): CompiledTimeline
```

Recalculate timeline với tempo mới.

### useAudioScheduler(timeline, onNoteOn, onNoteOff, options)

```typescript
function useAudioScheduler(
  timeline: CompiledTimeline | null,
  onNoteOn: (pitch: number, velocity: number, when: number) => void,
  onNoteOff: (pitch: number, when: number) => void,
  options?: AudioSchedulerOptions
): [AudioSchedulerState, AudioSchedulerControls]
```

React hook để schedule playback.

---

## 🎵 Next Steps (Future Enhancements)

### Phase 2: Soundfont Integration

Replace SimplePianoSynth với real piano samples:

```typescript
// Option 1: soundfont-player
npm install soundfont-player

// Option 2: @magenta/music
npm install @magenta/music
```

### Phase 3: Visual Score Display

- Render notes trên staff
- Highlight current playing notes
- Follow cursor

### Phase 4: Additional Features

- [ ] Loop mode
- [ ] Speed control (separate from tempo)
- [ ] Metronome
- [ ] Recording
- [ ] Export to MIDI

---

## 📄 License

Internal project format - see project root for license details.

---

## 🙋 Support

For questions or issues:
1. Check XPSH_v1_SPEC.md for format details
2. Review code comments in source files
3. Test with provided sample files first
