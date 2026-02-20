# XPSH v1 Format Specification

## Giới thiệu

**XPSH** (XpianoSheet) là file format nội bộ dùng cho Piano Sheet Editor/Player (web application). Format này được thiết kế để lưu trữ dữ liệu nhạc piano dạng MIDI-like, đủ thông tin cho việc playback và hiển thị ký hiệu nhạc.

### Đặc điểm chính
- **Nhạc cụ**: Piano (2 staff/track)
- **Format**: JSON (text-based, human-readable)
- **Versioning**: Hỗ trợ quản lý version qua field `format_version`
- **Tick-based timing**: Sử dụng tick làm đơn vị thời gian chính

### Phạm vi Phase 0
- Time signature: **chỉ 4/4**
- Tempo: mặc định **120 BPM** (có thể thay đổi)
- **Không hỗ trợ**: tie, pedal, tuplet

---

## JSON Structure

Một file XPSH v1 là một JSON object với cấu trúc như sau:

```typescript
{
  format_version: string,
  metadata: MetadataObject,
  timing: TimingObject,
  tracks: TrackObject[]
}
```

---

## Định nghĩa các Field

### 1. `format_version`

**Kiểu**: `string`  
**Mô tả**: Version của XPSH format. Phải tuân theo semantic versioning.  
**Giá trị hiện tại**: `"1.0.0"`  
**Constraints**: Bắt buộc. Pattern: `MAJOR.MINOR.PATCH`

**Quy tắc versioning**:
- **MAJOR**: Thay đổi không tương thích (breaking changes)
- **MINOR**: Thêm tính năng mới, tương thích ngược
- **PATCH**: Bug fixes, không thay đổi cấu trúc

---

### 2. `metadata`

**Kiểu**: `object`  
**Mô tả**: Thông tin mô tả về bản nhạc

#### Fields:

| Field         | Type     | Required | Mô tả                        | Default   |
|---------------|----------|----------|------------------------------|-----------|
| `title`       | `string` | Yes      | Tên bài hát                  | -         |
| `composer`    | `string` | No       | Tên tác giả                  | `""`      |
| `arranger`    | `string` | No       | Người biên soạn              | `""`      |
| `copyright`   | `string` | No       | Thông tin bản quyền          | `""`      |
| `created_at`  | `string` | No       | Thời gian tạo (ISO 8601)     | -         |
| `modified_at` | `string` | No       | Thời gian sửa đổi (ISO 8601) | -         |

**Ví dụ**:
```json
{
  "title": "C Major Scale",
  "composer": "",
  "arranger": "",
  "copyright": "",
  "created_at": "2026-02-15T00:00:00Z",
  "modified_at": "2026-02-15T00:00:00Z"
}
```

---

### 3. `timing`

**Kiểu**: `object`  
**Mô tả**: Thông tin về thời gian và tempo

#### Fields:

| Field               | Type     | Required | Mô tả                                  | Default | Constraints       |
|---------------------|----------|----------|----------------------------------------|---------|-------------------|
| `ticks_per_quarter` | `number` | Yes      | Số tick trong 1 quarter note           | `480`   | Phải là `480`     |
| `tempo_bpm`         | `number` | Yes      | Tempo tính bằng beats per minute       | `120`   | > 0               |
| `time_signature`    | `object` | Yes      | Chỉ số nhịp                            | -       | Phase 0: chỉ 4/4  |

#### `time_signature` object:

| Field          | Type     | Required | Mô tả                        | Default | Constraints |
|----------------|----------|----------|------------------------------|---------|-------------|
| `numerator`    | `number` | Yes      | Tử số (số beat trong 1 ô)    | `4`     | Phải là `4` |
| `denominator`  | `number` | Yes      | Mẫu số (loại note = 1 beat)  | `4`     | Phải là `4` |

**Ví dụ**:
```json
{
  "ticks_per_quarter": 480,
  "tempo_bpm": 120,
  "time_signature": {
    "numerator": 4,
    "denominator": 4
  }
}
```

**Công thức tick → ms**:
```
ms = (tick / ticks_per_quarter) * (60000 / tempo_bpm)
```

Ví dụ: với `ticks_per_quarter=480` và `tempo_bpm=120`:
- 1 quarter note = 480 ticks = 500ms
- 1 whole note = 1920 ticks = 2000ms

---

### 4. `tracks`

**Kiểu**: `array` of `TrackObject`  
**Mô tả**: Danh sách các track (staff)  
**Constraints**: Phải có đúng 2 tracks (RH và LH)

#### TrackObject:

| Field  | Type     | Required | Mô tả                                    | Constraints                    |
|--------|----------|----------|------------------------------------------|--------------------------------|
| `id`   | `string` | Yes      | ID duy nhất của track                    | Unique trong file              |
| `name` | `string` | Yes      | Tên track                                | `"RH"` hoặc `"LH"`             |
| `type` | `string` | Yes      | Loại track                               | Phải là `"piano"`              |
| `clef` | `string` | No       | Khóa nhạc                                | `"treble"` (RH), `"bass"` (LH) |
| `notes`| `array`  | Yes      | Mảng các note object                     | -                              |

#### NoteObject:

| Field        | Type     | Required | Mô tả                                          | Constraints           |
|--------------|----------|----------|------------------------------------------------|-----------------------|
| `id`         | `string` | Yes      | ID duy nhất của note                           | Unique trong file     |
| `pitch`      | `number` | Yes      | MIDI pitch (60 = C4, middle C)                 | 0-127, piano: 21-108  |
| `start_tick` | `number` | Yes      | Thời điểm bắt đầu (tính bằng tick)             | >= 0                  |
| `dur_tick`   | `number` | Yes      | Độ dài note (tính bằng tick)                   | > 0                   |
| `velocity`   | `number` | Yes      | Độ mạnh khi gõ phím (MIDI velocity)            | 1-127, default: 64    |

**Ví dụ Track**:
```json
{
  "id": "track_rh",
  "name": "RH",
  "type": "piano",
  "clef": "treble",
  "notes": [
    {
      "id": "n1",
      "pitch": 60,
      "start_tick": 0,
      "dur_tick": 480,
      "velocity": 64
    }
  ]
}
```

---

## MIDI Pitch Reference

| Note Name | MIDI Number | Mô tả       |
|-----------|-------------|-------------|
| C4        | 60          | Middle C    |
| A4        | 69          | 440Hz       |
| C3        | 48          | Bass clef C |
| C5        | 72          | Treble C    |

**Quy tắc đặt tên**:
- Octave bắt đầu từ C (C4, C#4, D4, ..., B4, C5)
- Sharp: `#` (C#4 = 61)
- Flat: `b` (Db4 = 61)

---

## Tick Measurement

Với `ticks_per_quarter = 480`:

| Duration       | Ticks | Ví dụ thời gian @ 120 BPM |
|----------------|-------|---------------------------|
| Whole note     | 1920  | 2000ms                    |
| Half note      | 960   | 1000ms                    |
| Quarter note   | 480   | 500ms                     |
| Eighth note    | 240   | 250ms                     |
| Sixteenth note | 120   | 125ms                     |

**Measure duration** (4/4): 1920 ticks = 4 quarter notes

---

## Ví dụ JSON Đầy Đủ

```json
{
  "format_version": "1.0.0",
  "metadata": {
    "title": "Sample Piece",
    "composer": "John Doe",
    "arranger": "",
    "copyright": "",
    "created_at": "2026-02-15T10:00:00Z",
    "modified_at": "2026-02-15T10:00:00Z"
  },
  "timing": {
    "ticks_per_quarter": 480,
    "tempo_bpm": 120,
    "time_signature": {
      "numerator": 4,
      "denominator": 4
    }
  },
  "tracks": [
    {
      "id": "track_rh",
      "name": "RH",
      "type": "piano",
      "clef": "treble",
      "notes": [
        {
          "id": "n1",
          "pitch": 60,
          "start_tick": 0,
          "dur_tick": 480,
          "velocity": 64
        },
        {
          "id": "n2",
          "pitch": 64,
          "start_tick": 0,
          "dur_tick": 480,
          "velocity": 64
        },
        {
          "id": "n3",
          "pitch": 67,
          "start_tick": 0,
          "dur_tick": 480,
          "velocity": 64
        }
      ]
    },
    {
      "id": "track_lh",
      "name": "LH",
      "type": "piano",
      "clef": "bass",
      "notes": [
        {
          "id": "n4",
          "pitch": 48,
          "start_tick": 0,
          "dur_tick": 1920,
          "velocity": 64
        }
      ]
    }
  ]
}
```

---

## Validation Rules

1. **format_version**: Phải là string "1.0.0"
2. **metadata.title**: Bắt buộc, không được rỗng
3. **timing.ticks_per_quarter**: Phải là 480
4. **timing.time_signature**: Phải là 4/4
5. **tracks**: Phải có đúng 2 phần tử
6. **tracks[].name**: Phải là "RH" hoặc "LH", không trùng lặp
7. **tracks[].type**: Phải là "piano"
8. **note.id**: Unique trong toàn bộ file
9. **note.pitch**: 21-108 (phạm vi piano chuẩn)
10. **note.velocity**: 1-127
11. **note.start_tick, note.dur_tick**: >= 0

---

## Changelog

### Version 1.0.0 (2026-02-15)
- Initial release
- Hỗ trợ 2 track piano (RH/LH)
- Time signature cố định 4/4
- Ticks per quarter cố định 480
