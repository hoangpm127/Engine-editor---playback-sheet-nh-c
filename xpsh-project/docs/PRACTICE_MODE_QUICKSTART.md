# Practice Mode - Quick Start Guide

## 🚀 Quick Integration (5 phút)

### Step 1: Copy Files

```bash
# Copy vào Next.js project
cp LoopTimeline.tsx         → lib/LoopTimeline.tsx
cp XpshPracticePlayer.tsx   → lib/XpshPracticePlayer.tsx
cp practice-demo.tsx        → app/practice-demo/page.tsx
```

### Step 2: Fix Imports

Update imports trong các file:

**XpshPracticePlayer.tsx:**
```typescript
// Replace
import { XPSHScore } from './xpsh_helpers';
import { compileTimeline, retimeTimeline } from './xpsh_timeline';
import { useAudioScheduler } from './useAudioScheduler';
import { LoopTimeline } from './LoopTimeline';

// With
import { XPSHScore } from '@/lib/xpsh_helpers';
import { compileTimeline, retimeTimeline } from '@/lib/xpsh_timeline';
import { useAudioScheduler } from '@/lib/useAudioScheduler';
import { LoopTimeline } from '@/lib/LoopTimeline';
```

**practice-demo.tsx:**
```typescript
// Replace
import { XPSHScore } from './xpsh_helpers';
import { XpshPracticePlayer } from './XpshPracticePlayer';

// With
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPracticePlayer } from '@/lib/XpshPracticePlayer';
```

### Step 3: Add Sample Files

Place sample `.xpsh.json` files in `public/` folder:
```
public/
├── sample_simple_scale.xpsh.json
└── sample_two_hands.xpsh.json
```

### Step 4: Run Dev Server

```bash
npm run dev
```

Open: `http://localhost:3000/practice-demo`

---

## 📦 Full File Structure

```
my-xpsh-app/
├── app/
│   ├── practice-demo/
│   │   └── page.tsx              ← practice-demo.tsx
│   ├── player-demo/
│   │   └── page.tsx              ← (existing player)
│   └── editor/
│       └── page.tsx              ← (existing editor)
├── lib/
│   ├── xpsh_helpers.ts           ← (existing)
│   ├── xpsh_timeline.ts          ← (existing)
│   ├── useAudioScheduler.ts     ← (existing)
│   ├── XpshPlayer.tsx            ← (existing)
│   ├── LoopTimeline.tsx          ← NEW
│   └── XpshPracticePlayer.tsx    ← NEW
└── public/
    ├── sample_simple_scale.xpsh.json
    └── sample_two_hands.xpsh.json
```

---

## 🎹 Usage in Your Own Component

```tsx
'use client';

import { useState, useEffect } from 'react';
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPracticePlayer } from '@/lib/XpshPracticePlayer';

export default function MyPracticePage() {
  const [score, setScore] = useState<XPSHScore | null>(null);

  useEffect(() => {
    // Load your score
    fetch('/my-score.xpsh.json')
      .then(res => res.json())
      .then(data => setScore(data));
  }, []);

  if (!score) return <div>Loading...</div>;

  return (
    <div>
      <h1>My Practice Session</h1>
      <XpshPracticePlayer score={score} autoPlay={false} />
    </div>
  );
}
```

---

## 🔧 Customization

### Change Default Tempo Range

In `XpshPracticePlayer.tsx`:
```tsx
<input
  type="range"
  min="30"    // ← Change này
  max="300"   // ← Change này
  value={tempo}
  ...
/>
```

### Change Number of Measures

In `LoopTimeline.tsx`:
```tsx
const TOTAL_MEASURES = 16; // ← Change từ 8 → 16

// Also update tick calculation
const TICKS_PER_MEASURE = 1920; // 4/4 time signature
```

### Customize Styles

Both components use inline styles. To use CSS modules:

1. Create `PracticePlayer.module.css`
2. Replace inline `style={styles.xxx}` with `className={styles.xxx}`

---

## 🎯 Common Use Cases

### Use Case 1: Practice Difficult Passage

```tsx
// User workflow:
// 1. Load score
// 2. Set A = measure 3, B = measure 5
// 3. Enable loop
// 4. Reduce tempo to 60 BPM
// 5. Play and practice
```

### Use Case 2: Quick Navigation

```tsx
// User workflow:
// 1. Double-click measure 6
// 2. Jump immediately to measure 6
// 3. Play from there
```

### Use Case 3: Speed Training

```tsx
// User workflow:
// 1. Set loop M3-M4
// 2. Start at 50 BPM → master it
// 3. Increase to 70 BPM → master it
// 4. Increase to 90 BPM → master it
// 5. Continue until reach target tempo
```

---

## 🐛 Troubleshooting

### "Module not found" Error

**Problem:**
```
Module not found: Can't resolve '@/lib/xpsh_helpers'
```

**Solution:**
Check `tsconfig.json` has correct path mapping:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Loop Not Working

**Problem:** Loop enabled but không lặp lại.

**Checklist:**
- [ ] A < B (A must be before B)
- [ ] Both A and B are set
- [ ] Loop button shows "Loop ON" (green)
- [ ] Check console for errors

**Debug:**
```tsx
// Add logging in XpshPracticePlayer.tsx
useEffect(() => {
  console.log('Loop check:', {
    enabled: loopEnabled,
    currentMs: state.currentMs,
    loopStartMs,
    loopEndMs,
    shouldLoop: state.currentMs >= loopEndMs
  });
}, [state.currentMs, loopEnabled]);
```

### Tempo Change Not Working

**Problem:** Slider moves nhưng tempo không đổi.

**Solution:** Make sure you're **paused** (not playing) when changing tempo. This is intentional to prevent audio glitches.

---

## 📊 Performance Tips

### Optimize Re-renders

```tsx
// Use React.memo for LoopTimeline
export const LoopTimeline = React.memo(LoopTimelineComponent);

// Use useMemo for expensive calculations
const loopStartMs = useMemo(
  () => measureToMs(loopRange.measureA ?? 0, tempo),
  [loopRange.measureA, tempo]
);
```

### Reduce State Updates

```tsx
// ❌ Bad: Update on every frame
setCurrentPosition(newMs);

// ✅ Good: Throttle updates
const throttledUpdate = useCallback(
  throttle((ms) => setCurrentPosition(ms), 100),
  []
);
```

---

## 🧪 Testing

### Run Test Suite

```bash
# Copy test file
cp practice-mode.test.ts → __tests__/practice-mode.test.ts

# Run with Node.js
node practice-mode.test.ts

# Or with ts-node
npx ts-node practice-mode.test.ts
```

### Manual Testing Checklist

- [ ] Set A → marker appears
- [ ] Set B → marker appears + highlight
- [ ] Enable loop → plays and loops back
- [ ] Disable loop → plays normally
- [ ] Double-click → seeks to measure
- [ ] Change tempo → recalculates correctly
- [ ] Clear loop → removes markers
- [ ] Play/Pause/Stop work correctly

---

## 🎨 Styling Guide

### Color Scheme

```css
/* Current colors */
--primary-blue: #007bff;      /* A marker, progress */
--danger-red: #dc3545;        /* B marker */
--success-green: #28a745;     /* Loop active, current indicator */
--bg-light: #f8f9fa;          /* Background */
--border-gray: #dee2e6;       /* Borders */
```

### Custom Theme

To apply your own theme, modify styles object in components:

```tsx
const myTheme = {
  primaryColor: '#6366f1',    // Indigo
  dangerColor: '#ef4444',     // Red
  successColor: '#10b981',    // Green
  // ... rest of colors
};

// Then use in styles:
backgroundColor: myTheme.primaryColor
```

---

## 🔐 TypeScript Types

All components are fully typed. Key types:

```typescript
// Loop range
interface LoopRange {
  measureA: number | null;
  measureB: number | null;
}

// Player props
interface XpshPracticePlayerProps {
  score: XPSHScore;
  autoPlay?: boolean;
}

// Timeline props
interface LoopTimelineProps {
  currentMs: number;
  durationMs: number;
  tempo: number;
  loopEnabled: boolean;
  loopRange: LoopRange;
  onSetA: (measure: number) => void;
  onSetB: (measure: number) => void;
  onToggleLoop: () => void;
  onSeekToMeasure: (measure: number) => void;
  onClearLoop: () => void;
}
```

---

## 📚 Additional Resources

- **Main Docs:** `PRACTICE_MODE_README.md` (comprehensive guide)
- **Test Suite:** `practice-mode.test.ts` (validation tests)
- **XPSH Spec:** `XPSH_v1_SPEC.md` (format specification)
- **Editor Docs:** `EDITOR_README.md` (editor documentation)

---

## ✅ Deployment Checklist

Before deploying to production:

- [ ] All files copied to correct locations
- [ ] Imports updated to use `@/lib/`
- [ ] Sample files in `public/` directory
- [ ] TypeScript compiles without errors
- [ ] Manual testing completed
- [ ] Performance acceptable (no lag in loop)
- [ ] Works in major browsers (Chrome, Firefox, Safari, Edge)
- [ ] Mobile responsive (if needed)

---

## 🎉 You're Ready!

Practice Mode is now fully integrated. Users can:

✅ Loop measures A-B  
✅ Seek to any measure  
✅ Control tempo  
✅ Practice difficult passages effectively  

**Happy Practicing! 🎹**
