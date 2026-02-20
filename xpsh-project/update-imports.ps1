# Auto-Update Import Paths Script
# Automatically updates all relative imports to module imports

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   XPSH Project - Import Path Updater" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host ""
Write-Host "[1/3] Defining replacements..." -ForegroundColor Yellow

# Define replacements (find => replace)
$replacements = @{
    # Library imports
    "from './xpsh_helpers'" = "from '@/lib/xpsh_helpers'"
    "from './xpsh_timeline'" = "from '@/lib/xpsh_timeline'"
    "from './useAudioScheduler'" = "from '@/lib/useAudioScheduler'"
    "from './editor_ops'" = "from '@/lib/editor_ops'"
    "from './exportXpsh'" = "from '@/lib/exportXpsh'"
    "from './index'" = "from '@/lib'"
    
    # Component imports
    "from './XpshPlayer'" = "from '@/components/XpshPlayer'"
    "from './XpshPracticePlayer'" = "from '@/components/XpshPracticePlayer'"
    "from './XpshEditorPage'" = "from '@/components/XpshEditorPage'"
    "from './ScoreCanvas'" = "from '@/components/ScoreCanvas'"
    "from './LoopTimeline'" = "from '@/components/LoopTimeline'"
    
    # Sample file paths
    "'/sample_simple_scale.xpsh.json'" = "'/samples/sample_simple_scale.xpsh.json'"
    "'/sample_two_hands.xpsh.json'" = "'/samples/sample_two_hands.xpsh.json'"
    '"/sample_simple_scale.xpsh.json"' = '"/samples/sample_simple_scale.xpsh.json"'
    '"/sample_two_hands.xpsh.json"' = '"/samples/sample_two_hands.xpsh.json"'
}

Write-Host "  [OK] $($replacements.Count) replacement patterns defined" -ForegroundColor Green
Write-Host ""

Write-Host "[2/3] Finding TypeScript files..." -ForegroundColor Yellow

# Get all .tsx and .ts files (exclude node_modules, .next, __tests__)
$files = Get-ChildItem -Path $projectRoot -Include *.tsx,*.ts -Recurse -File | 
         Where-Object { 
             $_.FullName -notlike "*\node_modules\*" -and 
             $_.FullName -notlike "*\.next\*" -and
             $_.FullName -notlike "*\__tests__\*"
         }

Write-Host "  [OK] Found $($files.Count) files to process" -ForegroundColor Green
Write-Host ""

Write-Host "[3/3] Updating imports..." -ForegroundColor Yellow

$updatedCount = 0
$unchangedCount = 0

foreach ($file in $files) {
    $relativePath = $file.FullName.Replace($projectRoot, "").TrimStart('\')
    
    try {
        $content = Get-Content $file.FullName -Raw -Encoding UTF8
        $originalContent = $content
        $fileModified = $false
        $changesInFile = 0
        
        # Apply all replacements
        foreach ($find in $replacements.Keys) {
            $replace = $replacements[$find]
            
            if ($content -match [regex]::Escape($find)) {
                $beforeCount = ([regex]::Matches($content, [regex]::Escape($find))).Count
                $content = $content -replace [regex]::Escape($find), $replace
                $changesInFile += $beforeCount
                $fileModified = $true
            }
        }
        
        # Write back if modified
        if ($fileModified) {
            $content | Set-Content $file.FullName -Encoding UTF8 -NoNewline
            Write-Host "  [UPDATED] $relativePath ($changesInFile changes)" -ForegroundColor Green
            $updatedCount++
        } else {
            Write-Host "  [SKIP] $relativePath" -ForegroundColor Gray
            $unchangedCount++
        }
    }
    catch {
        Write-Host "  [ERROR] $relativePath - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Import path update complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Files updated: $updatedCount" -ForegroundColor Green
Write-Host "  Files unchanged: $unchangedCount" -ForegroundColor Gray
Write-Host "  Total processed: $($files.Count)" -ForegroundColor Cyan
Write-Host ""

if ($updatedCount -gt 0) {
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. npm install" -ForegroundColor White
    Write-Host "  2. npm run dev" -ForegroundColor White
    Write-Host "  3. Test all pages" -ForegroundColor White
    Write-Host ""
}

Write-Host "Done!" -ForegroundColor Magenta
