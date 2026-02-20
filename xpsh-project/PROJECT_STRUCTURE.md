# XPSH Project - Cấu Trúc Thống Nhất

## 📦 Tổng Quan

Dự án **XPSH Editor & Player** đã được gộp từ 2 folders:
- `Editor/` (Phase 0 - Format spec & helpers)
- `stitch (1)/` (Phase 1-3 - Implementation)

Thành **1 dự án Next.js hoàn chỉnh** với cấu trúc chuẩn.

---

## 🗂️ Cấu Trúc Project

```
xpsh-project/
├── lib/                          # Core Libraries (6 files)
│   ├── xpsh_helpers.ts              - Types & utility functions
│   ├── xpsh_timeline.ts             - Timeline compiler
│   ├── useAudioScheduler.ts         - Audio scheduler hook
│   ├── editor_ops.ts                - Editor CRUD operations
│   ├── exportXpsh.ts                - Import/Export functions
│   └── index.ts                     - Centralized exports
│
├── components/                   # React Components (5 files)
│   ├── XpshPlayer.tsx               - Basic player UI
│   ├── XpshPracticePlayer.tsx       - Practice mode player
│   ├── XpshEditorPage.tsx           - Visual editor
│   ├── ScoreCanvas.tsx              - SVG staff rendering
│   └── LoopTimeline.tsx             - Loop timeline UI
│
├── app/                          # Next.js Pages (3 pages)
│   ├── player-demo/
│   │   └── page.tsx                 - Basic player demo
│   ├── practice-demo/
│   │   └── page.tsx                 - Practice mode demo
│   └── editor/
│       └── page.tsx                 - Visual editor page
│
├── public/                       # Static Assets
│   └── samples/
│       ├── sample_simple_scale.xpsh.json
│       └── sample_two_hands.xpsh.json
│
├── docs/                         # Documentation (5 files)
│   ├── XPSH_v1_SPEC.md              - Format specification
│   ├── EDITOR_README.md             - Editor documentation
│   ├── PLAYBACK_ENGINE_README.md    - Player documentation
│   ├── PRACTICE_MODE_README.md      - Practice mode guide
│   └── PRACTICE_MODE_QUICKSTART.md  - Quick start guide
│
├── __tests__/                    # Test Files (4 files)
│   ├── xpsh_helpers.test.ts         - Helper functions tests
│   ├── xpsh_timeline.test.ts        - Timeline compiler tests
│   ├── editor_ops.test.ts           - Editor operations tests
│   └── practice-mode.test.ts        - Practice mode tests
│
├── README.md                     # Project README
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript config
└── .gitignore                    # Git ignore rules
```

---

## 📊 Thống Kê Files

| Category | Count | Description |
|----------|-------|-------------|
| **Library files** | 6 | Core utilities & hooks |
| **Components** | 5 | React UI components |
| **Pages** | 3 | Next.js app pages |
| **Tests** | 4 | Test suites |
| **Documentation** | 5 | Markdown guides |
| **Sample files** | 2 | Example .xpsh.json |
| **Config files** | 3 | package.json, tsconfig.json, .gitignore |
| **Total** | **28 files** | Complete project |

---

## 🎯 Mapping Từ Folders Cũ

### Từ `Editor/` folder:
```
Editor/xpsh_helpers.ts        → lib/xpsh_helpers.ts
Editor/xpsh_helpers.test.ts   → __tests__/xpsh_helpers.test.ts
Editor/XPSH_v1_SPEC.md        → docs/XPSH_v1_SPEC.md
Editor/sample_*.xpsh.json     → public/samples/
```

### Từ `stitch (1)/` folder:
```
# Core libraries
stitch (1)/xpsh_timeline.ts         → lib/xpsh_timeline.ts
stitch (1)/useAudioScheduler.ts     → lib/useAudioScheduler.ts
stitch (1)/editor_ops.ts            → lib/editor_ops.ts
stitch (1)/exportXpsh.ts            → lib/exportXpsh.ts
stitch (1)/index.ts                 → lib/index.ts

# Components
stitch (1)/XpshPlayer.tsx           → components/XpshPlayer.tsx
stitch (1)/XpshPracticePlayer.tsx   → components/XpshPracticePlayer.tsx
stitch (1)/XpshEditorPage.tsx       → components/XpshEditorPage.tsx
stitch (1)/ScoreCanvas.tsx          → components/ScoreCanvas.tsx
stitch (1)/LoopTimeline.tsx         → components/LoopTimeline.tsx

# Pages
stitch (1)/player-demo.tsx          → app/player-demo/page.tsx
stitch (1)/practice-demo.tsx        → app/practice-demo/page.tsx
stitch (1)/XpshEditorPage.tsx       → app/editor/page.tsx (copy)

# Tests
stitch (1)/xpsh_timeline.test.ts    → __tests__/xpsh_timeline.test.ts
stitch (1)/editor_ops.test.ts       → __tests__/editor_ops.test.ts
stitch (1)/practice-mode.test.ts    → __tests__/practice-mode.test.ts

# Documentation
stitch (1)/EDITOR_README.md               → docs/EDITOR_README.md
stitch (1)/PLAYBACK_ENGINE_README.md      → docs/PLAYBACK_ENGINE_README.md
stitch (1)/PRACTICE_MODE_README.md        → docs/PRACTICE_MODE_README.md
stitch (1)/PRACTICE_MODE_QUICKSTART.md    → docs/PRACTICE_MODE_QUICKSTART.md
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd "d:\Engine editor + playback sheet nhạc\xpsh-project"
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

### 3. Open in Browser

- **Player Demo:** http://localhost:3000/player-demo
- **Practice Mode:** http://localhost:3000/practice-demo
- **Editor:** http://localhost:3000/editor

---

## 🔧 Next Steps

### A. Update Import Paths

Trong tất cả component files (`app/*/page.tsx`), update imports:

**Before:**
```typescript
import { XPSHScore } from './xpsh_helpers';
import { XpshPlayer } from './XpshPlayer';
```

**After:**
```typescript
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPlayer } from '@/components/XpshPlayer';
```

### B. Các File Cần Update

1. **app/player-demo/page.tsx**
   ```typescript
   // Line 1-2
   import { XPSHScore } from '@/lib/xpsh_helpers';
   import { XpshPlayer } from '@/components/XpshPlayer';
   ```

2. **app/practice-demo/page.tsx**
   ```typescript
   // Line 1-2
   import { XPSHScore } from '@/lib/xpsh_helpers';
   import { XpshPracticePlayer } from '@/components/XpshPracticePlayer';
   ```

3. **app/editor/page.tsx**
   ```typescript
   // Update all imports từ './' → '@/lib/' hoặc '@/components/'
   ```

4. **components/*.tsx**
   ```typescript
   // Update imports trong các component files
   import { ... } from '@/lib/xpsh_helpers';
   import { ... } from '@/lib/xpsh_timeline';
   ```

### C. Update Sample File Paths

Trong các page files, update path:

**Before:**
```typescript
fetch('/sample_simple_scale.xpsh.json')
```

**After:**
```typescript
fetch('/samples/sample_simple_scale.xpsh.json')
```

---

## 📝 Development Workflow

### Run Tests

```bash
# Test helpers
node __tests__/xpsh_helpers.test.ts

# Test timeline
node __tests__/xpsh_timeline.test.ts

# Test editor ops
node __tests__/editor_ops.test.ts

# Test practice mode
node __tests__/practice-mode.test.ts
```

### Build for Production

```bash
npm run build
npm start
```

---

## 🎨 Features by Module

### lib/ - Core Logic
- ✅ Type definitions (XPSHScore, XPSHNote, etc.)
- ✅ Timeline compilation
- ✅ Audio scheduling (lookahead)
- ✅ Editor operations (insert, delete, find)
- ✅ Import/Export utilities

### components/ - UI Components
- ✅ XpshPlayer - Basic playback
- ✅ XpshPracticePlayer - A-B loop
- ✅ XpshEditorPage - Visual editor
- ✅ ScoreCanvas - SVG staff rendering
- ✅ LoopTimeline - Timeline UI

### app/ - Pages
- ✅ /player-demo - Player demo page
- ✅ /practice-demo - Practice mode demo
- ✅ /editor - Visual editor page

---

## 🔍 File Dependencies

```
┌─────────────────────────────────────────────┐
│           lib/xpsh_helpers.ts               │
│        (Core types & utilities)             │
└───────────┬─────────────────────────────────┘
            │
            ├──→ lib/xpsh_timeline.ts
            │    (Timeline compiler)
            │
            ├──→ lib/editor_ops.ts
            │    (Editor operations)
            │
            ├──→ lib/exportXpsh.ts
            │    (Import/Export)
            │
            └──→ lib/useAudioScheduler.ts
                 (Audio scheduler hook)
                      │
                      ↓
            ┌─────────────────────────┐
            │   Components Layer      │
            ├─────────────────────────┤
            │ XpshPlayer              │
            │ XpshPracticePlayer      │
            │ XpshEditorPage          │
            │ ScoreCanvas             │
            │ LoopTimeline            │
            └──────────┬──────────────┘
                       │
                       ↓
            ┌─────────────────────────┐
            │    App Pages Layer      │
            ├─────────────────────────┤
            │ player-demo/page.tsx    │
            │ practice-demo/page.tsx  │
            │ editor/page.tsx         │
            └─────────────────────────┘
```

---

## 📚 Documentation Guide

| File | Purpose |
|------|---------|
| **XPSH_v1_SPEC.md** | Format specification - Read first |
| **EDITOR_README.md** | Editor usage & API reference |
| **PLAYBACK_ENGINE_README.md** | Player architecture & usage |
| **PRACTICE_MODE_README.md** | Practice mode comprehensive guide |
| **PRACTICE_MODE_QUICKSTART.md** | 5-minute quick start |

---

## ✅ Checklist

Sau khi gộp project, hãy check:

- [ ] Tất cả 28 files đã được copy
- [ ] Cấu trúc folders đúng (lib, components, app, docs, __tests__)
- [ ] package.json và tsconfig.json đã tạo
- [ ] Import paths cần update (từ './' → '@/lib/' hoặc '@/components/')
- [ ] Sample file paths cần update (thêm '/samples/')
- [ ] Chạy `npm install` thành công
- [ ] Chạy `npm run dev` không lỗi
- [ ] Test 3 pages: player-demo, practice-demo, editor

---

## 🎉 Summary

**Trước:** 2 folders riêng biệt (Editor + stitch (1))  
**Sau:** 1 project Next.js hoàn chỉnh với cấu trúc chuẩn

**Benefits:**
- ✅ Dễ quản lý - Tất cả code một chỗ
- ✅ Cấu trúc rõ ràng - lib, components, app, docs
- ✅ Ready for deployment - Next.js project
- ✅ Professional structure - Industry standard

---

**Project location:**
```
d:\Engine editor + playback sheet nhạc\xpsh-project\
```

**Happy coding! 🎹**
