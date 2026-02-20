# XPSH Editor & Player

Complete piano sheet editor and player system with practice mode.

## 🎹 Features

- **XPSH Format v1.0.0** - JSON-based piano sheet format
- **Visual Editor** - Click-to-add notes, SVG staff rendering
- **Audio Player** - Web Audio API synthesizer, tempo control
- **Practice Mode** - A-B loop, measure seeking, speed training
- **Zero Dependencies** - Only React/Next.js, no external libraries

---

## 📦 Project Structure

```
xpsh-project/
├── lib/                    # Core libraries
│   ├── xpsh_helpers.ts        - Types & utilities
│   ├── xpsh_timeline.ts       - Timeline compiler
│   ├── useAudioScheduler.ts   - Audio scheduler hook
│   ├── editor_ops.ts          - Editor operations
│   └── exportXpsh.ts          - File import/export
│
├── components/             # React components
│   ├── XpshPlayer.tsx         - Basic player
│   ├── XpshPracticePlayer.tsx - Practice mode player
│   ├── XpshEditorPage.tsx     - Visual editor
│   ├── ScoreCanvas.tsx        - SVG staff rendering
│   └── LoopTimeline.tsx       - Loop timeline UI
│
├── app/                    # Next.js pages
│   ├── player-demo/           - Basic player demo
│   ├── practice-demo/         - Practice mode demo
│   └── editor/                - Visual editor page
│
├── public/                 # Static files
│   └── samples/               - Sample .xpsh.json files
│
├── docs/                   # Documentation
│   ├── XPSH_v1_SPEC.md        - Format specification
│   ├── EDITOR_README.md       - Editor guide
│   ├── PLAYBACK_ENGINE_README.md - Player guide
│   ├── PRACTICE_MODE_README.md - Practice mode guide
│   └── PRACTICE_MODE_QUICKSTART.md - Quick start
│
└── __tests__/              # Test files
    ├── xpsh_helpers.test.ts
    ├── xpsh_timeline.test.ts
    ├── editor_ops.test.ts
    └── practice-mode.test.ts
```

---

## 🚀 Quick Start

### Installation

```bash
# Clone or navigate to project
cd xpsh-project

# Install dependencies (if using Next.js)
npm install
# or
pnpm install
```

### Development

```bash
# Start dev server
npm run dev

# Open in browser
# Player:   http://localhost:3000/player-demo
# Practice: http://localhost:3000/practice-demo
# Editor:   http://localhost:3000/editor
```

---

## 📖 Usage

### 1. Player (Basic Playback)

```tsx
import { XpshPlayer } from '@/components/XpshPlayer';

<XpshPlayer score={myScore} autoPlay={false} />
```

### 2. Practice Mode (A-B Loop)

```tsx
import { XpshPracticePlayer } from '@/components/XpshPracticePlayer';

<XpshPracticePlayer score={myScore} autoPlay={false} />
```

### 3. Editor (Visual Editing)

```tsx
import { XpshEditorPage } from '@/components/XpshEditorPage';

<XpshEditorPage />
```

---

## 🎯 Key Features

### Editor
- ✅ Click-to-add notes on staff
- ✅ Duration selector (whole/half/quarter)
- ✅ Track selector (RH/LH)
- ✅ Import/Export .xpsh files
- ✅ Keyboard shortcuts

### Player  
- ✅ Play/Pause/Stop controls
- ✅ Tempo adjustment (40-240 BPM)
- ✅ Progress bar & time display
- ✅ SimplePianoSynth (Web Audio API)

### Practice Mode
- ✅ A-B loop by measure
- ✅ Visual timeline (8 measures)
- ✅ Seek to measure (double-click)
- ✅ Loop toggle ON/OFF
- ✅ Speed training

---

## 📚 Documentation

- **[XPSH_v1_SPEC.md](docs/XPSH_v1_SPEC.md)** - Format specification
- **[EDITOR_README.md](docs/EDITOR_README.md)** - Editor documentation  
- **[PLAYBACK_ENGINE_README.md](docs/PLAYBACK_ENGINE_README.md)** - Player documentation
- **[PRACTICE_MODE_README.md](docs/PRACTICE_MODE_README.md)** - Practice mode guide
- **[PRACTICE_MODE_QUICKSTART.md](docs/PRACTICE_MODE_QUICKSTART.md)** - Quick start guide

---

## 🧪 Testing

```bash
# Run tests with Node.js
node __tests__/xpsh_helpers.test.ts
node __tests__/editor_ops.test.ts
node __tests__/practice-mode.test.ts

# Or with ts-node
npx ts-node __tests__/xpsh_helpers.test.ts
```

---

## 🛠️ Tech Stack

- **React 18+** - UI framework
- **Next.js 14+** - Full-stack framework
- **TypeScript 5+** - Type safety
- **Web Audio API** - Audio synthesis
- **SVG** - Staff rendering
- **Zero external dependencies** (except React/Next.js)

---

## 📝 File Format

XPSH v1.0.0 - JSON format for piano sheet music

```json
{
  "format_version": "1.0.0",
  "metadata": {
    "title": "My Piece",
    "composer": "Composer Name"
  },
  "timing": {
    "tempo_bpm": 120,
    "time_signature": { "numerator": 4, "denominator": 4 },
    "ticks_per_quarter": 480
  },
  "tracks": [
    {
      "id": "track_rh",
      "name": "Right Hand",
      "notes": [
        { "id": "n1", "pitch": 60, "start_tick": 0, "dur_tick": 480, "velocity": 80 }
      ]
    }
  ]
}
```

---

## 🎨 Features by Phase

### Phase 0: Format Design
- ✅ XPSH format specification
- ✅ Type definitions
- ✅ Helper functions
- ✅ Sample files

### Phase 1: Playback Engine
- ✅ Timeline compiler
- ✅ Audio scheduler (lookahead)
- ✅ SimplePianoSynth
- ✅ Player UI

### Phase 2: Visual Editor
- ✅ SVG staff rendering
- ✅ Click-to-add notes
- ✅ Import/Export
- ✅ Keyboard shortcuts

### Phase 3: Practice Mode
- ✅ A-B loop timeline
- ✅ Loop logic
- ✅ Seek to measure
- ✅ Practice player UI

---

## 🤝 Contributing

This is a complete implementation of XPSH v1. For enhancements:

1. Check Phase 3+ ideas in documentation
2. Maintain backward compatibility with XPSH v1.0.0
3. Add tests for new features

---

## 📄 License

Open source - Use freely for education and personal projects.

---

## 🎉 Credits

Built by senior engineers (Phase 0-3)  
Format design → Playback → Editor → Practice Mode

**Happy composing! 🎹**
