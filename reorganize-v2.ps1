# Reorganize XPSH Project Structure
# Script to consolidate project from 2 folders into 1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   XPSH Project Reorganization Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$rootPath = "D:\Engine editor + playback sheet nhạc"
$targetPath = "$rootPath\xpsh-project"

# Create directory structure
Write-Host "[1/8] Creating directory structure..." -ForegroundColor Yellow

$directories = @(
    "lib",
    "components",
    "app\player-demo",
    "app\practice-demo",
    "app\editor",
    "public\samples",
    "docs",
    "__tests__"
)

foreach ($dir in $directories) {
    $fullPath = Join-Path $targetPath $dir
    if (-Not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "  [OK] Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] Exists: $dir" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "[2/8] Copying lib files..." -ForegroundColor Yellow

# Copy lib files (core utilities)
$libFiles = @(
    "xpsh_helpers.ts",
    "xpsh_timeline.ts",
    "useAudioScheduler.ts",
    "editor_ops.ts",
    "exportXpsh.ts",
    "index.ts"
)

foreach ($file in $libFiles) {
    $source = Join-Path "$rootPath\stitch (1)" $file
    $dest = Join-Path "$targetPath\lib" $file
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] lib/$file" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "[3/8] Copying component files..." -ForegroundColor Yellow

# Copy component files
$componentFiles = @(
    "XpshPlayer.tsx",
    "XpshPracticePlayer.tsx",
    "XpshEditorPage.tsx",
    "ScoreCanvas.tsx",
    "LoopTimeline.tsx"
)

foreach ($file in $componentFiles) {
    $source = Join-Path "$rootPath\stitch (1)" $file
    $dest = Join-Path "$targetPath\components" $file
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] components/$file" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "[4/8] Copying pages..." -ForegroundColor Yellow

# Copy app pages
$pageFiles = @(
    @{src="player-demo.tsx"; dest="app\player-demo\page.tsx"},
    @{src="practice-demo.tsx"; dest="app\practice-demo\page.tsx"}
)

foreach ($file in $pageFiles) {
    $source = Join-Path "$rootPath\stitch (1)" $file.src
    $dest = Join-Path $targetPath $file.dest
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] $($file.dest)" -ForegroundColor Green
    }
}

# Copy XpshEditorPage as app/editor/page.tsx
$editorSource = Join-Path "$rootPath\stitch (1)" "XpshEditorPage.tsx"
$editorDest = Join-Path $targetPath "app\editor\page.tsx"
if (Test-Path $editorSource) {
    Copy-Item $editorSource $editorDest -Force
    Write-Host "  [OK] app/editor/page.tsx" -ForegroundColor Green
}

Write-Host ""
Write-Host "[5/8] Copying test files..." -ForegroundColor Yellow

# Copy test files
$testFiles = @(
    "xpsh_timeline.test.ts",
    "editor_ops.test.ts",
    "practice-mode.test.ts"
)

foreach ($file in $testFiles) {
    $source = Join-Path "$rootPath\stitch (1)" $file
    $dest = Join-Path "$targetPath\__tests__" $file
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] __tests__/$file" -ForegroundColor Green
    }
}

# Copy xpsh_helpers.test.ts from Editor folder
$helperTestSource = Join-Path "$rootPath\Editor" "xpsh_helpers.test.ts"
$helperTestDest = Join-Path "$targetPath\__tests__" "xpsh_helpers.test.ts"
if (Test-Path $helperTestSource) {
    Copy-Item $helperTestSource $helperTestDest -Force
    Write-Host "  [OK] __tests__/xpsh_helpers.test.ts" -ForegroundColor Green
}

Write-Host ""
Write-Host "[6/8] Copying documentation..." -ForegroundColor Yellow

# Copy documentation
$docFiles = @(
    @{src="stitch (1)\EDITOR_README.md"; dest="docs\EDITOR_README.md"},
    @{src="stitch (1)\PLAYBACK_ENGINE_README.md"; dest="docs\PLAYBACK_ENGINE_README.md"},
    @{src="stitch (1)\PRACTICE_MODE_README.md"; dest="docs\PRACTICE_MODE_README.md"},
    @{src="stitch (1)\PRACTICE_MODE_QUICKSTART.md"; dest="docs\PRACTICE_MODE_QUICKSTART.md"},
    @{src="Editor\XPSH_v1_SPEC.md"; dest="docs\XPSH_v1_SPEC.md"}
)

foreach ($file in $docFiles) {
    $source = Join-Path $rootPath $file.src
    $dest = Join-Path $targetPath $file.dest
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] $($file.dest)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "[7/8] Copying sample files..." -ForegroundColor Yellow

# Copy sample files
$sampleFiles = @(
    "sample_simple_scale.xpsh.json",
    "sample_two_hands.xpsh.json"
)

foreach ($file in $sampleFiles) {
    $source = Join-Path "$rootPath\Editor" $file
    $dest = Join-Path "$targetPath\public\samples" $file
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "  [OK] public/samples/$file" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "[8/8] Creating config files..." -ForegroundColor Yellow

# Create package.json
$packageJson = @"
{
  "name": "xpsh-editor-player",
  "version": "1.0.0",
  "description": "XPSH Piano Sheet Editor & Player with Practice Mode",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "node __tests__/xpsh_helpers.test.ts"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "next": "^14.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
"@

$packageJsonPath = Join-Path $targetPath "package.json"
$packageJson | Out-File -FilePath $packageJsonPath -Encoding UTF8
Write-Host "  [OK] package.json" -ForegroundColor Green

# Create tsconfig.json
$tsconfigJson = @"
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "paths": {
      "@/*": ["./*"],
      "@/lib/*": ["./lib/*"],
      "@/components/*": ["./components/*"],
      "@/app/*": ["./app/*"]
    },
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
"@

$tsconfigPath = Join-Path $targetPath "tsconfig.json"
$tsconfigJson | Out-File -FilePath $tsconfigPath -Encoding UTF8
Write-Host "  [OK] tsconfig.json" -ForegroundColor Green

# Create .gitignore
$gitignore = @"
# Dependencies
node_modules/
.pnp
.pnp.js

# Next.js
.next/
out/
build/
dist/

# Testing
coverage/

# Misc
.DS_Store
*.pem
*.log
.env*.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
"@

$gitignorePath = Join-Path $targetPath ".gitignore"
$gitignore | Out-File -FilePath $gitignorePath -Encoding UTF8
Write-Host "  [OK] .gitignore" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SUCCESS! Project reorganization complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  [OK] 6 lib files" -ForegroundColor Green
Write-Host "  [OK] 5 component files" -ForegroundColor Green
Write-Host "  [OK] 3 app pages" -ForegroundColor Green
Write-Host "  [OK] 4 test files" -ForegroundColor Green
Write-Host "  [OK] 5 documentation files" -ForegroundColor Green
Write-Host "  [OK] 2 sample files" -ForegroundColor Green
Write-Host "  [OK] package.json, tsconfig.json, .gitignore" -ForegroundColor Green
Write-Host ""

Write-Host "New project location:" -ForegroundColor Yellow
Write-Host "  $targetPath" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. cd `"$targetPath`"" -ForegroundColor White
Write-Host "  2. npm install" -ForegroundColor White
Write-Host "  3. npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Happy coding!" -ForegroundColor Magenta
