# XPSH Format v1.1.0 — Specification

> Piano-only score format. Backward-compatible with v1.0.0.

---

## 1. Top-Level Structure

```json
{
  "format": "xpsh",
  "format_version": "1.1.0",
  "metadata": { ... },
  "timing": { ... },
  "tracks": [ ... ]
}
```

### 1.1 Format Version

| Version | Notes |
|---------|-------|
| `1.0.0` | Original – `track.notes[]` with `XPSHNote` objects |
| `1.1.0` | New – `track.events[]` with `XPSHEvent` objects supporting chord/rest/pedal/tie/tuplet/voice |

---

## 2. Metadata

```json
{
  "title": "My Piece",
  "composer": "Optional",
  "arranger": "Optional",
  "copyright": "Optional",
  "created_at": "2026-02-19T00:00:00Z",
  "modified_at": "2026-02-19T00:00:00Z"
}
```

---

## 3. Timing

```json
{
  "ticks_per_quarter": 480,
  "tempo_bpm": 120,
  "time_signature": { "numerator": 4, "denominator": 4 }
}
```

- `ticks_per_quarter` **must** be `480`.  
- `time_signature` is fixed `4/4` in this phase.  
- 1 measure = `4 × 480 = 1920` ticks.

---

## 4. Tracks

Exactly two tracks are required:

| id | name | clef |
|----|------|------|
| `track_rh` | `"RH"` | `"treble"` |
| `track_lh` | `"LH"` | `"bass"` |

### v1.0 Track

```json
{ "id": "track_rh", "name": "RH", "type": "piano", "clef": "treble", "notes": [ ... ] }
```

### v1.1 Track

```json
{ "id": "track_rh", "name": "RH", "type": "piano", "clef": "treble", "events": [ ... ] }
```

---

## 5. XPSHEvent (v1.1)

```typescript
interface XPSHEvent {
  id: string;
  start_tick: number;     // integer, 0 ≤ x < 15360 (8 measures)
  dur_tick: number;       // integer > 0
  voice: 1 | 2;
  type: "chord" | "rest" | "pedal";

  // chord / rest fields
  pitches?: number[];           // MIDI 21–108; required for type="chord"
  accidentals?: PitchAccidental[];
  velocity?: number;            // 1–127, default 64
  ties?: TieRef[];
  tuplet?: TupletInfo;
}
```

---

## 6. Accidentals

```typescript
type AccidentalType = "none" | "sharp" | "flat" | "natural" | "doubleSharp" | "doubleFlat";

interface PitchAccidental {
  pitch: number;
  accidental: AccidentalType;
}
```

- Accidentals are **display-only**. The pitch number already encodes the exact MIDI semitone.
- A `"sharp"` accidental on pitch 61 means "display a ♯ in front of the C♯4 notehead."
- Omitting `accidentals[]` or setting `accidental: "none"` means no explicit marking.

---

## 7. Ties

```typescript
interface TieRef {
  pitch: number;
  start: boolean;         // this event begins a tie for this pitch
  stop: boolean;          // this event ends a tie for this pitch
  toEventId?: string;     // required when start=true
}
```

### Rules

- A pitch can have both `start: true` and `stop: true` (middle of a chain).
- `toEventId` must point to an event in the same track with the same pitch in its `pitches[]`.
- Compiler behaviour: when a tie start is found, **do not emit NoteOn** for the destination event's instance of that pitch. Extend NoteOff to the end of the final event in the chain.

### Example – 2-event tie chain

```json
// event e1: C4 quarter, tied forward
{
  "id": "e1", "start_tick": 0, "dur_tick": 480,
  "voice": 1, "type": "chord", "pitches": [60], "velocity": 80,
  "ties": [{ "pitch": 60, "start": true, "stop": false, "toEventId": "e2" }]
}
// event e2: C4 half, tied stop
{
  "id": "e2", "start_tick": 480, "dur_tick": 960,
  "voice": 1, "type": "chord", "pitches": [60], "velocity": 80,
  "ties": [{ "pitch": 60, "start": false, "stop": true }]
}
```

Total sounding duration = 480 + 960 = 1440 ticks.

---

## 8. Pedal (Sustain)

```typescript
// type = "pedal"
{
  "id": "ped1",
  "start_tick": 0,
  "dur_tick": 1920,    // sustain for one full measure
  "voice": 1,
  "type": "pedal"
}
```

- Compiler emits CC64 = 127 at `start_tick` ms and CC64 = 0 at `start_tick + dur_tick` ms.
- For synthesisers without CC support, the compiler extends active NoteOff events that fall within the pedal range by `dur_tick` ms (fallback sustain).

---

## 9. Tuplets (Triplet)

```typescript
interface TupletInfo {
  type: "triplet";
  actual: number;    // 3 notes…
  normal: number;    // …in the time of 2
  groupId: string;   // shared across all events in the tuplet group
}
```

### Timing Rules

An **quarter-note triplet** (3 notes in the time of 2 quarter notes = 1 beat pair):

| | Stored `dur_tick` | Effective tick duration |
|--|--|--|
| Triplet note | 480 (base beat) | `480 × 2/3 = 320` |

The compiler multiplies each event's `dur_tick` and positional offsets by `normal/actual` (= 2/3 for quarter triplet).

### Example – 3-note triplet group starting at beat 0

```json
[
  { "id":"t1","start_tick":0,   "dur_tick":480,"voice":1,"type":"chord","pitches":[60],
    "tuplet":{"type":"triplet","actual":3,"normal":2,"groupId":"grp1"} },
  { "id":"t2","start_tick":480, "dur_tick":480,"voice":1,"type":"chord","pitches":[62],
    "tuplet":{"type":"triplet","actual":3,"normal":2,"groupId":"grp1"} },
  { "id":"t3","start_tick":960, "dur_tick":480,"voice":1,"type":"chord","pitches":[64],
    "tuplet":{"type":"triplet","actual":3,"normal":2,"groupId":"grp1"} }
]
```

Effective start_ticks: `0, 320, 640`. Effective dur: `320` each. Total span: `960` ticks (2 beats).

---

## 10. Voices

- `voice: 1` — primary voice (stem up, filled notehead).
- `voice: 2` — secondary voice (stem down, renders lighter in editor).
- Multiple events on the same track/start_tick with different voices are valid.
- Playback treats all voices equally.

---

## 11. Pitch Encoding

Pitches are stored as **integers** (MIDI note numbers), **not strings**.

| Note | MIDI |
|------|------|
| A0 | 21 |
| C4 (Middle C) | 60 |
| C8 | 108 |

Formula: `pitch = (octave + 1) × 12 + noteIndex`  
where `noteIndex`: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11.

---

## 12. Validation Rules Summary

| Rule | Severity |
|------|----------|
| `format === "xpsh"` | Error |
| `format_version` ∈ `{"1.0.0","1.1.0"}` | Error |
| `ticks_per_quarter === 480` | Error |
| `tempo_bpm` ∈ (1, 400) | Error |
| `time_signature === 4/4` | Error |
| `track_rh` and `track_lh` both present | Error |
| `event.voice` ∈ `{1,2}` | Error |
| `event.type` ∈ `{"chord","rest","pedal"}` | Error |
| `pitches[]` each ∈ [21,108] | Error |
| `velocity` ∈ [1,127] | Error |
| `tie.toEventId` must exist in same track | Error |
| `tuplet.groupId` events must share same `actual`/`normal` | Error |
| `pedal.dur_tick > 0` | Error |
