# Migration Guide - Update Import Paths

## 📝 Overview

Sau khi gộp project, cần update import paths trong tất cả files từ relative imports (`./`) sang module imports (`@/lib/`, `@/components/`).

---

## 🔧 Auto-Update Script

Chạy script này để tự động update tất cả imports:

```powershell
# Navigate to project
cd "d:\Engine editor + playback sheet nhạc\xpsh-project"

# Run update script
.\update-imports.ps1
```

---

## ✏️ Manual Updates

Nếu muốn update thủ công, đây là các thay đổi cần thiết:

### 1. app/player-demo/page.tsx

**Find:**
```typescript
import { XPSHScore } from './xpsh_helpers';
import { XpshPlayer } from './XpshPlayer';
```

**Replace with:**
```typescript
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPlayer } from '@/components/XpshPlayer';
```

**Also update fetch path:**
```typescript
// Before
fetch('/sample_simple_scale.xpsh.json')

// After
fetch('/samples/sample_simple_scale.xpsh.json')
```

---

### 2. app/practice-demo/page.tsx

**Find:**
```typescript
import { XPSHScore } from './xpsh_helpers';
import { XpshPracticePlayer } from './XpshPracticePlayer';
```

**Replace with:**
```typescript
import { XPSHScore } from '@/lib/xpsh_helpers';
import { XpshPracticePlayer } from '@/components/XpshPracticePlayer';
```

**Update sample paths:**
```typescript
// Before
{ id: 'sample_simple_scale', name: 'Simple Scale', file: '/sample_simple_scale.xpsh.json' },
{ id: 'sample_two_hands', name: 'Two Hands', file: '/sample_two_hands.xpsh.json' }

// After
{ id: 'sample_simple_scale', name: 'Simple Scale', file: '/samples/sample_simple_scale.xpsh.json' },
{ id: 'sample_two_hands', name: 'Two Hands', file: '/samples/sample_two_hands.xpsh.json' }
```

---

### 3. app/editor/page.tsx

**Find all instances:**
```typescript
import { XPSHScore } from './xpsh_helpers';
import { compileTimeline } from './xpsh_timeline';
// etc...
```

**Replace with:**
```typescript
import { XPSHScore } from '@/lib/xpsh_helpers';
import { compileTimeline } from '@/lib/xpsh_timeline';
// etc...
```

---

### 4. components/XpshPlayer.tsx

**Find:**
```typescript
import { XPSHScore } from './xpsh_helpers';
import { compileTimeline, retimeTimeline } from './xpsh_timeline';
import { useAudioScheduler } from './useAudioScheduler';
```

**Replace with:**
```typescript
import { XPSHScore } from '@/lib/xpsh_helpers';
import { compileTimeline, retimeTimeline } from '@/lib/xpsh_timeline';
import { useAudioScheduler } from '@/lib/useAudioScheduler';
```

---

### 5. components/XpshPracticePlayer.tsx

**Find:**
```typescript
import { XPSHScore } from './xpsh_helpers';
import { compileTimeline, retimeTimeline } from './xpsh_timeline';
import { useAudioScheduler } from './useAudioScheduler';
import { LoopTimeline } from './LoopTimeline';
```

**Replace with:**
```typescript
import { XPSHScore } from '@/lib/xpsh_helpers';
import { compileTimeline, retimeTimeline } from '@/lib/xpsh_timeline';
import { useAudioScheduler } from '@/lib/useAudioScheduler';
import { LoopTimeline } from '@/components/LoopTimeline';
```

---

### 6. components/XpshEditorPage.tsx

**Find all:**
```typescript
import { XPSHScore, ... } from './xpsh_helpers';
import { compileTimeline, ... } from './xpsh_timeline';
import { useAudioScheduler } from './useAudioScheduler';
import { insertNote, ... } from './editor_ops';
import { downloadXpsh, ... } from './exportXpsh';
import { ScoreCanvas } from './ScoreCanvas';
```

**Replace with:**
```typescript
import { XPSHScore, ... } from '@/lib/xpsh_helpers';
import { compileTimeline, ... } from '@/lib/xpsh_timeline';
import { useAudioScheduler } from '@/lib/useAudioScheduler';
import { insertNote, ... } from '@/lib/editor_ops';
import { downloadXpsh, ... } from '@/lib/exportXpsh';
import { ScoreCanvas } from '@/components/ScoreCanvas';
```

---

### 7. components/ScoreCanvas.tsx

**Find:**
```typescript
import { XPSHScore, XPSHNote, ... } from './xpsh_helpers';
import { findNoteAt, ... } from './editor_ops';
```

**Replace with:**
```typescript
import { XPSHScore, XPSHNote, ... } from '@/lib/xpsh_helpers';
import { findNoteAt, ... } from '@/lib/editor_ops';
```

---

### 8. components/LoopTimeline.tsx

No imports to update (self-contained component).

---

## 🤖 Auto-Update Script

Create file `update-imports.ps1` trong project root:

```powershell
# update-imports.ps1
$projectRoot = $PSScriptRoot

Write-Host "Updating import paths..." -ForegroundColor Yellow

# Define replacements
$replacements = @{
    "from './xpsh_helpers'" = "from '@/lib/xpsh_helpers'"
    "from './xpsh_timeline'" = "from '@/lib/xpsh_timeline'"
    "from './useAudioScheduler'" = "from '@/lib/useAudioScheduler'"
    "from './editor_ops'" = "from '@/lib/editor_ops'"
    "from './exportXpsh'" = "from '@/lib/exportXpsh'"
    "from './XpshPlayer'" = "from '@/components/XpshPlayer'"
    "from './XpshPracticePlayer'" = "from '@/components/XpshPracticePlayer'"
    "from './XpshEditorPage'" = "from '@/components/XpshEditorPage'"
    "from './ScoreCanvas'" = "from '@/components/ScoreCanvas'"
    "from './LoopTimeline'" = "from '@/components/LoopTimeline'"
    "'/sample_simple_scale.xpsh.json'" = "'/samples/sample_simple_scale.xpsh.json'"
    "'/sample_two_hands.xpsh.json'" = "'/samples/sample_two_hands.xpsh.json'"
}

# Get all .tsx and .ts files
$files = Get-ChildItem -Path $projectRoot -Include *.tsx,*.ts -Recurse -File | 
         Where-Object { $_.FullName -notlike "*\node_modules\*" -and $_.FullName -notlike "*\.next\*" }

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $modified = $false
    
    foreach ($find in $replacements.Keys) {
        $replace = $replacements[$find]
        if ($content -like "*$find*") {
            $content = $content -replace [regex]::Escape($find), $replace
            $modified = $true
        }
    }
    
    if ($modified) {
        $content | Set-Content $file.FullName -NoNewline
        Write-Host "  [UPDATED] $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`nImport paths updated successfully!" -ForegroundColor Green
```

Then run:
```powershell
.\update-imports.ps1
```

---

## ✅ Verification Checklist

After updating imports:

- [ ] All TypeScript files compile without errors
- [ ] `npm run dev` starts successfully
- [ ] Player demo page loads at /player-demo
- [ ] Practice demo page loads at /practice-demo
- [ ] Editor page loads at /editor
- [ ] Sample files load correctly
- [ ] No console errors in browser
- [ ] Audio playback works
- [ ] Loop functionality works
- [ ] Editor can add/delete notes

---

## 🔍 Common Errors & Fixes

### Error: "Module not found: Can't resolve './xpsh_helpers'"

**Cause:** Import path not updated

**Fix:** Change `'./xpsh_helpers'` to `'@/lib/xpsh_helpers'`

---

### Error: "Failed to load resource: 404 /sample_simple_scale.xpsh.json"

**Cause:** Sample file path not updated

**Fix:** Change `'/sample_simple_scale.xpsh.json'` to `'/samples/sample_simple_scale.xpsh.json'`

---

### Error: "Cannot find module '@/lib/xpsh_helpers'"

**Cause:** TypeScript path mapping not configured

**Fix:** Check `tsconfig.json` has correct paths:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/lib/*": ["./lib/*"],
      "@/components/*": ["./components/*"]
    }
  }
}
```

---

## 📊 Import Path Mapping

| Old Path | New Path | Usage |
|----------|----------|-------|
| `'./xpsh_helpers'` | `'@/lib/xpsh_helpers'` | Types & utilities |
| `'./xpsh_timeline'` | `'@/lib/xpsh_timeline'` | Timeline compiler |
| `'./useAudioScheduler'` | `'@/lib/useAudioScheduler'` | Audio hook |
| `'./editor_ops'` | `'@/lib/editor_ops'` | Editor operations |
| `'./exportXpsh'` | `'@/lib/exportXpsh'` | Import/Export |
| `'./XpshPlayer'` | `'@/components/XpshPlayer'` | Player component |
| `'./XpshPracticePlayer'` | `'@/components/XpshPracticePlayer'` | Practice player |
| `'./XpshEditorPage'` | `'@/components/XpshEditorPage'` | Editor component |
| `'./ScoreCanvas'` | `'@/components/ScoreCanvas'` | Canvas component |
| `'./LoopTimeline'` | `'@/components/LoopTimeline'` | Timeline component |

---

## 🎯 Testing After Migration

```bash
# 1. Install dependencies
npm install

# 2. Check TypeScript compilation
npx tsc --noEmit

# 3. Run dev server
npm run dev

# 4. Test pages in browser
# - http://localhost:3000/player-demo
# - http://localhost:3000/practice-demo
# - http://localhost:3000/editor

# 5. Run tests
node __tests__/xpsh_helpers.test.ts
node __tests__/editor_ops.test.ts
```

---

## 📝 Summary

**Total files to update:** 7 files
- 3 page files (app/*/page.tsx)
- 4 component files (components/*.tsx)

**Total import statements to update:** ~30-40 imports

**Estimated time:** 10-15 minutes manual, 2 minutes with script

---

**After migration is complete, you're ready to develop! 🎉**
