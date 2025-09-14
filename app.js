import { Midi } from "https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/+esm";
import { computeNoteLeftPx, buildTempoMap, audioTimeToMs } from './player-utils.js';

(function(){
  'use strict';
  // ===== UI refs =====
  const scoreEl = document.getElementById('score');
  const scoreFile = document.getElementById('scoreFile');
  const playBtn = document.getElementById('playBtn');
  const stopBtn = document.getElementById('stopBtn');
  const offsetNum = document.getElementById('offset');
  const offsetRange = document.getElementById('offsetRange');
  const zoomRange = document.getElementById('zoom');
  const zoomVal = document.getElementById('zoomVal');
  const followChk = document.getElementById('follow');
  const tempoRange = document.getElementById('tempo');
  const tempoVal = document.getElementById('tempoVal');
  const pageInfo = document.getElementById('pageInfo');
  const timeInfo = document.getElementById('timeInfo');
  const vrvVersion = document.getElementById('vrvVersion');
  const tapAlignBtn = document.getElementById('tapAlignBtn');
  const trackControls = document.getElementById('trackControls');

  // ===== State =====
  let vrv = null;             // Verovio toolkit
  let vrvReady = false;       // toolkit listo
  let pendingScoreFile = null;// archivo seleccionado antes de init
  let page = 1, pageCount = 0;
  let rafId = null;
  let alignByClick = false;
  // MIDI state
  let ac = null;                 // AudioContext
  let midiObj = null;            // @tonejs/midi
  let midiDuration = 0;          // segundos
  let tempoEvents = [];          // mapa de tempo (segundos)
  const trackSettings = [];      // config de pista (solo volumen)
  let notePositions = {};        // cache de posiciones X por id
  let isPlaying = false;         // reproduciendo
  let startAt = 0;               // ac.currentTime cuando inicia
  let prevNoteIds = new Set();   // notas resaltadas actuales
  let tempoScale = 1;            // escala global de tempo (1 = 100%)
  // Generador de notas básico sin soundfont
  let preloadAc = null;          // AudioContext precargado

  // Playhead overlay
  const playhead = document.createElement('div');
  playhead.className = 'playhead';
  scoreEl.appendChild(playhead);

  // ===== Helpers =====
  function updateVersionLabel(){
    try { vrvVersion.textContent = vrv ? ('Verovio v' + vrv.getVersion()) : 'Verovio'; }
    catch(_) { vrvVersion.textContent = 'Verovio'; }
  }

  function setOptionsForContainer(scalePct){
    if (!vrv) return;
    const pct = Number(scalePct != null ? scalePct : zoomRange.value);
    const scale = Math.max(10, Math.round(40 * (pct / 100))); // 100% -> 40
    vrv.setOptions({
      breaks: 'none',           // tira horizontal
      svgViewBox: true,
      scaleToPageSize: false,
      adjustPageHeight: false,
      adjustPageWidth: false,
      scale: scale,
      svgBoundingBoxes: true
    });
  }

  function renderPage(n){
    if (!vrv) return;
    page = Math.max(1, Math.min(n != null ? n : page, pageCount || 1));
    const svg = vrv.renderToSVG(page, false);
    scoreEl.innerHTML = svg;
    scoreEl.appendChild(playhead);
    pageInfo.textContent = 'Pág. ' + page + '/' + (pageCount || '–');
    const wrap = document.getElementById('score-wrap');
    wrap.scrollLeft = 0;
    // precomputar posiciones de notas para animación fluida
    const svgEl = scoreEl.querySelector('svg');
    if (svgEl) {
      const vb = svgEl.viewBox.baseVal;
      const pxPerUnit = svgEl.clientWidth / vb.width;
      for (const k in notePositions) delete notePositions[k];
      svgEl.querySelectorAll('[id]').forEach(el => {
        try {
          const box = el.getBBox();
          notePositions[el.id] = Math.round(box.x * pxPerUnit) + 16;
        } catch (_) {}
      });
    }
  }

  // ===== MIDI helpers =====

  async function ensureMidiParsed(){
    if (!vrv) throw new Error('Verovio no está listo');
    const b64 = vrv.renderToMIDI();
    const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
    const ab = a.buffer;
    if (typeof Midi.fromArrayBuffer === 'function') {
      const m = await Midi.fromArrayBuffer(ab);
      midiObj = m; midiDuration = m.duration || 0; tempoEvents = buildTempoMap(m); return;
    }
    midiObj = new Midi(ab); midiDuration = midiObj.duration || 0; tempoEvents = buildTempoMap(midiObj);
  }

  function buildTrackControls(){
    if (!trackControls) return;
    trackControls.innerHTML = '';
    trackSettings.length = 0;
    if (!midiObj || !midiObj.tracks) return;
    midiObj.tracks.forEach((t, i) => {
      if (!t.notes || !t.notes.length) return;
      trackSettings[i] = { volume: 1 };
      const wrap = document.createElement('div');
      wrap.className = 'track-control';
      const label = document.createElement('span');
      label.textContent = 'Pista ' + (i + 1);
      wrap.appendChild(label);
      const vol = document.createElement('input');
      vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = 1;
      vol.addEventListener('input', () => { trackSettings[i].volume = Number(vol.value); });
      wrap.appendChild(vol);
      trackControls.appendChild(wrap);
    });
  }

  // En esta versión mínima no se cargan soundfonts externas.
  function preloadInstruments(){
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || preloadAc) return;
    try {
      preloadAc = new AudioCtx();
    } catch (_) {
      preloadAc = null;
    }
  }

  // Programación de notas usando osciladores básicos
  function scheduleAll(ctx, start){
    const delay = 0.05; // s
    if (!midiObj || !midiObj.tracks) return;
    const offset = (ctx.currentTime - start) * tempoScale; // segundos ya reproducidos
    midiObj.tracks.forEach((t, i) => {
      const settings = trackSettings[i] || {};
      const vol = settings.volume != null ? settings.volume : 1;
      if (!t.notes) return;
      t.notes.forEach(n => {
        if (n.time < offset) return; // omitir notas previas
        const when = ctx.currentTime + ((n.time - offset) / tempoScale) + delay;
        const dur = Math.max(0.04, n.duration / tempoScale);
        const vel = Math.max(0, Math.min(1, (n.velocity || 0.8) * vol));
        const midiNum = n.midi != null ? n.midi : 60;
        try {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 440 * Math.pow(2, (midiNum - 69) / 12);
          const gain = ctx.createGain();
          gain.gain.value = vel;
          osc.connect(gain).connect(ctx.destination);
          osc.start(when);
          osc.stop(when + dur);
        } catch(_){}
      });
    });
  }

  function clearHighlights(){
    const svg = scoreEl.querySelector('svg');
    prevNoteIds.forEach(id => {
      const el = svg && svg.getElementById(id);
      if (el) el.classList.remove('playing');
    });
    prevNoteIds.clear();
  }

  function stopMidi(){
    if (rafId) cancelAnimationFrame(rafId);
    if (ac){
      try{ ac.close(); }catch(_){}
      ac = null;
    }
    isPlaying = false; startAt = 0; timeInfo.textContent = '0.000 s';
    playBtn.textContent = '▶︎ Reproducir MIDI';
    clearHighlights();
  }

  // ===== Load score =====
  async function loadScoreFile(file){
    if (!vrvReady || !vrv) { pendingScoreFile = file; return; }
    const ext = file.name.toLowerCase();
    setOptionsForContainer();
    try {
      let ok = false;
      if (ext.endsWith('.mxl') || ext.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        ok = vrv.loadZipDataBuffer(buf);
      } else {
        const txt = await file.text();
        ok = vrv.loadData(txt);
      }
      if (ok === false) throw new Error('El archivo no pudo cargarse (formato no reconocido por Verovio).');
      try { vrv.redoLayout(); } catch(_){}
      pageCount = Math.max(1, vrv.getPageCount()|0);
      renderPage(1);
      if (!scoreEl.querySelector('svg')) { vrv.setOptions({ breaks: 'auto' }); vrv.redoLayout(); renderPage(1); }
      await ensureMidiParsed();
      buildTrackControls();
      preloadInstruments();
      playBtn.disabled = false; stopBtn.disabled = false;
    } catch (e) {
      console.error(e); alert('No se pudo cargar la partitura: ' + (e.message||e));
    }
  }

  // ===== Loop (playhead + autoscroll) =====
  function loop(){
    if (isPlaying && ac){
      const offsetMs = Number(offsetNum.value) || 0;
      const curSec = (ac.currentTime - startAt) * tempoScale;
      const t = Math.max(0, audioTimeToMs(tempoEvents, curSec) + offsetMs);
      timeInfo.textContent = (t/1000).toFixed(3) + ' s';
      const elems = vrv.getElementsAtTime(Math.floor(t));
      if (elems && elems.page && elems.page !== page && followChk.checked) renderPage(elems.page);
      const svg = scoreEl.querySelector('svg');
      const noteIds = new Set(elems && elems.notes ? elems.notes : []);
      // update highlights
      prevNoteIds.forEach(id => {
        if (!noteIds.has(id)){
          const el = svg && svg.getElementById(id);
          if (el) el.classList.remove('playing');
        }
      });
      noteIds.forEach(id => {
        if (!prevNoteIds.has(id)){
          const el = svg && svg.getElementById(id);
          if (el) el.classList.add('playing');
        }
      });
      prevNoteIds = noteIds;
      const noteId = elems && elems.notes && elems.notes[0];
      if (noteId && svg) {
        const leftPx = computeNoteLeftPx(noteId, svg, notePositions);
        if (leftPx !== undefined) {
          playhead.style.left = leftPx + 'px';
          if (followChk.checked) {
            const wrap = document.getElementById('score-wrap');
            const want = Math.max(0, leftPx - wrap.clientWidth * 0.4);
            if (Math.abs(want - wrap.scrollLeft) > 24) wrap.scrollLeft = want;
          }
        }
      }
      if ((ac.currentTime - startAt) >= ((midiDuration / tempoScale) + 0.5)) { stopMidi(); return; }
      rafId = requestAnimationFrame(loop);
    }
  }

  // ===== UI events =====
  scoreEl.addEventListener('click', function(e){
    const svg = scoreEl.querySelector('svg'); if (!svg || !vrv) return;
    let el = e.target; while (el && el !== svg && !el.id) el = el.parentNode;
    if (!el || !el.id) return; const id = el.id;
    const ms = Math.max(0, Math.floor(vrv.getTimeForElement(id)));
    const s = ms / 1000;
    if (isPlaying && ac) { stopMidi(); playMidiAt(s); }
  });

  scoreFile.addEventListener('change', () => {
    const f = scoreFile.files && scoreFile.files[0];
    if (!f) return;
    if (!vrvReady || !vrv) { pendingScoreFile = f; }
    else { loadScoreFile(f); }
  });

  function syncOffset(fromRange){ if (fromRange){ offsetNum.value = offsetRange.value; } else { offsetRange.value = offsetNum.value; } }
  offsetRange.addEventListener('input', () => syncOffset(true));
  offsetNum.addEventListener('input', () => syncOffset(false));

  function applyZoom(){
    const val = Number(zoomRange.value);
    zoomVal.textContent = val + '%';
    setOptionsForContainer(val);
    if (vrv) { vrv.redoLayout(); renderPage(page); }
  }
  zoomRange.addEventListener('input', applyZoom);
  window.addEventListener('resize', () => { setOptionsForContainer(); if (vrv) { vrv.redoLayout(); renderPage(page); } });

  function applyTempo(){
    const val = Number(tempoRange.value);
    const newScale = val / 100;
    tempoVal.textContent = val + '%';
    if (newScale === tempoScale) return;
    if (isPlaying && ac){
      const pos = (ac.currentTime - startAt) * tempoScale;
      stopMidi();
      tempoScale = newScale;
      playMidiAt(pos);
    } else {
      tempoScale = newScale;
    }
  }
  tempoRange.addEventListener('input', applyTempo);

  tapAlignBtn.addEventListener('click', () => {
    alignByClick = !alignByClick;
    tapAlignBtn.classList.toggle('danger', alignByClick);
    tapAlignBtn.textContent = alignByClick ? 'Haz clic en una nota…' : 'Alinear por clic';
  });

  // ===== Verovio init =====
  function initVerovio(){
    function doInit(){
      try {
        vrv = new verovio.toolkit();
        vrvReady = true; updateVersionLabel();
        if (pendingScoreFile) { const f = pendingScoreFile; pendingScoreFile = null; loadScoreFile(f); }
      } catch(e) {
        setTimeout(tryInit, 20);
      }
    }
    function tryInit(){
      if (window.verovio && verovio.module) {
        try { verovio.module.print = function(){}; verovio.module.printErr = function(){}; } catch(_){}
        const mod = verovio.module;
        if (mod.calledRun || mod._malloc) { doInit(); }
        else { mod.onRuntimeInitialized = doInit; }
        return true;
      }
      return false;
    }
    if (!tryInit()) { const timer = setInterval(function(){ if (tryInit()) clearInterval(timer); }, 20); }
  }

  async function playMidiAt(tStart){
    if (!midiObj) { alert('MIDI aún no está listo. Carga una partitura primero.'); return; }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    try { ac = preloadAc || new AudioCtx(); preloadAc = null; } catch(e){ alert('AudioContext no soportado.'); return; }
    if (ac.state === 'suspended') { try { await ac.resume(); } catch(_){} }
    if (ac.state !== 'running') { alert('No se pudo iniciar el AudioContext.'); return; }
    try {
      startAt = ac.currentTime - ((tStart || 0) / tempoScale);
      isPlaying = true; playBtn.textContent = '⏸ Parar (MIDI)';
      scheduleAll(ac, startAt);
      rafId = requestAnimationFrame(loop);
    } catch(e) {
      console.error(e); alert('Error al reproducir: ' + (e.message||e));
    }
  }

  playBtn.addEventListener('click', () => { if (!isPlaying) playMidiAt(0); else stopMidi(); });
  stopBtn.addEventListener('click', stopMidi);

  // Go!
  initVerovio();
})();
