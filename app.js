/**
 * Pixel Pomodoro · Material 3 Expressive Edition
 * 100% Personal & Offline Capable · Zero Telemetry · Zero External Signatures
 *
 * Includes:
 * 1. Drift-free Web Worker Timer Engine (with 4-session cycle & >=50% partial credit rule)
 * 2. Hierarchical Task & Project Manager with Automatic Live Focus Time Rollup
 * 3. Daily Streaks (>=15 min/day rule) & Interactive Monthly Calendar Heatmap
 * 4. Daily Focus Challenges & 40 Curiosities Reward Deck
 * 5. Built-in WebAudio Ambient Synthesizer (Warm Lo-Fi + Vinyl Crackle, Rain, Brown Noise, Alpha Drone) + 5 Synthesized Alarms
 * 6. Document Picture-in-Picture (PiP) Floating Mini-Timer
 * 7. Dynamic Material You Palettes & Ambient Particle Canvas
 */

(() => {
  'use strict';

  /* ========================================================================
     1. STORAGE KEYS & DEFAULT STATE
     ======================================================================== */
  const KEYS = {
    TIMER: 'pixel_pomo:timer_v1',
    SETTINGS: 'pixel_pomo:settings_v1',
    APPEARANCE: 'pixel_pomo:appearance_v1',
    TASKS: 'pixel_pomo:tasks_v1',
    LABELS: 'pixel_pomo:labels_v1',
    STATS: 'pixel_pomo:stats_v1',
    CHALLENGE: 'pixel_pomo:challenge_v1',
    QUOTE: 'pixel_pomo:quote_v1',
    CUSTOM_BG: 'pixel_pomo:custom_bg_v1',
  };

  const MODE_META = {
    focus: { label: 'Concentración', min: 5, max: 90, step: 5, defaultMin: 25 },
    short: { label: 'Descanso corto', min: 1, max: 30, step: 1, defaultMin: 5 },
    long:  { label: 'Descanso largo', min: 5, max: 45, step: 5, defaultMin: 15 },
  };

  const CYCLE_LENGTH = 4;
  const PARTIAL_CREDIT_RATIO = 0.5; // >=50% elapsed counts as completed session when stopped/switched
  const STREAK_MIN_SECONDS = 900;   // 15 minutes per day minimum for streak

  const CURIOSITIES_ES = [
    'El cerebro humano consume alrededor del 20% de la energía total del cuerpo a pesar de representar solo el 2% de su peso.',
    'La Técnica Pomodoro fue creada a finales de los años 80 por Francesco Cirillo usando un temporizador de cocina con forma de tomate.',
    'Tras una interrupción, el cerebro tarda un promedio de 23 minutos y 15 segundos en recuperar la concentración profunda.',
    'Escuchar ruido rosa o música instrumental suave reduce la fatiga cognitiva durante sesiones prolongadas de lectura o programación.',
    'El estado de flujo ("Flow"), descrito por Mihaly Csikszentmihalyi, ocurre cuando el desafío de una tarea equilibra exactamente tu habilidad.',
    'Tomar descansos breves cada 25–45 minutos consolida la memoria de trabajo en el hipocampo mucho mejor que estudiar sin pausas.',
    'La corteza prefrontal funciona por ciclos ultradianos de unos 90 minutos de máxima alerta seguidos de 20 minutos de recuperación.',
    'Escribir tus 3 prioridades del día antes de empezar reduce la ansiedad de decisión hasta en un 40%.',
    'El efecto Zeigarnik explica por qué recordamos mejor las tareas incompletas o interrumpidas que las que ya hemos terminado.',
    'Dividir un proyecto grande en subtareas de 25 minutos desactiva la resistencia de la amígdala que provoca la procrastinación.',
    'La luz natural por la mañana sincroniza el núcleo supraquiasmático y mejora la velocidad de reacción cognitiva durante la tarde.',
    'Un escritorio despejado reduce la competencia de estímulos visuales en la corteza visual, liberando recursos de atención selectiva.',
    'Beber un vaso de agua antes de una sesión de enfoque mejora la velocidad de procesamiento mental hasta en un 14%.',
    'Caminar 5 minutos durante tu descanso corto aumenta el flujo sanguíneo cerebral y estimula el pensamiento divergente.',
    'La multitarea en realidad no existe a nivel consciente: el cerebro alterna rápidamente entre contextos pagando un "impuesto de cambio".',
  ];

  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback, ...JSON.parse(raw) } : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  function loadArray(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* ignore quota errors */
    }
  }

  /* ========================================================================
     2. APPLICATION STATE
     ======================================================================== */
  const settings = loadJSON(KEYS.SETTINGS, {
    durations: { focus: 25, short: 5, long: 15 },
    autoStartBreak: false,
    autoStartFocus: false,
    notifications: false,
    alarmSound: 'chime',
    alarmVolume: 0.8,
    ambientPreset: 'lofi',
    ambientVolume: 0.4,
    autoAmbientOnFocus: false,
    customAudioUrl: '',
  });

  const appearance = loadJSON(KEYS.APPEARANCE, {
    theme: 'dark',
    palette: 'iris',
    dialStyle: 'ring',
    ambientParticles: 'motes',
    tasksCollapsed: false,
  });

  const timerState = loadJSON(KEYS.TIMER, {
    mode: 'focus',
    remaining: settings.durations.focus * 60,
    running: false,
    endsAt: null,
    cycle: 0,
    completed: { focus: 0, short: 0, long: 0 },
    lastBankedElapsed: 0,
    modeRemaining: {
      focus: settings.durations.focus * 60,
      short: settings.durations.short * 60,
      long: settings.durations.long * 60,
    },
  });

  if (!timerState.modeRemaining) {
    timerState.modeRemaining = {
      focus: settings.durations.focus * 60,
      short: settings.durations.short * 60,
      long: settings.durations.long * 60,
    };
  }

  let labels = loadArray(KEYS.LABELS, [
    { id: 'lbl-dev', name: 'Código', color: '#D0BCFF' },
    { id: 'lbl-study', name: 'Estudio', color: '#86D993' },
    { id: 'lbl-work', name: 'Proyecto', color: '#89CEFF' },
  ]);

  let tasks = loadArray(KEYS.TASKS, [
    {
      id: 'tsk-welcome',
      parentId: null,
      title: 'Explorar mi nuevo Pomodoro Material 3 Expressive',
      status: 'todo',
      priority: 'high',
      labelId: 'lbl-work',
      dueDate: '',
      actualSeconds: 0,
      createdAt: Date.now(),
    },
  ]);

  const statsState = loadJSON(KEYS.STATS, {
    days: {}, // { 'YYYY-MM-DD': { seconds: 0, sessions: 0 } }
    bestStreak: 0,
    activeTaskId: tasks[0]?.id || null,
  });

  const challengeState = loadJSON(KEYS.CHALLENGE, {
    goalHours: 2,
    goalMinutes: 0,
    completedTotal: 0,
    lastCompletedDay: '',
  });

  let userQuote = localStorage.getItem(KEYS.QUOTE) || '“Concéntrate en un paso a la vez.”';

  /* ========================================================================
     3. INLINE BLOB WEB WORKER (Drift-Free Timer Loop)
     ======================================================================== */
  function createTimerWorker() {
    const workerCode = `
      let timerId = null;
      let endsAt = null;
      let remaining = 0;

      function clearLoop() {
        if (timerId !== null) {
          clearInterval(timerId);
          timerId = null;
        }
      }

      function tick() {
        if (endsAt === null) return;
        const nextRem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        if (nextRem !== remaining) {
          remaining = nextRem;
          self.postMessage({ type: 'tick', remaining });
        }
        if (nextRem <= 0) {
          clearLoop();
          endsAt = null;
          self.postMessage({ type: 'completed' });
        }
      }

      self.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'start') {
          remaining = Math.max(0, Math.round(msg.remaining || 0));
          endsAt = typeof msg.endsAt === 'number' ? msg.endsAt : Date.now() + remaining * 1000;
          clearLoop();
          tick();
          timerId = setInterval(tick, 250);
        } else if (msg.type === 'pause' || msg.type === 'reset') {
          clearLoop();
          endsAt = null;
          remaining = Math.max(0, Math.round(msg.remaining || 0));
        }
      };
    `;
    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    } catch {
      return null;
    }
  }

  const worker = createTimerWorker();
  let fallbackInterval = null;

  if (worker) {
    worker.onmessage = (e) => {
      if (e.data?.type === 'tick') {
        onTimerTick(e.data.remaining);
      } else if (e.data?.type === 'completed') {
        onTimerCompleted();
      }
    };
  }

  function syncWorker() {
    if (worker) {
      if (timerState.running) {
        worker.postMessage({
          type: 'start',
          remaining: timerState.remaining,
          endsAt: timerState.endsAt,
        });
      } else {
        worker.postMessage({
          type: 'pause',
          remaining: timerState.remaining,
        });
      }
      return;
    }
    // Fallback if Worker is blocked
    if (fallbackInterval) clearInterval(fallbackInterval);
    if (timerState.running) {
      fallbackInterval = setInterval(() => {
        if (!timerState.endsAt) return;
        const next = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
        if (next !== timerState.remaining) onTimerTick(next);
        if (next <= 0) {
          clearInterval(fallbackInterval);
          onTimerCompleted();
        }
      }, 250);
    }
  }

  /* ========================================================================
     4. WEBAUDIO SYNTHESIZER (Lo-Fi + Vinyl Crackle, Rain, Brown Noise, Alarms)
     ======================================================================== */
  let audioCtx = null;
  let ambientNodes = null;
  let ambientPlaying = false;
  let customAudioEl = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function stopAmbientAudio() {
    ambientPlaying = false;
    if (customAudioEl) {
      customAudioEl.pause();
    }
    if (ambientNodes) {
      try {
        if (ambientNodes.interval) clearInterval(ambientNodes.interval);
        ambientNodes.sources.forEach((s) => {
          try { s.stop(); s.disconnect(); } catch {}
        });
        ambientNodes.masterGain.disconnect();
      } catch {}
      ambientNodes = null;
    }
    updateMusicUI();
  }

  function startAmbientAudio() {
    stopAmbientAudio();

    if (settings.customAudioUrl) {
      if (!customAudioEl) customAudioEl = new Audio();
      customAudioEl.src = settings.customAudioUrl;
      customAudioEl.loop = true;
      customAudioEl.volume = settings.ambientVolume;
      customAudioEl.play().then(() => {
        ambientPlaying = true;
        updateMusicUI();
      }).catch(() => {
        showSnackbar('No se pudo reproducir el enlace de audio personalizado.');
      });
      return;
    }

    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const masterGain = ctx.createGain();
    masterGain.gain.value = settings.ambientVolume * 0.35;
    masterGain.connect(ctx.destination);

    const sources = [];
    let interval = null;
    const preset = settings.ambientPreset;

    if (preset === 'lofi') {
      // Exact port of warm Lo-Fi triangle chord progression + vinyl crackle buffer
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1450;
      filter.connect(masterGain);

      const chords = [
        [48, 52, 55, 59], // Cmaj7
        [45, 48, 52, 55], // Am7
        [50, 53, 57, 60], // Dm7
        [43, 47, 50, 53], // G7
      ];
      let chordIdx = 0;

      const oscs = [0, 1, 2, 3].map((i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(chords[0][i]);
        g.gain.value = 0.16;
        osc.connect(g).connect(filter);
        osc.start();
        sources.push(osc);
        return osc;
      });

      interval = setInterval(() => {
        if (!audioCtx) return;
        chordIdx = (chordIdx + 1) % chords.length;
        const chord = chords[chordIdx];
        oscs.forEach((osc, i) => {
          osc.frequency.setTargetAtTime(midiToFreq(chord[i]), ctx.currentTime, 0.28);
        });
      }, 4000);

      // Subtle Vinyl Crackle noise buffer
      const bufSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        out[i] = (Math.random() * 2 - 1) * (Math.random() > 0.985 ? 0.15 : 0.012);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 3200;
      noise.connect(hp).connect(masterGain);
      noise.start();
      sources.push(noise);
    } else if (preset === 'rain' || preset === 'brown') {
      const bufSize = ctx.sampleRate * 3;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufSize; i++) {
        const white = Math.random() * 2 - 1;
        out[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = out[i];
        out[i] *= preset === 'brown' ? 1.8 : 1.1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = preset === 'brown' ? 420 : 1200;
      noise.connect(lp).connect(masterGain);
      noise.start();
      sources.push(noise);
    } else if (preset === 'binaural') {
      // Warm Alpha 10Hz harmonic pad
      const freqs = [216, 226, 324];
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.value = 0.22;
        osc.connect(g).connect(masterGain);
        osc.start();
        sources.push(osc);
      });
    }

    ambientNodes = { masterGain, sources, interval };
    ambientPlaying = true;
    updateMusicUI();
  }

  function playSynthesizedAlarm(type = settings.alarmSound) {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.max(0.05, settings.alarmVolume);

    const patterns = {
      chime:   { notes: [587.33, 783.99, 1046.5, 1174.66], gap: 0.16, dur: 0.55, wave: 'sine' },
      bell:    { notes: [523.25, 659.25, 783.99, 1046.5], gap: 0.22, dur: 0.75, wave: 'triangle' },
      piano:   { notes: [440, 554.37, 659.25, 880], gap: 0.14, dur: 0.6, wave: 'triangle' },
      digital: { notes: [880, 880, 1318.5], gap: 0.12, dur: 0.18, wave: 'square' },
      soft:    { notes: [392.0, 493.88, 587.33], gap: 0.28, dur: 0.85, wave: 'sine' },
    };

    const p = patterns[type] || patterns.chime;
    p.notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = p.wave;
      osc.frequency.setValueAtTime(freq, now + idx * p.gap);
      gain.gain.setValueAtTime(0.0001, now + idx * p.gap);
      gain.gain.exponentialRampToValueAtTime(vol * 0.35, now + idx * p.gap + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * p.gap + p.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * p.gap);
      osc.stop(now + idx * p.gap + p.dur + 0.05);
    });
  }

  /* ========================================================================
     5. CORE TIMER LOGIC (Focus Banking, 50% Rule, Cycles, Auto-Start)
     ======================================================================== */
  function getPlannedSeconds(mode = timerState.mode) {
    return (settings.durations[mode] || MODE_META[mode].defaultMin) * 60;
  }

  function getElapsedSeconds() {
    const planned = getPlannedSeconds(timerState.mode);
    return Math.max(0, planned - timerState.remaining);
  }

  function bankUnrecordedFocusSeconds(addSessionCount = false) {
    if (timerState.mode !== 'focus') return;
    const elapsed = getElapsedSeconds();
    const delta = Math.max(0, elapsed - (timerState.lastBankedElapsed || 0));
    timerState.lastBankedElapsed = elapsed;

    if (delta <= 0 && !addSessionCount) return;

    const key = todayKey();
    if (!statsState.days[key]) {
      statsState.days[key] = { seconds: 0, sessions: 0 };
    }
    statsState.days[key].seconds += delta;
    if (addSessionCount) {
      statsState.days[key].sessions += 1;
    }

    // Roll up onto active task
    if (delta > 0 && statsState.activeTaskId) {
      const task = tasks.find((t) => t.id === statsState.activeTaskId);
      if (task) {
        task.actualSeconds = (task.actualSeconds || 0) + delta;
        saveJSON(KEYS.TASKS, tasks);
      }
    }

    recalculateBestStreak();
    saveJSON(KEYS.STATS, statsState);
    checkDailyChallengeCompletion();
  }

  function onTimerTick(nextRemaining) {
    timerState.remaining = Math.max(0, nextRemaining);
    if (!timerState.modeRemaining) timerState.modeRemaining = {};
    timerState.modeRemaining[timerState.mode] = timerState.remaining;
    if (timerState.mode === 'focus' && timerState.running) {
      bankUnrecordedFocusSeconds(false);
    }
    saveJSON(KEYS.TIMER, timerState);
    renderTimerUI();
    syncPiPWindow();
  }

  function startTimer() {
    if (timerState.running) return;
    if (timerState.remaining <= 0) {
      timerState.remaining = getPlannedSeconds(timerState.mode);
      timerState.lastBankedElapsed = 0;
    }
    timerState.running = true;
    timerState.endsAt = Date.now() + timerState.remaining * 1000;
    saveJSON(KEYS.TIMER, timerState);
    syncWorker();

    if (settings.autoAmbientOnFocus && timerState.mode === 'focus' && !ambientPlaying) {
      startAmbientAudio();
    }
    renderTimerUI();
    syncPiPWindow();
  }

  function pauseTimer() {
    if (!timerState.running) return;
    if (timerState.endsAt) {
      timerState.remaining = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
    }
    if (!timerState.modeRemaining) timerState.modeRemaining = {};
    timerState.modeRemaining[timerState.mode] = timerState.remaining;
    timerState.running = false;
    timerState.endsAt = null;
    if (timerState.mode === 'focus') {
      bankUnrecordedFocusSeconds(false);
    }
    saveJSON(KEYS.TIMER, timerState);
    syncWorker();

    if (settings.autoAmbientOnFocus && ambientPlaying) {
      stopAmbientAudio();
    }
    renderTimerUI();
    syncPiPWindow();
  }

  function toggleTimer() {
    if (timerState.running) pauseTimer();
    else startTimer();
  }

  function resetTimer() {
    if (timerState.mode === 'focus') {
      bankUnrecordedFocusSeconds(false);
    }
    timerState.running = false;
    timerState.endsAt = null;
    timerState.remaining = getPlannedSeconds(timerState.mode);
    if (!timerState.modeRemaining) timerState.modeRemaining = {};
    timerState.modeRemaining[timerState.mode] = timerState.remaining;
    timerState.lastBankedElapsed = 0;
    saveJSON(KEYS.TIMER, timerState);
    syncWorker();
    renderTimerUI();
    syncPiPWindow();
  }

  function advanceAfterCompletion(countedAsFullSession) {
    const finishedMode = timerState.mode;

    if (countedAsFullSession) {
      timerState.completed[finishedMode] = (timerState.completed[finishedMode] || 0) + 1;
    }

    let nextMode = 'focus';
    if (finishedMode === 'focus') {
      if (countedAsFullSession) {
        const nextCycle = timerState.cycle + 1;
        if (nextCycle >= CYCLE_LENGTH) {
          timerState.cycle = 0;
          nextMode = 'long';
        } else {
          timerState.cycle = nextCycle;
          nextMode = 'short';
        }
      } else {
        nextMode = 'short';
      }
    } else {
      nextMode = 'focus';
    }

    if (!timerState.modeRemaining) timerState.modeRemaining = {};
    // Reset finished mode to full duration
    timerState.modeRemaining[finishedMode] = getPlannedSeconds(finishedMode);

    timerState.mode = nextMode;
    // Always start next mode from its full configured duration
    timerState.modeRemaining[nextMode] = getPlannedSeconds(nextMode);
    timerState.remaining = timerState.modeRemaining[nextMode];
    timerState.lastBankedElapsed = 0;
    timerState.running = false;
    timerState.endsAt = null;

    const shouldAuto =
      (nextMode === 'focus' && settings.autoStartFocus) ||
      (nextMode !== 'focus' && settings.autoStartBreak);

    saveJSON(KEYS.TIMER, timerState);
    syncWorker();

    if (shouldAuto) {
      startTimer();
    } else {
      if (settings.autoAmbientOnFocus && nextMode !== 'focus' && ambientPlaying) {
        stopAmbientAudio();
      }
      renderTimerUI();
      syncPiPWindow();
    }
  }

  function onTimerCompleted() {
    timerState.remaining = 0;
    if (timerState.mode === 'focus') {
      bankUnrecordedFocusSeconds(true);
    }
    playSynthesizedAlarm();
    sendBrowserNotification(timerState.mode);
    const finishedLabel = MODE_META[timerState.mode].label;
    showSnackbar(`¡${finishedLabel} completada!`);
    advanceAfterCompletion(true);
    renderTasksUI();
    renderStatsBadges();
  }

  function stopOrSkipSession() {
    const elapsed = getElapsedSeconds();
    const planned = getPlannedSeconds(timerState.mode);
    const ratio = planned > 0 ? elapsed / planned : 0;
    const countsAsSession = elapsed > 0 && ratio >= PARTIAL_CREDIT_RATIO;

    if (timerState.mode === 'focus') {
      bankUnrecordedFocusSeconds(countsAsSession);
    }

    if (countsAsSession) {
      showSnackbar('Sesión contabilizada (superaste el 50% del tiempo).');
    } else {
      showSnackbar('Saltando a la siguiente etapa...');
    }

    advanceAfterCompletion(countsAsSession);
    renderTasksUI();
    renderStatsBadges();
  }

  function switchMode(targetMode) {
    if (!MODE_META[targetMode] || targetMode === timerState.mode) return;
    const currentMode = timerState.mode;

    // Save whatever remaining time currentMode had
    if (timerState.endsAt) {
      timerState.remaining = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
    }
    if (!timerState.modeRemaining) timerState.modeRemaining = {};
    timerState.modeRemaining[currentMode] = timerState.remaining;

    if (currentMode === 'focus' && timerState.running) {
      bankUnrecordedFocusSeconds(false);
    }

    // Pause timer while switching tabs
    timerState.running = false;
    timerState.endsAt = null;

    // Switch to target mode and restore its remaining time
    timerState.mode = targetMode;
    const restored = timerState.modeRemaining[targetMode];
    timerState.remaining = typeof restored === 'number' && restored > 0 ? restored : getPlannedSeconds(targetMode);
    timerState.lastBankedElapsed = getElapsedSeconds();

    saveJSON(KEYS.TIMER, timerState);
    syncWorker();
    renderTimerUI();
    renderTasksUI();
    renderStatsBadges();
    syncPiPWindow();
  }

  function adjustRemainingSeconds(deltaSec) {
    const next = Math.max(60, Math.min(180 * 60, timerState.remaining + deltaSec));
    timerState.remaining = next;
    if (!timerState.modeRemaining) timerState.modeRemaining = {};
    timerState.modeRemaining[timerState.mode] = next;
    if (timerState.running) {
      timerState.endsAt = Date.now() + next * 1000;
    }
    saveJSON(KEYS.TIMER, timerState);
    syncWorker();
    renderTimerUI();
    syncPiPWindow();
  }

  function sendBrowserNotification(finishedMode) {
    if (!settings.notifications || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      const msg =
        finishedMode === 'focus'
          ? '¡Buen trabajo! Es hora de tomar un descanso.'
          : 'El descanso terminó. ¡Volvamos a concentrarnos!';
      try {
        new Notification('Pomodoro · ' + MODE_META[finishedMode].label, { body: msg });
      } catch {}
    }
  }

  /* ========================================================================
     6. STREAKS, STATS & DAILY CHALLENGE LOGIC
     ======================================================================== */
  function calculateCurrentStreak() {
    let streak = 0;
    const cursor = new Date();
    const todayStr = todayKey(cursor);
    const todaySec = statsState.days[todayStr]?.seconds || 0;

    // If today hasn't reached 15m yet, check starting from yesterday so streak isn't lost mid-day
    if (todaySec < STREAK_MIN_SECONDS) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (true) {
      const k = todayKey(cursor);
      const sec = statsState.days[k]?.seconds || 0;
      if (sec >= STREAK_MIN_SECONDS) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function recalculateBestStreak() {
    const cur = calculateCurrentStreak();
    if (cur > (statsState.bestStreak || 0)) {
      statsState.bestStreak = cur;
    }
    return cur;
  }

  function checkDailyChallengeCompletion() {
    const goalSec = challengeState.goalHours * 3600 + challengeState.goalMinutes * 60;
    if (goalSec <= 0) return;
    const key = todayKey();
    const todaySec = statsState.days[key]?.seconds || 0;
    if (todaySec >= goalSec && challengeState.lastCompletedDay !== key) {
      challengeState.lastCompletedDay = key;
      challengeState.completedTotal = (challengeState.completedTotal || 0) + 1;
      saveJSON(KEYS.CHALLENGE, challengeState);
      showRandomCuriosity();
      showSnackbar('🏆 ¡Meta diaria de concentración superada!');
    }
  }

  function formatDurationShort(totalSeconds) {
    const totalMin = Math.floor((totalSeconds || 0) / 60);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  /* ========================================================================
     7. HIERARCHICAL TASKS & ROLLUP ENGINE
     ======================================================================== */
  let currentTaskFilter = 'all';
  let currentTaskSearch = '';

  function getTaskRollupSeconds(taskId) {
    const direct = tasks.find((t) => t.id === taskId)?.actualSeconds || 0;
    const children = tasks.filter((t) => t.parentId === taskId);
    return children.reduce((acc, child) => acc + getTaskRollupSeconds(child.id), direct);
  }

  function createTask({ title, parentId = null, priority = 'medium', labelId = '', dueDate = '' }) {
    const clean = title.trim();
    if (!clean) return;
    const newTask = {
      id: 'tsk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      parentId,
      title: clean,
      status: 'todo',
      priority,
      labelId,
      dueDate,
      actualSeconds: 0,
      createdAt: Date.now(),
    };
    tasks.unshift(newTask);
    if (!statsState.activeTaskId) {
      statsState.activeTaskId = newTask.id;
      saveJSON(KEYS.STATS, statsState);
    }
    saveJSON(KEYS.TASKS, tasks);
    renderTasksUI();
    renderTimerUI();
  }

  function toggleTaskDone(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = task.status === 'done' ? 'todo' : 'done';
    saveJSON(KEYS.TASKS, tasks);
    renderTasksUI();
  }

  function deleteTaskBranch(taskId) {
    const toRemove = new Set([taskId]);
    let added = true;
    while (added) {
      added = false;
      for (const t of tasks) {
        if (t.parentId && toRemove.has(t.parentId) && !toRemove.has(t.id)) {
          toRemove.add(t.id);
          added = true;
        }
      }
    }
    tasks = tasks.filter((t) => !toRemove.has(t.id));
    if (toRemove.has(statsState.activeTaskId)) {
      statsState.activeTaskId = tasks.find((t) => t.status !== 'done')?.id || null;
      saveJSON(KEYS.STATS, statsState);
    }
    saveJSON(KEYS.TASKS, tasks);
    renderTasksUI();
    renderTimerUI();
  }

  /* ========================================================================
     8. DOCUMENT PICTURE-IN-PICTURE (PiP) MINI-TIMER (Material 3 Expressive)
     ======================================================================== */
  let pipWindow = null;

  async function togglePiP() {
    if (!('documentPictureInPicture' in window)) {
      showSnackbar('Tu navegador no soporta Document Picture-in-Picture (usa Chrome/Edge).');
      return;
    }
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      pipWindow = null;
      return;
    }

    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 340,
        height: 158,
      });

      const doc = pipWindow.document;
      doc.documentElement.lang = 'es';
      doc.documentElement.dataset.theme = appearance.theme;
      doc.documentElement.dataset.palette = appearance.palette;

      doc.head.innerHTML = `
        <meta charset="UTF-8" />
        <title>Pomodoro Mini</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@500;600;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,-50..200" rel="stylesheet" />
        <link rel="stylesheet" href="${location.origin}/styles.css" />
        <style>
          html, body {
            height: 100vh;
            width: 100vw;
            overflow: hidden;
            background: var(--md-sys-color-bg);
            color: var(--md-sys-color-on-surface);
            user-select: none;
          }
          .pip-card {
            position: relative;
            height: 100%;
            width: 100%;
            padding: 12px 16px 14px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background:
              radial-gradient(140px 140px at 12% 15%, var(--blob-a), transparent 70%),
              radial-gradient(140px 140px at 88% 85%, var(--blob-b), transparent 70%),
              var(--md-sys-color-surface-container-low);
          }
          .pip-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }
          .pip-mode-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 11px;
            border-radius: 999px;
            background: var(--md-sys-color-surface-container-high);
            color: var(--md-sys-color-on-surface);
            font-family: var(--font-display);
            font-size: 0.74rem;
            font-weight: 800;
            letter-spacing: 0.01em;
          }
          .pip-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--md-sys-color-primary);
            box-shadow: 0 0 8px var(--md-sys-color-primary);
          }
          .pip-dot.running {
            animation: pulseDot 1.5s infinite ease-in-out;
          }
          .pip-cycles {
            display: flex;
            align-items: center;
            gap: 5px;
          }
          .pip-c-dot {
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: var(--md-sys-color-surface-container-highest);
            transition: all 0.3s var(--spring-fast);
          }
          .pip-c-dot.completed {
            width: 15px;
            background: var(--md-sys-color-primary);
          }
          .pip-c-dot.current {
            background: var(--md-sys-color-tertiary);
            transform: scale(1.2);
          }
          .pip-main {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin: 2px 0;
          }
          .pip-time-col {
            display: flex;
            flex-direction: column;
            min-width: 0;
          }
          .pip-time {
            font-family: var(--font-display);
            font-size: 2.95rem;
            font-weight: 900;
            line-height: 0.96;
            letter-spacing: -0.04em;
            font-variant-numeric: tabular-nums;
            color: var(--md-sys-color-primary);
            text-shadow: 0 8px 24px color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent);
          }
          .pip-task {
            font-size: 0.73rem;
            font-weight: 600;
            color: var(--md-sys-color-on-surface-variant);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 165px;
            margin-top: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .pip-controls {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
          }
          .pip-icon-btn {
            width: 36px;
            height: 36px;
            border-radius: 13px;
            border: none;
            background: var(--md-sys-color-surface-container-high);
            color: var(--md-sys-color-on-surface-variant);
            display: grid;
            place-items: center;
            cursor: pointer;
            font-family: var(--font-display);
            font-weight: 800;
            font-size: 0.72rem;
            transition: all 0.25s var(--spring-fast);
          }
          .pip-icon-btn:hover {
            background: var(--md-sys-color-surface-container-highest);
            color: var(--md-sys-color-on-surface);
            border-radius: 50%;
            transform: scale(1.06);
          }
          .pip-icon-btn:active {
            transform: scale(0.92);
          }
          .pip-cta {
            height: 48px;
            min-width: 98px;
            padding: 0 16px;
            border-radius: 999px;
            border: none;
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-family: var(--font-display);
            font-weight: 800;
            font-size: 0.9rem;
            cursor: pointer;
            box-shadow: 0 8px 20px color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent);
            transition: all 0.35s var(--spring-fast);
          }
          .pip-cta:hover {
            transform: translateY(-1px) scale(1.03);
          }
          .pip-cta:active {
            transform: scale(0.95);
          }
          .pip-cta[data-running="true"] {
            border-radius: 16px;
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
          }
          .pip-progress-track {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 5px;
            background: var(--md-sys-color-surface-container-highest);
            overflow: hidden;
          }
          .pip-progress-fill {
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, var(--md-sys-color-primary), var(--md-sys-color-tertiary));
            border-radius: 0 999px 999px 0;
            transition: width 0.35s linear;
          }
        </style>
      `;

      doc.body.innerHTML = `
        <div class="pip-card">
          <div class="pip-top">
            <div class="pip-mode-pill">
              <span class="pip-dot" id="pip-dot"></span>
              <span class="ms-icon icon-xs-sym icon-filled" id="pip-mode-icon">timer</span>
              <span id="pip-mode">Concentración</span>
            </div>
            <div class="pip-cycles" id="pip-cycles" title="Ciclo de 4 pomodoros">
              <span class="pip-c-dot"></span>
              <span class="pip-c-dot"></span>
              <span class="pip-c-dot"></span>
              <span class="pip-c-dot"></span>
            </div>
          </div>

          <div class="pip-main">
            <div class="pip-time-col">
              <strong class="pip-time" id="pip-time">25:00</strong>
              <div class="pip-task" id="pip-task">
                <span class="ms-icon icon-xs-sym icon-filled" style="font-size:13px">track_changes</span>
                <span id="pip-task-text">Enfoque personal</span>
              </div>
            </div>

            <div class="pip-controls">
              <button class="pip-icon-btn" id="pip-plus1" type="button" title="Añadir 1 minuto">+1m</button>
              <button class="pip-cta" id="pip-toggle" type="button" data-running="false">
                <span class="ms-icon icon-sm icon-filled" id="pip-cta-icon">play_arrow</span>
                <span id="pip-cta-label">Iniciar</span>
              </button>
              <button class="pip-icon-btn" id="pip-skip" type="button" title="Saltar o terminar etapa">
                <span class="ms-icon icon-sm icon-filled">skip_next</span>
              </button>
            </div>
          </div>

          <div class="pip-progress-track">
            <div class="pip-progress-fill" id="pip-progress-fill" style="width: 100%"></div>
          </div>
        </div>
      `;

      doc.getElementById('pip-toggle').addEventListener('click', toggleTimer);
      doc.getElementById('pip-plus1').addEventListener('click', () => adjustRemainingSeconds(60));
      doc.getElementById('pip-skip').addEventListener('click', stopOrSkipSession);

      pipWindow.addEventListener('pagehide', () => {
        pipWindow = null;
      });

      syncPiPWindow();
    } catch {
      showSnackbar('No se pudo abrir la mini ventana flotante.');
    }
  }

  function syncPiPWindow() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    doc.documentElement.dataset.theme = appearance.theme;
    doc.documentElement.dataset.palette = appearance.palette;

    const mm = String(Math.floor(timerState.remaining / 60)).padStart(2, '0');
    const ss = String(timerState.remaining % 60).padStart(2, '0');

    const modeEl = doc.getElementById('pip-mode');
    const modeIconEl = doc.getElementById('pip-mode-icon');
    const dotEl = doc.getElementById('pip-dot');
    const timeEl = doc.getElementById('pip-time');
    const taskTextEl = doc.getElementById('pip-task-text');
    const btnEl = doc.getElementById('pip-toggle');
    const ctaIconEl = doc.getElementById('pip-cta-icon');
    const ctaLabelEl = doc.getElementById('pip-cta-label');
    const fillEl = doc.getElementById('pip-progress-fill');

    if (modeEl) modeEl.textContent = MODE_META[timerState.mode].label;
    if (modeIconEl) {
      modeIconEl.textContent =
        timerState.mode === 'focus' ? 'timer' : timerState.mode === 'short' ? 'coffee' : 'self_improvement';
    }
    if (dotEl) dotEl.classList.toggle('running', timerState.running);
    if (timeEl) timeEl.textContent = `${mm}:${ss}`;

    const activeTask = tasks.find((t) => t.id === statsState.activeTaskId);
    if (taskTextEl) {
      taskTextEl.textContent = activeTask ? activeTask.title : 'Sin tarea vinculada';
    }

    const planned = getPlannedSeconds(timerState.mode);
    if (btnEl && ctaIconEl && ctaLabelEl) {
      btnEl.dataset.running = String(timerState.running);
      if (timerState.running) {
        ctaIconEl.textContent = 'pause';
        ctaLabelEl.textContent = 'Pausar';
      } else {
        const isResuming = timerState.remaining < planned && timerState.remaining > 0;
        ctaIconEl.textContent = 'play_arrow';
        ctaLabelEl.textContent = isResuming ? 'Seguir' : 'Iniciar';
      }
    }

    doc.querySelectorAll('#pip-cycles .pip-c-dot').forEach((d, idx) => {
      d.classList.toggle('completed', idx < timerState.cycle);
      d.classList.toggle('current', timerState.mode === 'focus' && idx === timerState.cycle);
    });

    if (fillEl) {
      const pct = planned > 0 ? Math.max(0, Math.min(100, (timerState.remaining / planned) * 100)) : 100;
      fillEl.style.width = `${pct.toFixed(1)}%`;
    }
  }

  /* ========================================================================
     9. AMBIENT PARTICLE CANVAS (Motes, Stars, Bubbles)
     ======================================================================== */
  const canvas = document.getElementById('ambient-canvas');
  const ctx2d = canvas.getContext('2d');
  let particles = [];

  function initParticles() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const mode = appearance.ambientParticles;
    if (mode === 'off') {
      particles = [];
      return;
    }
    const count = mode === 'stars' ? 55 : 28;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: mode === 'bubbles' ? 4 + Math.random() * 10 : 1.2 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.28,
      vy: mode === 'bubbles' ? -(0.2 + Math.random() * 0.45) : (Math.random() - 0.5) * 0.25,
      alpha: 0.15 + Math.random() * 0.45,
    }));
  }

  function animateParticles() {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    if (appearance.ambientParticles !== 'off') {
      const style = getComputedStyle(document.documentElement);
      const primaryColor = style.getPropertyValue('--md-sys-color-primary').trim() || '#d0bcff';
      ctx2d.fillStyle = primaryColor;
      ctx2d.strokeStyle = primaryColor;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx2d.globalAlpha = p.alpha;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        if (appearance.ambientParticles === 'bubbles') {
          ctx2d.lineWidth = 1.2;
          ctx2d.stroke();
        } else {
          ctx2d.fill();
        }
      }
    }
    requestAnimationFrame(animateParticles);
  }

  window.addEventListener('resize', initParticles);

  /* ========================================================================
     10. DOM RENDERING & UI BINDINGS
     ======================================================================== */
  const RING_CIRCUMFERENCE = 2 * Math.PI * 144; // r = 144 -> ~904.778

  function updateGreeting() {
    const h = new Date().getHours();
    const text = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('greeting-text').textContent = text;
    document.getElementById('quote-text').textContent = userQuote;
  }

  function applyAppearanceUI() {
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.dataset.palette = appearance.palette;

    const dialWrapper = document.getElementById('dial-wrapper');
    dialWrapper.dataset.dialStyle = appearance.dialStyle;
    document.getElementById('dial-style-btn-text').textContent =
      appearance.dialStyle === 'ring' ? 'Vista: Anillo' : 'Vista: Pixel Gigante';

    const grid = document.getElementById('workspace-grid');
    grid.classList.toggle('tasks-collapsed', Boolean(appearance.tasksCollapsed));

    // Sync appearance modal buttons
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeChoice === appearance.theme);
    });
    document.querySelectorAll('[data-palette-choice]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.paletteChoice === appearance.palette);
    });
    document.querySelectorAll('[data-dial-choice]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.dialChoice === appearance.dialStyle);
    });
    document.querySelectorAll('[data-ambient-choice]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.ambientChoice === appearance.ambientParticles);
    });

    // Custom background image
    const bgData = localStorage.getItem(KEYS.CUSTOM_BG);
    const bgLayer = document.getElementById('custom-bg-layer');
    if (bgData) {
      bgLayer.style.backgroundImage = `url(${bgData})`;
      bgLayer.classList.add('has-bg');
    } else {
      bgLayer.style.backgroundImage = '';
      bgLayer.classList.remove('has-bg');
    }

    syncPiPWindow();
  }

  function renderTimerUI() {
    const mm = String(Math.floor(timerState.remaining / 60)).padStart(2, '0');
    const ss = String(timerState.remaining % 60).padStart(2, '0');

    document.getElementById('time-mm').textContent = mm;
    document.getElementById('time-ss').textContent = ss;

    const modeLabel = MODE_META[timerState.mode].label;
    document.title = `${mm}:${ss} · ${modeLabel}`;

    // Mode tabs & completed counters
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      const m = tab.dataset.mode;
      const isAct = m === timerState.mode;
      tab.classList.toggle('active', isAct);
      tab.setAttribute('aria-selected', String(isAct));
    });
    document.getElementById('count-focus').textContent = timerState.completed.focus || 0;
    document.getElementById('count-short').textContent = timerState.completed.short || 0;
    document.getElementById('count-long').textContent = timerState.completed.long || 0;

    // Subtitle & cycle stepper
    const stepNum = (timerState.cycle % CYCLE_LENGTH) + 1;
    document.getElementById('dial-subtitle-text').textContent =
      timerState.mode === 'focus'
        ? `Pomodoro ${stepNum} de ${CYCLE_LENGTH}`
        : MODE_META[timerState.mode].label;

    document.querySelectorAll('#cycle-dots .cycle-dot').forEach((dot, idx) => {
      dot.classList.toggle('completed', idx < timerState.cycle);
      dot.classList.toggle('current', timerState.mode === 'focus' && idx === timerState.cycle);
    });

    // Ring SVG progress arc & thumb position
    const planned = getPlannedSeconds(timerState.mode);
    const fraction = planned > 0 ? Math.max(0, Math.min(1, timerState.remaining / planned)) : 1;
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    const circle = document.getElementById('dial-progress-circle');
    circle.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    circle.style.strokeDashoffset = `${offset}`;

    const angle = fraction * 2 * Math.PI;
    const thumbX = 170 + 144 * Math.cos(angle);
    const thumbY = 170 + 144 * Math.sin(angle);
    const thumb = document.getElementById('dial-thumb');
    thumb.setAttribute('cx', thumbX.toFixed(2));
    thumb.setAttribute('cy', thumbY.toFixed(2));

    // Morphing Play/Pause CTA
    const ctaBtn = document.getElementById('btn-start-pause');
    const ctaLabel = document.getElementById('cta-label');
    const ctaIcon = document.getElementById('cta-icon');
    ctaBtn.dataset.running = String(timerState.running);
    document.getElementById('status-dot').classList.toggle('running', timerState.running);

    if (timerState.running) {
      ctaLabel.textContent = 'Pausar';
      ctaIcon.innerHTML = `<span class="ms-icon icon-lg icon-filled" aria-hidden="true">pause</span>`;
    } else {
      const isResuming = timerState.remaining < planned && timerState.remaining > 0;
      ctaLabel.textContent = isResuming ? 'Continuar' : 'Iniciar';
      ctaIcon.innerHTML = `<span class="ms-icon icon-lg icon-filled" aria-hidden="true">play_arrow</span>`;
    }

    // Active Task Banner
    const activeTask = tasks.find((t) => t.id === statsState.activeTaskId);
    const activeTitleEl = document.getElementById('active-task-title');
    const activeTimeEl = document.getElementById('active-task-live-time');
    const clearBtn = document.getElementById('btn-clear-active-task');

    if (activeTask) {
      activeTitleEl.textContent = activeTask.title;
      const rollupSec = getTaskRollupSeconds(activeTask.id);
      activeTimeEl.textContent = formatDurationShort(rollupSec);
      activeTimeEl.hidden = false;
      clearBtn.hidden = false;
    } else {
      activeTitleEl.textContent = 'Sin tarea activa · Toca para elegir una';
      activeTimeEl.hidden = true;
      clearBtn.hidden = true;
    }
  }

  function renderStatsBadges() {
    const streak = recalculateBestStreak();
    document.getElementById('streak-count').textContent = streak;

    const goalSec = challengeState.goalHours * 3600 + challengeState.goalMinutes * 60;
    const todaySec = statsState.days[todayKey()]?.seconds || 0;
    const pct = goalSec > 0 ? Math.min(100, Math.round((todaySec / goalSec) * 100)) : 0;
    document.getElementById('challenge-badge-text').textContent =
      pct >= 100 ? '¡Reto logrado!' : `Meta ${pct}%`;
  }

  function renderLabelSelects() {
    const select = document.getElementById('input-task-label');
    select.innerHTML = `<option value="">Sin etiqueta</option>` +
      labels.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');

    const listEl = document.getElementById('labels-list');
    if (listEl) {
      listEl.innerHTML = labels.map((l) => `
        <div class="label-row">
          <span style="display:flex;align-items:center;gap:8px;font-weight:700">
            <span style="width:14px;height:14px;border-radius:50%;background:${l.color}"></span>
            ${escapeHtml(l.name)}
          </span>
          <button type="button" class="task-btn-mini" data-del-label="${l.id}">Eliminar</button>
        </div>
      `).join('');
    }
  }

  function renderTasksUI() {
    const pendingCount = tasks.filter((t) => t.status !== 'done').length;
    document.getElementById('tasks-pending-badge').textContent = pendingCount;

    const todaySec = statsState.days[todayKey()]?.seconds || 0;
    document.getElementById('tasks-summary-text').textContent =
      `${pendingCount} pendientes · ${formatDurationShort(todaySec)} enfocados hoy`;

    const container = document.getElementById('task-tree-list');
    const search = currentTaskSearch.toLowerCase();

    const roots = tasks.filter((t) => !t.parentId);
    const filteredRoots = roots.filter((t) => {
      if (currentTaskFilter === 'todo' && t.status === 'done') return false;
      if (currentTaskFilter === 'done' && t.status !== 'done') return false;
      if (search && !t.title.toLowerCase().includes(search)) return false;
      return true;
    });

    if (filteredRoots.length === 0) {
      container.innerHTML = `<div class="empty-state">No hay tareas en esta vista. ¡Añade una arriba para registrar tu tiempo de enfoque!</div>`;
      return;
    }

    container.innerHTML = filteredRoots.map((root) => renderTaskNodeHTML(root)).join('');
  }

  function renderTaskNodeHTML(task) {
    const isFocused = statsState.activeTaskId === task.id;
    const isDone = task.status === 'done';
    const label = labels.find((l) => l.id === task.labelId);
    const rollupSec = getTaskRollupSeconds(task.id);
    const children = tasks.filter((t) => t.parentId === task.id);

    const prioLabel =
      task.priority === 'high' ? 'Alta' : task.priority === 'low' ? 'Baja' : 'Media';
    const prioClass =
      task.priority === 'high' ? 'prio-high' : task.priority === 'low' ? 'prio-low' : '';

    return `
      <div class="task-item ${isFocused ? 'active-focus' : ''} ${isDone ? 'done' : ''}" data-task-id="${task.id}">
        <div class="task-main-line">
          <input type="checkbox" class="task-check" data-toggle-task="${task.id}" ${isDone ? 'checked' : ''} aria-label="Completar tarea" />
          <span class="task-title-text">${escapeHtml(task.title)}</span>
          <div class="task-actions">
            <button type="button" class="task-btn-mini ${isFocused ? 'is-focused' : ''}" data-focus-task="${task.id}" title="Vincular al temporizador">
              <span class="ms-icon icon-xs-sym ${isFocused ? 'icon-filled' : ''}" style="vertical-align:middle">track_changes</span>
              ${isFocused ? 'Activa' : 'Enfocar'}
            </button>
            ${!task.parentId ? `<button type="button" class="task-btn-mini" data-subtask-for="${task.id}" title="Añadir subtarea">+ Sub</button>` : ''}
            <button type="button" class="task-btn-mini" data-delete-task="${task.id}" title="Eliminar tarea">
              <span class="ms-icon icon-xs-sym" style="vertical-align:middle">close</span>
            </button>
          </div>
        </div>
        <div class="task-badges-line">
          <span class="meta-chip time-chip"><span class="ms-icon icon-xs-sym" style="vertical-align:middle;font-size:13px">schedule</span> ${formatDurationShort(rollupSec)}</span>
          <span class="meta-chip ${prioClass}">${prioLabel}</span>
          ${label ? `<span class="meta-chip" style="border-left: 3px solid ${label.color}">${escapeHtml(label.name)}</span>` : ''}
          ${task.dueDate ? `<span class="meta-chip"><span class="ms-icon icon-xs-sym" style="vertical-align:middle;font-size:13px">event</span> ${escapeHtml(task.dueDate)}</span>` : ''}
        </div>
        ${children.length > 0 ? `<div class="subtasks-container">${children.map(renderTaskNodeHTML).join('')}</div>` : ''}
      </div>
    `;
  }

  /* ========================================================================
     11. STATS CALENDAR MODAL & CHALLENGE MODAL RENDERERS
     ======================================================================== */
  let calViewDate = new Date();
  let selectedCalendarKey = todayKey();

  function renderStatsModal() {
    const curStreak = recalculateBestStreak();
    const todaySec = statsState.days[todayKey()]?.seconds || 0;

    document.getElementById('stat-current-streak').textContent = `${curStreak} días`;
    document.getElementById('stat-best-streak').textContent = `${statsState.bestStreak || 0} días`;
    document.getElementById('stat-today-time').textContent = formatDurationShort(todaySec);

    const year = calViewDate.getFullYear();
    const month = calViewDate.getMonth();

    const monthName = calViewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    document.getElementById('calendar-month-label').textContent = monthName;

    // Calculate month total
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    let monthTotalSec = 0;
    Object.entries(statsState.days).forEach(([k, val]) => {
      if (k.startsWith(prefix)) monthTotalSec += val.seconds || 0;
    });
    document.getElementById('stat-month-time').textContent = formatDurationShort(monthTotalSec);

    // Calendar grid (Monday first)
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push(`<div class="cal-day empty"></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const entry = statsState.days[k] || { seconds: 0, sessions: 0 };
      const mins = Math.floor(entry.seconds / 60);
      let lvl = '';
      if (mins >= 90) lvl = 'lvl-3';
      else if (mins >= 30) lvl = 'lvl-2';
      else if (mins >= 1) lvl = 'lvl-1';

      const isSel = k === selectedCalendarKey ? 'selected' : '';
      cells.push(`
        <button type="button" class="cal-day ${lvl} ${isSel}" data-cal-date="${k}">
          <span>${d}</span>
          <small>${mins > 0 ? mins + 'm' : '·'}</small>
        </button>
      `);
    }

    document.getElementById('calendar-grid').innerHTML = cells.join('');
    updateSelectedDayBreakdown(selectedCalendarKey);
  }

  function updateSelectedDayBreakdown(dateStr) {
    selectedCalendarKey = dateStr;
    const entry = statsState.days[dateStr] || { seconds: 0, sessions: 0 };
    document.getElementById('selected-day-title').textContent =
      dateStr === todayKey() ? `Hoy (${dateStr})` : dateStr;
    document.getElementById('selected-day-details').textContent =
      `${entry.sessions || 0} sesiones · ${formatDurationShort(entry.seconds || 0)} de concentración`;
  }

  function renderChallengeModal() {
    document.getElementById('select-challenge-hours').value = String(challengeState.goalHours);
    document.getElementById('select-challenge-minutes').value = String(challengeState.goalMinutes);
    document.getElementById('challenge-completed-total').innerHTML =
      `<span class="ms-icon icon-xs-sym icon-filled" style="vertical-align:middle">trophy</span> ${challengeState.completedTotal || 0} retos superados`;

    const goalSec = challengeState.goalHours * 3600 + challengeState.goalMinutes * 60;
    const todaySec = statsState.days[todayKey()]?.seconds || 0;
    const remSec = Math.max(0, goalSec - todaySec);
    const pct = goalSec > 0 ? Math.min(100, Math.round((todaySec / goalSec) * 100)) : 0;

    document.getElementById('challenge-progress-text').textContent =
      `${formatDurationShort(todaySec)} / ${formatDurationShort(goalSec)}`;
    document.getElementById('challenge-remaining-text').textContent =
      remSec === 0 ? '¡Objetivo diario completado!' : `Faltan ${formatDurationShort(remSec)} hoy`;
    document.getElementById('challenge-progress-bar').style.width = `${pct}%`;
  }

  function showRandomCuriosity() {
    const idx = Math.floor(Math.random() * CURIOSITIES_ES.length);
    document.getElementById('curiosity-text').textContent = CURIOSITIES_ES[idx];
  }

  /* ========================================================================
     11b. YOUTUBE MUSIC PIXEL MEDIA PLAYER & PLAYLIST TRACK SELECTOR
     ======================================================================== */
  let ytmPlayer = null;
  let ytmApiReady = false;
  let ytmPendingSource = null;
  let ytmPlaylistTracks = [];
  let ytmCurrentTrackIndex = 0;
  let ytmIsPlaying = false;
  let ytmActiveSource = null;

  function ensureYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) {
      ytmApiReady = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        ytmApiReady = true;
        if (typeof prev === 'function') prev();
        resolve();
      };
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    });
  }

  function parseYouTubeMusicUrl(rawUrl) {
    try {
      const str = String(rawUrl || '').trim();
      if (!str) return null;
      const u = new URL(str);
      const listId = u.searchParams.get('list');
      let videoId = u.searchParams.get('v');

      if (!videoId && u.hostname.includes('youtu.be')) {
        videoId = u.pathname.replace(/^\/+/, '').split('/')[0];
      }
      if (!videoId && u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/embed/')[1]?.split('/')[0];
      }

      if (listId || videoId) {
        return {
          listId: listId || '',
          videoId: videoId || '',
          label: listId ? 'YouTube Music · Playlist' : 'YouTube Music · Pista',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async function fetchPlaylistMetadata(listId, videoIdsFallback = []) {
    if (listId) {
      try {
        const resp = await fetch(`/api/yt-playlist?list=${encodeURIComponent(listId)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.tracks) && data.tracks.length > 0) {
            return data.tracks;
          }
        }
      } catch {
        /* fallback to YT player playlist array below */
      }
    }
    // Fallback if opened via file:// or playlist wasn't scraped: build from player's video IDs
    return videoIdsFallback.map((vid, idx) => ({
      index: idx,
      videoId: vid,
      title: `Pista ${idx + 1}`,
      author: 'YouTube Music',
      duration: '',
      thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
    }));
  }

  function renderYouTubePlaylistDrawer() {
    const countBadge = document.getElementById('ytm-queue-count');
    const itemsEl = document.getElementById('ytm-track-items');
    const subEl = document.getElementById('ytm-drawer-subtitle');

    if (!ytmPlaylistTracks || ytmPlaylistTracks.length === 0) {
      countBadge.hidden = true;
      subEl.textContent = 'Pista individual en reproducción';
      itemsEl.innerHTML = `<div class="empty-state" style="padding:14px">Pega el enlace de una playlist (con <code>?list=...</code>) para elegir entre todas sus pistas aquí.</div>`;
      return;
    }

    countBadge.textContent = String(ytmPlaylistTracks.length);
    countBadge.hidden = false;
    subEl.textContent = `Playlist (${ytmCurrentTrackIndex + 1} de ${ytmPlaylistTracks.length})`;

    itemsEl.innerHTML = ytmPlaylistTracks
      .map((t, idx) => {
        const isCurrent = idx === ytmCurrentTrackIndex;
        return `
          <button type="button" class="ytm-track-row ${isCurrent ? 'active' : ''}" data-ytm-track-idx="${idx}">
            <span class="ytm-track-num">
              ${isCurrent ? '<span class="ms-icon icon-xs-sym icon-filled">equalizer</span>' : idx + 1}
            </span>
            <img class="ytm-track-thumb" src="${escapeHtml(t.thumb)}" alt="" loading="lazy" />
            <span class="ytm-track-text">
              <strong>${escapeHtml(t.title)}</strong>
              <small>${escapeHtml(t.author)}</small>
            </span>
            ${t.duration ? `<span class="ytm-track-dur">${escapeHtml(t.duration)}</span>` : ''}
          </button>
        `;
      })
      .join('');
  }

  function syncYouTubeNowPlayingHeader() {
    if (!ytmPlayer || typeof ytmPlayer.getVideoData !== 'function') return;
    const data = ytmPlayer.getVideoData() || {};
    const idx = typeof ytmPlayer.getPlaylistIndex === 'function' ? ytmPlayer.getPlaylistIndex() : -1;
    if (idx >= 0) ytmCurrentTrackIndex = idx;

    const matched = ytmPlaylistTracks[ytmCurrentTrackIndex];
    const title = data.title || matched?.title || settings.ytmLastTitle || 'YouTube Music';
    const author = data.author || matched?.author || 'Reproduciendo ahora';
    const vid = data.video_id || matched?.videoId || ytmActiveSource?.videoId || '';

    document.getElementById('ytm-dock-title').textContent = title;
    document.getElementById('ytm-dock-artist').textContent = author;

    if (vid) {
      document.getElementById('ytm-artwork-img').src = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
    }

    // Update current track title in fallback list if it was generic
    if (matched && data.title && matched.title.startsWith('Pista ')) {
      matched.title = data.title;
      matched.author = data.author || matched.author;
    }

    const playBtn = document.getElementById('btn-ytm-playpause');
    const playIcon = document.getElementById('ytm-playpause-icon');
    playBtn.dataset.playing = String(ytmIsPlaying);
    playIcon.textContent = ytmIsPlaying ? 'pause' : 'play_arrow';

    renderYouTubePlaylistDrawer();
    updateMusicUI();
  }

  async function loadYouTubeMusicDock(rawUrl, customTitle = '') {
    const parsed = parseYouTubeMusicUrl(rawUrl);
    if (!parsed) {
      showSnackbar('Pega un enlace válido de music.youtube.com o youtube.com (canción o playlist).');
      return false;
    }

    ytmActiveSource = parsed;
    settings.ytmLastUrl = rawUrl;
    settings.ytmLastTitle = customTitle || parsed.label;
    saveJSON(KEYS.SETTINGS, settings);

    const dock = document.getElementById('ytm-floating-dock');
    dock.hidden = false;
    const emptyCard = document.getElementById('ytm-empty-card');
    if (emptyCard) emptyCard.hidden = true;
    document.getElementById('ytm-dock-title').textContent = customTitle || 'Conectando con YouTube Music…';
    document.getElementById('ytm-dock-artist').textContent = parsed.listId ? 'Cargando lista de pistas…' : 'Cargando pista…';

    // Pre-fetch playlist tracks from local helper if it's a playlist
    ytmPlaylistTracks = [];
    ytmCurrentTrackIndex = 0;
    if (parsed.listId) {
      const tracks = await fetchPlaylistMetadata(parsed.listId);
      if (tracks.length > 0) {
        ytmPlaylistTracks = tracks;
        renderYouTubePlaylistDrawer();
        // Auto-open the track selector drawer when a playlist is loaded so user can pick a track
        const drawer = document.getElementById('ytm-tracklist-drawer');
        drawer.hidden = false;
        document.getElementById('btn-ytm-queue').classList.add('active');
      }
    } else {
      renderYouTubePlaylistDrawer();
    }

    await ensureYouTubeIframeAPI();

    const firstVideoId = parsed.videoId || ytmPlaylistTracks[0]?.videoId || '';

    const playerVars = {
      autoplay: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      enablejsapi: 1,
      origin: window.location.origin,
      widget_referrer: window.location.origin,
    };
    if (parsed.listId) {
      playerVars.listType = 'playlist';
      playerVars.list = parsed.listId;
    }

    if (ytmPlayer && typeof ytmPlayer.loadPlaylist === 'function') {
      if (parsed.listId && ytmPlaylistTracks.length > 0) {
        ytmPlayer.loadPlaylist(
          ytmPlaylistTracks.map((t) => t.videoId),
          0,
          0
        );
      } else if (parsed.listId) {
        ytmPlayer.loadPlaylist({ list: parsed.listId, listType: 'playlist', index: 0 });
      } else if (firstVideoId) {
        ytmPlayer.loadVideoById(firstVideoId);
      }
    } else {
      const playerConfig = {
        width: '100%',
        height: '100%',
        playerVars,
        events: {
          onReady: () => {
            if (parsed.listId && ytmPlaylistTracks.length > 0) {
              ytmPlayer.loadPlaylist(
                ytmPlaylistTracks.map((t) => t.videoId),
                0,
                0
              );
            } else if (parsed.listId && !firstVideoId) {
              ytmPlayer.loadPlaylist({ list: parsed.listId, listType: 'playlist', index: 0 });
            } else {
              ytmPlayer.playVideo();
            }
            syncYouTubeNowPlayingHeader();
          },
          onStateChange: async (ev) => {
            ytmIsPlaying = ev.data === window.YT.PlayerState.PLAYING || ev.data === window.YT.PlayerState.BUFFERING;
            if (
              ytmPlaylistTracks.length === 0 &&
              typeof ytmPlayer.getPlaylist === 'function'
            ) {
              const ids = ytmPlayer.getPlaylist();
              if (Array.isArray(ids) && ids.length > 0) {
                ytmPlaylistTracks = await fetchPlaylistMetadata(ytmActiveSource?.listId, ids);
                const drawer = document.getElementById('ytm-tracklist-drawer');
                drawer.hidden = false;
                document.getElementById('btn-ytm-queue').classList.add('active');
              }
            }
            syncYouTubeNowPlayingHeader();
          },
        },
      };
      // IMPORTANT: Never set videoId: undefined on YT.Player constructor or www-widgetapi throws "Error: Invalid video id"
      if (firstVideoId) {
        playerConfig.videoId = firstVideoId;
      }
      ytmPlayer = new window.YT.Player('ytm-api-mount', playerConfig);
    }

    updateMusicUI();
    showSnackbar(parsed.listId ? 'Playlist cargada · Elige cualquier pista en la lista.' : 'Pista de YouTube Music cargada.');
    return true;
  }

  function closeYouTubeMusicDock() {
    if (ytmPlayer && typeof ytmPlayer.stopVideo === 'function') {
      try { ytmPlayer.stopVideo(); } catch {}
    }
    ytmActiveSource = null;
    ytmIsPlaying = false;
    ytmPlaylistTracks = [];
    const dock = document.getElementById('ytm-floating-dock');
    if (dock) {
      dock.hidden = true;
      dock.classList.remove('show-video');
    }
    const emptyCard = document.getElementById('ytm-empty-card');
    if (emptyCard) emptyCard.hidden = false;
    document.getElementById('ytm-tracklist-drawer').hidden = true;
    updateMusicUI();
  }

  function updateMusicUI() {
    const ind = document.getElementById('music-indicator');
    ind.hidden = !(ambientPlaying || ytmActiveSource);
    document.getElementById('ambient-play-label').innerHTML = ambientPlaying
      ? '<span class="ms-icon icon-sm icon-filled" style="vertical-align:middle">pause</span> Detener sonido ambiental'
      : '<span class="ms-icon icon-sm icon-filled" style="vertical-align:middle">play_arrow</span> Reproducir sonido ambiental';

    document.querySelectorAll('.sound-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.sound === settings.ambientPreset && !settings.customAudioUrl);
    });
  }

  /* ========================================================================
     12. HELPERS & EVENT LISTENERS
     ======================================================================== */
  let snackbarTimeout = null;
  function showSnackbar(message) {
    const el = document.getElementById('m3-snackbar');
    el.textContent = message;
    el.hidden = false;
    if (snackbarTimeout) clearTimeout(snackbarTimeout);
    snackbarTimeout = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bindEvents() {
    // Mode switch tabs
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // Primary controls
    document.getElementById('btn-start-pause').addEventListener('click', toggleTimer);
    document.getElementById('btn-reset').addEventListener('click', resetTimer);
    document.getElementById('btn-stop-skip').addEventListener('click', stopOrSkipSession);

    // Quick adjusters
    document.getElementById('btn-minus-1m').addEventListener('click', () => adjustRemainingSeconds(-60));
    document.getElementById('btn-plus-1m').addEventListener('click', () => adjustRemainingSeconds(60));
    document.getElementById('btn-plus-5m').addEventListener('click', () => adjustRemainingSeconds(300));

    // Edit motivational quote
    document.getElementById('btn-edit-quote').addEventListener('click', () => {
      const next = prompt('Escribe tu frase personal de concentración:', userQuote.replace(/^“|”$/g, ''));
      if (next && next.trim()) {
        userQuote = `“${next.trim()}”`;
        localStorage.setItem(KEYS.QUOTE, userQuote);
        updateGreeting();
      }
    });

    // Toggle Tasks Panel & Dial Style
    const toggleTasksPanel = () => {
      appearance.tasksCollapsed = !appearance.tasksCollapsed;
      saveJSON(KEYS.APPEARANCE, appearance);
      applyAppearanceUI();
      if (!appearance.tasksCollapsed && window.innerWidth <= 1040) {
        setTimeout(() => {
          document.getElementById('tasks-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    };
    document.getElementById('btn-toggle-tasks').addEventListener('click', toggleTasksPanel);
    document.getElementById('btn-close-tasks').addEventListener('click', toggleTasksPanel);
    document.getElementById('btn-focus-task-chip').addEventListener('click', () => {
      if (appearance.tasksCollapsed) toggleTasksPanel();
      document.getElementById('input-task-title').focus();
    });
    document.getElementById('btn-clear-active-task').addEventListener('click', () => {
      statsState.activeTaskId = null;
      saveJSON(KEYS.STATS, statsState);
      renderTimerUI();
      renderTasksUI();
    });

    document.getElementById('btn-toggle-dial-style').addEventListener('click', () => {
      appearance.dialStyle = appearance.dialStyle === 'ring' ? 'giant' : 'ring';
      saveJSON(KEYS.APPEARANCE, appearance);
      applyAppearanceUI();
    });

    // Fullscreen & PiP
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
    document.getElementById('btn-pip').addEventListener('click', togglePiP);

    // Open Modals
    const openDialog = (id) => {
      const dlg = document.getElementById(id);
      if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
    };
    document.getElementById('btn-open-music').addEventListener('click', () => openDialog('modal-music'));
    document.getElementById('btn-empty-open-music')?.addEventListener('click', () => openDialog('modal-music'));
    document.getElementById('btn-open-stats').addEventListener('click', () => {
      renderStatsModal();
      openDialog('modal-stats');
    });
    document.getElementById('btn-open-challenge').addEventListener('click', () => {
      renderChallengeModal();
      openDialog('modal-challenge');
    });
    document.getElementById('btn-open-appearance').addEventListener('click', () => openDialog('modal-appearance'));
    document.getElementById('btn-open-settings').addEventListener('click', () => openDialog('modal-settings'));
    document.getElementById('btn-manage-labels').addEventListener('click', () => {
      renderLabelSelects();
      openDialog('modal-labels');
    });

    // Close Modals
    document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dlg = document.getElementById(btn.dataset.closeDialog);
        if (dlg) dlg.close();
      });
    });
    document.querySelectorAll('.m3-dialog').forEach((dlg) => {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    });

    // Tasks Creation & Delegation
    document.getElementById('form-create-task').addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('input-task-title');
      const prioInput = document.getElementById('input-task-priority');
      const labelInput = document.getElementById('input-task-label');
      const dueInput = document.getElementById('input-task-due');
      createTask({
        title: titleInput.value,
        priority: prioInput.value,
        labelId: labelInput.value,
        dueDate: dueInput.value,
      });
      titleInput.value = '';
    });

    document.querySelectorAll('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        currentTaskFilter = pill.dataset.filter;
        document.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
        renderTasksUI();
      });
    });

    document.getElementById('input-task-search').addEventListener('input', (e) => {
      currentTaskSearch = e.target.value;
      renderTasksUI();
    });

    document.getElementById('task-tree-list').addEventListener('click', (e) => {
      const toggleId = e.target.dataset?.toggleTask;
      if (toggleId) {
        toggleTaskDone(toggleId);
        return;
      }
      const focusBtn = e.target.closest('[data-focus-task]');
      if (focusBtn) {
        statsState.activeTaskId = focusBtn.dataset.focusTask;
        saveJSON(KEYS.STATS, statsState);
        renderTasksUI();
        renderTimerUI();
        return;
      }
      const subBtn = e.target.closest('[data-subtask-for]');
      if (subBtn) {
        const subTitle = prompt('Nombre de la subtarea:');
        if (subTitle && subTitle.trim()) {
          createTask({ title: subTitle, parentId: subBtn.dataset.subtaskFor });
        }
        return;
      }
      const delBtn = e.target.closest('[data-delete-task]');
      if (delBtn) {
        deleteTaskBranch(delBtn.dataset.deleteTask);
      }
    });

    // Labels Modal
    document.getElementById('form-create-label').addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('input-label-name');
      const colorEl = document.getElementById('input-label-color');
      if (!nameEl.value.trim()) return;
      labels.push({
        id: 'lbl-' + Date.now().toString(36),
        name: nameEl.value.trim(),
        color: colorEl.value,
      });
      nameEl.value = '';
      saveJSON(KEYS.LABELS, labels);
      renderLabelSelects();
      renderTasksUI();
    });

    document.getElementById('labels-list').addEventListener('click', (e) => {
      const delId = e.target.dataset?.delLabel;
      if (delId) {
        labels = labels.filter((l) => l.id !== delId);
        saveJSON(KEYS.LABELS, labels);
        renderLabelSelects();
        renderTasksUI();
      }
    });

    // Ambient Sound Controls
    document.querySelectorAll('.sound-card').forEach((card) => {
      card.addEventListener('click', () => {
        settings.ambientPreset = card.dataset.sound;
        settings.customAudioUrl = '';
        saveJSON(KEYS.SETTINGS, settings);
        startAmbientAudio();
      });
    });

    document.getElementById('btn-toggle-ambient').addEventListener('click', () => {
      if (ambientPlaying) stopAmbientAudio();
      else startAmbientAudio();
    });

    const ambSlider = document.getElementById('slider-ambient-volume');
    ambSlider.value = Math.round(settings.ambientVolume * 100);
    document.getElementById('ambient-volume-val').textContent = `${ambSlider.value}%`;
    ambSlider.addEventListener('input', () => {
      settings.ambientVolume = Number(ambSlider.value) / 100;
      document.getElementById('ambient-volume-val').textContent = `${ambSlider.value}%`;
      if (ambientNodes?.masterGain) {
        ambientNodes.masterGain.gain.value = settings.ambientVolume * 0.35;
      }
      if (customAudioEl) {
        customAudioEl.volume = settings.ambientVolume;
      }
      saveJSON(KEYS.SETTINGS, settings);
    });

    const chkAutoAmb = document.getElementById('chk-auto-ambient');
    chkAutoAmb.checked = Boolean(settings.autoAmbientOnFocus);
    chkAutoAmb.addEventListener('change', () => {
      settings.autoAmbientOnFocus = chkAutoAmb.checked;
      saveJSON(KEYS.SETTINGS, settings);
    });

    document.getElementById('btn-use-custom-audio').addEventListener('click', () => {
      const url = document.getElementById('input-custom-audio').value.trim();
      if (!url) return;
      settings.customAudioUrl = url;
      saveJSON(KEYS.SETTINGS, settings);
      startAmbientAudio();
    });

    // YouTube Music Integration Controls
    const ytmInput = document.getElementById('input-ytm-url');
    if (settings.ytmLastUrl && ytmInput) {
      ytmInput.value = settings.ytmLastUrl;
    }

    document.getElementById('btn-load-ytm').addEventListener('click', () => {
      const raw = ytmInput.value.trim();
      if (loadYouTubeMusicDock(raw)) {
        document.getElementById('modal-music').close();
      }
    });

    document.querySelectorAll('.ytm-quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.ytmUrl;
        const name = btn.dataset.ytmName || '';
        if (ytmInput) ytmInput.value = url;
        if (loadYouTubeMusicDock(url, name)) {
          document.getElementById('modal-music').close();
        }
      });
    });

    document.getElementById('btn-open-ytm-popup').addEventListener('click', () => {
      window.open(
        'https://music.youtube.com',
        'PixelYouTubeMusic',
        'width=420,height=680,menubar=no,toolbar=no,location=no,status=no'
      );
      showSnackbar('Abriendo tu biblioteca de YouTube Music en ventana compacta...');
    });

    // Pixel Media Transport & Playlist Drawer Controls
    document.getElementById('btn-ytm-playpause').addEventListener('click', () => {
      if (!ytmPlayer || typeof ytmPlayer.getPlayerState !== 'function') return;
      const st = ytmPlayer.getPlayerState();
      if (st === window.YT.PlayerState.PLAYING || st === window.YT.PlayerState.BUFFERING) {
        ytmPlayer.pauseVideo();
      } else {
        ytmPlayer.playVideo();
      }
    });

    document.getElementById('btn-ytm-prev').addEventListener('click', () => {
      if (ytmPlayer && typeof ytmPlayer.previousVideo === 'function') {
        ytmPlayer.previousVideo();
      }
    });

    document.getElementById('btn-ytm-next').addEventListener('click', () => {
      if (ytmPlayer && typeof ytmPlayer.nextVideo === 'function') {
        ytmPlayer.nextVideo();
      }
    });

    document.getElementById('btn-ytm-queue').addEventListener('click', (e) => {
      const drawer = document.getElementById('ytm-tracklist-drawer');
      drawer.hidden = !drawer.hidden;
      e.currentTarget.classList.toggle('active', !drawer.hidden);
    });

    document.getElementById('btn-ytm-shuffle').addEventListener('click', () => {
      if (ytmPlayer && typeof ytmPlayer.setShuffle === 'function') {
        ytmPlayer.setShuffle(true);
        const total = ytmPlaylistTracks.length;
        if (total > 1) {
          const rnd = Math.floor(Math.random() * total);
          ytmPlayer.playVideoAt(rnd);
        }
        showSnackbar('Modo aleatorio activado en la playlist.');
      }
    });

    document.getElementById('btn-ytm-toggle-video').addEventListener('click', () => {
      document.getElementById('ytm-floating-dock').classList.toggle('show-video');
    });

    document.getElementById('ytm-track-items').addEventListener('click', (e) => {
      const row = e.target.closest('[data-ytm-track-idx]');
      if (!row) return;
      const idx = Number(row.dataset.ytmTrackIdx);
      ytmCurrentTrackIndex = idx;
      if (ytmPlayer && typeof ytmPlayer.playVideoAt === 'function') {
        ytmPlayer.playVideoAt(idx);
      }
      renderYouTubePlaylistDrawer();
    });

    document.getElementById('btn-ytm-close').addEventListener('click', closeYouTubeMusicDock);

    // Calendar Navigation
    document.getElementById('btn-cal-prev').addEventListener('click', () => {
      calViewDate.setMonth(calViewDate.getMonth() - 1);
      renderStatsModal();
    });
    document.getElementById('btn-cal-next').addEventListener('click', () => {
      calViewDate.setMonth(calViewDate.getMonth() + 1);
      renderStatsModal();
    });
    document.getElementById('calendar-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cal-date]');
      if (btn) {
        selectedCalendarKey = btn.dataset.calDate;
        renderStatsModal();
      }
    });

    // Challenge Controls
    document.getElementById('btn-save-challenge').addEventListener('click', () => {
      challengeState.goalHours = Number(document.getElementById('select-challenge-hours').value);
      challengeState.goalMinutes = Number(document.getElementById('select-challenge-minutes').value);
      saveJSON(KEYS.CHALLENGE, challengeState);
      renderChallengeModal();
      renderStatsBadges();
      showSnackbar('Reto diario actualizado.');
    });
    document.getElementById('btn-show-fact').addEventListener('click', showRandomCuriosity);

    // Appearance Controls
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appearance.theme = btn.dataset.themeChoice;
        saveJSON(KEYS.APPEARANCE, appearance);
        applyAppearanceUI();
      });
    });
    document.querySelectorAll('[data-palette-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appearance.palette = btn.dataset.paletteChoice;
        saveJSON(KEYS.APPEARANCE, appearance);
        applyAppearanceUI();
      });
    });
    document.querySelectorAll('[data-dial-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appearance.dialStyle = btn.dataset.dialChoice;
        saveJSON(KEYS.APPEARANCE, appearance);
        applyAppearanceUI();
      });
    });
    document.querySelectorAll('[data-ambient-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appearance.ambientParticles = btn.dataset.ambientChoice;
        saveJSON(KEYS.APPEARANCE, appearance);
        applyAppearanceUI();
        initParticles();
      });
    });

    document.getElementById('input-bg-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(KEYS.CUSTOM_BG, reader.result);
          applyAppearanceUI();
          showSnackbar('Fondo personalizado aplicado.');
        } catch {
          showSnackbar('La imagen es demasiado grande para almacenamiento local.');
        }
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-clear-bg').addEventListener('click', () => {
      localStorage.removeItem(KEYS.CUSTOM_BG);
      applyAppearanceUI();
    });

    // Settings Modal (Durations, Auto-start, Alarms)
    ['focus', 'short', 'long'].forEach((m) => {
      const slider = document.getElementById(`slider-dur-${m}`);
      const valEl = document.getElementById(`val-dur-${m}`);
      slider.value = settings.durations[m];
      valEl.textContent = `${settings.durations[m]} min`;

      slider.addEventListener('input', () => {
        const mins = Number(slider.value);
        settings.durations[m] = mins;
        valEl.textContent = `${mins} min`;
        saveJSON(KEYS.SETTINGS, settings);
        if (!timerState.running) {
          if (!timerState.modeRemaining) timerState.modeRemaining = {};
          timerState.modeRemaining[m] = mins * 60;
          if (timerState.mode === m) {
            timerState.remaining = mins * 60;
            timerState.lastBankedElapsed = 0;
            saveJSON(KEYS.TIMER, timerState);
            renderTimerUI();
          }
        }
      });
    });

    const chkBreak = document.getElementById('chk-auto-break');
    const chkFocus = document.getElementById('chk-auto-focus');
    const chkNotif = document.getElementById('chk-notifications');
    chkBreak.checked = Boolean(settings.autoStartBreak);
    chkFocus.checked = Boolean(settings.autoStartFocus);
    chkNotif.checked = Boolean(settings.notifications);

    chkBreak.addEventListener('change', () => {
      settings.autoStartBreak = chkBreak.checked;
      saveJSON(KEYS.SETTINGS, settings);
    });
    chkFocus.addEventListener('change', () => {
      settings.autoStartFocus = chkFocus.checked;
      saveJSON(KEYS.SETTINGS, settings);
    });
    chkNotif.addEventListener('change', async () => {
      if (chkNotif.checked && 'Notification' in window && Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        settings.notifications = perm === 'granted';
        chkNotif.checked = settings.notifications;
      } else {
        settings.notifications = chkNotif.checked;
      }
      saveJSON(KEYS.SETTINGS, settings);
    });

    const selAlarm = document.getElementById('select-alarm-sound');
    selAlarm.value = settings.alarmSound;
    selAlarm.addEventListener('change', () => {
      settings.alarmSound = selAlarm.value;
      saveJSON(KEYS.SETTINGS, settings);
      playSynthesizedAlarm(settings.alarmSound);
    });

    document.getElementById('btn-test-alarm').addEventListener('click', () => {
      playSynthesizedAlarm(settings.alarmSound);
    });

    const slAlarmVol = document.getElementById('slider-alarm-volume');
    slAlarmVol.value = Math.round(settings.alarmVolume * 100);
    document.getElementById('val-alarm-volume').textContent = `${slAlarmVol.value}%`;
    slAlarmVol.addEventListener('input', () => {
      settings.alarmVolume = Number(slAlarmVol.value) / 100;
      document.getElementById('val-alarm-volume').textContent = `${slAlarmVol.value}%`;
      saveJSON(KEYS.SETTINGS, settings);
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      } else if (e.key === 'r' || e.key === 'R') {
        resetTimer();
      } else if (e.key === 's' || e.key === 'S') {
        stopOrSkipSession();
      } else if (e.key === 't' || e.key === 'T') {
        toggleTasksPanel();
      } else if (e.key === 'f' || e.key === 'F') {
        document.getElementById('btn-fullscreen').click();
      }
    });
  }

  /* ========================================================================
     13. BOOTSTRAP & RECOVERY
     ======================================================================== */
  function bootstrap() {
    // Recover running timer if page was reloaded while timer was active
    if (timerState.running && typeof timerState.endsAt === 'number') {
      const rem = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
      timerState.remaining = rem;
      if (rem <= 0) {
        timerState.running = false;
        timerState.endsAt = null;
        onTimerCompleted();
      } else {
        syncWorker();
      }
    }

    updateGreeting();
    applyAppearanceUI();
    renderLabelSelects();
    renderTasksUI();
    renderTimerUI();
    renderStatsBadges();
    updateMusicUI();
    bindEvents();
    initParticles();
    animateParticles();
  }

  bootstrap();
})();
