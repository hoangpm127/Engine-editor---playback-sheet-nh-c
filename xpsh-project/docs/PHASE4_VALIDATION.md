# PHASE 4: XPSH Validation System

## 📋 Overview

Phase 4 implements a comprehensive validation system for XPSH files to ensure data integrity before playback or editing. The system prevents runtime errors and provides clear feedback for invalid files.

## 🎯 Key Features

### ✅ Validation Functions

1. **`validateXpsh(score: unknown): ValidationResult`**
   - Main validation function with comprehensive checks
   - Returns detailed errors and warnings
   - Validates format, timing, tracks, and notes

2. **`safeParseXpsh(jsonString: string): XPSHScore | null`**
   - Safe JSON parsing with built-in validation
   - Returns `null` for invalid files
   - Logs errors to console

3. **`isPlaybackSafe(score: unknown): boolean`**
   - Quick validation for playback readiness
   - Checks critical properties only
   - Returns boolean result

4. **`isEditorSafe(score: unknown): boolean`**
   - Validation for editor loading
   - Same as playback checks
   - Boolean result for simple conditional logic

5. **`formatValidationErrors(result: ValidationResult): string`**
   - User-friendly error message formatting
   - Groups errors and warnings
   - Suitable for display in UI

### 🔍 Validation Rules

#### Format Checks
- `format` must be exactly `"xpsh"`
- `format_version` must be `"1.0.0"`

#### Timing Checks
- `ticks_per_quarter` must be exactly `480`
- `tempo_bpm` must be between 1-400 (inclusive)
- `time_signature` must be `[4, 4]`

#### Track Checks
- Must have `track_rh` (right hand)
- Must have `track_lh` (left hand)
- No duplicate track IDs
- Track arrays must exist

#### Note Checks
- **Unique IDs**: All note IDs must be unique across both tracks
- **Pitch Range**: 21-108 (A0 to C8, full 88-key piano)
- **Start Tick**: Must be ≥ 0
- **Duration**: Must be > 0 (no zero-duration notes)
- **Velocity**: Must be 1-127 (MIDI standard)
- **Note Boundaries**: Notes must end within 8 measures (15360 ticks)

## 📦 Integration

### Player Demo Integration

```typescript
// app/player-demo/page.tsx
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';

// In loadScore function:
const data = await response.json();

const validationResult = validateXpsh(data);
if (!validationResult.valid) {
  const errorMessage = formatValidationErrors(validationResult);
  throw new Error(`Invalid XPSH file:\n${errorMessage}`);
}

setScore(data as XPSHScore);
```

### Practice Demo Integration

```typescript
// app/practice-demo/page.tsx
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';

// In loadScore function:
const data = await response.json();

const validationResult = validateXpsh(data);
if (!validationResult.valid) {
  const errorMessage = formatValidationErrors(validationResult);
  throw new Error(`Invalid XPSH file:\n${errorMessage}`);
}

setScore(data as XPSHScore);
```

### Editor Integration

```typescript
// app/editor/page.tsx
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';

// In handleImport function:
const loadedScore = await loadXpshFile(file);

const validationResult = validateXpsh(loadedScore);
if (!validationResult.valid) {
  const errorMessage = formatValidationErrors(validationResult);
  alert(`Invalid XPSH file:\n\n${errorMessage}`);
  return;
}

setScore(loadedScore);
```

## 🧪 Testing

### Test Suite

Comprehensive test suite with 24 test cases covering:

```bash
# Run tests (requires tsx or ts-node)
npx tsx __tests__/xpsh_validator.test.ts
```

**Test Categories:**

1. **Valid Score Tests**
   - ✅ Valid score passes all checks

2. **Format Tests**
   - ❌ Invalid format field
   - ❌ Invalid version
   - ❌ Invalid ticks_per_quarter
   - ❌ Invalid tempo (too high/low)
   - ❌ Invalid time signature

3. **Track Tests**
   - ❌ Missing track_rh
   - ❌ Missing track_lh

4. **Note Tests**
   - ❌ Invalid pitch (out of range 21-108)
   - ❌ Negative duration
   - ❌ Zero duration
   - ❌ Invalid velocity (out of range 1-127)
   - ❌ Negative start_tick
   - ❌ Duplicate note IDs
   - ❌ Notes beyond 8 measures

5. **Edge Cases**
   - ✅ Boundary values (pitch 21, 108, velocity 1, 127)
   - ❌ Multiple simultaneous errors
   - ✅ Empty tracks (valid but warning)

6. **Utility Function Tests**
   - ✅ safeParseXpsh with valid/invalid JSON
   - ✅ isPlaybackSafe
   - ✅ formatValidationErrors

### Manual Testing

1. **Test with Valid File:**
   ```bash
   # Navigate to player demo
   # Load sample_simple_scale.xpsh.json
   # Should load without errors
   ```

2. **Test with Invalid File:**
   ```bash
   # Create invalid file (e.g., wrong format version)
   # Try to load in player/practice/editor
   # Should show clear error message
   ```

3. **Test Error Messages:**
   ```bash
   # Load file with multiple errors
   # Verify all errors are listed clearly
   # Check that error formatting is readable
   ```

## 📊 ValidationResult Structure

```typescript
interface ValidationResult {
  valid: boolean;           // Overall validation status
  errors: string[];         // Critical errors (prevent playback)
  warnings: string[];       // Non-critical issues (ok for playback)
}
```

### Error Examples

```typescript
// Format error
"Invalid format: expected 'xpsh', got 'xpsh-old'"

// Version error
"Invalid format_version: expected '1.0.0', got '0.9.0'"

// Note error
"Note rh_001 has invalid pitch: 110 (must be 21-108)"

// Duration error
"Note lh_003 has invalid duration: -5 (must be > 0)"

// Duplicate ID error
"Duplicate note ID found: rh_002"
```

### Warning Examples

```typescript
// Empty track warning
"Track track_rh has no notes"
```

## 🚀 Usage Examples

### Basic Validation

```typescript
import { validateXpsh } from '@/lib/xpsh_validator';

const result = validateXpsh(someData);
if (!result.valid) {
  console.error('Validation failed:', result.errors);
  return;
}

// Proceed with playback/editing
```

### Safe Parsing

```typescript
import { safeParseXpsh } from '@/lib/xpsh_validator';

const jsonString = await file.text();
const score = safeParseXpsh(jsonString);

if (!score) {
  console.error('Failed to parse and validate XPSH file');
  return;
}

// Use validated score
```

### Quick Checks

```typescript
import { isPlaybackSafe } from '@/lib/xpsh_validator';

if (isPlaybackSafe(data)) {
  startPlayback(data);
} else {
  showError('File is not safe for playback');
}
```

### Formatted Error Display

```typescript
import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';

const result = validateXpsh(data);
if (!result.valid) {
  const message = formatValidationErrors(result);
  alert(message); // or display in UI
}
```

## 🔒 Safety Benefits

1. **Prevents Crashes**: Validates data before processing
2. **Clear Feedback**: Detailed error messages for debugging
3. **Type Safety**: Validates unknown data at runtime
4. **MIDI Compliance**: Ensures MIDI-compatible note parameters
5. **Consistent Format**: Enforces XPSH 1.0.0 specification

## 📝 Next Steps

### Completed ✅
- ✅ Validator implementation (`lib/xpsh_validator.ts`)
- ✅ Test suite (`__tests__/xpsh_validator.test.ts`)
- ✅ Integration into player-demo
- ✅ Integration into practice-demo
- ✅ Integration into editor
- ✅ Documentation (this file)

### Future Enhancements 🔮
- [ ] UI component for error display (modal/toast)
- [ ] Validation progress indicator for large files
- [ ] Auto-fix for common issues (e.g., clamp out-of-range values)
- [ ] Validation statistics (total notes, duration, etc.)
- [ ] Export validation report as JSON
- [ ] Validator configuration options (strict/permissive mode)

## 📚 Related Documentation

- [Project Structure](PROJECT_STRUCTURE.md)
- [XPSH Format Specification](docs/XPSH_FORMAT.md)
- [API Documentation](API_DOCUMENTATION.md)
- [Testing Guide](TESTING_GUIDE.md)

## 🐛 Troubleshooting

### Issue: Validation fails for valid file

**Solution:** Check XPSH format version. Ensure file uses format version `1.0.0`.

```typescript
{
  "format": "xpsh",
  "format_version": "1.0.0",  // Must be exactly this
  // ...
}
```

### Issue: False positives in validation

**Solution:** Review validation rules in `lib/xpsh_validator.ts`. Update rules if XPSH spec changes.

### Issue: Tests fail to run

**Solution:** Install TypeScript execution tool:

```bash
npm install -D tsx
# or
npm install -D ts-node
```

---

**Phase 4 Complete** ✅  
Validation system fully implemented and integrated across all components.
