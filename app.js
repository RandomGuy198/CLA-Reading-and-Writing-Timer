/*
 * Reading Timer — countdown with custom milestone alerts.
 * No build step, no dependencies. Classic script so it also works
 * when index.html is opened directly from disk.
 */
(function () {
  'use strict';

  var STORE_KEY = 'reading-timer-v1';
  var TZ = 'Asia/Ho_Chi_Minh';
  var BASE_TITLE = 'Reading Timer';
  var TICK_MS = 200;
  var BANNER_MS = 8000;

  function $(id) { return document.getElementById(id); }

  var ui = {
    clock: $('hanoiClock'),
    stateTag: $('stateTag'),
    endsAt: $('endsAt'),
    countdown: $('countdown'),
    fill: $('progressFill'),
    btnMain: $('btnMain'),
    btnReset: $('btnReset'),
    duration: $('durationInput'),
    durationHint: $('durationHint'),
    msList: $('milestoneList'),
    msInput: $('msInput'),
    btnAddMs: $('btnAddMs'),
    msHint: $('msHint'),
    banner: $('alertBanner'),
    btnNotify: $('btnNotify'),
    notifyState: $('notifyState'),
    presets: [].slice.call(document.querySelectorAll('.chip'))
  };

  var state = {
    durationMs: 20 * 60000,
    milestones: [5 * 60000, 60000], // sorted descending: time remaining when alert fires
    remainingMs: 20 * 60000,
    endAt: 0,
    running: false,
    fired: new Set(),
    loop: null,
    audio: null,
    bannerTimer: null
  };

  /* ---------- time helpers ---------- */

  // Accepts "mm:ss", "hh:mm:ss", or a plain number (treated as minutes).
  function parseTime(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '') return null;
    if (/^\d+$/.test(s)) {
      var mins = parseInt(s, 10) * 60000;
      return mins > 0 ? mins : null;
    }
    if (!/^\d{1,3}(:\d{1,2}){1,2}$/.test(s)) return null;
    var p = s.split(':').map(Number);
    for (var i = 1; i < p.length; i++) {
      if (p[i] > 59) return null;
    }
    var total;
    if (p.length === 2) total = (p[0] * 60 + p[1]) * 1000;
    else total = (p[0] * 3600 + p[1] * 60 + p[2]) * 1000;
    return total > 0 ? total : null;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // Display format: "MM:SS", or "H:MM:SS" when one hour or more.
  function fmt(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  // Natural language for notifications: "5 minutes", "45 seconds".
  function human(ms) {
    var t = Math.round(ms / 1000);
    if (t >= 60 && t % 60 === 0) {
      var mm = t / 60;
      return mm + (mm === 1 ? ' minute' : ' minutes');
    }
    if (t >= 60) {
      var m2 = Math.floor(t / 60);
      var s2 = t % 60;
      return m2 + (m2 === 1 ? ' minute' : ' minutes') + ' ' + s2 + (s2 === 1 ? ' second' : ' seconds');
    }
    return t + (t === 1 ? ' second' : ' seconds');
  }

  /* ---------- Hanoi clock (device timezone independent) ---------- */

  var clockFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  var hmFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  function tickClock() {
    var now = new Date();
    ui.clock.textContent = clockFmt.format(now);
    ui.clock.setAttribute('datetime', now.toISOString());
  }

  /* ---------- sound (WebAudio, no audio files) ---------- */

  function ensureAudio() {
    try {
      if (!state.audio) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) state.audio = new Ctx();
      }
      if (state.audio && state.audio.state === 'suspended') state.audio.resume();
    } catch (e) { /* sound unavailable: banner + notification still work */ }
  }

  function beep(kind) {
    var ctx = state.audio;
    if (!ctx) return;
    try {
      var notes = kind === 'timeout' ? [880, 660, 440] : [880, 660];
      var gap = 0.24;
      var vol = kind === 'timeout' ? 0.8 : 0.6;
      var t0 = ctx.currentTime + 0.02;
      notes.forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var start = t0 + i * gap;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.22);
      });
    } catch (e) { /* ignore audio errors */ }
  }

  /* ---------- spoken alerts (pre-generated Edge TTS clips) ----------
   * Bundled MP3s alongside index.html, voiced by tr-TR-AhmetNeural (Turkish
   * male) speaking English: m{n} = minutes left, s{n} = seconds left, timeout.
   */
  var speechCache = {};

  function speechFile(ms) {
    if (ms <= 0) return 'timeout.mp3';
    if (ms % 60000 === 0) {
      var m = ms / 60000;
      return m <= 60 ? 'm' + m + '.mp3' : null;
    }
    if (ms % 1000 === 0) {
      var s = ms / 1000;
      return s <= 59 ? 's' + s + '.mp3' : null;
    }
    return null; // odd values fall back to chime + banner only
  }

  function getSpeech(file) {
    if (!speechCache[file]) {
      var a = new Audio(file);
      a.preload = 'auto';
      a.volume = 1.0; // loud
      speechCache[file] = a;
    }
    return speechCache[file];
  }

  function prefetchSpeech() {
    var files = state.milestones.map(speechFile).concat(['timeout.mp3']);
    files.forEach(function (f) { if (f) getSpeech(f); });
  }

  // Chime first, spoken phrase follows it (delayMs), so the voice is not buried in the beeps.
  function speak(file, delayMs) {
    if (!file) return;
    var a = getSpeech(file);
    setTimeout(function () {
      try {
        a.currentTime = 0;
        var p = a.play();
        if (p && p.catch) p.catch(function () { /* blocked until first gesture; banner still fired */ });
      } catch (e) { /* ignore playback errors */ }
    }, delayMs || 0);
  }

  /* ---------- alerts: banner + chime + speech + desktop notification ---------- */

  function showAlert(text, sticky) {
    ui.banner.textContent = text;
    ui.banner.hidden = false;
    // restart the entry animation
    ui.banner.style.animation = 'none';
    void ui.banner.offsetWidth;
    ui.banner.style.animation = '';
    if (state.bannerTimer) clearTimeout(state.bannerTimer);
    if (!sticky) state.bannerTimer = setTimeout(hideBanner, BANNER_MS);
  }

  function hideBanner() {
    ui.banner.hidden = true;
    if (state.bannerTimer) clearTimeout(state.bannerTimer);
  }

  function notify(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body, tag: 'reading-timer' });
      }
    } catch (e) { /* notification unsupported in this context */ }
  }

  function fireMilestoneAlerts(list) {
    var text = list.map(fmt).join(' and ') + ' left';
    showAlert(text, false);
    beep('milestone');
    // multiple caught-up alerts at once: voice the nearest one only, banner lists all
    speak(speechFile(list[list.length - 1]), 550);
    notify('Timer: ' + text, 'Your ' + fmt(state.durationMs) + ' timer is running.');
  }

  function fireTimeout() {
    showAlert("Time's up — " + fmt(state.durationMs) + ' finished', true);
    beep('timeout');
    speak('timeout.mp3', 850);
    notify("Time's up", 'Your ' + fmt(state.durationMs) + ' timer has finished.');
  }

  /* ---------- state machine ---------- */

  // ready: untouched | running | paused: partly elapsed, stopped | done: reached zero
  function status() {
    if (state.running) return 'running';
    if (state.remainingMs <= 0) return 'done';
    if (state.remainingMs < state.durationMs) return 'paused';
    return 'ready';
  }

  function displayRemaining() {
    return state.running
      ? Math.max(0, state.endAt - Date.now())
      : state.remainingMs;
  }

  function locked() {
    var s = status();
    return s === 'running' || s === 'paused';
  }

  /* ---------- render ---------- */

  function renderTimer() {
    var rem = displayRemaining();
    var s = status();

    ui.countdown.textContent = fmt(rem);
    ui.countdown.classList.toggle('done', s === 'done');

    var pct = state.durationMs > 0
      ? ((state.durationMs - rem) / state.durationMs) * 100
      : 0;
    ui.fill.style.width = Math.min(100, Math.max(0, pct)) + '%';

    ui.stateTag.textContent =
      s === 'running' ? 'Running'
      : s === 'paused' ? 'Paused'
      : s === 'done' ? 'Time out'
      : 'Ready';
    ui.stateTag.classList.toggle('live', s === 'running');

    ui.endsAt.textContent = s === 'running'
      ? 'Ends ' + hmFmt.format(new Date(state.endAt)) + ' Hanoi'
      : '';

    ui.btnMain.textContent =
      s === 'running' ? 'Pause'
      : s === 'paused' ? 'Resume'
      : s === 'done' ? 'Start over'
      : 'Start';

    var title =
      s === 'running' ? fmt(rem) + ' · ' + BASE_TITLE
      : s === 'done' ? '00:00 · Time out · ' + BASE_TITLE
      : s === 'paused' ? fmt(rem) + ' (paused) · ' + BASE_TITLE
      : BASE_TITLE;
    if (document.title !== title) document.title = title;

    // setup controls lock while a countdown session is under way
    var lock = locked();
    ui.duration.disabled = lock;
    ui.btnAddMs.disabled = lock;
    ui.msInput.disabled = lock;
    ui.presets.forEach(function (c) { c.disabled = lock; });
    [].forEach.call(ui.msList.querySelectorAll('.ms-remove'), function (b) {
      b.disabled = lock;
    });
  }

  function renderMilestones() {
    ui.msList.innerHTML = '';
    if (state.milestones.length === 0) {
      var li0 = document.createElement('li');
      li0.className = 'ms empty';
      li0.textContent = 'No milestones — only the time-out alert will fire.';
      ui.msList.appendChild(li0);
      return;
    }
    state.milestones.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'ms';

      var time = document.createElement('span');
      time.className = 'ms-time';
      time.textContent = fmt(m);

      var unit = document.createElement('span');
      unit.className = 'ms-unit';
      unit.textContent = m === 60000 ? 'minute left' : 'time left';

      li.appendChild(time);
      li.appendChild(unit);

      if (state.fired.has(m)) {
        var sent = document.createElement('span');
        sent.className = 'ms-sent';
        sent.textContent = 'alerted';
        li.appendChild(sent);
      }

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ms-remove';
      rm.innerHTML = '&times;';
      rm.setAttribute('aria-label', 'Remove milestone at ' + human(m) + ' left');
      rm.disabled = locked();
      rm.addEventListener('click', function () {
        state.milestones = state.milestones.filter(function (x) { return x !== m; });
        save();
        renderMilestones();
        renderTimer();
      });
      li.appendChild(rm);

      ui.msList.appendChild(li);
    });
  }

  function updatePresetChips() {
    ui.presets.forEach(function (c) {
      c.setAttribute('aria-pressed', Number(c.dataset.preset) * 1000 === state.durationMs ? 'true' : 'false');
    });
  }

  function hint(el, text, isError) {
    el.textContent = text || '';
    el.classList.toggle('err', !!isError);
  }

  /* ---------- timer control ---------- */

  function tick() {
    if (!state.running) return;
    var rem = Math.max(0, state.endAt - Date.now());
    state.remainingMs = rem;

    if (rem <= 0) {
      finish();
      return;
    }

    var newlyFired = [];
    state.milestones.forEach(function (m) {
      if (!state.fired.has(m) && rem <= m) {
        state.fired.add(m);
        newlyFired.push(m);
      }
    });
    if (newlyFired.length) {
      fireMilestoneAlerts(newlyFired);
      renderMilestones();
    }
    renderTimer();
  }

  function start() {
    ensureAudio();
    if (state.remainingMs <= 0) resetTimer();
    hint(ui.durationHint, '');
    prefetchSpeech(); // clips ready before the first alert comes due
    state.endAt = Date.now() + state.remainingMs;
    state.running = true;
    hideBanner();
    if (state.loop) clearInterval(state.loop);
    state.loop = setInterval(tick, TICK_MS);
    renderTimer();
    tick(); // fire immediately in case a milestone is already due
  }

  function pause() {
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    state.running = false;
    if (state.loop) { clearInterval(state.loop); state.loop = null; }
    renderTimer();
  }

  function resetTimer() {
    state.running = false;
    if (state.loop) { clearInterval(state.loop); state.loop = null; }
    state.remainingMs = state.durationMs;
    state.fired = new Set();
    hideBanner();
    renderTimer();
    renderMilestones();
  }

  function finish() {
    state.running = false;
    if (state.loop) { clearInterval(state.loop); state.loop = null; }
    state.remainingMs = 0;
    renderTimer();
    renderMilestones();
    fireTimeout();
  }

  /* ---------- setup: duration ---------- */

  function setDuration(ms, droppedNote) {
    // Capture lock state BEFORE durationMs changes: enlarging the duration would
    // otherwise make status() briefly read "paused" (remaining < new duration)
    // and wrongly lock the timer with a stale remaining value.
    var wasLocked = locked();
    state.durationMs = ms;
    // keep the invariant: every milestone is shorter than the duration
    var before = state.milestones.length;
    state.milestones = state.milestones.filter(function (m) { return m < ms; });
    var dropped = before - state.milestones.length;

    ui.duration.value = fmt(ms);
    if (!wasLocked) {
      state.remainingMs = ms;
      state.fired = new Set();
      hideBanner();
    }
    hint(ui.durationHint, ''); // drop any stale notice from an earlier duration change
    updatePresetChips();
    save();
    renderTimer();
    renderMilestones();

    if (dropped > 0 && droppedNote) {
      hint(ui.durationHint, dropped + (dropped === 1 ? ' milestone' : ' milestones') + ' removed — longer than the new duration.', true);
    }
  }

  /* ---------- setup: milestones ---------- */

  function addMilestone() {
    var v = parseTime(ui.msInput.value);
    if (v === null) {
      hint(ui.msHint, 'Use mm:ss (e.g. 05:00). A plain number means minutes.', true);
      return;
    }
    if (v >= state.durationMs) {
      hint(ui.msHint, 'Must be shorter than the duration (' + fmt(state.durationMs) + ').', true);
      return;
    }
    if (state.milestones.indexOf(v) !== -1) {
      hint(ui.msHint, 'That milestone is already listed.', true);
      return;
    }
    state.milestones.push(v);
    state.milestones.sort(function (a, b) { return b - a; });
    ui.msInput.value = '';
    hint(ui.msHint, '');
    hint(ui.durationHint, ''); // milestone edits retire the previous duration notice
    save();
    renderMilestones();
    renderTimer();
  }

  /* ---------- persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        durationMs: state.durationMs,
        milestones: state.milestones
      }));
    } catch (e) { /* private mode / storage full: defaults still work */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data.durationMs === 'number' && data.durationMs > 0) {
        state.durationMs = data.durationMs;
      }
      if (data && Object.prototype.toString.call(data.milestones) === '[object Array]') {
        state.milestones = data.milestones.filter(function (m) {
          return typeof m === 'number' && m > 0 && m < state.durationMs;
        }).sort(function (a, b) { return b - a; });
      } else {
        state.milestones = [5 * 60000, 60000].filter(function (m) { return m < state.durationMs; });
      }
    } catch (e) { /* corrupt storage: keep defaults */ }
    state.remainingMs = state.durationMs;
  }

  /* ---------- desktop notification permission ---------- */

  function updateNotifyUI() {
    if (!('Notification' in window)) {
      ui.btnNotify.hidden = true;
      ui.notifyState.textContent = 'Desktop alerts unavailable here — sound and on-page alerts still work.';
      return;
    }
    if (Notification.permission === 'granted') {
      ui.btnNotify.hidden = true;
      ui.notifyState.textContent = 'Desktop alerts are on.';
    } else if (Notification.permission === 'denied') {
      ui.btnNotify.hidden = true;
      ui.notifyState.textContent = 'Desktop alerts blocked in browser settings — sound and on-page alerts still work.';
    } else {
      ui.btnNotify.hidden = false;
      ui.notifyState.textContent = '';
    }
  }

  function requestNotifyPermission() {
    if (!('Notification' in window)) return;
    try {
      var result = Notification.requestPermission(updateNotifyUI);
      if (result && typeof result.then === 'function') result.then(updateNotifyUI);
    } catch (e) { updateNotifyUI(); }
  }

  /* ---------- events ---------- */

  ui.btnMain.addEventListener('click', function () {
    if (state.running) pause();
    else start();
  });

  ui.btnReset.addEventListener('click', resetTimer);

  ui.duration.addEventListener('change', function () {
    var v = parseTime(ui.duration.value);
    if (v === null) {
      hint(ui.durationHint, 'Use mm:ss or hh:mm:ss (e.g. 20:00 or 1:20:00). A plain number means minutes.', true);
      ui.duration.value = fmt(state.durationMs);
      return;
    }
    hint(ui.durationHint, '');
    setDuration(v, true);
  });

  ui.duration.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); ui.duration.blur(); }
  });

  ui.presets.forEach(function (chip) {
    chip.addEventListener('click', function () {
      hint(ui.durationHint, '');
      setDuration(Number(chip.dataset.preset) * 1000, true);
    });
  });

  ui.btnAddMs.addEventListener('click', addMilestone);

  ui.msInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addMilestone(); }
  });

  ui.btnNotify.addEventListener('click', requestNotifyPermission);

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    if (state.running) pause(); else start();
  });

  // Background tabs throttle timers; recompute the instant the tab is visible again.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick();
  });

  window.addEventListener('focus', tick);

  /* ---------- init ---------- */

  load();
  ui.duration.value = fmt(state.durationMs);
  updatePresetChips();
  updateNotifyUI();
  renderTimer();
  renderMilestones();
  tickClock();
  setInterval(tickClock, 1000);
})();
