# XPSH Practice Mode v1

## Tổng Quan

Practice Mode là tính năng nâng cao cho XPSH Player, cho phép **lặp lại đoạn A-B theo measure** và **seek đến measure bất kỳ**. Đây là công cụ quan trọng để luyện tập các đoạn nhạc khó.

---

## Tính Năng Chính

### 1. **A-B Loop theo Measure**
- Chọn điểm bắt đầu (A) và kết thúc (B) theo measure (1-8)
- Tự động lặp lại khi đến measure B+1
- Visual feedback: highlight vùng loop màu xanh
- Toggle loop ON/OFF

### 2. **Seek To Measure**
- Click 2 lần vào measure để jump đến vị trí đó
- Hữu ích cho navigation nhanh

### 3. **Visual Timeline**
- Hiển thị 8 measures
- Marker A (xanh) và B (đỏ)
- Current position indicator (xanh lá)
- Hover effects

### 4. **Tempo Control**
- Điều chỉnh tốc độ 40-240 BPM
- Luyện tập từ chậm rồi tăng dần

---

## File Structure

```
stitch (1)/
├── LoopTimeline.tsx           # Timeline component với A-B selection
├── XpshPracticePlayer.tsx     # Practice player với loop logic
└── practice-demo.tsx          # Demo page cho practice mode
```

---

## API Documentation

### **LoopTimeline Component**

#### Props

```typescript
interface LoopTimelineProps {
  currentMs: number;              // Current playback position (ms)
  durationMs: number;             // Total duration (ms)
  tempo: number;                  // Tempo (BPM)
  loopEnabled: boolean;           // Loop enabled state
  loopRange: LoopRange;           // Loop A-B range
  onSetA: (measure: number) => void;        // Callback khi set A
  onSetB: (measure: number) => void;        // Callback khi set B
  onToggleLoop: () => void;                 // Callback toggle loop
  onSeekToMeasure: (measure: number) => void; // Callback seek
  onClearLoop: () => void;                  // Callback clear loop
}

interface LoopRange {
  measureA: number | null;  // Measure index (0-7), null = chưa chọn
  measureB: number | null;  // Measure index (0-7), null = chưa chọn
}
```

#### Usage Example

```tsx
import { LoopTimeline } from './LoopTimeline';

function MyPlayer() {
  const [loopRange, setLoopRange] = useState({ measureA: null, measureB: null });
  const [loopEnabled, setLoopEnabled] = useState(false);
  
  return (
    <LoopTimeline
      currentMs={currentMs}
      durationMs={durationMs}
      tempo={tempo}
      loopEnabled={loopEnabled}
      loopRange={loopRange}
      onSetA={(m) => setLoopRange(prev => ({ ...prev, measureA: m }))}
      onSetB={(m) => setLoopRange(prev => ({ ...prev, measureB: m }))}
      onToggleLoop={() => setLoopEnabled(!loopEnabled)}
      onSeekToMeasure={(m) => controls.seek(measureToMs(m, tempo))}
      onClearLoop={() => {
        setLoopRange({ measureA: null, measureB: null });
        setLoopEnabled(false);
      }}
    />
  );
}
```

---

### **XpshPracticePlayer Component**

#### Props

```typescript
interface XpshPracticePlayerProps {
  score: XPSHScore;    // XPSH score data
  autoPlay?: boolean;  // Auto play on load (default: false)
}
```

#### Usage Example

```tsx
import { XpshPracticePlayer } from './XpshPracticePlayer';

function PracticePage() {
  const [score, setScore] = useState<XPSHScore | null>(null);
  
  // Load score...
  
  return (
    <div>
      {score && <XpshPracticePlayer score={score} autoPlay={false} />}
    </div>
  );
}
```

---

## Loop Logic Implementation

### Workflow

1. **User sets A = measure 2 (index 1)**
   - `loopRange.measureA = 1`
   - Start tick = `1 * 1920 = 1920`
   - Start ms = `tickToMs(1920, tempo)`

2. **User sets B = measure 5 (index 4)**
   - `loopRange.measureB = 4`
   - End tick = `5 * 1920 = 9600` (measure B+1)
   - End ms = `tickToMs(9600, tempo)`

3. **User enables loop**
   - `loopEnabled = true`

4. **During playback:**
   ```typescript
   useEffect(() => {
     if (!loopEnabled || !state.isPlaying) return;
     if (loopRange.measureA === null || loopRange.measureB === null) return;
     
     const loopStartMs = measureToMs(loopRange.measureA, tempo);
     const loopEndMs = measureToMs(loopRange.measureB + 1, tempo); // +1 vì B inclusive
     
     if (state.currentMs >= loopEndMs) {
       controls.seek(loopStartMs); // Jump back to A
     }
   }, [state.currentMs, state.isPlaying, loopEnabled, loopRange, tempo, controls]);
   ```

### Key Functions

```typescript
/**
 * Convert measure index sang start tick
 */
function measureToTick(measure: number): number {
  return measure * 1920; // 4 beats * 480 ticks/beat
}

/**
 * Convert tick sang ms
 */
function tickToMs(tick: number, tempo: number): number {
  const quarterNoteDurationMs = (60 / tempo) * 1000;
  return (tick / 480) * quarterNoteDurationMs;
}

/**
 * Convert measure sang ms
 */
function measureToMs(measure: number, tempo: number): number {
  const tick = measureToTick(measure);
  return tickToMs(tick, tempo);
}
```

---

## User Interactions

### Set Loop Points

**Step 1: Set A**
1. Click button "Set A"
2. Click on measure 3
3. → Marker "A" xuất hiện trên measure 3

**Step 2: Set B**
1. Click button "Set B"
2. Click on measure 6
3. → Marker "B" xuất hiện trên measure 6
4. → Measures 3-6 được highlight màu xanh

### Enable Loop

1. Click button "🔁 Loop ON"
2. Play music
3. Khi đến cuối measure 6, tự động jump về đầu measure 3
4. Lặp lại liên tục

### Seek To Measure

1. **Double-click** vào measure 5
2. → Playback position jump đến measure 5 ngay lập tức

### Clear Loop

1. Click button "Clear"
2. → Markers A, B biến mất
3. → Loop disabled
4. → Highlight biến mất

---

## Integration Guide

### Step 1: Copy Files

Copy 3 files vào project:

```bash
# Components
stitch (1)/LoopTimeline.tsx        → lib/LoopTimeline.tsx
stitch (1)/XpshPracticePlayer.tsx  → lib/XpshPracticePlayer.tsx

# Demo page
stitch (1)/practice-demo.tsx       → app/practice-demo/page.tsx
```

### Step 2: Update Imports

Trong `XpshPracticePlayer.tsx` và `practice-demo.tsx`, update imports:

```typescript
// Before
import { XPSHScore } from './xpsh_helpers';
import { compileTimeline, retimeTimeline } from './xpsh_timeline';
import { useAudioScheduler } from './useAudioScheduler';

// After
import { XPSHScore } from '@/lib/xpsh_helpers';
import { compileTimeline, retimeTimeline } from '@/lib/xpsh_timeline';
import { useAudioScheduler } from '@/lib/useAudioScheduler';
```

### Step 3: Add Route

Truy cập practice mode tại:
```
http://localhost:3000/practice-demo
```

---

## Example: Luyện Tập Một Đoạn Khó

### Scenario
Bạn muốn luyện tập measures 3-4 của một bài nhạc.

### Steps

1. **Load score vào Practice Player**
   ```tsx
   <XpshPracticePlayer score={myScore} />
   ```

2. **Set loop M3-M4:**
   - Click "Set A" → Click measure 3
   - Click "Set B" → Click measure 4
   - Click "🔁 Loop ON"

3. **Giảm tempo:**
   - Drag slider về 60 BPM (từ 120 BPM)

4. **Play và luyện:**
   - Click "▶ Play"
   - Chơi theo với loop 3-4 ở tốc độ chậm

5. **Tăng dần tốc độ:**
   - Pause → Tăng tempo lên 80 BPM
   - Play lại
   - Lặp lại cho đến khi đạt tốc độ gốc (120 BPM)

6. **Expand loop:**
   - Set B → measure 6 (để luyện đoạn dài hơn)

---

## Technical Details

### Measure Constants

```typescript
const TOTAL_MEASURES = 8;
const TICKS_PER_MEASURE = 1920;  // 4 beats * 480 ticks/beat
const TICKS_PER_QUARTER = 480;
```

### Loop Range Validation

```typescript
// Valid loop: A < B
const isValidLoop = loopRange.measureA !== null 
  && loopRange.measureB !== null 
  && loopRange.measureA < loopRange.measureB;

// Invalid examples:
// A=3, B=2  → A > B (invalid)
// A=3, B=3  → A = B (invalid)
// A=null    → Not set (invalid)
```

### Coordinate Mapping

```typescript
// Measure → Tick
measure 0 → tick 0
measure 1 → tick 1920
measure 2 → tick 3840
measure 7 → tick 13440

// Measure → Ms (at 120 BPM)
1 measure = 4 beats = 4 * 500ms = 2000ms
measure 0 → 0ms
measure 1 → 2000ms
measure 2 → 4000ms
```

---

## Constraints

**Theo yêu cầu:**

1. ✅ Loop **theo measure** (không theo beat)
2. ✅ Không có waveform visualization
3. ✅ 8 measures cố định (theo XPSH v1 spec)
4. ✅ A-B selection UI
5. ✅ Loop toggle ON/OFF
6. ✅ Seek to measure (double-click)

---

## Troubleshooting

### Loop không hoạt động

**Problem:** Click "Loop ON" nhưng không lặp lại.

**Solutions:**
1. Check A < B (A phải nhỏ hơn B)
2. Check both A and B are set (không null)
3. Check button "Loop ON" có màu xanh lá không

### Seek không chính xác

**Problem:** Double-click measure 5 nhưng jump đến vị trí sai.

**Solutions:**
1. Check tempo có đúng không
2. Verify `measureToMs()` calculation
3. Check console logs:
   ```typescript
   console.log('Seek to measure', measure, 'at', measureToMs(measure, tempo), 'ms');
   ```

### Không thấy loop highlight

**Problem:** Set A, B nhưng không thấy màu xanh.

**Solutions:**
1. Check `loopRange.measureA` và `measureB` có giá trị
2. Verify CSS styles cho `.measureInLoop`
3. Check browser DevTools

---

## Future Enhancements (Phase 3+)

Các tính năng có thể bổ sung:

1. **Beat-level loop** - Loop theo beat (M3B2 → M4B3)
2. **Metronome** - Click track trong loop
3. **Speed trainer** - Tự động tăng tempo mỗi loop
4. **Playback speed** - Slow down 0.5x, 0.75x (không thay đổi pitch)
5. **Loop count** - Hiển thị số lần đã loop
6. **Keyboard shortcuts** - Hotkeys cho set A/B, toggle loop
7. **Multiple loops** - Lưu nhiều loop preset
8. **Export practice session** - Lưu tempo, loop settings

---

## Code Quality

### Type Safety
- ✅ Full TypeScript
- ✅ No `any` types
- ✅ Strict null checks

### Performance
- ✅ `useMemo` for timeline compilation
- ✅ `useCallback` for event handlers
- ✅ Efficient re-renders

### Code Style
- ✅ Consistent naming
- ✅ JSDoc comments
- ✅ Organized file structure

---

## Summary

**Created Files:**
1. `LoopTimeline.tsx` (450+ lines) - Timeline UI component
2. `XpshPracticePlayer.tsx` (500+ lines) - Practice player với loop
3. `practice-demo.tsx` (400+ lines) - Demo page với instructions

**Total:** ~1,350 lines of production-ready code

**Features Delivered:**
✅ A-B loop theo measure  
✅ Visual timeline với markers  
✅ Seek to measure (double-click)  
✅ Toggle loop ON/OFF  
✅ Clear loop functionality  
✅ Current position indicator  
✅ Tempo control integration  
✅ Comprehensive demo page  
✅ Full documentation  

---

**Practice Mode v1 hoàn thành! 🎹**
