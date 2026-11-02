'use strict';
/* Anke lernt Englisch – App-Logik. Benötigt data.js und logic.js (vorher geladen). */
(() => {
  const app = document.getElementById('app');

  /* ---------- Speicher ---------- */
  const KEY = 'anke-english-v1';
  const defaults = () => ({
    xp: 0, streak: 0, lastDay: null, reviewDay: null,
    done: {}, daily: {}, stats: {},
    settings: { name: 'Anke', serverUrl: '', slow: true, goal: 20 }
  });
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}');
      const d = defaults();
      return { ...d, ...o, settings: { ...d.settings, ...(o.settings || {}) } };
    } catch { return defaults(); }
  }
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* privat */ } };

  const z2 = n => String(n).padStart(2, '0');
  const dayStr = (d = new Date()) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); };
  const streakNow = () => (S.lastDay === dayStr() || S.lastDay === yesterday()) ? S.streak : 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fetchTimeout = (url, opts = {}, ms = 8000) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
  };

  /* ---------- Sprachausgabe ---------- */
  const Voice = {
    server: { ok: false, stt: false, tts: false, coach: false },
    synthVoice: null,
    audio: new Audio(),
    unlocked: false,
    token: 0,
    base() { return (S.settings.serverUrl || '').trim().replace(/\/+$/, ''); },
    pickVoice() {
      if (!('speechSynthesis' in window)) return;
      const score = v => (/en[-_]US/i.test(v.lang) ? 10 : 0) + (/premium|enhanced/i.test(v.name) ? 5 : 0) + (/samantha|ava|allison|nicky|evan/i.test(v.name) ? 3 : 0);
      const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
      this.synthVoice = vs.sort((a, b) => score(b) - score(a))[0] || null;
    },
    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      try {
        this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        const p = this.audio.play(); if (p && p.catch) p.catch(() => {});
      } catch { /* egal */ }
    },
    async check() {
      this.server = { ok: false, stt: false, tts: false, coach: false };
      const b = this.base();
      if (!b) return;
      try {
        const r = await fetchTimeout(b + '/api/health', {}, 3500);
        if (r.ok) {
          const j = await r.json();
          this.server = { ok: true, stt: !!j.stt, tts: !!j.tts, coach: !!j.coach };
        }
      } catch { /* nicht erreichbar */ }
    },
    halt() {
      try { speechSynthesis.cancel(); } catch { /* egal */ }
      try { this.audio.pause(); } catch { /* egal */ }
    },
    cancel() { this.token++; this.halt(); },
    async seq(parts) {
      const t = ++this.token;
      this.halt();
      for (const p of parts) {
        if (t !== this.token) return;
        if (p.pause) { await sleep(p.pause); continue; }
        await this.say(p.text, !!S.settings.slow);
      }
    },
    speak(text) { return this.seq([{ text }]); },
    async say(text, slow) {
      if (this.server.ok && this.server.tts) {
        try {
          const r = await fetchTimeout(`${this.base()}/api/tts?text=${encodeURIComponent(text)}&slow=${slow ? 1 : 0}`, {}, 15000);
          if (r.ok) return await this.playBlob(await r.blob());
        } catch { /* Fallback auf iPhone-Stimme */ }
      }
      return this.synth(text, slow);
    },
    playBlob(blob) {
      return new Promise(res => {
        const a = this.audio, url = URL.createObjectURL(blob);
        a.src = url;
        a.onended = a.onerror = () => { URL.revokeObjectURL(url); res(); };
        const p = a.play(); if (p && p.catch) p.catch(() => res());
      });
    },
    synth(text, slow) {
      return new Promise(res => {
        if (!('speechSynthesis' in window)) return res();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        if (this.synthVoice) u.voice = this.synthVoice;
        u.rate = slow ? 0.6 : 0.9;
        u.onend = u.onerror = () => res();
        speechSynthesis.speak(u);
        setTimeout(res, 12000);
      });
    }
  };

  /* ---------- Zuhören (Spracherkennung) ---------- */
  const Listen = {
    rec: null, mr: null,
    browserOk() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
    serverOk() { return Voice.server.ok && Voice.server.stt && !!(navigator.mediaDevices && window.MediaRecorder); },
    available() { return this.serverOk() || this.browserOk(); },
    start() { return this.serverOk() ? this.viaServer() : this.viaBrowser(); },
    stopNow() {
      try { if (this.rec) this.rec.stop(); } catch { /* egal */ }
      try { if (this.mr && this.mr.state === 'recording') this.mr.stop(); } catch { /* egal */ }
    },
    viaBrowser() {
      return new Promise((resolve, reject) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const r = new SR();
        this.rec = r;
        r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
        let got = false;
        r.onresult = e => {
          got = true;
          const alts = [];
          for (const res of e.results) for (let i = 0; i < res.length; i++) alts.push(res[i].transcript);
          resolve({ alts, via: 'iPhone' });
        };
        r.onerror = e => {
          if (got) return;
          got = true;
          if (e.error === 'no-speech' || e.error === 'aborted') resolve({ alts: [], via: 'iPhone' });
          else reject(new Error(e.error));
        };
        r.onend = () => { if (!got) { got = true; resolve({ alts: [], via: 'iPhone' }); } };
        try { r.start(); } catch (err) { reject(err); }
      });
    },
    async viaServer() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this.mr = mr;
      const chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { mr.onstop = res; });
      mr.start();
      const timer = setTimeout(() => { try { if (mr.state === 'recording') mr.stop(); } catch { /* egal */ } }, 4000);
      await stopped;
      clearTimeout(timer);
      stream.getTracks().forEach(t => t.stop());
      const type = mr.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (blob.size < 1000) return { alts: [], via: 'Ryzen' };
      const r = await fetchTimeout(Voice.base() + '/api/stt', { method: 'POST', headers: { 'Content-Type': type }, body: blob }, 30000);
      if (!r.ok) throw new Error('Server ' + r.status);
      const j = await r.json();
      return { alts: [j.text || ''], via: 'Ryzen' };
    }
  };

  function errMsg(e) {
    const m = String((e && (e.message || e.error || e.name)) || '');
    if (/not-allowed|permission|denied/i.test(m)) return 'Das Mikrofon ist nicht erlaubt. iPhone: Einstellungen → Safari → Mikrofon → Erlauben. Außerdem „Siri & Diktierfunktion“ einschalten.';
    if (/network/i.test(m)) return 'Für die Spracherkennung fehlt gerade die Internetverbindung.';
    return 'Das hat nicht geklappt (' + m + '). Bitte nochmal versuchen.';
  }

  /* ---------- Lektionen bauen ---------- */
  const learnedLetters = () => {
    const s = new Set();
    LESSONS.forEach(les => { if (S.done[les.id]) les.letters.forEach(l => s.add(l)); });
    return [...s];
  };
  const ALL = LETTERS.map(x => x.l);
  const optsFor = (l, pool) => buildOptions(l, pool.length >= 4 ? pool : ALL);

  function buildLesson(les) {
    const set = les.letters;
    const pool = [...new Set([...learnedLetters(), ...set])];
    const steps = [];
    for (const l of set) { steps.push({ t: 'teach', L: LETTER_BY[l] }); steps.push({ t: 'repeat', L: LETTER_BY[l] }); }
    for (const l of shuffle(set)) steps.push({ t: 'listen', L: LETTER_BY[l], opts: optsFor(l, pool) });
    for (const l of shuffle(set)) steps.push({ t: 'match', L: LETTER_BY[l], opts: optsFor(l, pool) });
    for (const l of shuffle(set)) steps.push({ t: 'sayword', L: LETTER_BY[l] });
    if (les.reviewExtra) {
      shuffle(ALL.filter(l => !set.includes(l))).slice(0, les.reviewExtra)
        .forEach((l, i) => steps.push({ t: i % 2 ? 'match' : 'listen', L: LETTER_BY[l], opts: optsFor(l, ALL) }));
    }
    return steps;
  }

  function buildReview() {
    const learned = learnedLetters();
    const r = rng(seedFromStr(dayStr()));
    const weak = [...learned].sort((a, b) => {
      const sa = S.stats[a] || { ok: 0, bad: 0 }, sb = S.stats[b] || { ok: 0, bad: 0 };
      return (sb.bad - sb.ok) - (sa.bad - sa.ok);
    }).slice(0, 2);
    const rest = shuffle(learned.filter(l => !weak.includes(l)), r).slice(0, 4 - weak.length);
    const pick = shuffle([...weak, ...rest], r);
    const steps = [];
    pick.forEach(l => steps.push({ t: 'listen', L: LETTER_BY[l], opts: optsFor(l, learned) }));
    pick.slice(0, 3).forEach(l => steps.push({ t: 'match', L: LETTER_BY[l], opts: optsFor(l, learned) }));
    pick.slice(0, 2).forEach(l => steps.push({ t: 'repeat', L: LETTER_BY[l] }));
    pick.slice(0, 1).forEach(l => steps.push({ t: 'sayword', L: LETTER_BY[l] }));
    return shuffle(steps, r);
  }

  /* ---------- Zustand ---------- */
  let view = 'home';
  let R = null;

  function bump(letter, ok) {
    const s = S.stats[letter] || (S.stats[letter] = { ok: 0, bad: 0 });
    ok ? s.ok++ : s.bad++;
  }

  function startRun(kind, lesson) {
    Voice.cancel();
    R = {
      kind, lesson,
      steps: kind === 'lesson' ? buildLesson(lesson) : buildReview(),
      i: 0, xp: 0, right: 0, wrong: 0,
      stage: 'question', mic: 'idle', heard: null, grade: null, msg: null, picked: null, coach: null, err: null
    };
    view = 'run';
    render();
    autoplay();
  }

  function resetStep() {
    R.stage = 'question'; R.mic = 'idle'; R.heard = null; R.grade = null;
    R.msg = null; R.picked = null; R.coach = null; R.err = null;
  }

  function nextStep() {
    Voice.cancel();
    if (R.i + 1 >= R.steps.length) return finishRun();
    R.i++;
    resetStep();
    render();
    autoplay();
  }

  function autoplay() {
    const st = R.steps[R.i];
    if (!st) return;
    const L = st.L;
    if (st.t === 'teach') Voice.seq([{ text: L.tts }, { pause: 450 }, { text: 'like ' + L.word }]);
    else if (st.t === 'listen' || st.t === 'repeat') Voice.speak(L.tts);
    else if (st.t === 'sayword' || st.t === 'match') Voice.speak(L.word);
  }

  function retryLater(st) {
    if (st.retry) return;
    const copy = { ...st, retry: true };
    if (copy.opts) { const learned = learnedLetters(); copy.opts = optsFor(st.L.l, learned.length >= 4 ? learned : ALL); }
    R.steps.push(copy);
  }

  function finishRun() {
    const t = dayStr();
    const gain = R.xp + 10;
    S.xp += gain;
    S.daily[t] = (S.daily[t] || 0) + gain;
    if (S.lastDay !== t) {
      S.streak = S.lastDay === yesterday() ? S.streak + 1 : 1;
      S.lastDay = t;
    }
    if (R.kind === 'lesson') S.done[R.lesson.id] = (S.done[R.lesson.id] || 0) + 1;
    else S.reviewDay = t;
    save();
    R.gain = gain;
    view = 'done';
    render();
    Voice.speak('Great job!');
  }

  /* ---------- Antworten ---------- */
  function answerPick(value) {
    const st = R.steps[R.i];
    if (R.stage !== 'question') return;
    R.picked = value;
    R.stage = 'answered';
    const L = st.L;
    if (value === L.l) {
      R.right++; R.xp += 10; bump(L.l, true);
      R.msg = { cls: 'ok', title: 'Richtig! 🎉', text: `${L.l} = „${L.say}“ · ${L.l} like ${L.word}` };
    } else {
      R.wrong++; bump(L.l, false); retryLater(st);
      R.msg = { cls: 'bad', title: 'Fast!', text: `Richtig ist ${L.l} = „${L.say}“ · ${L.l} like ${L.word}` };
    }
    render();
    Voice.seq([{ text: L.tts }, { pause: 350 }, { text: 'like ' + L.word }]);
  }

  async function onMic() {
    const st = R.steps[R.i];
    if (R.mic === 'listening') { Listen.stopNow(); return; }
    if (!Listen.available() || R.stage === 'answered') return;
    Voice.cancel();
    R.mic = 'listening'; R.heard = null; R.err = null; R.stage = 'question'; R.grade = null; R.coach = null;
    render();
    let res;
    try { res = await Listen.start(); }
    catch (e) { if (R.steps[R.i] === st) { R.mic = 'idle'; R.err = errMsg(e); render(); } return; }
    if (R.steps[R.i] !== st) return;
    R.mic = 'idle';
    const alts = res.alts.filter(Boolean);
    R.heard = alts[0] || '';
    const g = st.t === 'repeat' ? gradeLetter(st.L, alts) : gradeWord(st.L.word, alts);
    R.grade = g;
    if (g === 'good' || g === 'close') {
      R.stage = 'answered'; R.right++; R.xp += g === 'good' ? 10 : 5; bump(st.L.l, true);
      R.msg = g === 'good'
        ? { cls: 'ok', title: 'Sehr gut! 🎉', text: 'Das war richtig.' }
        : { cls: 'ok', title: 'Fast perfekt! 👍', text: 'Das reicht – du bist auf dem richtigen Weg.' };
    } else {
      R.stage = 'miss';
      R.msg = { cls: 'bad', title: 'Noch nicht ganz', text: R.heard ? `Ich habe verstanden: „${R.heard}“` : 'Ich habe nichts gehört.' };
      fetchCoach(st, R.heard);
    }
    render();
  }

  function skipMic() {
    const st = R.steps[R.i];
    Listen.stopNow();
    R.wrong++; bump(st.L.l, false); retryLater(st);
    R.stage = 'answered';
    R.msg = { cls: 'bad', title: 'Kein Problem', text: 'Wir üben das gleich nochmal.' };
    render();
  }

  function selfSay() {
    const st = R.steps[R.i];
    R.right++; R.xp += 5; bump(st.L.l, true);
    R.stage = 'answered';
    R.msg = { cls: 'ok', title: 'Prima! 👍', text: 'Weiter so!' };
    render();
  }

  async function fetchCoach(st, heard) {
    if (!(Voice.server.ok && Voice.server.coach)) return;
    try {
      const r = await fetchTimeout(Voice.base() + '/api/coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: st.t === 'repeat' ? 'letter' : 'word',
          target: st.t === 'repeat' ? `${st.L.l} (${st.L.tts})` : st.L.word,
          heard, name: S.settings.name
        })
      }, 25000);
      if (!r.ok) return;
      const j = await r.json();
      if (R && R.steps[R.i] === st && j.text) { R.coach = j.text; render(); }
    } catch { /* Coach ist optional */ }
  }

  /* ---------- Darstellung ---------- */
  function greeting() {
    const h = new Date().getHours();
    return (h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend') + ', ' + esc(S.settings.name) + '!';
  }

  function renderHome() {
    const today = S.daily[dayStr()] || 0, goal = S.settings.goal;
    const pct = Math.min(100, Math.round(today / goal * 100));
    const nextId = (LESSONS.find(l => !S.done[l.id]) || {}).id;
    const learned = learnedLetters().length;
    const reviewDone = S.reviewDay === dayStr();
    const nodes = LESSONS.map((les, i) => {
      const done = !!S.done[les.id];
      const open = done || les.id === nextId;
      const cls = done ? 'done' : open ? 'current' : 'locked';
      return `<div class="node pos${i % 4}">
        <button class="circle ${cls}" ${open ? `data-act="start" data-id="${les.id}"` : 'disabled'} aria-label="Lektion ${les.id}">
          <span>${done ? '✓' : open ? les.icon : '🔒'}</span>
        </button>
        <div class="nlabel">${esc(les.title)}${les.id === nextId ? '<br><b>START</b>' : ''}</div>
      </div>`;
    }).join('');
    const soon = COMING_SOON.map((c, i) => `<div class="node pos${(LESSONS.length + i) % 4} soon">
        <div class="circle locked"><span>${c.icon}</span></div><div class="nlabel">${esc(c.title)}<br><i>kommt bald</i></div></div>`).join('');
    return `<div class="page">
      <header class="head">
        <div class="stat">🔥 <b>${streakNow()}</b><small>Tage</small></div>
        <div class="stat">⭐ <b>${S.xp}</b><small>XP</small></div>
        <div class="stat">🔤 <b>${learned}/26</b><small>Buchstaben</small></div>
        <button class="icon" data-act="settings" aria-label="Einstellungen">⚙️</button>
      </header>
      <h1 class="hello">${greeting()}</h1>
      <div class="goal"><div class="goalrow"><span>Tagesziel</span><b>${Math.min(today, goal)} / ${goal} XP</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <button class="card review ${learned ? '' : 'off'}" ${learned ? 'data-act="review"' : 'disabled'}>
        <span class="em">🌞</span>
        <span><b>Tagesübung</b><br><small>${learned ? (reviewDone ? 'Heute erledigt ✓ – gern nochmal' : '10 kurze Aufgaben aus deinen Buchstaben') : 'Schließe zuerst Lektion 1 ab'}</small></span>
      </button>
      <h2 class="sect">Alphabet</h2>
      <div class="path">${nodes}${soon}</div>
    </div>`;
  }

  function micBlock(st) {
    const can = Listen.available();
    if (!can) {
      return `<p class="hint">Dein Gerät hat gerade keine Spracherkennung. Sprich laut nach und tippe dann auf den Knopf.</p>
        <button class="btn primary" data-act="selfsay">Ich habe es gesagt ✓</button>`;
    }
    const listening = R.mic === 'listening';
    let info = '';
    if (listening) info = '<p class="hint">Ich höre zu … sprich jetzt! (Tippe nochmal zum Beenden)</p>';
    else if (R.heard !== null && R.stage !== 'question') info = '';
    else info = '<p class="hint">Tippe auf das Mikrofon und sprich.</p>';
    return `<button class="mic ${listening ? 'live' : ''}" data-act="mic" aria-label="Sprechen">🎤</button>${info}
      ${R.err ? `<p class="err">${esc(R.err)}</p>` : ''}`;
  }

  function renderRun() {
    const st = R.steps[R.i];
    const L = st.L;
    const pct = Math.round(R.i / R.steps.length * 100);
    let body = '', foot = '';

    const letterBig = `<div class="bigL">${L.l}<small>${L.l.toLowerCase()}</small></div>`;

    if (st.t === 'teach') {
      body = `<div class="bubble">🦊 <span>Hör zu und lies mit:</span></div>
        ${letterBig}
        <div class="say">gesprochen: <b>${esc(L.say)}</b></div>
        <div class="wordcard"><span class="em">${L.emoji}</span>
          <div><div class="en">${L.l} like <b>${L.word}</b></div><div class="ph">(${esc(L.wsay)}) · ${esc(L.de)}</div></div></div>
        <div class="row2">
          <button class="btn ghost" data-act="play-letter">🔊 ${L.l}</button>
          <button class="btn ghost" data-act="play-word">🔊 ${L.l} like ${L.word}</button>
        </div>
        <p class="tip">💡 ${esc(L.tip)}</p>`;
      foot = `<div class="foot"><button class="btn primary" data-act="next">Weiter</button></div>`;
    } else if (st.t === 'repeat') {
      body = `<div class="bubble">🦊 <span>Jetzt du, ${esc(S.settings.name)}! Sprich nach:</span></div>
        ${letterBig}
        <div class="say">gesprochen: <b>${esc(L.say)}</b></div>
        <button class="btn ghost small" data-act="play-letter">🔊 Nochmal anhören</button>
        ${micBlock(st)}`;
    } else if (st.t === 'sayword') {
      body = `<div class="bubble">🦊 <span>Sag das Wort:</span></div>
        <div class="bigE">${L.emoji}</div>
        <div class="bigW">${L.word}</div>
        <div class="say">gesprochen: <b>${esc(L.wsay)}</b> · ${esc(L.de)}</div>
        <button class="btn ghost small" data-act="play-w">🔊 Nochmal anhören</button>
        ${micBlock(st)}`;
    } else if (st.t === 'listen') {
      body = `<div class="bubble">🦊 <span>Welchen Buchstaben hörst du?</span></div>
        <button class="speaker" data-act="play-letter" aria-label="Abspielen">🔊</button>
        ${optionsHtml(st)}`;
    } else if (st.t === 'match') {
      body = `<div class="bubble">🦊 <span>Mit welchem Buchstaben beginnt das Wort?</span></div>
        <div class="bigE">${L.emoji}</div>
        <div class="bigW">${L.word}</div>
        <div class="say">(${esc(L.wsay)}) · ${esc(L.de)}</div>
        <button class="btn ghost small" data-act="play-w">🔊 Anhören</button>
        ${optionsHtml(st)}`;
    }

    if (st.t !== 'teach') {
      if (R.stage === 'question') {
        if (st.t === 'repeat' || st.t === 'sayword') foot = `<div class="foot slim"><button class="link" data-act="skip">Überspringen</button></div>`;
      } else {
        const m = R.msg || { cls: 'ok', title: '', text: '' };
        const coach = R.coach ? `<p class="coach">🦊 ${esc(R.coach)}</p>` : '';
        const tip = (R.stage === 'miss') ? `<p class="coach">💡 ${esc(L.tip)}</p>` : '';
        const btns = R.stage === 'miss'
          ? `<div class="row2"><button class="btn ghost" data-act="mic">🎤 Nochmal</button><button class="btn primary" data-act="skip">Weiter</button></div>`
          : `<button class="btn primary" data-act="next">Weiter</button>`;
        foot = `<div class="foot fb ${m.cls}"><div class="fbt">${esc(m.title)}</div><div class="fbx">${esc(m.text)}</div>${tip}${coach}${btns}</div>`;
      }
    }

    return `<div class="run">
      <div class="topbar"><button class="x" data-act="quit" aria-label="Beenden">✕</button>
        <div class="bar"><i style="width:${pct}%"></i></div><span class="chip">⭐ ${R.xp}</span></div>
      <div class="stage">${body}</div>${foot}</div>`;
  }

  function optionsHtml(st) {
    const answered = R.stage !== 'question';
    return `<div class="opts">${st.opts.map(v => {
      let c = 'opt';
      if (answered) c += v === st.L.l ? ' right' : v === R.picked ? ' wrong' : ' dim';
      return `<button class="${c}" data-act="pick" data-v="${v}" ${answered ? 'disabled' : ''}>${v}<small>${esc(LETTER_BY[v].say)}</small></button>`;
    }).join('')}</div>`;
  }

  function renderDone() {
    const total = R.right + R.wrong;
    const acc = total ? Math.round(R.right / total * 100) : 100;
    const msg = acc >= 80 ? 'Fantastisch!' : acc >= 50 ? 'Gut gemacht!' : 'Übung macht den Meister!';
    return `<div class="page center">
      <div class="trophy">🏆</div>
      <h1>${msg}</h1>
      <p class="sub">${R.kind === 'lesson' ? 'Lektion geschafft' : 'Tagesübung geschafft'}, ${esc(S.settings.name)}!</p>
      <div class="results">
        <div><b>+${R.gain}</b><small>XP</small></div>
        <div><b>${acc}%</b><small>richtig</small></div>
        <div><b>🔥 ${streakNow()}</b><small>Tage in Folge</small></div>
      </div>
      <button class="btn primary big" data-act="home">Weiter</button>
    </div>`;
  }

  function renderSettings() {
    const s = S.settings;
    let srv;
    if (!Voice.base()) srv = 'Kein Server eingetragen – es wird die Stimme des iPhones benutzt.';
    else if (Voice.server.ok) srv = `✅ Ryzen-Server verbunden · Zuhören: ${Voice.server.stt ? 'ja' : 'nein'} · Sprechen: ${Voice.server.tts ? 'ja' : 'nein'} · Coach: ${Voice.server.coach ? 'ja' : 'nein'}`;
    else srv = '⚠️ Server nicht erreichbar – es wird die Stimme des iPhones benutzt.';
    const vname = Voice.synthVoice ? Voice.synthVoice.name : 'keine englische Stimme gefunden';
    return `<div class="page">
      <header class="head"><button class="icon" data-act="home" aria-label="Zurück">←</button><h1 class="title">Einstellungen</h1></header>
      <label class="field">Name<input data-set="name" value="${esc(s.name)}" autocomplete="off"></label>
      <label class="field">Ryzen-Server (optional)<input data-set="serverUrl" value="${esc(s.serverUrl)}" placeholder="https://mein-ryzen.tailxxxx.ts.net" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <p class="hint left">${srv}</p>
      <label class="field row"><span>Langsam sprechen</span><input type="checkbox" data-set="slow" ${s.slow ? 'checked' : ''}></label>
      <label class="field">Tagesziel
        <select data-set="goal">${[10, 20, 30, 50].map(g => `<option value="${g}" ${g === s.goal ? 'selected' : ''}>${g} XP</option>`).join('')}</select></label>
      <div class="statusbox">
        <div>🔊 iPhone-Stimme: <b>${esc(vname)}</b></div>
        <div>🎤 Spracherkennung: <b>${Listen.serverOk() ? 'Ryzen (Whisper)' : Listen.browserOk() ? 'iPhone / Safari' : 'nicht verfügbar'}</b></div>
      </div>
      <div class="row2"><button class="btn ghost" data-act="test-server">Server testen</button><button class="btn ghost" data-act="test-voice">Stimme testen</button></div>
      <button class="btn danger" data-act="reset">Fortschritt zurücksetzen</button>
    </div>`;
  }

  function render() {
    if (view === 'home') app.innerHTML = renderHome();
    else if (view === 'run') app.innerHTML = renderRun();
    else if (view === 'done') app.innerHTML = renderDone();
    else if (view === 'settings') app.innerHTML = renderSettings();
    window.scrollTo(0, 0);
  }

  /* ---------- Ereignisse ---------- */
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    Voice.unlock();
    const act = el.dataset.act;
    const st = R && R.steps ? R.steps[R.i] : null;
    switch (act) {
      case 'start': startRun('lesson', LESSONS.find(l => l.id === +el.dataset.id)); break;
      case 'review': startRun('review'); break;
      case 'settings': view = 'settings'; Voice.check().then(() => { if (view === 'settings') render(); }); render(); break;
      case 'home': view = 'home'; R = null; Voice.cancel(); render(); break;
      case 'quit':
        if (confirm('Lektion beenden? Der Fortschritt dieser Lektion geht verloren.')) { view = 'home'; R = null; Voice.cancel(); render(); }
        break;
      case 'next': nextStep(); break;
      case 'play-letter': if (st) Voice.speak(st.L.tts); break;
      case 'play-word': if (st) Voice.seq([{ text: st.L.tts }, { pause: 350 }, { text: 'like ' + st.L.word }]); break;
      case 'play-w': if (st) Voice.speak(st.L.word); break;
      case 'pick': answerPick(el.dataset.v); break;
      case 'mic': onMic(); break;
      case 'skip':
        if (R.stage === 'miss') { R.stage = 'answered'; R.wrong++; bump(st.L.l, false); retryLater(st); nextStep(); }
        else skipMic();
        break;
      case 'selfsay': selfSay(); break;
      case 'test-voice': Voice.speak('Hello ' + S.settings.name + '! A, B, C. H like horse.'); break;
      case 'test-server': Voice.check().then(() => render()); break;
      case 'reset':
        if (confirm('Wirklich alles zurücksetzen (XP, Serie, Lektionen)?')) {
          const keep = S.settings; S = defaults(); S.settings = keep; save(); view = 'home'; render();
        }
        break;
    }
  });

  app.addEventListener('change', e => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const k = el.dataset.set;
    S.settings[k] = el.type === 'checkbox' ? el.checked : k === 'goal' ? +el.value : el.value.trim();
    save();
    if (k === 'serverUrl') Voice.check().then(() => { if (view === 'settings') render(); });
    else render();
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) Voice.cancel(); });

  /* ---------- Start ---------- */
  Voice.pickVoice();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => Voice.pickVoice();
  Voice.check().then(() => { if (view === 'home' || view === 'settings') render(); });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
