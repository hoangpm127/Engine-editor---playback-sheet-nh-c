  /**
   * XPSH Editor Page
   * Web-based piano score editor với playback
   */

  'use client';

  import React, { useState, useCallback, useEffect, useRef } from 'react';
  import { XPSHScore } from '@/lib/xpsh_helpers';
  import { validateXpsh, formatValidationErrors } from '@/lib/xpsh_validator';
  import {
    InsertNoteCommand, DeleteNoteCommand,
    InsertEventCommand, DeleteEventCommand, SetAccidentalCommand
  } from '@/lib/command';
  import { HistoryManager } from '@/lib/historyManager';
  import { ScoreCanvas } from '@/components/ScoreCanvas';
  import { XpshPlayer } from '@/components/XpshPlayer';
  import {
    insertNote, deleteNote, clearAllNotes, countNotes,
    insertOrUpdateChordPitch, deleteEvent, findEventById,
    setAccidental, addPedalRange, applyTripletGroup, countEvents,
    DurationType, DURATION_VALUES, VoiceNumber
  } from '@/lib/editor_ops';
  import { AccidentalType, newId } from '@/lib/xpsh_helpers';
  import {
    downloadXpsh,
    createEmptyScore,
    updateMetadata,
    loadXpshFile
  } from '@/lib/exportXpsh';

  // ============================================================================
  // Guide steps (const outside component to avoid re-creation)
  const GUIDE_STEPS = [
    { icon:'🎵', color:'#3b82f6', title:'Chọn độ dài nốt', hint:'Nhấn phím 1-5 hoặc click vào khối nốt bên trái (Tròn, Trắng, Đen…)' },
    { icon:'🎹', color:'#3b82f6', title:'Chọn tay phải / trái', hint:'Nhấn R = Tay Phải, L = Tay Trái. Khuông nhạc trên = Tay Phải.' },
    { icon:'🖱️', color:'#2b8cee', title:'Thêm nốt lên khuông', hint:'Di chuột lên khuông nhạc → thấy nốt mờ preview → click để đặt nốt.' },
    { icon:'♯', color:'#f97316', title:'Thêm dấu hoá (♯♭♮)', hint:'Click dấu hoá ở cột trái, sau đó click nốt cần thêm dấu.' },
    { icon:'⌒', color:'#8b5cf6', title:'Tie – nối hai nốt', hint:'Chọn Tie ở Nhịp Điệu → click nốt đầu rồi click nốt tiếp theo.' },
    { icon:'𝆮', color:'#7c3aed', title:'Pedal (giữ tiếng)', hint:'Chọn Pedal ở Nhịp Điệu → vẽ ngang trên khuông Bass.' },
    { icon:'🎶', color:'#8b5cf6', title:'Hợp Âm (Chord)', hint:'Bật Hợp Âm → click nhiều nốt cùng ô nhịp để tạo hợp âm.' },
    { icon:'▶️', color:'#22c55e', title:'Phát nhạc', hint:'Nhấn ▶ Play trên thanh công cụ để nghe bản nhạc của bạn.' },
    { icon:'↩', color:'#64748b', title:'Hoàn tác / Làm lại', hint:'Ctrl+Z để hoàn tác, Ctrl+Y hoặc Ctrl+Shift+Z để làm lại.' },
    { icon:'📤', color:'#0ea5e9', title:'Xuất file', hint:'Nhấn Export để lưu file .xpsh hoặc MIDI về máy tính.' },
  ];

  // ============================================================================
  // Component
  // ============================================================================

  export default function XpshEditorPage() {
    // ==========================================================================
    // State
    // ==========================================================================

    const [score, setScore] = useState<XPSHScore>(() => 
      createEmptyScore('My Piano Piece')
    );
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [selectedPitch, setSelectedPitch] = useState<number | null>(null);
    const [currentDuration, setCurrentDuration] = useState<DurationType>('quarter');
    const [currentTrack, setCurrentTrack] = useState<'track_rh' | 'track_lh'>('track_rh');
    const [showPlayer, setShowPlayer] = useState(false);
    const [showGuide, setShowGuide] = useState(true);
    const [guideDone, setGuideDone] = useState<Set<number>>(new Set());
    const [title, setTitle] = useState('My Piano Piece');

    // Phase 8 state
    const [currentVoice, setCurrentVoice] = useState<VoiceNumber>(1);
    const [chordMode, setChordMode] = useState(false);
    const [currentAccidental, setCurrentAccidental] = useState<AccidentalType | null>(null);
    const [editorTool, setEditorTool] = useState<'note' | 'tie' | 'pedal' | 'triplet'>('note');
    /** First note/event selected when using Tie tool */
    const tieFirstRef = useRef<{ eventId: string; pitch: number } | null>(null);
    /** Events selected for triplet grouping */
    const tripletSelectionRef = useRef<string[]>([]);

    // Sidebar tabs & note modifiers
    const [sideTab, setSideTab] = useState<'notes' | 'expression' | 'piano' | 'structure' | 'advanced'>('notes');
    const [restMode, setRestMode]           = useState(false);
    const [dotMode, setDotMode]             = useState(false);
    const [doubleDotMode, setDoubleDotMode] = useState(false);
    const [currentDynamic, setCurrentDynamic]           = useState<string | null>(null);
    const [currentArticulation, setCurrentArticulation] = useState<string | null>(null);
    const [currentFingering, setCurrentFingering]       = useState<number | null>(null);
    const [currentTimeSig, setCurrentTimeSig] = useState<string>('4/4');
    const [currentKeySig, setCurrentKeySig]   = useState<number>(0); // −7…+7

    const fileInputRef = useRef<HTMLInputElement>(null);

    // PHASE 6: History manager (stable ref – never triggers re-render)
    const history = useRef(new HistoryManager(100));

    // PHASE 6: Snapshot of stack sizes to drive button enabled state
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    /** Call after every history mutation to sync button state. */
    const syncHistory = useCallback(() => {
      setCanUndo(history.current.canUndo);
      setCanRedo(history.current.canRedo);
    }, []);

    // ==========================================================================
    // Note Operations
    // ==========================================================================

    const handleCanvasClick = useCallback((pitch: number, tick: number, trackId: string) => {
      // ── Pedal tool: single click inserts a 1-measure pedal ─────────────────
      if (editorTool === 'pedal') {
        const newScore = addPedalRange(score, trackId, tick, 1920);
        setScore(newScore);
        syncHistory();
        return;
      }

      // ── Triplet tool: add event to triplet selection ────────────────────────
      // (Actual group assignment happens when 3 events are selected via button)

      // ── Note/Chord tool ─────────────────────────────────────────────────────
      // Apply dot modifiers to duration
      let durTick: number = DURATION_VALUES[currentDuration];
      if (dotMode)       durTick = Math.round(durTick * 1.5);
      if (doubleDotMode) durTick = Math.round(durTick * 1.75);

      const eventType = restMode ? 'rest' as const : 'chord' as const;
      const cmd = new InsertEventCommand({
        start_tick: tick,
        dur_tick: durTick,
        velocity: 80,
        trackId,
        type: eventType,
        pitches: restMode ? [] : [pitch],
        voice: currentVoice,
      });
      const newScore = history.current.execute(cmd, score);

      // Apply pending accidental to the newly inserted pitch
      if (currentAccidental && currentAccidental !== 'none') {
        // Find the newly inserted event
        const latestEv = newScore.tracks
          .find(t => t.id === trackId)
          ?.events?.find(e => e.start_tick === tick && e.voice === currentVoice && e.type === 'chord');
        if (latestEv) {
          const accCmd = new SetAccidentalCommand(latestEv.id, pitch, currentAccidental);
          const accScore = history.current.execute(accCmd, newScore);
          setScore(accScore);
          syncHistory();
          return;
        }
      }

      setScore(newScore);
      setSelectedNoteId(null);
      setSelectedPitch(null);
      syncHistory();
    }, [score, currentDuration, currentTrack, currentVoice, chordMode, currentAccidental, editorTool, restMode, dotMode, doubleDotMode, syncHistory]);

    const handleNoteClick = useCallback((noteId: string, pitch: number, tick: number) => {
      // Tie tool: first click sets anchor, second click completes tie
      if (editorTool === 'tie') {
        if (!tieFirstRef.current) {
          tieFirstRef.current = { eventId: noteId, pitch };
          setSelectedNoteId(noteId);
          setSelectedPitch(pitch);
        } else {
          const { eventId: fromId, pitch: fromPitch } = tieFirstRef.current;
          if (fromPitch !== pitch) {
            alert(`Tie: pitch mismatch (${fromPitch} → ${pitch}). Ties must connect identical pitches.`);
          } else if (fromId !== noteId) {
            const { addTie } = require('@/lib/editor_ops');
            const newScore = addTie(score, fromId, noteId, pitch);
            setScore(newScore);
            syncHistory();
          }
          tieFirstRef.current = null;
          setSelectedNoteId(null);
          setSelectedPitch(null);
        }
        return;
      }

      // Normal select
      setSelectedNoteId(noteId);
      setSelectedPitch(pitch);

      // Apply accidental if one is active
      if (currentAccidental && currentAccidental !== 'none') {
        const cmd = new SetAccidentalCommand(noteId, pitch, currentAccidental);
        const newScore = history.current.execute(cmd, score);
        setScore(newScore);
        syncHistory();
      }
    }, [score, editorTool, currentAccidental, syncHistory]);

    const handleDeleteNote = useCallback(() => {
      if (!selectedNoteId) return;

      // Check if it's a v1.1 event
      const isEvent = score.tracks.some(t => (t.events ?? []).some(e => e.id === selectedNoteId));

      let newScore: XPSHScore;
      if (isEvent) {
        const cmd = new DeleteEventCommand(selectedNoteId);
        newScore = history.current.execute(cmd, score);
      } else {
        const cmd = new DeleteNoteCommand(selectedNoteId);
        newScore = history.current.execute(cmd, score);
      }

      setScore(newScore);
      setSelectedNoteId(null);
      setSelectedPitch(null);
      syncHistory();
    }, [score, selectedNoteId, syncHistory]);

    const handleClearAll = useCallback(() => {
      if (!confirm('Are you sure you want to clear all notes?')) return;

      const newScore = clearAllNotes(score);
      setScore(newScore);
      setSelectedNoteId(null);
      // Clear All is not individually undoable – reset history
      history.current.clear();
      syncHistory();
    }, [score, syncHistory]);

    // Load a sample "Ode to Joy" score
    const handleLoadSample = useCallback(() => {
      const Q = 480; // quarter tick
      const M = Q * 4; // 1 measure = 1920 ticks
      // --- Right hand: Ode to Joy melody in C ---
      // E4=64 E4 F4=65 G4=67 | G4 F4 E4 D4=62 | C4=60 C4 D4 E4 | E4 D4 D4 C4
      // repeat: E4 E4 F4 G4  | G4 F4 E4 D4    | C4 C4 D4 E4    | D4 C4 C4 (half)
      const RH: [number, number, number][] = [
        // measure 0
        [64,0*M+0*Q,Q],[64,0*M+1*Q,Q],[65,0*M+2*Q,Q],[67,0*M+3*Q,Q],
        // measure 1
        [67,1*M+0*Q,Q],[65,1*M+1*Q,Q],[64,1*M+2*Q,Q],[62,1*M+3*Q,Q],
        // measure 2
        [60,2*M+0*Q,Q],[60,2*M+1*Q,Q],[62,2*M+2*Q,Q],[64,2*M+3*Q,Q],
        // measure 3: E(q) D(q) D(half) — q q h fills the measure
        [64,3*M+0*Q,Q],[62,3*M+1*Q,Q],[62,3*M+2*Q,Q*2],
        // measure 4 (repeat first half)
        [64,4*M+0*Q,Q],[64,4*M+1*Q,Q],[65,4*M+2*Q,Q],[67,4*M+3*Q,Q],
        // measure 5
        [67,5*M+0*Q,Q],[65,5*M+1*Q,Q],[64,5*M+2*Q,Q],[62,5*M+3*Q,Q],
        // measure 6
        [60,6*M+0*Q,Q],[60,6*M+1*Q,Q],[62,6*M+2*Q,Q],[64,6*M+3*Q,Q],
        // measure 7: D(q) C(half) fills 3 beats
        [62,7*M+0*Q,Q],[60,7*M+1*Q,Q*2],
      ].filter(([, t, d]) => t >= 0 && d > 0 && t + d <= 8 * M) as [number,number,number][];

      // --- Left hand: C3(48) & G3(55) alternating quarter notes ---
      const LH_BASS: [number,number,number][] = [];
      const bassPat = [48, 55, 48, 55]; // C3, G3, C3, G3 per measure
      for (let m = 0; m < 8; m++) {
        for (let b = 0; b < 4; b++) {
          LH_BASS.push([bassPat[b], m * M + b * Q, Q]);
        }
      }

      let s = createEmptyScore('Ode to Joy');
      s = { ...s, tracks: s.tracks.map(tr => {
        if (tr.id === 'track_rh') {
          return { ...tr, events: RH.map(([p, t, d]) => ({
            id: newId('ev'), start_tick: t, dur_tick: d,
            voice: 1 as const, type: 'chord' as const, pitches: [p], velocity: 82
          })) };
        }
        if (tr.id === 'track_lh') {
          return { ...tr, events: LH_BASS.map(([p, t, d]) => ({
            id: newId('ev'), start_tick: t, dur_tick: d,
            voice: 1 as const, type: 'chord' as const, pitches: [p], velocity: 65
          })) };
        }
        return tr;
      })};
      setScore(s);
      setTitle('Ode to Joy');
      setSelectedNoteId(null);
      history.current.clear();
      syncHistory();
    }, [syncHistory]);

    // PHASE 6: Undo / Redo handlers
    const handleUndo = useCallback(() => {
      const prev = history.current.undo(score);
      if (prev !== null) {
        setScore(prev);
        setSelectedNoteId(null);
        syncHistory();
      }
    }, [score, syncHistory]);

    const handleRedo = useCallback(() => {
      const next = history.current.redo(score);
      if (next !== null) {
        setScore(next);
        setSelectedNoteId(null);
        syncHistory();
      }
    }, [score, syncHistory]);

    // ==========================================================================
    // Keyboard Shortcuts
    // ==========================================================================

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // PHASE 6: Ctrl+Z = Undo, Ctrl+Y = Redo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          handleRedo();
          return;
        }

        // Delete key
        if (e.key === 'Delete' || e.key === 'Backspace') {
          handleDeleteNote();
        }

        // Escape key - deselect
        if (e.key === 'Escape') {
          setSelectedNoteId(null);
        }

        // Number keys - duration
        if (e.key === '1') setCurrentDuration('quarter');
        if (e.key === '2') setCurrentDuration('half');
        if (e.key === '3') setCurrentDuration('whole');
        if (e.key === '4') setCurrentDuration('eighth');
        if (e.key === '5') setCurrentDuration('sixteenth');

        // R/L keys - track
        if (e.key === 'r' || e.key === 'R') setCurrentTrack('track_rh');
        if (e.key === 'l' || e.key === 'L') setCurrentTrack('track_lh');

        // Phase 8 shortcuts
        if (e.key === 'c' || e.key === 'C') setChordMode(m => !m);
        if (e.key === 'v' || e.key === 'V') setCurrentVoice(v => v === 1 ? 2 : 1);
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDeleteNote, handleUndo, handleRedo]);

    // ==========================================================================
    // File Operations
    // ==========================================================================

    const handleExport = useCallback(() => {
      downloadXpsh(score);
    }, [score]);

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const loadedScore = await loadXpshFile(file);
        
        // Validate XPSH format
        const validationResult = validateXpsh(loadedScore);
        if (!validationResult.valid) {
          const errorMessage = formatValidationErrors(validationResult);
          alert(`Invalid XPSH file:\n\n${errorMessage}`);
          return;
        }
        
        setScore(loadedScore);
        setTitle(loadedScore.metadata.title);
        setSelectedNoteId(null);
      } catch (error) {
        alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, []);

    const handleTitleChange = useCallback((newTitle: string) => {
      setTitle(newTitle);
      setScore(updateMetadata(score, { title: newTitle }));
    }, [score]);

    // ==========================================================================
    // Helpers
    // ==========================================================================

    const pitchName = (midi: number | null): string => {
      if (midi === null) return '—';
      const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
      return names[midi % 12] + Math.floor(midi / 12 - 1);
    };

    const durationLabel: Record<DurationType, string> = {
      whole: 'Tròn', half: 'Trắng', quarter: 'Đen', eighth: 'Móc Đơn', sixteenth: 'Móc Kép', thirtysecond: 'Móc Ba'
    };

    const durationSymbol: Record<DurationType, string> = {
      whole: '𝅝', half: '𝅗𝅥', quarter: '♩', eighth: '♪', sixteenth: '♬', thirtysecond: '𝅘𝅥𝅯'
    };

    // ==========================================================================
    // Render
    // ==========================================================================

    return (
      <div style={s.root}>

        {/* ── TOP HEADER ──────────────────────────────────────────────────── */}
        <header style={s.header}>

          {/* Logo + file name */}
          <div style={s.hLogo}>
            <div style={s.logoIcon}>♪</div>
            <div>
              <div style={s.logoTitle}>
                <input
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  style={s.titleInline}
                />
              </div>
              <div style={s.logoSub}>XPSH Piano Editor · {countEvents(score)} events</div>
            </div>
          </div>

          {/* Center: durations + playback + tempo */}
          <div style={s.hCenter}>
            {/* Duration pill group */}
            <div style={s.pillGroup}>
              {(['whole','half','quarter','eighth','sixteenth'] as DurationType[]).map(d => (
                <button key={d} onClick={() => setCurrentDuration(d)}
                  title={`${durationLabel[d]} (key ${['whole','half','quarter','eighth','sixteenth'].indexOf(d)+1})`}
                  style={{ ...s.pillBtn, ...(currentDuration === d ? s.pillBtnActive : {}) }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{durationSymbol[d]}</span>
                  <span style={{ fontSize: 10, marginTop: 1, opacity: .7 }}>{durationLabel[d]}</span>
                </button>
              ))}
              {/* Separator */}
              <div style={{ width: 1, height: 36, background: '#e2e8f0', margin: '0 4px' }} />
              {/* Dot/Tie/Rest quick buttons */}
              <button title="Toggle Tie tool" onClick={() => setEditorTool(t => t === 'tie' ? 'note' : 'tie')}
                style={{ ...s.pillBtn, ...(editorTool === 'tie' ? s.pillBtnActive : {}), minWidth: 36 }}>
                <span style={{ fontSize: 16 }}>⌒</span>
              </button>
            </div>

            {/* Playback controls */}
            <div style={s.playRow}>
              <button onClick={() => setShowPlayer(p => !p)}
                style={{ ...s.playBtn, background: showPlayer ? '#1d6fa8' : '#2b8cee', boxShadow: '0 4px 14px rgba(43,140,238,.4)' }}>
                <span style={{ fontSize: 26, marginLeft: 3 }}>▶</span>
              </button>
              <button style={s.playBtnSm} title="Stop">
                <span>■</span>
              </button>
              <button style={s.playBtnSm} title="Loop">
                <span style={{ fontSize: 14 }}>⟳</span>
              </button>
            </div>

            {/* Tempo */}
            <div style={s.tempoPill}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Tempo</span>
              <span style={{ color: '#2b8cee', fontWeight: 700, fontSize: 13 }}>120</span>
              <input type="range" min={40} max={240} defaultValue={120} style={s.tempoSlider} />
            </div>
          </div>

          {/* Right: undo/redo + file + settings */}
          <div style={s.hRight}>
            <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
              style={{ ...s.iconBtn, opacity: canUndo ? 1 : .35 }}>↩</button>
            <button onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
              style={{ ...s.iconBtn, opacity: canRedo ? 1 : .35 }}>↪</button>
            <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
            <button onClick={handleExport} style={s.iconBtn} title="Export .xpsh">💾</button>
            <button onClick={() => fileInputRef.current?.click()} style={s.iconBtn} title="Import">📂</button>
            <input ref={fileInputRef} type="file" accept=".xpsh,.json" onChange={handleImport} style={{ display: 'none' }} />
            <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
            <button onClick={handleLoadSample} style={{ ...s.iconBtn, color: '#16a34a', fontWeight: 700 }} title="Tải nhạc mẫu: Ode to Joy">🎵</button>
            <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
            <div style={s.avatarCircle}>A</div>
          </div>
        </header>

        {/* ── 3-COLUMN WORKSPACE ──────────────────────────────────────────── */}
        <div style={s.workspace}>

          {/* LEFT SIDEBAR – 5-Tab Tool Panel */}
          <aside style={s.leftSidebar}>

            {/* ── Tab Strip ── */}
            <div style={s.tabStrip}>
              {([
                ['notes',      '♩',  'Nốt',      '#3b82f6'],
                ['expression', '𝆑',  'Sắc Thái', '#f97316'],
                ['piano',      '𝆮',  'Piano',    '#7c3aed'],
                ['structure',  '𝄞',  'Cấu Trúc', '#059669'],
                ['advanced',   '⚙',  'Nâng Cao', '#6b7280'],
              ] as [string,string,string,string][]).map(([tab,icon,label,color]) => {
                const active = sideTab === tab;
                return (
                  <button key={tab} onClick={() => setSideTab(tab as typeof sideTab)}
                    title={label}
                    style={{ flex:1, border:'none', background: active ? color : 'transparent',
                      color: active ? '#fff' : '#94a3b8', cursor:'pointer',
                      padding:'7px 2px', borderRadius:7, transition:'all .15s',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                      fontSize:10, fontWeight:700 }}>
                    <span style={{ fontSize:14, lineHeight:1 }}>{icon}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                TAB 1 — NOTES  */}
            {sideTab === 'notes' && (
              <div style={s.sideScroll}>

                {/* Duration */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#3b82f6' }} />
                    <span style={s.catLabel}>Độ Dài Nốt</span>
                  </div>
                  {(['whole','half','quarter','eighth','sixteenth','thirtysecond'] as DurationType[]).map(d => (
                    <button key={d} onClick={() => setCurrentDuration(d)}
                      style={{ ...s.block, ...s.blockBlue, ...(currentDuration === d ? s.blockActiveBlue : {}),
                        justifyContent:'space-between' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:16, lineHeight:1 }}>{durationSymbol[d]}</span>
                        <span>{durationLabel[d]}</span>
                      </span>
                      {currentDuration === d && <span style={s.checkBadge}>✓</span>}
                    </button>
                  ))}

                  {/* Dot / Rest modifiers */}
                  <div style={{ display:'flex', gap:5, marginTop:8 }}>
                    <button onClick={() => { setDotMode(v=>!v); setDoubleDotMode(false); }}
                      title="Dấu Chấm (+50%)"
                      style={{ ...s.modBtn, ...(dotMode ? s.modBtnOn : {}) }}>
                      <span style={{ fontSize:14 }}>♩</span><span style={{ fontSize:10 }}>·</span>
                      <span style={{ fontSize:10, marginLeft:2 }}>Chấm</span>
                    </button>
                    <button onClick={() => { setDoubleDotMode(v=>!v); setDotMode(false); }}
                      title="2 Dấu Chấm (+75%)"
                      style={{ ...s.modBtn, ...(doubleDotMode ? s.modBtnOn : {}) }}>
                      <span style={{ fontSize:14 }}>♩</span><span style={{ fontSize:9 }}>··</span>
                      <span style={{ fontSize:10, marginLeft:2 }}>2 Chấm</span>
                    </button>
                    <button onClick={() => setRestMode(v=>!v)}
                      title="Dấu Nghỉ"
                      style={{ ...s.modBtn, ...(restMode ? s.modBtnOn : {}) }}>
                      <span style={{ fontSize:15, fontFamily:'serif' }}>𝄽</span>
                      <span style={{ fontSize:10, marginLeft:2 }}>Nghỉ</span>
                    </button>
                  </div>
                </div>

                {/* Tools */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#3b82f6' }} />
                    <span style={s.catLabel}>Công Cụ</span>
                  </div>
                  <button onClick={() => setEditorTool(t => t==='tie' ? 'note' : 'tie')}
                    style={{ ...s.block, ...s.blockBlue, ...(editorTool==='tie' ? s.blockActiveBlue : {}), justifyContent:'space-between' }}>
                    <span>⌒  Tie (nối)</span>
                    {editorTool==='tie' && <span style={s.checkBadge}>✓</span>}
                  </button>
                  <button onClick={() => setChordMode(m=>!m)}
                    style={{ ...s.block, ...s.blockBlue, ...(chordMode ? s.blockActiveBlue : {}), justifyContent:'space-between' }}>
                    <span>🎵  Hợp Âm</span>
                    <span style={{ ...s.togglePill, ...(chordMode ? s.toggleOn : s.toggleOff) }}>{chordMode?'ON':'OFF'}</span>
                  </button>
                  <button onClick={() => setEditorTool(t => t==='triplet' ? 'note' : 'triplet')}
                    style={{ ...s.block, ...s.blockBlue, ...(editorTool==='triplet' ? s.blockActiveBlue : {}), justifyContent:'space-between' }}>
                    <span>3  Nhóm Triplet</span>
                    {editorTool==='triplet' && <span style={s.checkBadge}>✓</span>}
                  </button>
                  {editorTool === 'triplet' && selectedNoteId && (
                    <button onClick={() => {
                      tripletSelectionRef.current = [...tripletSelectionRef.current, selectedNoteId!];
                      if (tripletSelectionRef.current.length === 3) {
                        setScore(applyTripletGroup(score, tripletSelectionRef.current));
                        tripletSelectionRef.current = [];
                        setSelectedNoteId(null);
                        syncHistory();
                      }
                    }} style={{ ...s.block, background:'#f59e0b', color:'#fff', border:'none', borderRadius:10,
                      cursor:'pointer', fontWeight:600, fontSize:13, padding:'10px 14px',
                      display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                      <span>Thêm vào nhóm</span>
                      <span style={s.checkBadge}>{tripletSelectionRef.current.length}/3</span>
                    </button>
                  )}
                </div>

                {/* Track + Voice */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#3b82f6' }} />
                    <span style={s.catLabel}>Tay &amp; Bè</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => setCurrentTrack('track_rh')}
                      style={{ ...s.halfBlock, ...s.blockBlue, ...(currentTrack==='track_rh' ? s.blockActiveBlue : {}) }}>
                      🎹 Tay Phải
                    </button>
                    <button onClick={() => setCurrentTrack('track_lh')}
                      style={{ ...s.halfBlock, ...s.blockBlue, ...(currentTrack==='track_lh' ? s.blockActiveBlue : {}) }}>
                      🎵 Tay Trái
                    </button>
                  </div>
                  <div style={{ display:'flex', gap:6, marginTop:6 }}>
                    <button onClick={() => setCurrentVoice(1)}
                      style={{ ...s.halfBlock, ...s.blockBlue, ...(currentVoice===1 ? s.blockActiveBlue : {}) }}>
                      ● Voice 1
                    </button>
                    <button onClick={() => setCurrentVoice(2)}
                      style={{ ...s.halfBlock, ...s.blockBlue, ...(currentVoice===2 ? s.blockActiveBlue : {}) }}>
                      ○ Voice 2
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 2 — BIỂU CẢM / EXPRESSION  */}
            {sideTab === 'expression' && (
              <div style={s.sideScroll}>

                {/* Accidentals */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#f97316' }} />
                    <span style={s.catLabel}>Dấu Hoá</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {([['sharp','♯'],['flat','♭'],['natural','♮'],['doubleSharp','𝄪'],['doubleFlat','𝄫'],['none','—']] as [AccidentalType,string][]).map(([acc,sym]) => (
                      <button key={acc}
                        onClick={() => setCurrentAccidental(prev => prev===acc ? null : acc as AccidentalType)}
                        style={{ ...s.block, ...s.blockOrange, ...(currentAccidental===acc ? s.blockActiveOrange : {}),
                          justifyContent:'center', fontFamily:'serif', fontSize:18, padding:'9px 0' }}>
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamics */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#22c55e' }} />
                    <span style={s.catLabel}>Cường Độ (Dynamics)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {(['pp','p','mp','mf','f','ff'] as string[]).map(dyn => (
                      <button key={dyn}
                        onClick={() => setCurrentDynamic(v => v===dyn ? null : dyn)}
                        style={{ ...s.block, ...s.blockGreen, ...(currentDynamic===dyn ? s.blockActiveGreen : {}),
                          padding:'10px 0', justifyContent:'center',
                          fontFamily:'serif', fontSize:16, fontStyle:'italic', fontWeight:700 }}>
                        {dyn}
                      </button>
                    ))}
                  </div>
                  {/* Hairpins */}
                  <div style={{ display:'flex', gap:5, marginTop:6 }}>
                    <button onClick={() => setCurrentDynamic(v => v==='cresc' ? null : 'cresc')}
                      style={{ ...s.halfBlock, ...s.blockGreen, ...(currentDynamic==='cresc' ? s.blockActiveGreen : {}),
                        justifyContent:'center', fontSize:13, fontStyle:'italic' }}>
                      &lt; Cresc.
                    </button>
                    <button onClick={() => setCurrentDynamic(v => v==='dim' ? null : 'dim')}
                      style={{ ...s.halfBlock, ...s.blockGreen, ...(currentDynamic==='dim' ? s.blockActiveGreen : {}),
                        justifyContent:'center', fontSize:13, fontStyle:'italic' }}>
                      Dim. &gt;
                    </button>
                  </div>
                </div>

                {/* Articulations */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#f97316' }} />
                    <span style={s.catLabel}>Kiểu Đánh (Articulation)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {([
                      ['staccato', '•',  'Staccato'],
                      ['tenuto',   '‾',  'Tenuto'],
                      ['accent',   '>',  'Accent'],
                      ['marcato',  '∧',  'Marcato'],
                      ['fermata',  '𝄐',  'Fermata'],
                    ] as [string,string,string][]).map(([art,sym,label]) => (
                      <button key={art}
                        onClick={() => setCurrentArticulation(v => v===art ? null : art)}
                        style={{ ...s.block, ...s.blockOrange, ...(currentArticulation===art ? s.blockActiveOrange : {}),
                          padding:'8px 0', justifyContent:'center', flexDirection:'column',
                          fontFamily:'serif', fontSize:19 }}>
                        <span>{sym}</span>
                        <span style={{ fontSize:9, fontFamily:'sans-serif', marginTop:2 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tempo */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#0ea5e9' }} />
                    <span style={s.catLabel}>Ký Hiệu Nhịp Độ</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                    {(['Allegro','Andante','Moderato','Adagio','Presto','Rit.','Accel.','A tempo'] as string[]).map(t => (
                      <button key={t} style={{ ...s.block, ...s.blockCyan, justifyContent:'center',
                        fontSize:12, fontStyle:'italic', padding:'8px 0' }}
                        onClick={() => console.log('Tempo mark:', t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 3 — PIANO TOOLS  */}
            {sideTab === 'piano' && (
              <div style={s.sideScroll}>

                {/* Pedal */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#7c3aed' }} />
                    <span style={s.catLabel}>Pedal</span>
                  </div>
                  <button onClick={() => setEditorTool(t => t==='pedal' ? 'note' : 'pedal')}
                    style={{ ...s.block, ...s.blockViolet, ...(editorTool==='pedal' ? s.blockActiveViolet : {}), justifyContent:'space-between' }}>
                    <span>𝆮  Sustain Pedal</span>
                    {editorTool==='pedal' && <span style={s.checkBadge}>✓</span>}
                  </button>
                  <button style={{ ...s.block, ...s.blockViolet, justifyContent:'space-between', opacity:.6 }}>
                    <span>𝆮  Ped. * (ký hiệu)</span>
                    <span style={{ fontSize:10, color:'#94a3b8' }}>sắp có</span>
                  </button>
                </div>

                {/* Slur */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#7c3aed' }} />
                    <span style={s.catLabel}>Slur &amp; Arpeggio</span>
                  </div>
                  <button style={{ ...s.block, ...s.blockViolet, justifyContent:'space-between' }}
                    onClick={() => setEditorTool(t => t==='tie' ? 'note' : 'tie')}>
                    <span>⌣  Slur (legato)</span>
                    {editorTool==='tie' && <span style={s.checkBadge}>✓</span>}
                  </button>
                  <button style={{ ...s.block, ...s.blockViolet, justifyContent:'space-between', opacity:.6 }}>
                    <span>≋  Arpeggio</span>
                    <span style={{ fontSize:10, color:'#94a3b8' }}>sắp có</span>
                  </button>
                </div>

                {/* Fingering */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#7c3aed' }} />
                    <span style={s.catLabel}>Ngón Tay</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:5 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n}
                        onClick={() => setCurrentFingering(v => v===n ? null : n)}
                        style={{ ...s.block, ...s.blockViolet, ...(currentFingering===n ? s.blockActiveViolet : {}),
                          padding:'10px 0', justifyContent:'center', fontSize:16, fontWeight:700 }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:6, padding:'0 2px' }}>
                    Chọn ngón → click nốt để gán
                  </div>
                </div>

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 4 — CẤU TRÚC / STRUCTURE  */}
            {sideTab === 'structure' && (
              <div style={s.sideScroll}>

                {/* Time Signature */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#059669' }} />
                    <span style={s.catLabel}>Nhịp (Time Signature)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {(['2/4','3/4','4/4','6/8','12/8','5/4'] as string[]).map(ts => (
                      <button key={ts}
                        onClick={() => setCurrentTimeSig(ts)}
                        style={{ ...s.block, ...s.blockGreen2, ...(currentTimeSig===ts ? s.blockActiveGreen2 : {}),
                          padding:'10px 0', justifyContent:'center', fontSize:14, fontWeight:700 }}>
                        {ts}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Key Signature */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#059669' }} />
                    <span style={s.catLabel}>Giọng (Key Signature)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {([
                      [0,'C'],[-1,'F'],[-2,'Bb'],[-3,'Eb'],[-4,'Ab'],[1,'G'],[2,'D'],[3,'A'],[4,'E'],
                    ] as [number,string][]).map(([k,name]) => (
                      <button key={k}
                        onClick={() => setCurrentKeySig(k)}
                        style={{ ...s.block, ...s.blockGreen2, ...(currentKeySig===k ? s.blockActiveGreen2 : {}),
                          padding:'8px 0', justifyContent:'center', flexDirection:'column', fontSize:12 }}>
                        <span style={{ fontWeight:700 }}>{name}</span>
                        <span style={{ fontSize:10, opacity:.7 }}>
                          {k===0?'0 ♯♭':k>0?`${k}♯`:`${Math.abs(k)}♭`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repeats */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#059669' }} />
                    <span style={s.catLabel}>Lặp Lại (Repeats)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                    {([
                      ['|:','Lặp đầu'],[':|','Lặp cuối'],['1.','Volta 1'],['2.','Volta 2'],
                      ['D.C.','Da Capo'],['D.S.','Dal Segno'],['𝄌','Coda'],['Fine','Fine'],
                    ] as [string,string][]).map(([sym,label]) => (
                      <button key={sym}
                        style={{ ...s.block, ...s.blockGreen2, padding:'8px 0',
                          justifyContent:'center', flexDirection:'column', fontSize:14, fontWeight:700 }}
                        onClick={() => console.log('Repeat:', sym)}>
                        <span style={{ fontFamily:'serif' }}>{sym}</span>
                        <span style={{ fontSize:10, fontWeight:400, marginTop:2 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                TAB 5 — NÂNG CAO / ADVANCED  */}
            {sideTab === 'advanced' && (
              <div style={s.sideScroll}>

                {/* Ornaments */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#6b7280' }} />
                    <span style={s.catLabel}>Trang Trí (Ornaments)</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {([
                      ['tr','Trill'],['~','Mordent'],['𝄑','Turn'],['𝄕','Inv. Turn'],['𝄦','Tremolo'],
                    ] as [string,string][]).map(([sym,label]) => (
                      <button key={label}
                        style={{ ...s.block, ...s.blockGray, padding:'9px 0',
                          justifyContent:'center', flexDirection:'column', fontFamily:'serif', fontSize:17 }}
                        onClick={() => console.log('Ornament:', label)}>
                        <span>{sym}</span>
                        <span style={{ fontSize:9, fontFamily:'sans-serif', marginTop:2 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Octave shifts */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#6b7280' }} />
                    <span style={s.catLabel}>Dịch Quãng Tám</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                    {(['8va','8vb','15ma','15mb'] as string[]).map(ov => (
                      <button key={ov}
                        style={{ ...s.block, ...s.blockGray, padding:'10px 0',
                          justifyContent:'center', fontSize:13, fontStyle:'italic', fontWeight:700 }}
                        onClick={() => console.log('Octave shift:', ov)}>
                        {ov}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grace notes */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#6b7280' }} />
                    <span style={s.catLabel}>Nốt Hoa (Grace Notes)</span>
                  </div>
                  <div style={{ display:'flex', gap:5 }}>
                    {([['Acciaccatura','♪̣'],['Appoggiatura','♩ ♪']] as [string,string][]).map(([type,sym]) => (
                      <button key={type}
                        style={{ ...s.halfBlock, ...s.blockGray, justifyContent:'center',
                          flexDirection:'column', gap:2, padding:'10px 0', fontSize:12 }}
                        onClick={() => console.log('Grace note:', type)}>
                        <span style={{ fontSize:16, fontFamily:'serif' }}>{sym}</span>
                        <span style={{ fontSize:9 }}>{type}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced tuplets */}
                <div style={s.category}>
                  <div style={s.catHeader}>
                    <span style={{ ...s.catDot, background:'#6b7280' }} />
                    <span style={s.catLabel}>Tuplet Nâng Cao</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                    {([['3','Triplet'],['5','Quintu.'],['6','Sextu.'],['7','Septu.'],['9','Nonu.']] as [string,string][]).map(([n,label]) => (
                      <button key={n}
                        style={{ ...s.block, ...s.blockGray, padding:'9px 0',
                          justifyContent:'center', flexDirection:'column', fontSize:16, fontWeight:700 }}
                        onClick={() => n==='3' ? setEditorTool(t=>t==='triplet'?'note':'triplet') : console.log('Tuplet:', n)}>
                        <span>{n}</span>
                        <span style={{ fontSize:9, fontWeight:400, marginTop:2 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </aside>

          {/* CENTER CANVAS */}
          <main style={s.canvasArea}>
            {/* Zoom controls */}
            <div style={s.zoomBar}>
              <button style={s.zoomBtn}>−</button>
              <span style={s.zoomLabel}>100%</span>
              <button style={s.zoomBtn}>+</button>
            </div>

            {/* Staff canvas */}
            <div style={s.staffWrapper}>
              <ScoreCanvas
                score={score}
                selectedNoteId={selectedNoteId}
                onNoteClick={handleNoteClick}
                onCanvasClick={handleCanvasClick}
                currentVoice={currentVoice}
                chordMode={chordMode}
                currentDuration={currentDuration}
                editorTool={editorTool}
              />
            </div>

            {/* Player (collapsible) */}
            {showPlayer && (
              <div style={s.playerStrip}>
                <XpshPlayer score={score} autoPlay={false} />
              </div>
            )}

            {/* Bottom timeline */}
            <div style={s.timeline}>
              <button style={s.tlBtn}>⏮</button>
              <div style={s.tlTrack}>
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} style={{ flex:1, borderRight: i < 7 ? '1px solid #e2e8f0' : 'none',
                    padding: '2px 4px', fontSize: 10, color: i === 1 ? '#2b8cee' : '#94a3b8',
                    fontWeight: 600, background: i === 1 ? 'rgba(43,140,238,.06)' : 'transparent' }}>
                    {i + 1}
                  </div>
                ))}
                {/* Cursor */}
                <div style={s.tlCursor} />
                {/* A/B loop markers */}
                <div style={{ ...s.tlMarker, left:'12.5%', background:'#f97316' }}>A</div>
                <div style={{ ...s.tlMarker, left:'25%',  background:'#f97316' }}>B</div>
              </div>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, flexShrink: 0 }}>00:00.0</span>
            </div>
          </main>

          {/* RIGHT SIDEBAR – Properties */}
          <aside style={s.rightSidebar}>
            <div style={s.propHeader}>Thuộc Tính Nốt</div>
            <div style={s.propBody}>
              {selectedNoteId ? (
                <>
                  {/* Note summary */}
                  <div style={s.noteCard}>
                    <div style={s.noteIconCircle}>{durationSymbol[currentDuration]}</div>
                    <div style={s.noteName}>Nốt {durationLabel[currentDuration]}</div>
                    <div style={s.notePitch}>Pitch: {pitchName(selectedPitch)}</div>
                  </div>

                  {/* Velocity */}
                  <div style={s.propSection}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 6 }}>
                      <span style={s.propLabel}>Lực Đánh</span>
                      <span style={{ ...s.propLabel, color:'#2b8cee' }}>80%</span>
                    </div>
                    <div style={s.velTrack}>
                      <div style={{ ...s.velFill, width:'80%' }} />
                    </div>
                    <input type="range" min={1} max={127} defaultValue={80} style={{ width:'100%', marginTop: 4, accentColor:'#2b8cee' }} />
                  </div>

                  {/* Duration adjust */}
                  <div style={s.propSection}>
                    <div style={s.propLabel}>Chỉnh Độ Dài</div>
                    <div style={{ display:'flex', gap: 8, marginTop: 8 }}>
                      <button style={s.adjBtn}>−50%</button>
                      <button style={s.adjBtn}>+50%</button>
                    </div>
                  </div>

                  {/* Articulation */}
                  <div style={s.propSection}>
                    <div style={s.propLabel}>Kiểu Đánh</div>
                    <div style={{ display:'flex', gap: 8, marginTop: 8 }}>
                      {['Stacc.','Tenuto','Accent'].map(art => (
                        <button key={art} style={s.artBtn}>{art}</button>
                      ))}
                    </div>
                  </div>

                  {/* Voice / accidental info */}
                  <div style={s.propSection}>
                    <div style={s.propLabel}>Voice</div>
                    <div style={{ ...s.propValue, color: currentVoice === 2 ? '#3b82f6' : '#1e293b' }}>
                      Voice {currentVoice} {currentVoice === 1 ? '●' : '○'}
                    </div>
                    {currentAccidental && (
                      <>
                        <div style={{ ...s.propLabel, marginTop: 8 }}>Accidental</div>
                        <div style={{ ...s.propValue, fontFamily:'serif', fontSize: 20 }}>
                          {currentAccidental === 'sharp' ? '♯' : currentAccidental === 'flat' ? '♭' :
                           currentAccidental === 'natural' ? '♮' : currentAccidental === 'doubleSharp' ? '𝄪' :
                           currentAccidental === 'doubleFlat' ? '𝄫' : '—'}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div style={s.emptyProps}>
                  <div style={s.emptyIcon}>♩</div>
                  <div style={s.emptyText}>Chọn một nốt để xem thuộc tính</div>
                </div>
              )}
            </div>

            {/* Bottom: delete + clear */}
            {selectedNoteId && (
              <div style={s.propFooter}>
                <button onClick={handleDeleteNote} style={s.deleteBtn}>
                  🗑️ Xoá Nốt
                </button>
                <button onClick={handleClearAll} style={s.clearBtn}>
                  Xoá Hết
                </button>
              </div>
            )}

            {/* Keyboard shortcut legend */}
            <div style={s.shortcutBox}>
              <div style={s.shortcutTitle}>Phím Tắt</div>
              {[['1–5','Độ dài (♩𝅗𝅥𝅝♪♬)'],['R / L','Tay Phải / Trái'],
                ['V','Đổi Bè 1↔2'],['C','Hợp Âm'],
                ['Del','Xoá nốt'],['Esc','Bỏ chọn'],
                ['Ctrl+Z / Y','Undo / Redo']].map(([k,v]) => (
                <div key={k} style={s.shortcutRow}>
                  <span style={s.kbd}>{k}</span>
                  <span style={s.shortcutDesc}>{v}</span>
                </div>
              ))}
            </div>
          </aside>

        </div>{/* end workspace */}

        {/* ── Beginner Guide Bar ──────────────────────────────────────────── */}
        <div style={{
          borderTop: '2px solid #e2e8f0', background: '#fff',
          flexShrink: 0, overflow: 'hidden',
          maxHeight: showGuide ? 200 : 36, transition: 'max-height .3s ease',
        }}>
          {/* Toggle header */}
          <div onClick={() => setShowGuide(g => !g)} style={{
            height: 36, display:'flex', alignItems:'center', gap: 8, padding:'0 16px',
            cursor:'pointer', userSelect:'none', background: showGuide ? '#f8fafc' : '#fff',
            borderBottom: showGuide ? '1px solid #e2e8f0' : 'none',
          }}>
            <span style={{ fontSize: 16 }}>📖</span>
            <span style={{ fontWeight: 700, fontSize: 13, color:'#1e293b' }}>Hướng Dẫn Sử Dụng</span>
            <span style={{ marginLeft:'auto', fontSize: 14, color:'#64748b' }}>{showGuide ? '▼' : '▲'}</span>
            <span style={{
              background: guideDone.size === GUIDE_STEPS.length ? '#22c55e' : '#2b8cee',
              color:'#fff', borderRadius: 12, padding:'2px 10px', fontSize: 11, fontWeight: 700, marginLeft: 4,
            }}>{guideDone.size}/{GUIDE_STEPS.length}</span>
          </div>
          {/* Steps scroll */}
          {showGuide && <div style={{ display:'flex', gap: 8, padding:'10px 16px', overflowX:'auto', overflowY:'hidden' }}>
            {GUIDE_STEPS.map((step, i) => {
              const done = guideDone.has(i);
              return (
                <div key={i} onClick={() => setGuideDone(s => { const n=new Set(s); n.has(i)?n.delete(i):n.add(i); return n; })}
                  style={{
                    flexShrink: 0, width: 180, padding:'10px 12px', borderRadius: 12, cursor:'pointer',
                    border: `2px solid ${done ? '#22c55e' : step.color}`,
                    background: done ? '#f0fdf4' : `${step.color}12`,
                    transition: 'all .2s',
                  }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{step.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700,
                      color: done ? '#16a34a' : '#1e293b',
                      background: done ? '#dcfce7' : '#e2e8f0',
                      borderRadius: 8, padding:'1px 7px' }}>Bước {i+1}</span>
                    {done && <span style={{ marginLeft:'auto', color:'#22c55e', fontWeight:900 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: done ? '#15803d' : '#1e293b', lineHeight: 1.4 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.35 }}>
                    {step.hint}
                  </div>
                </div>
              );
            })}
          </div>}
        </div>
      </div>
    );
  }

  // ============================================================================
  // Styles — "s" object
  // ============================================================================

  const s: Record<string, React.CSSProperties> = {
    // ── Root layout
    root: {
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#f1f5f9',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      color: '#1e293b',
    },
    // ── Header
    header: {
      height: 70,
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      gap: 16,
      flexShrink: 0,
      boxShadow: '0 1px 6px rgba(0,0,0,.06)',
      zIndex: 20,
    },
    hLogo: { display:'flex', alignItems:'center', gap: 12, width: 240, flexShrink: 0 },
    logoIcon: {
      width: 40, height: 40, background: 'linear-gradient(135deg,#2b8cee,#1d6fa8)',
      borderRadius: 12, display:'flex', alignItems:'center', justifyContent:'center',
      fontSize: 22, color: '#fff', boxShadow: '0 4px 12px rgba(43,140,238,.35)', flexShrink: 0,
    },
    logoTitle: { fontWeight: 700, fontSize: 15, color: '#0f172a' },
    logoSub: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
    titleInline: {
      fontWeight: 700, fontSize: 15, color: '#0f172a', border: 'none', outline: 'none',
      background: 'transparent', width: 160, padding: 0,
    },
    hCenter: { display:'flex', alignItems:'center', gap: 16, flex: 1, justifyContent:'center' },
    pillGroup: {
      display:'flex', alignItems:'center', gap: 2,
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14,
      padding: '4px 6px',
    },
    pillBtn: {
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      width: 52, height: 44, borderRadius: 10, border: 'none', background: 'transparent',
      cursor:'pointer', color: '#64748b', fontWeight: 600, transition: 'all .15s',
    },
    pillBtnActive: {
      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.12)',
      color: '#2b8cee',
    },
    playRow: { display:'flex', alignItems:'center', gap: 8 },
    playBtn: {
      width: 48, height: 48, borderRadius: '50%', border: 'none',
      display:'flex', alignItems:'center', justifyContent:'center',
      color: '#fff', cursor:'pointer', transition: 'all .15s',
    },
    playBtnSm: {
      width: 38, height: 38, borderRadius: '50%', border: '1.5px solid #e2e8f0',
      background: '#fff', display:'flex', alignItems:'center', justifyContent:'center',
      color: '#64748b', cursor:'pointer', fontSize: 16,
    },
    tempoPill: {
      display:'flex', alignItems:'center', gap: 8,
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: '6px 14px',
    },
    tempoSlider: { width: 80, accentColor: '#2b8cee', cursor:'pointer' },
    hRight: { display:'flex', alignItems:'center', gap: 8, width: 240, justifyContent:'flex-end', flexShrink: 0 },
    iconBtn: {
      width: 36, height: 36, border: '1px solid #e2e8f0', borderRadius: 8,
      background: '#fff', cursor:'pointer', fontSize: 15, display:'flex',
      alignItems:'center', justifyContent:'center', transition:'all .15s',
    },
    avatarCircle: {
      width: 36, height: 36, borderRadius: '50%',
      background: 'linear-gradient(135deg,#2b8cee,#1d6fa8)',
      color: '#fff', display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight: 700, fontSize: 14,
    },
    // ── Workspace
    workspace: { display:'flex', flex: 1, overflow:'hidden' },
    // ── Left sidebar
    leftSidebar: {
      width: 260, flexShrink: 0, background:'#fff',
      borderRight:'1px solid #e2e8f0', display:'flex', flexDirection:'column',
      boxShadow: '4px 0 20px rgba(0,0,0,.05)',
    },
    sideSearch: {
      padding: '12px 14px', borderBottom:'1px solid #f1f5f9',
      display:'flex', alignItems:'center', gap: 8,
    },
    searchIcon: { fontSize: 14 },
    searchInput: {
      flex:1, border:'1px solid #e2e8f0', borderRadius: 8, padding:'6px 10px',
      fontSize: 13, color:'#374151', outline:'none', background:'#f8fafc',
    },
    sideScroll: { flex:1, overflowY:'auto', padding: '12px 12px 20px' },
    category: { marginBottom: 20 },
    catHeader: { display:'flex', alignItems:'center', gap: 8, marginBottom: 10 },
    catDot: { width: 10, height: 10, borderRadius:'50%', flexShrink: 0 },
    catLabel: { fontSize: 11, fontWeight: 700, color:'#64748b', letterSpacing: 1, textTransform:'uppercase' },
    block: {
      width:'100%', display:'flex', alignItems:'center', gap: 10,
      padding:'10px 14px', borderRadius: 10, border:'none', cursor:'pointer',
      fontWeight: 600, fontSize: 13, marginBottom: 6, transition:'all .15s',
      boxSizing:'border-box' as const,
    },
    blockBlue: { background:'rgba(59,130,246,.14)', color:'#2563eb' },
    blockActiveBlue: { background:'#3b82f6', color:'#fff', boxShadow:'0 2px 8px rgba(59,130,246,.4)' },
    blockPurple: { background:'rgba(139,92,246,.14)', color:'#7c3aed' },
    blockActivePurple: { background:'#8b5cf6', color:'#fff', boxShadow:'0 2px 8px rgba(139,92,246,.4)' },
    blockOrange: { background:'rgba(249,115,22,.14)', color:'#ea580c' },
    blockActiveOrange: { background:'#f97316', color:'#fff', boxShadow:'0 2px 8px rgba(249,115,22,.4)' },
    // Green (dynamics)
    blockGreen: { background:'rgba(34,197,94,.14)', color:'#15803d' },
    blockActiveGreen: { background:'#22c55e', color:'#fff', boxShadow:'0 2px 8px rgba(34,197,94,.4)' },
    // Teal-green (structure)
    blockGreen2: { background:'rgba(5,150,105,.13)', color:'#047857' },
    blockActiveGreen2: { background:'#059669', color:'#fff', boxShadow:'0 2px 8px rgba(5,150,105,.4)' },
    // Violet (piano tools)
    blockViolet: { background:'rgba(124,58,237,.14)', color:'#7c3aed' },
    blockActiveViolet: { background:'#7c3aed', color:'#fff', boxShadow:'0 2px 8px rgba(124,58,237,.4)' },
    // Cyan (tempo markings)
    blockCyan: { background:'rgba(14,165,233,.13)', color:'#0284c7' },
    // Gray (advanced)
    blockGray: { background:'rgba(107,114,128,.12)', color:'#374151' },
    // Tab strip
    tabStrip: {
      display:'flex', gap:3, padding:'8px 8px 6px', background:'#f8fafc',
      borderBottom:'1px solid #e2e8f0', flexShrink:0,
    },
    // Modifier buttons (dot, rest)
    modBtn: {
      flex:1, display:'flex', alignItems:'center', justifyContent:'center',
      padding:'7px 0', borderRadius:8, border:'1px solid #e2e8f0',
      background:'#f8fafc', color:'#64748b', cursor:'pointer',
      fontSize:11, fontWeight:600, gap:1, transition:'all .15s',
    },
    modBtnOn: {
      background:'#1e293b', color:'#fff', border:'1px solid #1e293b',
      boxShadow:'0 2px 6px rgba(0,0,0,.25)',
    },
    checkBadge: {
      background:'rgba(255,255,255,.3)', borderRadius: 6,
      padding:'1px 6px', fontSize: 11, fontWeight: 700,
    },
    togglePill: { borderRadius: 20, padding:'2px 8px', fontSize: 11, fontWeight: 700 },
    toggleOn: { background:'rgba(255,255,255,.3)', color:'#fff' },
    toggleOff: { background:'rgba(0,0,0,.08)', color:'#7c3aed' },
    halfBlock: {
      flex:1, padding:'8px 0', borderRadius: 8, border:'none', cursor:'pointer',
      fontWeight: 600, fontSize: 12, textAlign:'center' as const,
    },
    // ── Canvas area
    canvasArea: {
      flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
      position:'relative', padding: 16, gap: 12,
    },
    zoomBar: {
      position:'absolute', top: 24, right: 24, zIndex: 10,
      display:'flex', alignItems:'center', background:'#fff',
      border:'1px solid #e2e8f0', borderRadius: 8, overflow:'hidden',
      boxShadow:'0 1px 4px rgba(0,0,0,.07)',
    },
    zoomBtn: {
      width: 32, height: 32, border:'none', background:'transparent',
      cursor:'pointer', fontSize: 18, color:'#64748b',
      display:'flex', alignItems:'center', justifyContent:'center',
    },
    zoomLabel: { padding:'0 10px', fontSize: 12, fontWeight: 700, color:'#475569' },
    staffWrapper: {
      flex:1, background:'#fff', borderRadius: 16,
      boxShadow:'0 1px 8px rgba(0,0,0,.08)', border:'1px solid rgba(226,232,240,.7)',
      overflow:'auto', position:'relative', padding: 24, minHeight: 0,
    },
    playerStrip: {
      background:'#fff', borderRadius: 12,
      boxShadow:'0 1px 6px rgba(0,0,0,.07)', border:'1px solid #e2e8f0',
      padding: '12px 20px',
    },
    timeline: {
      height: 52, background:'#fff', borderRadius: 12,
      border:'1px solid #e2e8f0', display:'flex', alignItems:'center',
      padding:'0 12px', gap: 10, flexShrink: 0,
      boxShadow:'0 1px 4px rgba(0,0,0,.05)',
    },
    tlBtn: {
      width: 28, height: 28, border:'1px solid #e2e8f0', borderRadius: 6,
      background:'#f8fafc', cursor:'pointer', fontSize: 13, display:'flex',
      alignItems:'center', justifyContent:'center', flexShrink: 0,
    },
    tlTrack: {
      flex:1, height: 36, background:'#f8fafc', borderRadius: 8,
      border:'1px solid #f1f5f9', display:'flex', position:'relative', overflow:'hidden',
    },
    tlCursor: {
      position:'absolute', top: 0, bottom: 0, left:'16.5%', width: 2,
      background:'#2b8cee', zIndex: 5,
    },
    tlMarker: {
      position:'absolute', top: 0, width: 2, bottom: 0, zIndex: 6,
      display:'flex', alignItems:'flex-start',
      fontSize: 8, fontWeight: 700, color:'#fff',
      paddingLeft: 2,
    },
    // ── Right sidebar
    rightSidebar: {
      width: 260, flexShrink: 0, background:'#fff',
      borderLeft:'1px solid #e2e8f0', display:'flex', flexDirection:'column',
      boxShadow:'-4px 0 20px rgba(0,0,0,.05)',
    },
    propHeader: {
      padding:'14px 18px', borderBottom:'1px solid #f1f5f9',
      fontSize: 11, fontWeight: 700, letterSpacing: 1,
      textTransform:'uppercase' as const, color:'#64748b',
      background:'#fafbfc',
    },
    propBody: { flex:1, overflowY:'auto', padding: 18 },
    noteCard: {
      textAlign:'center', padding:'20px 0 12px',
      borderBottom:'1px solid #f1f5f9', marginBottom: 18,
    },
    noteIconCircle: {
      width: 60, height: 60, borderRadius:'50%',
      background:'rgba(43,140,238,.1)', margin:'0 auto 10px',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize: 28, color:'#2b8cee',
    },
    noteName: { fontWeight: 700, fontSize: 16, color:'#0f172a' },
    notePitch: { fontSize: 13, color:'#2b8cee', fontWeight: 600, marginTop: 4 },
    propSection: { marginBottom: 20 },
    propLabel: { fontSize: 11, fontWeight: 700, color:'#94a3b8', textTransform:'uppercase' as const, letterSpacing: .8 },
    propValue: { fontSize: 15, fontWeight: 600, marginTop: 4 },
    velTrack: { height: 6, background:'#f1f5f9', borderRadius: 99, overflow:'hidden' },
    velFill: { height:'100%', background:'linear-gradient(90deg,#2b8cee,#1d6fa8)', borderRadius: 99 },
    adjBtn: {
      flex:1, padding:'8px 0', border:'1px solid #e2e8f0', borderRadius: 8,
      background:'#f8fafc', cursor:'pointer', fontSize: 13, fontWeight: 600,
      color:'#475569', transition:'all .15s',
    },
    artBtn: {
      flex:1, padding:'8px 0', border:'1.5px solid #e2e8f0', borderRadius: 8,
      background:'#f8fafc', cursor:'pointer', fontSize: 12, fontWeight: 600,
      color:'#475569',
    },
    emptyProps: { textAlign:'center', padding:'60px 20px', color:'#cbd5e1' },
    emptyIcon: { fontSize: 48, marginBottom: 12, opacity: .4 },
    emptyText: { fontSize: 13, lineHeight: 1.5 },
    propFooter: {
      padding:'12px 16px', borderTop:'1px solid #f1f5f9',
      display:'flex', flexDirection:'column', gap: 8,
    },
    deleteBtn: {
      width:'100%', padding:'10px 0', background:'#fff0f0', border:'1.5px solid #fecaca',
      borderRadius: 8, color:'#dc2626', fontWeight: 700, fontSize: 13, cursor:'pointer',
    },
    clearBtn: {
      width:'100%', padding:'8px 0', background:'#f8fafc', border:'1px solid #e2e8f0',
      borderRadius: 8, color:'#64748b', fontWeight: 600, fontSize: 12, cursor:'pointer',
    },
    shortcutBox: {
      padding: '12px 16px 16px', borderTop:'1px solid #f1f5f9', background:'#fafbfc',
    },
    shortcutTitle: {
      fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:'uppercase' as const,
      color:'#94a3b8', marginBottom: 8,
    },
    shortcutRow: { display:'flex', alignItems:'center', gap: 8, marginBottom: 5 },
    kbd: {
      background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius: 4,
      padding:'1px 5px', fontSize: 10, fontWeight: 700, color:'#475569',
      fontFamily:'monospace', flexShrink: 0, whiteSpace:'nowrap' as const,
    },
    shortcutDesc: { fontSize: 11, color:'#64748b' },
  };
