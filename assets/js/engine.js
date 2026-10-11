// Mom's DIY Helper: chat engine.
// All text from the model, the visitor or JSON is rendered with textContent.
(function () {
  'use strict';

  var SILENCE_MS = 10000;          // mic turns off after this much silence
  var STORE_KEY = 'mdh-chat-v1';   // sessionStorage: clears when the tab closes
  var PROJECT = "Mom's DIY Helper";
  var FILE_SLUG = 'moms-diy-helper-plan';
  var BOT_LABEL = 'Helper';
  var MAX_PAYLOAD = 30000;         // stays under the server's 32 KB body limit

  var $ = function (id) { return document.getElementById(id); };
  var log = $('log'), input = $('chatInput'), sendBtn = $('sendBtn'), micBtn = $('micBtn');
  var micStatus = $('micStatus'), chatError = $('chatError'), countChip = $('countChip');
  var emptyState = $('emptyState'), resetBtn = $('resetBtn'), downloadBtn = $('downloadBtn');
  var fullBtn = $('fullBtn'), chatCard = $('chatCard');

  var state = { messages: [], matches: [], selected: '', nextStep: '' };
  var busy = false;

  /* ---------- storage ---------- */
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && Array.isArray(s.messages)) {
        state.messages = s.messages.filter(function (m) {
          return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
        });
        state.matches = Array.isArray(s.matches) ? s.matches.map(cleanMatch).filter(Boolean) : [];
        state.selected = typeof s.selected === 'string' ? s.selected : '';
        state.nextStep = typeof s.nextStep === 'string' ? s.nextStep : '';
      }
    } catch (e) { /* ignore unreadable state */ }
  }

  /* ---------- reply parsing ---------- */
  var MATCH_RE = /^\s*MATCH:/i;
  function splitReply(text) {
    var visible = [], found = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      if (MATCH_RE.test(line)) {
        var json = line.replace(/^\s*MATCH:\s*/i, '');
        try { var m = cleanMatch(JSON.parse(json)); if (m) found.push(m); } catch (e) { /* malformed: drop */ }
      } else {
        visible.push(line);
      }
    });
    var vis = visible.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    found.sort(function (a, b) { return b.score - a.score; });
    return { visible: vis, matches: found.slice(0, 5) };
  }
  function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function cleanMatch(m) {
    if (!m || typeof m !== 'object') return null;
    var title = str(m.title, 120);
    if (!title) return null;
    var id = str(m.id, 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) id = slug(title) || 'plan';
    var score = Math.round(Number(m.score));
    if (!isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, score));
    var details = {};
    if (m.details && typeof m.details === 'object') {
      Object.keys(m.details).slice(0, 12).forEach(function (k) {
        var key = str(k, 40), val = typeof m.details[k] === 'number' ? String(m.details[k]) : str(m.details[k], 300);
        if (key && val) details[key] = val;
      });
    }
    return { id: id, title: title, score: score, why: str(m.why, 300), kind: str(m.kind, 40), details: details };
  }
  function findNextStep(visible) {
    var lines = visible.split('\n');
    for (var i = lines.length - 1; i >= 0; i--) {
      var t = lines[i].replace(/\*\*/g, '').trim();
      if (/^next step:/i.test(t)) return t.replace(/^next step:\s*/i, '').trim();
    }
    return '';
  }

  /* ---------- rendering ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function renderBotText(container, text) {
    var lines = text.split('\n');
    var list = null, listType = '', para = [];
    function flushPara() {
      if (!para.length) return;
      var joined = para.join(' ');
      var p = el('p');
      if (/^next step:/i.test(joined)) {
        p.appendChild(el('span', 'next-line', 'Next step: '));
        p.appendChild(document.createTextNode(joined.replace(/^next step:\s*/i, '')));
      } else {
        p.textContent = joined;
      }
      container.appendChild(p);
      para = [];
    }
    function flushList() { list = null; listType = ''; }
    lines.forEach(function (raw) {
      var line = raw.replace(/\*\*/g, '').replace(/^#{1,6}\s+/, '').trimEnd();
      var num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      var bul = line.match(/^\s*[-•*]\s+(.*)$/);
      if (num || bul) {
        flushPara();
        var type = num ? 'ol' : 'ul';
        if (!list || listType !== type) {
          list = el(type); listType = type;
          if (num && num[1] !== '1') list.setAttribute('start', num[1]);
          container.appendChild(list);
        }
        list.appendChild(el('li', '', num ? num[2] : bul[1]));
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else if (/^next step:/i.test(line.trim())) {
        flushList(); flushPara(); para.push(line.trim()); flushPara();
      } else {
        flushList(); para.push(line.trim());
      }
    });
    flushPara();
  }
  function addBubble(role, content) {
    if (emptyState) emptyState.hidden = true;
    var b = el('div', 'bubble ' + (role === 'user' ? 'user' : 'bot'));
    if (role === 'user') {
      b.textContent = content;
    } else {
      var label = el('span', 'sr-only', BOT_LABEL + ' says: ');
      b.appendChild(label);
      renderBotText(b, splitReply(content).visible || 'Here are the matching plans.');
    }
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }
  function addError(message) {
    var b = el('div', 'bubble error', message);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }
  function updateCount() {
    var n = state.messages.length;
    countChip.textContent = n === 0 ? 'No messages yet' : n === 1 ? '1 message' : n + ' messages';
  }
  function hasReply() {
    return state.messages.some(function (m) { return m.role === 'assistant'; });
  }
  function updateDownload() { downloadBtn.disabled = !hasReply(); }

  function renderSide() {
    var top = state.matches[0];
    $('tileTitle').textContent = top ? top.title : 'Waiting for your first question';
    $('tileKind').textContent = top && top.kind ? top.kind : 'Project plan';
    $('fitNum').textContent = top ? String(top.score) : '—';
    $('fitWhy').textContent = top ? (top.why || 'Best fit for what you described.') :
      "Tell the helper what's going on and the best-fitting plan appears here.";
    $('gaugeNum').textContent = top ? String(top.score) : '—';
    var gv = $('gaugeValue');
    gv.setAttribute('stroke-dasharray', (top ? top.score : 0) + ' 100');
    gv.setAttribute('stroke-opacity', top && top.score > 0 ? '1' : '0');

    var listEl = $('shortList');
    listEl.textContent = '';
    $('shortEmpty').hidden = state.matches.length > 0;
    if (state.matches.length && !state.matches.some(function (m) { return m.id === state.selected; })) {
      state.selected = state.matches[0].id;
    }
    state.matches.forEach(function (m) {
      var li = el('li');
      var b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', m.id === state.selected ? 'true' : 'false');
      b.appendChild(el('span', '', m.title));
      b.appendChild(el('span', 'score', String(m.score)));
      b.setAttribute('aria-label', m.title + ', fit score ' + m.score);
      b.addEventListener('click', function () { state.selected = m.id; save(); renderSide(); });
      li.appendChild(b);
      listEl.appendChild(li);
    });
    renderDetails();
  }
  function renderDetails() {
    var m = state.matches.filter(function (x) { return x.id === state.selected; })[0];
    var dl = $('detailList');
    dl.textContent = '';
    $('detailEmpty').hidden = !!m;
    var link = $('guideLink');
    if (m) {
      Object.keys(m.details).forEach(function (k) {
        if (/^guide$/i.test(k)) return;
        var row = el('div');
        row.appendChild(el('dt', '', k));
        row.appendChild(el('dd', '', m.details[k]));
        dl.appendChild(row);
      });
      link.href = '/guide#' + m.id;
      link.textContent = 'Read this in the guide';
    } else {
      link.href = '/guide';
      link.textContent = 'Read the full guide';
    }
    $('nextText').textContent = state.nextStep || 'Your next step shows up here after the first plan.';
  }

  function renderAll() {
    log.querySelectorAll('.bubble').forEach(function (n) { n.remove(); });
    if (emptyState) emptyState.hidden = state.messages.length > 0;
    state.messages.forEach(function (m) { addBubble(m.role, m.content); });
    updateCount(); updateDownload(); renderSide();
  }

  /* ---------- thinking indicator ---------- */
  var thinking = null, waitTimers = [];
  function showThinking() {
    hideThinking();
    thinking = el('div', 'bubble bot thinking');
    var dots = el('span', 'dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.appendChild(el('span')); dots.appendChild(el('span')); dots.appendChild(el('span'));
    thinking.appendChild(dots);
    thinking.appendChild(el('span', 'sr-only', 'The helper is working on your project.'));
    var note = el('p', 'wait-note');
    note.hidden = true;
    thinking.appendChild(note);
    log.appendChild(thinking);
    log.scrollTop = log.scrollHeight;
    waitTimers.push(setTimeout(function () {
      note.textContent = 'Still working. Detailed plans can take up to a minute.';
      note.hidden = false; log.scrollTop = log.scrollHeight;
    }, 8000));
    waitTimers.push(setTimeout(function () {
      note.textContent = 'Almost there. Putting the steps in order.';
      note.hidden = false;
    }, 30000));
  }
  function hideThinking() {
    waitTimers.forEach(clearTimeout); waitTimers = [];
    if (thinking) { thinking.remove(); thinking = null; }
  }
  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    if (on) sendBtn.setAttribute('aria-busy', 'true'); else sendBtn.removeAttribute('aria-busy');
  }

  /* ---------- sending ---------- */
  function buildPayload() {
    var out = [], size = 20;
    for (var i = state.messages.length - 1; i >= 0 && out.length < 24; i--) {
      var m = state.messages[i];
      var content = m.role === 'assistant' ? m.content.slice(0, 6000) : m.content;
      var add = JSON.stringify({ role: m.role, content: content }).length + 1;
      if (size + add > MAX_PAYLOAD) break;
      size += add;
      out.unshift({ role: m.role, content: content });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    return { messages: out };
  }

  function send() {
    if (busy) return;
    if (listening) stopListening();
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    hideError();
    state.messages.push({ role: 'user', content: text });
    addBubble('user', text);
    input.value = '';
    autosize();
    updateCount(); save();
    setBusy(true);
    showThinking();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, data: data };
      });
    }).then(function (r) {
      hideThinking();
      if (!r.ok || !r.data || typeof r.data.reply !== 'string') {
        addError((r.data && typeof r.data.error === 'string' && r.data.error) ||
          "The helper couldn't answer just now. Please try again in a moment.");
        return;
      }
      var reply = r.data.reply;
      state.messages.push({ role: 'assistant', content: reply });
      var parsed = splitReply(reply);
      if (parsed.matches.length) {
        state.matches = parsed.matches;
        state.selected = parsed.matches[0].id;
      }
      var next = findNextStep(parsed.visible);
      if (next) state.nextStep = next;
      addBubble('assistant', reply);
      updateCount(); updateDownload(); renderSide(); save();
    }).catch(function () {
      hideThinking();
      addError("Couldn't reach the helper. Check your internet connection and try again.");
    }).then(function () {
      setBusy(false);
    });
  }

  /* ---------- composer ---------- */
  function autosize() {
    input.style.height = 'auto';
    var max = parseFloat(getComputedStyle(input).maxHeight) || 144;
    var h = Math.min(input.scrollHeight + 2, max);
    input.style.height = h + 'px';
    input.style.overflowY = input.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  function showError(msg) { chatError.textContent = msg; chatError.hidden = false; }
  function hideError() { chatError.textContent = ''; chatError.hidden = true; }

  /* ---------- start over ---------- */
  resetBtn.addEventListener('click', function () {
    if (listening) stopListening();
    hideThinking();
    state = { messages: [], matches: [], selected: '', nextStep: '' };
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    log.querySelectorAll('.bubble').forEach(function (n) { n.remove(); });
    if (emptyState) emptyState.hidden = false;
    hideError();
    input.value = ''; autosize();
    updateCount(); updateDownload(); renderSide();
    input.focus();
  });

  /* ---------- full page ---------- */
  function setFull(on) {
    chatCard.classList.toggle('is-full', on);
    fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullBtn.textContent = on ? 'Exit full page' : 'Full page';
    if (on) input.focus(); else fullBtn.focus();
    log.scrollTop = log.scrollHeight;
  }
  fullBtn.addEventListener('click', function () { setFull(!chatCard.classList.contains('is-full')); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatCard.classList.contains('is-full')) setFull(false);
  });

  /* ---------- download ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  downloadBtn.addEventListener('click', function () {
    if (!hasReply()) return;
    var now = new Date();
    var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var stamp = now.toLocaleString();
    var L = [];
    L.push(PROJECT + ' - project plan saved ' + stamp, '');
    L.push('Prices and facts were checked during the conversation. Confirm them in store or with the manufacturer before acting on them.', '');
    L.push('RANKED OPTIONS', '');
    if (!state.matches.length) L.push('No ranked options yet.', '');
    state.matches.forEach(function (m, i) {
      L.push((i + 1) + '. ' + m.title + ' (fit score ' + m.score + ')');
      if (m.why) L.push('   Why: ' + m.why);
      Object.keys(m.details).forEach(function (k) {
        if (/^guide$/i.test(k)) return;
        L.push('   ' + k + ': ' + m.details[k]);
      });
      L.push('');
    });
    var lastBot = state.messages.filter(function (m) { return m.role === 'assistant'; }).pop();
    L.push('LATEST PLAN', '', lastBot ? splitReply(lastBot.content).visible : '', '');
    L.push('FULL CONVERSATION', '');
    state.messages.forEach(function (m) {
      var text = m.role === 'assistant' ? splitReply(m.content).visible : m.content;
      L.push((m.role === 'user' ? 'You: ' : BOT_LABEL + ': ') + text, '');
    });
    var body = '\uFEFF' + L.join('\n').replace(/\r?\n/g, '\r\n');
    var blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = FILE_SLUG + '-' + date + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  });

  /* ---------- voice input ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var isAndroid = /Android/i.test(navigator.userAgent || '');
  var rec = null, listening = false, baseText = '', heard = '', lastSpeech = 0, silenceTimer = null;

  function setMicUi(on) {
    micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    micBtn.setAttribute('aria-label', on ? 'Stop voice input' : 'Start voice input');
    micStatus.hidden = !on;
  }
  function armSilence() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(function () { stopListening(); }, SILENCE_MS);
  }
  function writeInput(interim) {
    var spoken = (heard + (interim ? (heard ? ' ' : '') + interim.trim() : '')).trim();
    input.value = baseText + spoken;
    autosize();
  }
  function micError(msg) {
    stopListening();
    showError(msg);
  }
  function startSession() {
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = !isAndroid;   // Android repeats words in continuous mode
    rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        var t = (r[0] && r[0].transcript) || '';
        if (r.isFinal) { t = t.trim(); if (t) heard = heard ? heard + ' ' + t : t; }
        else interim += t;
      }
      lastSpeech = Date.now();
      armSilence();
      writeInput(interim);
    };
    rec.onerror = function (e) {
      var code = e && e.error;
      if (code === 'no-speech' || code === 'aborted') return;  // silence is handled by the timer
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        micError('The microphone is blocked. Allow microphone access for this site in your browser settings, then tap the mic again.');
      } else if (code === 'audio-capture') {
        micError('No microphone was found. Check that one is connected and turned on, then tap the mic again.');
      } else if (code === 'network') {
        micError('Voice input lost its connection. Check your internet, then tap the mic again.');
      } else {
        micError("Voice input stopped unexpectedly. Tap the mic to try again, or type instead.");
      }
    };
    rec.onend = function () {
      if (!listening) return;
      writeInput('');
      if (Date.now() - lastSpeech < SILENCE_MS) {
        try { startSession(); } catch (err) {
          micError("Voice input couldn't restart. Tap the mic to try again, or type instead.");
        }
      } else {
        stopListening();
      }
    };
    rec.start();
  }
  function startListening() {
    hideError();
    var current = input.value.replace(/\s+$/, '');
    baseText = current ? current + ' ' : '';
    heard = '';
    lastSpeech = Date.now();
    listening = true;
    setMicUi(true);
    armSilence();
    try { startSession(); } catch (err) {
      micError("Voice input couldn't start. Tap the mic to try again, or type instead.");
    }
  }
  function stopListening() {
    var wasListening = listening;
    listening = false;
    clearTimeout(silenceTimer);
    if (rec) {
      var r = rec; rec = null;
      r.onend = null; r.onresult = null; r.onerror = null;
      try { r.stop(); } catch (e) { /* already stopped */ }
    }
    if (wasListening) writeInput('');
    setMicUi(false);
  }
  if (SR) {
    micBtn.hidden = false;
    micBtn.addEventListener('click', function () {
      if (listening) stopListening(); else startListening();
    });
  }

  /* ---------- init ---------- */
  load();
  renderAll();
  autosize();
})();
