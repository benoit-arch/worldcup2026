import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// VERSION SYSTÈME — Force reconnexion si version change
// ═══════════════════════════════════════════════════════════════
const APP_VERSION = "v22.0"; // Augmente à chaque update majeure!

// Inject CSS keyframes
if (typeof document !== "undefined" && !document.getElementById("wc-styles")) {
  const style = document.createElement("style");
  style.id = "wc-styles";
  style.textContent = `
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.85;transform:scale(1.01)} }
    @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
    @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
    @keyframes flagFloat3d {
      0%  { transform: perspective(400px) rotateY(-15deg) rotateX(5deg) scale(1);   opacity:.7; }
      50% { transform: perspective(400px) rotateY(15deg)  rotateX(-5deg) scale(1.1); opacity:1; }
      100%{ transform: perspective(400px) rotateY(-15deg) rotateX(5deg) scale(1);   opacity:.7; }
    }
    @keyframes eggSpin {
      0%   { transform: rotate(0deg) scale(1); }
      25%  { transform: rotate(90deg) scale(1.3); }
      50%  { transform: rotate(180deg) scale(1); }
      75%  { transform: rotate(270deg) scale(1.3); }
      100% { transform: rotate(360deg) scale(1); }
    }
    @keyframes eggPop {
      0%  { transform:scale(0) rotate(-180deg); opacity:0; }
      60% { transform:scale(1.3) rotate(10deg); opacity:1; }
      100%{ transform:scale(1) rotate(0deg); opacity:1; }
    }
    @keyframes eggMsg {
      0%  { transform:translateY(20px); opacity:0; }
      100%{ transform:translateY(0);    opacity:1; }
    }
    @keyframes sunPulse {
      0%,100% { transform:scale(1) rotate(0deg); filter:drop-shadow(0 0 10px rgba(255,200,0,.6)); }
      50%     { transform:scale(1.08) rotate(8deg); filter:drop-shadow(0 0 22px rgba(255,180,0,.9)); }
    }
    @keyframes ballBounce {
      0%,100%{ transform:translateY(0) rotate(0deg); }
      40%    { transform:translateY(-8px) rotate(180deg); }
      60%    { transform:translateY(-4px) rotate(270deg); }
    }
    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes waveIn {
      0%  { transform:translateY(16px) scale(.95); opacity:0; }
      100%{ transform:translateY(0) scale(1);     opacity:1; }
    }
    @keyframes gradientShift {
      0%  { background-position:0% 50%; }
      50% { background-position:100% 50%; }
      100%{ background-position:0% 50%; }
    }
    @keyframes scorePop {
      0%  { transform:scale(.7); opacity:0; }
      65% { transform:scale(1.15); }
      100%{ transform:scale(1); opacity:1; }
    }
    @keyframes glowPulse {
      0%,100%{ box-shadow:0 0 10px rgba(255,165,0,.3); }
      50%    { box-shadow:0 0 24px rgba(255,165,0,.7); }
    }
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
    input[type=number] { -moz-appearance:textfield; }
    ::-webkit-scrollbar { display:none; }
    *, *::before, *::after { box-sizing:border-box; }
    html, body { overflow-x:hidden; max-width:100%; }
    * { scrollbar-width:none; -webkit-tap-highlight-color:transparent; }
  `;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════
// CONFETTI — crescendo par phase
// ══════════════════════════════════════════
const CDN = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js";
function loadConfetti() {
  return new Promise(r => {
    if (window.__confOk) { r(); return; }
    const s = document.createElement("script");
    s.src = CDN; s.onload = () => { window.__confOk = true; r(); };
    document.head.appendChild(s);
  });
}
// ══════════════════════════════════════════
// SONS — Web Audio API natif (aucun CDN)
// ══════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// AUDIO ENGINE — tout via AudioContext, piloté par isMuted global
// ══════════════════════════════════════════════════════════════
let _sfxCtx    = null;   // effets UI
let bgMusicCtx = null;   // musique de fond app (fermé pour vrai arrêt)
let loginMusicCtx = null; // musique login (fermé pour vrai arrêt)
let bgLoopTimer   = null;
let loginLoopTimer = null;
let bgMusicPlaying    = false;
let loginMusicPlaying = false;
let currentTrackIdx   = 0;
let _isMuted = false; // source de vérité globale, sync avec React state
let eggMusicCtx = null;
let eggMusicTimer = null;
let eggMusicPlaying = false;

function stopEggMusic() {
  eggMusicPlaying = false;
  if (eggMusicTimer) { clearTimeout(eggMusicTimer); eggMusicTimer = null; }
  if (eggMusicCtx && eggMusicCtx.state !== "closed") { try { eggMusicCtx.close(); } catch(e){} eggMusicCtx = null; }
}

function _eggNote(ctx, freq, t, dur, vol=0.08) {
  if (!eggMusicPlaying) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "square"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0, t + dur * 0.8);
    o.start(t); o.stop(t + dur);
  } catch(e){}
}

// Mélodie festive pour l'easter egg : courte fanfare chiptune (~4s)
const EGG_BPM = 100; // Même que login
const EGG_N = 60/EGG_BPM, EGG_H = EGG_N/2, EGG_Q = EGG_N/4, EGG_D = EGG_N*1.5;
const EGG_MELODY = [
  // === Thème A1 — Fanfare montante ===
  {f:523,d:EGG_Q},{f:0,d:EGG_Q},{f:523,d:EGG_Q},{f:659,d:EGG_Q},
  {f:784,d:EGG_H},{f:0,d:EGG_Q},{f:659,d:EGG_Q},
  {f:587,d:EGG_H},{f:523,d:EGG_H},
  {f:659,d:EGG_Q},{f:0,d:EGG_Q},{f:659,d:EGG_Q},{f:784,d:EGG_Q},
  {f:880,d:EGG_N},{f:0,d:EGG_H},

  // === Thème A2 — Variation plus haute ===
  {f:698,d:EGG_Q},{f:0,d:EGG_Q},{f:698,d:EGG_Q},{f:784,d:EGG_Q},
  {f:880,d:EGG_H},{f:0,d:EGG_Q},{f:784,d:EGG_Q},
  {f:698,d:EGG_H},{f:659,d:EGG_H},
  {f:523,d:EGG_Q},{f:587,d:EGG_Q},{f:659,d:EGG_Q},{f:587,d:EGG_Q},
  {f:523,d:EGG_N},{f:0,d:EGG_H},

  // === Thème B — Pont énergique (descente) ===
  {f:784,d:EGG_Q},{f:784,d:EGG_Q},{f:740,d:EGG_H},
  {f:784,d:EGG_Q},{f:698,d:EGG_Q},{f:659,d:EGG_H},
  {f:587,d:EGG_Q},{f:0,d:EGG_Q},{f:659,d:EGG_Q},{f:698,d:EGG_Q},
  {f:784,d:EGG_H},{f:880,d:EGG_H},

  {f:740,d:EGG_Q},{f:740,d:EGG_Q},{f:784,d:EGG_H},
  {f:698,d:EGG_Q},{f:659,d:EGG_Q},{f:587,d:EGG_H},
  {f:523,d:EGG_Q},{f:587,d:EGG_Q},{f:659,d:EGG_Q},{f:587,d:EGG_Q},
  {f:523,d:EGG_N},{f:0,d:EGG_H},

  // === Thème A3 — Retour avec énergie ===
  {f:440,d:EGG_Q},{f:0,d:EGG_Q},{f:440,d:EGG_Q},{f:523,d:EGG_Q},
  {f:587,d:EGG_H},{f:0,d:EGG_Q},{f:523,d:EGG_Q},
  {f:440,d:EGG_H},{f:392,d:EGG_H},
  {f:523,d:EGG_Q},{f:0,d:EGG_Q},{f:659,d:EGG_Q},{f:784,d:EGG_Q},
  {f:880,d:EGG_N},{f:0,d:EGG_H},
];

function _loopEggMusic() {
  if (!eggMusicPlaying) return;
  try {
    if (!eggMusicCtx || eggMusicCtx.state === "closed")
      eggMusicCtx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = eggMusicCtx;
    const now = ctx.currentTime + 0.05;
    let t = now;
    const totalDur = EGG_MELODY.reduce((s,n)=>s+n.d,0);
    EGG_MELODY.forEach(n => {
      if (n.f > 0) _eggNote(ctx, n.f, t, n.d, 0.07);
      // Harmonie une tierce en dessous
      if (n.f > 0) _eggNote(ctx, n.f * 0.794, t, n.d, 0.04);
      t += n.d;
    });
    // Basse simple
    const beats = Math.round(totalDur / EGG_Q);
    const bassLine = [262,262,330,349,262,262,330,349,392,392,349,330];
    for (let i=0;i<beats;i++) {
      _eggNote(ctx, bassLine[i%bassLine.length], now+i*EGG_Q, EGG_Q*0.5, 0.05);
    }
    eggMusicTimer = setTimeout(_loopEggMusic, (totalDur - 0.1) * 1000);
  } catch(e) { eggMusicPlaying = false; }
}

function playEggMusic() {
  if (eggMusicPlaying) return;
  stopAllMusic(); // coupe la musique de fond pendant l'easter egg
  eggMusicPlaying = true;
  try {
    if (!eggMusicCtx || eggMusicCtx.state === "closed")
      eggMusicCtx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = eggMusicCtx;
    const doPlay = () => { if (eggMusicPlaying) _loopEggMusic(); };
    if (ctx.state === "suspended") ctx.resume().then(doPlay).catch(()=>{});
    else doPlay();
  } catch(e) { eggMusicPlaying = false; }
}

function _sfx() {
  if (!_sfxCtx || _sfxCtx.state==="closed")
    _sfxCtx = new (window.AudioContext||window.webkitAudioContext)();
  return _sfxCtx;
}
function getAudioCtx() { return _sfx(); }

function playTone(freq, type, duration, vol=0.3, delay=0) {
  if (_isMuted) return;
  try {
    const ctx = _sfx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime+delay);
    gain.gain.setValueAtTime(0, ctx.currentTime+delay);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime+delay+0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+delay+duration);
    osc.start(ctx.currentTime+delay);
    osc.stop(ctx.currentTime+delay+duration);
  } catch(e) {}
}

// ── Fermeture propre d'un AudioContext ──────────────────────
function _closeCtx(ctx) {
  if (ctx && ctx.state !== "closed") { ctx.close().catch(()=>{}); }
  return null;
}

// Click bouton prono
function soundClick() {
  if (_isMuted) return;
  playTone(600, "sine", 0.08, 0.15);
}

// Bonne réponse
function soundCorrect() {
  playTone(523, "sine", 0.12, 0.25);
  playTone(659, "sine", 0.12, 0.25, 0.12);
  playTone(784, "sine", 0.2,  0.3,  0.24);
}

// Mauvaise réponse
function soundWrong() {
  playTone(220, "sawtooth", 0.15, 0.2);
  playTone(180, "sawtooth", 0.2,  0.2, 0.15);
}

// Validation d'un groupe
function soundValidate() {
  [523,587,659,698,784].forEach((f,i) => playTone(f,"sine",0.15,0.25,i*0.08));
}

// Lock final
function soundLock() {
  [261,329,392,523].forEach((f,i) => playTone(f,"sine",0.25,0.3,i*0.1));
  setTimeout(()=>[784,1047].forEach((f,i)=>playTone(f,"sine",0.3,0.35,i*0.12)),500);
}

// Hymne de la finale (petite mélodie)
function soundFinale() {
  const notes = [523,659,784,1047,784,659,784,659,523];
  notes.forEach((f,i) => playTone(f,"sine",0.3,0.35,i*0.18));
}

// Login réussi
function soundLogin() {
  playTone(440,"sine",0.1,0.2);
  playTone(554,"sine",0.12,0.2,0.1);
}

// Saisie score admin
function soundScore() {
  playTone(880,"sine",0.06,0.1);
}

// ══════════════════════════════════════════════════════════════
// MUSIQUE DE FOND — 3 pistes au choix
// Arrêt VRAI via fermeture du AudioContext dédié
// ══════════════════════════════════════════════════════════════

// Durées communes BPM 100 → noire=0.6s
const N=0.6, H=0.3, Q=0.15, D=0.9, W=1.2;

// ── PISTE 0 : Waka Waka (Shakira) ─────────────────────────
// Refrain : "This time for Africa"
// Fa4=349 Sol4=392 La4=440 Do5=523 Ré5=587 Mi5=659 Si4=494 Mi4=330 Ré4=294
const WAKA_WAKA = [
  // "Tsamina mina, eh eh"
  {f:523,d:H},{f:523,d:H},{f:587,d:H},{f:523,d:H},
  {f:440,d:N},{f:392,d:N},
  // "Waka waka, eh eh"
  {f:392,d:H},{f:440,d:H},{f:392,d:H},{f:330,d:H},
  {f:392,d:N},{f:0,d:H},
  // "Tsamina mina zangalewa"
  {f:523,d:H},{f:523,d:H},{f:587,d:H},{f:659,d:H},
  {f:587,d:H},{f:523,d:H},{f:440,d:N},
  // "This time for Africa"
  {f:440,d:H},{f:523,d:H},{f:587,d:H},{f:523,d:H},
  {f:440,d:H},{f:392,d:N},{f:0,d:H},
  // "Tsamina mina, eh eh"
  {f:659,d:H},{f:659,d:H},{f:587,d:H},{f:523,d:H},
  {f:440,d:N},{f:392,d:N},
  // "Waka waka, eh eh"
  {f:392,d:H},{f:440,d:H},{f:392,d:H},{f:330,d:H},
  {f:392,d:D},{f:0,d:H},
  // Final
  {f:523,d:H},{f:587,d:H},{f:659,d:H},{f:587,d:H},
  {f:523,d:D},{f:0,d:N},
];
const WAKA_BASS = [131,131,165,175, 131,131,165,175, 131,131,165,175, 131,131,165,175];

// ── PISTE 1 : Wavin' Flag (K'Naan) ────────────────────────
// "When I get older I will be stronger..."
const WAVIN = [
  // "When I  get  ol - der"
  {f:392,d:H},{f:392,d:Q},{f:440,d:Q},{f:392,d:H},{f:330,d:H},
  // "I will be stron-ger"
  {f:294,d:Q},{f:330,d:Q},{f:392,d:N},{f:392,d:D},{f:0,d:Q},
  // "They'll call me free-dom"
  {f:392,d:H},{f:440,d:Q},{f:392,d:Q},{f:330,d:H},{f:294,d:H},
  // "just like a wa-vin' flag"
  {f:330,d:Q},{f:392,d:Q},{f:440,d:H},{f:392,d:D},{f:0,d:Q},
  // Montée "And then it waves"
  {f:523,d:H},{f:494,d:H},{f:523,d:H},{f:587,d:H},
  {f:659,d:D},{f:587,d:Q},{f:523,d:H},{f:494,d:H},
  {f:523,d:H},{f:494,d:H},{f:440,d:H},{f:392,d:H},
  {f:392,d:W},{f:0,d:H},
];
const WAVIN_BASS = [98,98,131,147, 98,98,131,147, 98,98,131,147, 98,98,131,147];

// ── PISTE 2 : We Are The Champions (Queen) ─────────────────
// "We are the champions, my friends..."
// La4=440 Do5=523 Mi5=659 Sol4=392 Ré5=587 Si4=494 Mi4=330
// Légende — mélodie épique rythmée, style stade / hymne victoire
const CHAMPIONS = [
  // Phrase A — montée héroïque
  {f:392,d:Q},{f:392,d:Q},{f:523,d:H},{f:494,d:Q},{f:440,d:Q},
  {f:523,d:H},{f:0,d:Q},{f:523,d:Q},
  {f:587,d:Q},{f:587,d:Q},{f:659,d:H},{f:587,d:Q},{f:523,d:Q},
  {f:587,d:N},{f:0,d:H},
  // Phrase B — refrain puissant
  {f:659,d:Q},{f:784,d:Q},{f:659,d:H},{f:587,d:H},
  {f:523,d:Q},{f:587,d:Q},{f:659,d:H},{f:0,d:H},
  {f:523,d:Q},{f:587,d:Q},{f:523,d:H},{f:440,d:H},
  {f:392,d:N},{f:0,d:H},
  // Phrase C — montée finale
  {f:784,d:Q},{f:784,d:Q},{f:880,d:H},{f:784,d:Q},{f:698,d:Q},
  {f:784,d:H},{f:0,d:Q},{f:659,d:Q},
  {f:587,d:Q},{f:659,d:Q},{f:587,d:H},{f:523,d:H},
  {f:587,d:N},{f:0,d:H},
  // Phrase D — résolution
  {f:659,d:Q},{f:587,d:Q},{f:523,d:H},{f:494,d:H},
  {f:523,d:Q},{f:440,d:Q},{f:392,d:N},{f:0,d:N},
];
const CHAMPIONS_BASS = [98,131,147,98, 98,131,147,98, 98,131,147,98, 98,131,147,98];

// ══════════════════════════════════════════════════════════════
// MP3 TRACKS — fichiers à placer dans public/musiques/
// ══════════════════════════════════════════════════════════════
// 📁 Mettre ces 6 fichiers dans le dossier public/musiques/ du projet :
//    gala.mp3               → Gala - Freed from Desire
//    survive.mp3            → Gloria Gaynor - I Will Survive
//    pile.mp3               → Mauvais Djo - Pilé
//    dai-dai.mp3            → Shakira & Burna Boy - Dai Dai
//    ramenez.mp3            → Vegedream - Ramenez la coupe à la maison
//    mechants.mp3           → World Cup Baguette - C'est nous les méchants

const MP3_TRACKS = [
  { name:"🎉 Freed from Desire",     file:"/musiques/gala.mp3"     },
  { name:"💪 I Will Survive",         file:"/musiques/survive.mp3"  },
  { name:"🔥 Pilé",                   file:"/musiques/pile.mp3"     },
  { name:"⚽ Dai Dai",                file:"/musiques/dai-dai.mp3"  },
  { name:"🏆 Ramenez la coupe",       file:"/musiques/ramenez.mp3"  },
  { name:"😈 C'est nous les méchants",file:"/musiques/mechants.mp3" },
];

// Globals MP3
let mp3El        = null;   // HTMLAudioElement courant
let mp3Playing   = false;
let mp3LoopMode  = false;  // false = playlist, true = boucle
let currentMp3Idx = 0;
let _onMp3AutoNext = null;   // callback React enregistré via useEffect

function stopMp3() {
  mp3Playing = false;
  if (mp3El) {
    mp3El.onended = null;
    mp3El.onerror = null;
    try { mp3El.pause(); } catch(e){}
    mp3El = null;
  }
}

function playMp3(idx, loopMode) {
  stopMp3();
  if (_isMuted) return;
  currentMp3Idx = Math.max(0, Math.min(idx, MP3_TRACKS.length - 1));
  mp3LoopMode = loopMode;
  mp3Playing = true;
  try {
    const el = new Audio(MP3_TRACKS[currentMp3Idx].file);
    mp3El = el;
    el.volume = 0.55;
    el.onended = () => {
      if (!mp3Playing || el !== mp3El) return;
      if (mp3LoopMode) {
        // Boucle : rejoue la même piste
        playMp3(currentMp3Idx, true);
      } else {
        // Playlist : piste suivante (wrap around)
        const nextIdx = (currentMp3Idx + 1) % MP3_TRACKS.length;
        if (_onMp3AutoNext) _onMp3AutoNext(nextIdx);  // synchronise le state React
        playMp3(nextIdx, false);
      }
    };
    el.onerror = () => {
      if (el === mp3El) mp3Playing = false;
    };
    el.play().catch(() => { if (el === mp3El) mp3Playing = false; });
  } catch(e) { mp3Playing = false; }
}

function switchMp3Track(idx) {
  if (mp3Playing || !_isMuted) playMp3(idx, mp3LoopMode);
}


const TRACKS = [
  { name:"🎵 Fiesta Mundial", melody:WAKA_WAKA,     bass:WAKA_BASS,     bpm:104 },
  { name:"🎶 Victoire", melody:WAVIN,        bass:WAVIN_BASS,    bpm:96  },
  { name:"🎸 Légende",   melody:CHAMPIONS,    bass:CHAMPIONS_BASS,bpm:100 },
];

// ── Moteur audio ────────────────────────────────────────────
function _getMusicCtx() {
  if (!bgMusicCtx || bgMusicCtx.state==="closed")
    bgMusicCtx = new (window.AudioContext||window.webkitAudioContext)();
  return bgMusicCtx;
}
function _getLoginCtx() {
  if (!loginMusicCtx || loginMusicCtx.state==="closed")
    loginMusicCtx = new (window.AudioContext||window.webkitAudioContext)();
  return loginMusicCtx;
}

function _note(ctx, freq, type, t, dur, vol) {
  if (!bgMusicPlaying || _isMuted) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.82);
    o.start(t); o.stop(t + dur * 0.85);
  } catch(e){}
}

function _kick(ctx, t) {
  if (!bgMusicPlaying || _isMuted) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.14);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  } catch(e){}
}

function _snare(ctx, t) {
  if (!bgMusicPlaying || _isMuted) return;
  try {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr*0.1), sr);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer=buf; s.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.1);
    s.start(t); s.stop(t+0.12);
  } catch(e){}
}

function _loopTrack() {
  if (!bgMusicPlaying) return;
  try {
    const track = TRACKS[currentTrackIdx];
    const beatLen = 60 / track.bpm;
    const ctx = _getMusicCtx();
    const now = ctx.currentTime + 0.06;

    // Mélodie
    let t = now;
    track.melody.forEach(n => {
      if (n.f > 0) _note(ctx, n.f, "triangle", t, n.d*0.85, 0.2);
      t += n.d;
    });
    const totalDur = track.melody.reduce((s,n)=>s+n.d, 0);

    // Basse
    const beats = Math.round(totalDur / beatLen);
    for (let i=0; i<beats; i++) {
      _note(ctx, track.bass[i % track.bass.length], "sawtooth",
            now + i*beatLen, beatLen*0.65, 0.1);
    }

    // Batterie
    const bars = Math.floor(beats/4);
    for (let m=0; m<bars; m++) {
      const bt = now + m*4*beatLen;
      _kick(ctx, bt);
      _snare(ctx, bt + beatLen);
      _kick(ctx, bt + 2*beatLen);
      _snare(ctx, bt + 3*beatLen);
      // Hi-hat en croches
      for (let h=0; h<8; h++)
        _note(ctx, 900, "square", bt+h*(beatLen/2), beatLen*0.18, 0.025);
    }

    bgLoopTimer = setTimeout(_loopTrack, (totalDur - 0.12) * 1000);
  } catch(e) { bgMusicPlaying = false; }
}

function playBgMusic() {
  if (bgMusicPlaying || _isMuted) return;
  bgMusicPlaying = true;
  try { _getMusicCtx(); } catch(e) { bgMusicPlaying=false; return; }
  _loopTrack();
}

function stopBgMusic() {
  bgMusicPlaying = false;
  if (bgLoopTimer) { clearTimeout(bgLoopTimer); bgLoopTimer = null; }
  bgMusicCtx = _closeCtx(bgMusicCtx);
}

function switchTrack(idx) {
  stopBgMusic();
  currentTrackIdx = idx;
  if (!_isMuted) setTimeout(playBgMusic, 150);
}

// ══════════════════════════════════════════════════════════════
// MUSIQUE LOGIN — style 8-bit / jeu vidéo rétro
// Mélodie inspirée des anciens jeux (Super Mario / arcade vibes)
// BPM 140 → noire = 0.43s
// ══════════════════════════════════════════════════════════════
const LN=0.38, LH=LN/2, LQ=LN/4, LD=LN*1.5;

// Mélodie 8-bit originale — style chiptune des années 90
// Composition originale, aucune ressemblance avec un titre existant
// Gamme : Do majeur pentatonique avec passages chromatiques
// Structure : A-A-B-A (32 mesures, boucle parfaite)
const LOGIN_MELODY = [
  // === Thème A1 — accroche rythmique ===
  {f:440,d:LQ},{f:0,d:LQ},{f:440,d:LQ},{f:523,d:LQ},
  {f:587,d:LH},{f:0,d:LQ},{f:523,d:LQ},
  {f:440,d:LH},{f:392,d:LH},
  {f:330,d:LQ},{f:0,d:LQ},{f:330,d:LQ},{f:392,d:LQ},
  {f:440,d:LN},{f:0,d:LH},

  // === Thème A2 — variation ===
  {f:494,d:LQ},{f:0,d:LQ},{f:494,d:LQ},{f:587,d:LQ},
  {f:659,d:LH},{f:0,d:LQ},{f:587,d:LQ},
  {f:523,d:LH},{f:440,d:LH},
  {f:392,d:LQ},{f:330,d:LQ},{f:294,d:LQ},{f:330,d:LQ},
  {f:392,d:LN},{f:0,d:LH},

  // === Thème B — pont énergique (monte d'un cran) ===
  {f:659,d:LQ},{f:659,d:LQ},{f:698,d:LH},
  {f:659,d:LQ},{f:587,d:LQ},{f:523,d:LH},
  {f:494,d:LQ},{f:0,d:LQ},{f:523,d:LQ},{f:587,d:LQ},
  {f:659,d:LH},{f:784,d:LH},

  {f:698,d:LQ},{f:698,d:LQ},{f:659,d:LH},
  {f:587,d:LQ},{f:523,d:LQ},{f:494,d:LH},
  {f:440,d:LQ},{f:494,d:LQ},{f:523,d:LQ},{f:440,d:LQ},
  {f:392,d:LN},{f:0,d:LH},

  // === Thème A3 — retour avec énergie ===
  {f:440,d:LQ},{f:0,d:LQ},{f:523,d:LQ},{f:587,d:LQ},
  {f:659,d:LQ},{f:587,d:LQ},{f:523,d:LQ},{f:440,d:LQ},
  {f:494,d:LH},{f:392,d:LH},
  {f:330,d:LQ},{f:392,d:LQ},{f:440,d:LQ},{f:523,d:LQ},
  {f:587,d:LN},{f:0,d:LN},
];

function _8bitNote(ctx, freq, t, dur) {
  if (!loginMusicPlaying || _isMuted) return;
  try {
    // Son carré = 8-bit classic
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "square"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, t);
    g.gain.setValueAtTime(0.06, t + dur*0.7);
    g.gain.linearRampToValueAtTime(0, t + dur*0.85);
    o.start(t); o.stop(t + dur);
  } catch(e){}
}

function _8bitBass(ctx, freq, t, dur) {
  if (!loginMusicPlaying || _isMuted) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "square"; o.frequency.value = freq/2; // octave basse
    g.gain.setValueAtTime(0.035, t);
    g.gain.linearRampToValueAtTime(0, t + dur*0.8);
    o.start(t); o.stop(t + dur);
  } catch(e){}
}

function _loopLogin() {
  if (!loginMusicPlaying || _isMuted) return;
  try {
    const ctx = _getLoginCtx();
    const now = ctx.currentTime + 0.05;
    let t = now;
    const totalDur = LOGIN_MELODY.reduce((s,n)=>s+n.d,0);

    // Mélodie 8-bit
    LOGIN_MELODY.forEach(n => {
      if (n.f > 0) _8bitNote(ctx, n.f, t, n.d);
      t += n.d;
    });

    // Basse simple sur chaque noire
    const beats = Math.round(totalDur / LN);
    const bassNotes = [130,130,165,196, 130,130,165,174, 174,196,130,130];
    for (let i=0; i<beats; i++) {
      _8bitBass(ctx, bassNotes[i % bassNotes.length], now + i*LN, LN*0.6);
    }

    // Kick 8-bit (sine très courte)
    const bars = Math.floor(beats/4);
    for (let m=0; m<bars; m++) {
      const bt = now + m*4*LN;
      // Kick sur 1 et 3
      [0, 2*LN].forEach(off => {
        try {
          const o=ctx.createOscillator(), g=ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type="sine"; o.frequency.setValueAtTime(200,bt+off);
          o.frequency.exponentialRampToValueAtTime(50,bt+off+0.1);
          g.gain.setValueAtTime(0.15,bt+off);
          g.gain.exponentialRampToValueAtTime(0.001,bt+off+0.12);
          o.start(bt+off); o.stop(bt+off+0.14);
        } catch(e){}
      });
    }

    loginLoopTimer = setTimeout(_loopLogin, (totalDur - 0.1)*1000);
  } catch(e) { loginMusicPlaying = false; }
}

function playLoginMusic() {
  if (loginMusicPlaying || _isMuted) return;
  loginMusicPlaying = true;
  try {
    const ctx = _getLoginCtx();
    // Les navigateurs suspendent l'AudioContext avant interaction utilisateur
    const doPlay = () => { if (loginMusicPlaying) _loopLogin(); };
    if (ctx.state === "suspended") {
      ctx.resume().then(doPlay).catch(() => { loginMusicPlaying = false; });
    } else {
      doPlay();
    }
  } catch(e) { loginMusicPlaying=false; return; }
}

function stopLoginMusic() {
  loginMusicPlaying = false;
  if (loginLoopTimer) { clearTimeout(loginLoopTimer); loginLoopTimer = null; }
  loginMusicCtx = _closeCtx(loginMusicCtx);
}

function stopAllMusic() {
  stopBgMusic();
  stopLoginMusic();
  stopEggMusic();
  stopMp3();
  stopGameMusic();
}

// ── SONS & MUSIQUE PAR JEU ──────────────────────────────────────
let gameMusicCtx = null;
let gameMusicTimer = null;
let gameMusicPlaying = false;
let currentGameMusic = null;

function stopGameMusic() {
  gameMusicPlaying = false;
  currentGameMusic = null;
  if (gameMusicTimer) { clearTimeout(gameMusicTimer); gameMusicTimer = null; }
  if (gameMusicCtx && gameMusicCtx.state !== "closed") {
    try { gameMusicCtx.close(); } catch(e) {}
    gameMusicCtx = null;
  }
}

function _gameNote(ctx, freq, t, dur, vol=0.06, type="sine") {
  if (!gameMusicPlaying) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
    o.start(t); o.stop(t + dur);
  } catch(e) {}
}

// Thèmes musicaux par jeu (mélodies procédurales Web Audio)
const GAME_THEMES = {
  quiz: { // Mystérieux, lent — ambiance quiz intelligent
    bpm: 72, notes: [
      {f:330,d:0.5},{f:0,d:0.25},{f:294,d:0.5},{f:0,d:0.25},
      {f:330,d:0.5},{f:0,d:0.25},{f:370,d:0.75},
      {f:330,d:0.5},{f:0,d:0.25},{f:294,d:0.5},{f:0,d:0.25},
      {f:277,d:1.0},{f:0,d:0.5},
    ], bass:[220,247,220,196], type:"triangle", vol:0.05
  },
  quisuisje: { // Détective, suspense
    bpm: 80, notes: [
      {f:196,d:0.3},{f:0,d:0.1},{f:220,d:0.3},{f:0,d:0.1},
      {f:246,d:0.3},{f:0,d:0.1},{f:261,d:0.6},
      {f:246,d:0.3},{f:0,d:0.1},{f:220,d:0.3},{f:0,d:0.1},
      {f:196,d:0.9},{f:0,d:0.5},
    ], bass:[98,110,98,87], type:"sawtooth", vol:0.04
  },
  plusmoins: { // Game show, léger
    bpm: 120, notes: [
      {f:523,d:0.2},{f:587,d:0.2},{f:659,d:0.2},{f:698,d:0.4},
      {f:659,d:0.2},{f:587,d:0.2},{f:523,d:0.4},{f:0,d:0.2},
      {f:440,d:0.2},{f:494,d:0.2},{f:523,d:0.2},{f:587,d:0.4},
      {f:523,d:0.4},{f:440,d:0.4},{f:0,d:0.4},
    ], bass:[261,261,220,196], type:"square", vol:0.04
  },
  toptrumps: { // Dramatique, duel
    bpm: 95, notes: [
      {f:392,d:0.3},{f:0,d:0.1},{f:392,d:0.3},{f:0,d:0.1},
      {f:440,d:0.6},{f:0,d:0.2},
      {f:415,d:0.3},{f:0,d:0.1},{f:392,d:0.3},{f:0,d:0.1},
      {f:370,d:0.8},{f:0,d:0.4},
    ], bass:[196,196,185,185], type:"sawtooth", vol:0.05
  },
  buteur: { // Stade, festif
    bpm: 130, notes: [
      {f:523,d:0.2},{f:659,d:0.2},{f:784,d:0.2},{f:659,d:0.2},
      {f:523,d:0.2},{f:523,d:0.2},{f:587,d:0.4},{f:0,d:0.2},
      {f:440,d:0.2},{f:523,d:0.2},{f:659,d:0.4},{f:0,d:0.2},
      {f:784,d:0.2},{f:698,d:0.2},{f:659,d:0.4},{f:0,d:0.4},
    ], bass:[261,294,330,261], type:"square", vol:0.05
  },
  penalty: { // Tension, montante
    bpm: 100, notes: [
      {f:146,d:0.4},{f:0,d:0.1},{f:155,d:0.4},{f:0,d:0.1},
      {f:164,d:0.4},{f:0,d:0.1},{f:174,d:0.6},{f:0,d:0.3},
      {f:185,d:0.3},{f:0,d:0.1},{f:196,d:0.3},{f:0,d:0.1},
      {f:208,d:0.6},{f:0,d:0.5},
    ], bass:[73,82,87,98], type:"triangle", vol:0.05
  },
};

function _loopGameMusic(game) {
  if (!gameMusicPlaying || currentGameMusic !== game) return;
  const theme = GAME_THEMES[game];
  if (!theme) return;
  try {
    if (!gameMusicCtx || gameMusicCtx.state === "closed")
      gameMusicCtx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = gameMusicCtx;
    const now = ctx.currentTime + 0.05;
    let t = now;
    const totalDur = theme.notes.reduce((s,n)=>s+n.d,0);
    theme.notes.forEach(n => {
      if (n.f > 0) {
        _gameNote(ctx, n.f, t, n.d, theme.vol, theme.type);
        // Harmonie
        _gameNote(ctx, n.f * 1.5, t, n.d, theme.vol * 0.3, "sine");
      }
      t += n.d;
    });
    // Basse rythmique
    const beatDur = 60 / theme.bpm;
    const beats = Math.ceil(totalDur / beatDur);
    for (let i=0; i<beats; i++) {
      const bf = theme.bass[i % theme.bass.length];
      _gameNote(ctx, bf, now + i*beatDur, beatDur*0.7, theme.vol*0.8, "sine");
    }
    gameMusicTimer = setTimeout(() => _loopGameMusic(game), (totalDur - 0.1) * 1000);
  } catch(e) { gameMusicPlaying = false; }
}

function playGameMusic(game) {
  if (_isMuted) return;
  if (currentGameMusic === game && gameMusicPlaying) return;
  stopGameMusic();
  // Couper musique principale pendant le jeu
  stopBgMusic(); stopMp3();
  if (!GAME_THEMES[game]) return;
  gameMusicPlaying = true;
  currentGameMusic = game;
  try {
    gameMusicCtx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = gameMusicCtx;
    const doPlay = () => { if (gameMusicPlaying) _loopGameMusic(game); };
    if (ctx.state === "suspended") ctx.resume().then(doPlay).catch(()=>{});
    else doPlay();
  } catch(e) { gameMusicPlaying = false; }
}

// ── EFFETS SONORES JEUX ─────────────────────────────────────────
function soundGoal() { // But marqué — clochette douce + petite foule
  if (_isMuted) return;
  try {
    const ctx = _sfx(); const now = ctx.currentTime;
    // Petite mélodie type clochette, douce, sans aucune stridence
    [0, 0.12, 0.26].forEach((d,i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = [660, 880, 1100][i];
      g.gain.setValueAtTime(0, now+d); g.gain.linearRampToValueAtTime(0.16, now+d+0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now+d+0.3);
      o.start(now+d); o.stop(now+d+0.32);
    });
    // Foule qui monte (bruit filtré très doux, registre grave)
    const buf = ctx.createBuffer(1, ctx.sampleRate*1.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0; i<data.length; i++) data[i] = (Math.random()*2-1)*0.25;
    const src = ctx.createBufferSource();
    const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 450; filt.Q.value = 0.7;
    const gn = ctx.createGain();
    src.buffer = buf; src.connect(filt); filt.connect(gn); gn.connect(ctx.destination);
    gn.gain.setValueAtTime(0, now+0.15); gn.gain.linearRampToValueAtTime(0.1, now+0.7);
    gn.gain.exponentialRampToValueAtTime(0.001, now+1.2);
    src.start(now+0.15); src.stop(now+1.3);
  } catch(e) {}
}

function soundTrumpetVictory() { // 🎺 Fanfare arène romaine — bon pronostic finale
  if (_isMuted) return;
  try {
    const ctx = _sfx(); const now = ctx.currentTime;
    // Mélodie de fanfare : Do-Sol-Do-Mi-Sol (quinte, octave, tierce, quinte)
    const notes = [
      {f:523, t:0,    d:0.18}, // Do4
      {f:784, t:0.20, d:0.18}, // Sol4
      {f:523, t:0.40, d:0.10}, // Do4 court
      {f:659, t:0.52, d:0.10}, // Mi4 court
      {f:784, t:0.64, d:0.22}, // Sol4
      {f:1047,t:0.90, d:0.55}, // Do5 long — note finale
    ];
    notes.forEach(({f, t, d}) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      // Timbre "cuivre" : mélange de sawtooth + triangle
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = f;
      o2.type = "triangle"; o2.frequency.value = f;
      const master = ctx.createGain();
      o.connect(master); o2.connect(g2); g2.connect(master);
      master.connect(ctx.destination);
      g2.gain.value = 0.4; // triangle plus doux mélangé
      const vol = 0.18;
      master.gain.setValueAtTime(0, now+t);
      master.gain.linearRampToValueAtTime(vol, now+t+0.04);
      master.gain.setValueAtTime(vol, now+t+d*0.7);
      master.gain.exponentialRampToValueAtTime(0.001, now+t+d);
      o.start(now+t); o.stop(now+t+d+0.05);
      o2.start(now+t); o2.stop(now+t+d+0.05);
    });
    // Percussion grave (caisse) sur les temps forts
    [0, 0.40, 0.90].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = "sine";
      o.frequency.setValueAtTime(120, now+t); o.frequency.exponentialRampToValueAtTime(40, now+t+0.18);
      g.gain.setValueAtTime(0, now+t); g.gain.linearRampToValueAtTime(0.22, now+t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now+t+0.2);
      o.start(now+t); o.stop(now+t+0.22);
    });
  } catch(e) {}
}

function soundSave() { // Arrêt penalty
  if (_isMuted) return;
  try {
    const ctx = _sfx(); const now = ctx.currentTime;
    // Petit son descendant doux (déception légère, sans agressivité)
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(440, now); o.frequency.exponentialRampToValueAtTime(260, now+0.25);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.16, now+0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now+0.28);
    o.start(now); o.stop(now+0.3);
    // Petite caisse grave, douce
    [0.2, 0.45].forEach(d => {
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination); o2.type = "sine";
      o2.frequency.setValueAtTime(160, now+d); o2.frequency.exponentialRampToValueAtTime(50, now+d+0.3);
      g2.gain.setValueAtTime(0, now+d); g2.gain.linearRampToValueAtTime(0.12, now+d+0.03);
      g2.gain.exponentialRampToValueAtTime(0.001, now+d+0.3);
      o2.start(now+d); o2.stop(now+d+0.35);
    });
  } catch(e) {}
}

function soundCorrectGame() { // Bonne réponse quiz/jeux
  if (_isMuted) return;
  [0,0.1,0.2].forEach((d,i) => playTone([523,659,784][i], "sine", 0.22, 0.2, d));
}

function soundWrongGame() { // Mauvaise réponse — son doux, descendant, sans stridence
  if (_isMuted) return;
  playTone(330, "triangle", 0.22, 0.12);
  setTimeout(() => playTone(247, "triangle", 0.28, 0.1), 130);
}

function soundWhistle() { // Coup d'envoi — note douce, attaque progressive (pas un sifflet aigu)
  if (_isMuted) return;
  try {
    const ctx = _sfx(); const now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 900;
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.16, now+0.08);
    g.gain.setValueAtTime(0.16, now+0.22); g.gain.exponentialRampToValueAtTime(0.001, now+0.42);
    o.start(now); o.stop(now+0.44);
  } catch(e) {}
}

async function celebrate(phase) {
  await loadConfetti();
  const shoot = o => window.confetti(o);
  if (phase === "poules") {
    soundCorrect();
    shoot({ particleCount:80, spread:70, origin:{y:.65} });
  } else if (phase === "seiziemes" || phase === "huitiemes") {
    soundCorrect(); setTimeout(soundCorrect, 300);
    shoot({ particleCount:140, spread:90, origin:{y:.6} });
  } else if (phase === "quarts") {
    soundValidate();
    shoot({ particleCount:180, spread:110, origin:{y:.55} });
    setTimeout(() => shoot({ particleCount:100, spread:80, origin:{x:.2,y:.6} }), 300);
  } else if (phase === "demis" || phase === "p3") {
    soundValidate(); setTimeout(soundValidate, 400);
    [0,250,500].forEach(d => setTimeout(() =>
      shoot({ particleCount:150, spread:120, origin:{x:Math.random(),y:.5} }), d));
  } else {
    // FINALE — feux d'artifice continus
    soundFinale();
    const end = Date.now() + 4500;
    const frame = () => {
      shoot({ particleCount:6, angle:60,  spread:55, origin:{x:0}, colors:["#F5C842","#fff","#3b82f6"] });
      shoot({ particleCount:6, angle:120, spread:55, origin:{x:1}, colors:["#F5C842","#fff","#ef4444"] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }
}

// ══════════════════════════════════════════
// CONSOLATION — affichée quand le pronostic finale (vainqueur/déroulé) est faux
// ══════════════════════════════════════════
function ConsolationOverlay({ onClose, winnerName, modeLabel }) {
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:2000,
      background:"radial-gradient(ellipse at center, #1a1f2e 0%, #0d1119 50%, #060809 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      animation:"waveIn .4s ease",
    }}>
      <div style={{
        position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        width:280,height:280,borderRadius:"50%",
        background:"radial-gradient(circle, rgba(96,165,250,.18) 0%, rgba(96,165,250,.06) 40%, transparent 70%)",
        pointerEvents:"none"
      }}/>
      <div style={{fontSize:64,marginBottom:18,animation:"scorePop .5s ease"}}>😔</div>
      <div style={{textAlign:"center",padding:"0 24px"}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(148,163,184,.7)",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Pas cette fois</div>
        <div style={{fontSize:22,fontWeight:900,color:"#94a3b8",marginBottom:14}}>Pronostic finale manqué</div>
        {winnerName && (
          <div style={{fontSize:14,color:"rgba(226,232,240,.8)",marginBottom:6}}>
            🏆 Vrai vainqueur : <strong style={{color:"#e2e8f0"}}>{winnerName}</strong>{modeLabel?` (${modeLabel})`:""}
          </div>
        )}
        <div style={{fontSize:12,color:"rgba(148,163,184,.6)",marginTop:10}}>Il reste les bonus score exact et buteurs à vérifier !</div>
      </div>
      <div style={{position:"absolute",bottom:60}}>
        <button onClick={onClose} style={{
          background:"rgba(148,163,184,.12)",border:"1px solid rgba(148,163,184,.3)",
          color:"#cbd5e1",borderRadius:14,padding:"12px 32px",fontSize:15,fontWeight:700,
          cursor:"pointer",fontFamily:"inherit",backdropFilter:"blur(8px)"
        }}>Fermer</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// MEILLEUR PRONOSTIQUEUR — badge doré + confettis pour le meilleur score du groupe
// ══════════════════════════════════════════
function BestPredictorOverlay({ onClose, totalPts, groupLabel }) {
  useEffect(() => {
    loadConfetti().then(() => {
      const shoot = o => window.confetti(o);
      const end = Date.now() + 3000;
      const frame = () => {
        shoot({ particleCount:8, angle:60,  spread:60, origin:{x:0}, colors:["#F5C842","#fff","#22c55e"] });
        shoot({ particleCount:8, angle:120, spread:60, origin:{x:1}, colors:["#F5C842","#fff","#22c55e"] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    });
  }, []);
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:2000,
      background:"radial-gradient(ellipse at center, #2d2400 0%, #1a1400 50%, #0a0800 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      animation:"waveIn .4s ease",
    }}>
      <div style={{
        position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        width:320,height:320,borderRadius:"50%",
        background:"radial-gradient(circle, rgba(245,200,66,.4) 0%, rgba(245,150,30,.15) 40%, transparent 70%)",
        pointerEvents:"none"
      }}/>
      <div style={{fontSize:80,marginBottom:14,animation:"scorePop .6s ease, glowPulse 2s ease infinite"}}>🏅</div>
      <div style={{textAlign:"center",padding:"0 24px"}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(245,200,66,.75)",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Classement final {groupLabel?`— ${groupLabel}`:""}</div>
        <div style={{fontSize:28,fontWeight:900,color:"#F5C842",textShadow:"0 0 20px rgba(245,200,66,.8)",marginBottom:10}}>👑 Meilleur Pronostiqueur !</div>
        {totalPts != null && (
          <div style={{fontSize:16,color:"rgba(255,255,255,.85)"}}>Score final : <strong style={{color:"#F5C842"}}>{totalPts} pts</strong></div>
        )}
      </div>
      <div style={{position:"absolute",bottom:60}}>
        <button onClick={onClose} style={{
          background:"rgba(245,200,66,.15)",border:"1px solid rgba(245,200,66,.4)",
          color:"#F5C842",borderRadius:14,padding:"12px 32px",fontSize:15,fontWeight:700,
          cursor:"pointer",fontFamily:"inherit",backdropFilter:"blur(8px)"
        }}>Fermer 🏅</button>
      </div>
    </div>
  );
}


// Retourne { badges: [], links: [] }
// badges = chaînes sans lien (beIN)
// links  = chaînes avec lien cliquable (M6)
function getStreamInfo(tv) {
  if (!tv) return { badges:[], links:[] };
  const badges = [];
  if (tv.toLowerCase().includes("bein")) badges.push({ icon:"📡", label:"beIN Sport", color:"#6366f1" });
  if (tv.includes("M6"))  badges.push({ icon:"📺", label:"M6",        color:"#f59e0b" });
  return { badges, links:[] };
}


// ══════════════════════════════════════════
// TROPHY 3D — Three.js coupe du monde
// ══════════════════════════════════════════
const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
function loadThree() {
  return new Promise(r => {
    if (window.__threeOk) { r(); return; }
    const s = document.createElement("script");
    s.src = THREE_CDN; s.onload = () => { window.__threeOk = true; r(); };
    document.head.appendChild(s);
  });
}

function Trophy3D({ onClose }) {
  const mountRef = useRef(null);
  const animRef  = useRef(null);

  useEffect(() => {
    let renderer, scene, camera, trophy, stars, animId;

    loadThree().then(() => {
      const T = window.THREE;
      const W = mountRef.current.clientWidth;
      const H = mountRef.current.clientHeight;

      renderer = new T.WebGLRenderer({ antialias:true, alpha:true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      mountRef.current.appendChild(renderer.domElement);

      scene = new T.Scene();
      camera = new T.PerspectiveCamera(45, W/H, 0.1, 100);
      camera.position.set(0, 1.5, 5);
      camera.lookAt(0, 0.5, 0);

      // Lights
      const ambient = new T.AmbientLight(0xffffff, 1.2);
      scene.add(ambient);
      const gold1 = new T.PointLight(0xF5C842, 6, 20);
      gold1.position.set(3, 4, 3);
      scene.add(gold1);
      const gold2 = new T.PointLight(0xffcc44, 4, 16);
      gold2.position.set(-3, 2, -2);
      scene.add(gold2);
      const white = new T.PointLight(0xffffff, 3, 14);
      white.position.set(0, 6, 2);
      scene.add(white);

      // Trophy group
      trophy = new T.Group();

      const goldMat = new T.MeshStandardMaterial({
        color: 0xF5C842,
        metalness: 1,
        roughness: 0.15,
        envMapIntensity: 1.5,
      });
      const darkGoldMat = new T.MeshStandardMaterial({
        color: 0xc9a12e,
        metalness: 1,
        roughness: 0.2,
      });

      // Base large
      const base1 = new T.Mesh(new T.CylinderGeometry(0.9,1.0,0.18,64), darkGoldMat);
      base1.position.y = 0;
      trophy.add(base1);

      // Base medium
      const base2 = new T.Mesh(new T.CylinderGeometry(0.7,0.9,0.14,64), goldMat);
      base2.position.y = 0.16;
      trophy.add(base2);

      // Base small
      const base3 = new T.Mesh(new T.CylinderGeometry(0.45,0.7,0.12,64), darkGoldMat);
      base3.position.y = 0.29;
      trophy.add(base3);

      // Stem bottom
      const stem1 = new T.Mesh(new T.CylinderGeometry(0.22,0.45,0.5,32), goldMat);
      stem1.position.y = 0.66;
      trophy.add(stem1);

      // Stem middle (thin)
      const stem2 = new T.Mesh(new T.CylinderGeometry(0.13,0.22,0.8,32), goldMat);
      stem2.position.y = 1.31;
      trophy.add(stem2);

      // Stem knot
      const knot = new T.Mesh(new T.SphereGeometry(0.22,32,32), darkGoldMat);
      knot.scale.y = 0.7;
      knot.position.y = 1.75;
      trophy.add(knot);

      // Stem top
      const stem3 = new T.Mesh(new T.CylinderGeometry(0.13,0.13,0.35,32), goldMat);
      stem3.position.y = 2.1;
      trophy.add(stem3);

      // Cup body — lathe geometry for curved cup
      const cupPts = [];
      for(let i=0;i<=20;i++){
        const t2 = i/20;
        const x = 0.13 + 0.75*Math.pow(t2,0.7);
        const y = t2*1.2;
        cupPts.push(new T.Vector2(x,y));
      }
      const cupGeo = new T.LatheGeometry(cupPts, 64);
      const cup = new T.Mesh(cupGeo, goldMat);
      cup.position.y = 2.28;
      trophy.add(cup);

      // Cup rim
      const rim = new T.Mesh(new T.TorusGeometry(0.88,0.06,16,64), darkGoldMat);
      rim.position.y = 3.5;
      trophy.add(rim);

      // Handles (left & right)
      [-1,1].forEach(side => {
        const handleGroup = new T.Group();
        // Main arc using torus
        const handle = new T.Mesh(
          new T.TorusGeometry(0.28, 0.055, 12, 32, Math.PI),
          goldMat
        );
        handle.rotation.z = side === -1 ? -Math.PI/2 : Math.PI/2;
        handle.position.set(side*1.0, 3.0, 0);
        trophy.add(handle);
      });

      // Globe on top
      const globe = new T.Mesh(new T.SphereGeometry(0.32,32,32), new T.MeshStandardMaterial({
        color:0x1a6abf, metalness:0.3, roughness:0.4
      }));
      globe.position.y = 3.82;
      trophy.add(globe);

      // Continents hint (rings on globe)
      const contMat = new T.MeshStandardMaterial({ color:0x2ecc40, metalness:0.2, roughness:0.5 });
      [0.2,0.1,-0.15].forEach((y,i) => {
        const r = Math.sqrt(0.32*0.32 - y*y)*0.95;
        const cont = new T.Mesh(new T.TorusGeometry(r,0.025,8,32), contMat);
        cont.position.y = 3.82+y;
        cont.rotation.x = [0.3,-0.2,0.5][i];
        trophy.add(cont);
      });

      trophy.position.y = -1.2;
      scene.add(trophy);

      // Stars background
      const starGeo = new T.BufferGeometry();
      const starVerts = [];
      for(let i=0;i<600;i++){
        starVerts.push((Math.random()-0.5)*40,(Math.random()-0.5)*40,(Math.random()-0.5)*40);
      }
      starGeo.setAttribute("position", new T.Float32BufferAttribute(starVerts,3));
      stars = new T.Points(starGeo, new T.PointsMaterial({color:0xffffff,size:0.08}));
      scene.add(stars);

      // Animation
      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.012;
        trophy.rotation.y = t;
        // Gentle float
        trophy.position.y = -1.2 + Math.sin(t*0.8)*0.08;
        // Light pulse
        gold1.intensity = 3 + Math.sin(t*1.5)*0.8;
        stars.rotation.y += 0.0005;
        renderer.render(scene, camera);
      };
      animRef.current = () => { cancelAnimationFrame(animId); };
      animate();
    });

    return () => {
      if (animRef.current) animRef.current();
      if (renderer && mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:2000,
      background:"radial-gradient(ellipse at center, #3d2400 0%, #1a0c00 50%, #0a0600 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"
    }}>
      {/* Glow ring */}
      <div style={{
        position:"absolute",top:"50%",left:"50%",
        transform:"translate(-50%,-50%)",
        width:320,height:320,
        borderRadius:"50%",
        background:"radial-gradient(circle, rgba(245,200,66,.45) 0%, rgba(245,150,30,.2) 40%, transparent 70%)",
        pointerEvents:"none"
      }}/>

      <div style={{
        textAlign:"center",
        position:"absolute",top:48,
        zIndex:10,
        textShadow:"0 0 20px rgba(245,200,66,.8)"
      }}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(245,200,66,.7)",letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>Champion du Monde</div>
        <div style={{fontSize:30,fontWeight:900,color:"#F5C842",letterSpacing:1}}>⚽ Pronostic réussi !</div>
      </div>

      <div ref={mountRef} style={{width:"100%",maxWidth:480,height:480,position:"relative"}}/>

      <div style={{
        position:"absolute",bottom:60,
        display:"flex",flexDirection:"column",alignItems:"center",gap:12
      }}>
        <div style={{fontSize:13,color:"rgba(245,200,66,.6)",letterSpacing:1}}></div>
        <button onClick={onClose} style={{
          background:"rgba(245,200,66,.15)",
          border:"1px solid rgba(245,200,66,.4)",
          color:"#F5C842",borderRadius:14,
          padding:"12px 32px",fontSize:15,fontWeight:700,
          cursor:"pointer",fontFamily:"inherit",
          backdropFilter:"blur(8px)"
        }}>Fermer 🏆</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// FLAGS
// ══════════════════════════════════════════
const FLAGS = {
  "Mexique":"🇲🇽","Afrique du Sud":"🇿🇦","Corée du Sud":"🇰🇷","Tchéquie":"🇨🇿",
  "Canada":"🇨🇦","Bosnie-Herzégovine":"🇧🇦","États-Unis":"🇺🇸","Paraguay":"🇵🇾",
  "Qatar":"🇶🇦","Suisse":"🇨🇭","Brésil":"🇧🇷","Maroc":"🇲🇦","Haïti":"🇭🇹",
  "Écosse":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Australie":"🇦🇺","Turquie":"🇹🇷","Allemagne":"🇩🇪","Curaçao":"🇨🇼",
  "Pays-Bas":"🇳🇱","Japon":"🇯🇵","Côte d'Ivoire":"🇨🇮","Équateur":"🇪🇨","Suède":"🇸🇪",
  "Tunisie":"🇹🇳","Espagne":"🇪🇸","Cap-Vert":"🇨🇻","Belgique":"🇧🇪","Égypte":"🇪🇬",
  "Arabie Saoudite":"🇸🇦","Uruguay":"🇺🇾","Iran":"🇮🇷","Nouvelle-Zélande":"🇳🇿",
  "France":"🇫🇷","Sénégal":"🇸🇳","Irak":"🇮🇶","Norvège":"🇳🇴","Argentine":"🇦🇷",
  "Algérie":"🇩🇿","Autriche":"🇦🇹","Jordanie":"🇯🇴","Portugal":"🇵🇹",
  "Rép. Dém. Congo":"🇨🇩","Angleterre":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croatie":"🇭🇷","Ghana":"🇬🇭",
  "Panama":"🇵🇦","Ouzbékistan":"🇺🇿","Colombie":"🇨🇴",
};
const F = n => FLAGS[n] || "🏳️";
const ALL_TEAMS = Object.keys(FLAGS).sort((a,b)=>a.localeCompare(b,"fr"));

// ══════════════════════════════════════════
// GROUPS & MATCHES
// ══════════════════════════════════════════
const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

// Ordre de validation obligatoire
const PHASE_ORDER = [
  ...GROUPS,                  // "A" .. "L"  (poules)
  "ELIM_seiziemes",           // Round of 32 — NOUVEAU
  "ELIM_huitiemes",           // Round of 16
  "ELIM_quarts",              // Quarts de finale
  "ELIM_demis",               // Demi-finales
  "ELIM_p3",
  "ELIM_finale",
];

// Une phase est débloquée si TOUTES les précédentes sont validées
// Pour les poules : toujours libres d'accès
// Pour les phases élim : requiert les poules ET les phases élim précédentes
function isPhaseUnlocked(phaseKey, validatedList) {
  if (!phaseKey.startsWith("ELIM_")) return true; // toutes les poules sont toujours accessibles
  const idx = PHASE_ORDER.indexOf(phaseKey);
  if (idx <= 0) return true;
  // Pour les élim, tout ce qui précède doit être validé
  return PHASE_ORDER.slice(0, idx).every(k => validatedList.includes(k));
}

// Dernier pas = finale validée → verrou automatique proposé
function allPhasesValidated(validatedList) {
  return PHASE_ORDER.every(k => validatedList.includes(k));
}

const MATCHES = [
  {id:"A1",group:"A",phase:"poules",home:"Mexique",away:"Afrique du Sud",date:"11 Juin",dk:"2026-06-11",time:"21h00",city:"Mexico",tv:"beIN / M6"},
  {id:"A2",group:"A",phase:"poules",home:"Corée du Sud",away:"Tchéquie",date:"12 Juin",dk:"2026-06-12",time:"04h00",city:"Zapopan",tv:"beIN"},
  {id:"A4",group:"A",phase:"poules",home:"Tchéquie",away:"Afrique du Sud",date:"18 Juin",dk:"2026-06-18",time:"18h00",city:"Atlanta",tv:"beIN / M6"},
  {id:"A3",group:"A",phase:"poules",home:"Mexique",away:"Corée du Sud",date:"19 Juin",dk:"2026-06-19",time:"03h00",city:"Zapopan",tv:"beIN"},
  {id:"A5",group:"A",phase:"poules",home:"Tchéquie",away:"Mexique",date:"25 Juin",dk:"2026-06-25",time:"03h00",city:"Mexico",tv:"beIN"},
  {id:"A6",group:"A",phase:"poules",home:"Afrique du Sud",away:"Corée du Sud",date:"25 Juin",dk:"2026-06-25",time:"03h00",city:"Zapopan",tv:"beIN"},
  {id:"B1",group:"B",phase:"poules",home:"Canada",away:"Bosnie-Herzégovine",date:"12 Juin",dk:"2026-06-12",time:"21h00",city:"Toronto",tv:"beIN / M6"},
  {id:"B2",group:"B",phase:"poules",home:"Qatar",away:"Suisse",date:"13 Juin",dk:"2026-06-13",time:"21h00",city:"Santa Clara",tv:"beIN / M6"},
  {id:"B4",group:"B",phase:"poules",home:"Suisse",away:"Bosnie-Herzégovine",date:"18 Juin",dk:"2026-06-18",time:"21h00",city:"Los Angeles",tv:"beIN / M6"},
  {id:"B3",group:"B",phase:"poules",home:"Canada",away:"Qatar",date:"19 Juin",dk:"2026-06-19",time:"00h00",city:"Vancouver",tv:"beIN"},
  {id:"B5",group:"B",phase:"poules",home:"Suisse",away:"Canada",date:"24 Juin",dk:"2026-06-24",time:"21h00",city:"Vancouver",tv:"beIN / M6"},
  {id:"B6",group:"B",phase:"poules",home:"Bosnie-Herzégovine",away:"Qatar",date:"24 Juin",dk:"2026-06-24",time:"21h00",city:"Seattle",tv:"beIN"},
  {id:"C1",group:"C",phase:"poules",home:"Brésil",away:"Maroc",date:"14 Juin",dk:"2026-06-14",time:"00h00",city:"New York",tv:"beIN / M6"},
  {id:"C2",group:"C",phase:"poules",home:"Haïti",away:"Écosse",date:"14 Juin",dk:"2026-06-14",time:"03h00",city:"Boston",tv:"beIN"},
  {id:"C3",group:"C",phase:"poules",home:"Écosse",away:"Maroc",date:"20 Juin",dk:"2026-06-20",time:"00h00",city:"Philadelphie",tv:"beIN / M6"},
  {id:"C4",group:"C",phase:"poules",home:"Brésil",away:"Haïti",date:"20 Juin",dk:"2026-06-20",time:"02h30",city:"Boston",tv:"beIN / M6"},
  {id:"C5",group:"C",phase:"poules",home:"Écosse",away:"Brésil",date:"25 Juin",dk:"2026-06-25",time:"00h00",city:"Miami",tv:"beIN / M6"},
  {id:"C6",group:"C",phase:"poules",home:"Maroc",away:"Haïti",date:"25 Juin",dk:"2026-06-25",time:"00h00",city:"Atlanta",tv:"beIN"},
  {id:"D1",group:"D",phase:"poules",home:"États-Unis",away:"Paraguay",date:"13 Juin",dk:"2026-06-13",time:"03h00",city:"Los Angeles",tv:"beIN"},
  {id:"D2",group:"D",phase:"poules",home:"Australie",away:"Turquie",date:"14 Juin",dk:"2026-06-14",time:"06h00",city:"Vancouver",tv:"beIN"},
  {id:"D3",group:"D",phase:"poules",home:"États-Unis",away:"Australie",date:"19 Juin",dk:"2026-06-19",time:"21h00",city:"Seattle",tv:"beIN / M6"},
  {id:"D4",group:"D",phase:"poules",home:"Turquie",away:"Paraguay",date:"20 Juin",dk:"2026-06-20",time:"06h00",city:"Santa Clara",tv:"beIN"},
  {id:"D5",group:"D",phase:"poules",home:"Turquie",away:"États-Unis",date:"26 Juin",dk:"2026-06-26",time:"04h00",city:"Los Angeles",tv:"beIN"},
  {id:"D6",group:"D",phase:"poules",home:"Paraguay",away:"Australie",date:"26 Juin",dk:"2026-06-26",time:"04h00",city:"Santa Clara",tv:"beIN"},
  {id:"E1",group:"E",phase:"poules",home:"Allemagne",away:"Curaçao",date:"14 Juin",dk:"2026-06-14",time:"19h00",city:"Houston",tv:"beIN / M6"},
  {id:"E2",group:"E",phase:"poules",home:"Côte d'Ivoire",away:"Équateur",date:"15 Juin",dk:"2026-06-15",time:"01h00",city:"Philadelphie",tv:"beIN"},
  {id:"E3",group:"E",phase:"poules",home:"Allemagne",away:"Côte d'Ivoire",date:"20 Juin",dk:"2026-06-20",time:"22h00",city:"Toronto",tv:"beIN / M6"},
  {id:"E4",group:"E",phase:"poules",home:"Équateur",away:"Curaçao",date:"21 Juin",dk:"2026-06-21",time:"02h00",city:"Kansas City",tv:"beIN"},
  {id:"E5",group:"E",phase:"poules",home:"Équateur",away:"Allemagne",date:"25 Juin",dk:"2026-06-25",time:"22h00",city:"New York",tv:"beIN / M6"},
  {id:"E6",group:"E",phase:"poules",home:"Curaçao",away:"Côte d'Ivoire",date:"25 Juin",dk:"2026-06-25",time:"22h00",city:"Philadelphie",tv:"beIN"},
  {id:"F1",group:"F",phase:"poules",home:"Pays-Bas",away:"Japon",date:"14 Juin",dk:"2026-06-14",time:"22h00",city:"Dallas",tv:"beIN / M6"},
  {id:"F2",group:"F",phase:"poules",home:"Suède",away:"Tunisie",date:"15 Juin",dk:"2026-06-15",time:"04h00",city:"Zapopan",tv:"beIN"},
  {id:"F3",group:"F",phase:"poules",home:"Pays-Bas",away:"Suède",date:"20 Juin",dk:"2026-06-20",time:"19h00",city:"Houston",tv:"beIN / M6"},
  {id:"F4",group:"F",phase:"poules",home:"Tunisie",away:"Japon",date:"21 Juin",dk:"2026-06-21",time:"06h00",city:"Zapopan",tv:"beIN"},
  {id:"F5",group:"F",phase:"poules",home:"Tunisie",away:"Pays-Bas",date:"26 Juin",dk:"2026-06-26",time:"01h00",city:"Kansas City",tv:"beIN / M6"},
  {id:"F6",group:"F",phase:"poules",home:"Japon",away:"Suède",date:"26 Juin",dk:"2026-06-26",time:"01h00",city:"Dallas",tv:"beIN"},
  {id:"G1",group:"G",phase:"poules",home:"Belgique",away:"Égypte",date:"15 Juin",dk:"2026-06-15",time:"21h00",city:"Seattle",tv:"beIN / M6"},
  {id:"G2",group:"G",phase:"poules",home:"Iran",away:"Nouvelle-Zélande",date:"16 Juin",dk:"2026-06-16",time:"03h00",city:"Los Angeles",tv:"beIN"},
  {id:"G3",group:"G",phase:"poules",home:"Belgique",away:"Iran",date:"21 Juin",dk:"2026-06-21",time:"21h00",city:"Los Angeles",tv:"beIN / M6"},
  {id:"G4",group:"G",phase:"poules",home:"Nouvelle-Zélande",away:"Égypte",date:"22 Juin",dk:"2026-06-22",time:"03h00",city:"Vancouver",tv:"beIN"},
  {id:"G5",group:"G",phase:"poules",home:"Nouvelle-Zélande",away:"Belgique",date:"27 Juin",dk:"2026-06-27",time:"05h00",city:"Seattle",tv:"beIN"},
  {id:"G6",group:"G",phase:"poules",home:"Égypte",away:"Iran",date:"27 Juin",dk:"2026-06-27",time:"05h00",city:"Vancouver",tv:"beIN"},
  {id:"H1",group:"H",phase:"poules",home:"Espagne",away:"Cap-Vert",date:"15 Juin",dk:"2026-06-15",time:"18h00",city:"Atlanta",tv:"beIN / M6"},
  {id:"H2",group:"H",phase:"poules",home:"Arabie Saoudite",away:"Uruguay",date:"16 Juin",dk:"2026-06-16",time:"00h00",city:"Miami",tv:"beIN / M6"},
  {id:"H3",group:"H",phase:"poules",home:"Espagne",away:"Arabie Saoudite",date:"21 Juin",dk:"2026-06-21",time:"18h00",city:"Atlanta",tv:"beIN / M6"},
  {id:"H4",group:"H",phase:"poules",home:"Uruguay",away:"Cap-Vert",date:"22 Juin",dk:"2026-06-22",time:"00h00",city:"Miami",tv:"beIN"},
  {id:"H5",group:"H",phase:"poules",home:"Uruguay",away:"Espagne",date:"27 Juin",dk:"2026-06-27",time:"02h00",city:"Zapopan",tv:"beIN / M6"},
  {id:"H6",group:"H",phase:"poules",home:"Cap-Vert",away:"Arabie Saoudite",date:"27 Juin",dk:"2026-06-27",time:"02h00",city:"Houston",tv:"beIN"},
  {id:"I1",group:"I",phase:"poules",home:"France",away:"Sénégal",date:"16 Juin",dk:"2026-06-16",time:"21h00",city:"New York",tv:"beIN / M6"},
  {id:"I2",group:"I",phase:"poules",home:"Irak",away:"Norvège",date:"17 Juin",dk:"2026-06-17",time:"00h00",city:"Boston",tv:"beIN / M6"},
  {id:"I3",group:"I",phase:"poules",home:"France",away:"Irak",date:"22 Juin",dk:"2026-06-22",time:"23h00",city:"Philadelphie",tv:"beIN / M6"},
  {id:"I4",group:"I",phase:"poules",home:"Norvège",away:"Sénégal",date:"23 Juin",dk:"2026-06-23",time:"02h00",city:"New York",tv:"beIN"},
  {id:"I5",group:"I",phase:"poules",home:"Norvège",away:"France",date:"26 Juin",dk:"2026-06-26",time:"21h00",city:"Boston",tv:"beIN / M6"},
  {id:"I6",group:"I",phase:"poules",home:"Sénégal",away:"Irak",date:"26 Juin",dk:"2026-06-26",time:"21h00",city:"Toronto",tv:"beIN"},
  {id:"J1",group:"J",phase:"poules",home:"Argentine",away:"Algérie",date:"17 Juin",dk:"2026-06-17",time:"03h00",city:"Kansas City",tv:"beIN"},
  {id:"J2",group:"J",phase:"poules",home:"Autriche",away:"Jordanie",date:"17 Juin",dk:"2026-06-17",time:"06h00",city:"Santa Clara",tv:"beIN"},
  {id:"J3",group:"J",phase:"poules",home:"Argentine",away:"Autriche",date:"22 Juin",dk:"2026-06-22",time:"19h00",city:"Dallas",tv:"beIN / M6"},
  {id:"J4",group:"J",phase:"poules",home:"Jordanie",away:"Algérie",date:"23 Juin",dk:"2026-06-23",time:"05h00",city:"Santa Clara",tv:"beIN"},
  {id:"J5",group:"J",phase:"poules",home:"Jordanie",away:"Argentine",date:"28 Juin",dk:"2026-06-28",time:"04h00",city:"Dallas",tv:"beIN"},
  {id:"J6",group:"J",phase:"poules",home:"Algérie",away:"Autriche",date:"28 Juin",dk:"2026-06-28",time:"04h00",city:"Kansas City",tv:"beIN"},
  {id:"K1",group:"K",phase:"poules",home:"Portugal",away:"Rép. Dém. Congo",date:"17 Juin",dk:"2026-06-17",time:"19h00",city:"Houston",tv:"beIN / M6"},
  {id:"K2",group:"K",phase:"poules",home:"Ouzbékistan",away:"Colombie",date:"18 Juin",dk:"2026-06-18",time:"04h00",city:"Mexico",tv:"beIN"},
  {id:"K3",group:"K",phase:"poules",home:"Portugal",away:"Ouzbékistan",date:"23 Juin",dk:"2026-06-23",time:"19h00",city:"Houston",tv:"beIN / M6"},
  {id:"K4",group:"K",phase:"poules",home:"Colombie",away:"Rép. Dém. Congo",date:"24 Juin",dk:"2026-06-24",time:"04h00",city:"Zapopan",tv:"beIN"},
  {id:"K5",group:"K",phase:"poules",home:"Colombie",away:"Portugal",date:"28 Juin",dk:"2026-06-28",time:"01h30",city:"Miami",tv:"beIN / M6"},
  {id:"K6",group:"K",phase:"poules",home:"Rép. Dém. Congo",away:"Ouzbékistan",date:"28 Juin",dk:"2026-06-28",time:"01h30",city:"Atlanta",tv:"beIN"},
  {id:"L1",group:"L",phase:"poules",home:"Angleterre",away:"Croatie",date:"17 Juin",dk:"2026-06-17",time:"22h00",city:"Dallas",tv:"beIN / M6"},
  {id:"L2",group:"L",phase:"poules",home:"Ghana",away:"Panama",date:"18 Juin",dk:"2026-06-18",time:"01h00",city:"Toronto",tv:"beIN"},
  {id:"L3",group:"L",phase:"poules",home:"Angleterre",away:"Ghana",date:"23 Juin",dk:"2026-06-23",time:"22h00",city:"Boston",tv:"beIN / M6"},
  {id:"L4",group:"L",phase:"poules",home:"Panama",away:"Croatie",date:"24 Juin",dk:"2026-06-24",time:"01h00",city:"Toronto",tv:"beIN"},
  {id:"L5",group:"L",phase:"poules",home:"Panama",away:"Angleterre",date:"27 Juin",dk:"2026-06-27",time:"23h00",city:"New York",tv:"beIN / M6"},
  {id:"L6",group:"L",phase:"poules",home:"Croatie",away:"Ghana",date:"27 Juin",dk:"2026-06-27",time:"23h00",city:"Philadelphie",tv:"beIN"},
  // SEIZIÈMES DE FINALE (Round of 32) - Calendrier officiel FIFA 2026
  {id:"R1",group:"ELIM",phase:"seiziemes",home:"2e A",away:"2e B",date:"28 Juin",dk:"2026-06-28",time:"21h00",city:"Los Angeles",tv:"beIN / M6"},
  {id:"R2",group:"ELIM",phase:"seiziemes",home:"1er C",away:"2e F",date:"29 Juin",dk:"2026-06-29",time:"19h00",city:"Houston",tv:"beIN / M6"},
  {id:"R3",group:"ELIM",phase:"seiziemes",home:"1er E",away:"3e ABCDF",date:"29 Juin",dk:"2026-06-29",time:"22h30",city:"Boston",tv:"beIN / M6"},
  {id:"R4",group:"ELIM",phase:"seiziemes",home:"1er F",away:"2e C",date:"30 Juin",dk:"2026-06-30",time:"03h00",city:"Monterrey",tv:"beIN"},
  {id:"R5",group:"ELIM",phase:"seiziemes",home:"2e E",away:"2e I",date:"30 Juin",dk:"2026-06-30",time:"19h00",city:"Dallas",tv:"beIN / M6"},
  {id:"R6",group:"ELIM",phase:"seiziemes",home:"1er I",away:"3e CDFGH",date:"30 Juin",dk:"2026-06-30",time:"23h00",city:"New York",tv:"beIN / M6"},
  {id:"R7",group:"ELIM",phase:"seiziemes",home:"1er A",away:"3e CEFHI",date:"1 Juil.",dk:"2026-07-01",time:"03h00",city:"Mexico",tv:"beIN"},
  {id:"R8",group:"ELIM",phase:"seiziemes",home:"1er L",away:"3e EHIJK",date:"1 Juil.",dk:"2026-07-01",time:"18h00",city:"Atlanta",tv:"beIN / M6"},
  {id:"R9",group:"ELIM",phase:"seiziemes",home:"1er G",away:"3e AEHIJ",date:"1 Juil.",dk:"2026-07-01",time:"22h00",city:"Seattle",tv:"beIN"},
  {id:"R10",group:"ELIM",phase:"seiziemes",home:"1er D",away:"3e BEFIJ",date:"2 Juil.",dk:"2026-07-02",time:"02h00",city:"San Francisco",tv:"beIN"},
  {id:"R11",group:"ELIM",phase:"seiziemes",home:"1er H",away:"2e J",date:"2 Juil.",dk:"2026-07-02",time:"21h00",city:"Los Angeles",tv:"beIN / M6"},
  {id:"R12",group:"ELIM",phase:"seiziemes",home:"2e K",away:"2e L",date:"3 Juil.",dk:"2026-07-03",time:"01h00",city:"Toronto",tv:"beIN"},
  {id:"R13",group:"ELIM",phase:"seiziemes",home:"1er B",away:"3e EFGIJ",date:"3 Juil.",dk:"2026-07-03",time:"05h00",city:"Vancouver",tv:"beIN"},
  {id:"R14",group:"ELIM",phase:"seiziemes",home:"2e D",away:"2e G",date:"3 Juil.",dk:"2026-07-03",time:"20h00",city:"Dallas",tv:"beIN / M6"},
  {id:"R15",group:"ELIM",phase:"seiziemes",home:"1er J",away:"2e H",date:"4 Juil.",dk:"2026-07-04",time:"00h00",city:"Miami",tv:"beIN"},
  {id:"R16",group:"ELIM",phase:"seiziemes",home:"1er K",away:"3e DEIJL",date:"4 Juil.",dk:"2026-07-04",time:"03h30",city:"Kansas City",tv:"beIN / M6"},
  // HUITIÈMES DE FINALE (Round of 16) - Appairage officiel FIFA
  // V73=R1, V74=R3, V75=R4, V76=R2, V77=R6, V78=R5, V79=R7, V80=R8, V81=R10, V82=R9, V83=R13, V84=R11, V85=R12, V86=R15, V87=R16, V88=R14
  {id:"Q1",group:"ELIM",phase:"huitiemes",home:"V. R1",away:"V. R4",date:"4 Juil.",dk:"2026-07-04",time:"19h00",city:"Houston",tv:"beIN / M6"},
  {id:"Q2",group:"ELIM",phase:"huitiemes",home:"V. R3",away:"V. R6",date:"4 Juil.",dk:"2026-07-04",time:"23h00",city:"Philadelphie",tv:"beIN / M6"},
  {id:"Q3",group:"ELIM",phase:"huitiemes",home:"V. R2",away:"V. R5",date:"5 Juil.",dk:"2026-07-05",time:"22h00",city:"New York",tv:"beIN / M6"},
  {id:"Q4",group:"ELIM",phase:"huitiemes",home:"V. R7",away:"V. R8",date:"6 Juil.",dk:"2026-07-06",time:"02h00",city:"Mexico",tv:"beIN"},
  {id:"Q5",group:"ELIM",phase:"huitiemes",home:"V. R12",away:"V. R11",date:"6 Juil.",dk:"2026-07-06",time:"21h00",city:"Dallas",tv:"beIN / M6"},
  {id:"Q6",group:"ELIM",phase:"huitiemes",home:"V. R10",away:"V. R9",date:"7 Juil.",dk:"2026-07-07",time:"02h00",city:"Seattle",tv:"beIN"},
  {id:"Q7",group:"ELIM",phase:"huitiemes",home:"V. R15",away:"V. R14",date:"7 Juil.",dk:"2026-07-07",time:"18h00",city:"Atlanta",tv:"beIN / M6"},
  {id:"Q8",group:"ELIM",phase:"huitiemes",home:"V. R16",away:"V. R13",date:"7 Juil.",dk:"2026-07-07",time:"22h00",city:"Vancouver",tv:"beIN / M6"},
  // QUARTS DE FINALE
  {id:"S1",group:"ELIM",phase:"quarts",home:"V. Q1",away:"V. Q2",date:"9 Juil.",dk:"2026-07-09",time:"22h00",city:"Boston",tv:"beIN / M6"},
  {id:"S2",group:"ELIM",phase:"quarts",home:"V. Q3",away:"V. Q4",date:"10 Juil.",dk:"2026-07-10",time:"21h00",city:"Los Angeles",tv:"beIN / M6"},
  {id:"S3",group:"ELIM",phase:"quarts",home:"V. Q5",away:"V. Q6",date:"11 Juil.",dk:"2026-07-11",time:"23h00",city:"Miami",tv:"beIN / M6"},
  {id:"S4",group:"ELIM",phase:"quarts",home:"V. Q7",away:"V. Q8",date:"12 Juil.",dk:"2026-07-12",time:"03h00",city:"Kansas City",tv:"beIN"},
  // DEMI-FINALES
  {id:"SF1",group:"ELIM",phase:"demis",home:"V. S1",away:"V. S2",date:"14 Juil.",dk:"2026-07-14",time:"21h00",city:"Dallas",tv:"beIN / M6"},
  {id:"SF2",group:"ELIM",phase:"demis",home:"V. S3",away:"V. S4",date:"15 Juil.",dk:"2026-07-15",time:"21h00",city:"Atlanta",tv:"beIN / M6"},
  // 3E PLACE & FINALE
  {id:"P3",group:"ELIM",phase:"p3",home:"Perdant SF1",away:"Perdant SF2",date:"18 Juil.",dk:"2026-07-18",time:"23h00",city:"Miami",tv:"beIN / M6"},
  {id:"FIN",group:"ELIM",phase:"finale",home:"Vainqueur SF1",away:"Vainqueur SF2",date:"19 Juil.",dk:"2026-07-19",time:"21h00",city:"New York",tv:"beIN / M6"},
];

// ══════════════════════════════════════════
// RESOLVE ELIM TEAM NAMES FROM RESULTS
// ══════════════════════════════════════════

/** Classement d'un groupe (pts, goal-avg, buts marqués) */
function groupStandings(gid, results, scores = {}) {
  const t = {};
  MATCHES.filter(m => m.group === gid && m.phase === "poules").forEach(m => {
    if (!t[m.home]) t[m.home] = { pts:0, gf:0, ga:0 };
    if (!t[m.away]) t[m.away] = { pts:0, gf:0, ga:0 };
    const r  = results[m.id];
    const sc = scores[m.id];
    if (r === "1") t[m.home].pts += 3;
    else if (r === "2") t[m.away].pts += 3;
    else if (r === "N") { t[m.home].pts++; t[m.away].pts++; }
    // Buts réels pour départager les égalités de points
    if (sc && sc.h !== "" && sc.a !== "" && sc.h != null && sc.a != null) {
      const gh = Number(sc.h)||0, ga = Number(sc.a)||0;
      t[m.home].gf += gh; t[m.home].ga += ga;
      t[m.away].gf += ga; t[m.away].ga += gh;
    }
  });
  return Object.entries(t)
    .sort((a,b) => b[1].pts - a[1].pts || (b[1].gf-b[1].ga) - (a[1].gf-a[1].ga) || b[1].gf - a[1].gf)
    .map(([n]) => n);
}

/**
 * Calcule les stats d'une équipe dans son groupe.
 * Utilisé pour classer les 3es mondialement.
 */
function teamStatsInGroup(team, gid, results, scores = {}) {
  let pts = 0, gf = 0, ga = 0;
  MATCHES.filter(m => m.group === gid && m.phase === "poules").forEach(m => {
    const r  = results[m.id];
    const sc = scores[m.id];
    if (!r) return;
    const isHome = m.home === team;
    const isAway = m.away === team;
    if (!isHome && !isAway) return;
    if (r === "1" && isHome) pts += 3;
    else if (r === "2" && isAway) pts += 3;
    else if (r === "N") pts++;
    if (sc && sc.h !== "" && sc.a !== "" && sc.h != null && sc.a != null) {
      if (isHome) { gf += Number(sc.h)||0; ga += Number(sc.a)||0; }
      else        { gf += Number(sc.a)||0; ga += Number(sc.h)||0; }
    }
  });
  return { pts, gd: gf - ga, gf };
}

/**
 * Calcule l'assignation unique des 8 meilleures 3es équipes aux 8 matches
 * "3e XXXXX" du tableau des 16es de finale.
 *
 * Problème corrigé : sans ce calcul global, resolveTeam retourne la même
 * équipe pour plusieurs matches (ex. "3e CDFGH" ET "3e CEFHI" → même équipe
 * si c'est la meilleure dans les deux pools). Désormais chaque qualifié est
 * assigné à exactement UN match.
 *
 * Algorithme : "most-constrained first" (greedy)
 *  1. Classer les 12 3es globalement (pts > goal-avg > buts).
 *  2. Retenir les 8 premiers (quota WC2026).
 *  3. Collecter tous les patterns "3e XXXXX" du tableau.
 *  4. Affecter en commençant par le pool le moins flexible (moins de candidats
 *     encore disponibles) → garantit qu'il n'y a jamais de doublon.
 */
let _thirdCache = { key: "", assignment: {} };

function build3rdAssignment(results, scores = {}, officialThirds = {}) {
  const key = JSON.stringify(results) + "|" + JSON.stringify(scores) + "|" + JSON.stringify(officialThirds);
  if (_thirdCache.key === key) return _thirdCache.assignment;

  // 1. 3e de chaque groupe + ses stats
  const allThirds = GROUPS.map(g => {
    const s = groupStandings(g, results, scores);
    const team = s[2];
    if (!team) return null;
    const stats = teamStatsInGroup(team, g, results, scores);
    return { team, group: g, ...stats };
  }).filter(Boolean);

  // 2. Classement mondial, top 8
  allThirds.sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf
  );
  const qualifiers = allThirds.slice(0, 8);

  // 3. Patterns de pools présents dans les 16es
  const poolPatterns = [];
  MATCHES.filter(m => m.phase === "seiziemes").forEach(m => {
    [m.home, m.away].forEach(slot => {
      const px = slot.match(/^3e ([A-L]+)$/);
      if (px && !poolPatterns.includes(px[1])) poolPatterns.push(px[1]);
    });
  });

  // 4. Assignation greedy "plus contraint d'abord"
  const assignment = {};
  const usedGroups = new Set();
  const remaining = [...poolPatterns];

  while (remaining.length > 0) {
    // Recalculer le nombre d'options restantes pour chaque pool
    remaining.sort((a, b) => {
      const ao = qualifiers.filter(q => a.includes(q.group) && !usedGroups.has(q.group)).length;
      const bo = qualifiers.filter(q => b.includes(q.group) && !usedGroups.has(q.group)).length;
      return ao - bo; // pool avec moins d'options en premier
    });
    const pool = remaining.shift();
    // Prendre le qualifié le mieux classé disponible pour ce pool
    const candidate = qualifiers.find(q => pool.includes(q.group) && !usedGroups.has(q.group));
    if (candidate) {
      assignment[pool] = candidate.team;
      usedGroups.add(candidate.group);
    }
  }

  // Override avec les picks officiels de l'admin si présents
  Object.entries(officialThirds).forEach(([key2, group]) => {
    if (!group) return;
    // key2 = "R3_home" ou "R7_away" etc.
    const matchPart = key2.replace(/_home$|_away$/, '');
    const match = MATCHES.find(m => m.id === matchPart);
    if (!match) return;
    const side = key2.endsWith('_home') ? 'home' : 'away';
    const slot = match[side];
    const px = slot && slot.match(/^3e ([A-L]+)$/);
    if (px && !assignment[px[1]]) {
      assignment[px[1]] = group;
    }
  });

  _thirdCache = { key, assignment };
  return assignment;
}

// Résolution récursive des équipes dans les phases éliminatoires
// Basée sur les résultats OFFICIELS en priority, puis sur les prédictions du joueur en fallback
function resolveTeamWithPredictions(ph, results, predictions = {}, scores = {}, officialThirds = {}, userThirds = {}) {
  if (!results && !predictions) return ph;
  if (FLAGS[ph]) return ph; // déjà une vraie équipe

  // Helper : vérifie qu'il y a AU MOINS UN résultat officiel joué pour ce groupe
  const hasOfficialGroupResults = (gid) =>
    MATCHES.some(m => m.group === gid && m.phase === "poules" && results && results[m.id]);

  // "1er A" → 1er du groupe A
  const m1 = ph.match(/^1er ([A-L])$/);
  if (m1) {
    if (hasOfficialGroupResults(m1[1])) {
      const sOff = groupStandings(m1[1], results, scores);
      if (sOff[0]) return sOff[0];
    }
    const sPred = groupStandings(m1[1], predictions, scores);
    return sPred[0] || ph;
  }

  // "2e A" → 2e du groupe A
  const m2 = ph.match(/^2e ([A-L])$/);
  if (m2) {
    if (hasOfficialGroupResults(m2[1])) {
      const sOff = groupStandings(m2[1], results, scores);
      if (sOff[1]) return sOff[1];
    }
    const sPred = groupStandings(m2[1], predictions, scores);
    return sPred[1] || ph;
  }

  // "3e ABCDF" → meilleur 3e parmi ces groupes
  const m3 = ph.match(/^3e ([A-L]+)$/);
  if (m3) {
    const eligibleGroups = m3[1].split('');

    // 1. Assignment officielle (admin ou résultats officiels)
    const assignment = build3rdAssignment(results, scores, officialThirds);
    if (assignment[m3[1]]) return assignment[m3[1]];

    // 2. Choix du joueur via userThirds: chercher le slot qui correspond à "3e XXXXX"
    // userThirds = { "R3_away": "A", "R6_away": "C", ... }
    if (userThirds) {
      for (const [slotKey, chosenGroup] of Object.entries(userThirds)) {
        if (!eligibleGroups.includes(chosenGroup)) continue;
        const parts = slotKey.split('_');
        if (parts.length < 2) continue;
        const side = parts[parts.length - 1];
        const matchId = parts.slice(0, -1).join('_');
        const refMatch = MATCHES.find(mm => mm.id === matchId);
        if (!refMatch || refMatch[side] !== ph) continue;
        // Bon slot — résoudre le 3e du groupe choisi
        if (hasOfficialGroupResults(chosenGroup)) {
          const s = groupStandings(chosenGroup, results, scores);
          if (s[2]) return s[2];
        }
        const s = groupStandings(chosenGroup, predictions, scores);
        if (s[2]) return s[2];
      }
    }

    // 3. Si toujours pas trouvé: prendre le meilleur 3e via pronos (premier groupe éligible valide)
    for (const g of eligibleGroups) {
      const s = groupStandings(g, predictions, scores);
      if (s[2] && FLAGS[s[2]]) return s[2];
    }

    return ph;
  }

  // "V. R1" / "V. Q1" / "V. S1" → vainqueur du match
  const vMatch = ph.match(/^V\.\s*([A-Z0-9]+)$/);
  if (vMatch) {
    const refId = vMatch[1];
    let resultToUse = results[refId];
    if (!resultToUse && predictions) resultToUse = predictions[refId];
    if (!resultToUse) {
      const ref = MATCHES.find(m => m.id === refId);
      if (!ref) return ph;
      const homeTeam = resolveTeamWithPredictions(ref.home, results, predictions, scores, officialThirds, userThirds);
      const awayTeam = resolveTeamWithPredictions(ref.away, results, predictions, scores, officialThirds, userThirds);
      if (FLAGS[homeTeam] && FLAGS[awayTeam]) return `${homeTeam} / ${awayTeam}`;
      if (FLAGS[homeTeam]) return homeTeam;
      if (FLAGS[awayTeam]) return awayTeam;
      return ph;
    }
    const ref = MATCHES.find(m => m.id === refId);
    if (!ref) return ph;
    const team = resultToUse === "1" ? ref.home : resultToUse === "2" ? ref.away : null;
    if (!team) return ph;
    return resolveTeamWithPredictions(team, results, predictions, scores, officialThirds, userThirds);
  }

  // "Vainqueur SF1/SF2"
  const vSFp = ph.match(/^Vainqueur SF(\d+)$/);
  if (vSFp) {
    const sfId = "SF" + vSFp[1];
    const offResult = results[sfId];
    if (offResult) {
      const ref = MATCHES.find(m => m.id === sfId);
      if (!ref) return ph;
      return resolveTeamWithPredictions(offResult === "1" ? ref.home : ref.away, results, predictions, scores, officialThirds, userThirds);
    }
    const pred = predictions[sfId];
    if (pred) {
      const ref = MATCHES.find(m => m.id === sfId);
      if (!ref) return ph;
      return resolveTeamWithPredictions(pred === "1" ? ref.home : ref.away, results, predictions, scores, officialThirds, userThirds);
    }
    return ph;
  }

  // "Perdant SF1/SF2"
  const pSFp = ph.match(/^Perdant SF(\d+)$/);
  if (pSFp) {
    const sfId = "SF" + pSFp[1];
    const offResult = results[sfId];
    if (offResult) {
      const ref = MATCHES.find(m => m.id === sfId);
      if (!ref) return ph;
      return resolveTeamWithPredictions(offResult === "1" ? ref.away : ref.home, results, predictions, scores, officialThirds, userThirds);
    }
    const pred = predictions[sfId];
    if (pred) {
      const ref = MATCHES.find(m => m.id === sfId);
      if (!ref) return ph;
      return resolveTeamWithPredictions(pred === "1" ? ref.away : ref.home, results, predictions, scores, officialThirds, userThirds);
    }
    return ph;
  }

  return ph;
}

// Basée uniquement sur les résultats OFFICIELS (admin)
function resolveTeam(ph, results, scores = {}, officialThirds = {}) {
  if (!results) return ph;
  if (FLAGS[ph]) return ph; // déjà une vraie équipe

  // "1er A" → 1er du groupe A
  const m1 = ph.match(/^1er ([A-L])$/);
  if (m1) { const s = groupStandings(m1[1], results, scores); return s[0] || ph; }

  // "2e A" → 2e du groupe A
  const m2 = ph.match(/^2e ([A-L])$/);
  if (m2) { const s = groupStandings(m2[1], results, scores); return s[1] || ph; }

  // "3e ABCDF" → assignation GLOBALE unique (corrige le bug des doublons)
  const m3 = ph.match(/^3e ([A-L]+)$/);
  if (m3) {
    const assignment = build3rdAssignment(results, scores, officialThirds);
    return assignment[m3[1]] || ph;
  }

  // "V. R1" / "V. Q1" / "V. S1" → vainqueur du match correspondant
  const vMatch = ph.match(/^V\.\s*([A-Z0-9]+)$/);
  if (vMatch) {
    const refId = vMatch[1];
    const official = results[refId];
    if (!official) {
      const ref = MATCHES.find(m => m.id === refId);
      if (!ref) return ph;
      const homeTeam = resolveTeam(ref.home, results, scores, officialThirds);
      const awayTeam = resolveTeam(ref.away, results, scores, officialThirds);
      if (FLAGS[homeTeam] && FLAGS[awayTeam]) return `${homeTeam} / ${awayTeam}`;
      if (FLAGS[homeTeam]) return homeTeam;
      if (FLAGS[awayTeam]) return awayTeam;
      return ph;
    }
    const ref = MATCHES.find(m => m.id === refId);
    if (!ref) return ph;
    const team = official === "1" ? ref.home : ref.away;
    return resolveTeam(team, results, scores, officialThirds);
  }

  // "Vainqueur SF1" / "Vainqueur SF2" → vainqueur des demi-finales
  const vSFn = ph.match(/^Vainqueur SF(\d+)$/);
  if (vSFn) {
    const sfId = "SF" + vSFn[1];
    const official = results[sfId];
    if (!official) return ph;
    const ref = MATCHES.find(m => m.id === sfId);
    if (!ref) return ph;
    return resolveTeam(official === "1" ? ref.home : ref.away, results, scores, officialThirds);
  }

  // "Perdant SF1" / "Perdant SF2" → perdant des demi-finales (3e place)
  const pSFn = ph.match(/^Perdant SF(\d+)$/);
  if (pSFn) {
    const sfId = "SF" + pSFn[1];
    const official = results[sfId];
    if (!official) return ph;
    const ref = MATCHES.find(m => m.id === sfId);
    if (!ref) return ph;
    return resolveTeam(official === "1" ? ref.away : ref.home, results, scores, officialThirds);
  }

  // Placeholder non résolu → label lisible
  if (ph.startsWith("V. R")) return `Vainq. 1/16 #${ph.slice(4)}`;
  if (ph.startsWith("V. Q")) return `Vainq. 1/8 #${ph.slice(4)}`;
  if (ph.startsWith("V. SF")) return `Vainq. 1/4 #${ph.slice(5)}`;
  if (ph.startsWith("V. S")) return `Vainq. 1/2 #${ph.slice(4)}`;
  if (ph.match(/^Vainqueur SF\d+$/)) return "Vainq. demi-finale";
  if (ph.match(/^Perdant SF\d+$/)) return "Perdant demi-finale";
  if (ph.startsWith("3e ")) return `3e du groupe`;
  return ph;
}

// ══════════════════════════════════════════
// SCORE HELPERS
// scores[id] = { h: number, a: number } ou undefined
// outcomeOf(score, isElim) → "1" | "N" | "2" | null
// ══════════════════════════════════════════
function outcomeOf(score, isElim) {
  if (!score || score.h === "" || score.a === "" || score.h == null || score.a == null) return null;
  const h = parseInt(score.h), a = parseInt(score.a);
  if (isNaN(h) || isNaN(a)) return null;
  if (h > a) return "1";
  if (a > h) return "2";
  // Match nul interdit en élim → pas de résultat tant qu'égalité
  if (isElim) return null;
  return "N";
}

function scoreLabel(score) {
  if (!score || score.h == null || score.a == null) return null;
  return `${score.h} – ${score.a}`;
}

// ══════════════════════════════════════════════════════════════════════
// FIREBASE REALTIME DATABASE — données partagées en temps réel
// ══════════════════════════════════════════════════════════════════════
//
// ╔══════════════════════════════════════════════════════════════╗
// ║  REMPLIS TES CLÉS ICI (récupérées depuis console.firebase)  ║
// ╚══════════════════════════════════════════════════════════════╝
const FB_CONFIG = {
  apiKey:      "AIzaSyAS9MO_m0hdvcAnbh-Y2ne6lFLpTfRIdrI",   // ex: "AIzaSy..."
  authDomain:  "worldcup2026-59020.firebaseapp.com",   // ex: "worldcup2026-xxxx.firebaseapp.com"
  databaseURL: "https://worldcup2026-59020-default-rtdb.europe-west1.firebasedatabase.app",   // ex: "https://worldcup2026-xxxx-default-rtdb.europe-west1.firebasedatabase.app"
  projectId:   "worldcup2026-59020",   // ex: "worldcup2026-xxxx"
};

// ── Ne touche pas à ce qui suit ──────────────────────────────────────
const FB_ENABLED = !!FB_CONFIG.databaseURL;
let _db = null, _fbRef = null, _fbUpdate = null, _fbOnValue = null, _fbOff = null, _fbReady = false;

async function _initFirebase() {
  if (_fbReady || !FB_ENABLED) return false;
  try {
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getDatabase, ref, update, onValue, off } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
    const app = getApps().length ? getApps()[0] : initializeApp(FB_CONFIG);
    _db = getDatabase(app);
    _fbRef = p => ref(_db, p);
    _fbUpdate = (p, d) => update(ref(_db, p), d);
    _fbOnValue = onValue; _fbOff = off;
    _fbReady = true; return true;
  } catch(e) { console.warn("Firebase init failed, using localStorage:", e); return false; }
}

// Fallback localStorage (si Firebase non configuré ou hors ligne)
const KEY = "wc2026_v2";
// ═══════════════════════════════════════════════════════════════
// 🎮 JEUX — DONNÉES VÉRIFIÉES (sources: FIFA, Britannica, SportsMole)
// ═══════════════════════════════════════════════════════════════

const QUIZ_QUESTIONS = [
  { q:"Quel joueur détient le record de buts en Coupe du Monde all-time ?", choices:["Ronaldo (Brésil)","Miroslav Klose","Just Fontaine","Pelé"], answer:1, fact:"Klose (Allemagne) totalise 16 buts en 4 tournois (2002-2014), record absolu." },
  { q:"Combien de buts Just Fontaine a-t-il marqués lors du Mondial 1958 ?", choices:["10","11","13","15"], answer:2, fact:"13 buts en 6 matchs — record d'un seul tournoi, imbattu depuis 1958." },
  { q:"Quel joueur a marqué 5 buts dans un seul match de Coupe du Monde ?", choices:["Gerd Müller","Ronaldo","Oleg Salenko","Eusebio"], answer:2, fact:"Oleg Salenko (Russie) a inscrit 5 buts contre le Cameroun en 1994." },
  { q:"Quel est le plus jeune joueur à avoir participé à une Coupe du Monde ?", choices:["Pelé","Gavi","Norman Whiteside","Michael Owen"], answer:2, fact:"Norman Whiteside (Irlande du Nord) avait 17 ans et 41 jours lors du Mondial 1982." },
  { q:"Quel est le plus jeune buteur de l'histoire de la Coupe du Monde ?", choices:["Pelé","Ronaldo","Mbappé","Gavi"], answer:0, fact:"Pelé avait 17 ans et 239 jours quand il a marqué contre le Pays de Galles en 1958." },
  { q:"Combien de fois le Brésil a-t-il remporté la Coupe du Monde ?", choices:["4","5","6","3"], answer:1, fact:"Le Brésil est le seul pays à avoir remporté 5 titres (1958, 1962, 1970, 1994, 2002)." },
  { q:"Quel gardien a encaissé 0 but pendant 517 minutes consécutives au Mondial 1990 ?", choices:["Peter Shilton","René Higuita","Sergio Goycochea","Walter Zenga"], answer:3, fact:"Walter Zenga (Italie) a établi ce record de clean sheets lors du Mondial en Italie." },
  { q:"Quel joueur a joué le plus grand nombre de matchs en Coupe du Monde ?", choices:["Lothar Matthäus","Cafu","Cristiano Ronaldo","Lionel Messi"], answer:3, fact:"Lionel Messi : 26 matchs en Coupe du Monde (2006-2022), record absolu." },
  { q:"Qui a joué 3 finales de Coupe du Monde consécutives (1994, 1998, 2002) ?", choices:["Roberto Carlos","Ronaldo","Cafu","Rivaldo"], answer:2, fact:"Cafu (Brésil) est le seul joueur à avoir disputé 3 finales consécutives." },
  { q:"Combien de buts de la tête Zidane a-t-il marqués en finale 1998 ?", choices:["0","1","2","3"], answer:2, fact:"Zidane a marqué 2 buts de la tête contre le Brésil (3-0) — sa plus grande nuit." },
  { q:"Quel plus vieux joueur a participé à une Coupe du Monde ?", choices:["Roger Milla","Pat Jennings","Essam El-Hadary","Faryd Mondragón"], answer:2, fact:"Essam El-Hadary (Égypte) avait 45 ans et 161 jours lors du Mondial 2018." },
  { q:"Combien de buts Ronaldo (Brésil) a-t-il marqués en Coupe du Monde ?", choices:["12","13","14","15"], answer:3, fact:"R9 a inscrit 15 buts en 4 éditions (1994-2006), dont le Golden Boot 1998 et 2002." },
  { q:"Quelle édition a produit le plus de buts (172) ?", choices:["France 1998","Brésil 2014","Qatar 2022","Italie 1990"], answer:2, fact:"Qatar 2022 : 172 buts en 64 matchs (2,69 buts/match), record absolu." },
  { q:"Quel joueur a remporté 3 Coupes du Monde ?", choices:["Ronaldo (Brésil)","Diego Maradona","Pelé","Zidane"], answer:2, fact:"Pelé est le seul joueur à avoir remporté 3 Coupes du Monde (1958, 1962, 1970)." },
  { q:"Kylian Mbappé a marqué combien de buts en finales de Coupe du Monde ?", choices:["2","3","4","5"], answer:2, fact:"4 buts : 1 vs Croatie en 2018, et un hat-trick remarquable vs Argentine en 2022." },
  { q:"Dans quelle ville se jouera la finale du Mondial 2026 ?", choices:["Los Angeles","Dallas","New York","Miami"], answer:2, fact:"La finale se joue le 19 juillet 2026 au MetLife Stadium à New York / East Rutherford." },
  { q:"Combien d'équipes participent à la Coupe du Monde 2026 ?", choices:["32","36","40","48"], answer:3, fact:"Pour la première fois, 48 équipes participent au Mondial 2026, contre 32 depuis 1998." },
  { q:"Quel pays co-organise le Mondial 2026 avec les États-Unis ?", choices:["Mexique et Canada","Mexique et Brésil","Canada et Argentine","Mexique uniquement"], answer:0, fact:"Le Mondial 2026 est co-organisé par les États-Unis, le Canada et le Mexique." },
  { q:"Combien de matchs Gerd Müller a-t-il fallu pour marquer 14 buts en CdM ?", choices:["10","13","15","18"], answer:1, fact:"Müller (Allemagne) a marqué 14 buts en seulement 13 matchs (2 tournois, 1970 et 1974)." },
  { q:"Quel pays a remporté le Mondial 2022 au Qatar ?", choices:["France","Brésil","Argentine","Portugal"], answer:2, fact:"L'Argentine a battu la France 4-2 aux tirs au but après un match épique 3-3." },
  { q:"En quelle année l'Allemagne a-t-elle battu le Brésil 7-1 en demi-finale ?", choices:["2010","2014","2018","2006"], answer:1, fact:"Le 'Mineirazo' : l'Allemagne a écrasé le Brésil 7-1 à Belo Horizonte le 8 juillet 2014." },
  { q:"Quel gardien a arrêté 3 penalties lors de la finale 1994 USA ?", choices:["Taffarel","Pagliuca","Meola","Illgner"], answer:0, fact:"Taffarel (Brésil) a arrêté le tir de Baggio — le Brésil gagna son 4e titre aux TAB." },
  { q:"Qui a marqué lors de 5 Coupes du Monde différentes ?", choices:["Pelé","Cristiano Ronaldo","Cafu","Lothar Matthäus"], answer:1, fact:"Ronaldo a marqué lors de 5 éditions (2002, 2006, 2010, 2014, 2022) — record absolu." },
  { q:"Combien de sélections compte Cristiano Ronaldo avec le Portugal ?", choices:["165","180","205","212"], answer:3, fact:"Ronaldo dépasse les 212 sélections officielles avec le Portugal — record mondial." },
  { q:"Quel stade accueillera la finale du Mondial 2026 ?", choices:["SoFi Stadium","AT&T Stadium","MetLife Stadium","Hard Rock Stadium"], answer:2, fact:"Le MetLife Stadium (New York/New Jersey, 82 500 places) accueille la finale le 19 juillet 2026." },
  { q:"Combien d'équipes africaines participent au Mondial 2026 ?", choices:["5","6","8","9"], answer:3, fact:"9 équipes africaines participent au Mondial 2026 contre 5 précédemment — record." },
  { q:"Quel attaquant français a réussi un hat-trick en finale de Coupe du Monde ?", choices:["Thierry Henry","Zinedine Zidane","Kylian Mbappé","Nicolas Anelka"], answer:2, fact:"Mbappé est le premier à réussir un hat-trick en finale de CdM depuis Geoff Hurst en 1966." },
  { q:"Quelle sélection a remporté le Mondial 2018 en Russie ?", choices:["Argentine","Croatie","France","Belgique"], answer:2, fact:"La France a battu la Croatie 4-2 en finale à Moscou, décrochant son 2ème titre." },
  { q:"Qui est le seul joueur à avoir marqué en 4 finales de Coupe du Monde ?", choices:["Pelé","Ronaldo","Kylian Mbappé","Vavá"], answer:2, fact:"Mbappé a marqué en finale 2018 et 2022 (hat-trick), soit 4 buts en 2 finales — record." },
  { q:"Combien de pays ont déjà accueilli la Coupe du Monde avant 2026 ?", choices:["16","17","18","19"], answer:2, fact:"18 pays ont été hôtes entre 1930 et 2022, avec notamment l'Italie et le Mexique deux fois." },
  { q:"Quel pays a organisé et remporté la toute première Coupe du Monde en 1930 ?", choices:["Argentine","Brésil","Uruguay","Italie"], answer:2, fact:"L'Uruguay a accueilli et remporté le premier Mondial, battant l'Argentine 4-2 en finale." },
  { q:"Combien de titres mondiaux l'Allemagne compte-t-elle ?", choices:["3","4","5","2"], answer:1, fact:"L'Allemagne a été championne en 1954, 1974, 1990 et 2014." },
  { q:"Combien de titres mondiaux l'Italie compte-t-elle ?", choices:["3","4","2","5"], answer:1, fact:"L'Italie a été sacrée en 1934, 1938, 1982 et 2006." },
  { q:"Quelle est la seule sélection à avoir disputé toutes les phases finales de Coupe du Monde ?", choices:["Allemagne","Italie","Brésil","Argentine"], answer:2, fact:"Le Brésil est présent à chaque édition depuis 1930, sans exception." },
  { q:"Qui a marqué le but vainqueur de la finale 2010 face aux Pays-Bas ?", choices:["David Villa","Xavi Hernandez","Andrés Iniesta","Fernando Torres"], answer:2, fact:"Iniesta a inscrit l'unique but de la finale à la 116e minute, offrant le 1er titre à l'Espagne." },
  { q:"Quel pays a accueilli la Coupe du Monde 1994 ?", choices:["Mexique","Brésil","États-Unis","Canada"], answer:2, fact:"Les États-Unis ont organisé le Mondial 1994, remporté par le Brésil aux tirs au but." },
  { q:"Quelle sélection a remporté la Coupe du Monde 1990 en Italie ?", choices:["Argentine","Allemagne de l'Ouest","Italie","Brésil"], answer:1, fact:"L'Allemagne de l'Ouest a battu l'Argentine 1-0 en finale, sur un penalty d'Andreas Brehme." },
  { q:"Quel est le seul gardien de but à avoir remporté le Ballon d'Or ?", choices:["Gianluigi Buffon","Lev Yashin","Iker Casillas","Dino Zoff"], answer:1, fact:"Le soviétique Lev Yashin a reçu le Ballon d'Or en 1963, fait unique pour un gardien." },
  { q:"Quel pays a remporté la Coupe du Monde 1966, organisée à domicile ?", choices:["Angleterre","Allemagne de l'Ouest","Portugal","Brésil"], answer:0, fact:"L'Angleterre a battu l'Allemagne de l'Ouest 4-2 en finale à Wembley, son unique titre." },
  { q:"Quelle sélection a créé la surprise en battant la grande Hongrie en finale 1954 (le \"Miracle de Berne\") ?", choices:["Autriche","Allemagne de l'Ouest","Suisse","Yougoslavie"], answer:1, fact:"L'Allemagne de l'Ouest a renversé la Hongrie, pourtant invaincue depuis 4 ans, 3-2 en finale." },
  { q:"Combien de fois l'Argentine a-t-elle été championne du monde ?", choices:["2","3","4","1"], answer:1, fact:"L'Argentine a été sacrée en 1978, 1986 et 2022." },
  { q:"Quel pays a remporté son 2e titre mondial en battant le Brésil à domicile en 1950, au Maracanã ?", choices:["Uruguay","Argentine","Espagne","Paraguay"], answer:0, fact:"Le \"Maracanazo\" : l'Uruguay a battu le Brésil 2-1 devant 200 000 spectateurs." },
  { q:"Quel joueur a disputé un record de 5 Coupes du Monde avec l'Allemagne ?", choices:["Franz Beckenbauer","Lothar Matthäus","Miroslav Klose","Philipp Lahm"], answer:1, fact:"Lothar Matthäus a participé à 5 Mondiaux consécutifs, de 1982 à 1998." },
  { q:"Quelle co-organisation a accueilli la première Coupe du Monde disputée en Asie, en 2002 ?", choices:["Chine - Japon","Corée du Sud - Japon","Corée du Sud - Chine","Japon - Thaïlande"], answer:1, fact:"Le Mondial 2002, remporté par le Brésil, fut co-organisé par la Corée du Sud et le Japon." },
  { q:"Quel pays a remporté la Coupe du Monde 1938, organisée en France ?", choices:["France","Hongrie","Italie","Brésil"], answer:2, fact:"L'Italie a conservé son titre, battant la Hongrie 4-2 en finale." },
  { q:"Quelle sélection a remporté la Coupe du Monde 1978, disputée à domicile ?", choices:["Brésil","Argentine","Pays-Bas","Pérou"], answer:1, fact:"L'Argentine a battu les Pays-Bas 3-1 en finale, son 1er titre mondial." },
  { q:"Combien de titres mondiaux le Brésil compte-t-il au total ?", choices:["4","5","6","3"], answer:1, fact:"Le Brésil est sacré en 1958, 1962, 1970, 1994 et 2002 — record absolu." },
  { q:"Quelle fut la première finale de Coupe du Monde décidée aux tirs au but ?", choices:["1990","1994","1998","2006"], answer:1, fact:"En 1994, le Brésil a battu l'Italie aux tirs au but après un 0-0." },
  { q:"Quel pays a remporté la Coupe du Monde 1958, premier titre de Pelé à 17 ans ?", choices:["Brésil","Suède","Uruguay","France"], answer:0, fact:"Le Brésil a battu la Suède, pays hôte, 5-2 en finale." },
  { q:"Quel pays a accueilli la Coupe du Monde 1986, pour la 2e fois après 1970 ?", choices:["Espagne","Mexique","Colombie","Brésil"], answer:1, fact:"Le Mexique reprend l'organisation après le désistement de la Colombie ; l'Argentine de Maradona y est sacrée." },
  { q:"Quelle sélection a remporté la Coupe du Monde 1982 en Espagne ?", choices:["Brésil","Allemagne de l'Ouest","Italie","France"], answer:2, fact:"L'Italie a battu l'Allemagne de l'Ouest 3-1 en finale, son 3e titre." },
  { q:"Avant 2026, aucune équipe européenne n'avait jamais remporté une Coupe du Monde disputée sur quel continent ?", choices:["Afrique","Asie","Amérique","Océanie"], answer:2, fact:"Une statistique célèbre du football : avant 2026, l'Europe n'avait jamais gagné en Amérique, et vice-versa." },
  { q:"Quel pays a remporté la toute première Coupe du Monde disputée en Europe, en 1934 ?", choices:["France","Italie","Autriche","Tchécoslovaquie"], answer:1, fact:"L'Italie, pays hôte, a remporté son premier titre en 1934 face à la Tchécoslovaquie." },
  { q:"Quel pays a remporté la Coupe du Monde 1974, organisée à domicile ?", choices:["Pays-Bas","Allemagne de l'Ouest","Pologne","Brésil"], answer:1, fact:"L'Allemagne de l'Ouest, menée par Beckenbauer, a battu les Pays-Bas de Cruyff 2-1 en finale." },
  { q:"Quelle est la seule finale de Coupe du Monde à avoir vu un joueur être expulsé ?", choices:["1998","2006","2010","1994"], answer:1, fact:"En 2006, Zinédine Zidane a été expulsé en prolongation pour un coup de tête sur Marco Materazzi." },
  { q:"Quel pays a accueilli la Coupe du Monde 1990 ?", choices:["Espagne","Italie","France","Allemagne"], answer:1, fact:"L'Italie a organisé l'édition 1990, remportée par l'Allemagne de l'Ouest." },
  { q:"Quelle sélection a remporté la Coupe du Monde 1930, la toute première édition ?", choices:["Brésil","Argentine","Uruguay","Italie"], answer:2, fact:"L'Uruguay, pays hôte, a battu l'Argentine 4-2 en finale à Montevideo." },
  { q:"Combien de fois l'Uruguay a-t-il été champion du monde ?", choices:["1","2","3","0"], answer:1, fact:"L'Uruguay a été sacré en 1930 et 1950, ses deux seuls titres à ce jour." },
  { q:"Quel pays a accueilli la Coupe du Monde 1970, marquée par le sacre du Brésil de Pelé ?", choices:["Mexique","Chili","Argentine","Pérou"], answer:0, fact:"Le Mexique a organisé l'édition 1970, où le Brésil a décroché son 3e titre." },
  { q:"Quelle sélection a remporté la Coupe du Monde 1962, disputée au Chili ?", choices:["Brésil","Tchécoslovaquie","Chili","Yougoslavie"], answer:0, fact:"Le Brésil a conservé son titre, battant la Tchécoslovaquie 3-1 en finale." },
  { q:"Quel pays a remporté la Coupe du Monde 2014, disputée au Brésil ?", choices:["Brésil","Argentine","Allemagne","Pays-Bas"], answer:2, fact:"L'Allemagne a battu l'Argentine 1-0 en finale, son 4e titre mondial." },
  { q:"Quelle sélection a remporté la Coupe du Monde 2018, organisée en Russie ?", choices:["Croatie","France","Belgique","Angleterre"], answer:1, fact:"La France a battu la Croatie 4-2 en finale, son 2e titre mondial." },
  { q:"Quel joueur portugais a marqué lors de 5 Coupes du Monde différentes (2006-2022) ?", choices:["Cristiano Ronaldo","Eusébio","Luis Figo","Pepe"], answer:0, fact:"Ronaldo a marqué à chaque édition de 2006 à 2022, un record absolu." },
  { q:"Quel pays a éliminé l'Allemagne dès le premier tour du Mondial 2018, en tant que tenante du titre ?", choices:["Mexique","Corée du Sud","Suède","Les deux premiers"], answer:3, fact:"L'Allemagne a fini dernière de son groupe, battue par le Mexique et la Corée du Sud." },
  { q:"Quel pays a remporté son tout premier titre mondial lors de la Coupe du Monde 2010 ?", choices:["Pays-Bas","Espagne","Allemagne","Uruguay"], answer:1, fact:"L'Espagne a battu les Pays-Bas 1-0 en finale, son unique titre à ce jour." },
  { q:"Combien de buts l'équipe de France a-t-elle inscrits lors du Mondial 1998 à domicile ?", choices:["13","15","17","19"], answer:1, fact:"La France a marqué 15 buts sur le chemin de son premier sacre mondial." },
  { q:"Quel gardien camerounais est devenu, en 2018, le plus vieux joueur de champ à débuter un match de CdM ?", choices:["Joseph-Antoine Bell","André Onana","Roger Milla","Samuel Eto'o"], answer:2, fact:"Roger Milla a inscrit un but à 42 ans lors du Mondial 1994, un record de doyen buteur." },
  { q:"Quelle sélection le Maroc a-t-il éliminée en quart de finale du Mondial 2022, créant la surprise ?", choices:["Espagne","Portugal","Belgique","Brésil"], answer:1, fact:"Le Maroc a battu le Portugal 1-0, devenant la 1ère équipe africaine en demi-finale." },
  { q:"Jusqu'où le Maroc est-il allé lors de la Coupe du Monde 2022 ?", choices:["Quart de finale","Demi-finale","Finale","Petite finale"], answer:1, fact:"Le Maroc a atteint les demi-finales, une première historique pour une équipe africaine ou arabe." },
  { q:"Quel pays a remporté le tout premier match de la Coupe du Monde 2022 contre l'Argentine ?", choices:["Mexique","Arabie Saoudite","Tunisie","Australie"], answer:1, fact:"L'Arabie Saoudite a créé l'exploit en battant l'Argentine 2-1 en match de poule." },
  { q:"Quel joueur a inscrit le but le plus rapide de l'histoire de la Coupe du Monde (10,8 secondes) ?", choices:["Hakan Sükür","Bryan Robson","Vaclav Masek","Ernst Lehner"], answer:0, fact:"Le Turc Hakan Sükür a marqué dès l'entame du match pour la 3e place en 2002." },
  { q:"Quel pays a accueilli la première Coupe du Monde disputée hors d'Europe ou d'Amérique, en 2002 ?", choices:["Japon et Corée du Sud","Chine","Australie","Qatar"], answer:0, fact:"Le Japon et la Corée du Sud ont co-organisé la première édition asiatique en 2002." },
  { q:"Combien de fois la Coupe du Monde s'est-elle jouée au Brésil (en tant que pays hôte) ?", choices:["1","2","3","0"], answer:1, fact:"Le Brésil a organisé le Mondial en 1950 et 2014." },
  { q:"Quel est le surnom donné à l'équipe nationale du Brésil ?", choices:["La Roja","La Seleção","Les Auriverdes","La Albiceleste"], answer:1, fact:"La Seleção (la Sélection) est le surnom traditionnel du Brésil ; on parle aussi des Auriverdes." },
  { q:"Quel est le surnom de l'équipe d'Argentine ?", choices:["La Roja","La Albiceleste","La Furia Roja","Les Auriverdes"], answer:1, fact:"L'Albiceleste fait référence aux couleurs blanc et bleu ciel du maillot argentin." },
  { q:"Quel pays surnomme son équipe nationale 'Les Lions de l'Atlas' ?", choices:["Tunisie","Algérie","Maroc","Sénégal"], answer:2, fact:"Le Maroc tire ce surnom du lion de l'Atlas, espèce emblématique du pays." },
  { q:"Quel pays surnomme son équipe 'Les Lions de la Teranga' ?", choices:["Sénégal","Cameroun","Côte d'Ivoire","Ghana"], answer:0, fact:"La Teranga désigne l'hospitalité sénégalaise en wolof, valeur chère au pays." },
  { q:"Quel pays surnomme son équipe nationale 'Les Diables Rouges' ?", choices:["Belgique","Espagne","Croatie","Suisse"], answer:0, fact:"La Belgique est surnommée ainsi en référence à la couleur de son maillot." },
  { q:"Quel pays surnomme son équipe nationale 'La Roja' ?", choices:["Portugal","Espagne","Chili","Costa Rica"], answer:1, fact:"L'Espagne est surnommée La Roja (la Rouge) en référence à son maillot historique." },
  { q:"Quel pays surnomme son équipe nationale 'Les Three Lions' ?", choices:["Angleterre","Pays de Galles","Écosse","Irlande"], answer:0, fact:"Les trois lions font référence aux armoiries royales anglaises." },
  { q:"Quel pays surnomme son équipe 'Les Bleus' ?", choices:["France","Italie","Pays-Bas","Argentine"], answer:0, fact:"La France tire ce surnom de la couleur dominante de son maillot domicile." },
  { q:"Quel pays surnomme son équipe 'La Mannschaft' ?", choices:["Autriche","Allemagne","Suisse","Pays-Bas"], answer:1, fact:"La Mannschaft signifie simplement 'l'équipe' en allemand." },
  { q:"Quel pays surnomme son équipe 'Les Pharaons' ?", choices:["Égypte","Maroc","Tunisie","Algérie"], answer:0, fact:"L'Égypte tire ce surnom de son riche passé pharaonique." },
  { q:"Quel pays surnomme son équipe 'Taegeuk Warriors' ?", choices:["Japon","Corée du Sud","Chine","Vietnam"], answer:1, fact:"Le surnom fait référence au symbole Taegeuk présent sur le drapeau coréen." },
  { q:"Quel pays surnomme son équipe 'Les Samouraïs Bleus' ?", choices:["Corée du Sud","Japon","Chine","Thaïlande"], answer:1, fact:"Le Japon associe la couleur bleue de son maillot à l'esprit samouraï." },
  { q:"Quel pays surnomme son équipe 'Oranje' ?", choices:["Pays-Bas","Belgique","Luxembourg","Allemagne"], answer:0, fact:"Oranje fait référence à la maison royale d'Orange-Nassau des Pays-Bas." },
  { q:"Quel ancien joueur est devenu le sélectionneur le plus titré en Coupe du Monde avec 2 victoires (1934, 1938) ?", choices:["Vittorio Pozzo","Helmut Schön","Mario Zagallo","Franz Beckenbauer"], answer:0, fact:"Vittorio Pozzo a mené l'Italie à 2 titres consécutifs, un record inégalé pour un sélectionneur." },
  { q:"Qui est le seul homme à avoir remporté la Coupe du Monde comme joueur et comme sélectionneur ?", choices:["Franz Beckenbauer et Mario Zagallo","Pelé seul","Zidane seul","Aimé Jacquet seul"], answer:0, fact:"Beckenbauer (All.) et Zagallo (Brésil) ont réalisé ce doublé unique dans l'histoire." },
  { q:"Quel sélectionneur français a mené les Bleus au titre en 1998 ?", choices:["Roger Lemerre","Aimé Jacquet","Didier Deschamps","Raymond Domenech"], answer:1, fact:"Aimé Jacquet a guidé la France vers son premier sacre mondial à domicile." },
  { q:"Quel sélectionneur a mené la France à ses deux titres de champion du monde (1998 et 2018) ?", choices:["Aimé Jacquet uniquement","Didier Deschamps uniquement","Aimé Jacquet et Didier Deschamps","Roger Lemerre"], answer:2, fact:"Deschamps, capitaine en 1998, est devenu sélectionneur champion en 2018, comme Jacquet l'avait été." },
  { q:"Quel est le score le plus large jamais enregistré en Coupe du Monde, lors d'un match de poule en 1982 ?", choices:["Hongrie 10-1 Salvador","Allemagne 8-0 Arabie Saoudite","Brésil 7-1 Suède","Espagne 6-1 Bulgarie"], answer:0, fact:"La Hongrie a écrasé le Salvador 10-1 lors du Mondial 1982 en Espagne." },
  { q:"Combien de buts a marqué l'Allemagne face à l'Arabie Saoudite lors du Mondial 2002 ?", choices:["6","7","8","9"], answer:2, fact:"L'Allemagne a battu l'Arabie Saoudite 8-0, son plus large succès en phase finale." },
  { q:"Quel pays a inscrit le tout premier but de l'histoire de la Coupe du Monde, en 1930 ?", choices:["France","Uruguay","Mexique","Belgique"], answer:0, fact:"Lucien Laurent (France) a inscrit le premier but de l'histoire des Mondiaux." },
  { q:"Combien de pénaltys ont été accordés lors de la finale de la Coupe du Monde 2022 (temps réglementaire et prolongation inclus) ?", choices:["1","2","3","4"], answer:1, fact:"Deux pénaltys ont été accordés lors de cette finale spectaculaire Argentine-France." },
  { q:"Quel buteur français a marqué un triplé en finale du Mondial 2022 sans pour autant remporter le titre ?", choices:["Antoine Griezmann","Olivier Giroud","Kylian Mbappé","Ousmane Dembélé"], answer:2, fact:"Mbappé a inscrit un triplé historique en finale mais l'Argentine l'a emporté aux tirs au but." },
  { q:"Quel pays a remporté la première Coupe du Monde Féminine en 1991 ?", choices:["États-Unis","Norvège","Chine","Allemagne"], answer:0, fact:"Les États-Unis ont remporté la 1ère édition féminine, disputée en Chine en 1991." },
  { q:"Quel pays organisera, avec les USA et le Canada, le Mondial masculin 2026 ?", choices:["Brésil","Mexique","Argentine","Chili"], answer:1, fact:"Le Mexique accueillera sa 3e Coupe du Monde, après 1970 et 1986." },
  { q:"Combien de villes hôtes accueillent des matchs du Mondial 2026 ?", choices:["12","14","16","18"], answer:2, fact:"16 villes hôtes réparties entre les États-Unis, le Canada et le Mexique." },
  { q:"Quel est le nom du ballon officiel utilisé lors du Mondial 2022 au Qatar ?", choices:["Al Rihla","Brazuca","Telstar 18","Jabulani"], answer:0, fact:"Al Rihla, qui signifie 'le voyage' en arabe, était le ballon officiel du Mondial 2022." },
  { q:"Quel était le ballon officiel de la Coupe du Monde 2010 en Afrique du Sud ?", choices:["Al Rihla","Brazuca","Jabulani","Telstar"], answer:2, fact:"Le Jabulani a été critiqué par de nombreux gardiens pour sa trajectoire imprévisible." },
  { q:"Quel est le nom du trophée actuel remis au pays vainqueur de la Coupe du Monde ?", choices:["Coupe Jules Rimet","Trophée FIFA Coupe du Monde","Coupe d'Or","Trophée des Champions"], answer:1, fact:"Le trophée actuel, en vigueur depuis 1974, remplace l'ancienne Coupe Jules Rimet." },
  { q:"Pourquoi la Coupe Jules Rimet a-t-elle été remplacée après 1970 ?", choices:["Elle a été volée","Elle a été conservée définitivement par le Brésil","Elle était trop petite","Elle a été détruite"], answer:1, fact:"Le Brésil a conservé définitivement la Coupe Jules Rimet après son 3e titre en 1970, comme le règlement le prévoyait." },
  { q:"Quel pays n'a jamais manqué une Coupe du Monde depuis 1938 (hormis 1950) ?", choices:["Italie","Brésil","Allemagne","Argentine"], answer:1, fact:"Le Brésil est la seule nation présente à toutes les éditions depuis la création du tournoi." },
  { q:"Quel joueur a inscrit le but le plus rapide en finale de Coupe du Monde, à la 5e minute en 2022 ?", choices:["Lionel Messi","Kylian Mbappé","Ángel Di María","Randal Kolo Muani"], answer:0, fact:"Messi a ouvert le score sur penalty dès la 23e minute, mais Di María a inscrit le 2e but rapidement après." },
  { q:"Quel est le plus grand nombre de spectateurs jamais réuni pour un match de Coupe du Monde ?", choices:["173 850 (finale 1950)","114 600 (finale 1994)","87 411 (finale 2022)","80 000 (finale 2018)"], answer:0, fact:"Près de 174 000 personnes ont assisté au Maracanazo en 1950, un record toujours d'actualité." },
  { q:"Quelle est la durée du tout premier match de l'histoire de la Coupe du Monde, en 1930 ?", choices:["90 minutes","2x45 minutes classiques","Match interrompu","120 minutes"], answer:1, fact:"Le format classique de 90 minutes était déjà en vigueur dès le premier match du tournoi." },
  { q:"Quel pays a remporté la médaille de bronze (3e place) du Mondial 2022 ?", choices:["Croatie","Maroc","Pays-Bas","Angleterre"], answer:0, fact:"La Croatie a battu le Maroc 2-1 lors du match pour la 3e place." },
  { q:"Quelle équipe a terminé 4e du Mondial 2022, après une demi-finale historique ?", choices:["Maroc","Croatie","Pays-Bas","Portugal"], answer:0, fact:"Le Maroc, demi-finaliste surprise, a terminé 4e après sa défaite contre la France." },
  { q:"Combien de cartons rouges ont été distribués lors de la Coupe du Monde 2022 ?", choices:["5","8","11","15"], answer:1, fact:"8 cartons rouges ont été distribués durant le tournoi au Qatar." },
  { q:"Quel pays a remporté la Coupe du Monde des moins de 20 ans le plus de fois ?", choices:["Brésil","Argentine","Portugal","Espagne"], answer:0, fact:"Le Brésil détient le record avec 5 titres en Coupe du Monde U20." },
  { q:"Quel stade du Mondial 2026 est le plus grand par capacité ?", choices:["MetLife Stadium","SoFi Stadium","AT&T Stadium","Estadio Azteca"], answer:2, fact:"L'AT&T Stadium à Dallas peut accueillir plus de 92 000 spectateurs en configuration football." },
  { q:"Quel est le seul stade à avoir déjà accueilli des matchs de 2 Coupes du Monde précédentes et qui accueille aussi 2026 ?", choices:["Estadio Azteca","Rose Bowl","Soldier Field","MetLife Stadium"], answer:0, fact:"L'Estadio Azteca (Mexico) a déjà accueilli les finales de 1970 et 1986, un record unique." },
  { q:"Quel pays africain a participé à sa première Coupe du Monde en 1990, atteignant les quarts de finale dès sa première participation ?", choices:["Cap-Vert","Ghana","Sénégal","Cameroun"], answer:3, fact:"Le Cameroun a atteint les quarts de finale dès 1990, une grande première pour l'Afrique." },
];


const QUI_SUIS_JE = [
  { indices:[
    "Je suis né au Brésil en 1940",
    "Je suis attaquant et j'ai joué pour le Santos FC toute ma carrière au Brésil",
    "J'ai remporté la Coupe du Monde à 17, 21 et 30 ans",
    "Je suis le seul joueur à avoir remporté 3 Coupes du Monde",
    "J'ai marqué plus de 1200 buts dans ma carrière selon la FIFA",
    "Mon vrai prénom est Edson Arantes do Nascimento",
    "Je suis considéré par beaucoup comme le plus grand footballeur de l'histoire",
    "Je suis décédé le 29 décembre 2022"
  ], answer:"Pelé", aliases:["pele","edson","o rei"], emoji:"🇧🇷" },
  { indices:[
    "Je suis né à Opole en Pologne mais j'ai joué pour l'Allemagne",
    "Je suis attaquant et j'ai évolué au Bayern Munich et à l'AS Rome notamment",
    "J'ai participé à 4 Coupes du Monde de 2002 à 2014",
    "Lors du Mondial 2014, j'ai battu le record de Ronaldo avec un but contre l'Algérie en 8ème de finale",
    "Ma demi-finale face au Brésil (7-1) en 2014 reste dans l'histoire",
    "Je détiens le record de buts all-time en Coupe du Monde avec 16 réalisations",
    "Mon surnom est le Klose des goals",
    "Mon prénom commence par un M et mon nom par un K"
  ], answer:"Miroslav Klose", aliases:["klose","miroslav","miro"], emoji:"🇩🇪" },
  { indices:[
    "Je suis né à Marseille en 1972 de parents algériens",
    "Je suis milieu de terrain et j'ai notamment joué pour la Juventus, le Real Madrid et Bordeaux",
    "J'ai remporté la Coupe du Monde 1998 avec la France à domicile",
    "J'ai marqué 2 buts de la tête en finale contre le Brésil (3-0)",
    "J'ai été élu meilleur joueur du Mondial 1998 et Ballon d'Or FIFA 1998",
    "En 2006, j'ai reçu un carton rouge en finale pour un coup de tête sur Materazzi",
    "Mon surnom est Zizou",
    "Je m'appelle Zinedine"
  ], answer:"Zinedine Zidane", aliases:["zidane","zizou","zinedine"], emoji:"🇫🇷" },
  { indices:[
    "Je suis né à Bento Ribeiro au Brésil en 1976",
    "Je suis attaquant surnommé R9 ou O Fenômeno",
    "J'ai remporté la Coupe du Monde en 1994 (sans jouer) et en 2002",
    "En 1998, j'ai marqué 4 buts et remporté le Golden Boot malgré la défaite en finale",
    "En 2002, j'ai inscrit 8 buts dont 2 en finale contre l'Allemagne",
    "Je totalise 15 buts en Coupe du Monde, 2ème all-time derrière Klose",
    "J'ai joué pour le FC Barcelone, l'Inter Milan et le Real Madrid",
    "Mon prénom est Ronaldo Luis Nazário de Lima"
  ], answer:"Ronaldo (Brésil)", aliases:["ronaldo","r9","nazario","fenomeno"], emoji:"🇧🇷" },
  { indices:[
    "Je suis né à Bondy en France en 1998",
    "Je suis attaquant, très rapide, jouant pour le Real Madrid depuis 2024",
    "J'ai remporté la Coupe du Monde 2018 avec la France à seulement 19 ans",
    "En finale 2022, j'ai marqué un hat-trick contre l'Argentine mais la France a perdu aux TAB",
    "J'ai remporté le Golden Boot du Mondial 2022 avec 8 buts",
    "Je suis le seul joueur avec un hat-trick en finale de Coupe du Monde depuis Geoff Hurst en 1966",
    "Mon prénom commence par K et mon nom par M",
    "Je suis né le 20 décembre 1998"
  ], answer:"Kylian Mbappé", aliases:["mbappe","kylian","kyky"], emoji:"🇫🇷" },
  { indices:[
    "Je suis né à Lanus en Argentine en 1960",
    "Je suis attaquant/milieu de génie, surnommé El Pibe de Oro (le gamin en or)",
    "J'ai remporté la Coupe du Monde 1986 au Mexique avec l'Argentine",
    "En quart de finale contre l'Angleterre, j'ai marqué 2 buts légendaires dans le même match",
    "Le premier s'appelait la Main de Dieu — marqué de la main",
    "Le second s'appelle le But du Siècle — après avoir dribblé la moitié de l'équipe anglaise",
    "Je suis décédé le 25 novembre 2020 à Buenos Aires",
    "Mon prénom est Diego"
  ], answer:"Diego Maradona", aliases:["maradona","diego","pibe de oro"], emoji:"🇦🇷" },
  { indices:[
    "Je suis né à Rosario en Argentine en 1987",
    "Je suis attaquant pour le FC Barcelone puis l'Inter Miami depuis 2023",
    "J'ai remporté la Coupe du Monde 2022 au Qatar avec l'Argentine",
    "J'ai remporté 8 Ballons d'Or — record absolu — entre 2009 et 2023",
    "J'ai joué 26 matchs en Coupe du Monde — record absolu toutes sélections confondues",
    "En 2021, j'ai enfin remporté la Copa América avec l'Argentine",
    "Mon prénom commence par L et mon nom par M",
    "Je suis souvent comparé à Maradona comme le plus grand argentin de l'histoire"
  ], answer:"Lionel Messi", aliases:["messi","lionel","leo","la pulga"], emoji:"🇦🇷" },
  { indices:[
    "Je suis né à Funchal (Madère) au Portugal en 1985",
    "Je suis attaquant surnommé CR7",
    "J'ai joué pour Manchester United, Real Madrid, Juventus et Al-Nassr",
    "J'ai remporté 5 Ballons d'Or entre 2008 et 2017",
    "Je détiens le record de buts en sélection nationale avec plus de 130 buts",
    "J'ai marqué lors de 5 Coupes du Monde différentes — record absolu",
    "Mon équipe nationale n'a jamais remporté la Coupe du Monde",
    "Mon prénom est Cristiano et mon nom de famille Ronaldo"
  ], answer:"Cristiano Ronaldo", aliases:["ronaldo","cr7","cristiano"], emoji:"🇵🇹" },
  { indices:[
    "Je suis né en Irlande du Nord en 1965",
    "Je suis le plus jeune joueur à avoir participé à une Coupe du Monde",
    "J'avais 17 ans et 41 jours lors de ma première Coupe du Monde en 1982",
    "J'ai aussi été le plus jeune buteur de l'histoire d'un Championnat d'Europe",
    "Je jouais avant-centre et j'ai évolué notamment à Manchester United",
    "Mon équipe n'a jamais dépassé les 8ès de finale d'une Coupe du Monde",
    "Mon prénom commence par N et mon nom par W"
  ], answer:"Norman Whiteside", aliases:["whiteside","norman"], emoji:"🇬🇧" },
  { indices:[
    "Je suis né en France en 1933 de parents marocains",
    "Je suis attaquant et j'ai joué pour le Stade de Reims en France",
    "J'ai participé à une seule Coupe du Monde, en 1958 en Suède",
    "J'ai marqué 13 buts en 6 matchs lors de ce seul tournoi",
    "Ce record pour un seul tournoi n'a jamais été battu depuis 65 ans",
    "Miroslav Klose m'a demandé la permission de battre mon record all-time en 2014",
    "Je suis décédé en mars 2023 à l'âge de 89 ans",
    "Mon prénom est Just et mon nom commence par F"
  ], answer:"Just Fontaine", aliases:["fontaine","just"], emoji:"🇫🇷" },
  { indices:[
    "Je suis né en Allemagne en 1945",
    "Je suis attaquant, surnommé Der Bomber der Nation",
    "J'ai remporté la Coupe du Monde 1974 avec l'Allemagne de l'Ouest à domicile",
    "J'ai marqué 14 buts en Coupe du Monde en seulement 13 matchs (2 tournois)",
    "Lors du Mondial 1970, j'ai marqué 10 buts et remporté le Golden Boot",
    "Je suis 3ème all-time derrière Klose et Ronaldo en nombre de buts en CdM",
    "J'ai aussi joué pour le Bayern Munich toute ma carrière de club",
    "Mon prénom est Gerd"
  ], answer:"Gerd Müller", aliases:["muller","müller","gerd","bomber"], emoji:"🇩🇪" },
  { indices:[
    "Je suis né en Égypte en 1973",
    "Je suis gardien de but",
    "J'ai participé à la Coupe du Monde 2018 en Russie",
    "J'étais le plus vieux joueur à participer à une Coupe du Monde : 45 ans et 161 jours",
    "J'ai aussi joué en Coupe d'Afrique des Nations pour l'Égypte",
    "Mon prénom commence par E et mon nom commence par E également",
    "J'ai battu le record de Faryd Mondragón comme plus vieux participant à un Mondial"
  ], answer:"Essam El-Hadary", aliases:["el-hadary","el hadary","essam","elhadary"], emoji:"🇪🇬" },
  { indices:[
    "Je suis né au Portugal (Mozambique alors colonie portugaise) en 1942",
    "Je suis attaquant et j'ai joué toute ma carrière de club au Benfica",
    "J'ai été le meilleur buteur du Mondial 1966 avec 9 réalisations",
    "J'ai aidé le Portugal à terminer 3e de cette Coupe du Monde, sa meilleure performance historique",
    "J'ai remporté le Ballon d'Or en 1965",
    "Mon surnom était la Panthère Noire",
    "Je suis décédé en 2014"
  ], answer:"Eusébio", aliases:["eusebio","eusébio","panthere noire"], emoji:"🇵🇹" },
  { indices:[
    "Je suis né au Brésil en 1933",
    "J'étais ailier droit, réputé pour mes dribbles et mes jambes arquées",
    "J'ai été champion du monde en 1958 et 1962 avec le Brésil",
    "Lors du Mondial 1962, j'ai été élu meilleur joueur du tournoi",
    "Mon surnom signifie \"petit oiseau\" en portugais",
    "On me surnommait aussi \"l'Ange aux jambes tordues\"",
    "Mon nom commence par un G"
  ], answer:"Garrincha", aliases:["garrincha"], emoji:"🇧🇷" },
  { indices:[
    "Je suis né en Allemagne de l'Ouest en 1945",
    "J'étais défenseur, inventeur du poste de libéro moderne",
    "J'ai été capitaine champion du monde en 1974, puis sélectionneur champion en 1990",
    "Je suis l'un des 3 seuls hommes à avoir remporté la Coupe du Monde comme joueur ET comme entraîneur",
    "J'ai remporté le Ballon d'Or en 1972 et 1976",
    "Mon surnom était \"Der Kaiser\" (l'Empereur)",
    "Mon prénom est Franz"
  ], answer:"Franz Beckenbauer", aliases:["beckenbauer","franz","der kaiser","kaiser"], emoji:"🇩🇪" },
  { indices:[
    "Je suis né en Italie en 1967",
    "J'étais défenseur central et j'ai joué toute ma carrière à l'AC Milan",
    "J'ai disputé 4 Coupes du Monde avec l'Italie, entre 1990 et 2002",
    "Je n'ai pourtant jamais soulevé le trophée mondial avec l'Italie",
    "Mon père Cesare et mon fils Daniel ont aussi été footballeurs professionnels",
    "Je suis considéré comme l'un des meilleurs défenseurs de l'histoire du football",
    "Mon nom commence par un M"
  ], answer:"Paolo Maldini", aliases:["maldini","paolo"], emoji:"🇮🇹" },
  { indices:[
    "Je suis né en Italie en 1967",
    "Je suis attaquant, célèbre pour ma queue de cheval",
    "J'ai marqué un but exceptionnel en slalomant 5 défenseurs face à la Tchécoslovaquie en 1990",
    "J'ai raté le penalty décisif de la finale 1994 contre le Brésil",
    "J'ai remporté le Ballon d'Or en 1993",
    "Mon surnom était \"Il Divin Codino\" (la divine queue de cheval)",
    "Mon prénom est Roberto"
  ], answer:"Roberto Baggio", aliases:["baggio","roberto baggio","divin codino"], emoji:"🇮🇹" },
  { indices:[
    "Je suis né en URSS (aujourd'hui Russie) en 1929",
    "Je suis gardien de but, surnommé l'Araignée Noire",
    "J'ai participé à 4 Coupes du Monde entre 1958 et 1970 avec l'URSS",
    "Je suis le seul gardien de l'histoire à avoir remporté le Ballon d'Or, en 1963",
    "Je suis réputé pour avoir révolutionné le jeu au pied du gardien",
    "Mon nom de famille rime avec un cours d'eau",
    "Je suis décédé en 1990"
  ], answer:"Lev Yashin", aliases:["yashin","lev","araignee noire"], emoji:"🇷🇺" },
  { indices:[
    "Je suis né au Brésil en 1970",
    "Je suis défenseur (arrière droit) et j'ai joué pour l'AS Roma et l'AC Milan",
    "J'ai remporté la Coupe du Monde en 1994 et 2002 avec le Brésil",
    "J'ai disputé un record de matchs en Coupe du Monde pour un joueur brésilien",
    "Mon surnom est \"le Pendule\" pour mes incessants allers-retours sur mon couloir",
    "J'ai été capitaine du Brésil lors du sacre de 2002",
    "Mon prénom est un diminutif de Marcos"
  ], answer:"Cafu", aliases:["cafu"], emoji:"🇧🇷" },
  { indices:[
    "Je suis né au Brésil en 1953",
    "Je suis milieu offensif, surnommé le Pelé blanc",
    "Je n'ai jamais remporté la Coupe du Monde malgré 3 participations (1978, 1982, 1986)",
    "Je suis réputé pour mes coups francs exceptionnels",
    "J'ai joué la majeure partie de ma carrière au Flamengo",
    "Je suis devenu plus tard ministre des Sports au Brésil",
    "Mon nom est aussi celui d'un quartier de Rio"
  ], answer:"Zico", aliases:["zico","pele blanc"], emoji:"🇧🇷" },
  { indices:[
    "Je suis né en Allemagne en 1961",
    "Je suis milieu de terrain, capitaine emblématique de l'Allemagne",
    "J'ai disputé un record de 5 Coupes du Monde, de 1982 à 1998",
    "J'ai remporté le titre mondial en 1990 avec l'Allemagne de l'Ouest",
    "J'ai été élu Ballon d'Or en 1990",
    "J'ai aussi joué à l'Inter Milan et au Bayern Munich",
    "Mon nom commence par un M, mon prénom par un L"
  ], answer:"Lothar Matthäus", aliases:["matthaus","matthäus","lothar"], emoji:"🇩🇪" },
  { indices:[
    "Je suis né aux Pays-Bas en 1947",
    "Je suis attaquant, inventeur du concept de \"Football Total\"",
    "J'ai disputé la finale de la Coupe du Monde 1974 sans jamais être sacré champion",
    "Mon coup de pied retourné inversé porte mon nom",
    "J'ai remporté le Ballon d'Or à 3 reprises (1971, 1973, 1974)",
    "J'ai porté le maillot numéro 14, fait rare pour un capitaine",
    "Mon nom est aussi celui d'un stade emblématique à Amsterdam"
  ], answer:"Johan Cruyff", aliases:["cruyff","johan"], emoji:"🇳🇱" },
];


const PLUS_MOINS_QUESTIONS = [
  { q:"Combien de buts Miroslav Klose a-t-il marqués en Coupe du Monde ?", answer:16, unit:"buts", hint:"Le record all-time, battu en 2014" },
  { q:"En combien de matchs Lionel Messi a-t-il joué en Coupe du Monde ?", answer:26, unit:"matchs", hint:"Plus que tout autre joueur dans l'histoire" },
  { q:"Combien de buts Just Fontaine a-t-il marqués lors du Mondial 1958 ?", answer:13, unit:"buts", hint:"Record pour un seul tournoi, jamais battu" },
  { q:"À quel âge Pelé a-t-il remporté sa première Coupe du Monde en 1958 ?", answer:17, unit:"ans", hint:"Le plus jeune vainqueur de l'histoire du Mondial" },
  { q:"Combien de fois le Brésil a-t-il remporté la Coupe du Monde ?", answer:5, unit:"titres", hint:"Le pays le plus titré au monde" },
  { q:"Combien de buts Ronaldo (Brésil) a-t-il marqués en Coupe du Monde ?", answer:15, unit:"buts", hint:"Dont 8 lors d'un seul tournoi" },
  { q:"Combien de minutes Walter Zenga est-il resté sans encaisser de but au Mondial 1990 ?", answer:517, unit:"min", hint:"Plus d'une demi-journée de jeu sans encaisser" },
  { q:"Combien de buts ont été marqués au total lors du Mondial Qatar 2022 ?", answer:172, unit:"buts", hint:"Environ 2,7 buts par match" },
  { q:"Combien de buts Kylian Mbappé a-t-il marqués en finales de Coupe du Monde ?", answer:4, unit:"buts", hint:"Dont un hat-trick lors d'une seule finale" },
  { q:"Combien de buts Gerd Müller a-t-il marqués en Coupe du Monde ?", answer:14, unit:"buts", hint:"En seulement 2 tournois et 13 matchs" },
  { q:"Combien d'équipes participent au Mondial 2026 ?", answer:48, unit:"équipes", hint:"Record historique, bien plus que les tournois précédents" },
  { q:"En quelle année le Brésil a-t-il perdu 7-1 contre l'Allemagne en demi-finale ?", answer:2014, unit:"", hint:"Au Brésil, lors de la coupe organisée à domicile" },
  { q:"Combien de Ballons d'Or Lionel Messi a-t-il remportés ?", answer:8, unit:"B.O.", hint:"Plus que n'importe quel autre joueur dans l'histoire" },
  { q:"Combien de buts Cristiano Ronaldo a-t-il marqués en sélection nationale ?", answer:130, unit:"buts", hint:"Record mondial de buts en équipe nationale, dépassé 130" },
  { q:"Quel score la France a-t-elle battu la Croatie en finale du Mondial 2018 ?", answer:4, unit:"buts fr.", hint:"La France a marqué plus de 3 buts" },
  { q:"En quelle année la France a-t-elle remporté sa 1ère Coupe du Monde ?", answer:1998, unit:"", hint:"À domicile, contre le Brésil" },
  { q:"Combien de stades accueillent les matchs du Mondial 2026 ?", answer:16, unit:"stades", hint:"Répartis entre 3 pays hôtes" },
  { q:"Quel score final (après prolongations) lors de la finale 2022 Argentine-France ?", answer:3, unit:"buts/équipe", hint:"Match nul après 90 puis 120 minutes" },
  { q:"Combien de matchs Cristiano Ronaldo a-t-il joués en Coupe du Monde ?", answer:22, unit:"matchs", hint:"Sur 5 participations" },
  { q:"Combien de pays co-organisent le Mondial 2026 ?", answer:3, unit:"pays", hint:"Amérique du Nord, pour la première fois à 3 pays" },
  { q:"Combien de sélections différentes ont déjà remporté la Coupe du Monde ?", answer:8, unit:"pays", hint:"Brésil, Allemagne, Italie, Argentine, France, Uruguay, Espagne, Angleterre" },
  { q:"En quelle année s'est jouée la toute première Coupe du Monde ?", answer:1930, unit:"", hint:"Organisée et remportée par l'Uruguay" },
  { q:"Combien de buts Pelé a-t-il marqués en Coupe du Monde, toutes éditions confondues ?", answer:12, unit:"buts", hint:"Sur 4 participations entre 1958 et 1970" },
  { q:"Combien de titres mondiaux l'Allemagne compte-t-elle ?", answer:4, unit:"titres", hint:"1954, 1974, 1990 et 2014" },
  { q:"Combien de titres mondiaux l'Italie compte-t-elle ?", answer:4, unit:"titres", hint:"1934, 1938, 1982 et 2006" },
  { q:"Combien de titres mondiaux l'Argentine compte-t-elle ?", answer:3, unit:"titres", hint:"1978, 1986 et 2022" },
  { q:"En quelle année l'Uruguay a-t-il battu le Brésil en finale à domicile (le Maracanazo) ?", answer:1950, unit:"", hint:"Devant 200 000 spectateurs au Maracanã" },
  { q:"Combien de Coupes du Monde Lothar Matthäus a-t-il disputées, un record partagé ?", answer:5, unit:"CdM", hint:"Avec l'Allemagne, entre 1982 et 1998" },
  { q:"Combien de buts l'Allemagne a-t-elle inscrits face au Brésil en demi-finale 2014 ?", answer:7, unit:"buts", hint:"Le Brésil, pays hôte, n'a inscrit qu'un seul but" },
  { q:"Combien de titres mondiaux l'Uruguay compte-t-il au total ?", answer:2, unit:"titres", hint:"1930 et 1950" },
  { q:"Combien de titres mondiaux le Brésil compte-t-il au total ?", answer:5, unit:"titres", hint:"1958, 1962, 1970, 1994 et 2002" },
  { q:"En quelle année le Brésil a-t-il remporté son tout premier titre mondial ?", answer:1958, unit:"", hint:"En Suède, avec un certain Pelé, 17 ans" },
  { q:"Combien de fois le Mexique a-t-il organisé la Coupe du Monde avant 2026 ?", answer:2, unit:"fois", hint:"1970 et 1986" },
  { q:"Combien de buts Eusébio a-t-il marqués lors du seul Mondial qu'il a disputé (1966) ?", answer:9, unit:"buts", hint:"Meilleur buteur du tournoi, malgré l'élimination en demi-finale" },
  { q:"En quelle année a eu lieu la première finale de Coupe du Monde décidée aux tirs au but ?", answer:1994, unit:"", hint:"Brésil - Italie, 0-0 après prolongations" },
  { q:"Combien de titres mondiaux l'Espagne compte-t-elle ?", answer:1, unit:"titre", hint:"En 2010, en Afrique du Sud" },
  { q:"Combien de Coupes du Monde consécutives le Brésil a-t-il remportées en 1958 et 1962 ?", answer:2, unit:"titres", hint:"Seul le Brésil et l'Italie (1934-1938) ont réalisé ce doublé" },
  { q:"En quelle année l'Allemagne de l'Ouest a-t-elle remporté son 2e titre, à domicile ?", answer:1974, unit:"", hint:"Face aux Pays-Bas de Cruyff, 2-1 en finale" },
  { q:"Combien de titres mondiaux l'Angleterre compte-t-elle ?", answer:1, unit:"titre", hint:"En 1966, à domicile" },
  { q:"En quelle année Zinédine Zidane a-t-il été expulsé en finale de Coupe du Monde ?", answer:2006, unit:"", hint:"Pour un coup de tête sur Marco Materazzi" },
  { q:"Combien de titres mondiaux la France compte-t-elle ?", answer:2, unit:"titres", hint:"1998 et 2018" },
  { q:"Combien de buts Just Fontaine a-t-il marqués lors du seul Mondial qu'il a disputé (1958) ?", answer:13, unit:"buts", hint:"Un record toujours inégalé, en seulement 6 matchs" },
  { q:"En quelle année le Brésil a-t-il remporté son 3e titre mondial, au Mexique ?", answer:1970, unit:"", hint:"Avec Pelé, Jairzinho et Tostão" },
  { q:"Combien de titres mondiaux l'Argentine compte-t-elle au total ?", answer:3, unit:"titres", hint:"1978, 1986 et 2022" },
  { q:"Combien de buts l'Allemagne a-t-elle inscrits en finale 2014 contre l'Argentine ?", answer:1, unit:"but", hint:"But de Mario Götze en prolongation" },
  { q:"Combien de buts le Portugal a-t-il marqués lors de sa victoire 7-0 contre la Corée du Nord en 2010 ?", answer:7, unit:"buts", hint:"L'une des plus larges victoires de l'histoire récente des Mondiaux" },
  { q:"Combien de buts a marqué la Hongrie contre le Salvador en 1982, plus large score de l'histoire des CdM ?", answer:10, unit:"buts", hint:"Score final 10-1, un record qui tient toujours" },
  { q:"Combien de buts l'Allemagne a-t-elle marqués contre l'Arabie Saoudite en 2002 ?", answer:8, unit:"buts", hint:"Plus large victoire de l'Allemagne en Coupe du Monde" },
  { q:"En combien de secondes Hakan Sükür a-t-il marqué le but le plus rapide de l'histoire des Mondiaux ?", answer:11, unit:"sec", hint:"Lors du match pour la 3e place en 2002, environ 10,8 secondes arrondies" },
  { q:"Combien de spectateurs ont assisté à la finale de la Coupe du Monde 1950 au Maracanã ?", answer:173850, unit:"spect.", hint:"Un record d'affluence toujours d'actualité pour un match de football" },
  { q:"Combien de matchs Cristiano Ronaldo a-t-il marqués dans des Coupes du Monde différentes ?", answer:5, unit:"éditions", hint:"De 2006 à 2022, record absolu de buts inscrits sur 5 éditions" },
  { q:"Combien de villes hôtes accueilleront des matchs du Mondial 2026 ?", answer:16, unit:"villes", hint:"Réparties entre USA, Canada et Mexique" },
  { q:"Combien de matchs au total seront joués lors du Mondial 2026 ?", answer:104, unit:"matchs", hint:"Bien plus que les 64 matchs habituels à 32 équipes" },
  { q:"Combien de groupes y a-t-il lors de la phase de poules du Mondial 2026 ?", answer:12, unit:"groupes", hint:"De A à L, avec 4 équipes par groupe" },
  { q:"Combien d'équipes se qualifient pour les phases finales à élimination directe en 2026 ?", answer:32, unit:"équipes", hint:"1ers, 2e de chaque groupe, plus les meilleurs 3e" },
  { q:"Combien de stades sont utilisés pour le Mondial 2026 ?", answer:16, unit:"stades", hint:"Répartis sur les 3 pays organisateurs" },
  { q:"Combien de buts le Maroc a-t-il encaissés lors de sa campagne jusqu'en demi-finale du Mondial 2022 ?", answer:1, unit:"but csp.", hint:"Seulement un but encaissé (contre son camp) en phase à élimination directe" },
  { q:"Combien de tirs au but ont été nécessaires pour départager Argentine et France en finale 2022 ?", answer:4, unit:"tab Arg.", hint:"L'Argentine a marqué 4 tirs au but contre 2 pour la France" },
  { q:"Combien de Coupes du Monde Pelé a-t-il disputées au total ?", answer:4, unit:"CdM", hint:"De 1958 à 1970, mais blessé lors de certaines" },
  { q:"Combien de fois la Coupe du Monde a-t-elle été disputée en Amérique du Sud ?", answer:5, unit:"fois", hint:"Uruguay, Brésil (x2), Chili, Argentine" },
  { q:"Combien de fois la Coupe du Monde a-t-elle été disputée en Europe ?", answer:11, unit:"fois", hint:"Le continent qui a accueilli le plus grand nombre d'éditions" },
  { q:"Combien de fois la Coupe du Monde a-t-elle été disputée en Amérique du Nord avant 2026 ?", answer:3, unit:"fois", hint:"Mexique (x2) et États-Unis (x1)" },
  { q:"Combien de buts Erling Haaland a-t-il inscrits lors de sa carrière en sélection norvégienne (chiffres récents) ?", answer:31, unit:"buts", hint:"Un ratio impressionnant malgré le faible nombre de sélections" },
  { q:"Combien de Ballons d'Or Cristiano Ronaldo a-t-il remportés dans sa carrière ?", answer:5, unit:"B.O.", hint:"Juste derrière Messi au classement historique" },
  { q:"Combien de titres de Ligue des Champions Cristiano Ronaldo a-t-il remportés ?", answer:5, unit:"titres", hint:"Avec Manchester United et le Real Madrid" },
  { q:"Combien de titres de Ligue des Champions Lionel Messi a-t-il remportés ?", answer:4, unit:"titres", hint:"Tous avec le FC Barcelone" },
  { q:"Combien de buts Harry Kane a-t-il inscrits avec l'équipe d'Angleterre (chiffres récents, record national) ?", answer:68, unit:"buts", hint:"Il a dépassé le record de Wayne Rooney" },
  { q:"Combien de Coupes du Monde l'Espagne a-t-elle remportées ?", answer:1, unit:"titre", hint:"En 2010, en Afrique du Sud" },
  { q:"Combien de Coupes du Monde le Portugal a-t-il remportées ?", answer:1, unit:"titre", hint:"En 1966, Eusébio les a menés jusqu'à la 3e place — mais jamais au titre. En comptant l'Euro 2016." },
  { q:"Combien de matchs sans défaite l'Espagne a-t-elle enchaîné avant son titre en 2010 (en phase finale) ?", answer:6, unit:"matchs", hint:"Une victoire après une seule défaite initiale contre la Suisse" },
  { q:"Combien de buts ont été inscrits lors de la finale 2014 Allemagne-Argentine ?", answer:1, unit:"but", hint:"Un match très fermé, décidé en prolongation" },
  { q:"Combien de minutes a duré la finale 2022 Argentine-France au total (avec prolongations) ?", answer:120, unit:"min", hint:"Avant la séance de tirs au but" },
  { q:"Combien de Coupes du Monde les Pays-Bas ont-ils disputées en finale sans jamais gagner ?", answer:3, unit:"finales", hint:"1974, 1978 et 2010 — la meilleure équipe à n'avoir jamais été sacrée" },
  { q:"Combien de fois la Croatie a-t-elle atteint une finale de Coupe du Monde ?", answer:1, unit:"finale", hint:"En 2018, perdue contre la France" },
  { q:"Quelle est la meilleure performance de la Croatie en Coupe du Monde (place au classement final) ?", answer:2, unit:"place", hint:"Vice-championne du monde en 2018" },
  { q:"Combien de fois la Belgique a-t-elle atteint le dernier carré (demi-finale) en Coupe du Monde ?", answer:2, unit:"fois", hint:"1986 et 2018" },
  { q:"Combien de sélections différentes ont déjà atteint une finale de Coupe du Monde ?", answer:13, unit:"pays", hint:"Un chiffre restreint sur près d'un siècle de compétition" },
  { q:"Combien de fois l'Angleterre a-t-elle atteint une demi-finale de Coupe du Monde (1966 inclus) ?", answer:3, unit:"fois", hint:"1966, 1990 et 2018" },
  { q:"Combien de penaltys manqués l'Angleterre a-t-elle connus en séances de tirs au but lors des CdM avant 2018 ?", answer:6, unit:"tab ratés", hint:"Une longue malédiction des tirs au but historique pour les Three Lions" },
  { q:"Combien de buts le Japon a-t-il inscrits pour éliminer l'Allemagne en phase de poules du Mondial 2022 ?", answer:2, unit:"buts", hint:"Le Japon a renversé l'Allemagne 2-1 après avoir été mené" },
  { q:"Combien de fois le Japon s'est-il qualifié pour les 8es de finale d'une Coupe du Monde ?", answer:4, unit:"fois", hint:"2002, 2010, 2018 et 2022" },
  { q:"Combien de buts la Corée du Sud a-t-elle inscrits pour terminer 4e du Mondial 2002 à domicile ?", answer:8, unit:"buts", hint:"Sa meilleure performance historique en Coupe du Monde" },
  { q:"Combien de fois Messi et Ronaldo se sont-ils officiellement affrontés sous leurs drapeaux respectifs en Coupe du Monde ?", answer:1, unit:"fois", hint:"Portugal vs Argentine en 2010, seule confrontation officielle en Mondial entre les deux légendes" },
  { q:"Combien de buts Harry Kane a-t-il marqués lors du Mondial 2018, terminant meilleur buteur ?", answer:6, unit:"buts", hint:"Sa meilleure performance individuelle en Coupe du Monde" },
  { q:"Combien de Ballons d'Or le Brésil a-t-il remportés au total dans son histoire ?", answer:5, unit:"B.O.", hint:"Avec notamment Ronaldo, Ronaldinho, Rivaldo, Kaká et Romário" },
  { q:"Combien de buts Hristo Stoichkov a-t-il marqués pour mener la Bulgarie en demi-finale du Mondial 1994 ?", answer:6, unit:"buts", hint:"Stoichkov a terminé co-meilleur buteur du tournoi, Ballon d'Or la même année" },
  { q:"Combien de fois le Maroc a-t-il participé à la Coupe du Monde avant 2026 ?", answer:6, unit:"participations", hint:"Dont sa demi-finale historique en 2022" },
  { q:"Combien de fois le Sénégal a-t-il atteint les quarts de finale d'une Coupe du Monde ?", answer:1, unit:"fois", hint:"En 2002, lors de sa toute première participation" },
  { q:"Combien de buts le Cameroun a-t-il inscrits pour atteindre les quarts en 1990, première équipe africaine à le faire ?", answer:6, unit:"buts", hint:"Avec notamment Roger Milla en grande forme" },
  { q:"Quel âge avait Roger Milla lorsqu'il a marqué en Coupe du Monde 1994, devenant le plus vieux buteur de l'histoire ?", answer:42, unit:"ans", hint:"Un record d'ancienneté toujours en vigueur" },
  { q:"Combien de pays comptent désormais l'Afrique au Mondial 2026, un record ?", answer:9, unit:"pays", hint:"Contre 5 lors des éditions précédentes à 32 équipes" },
  { q:"Combien de pays d'Asie participent au Mondial 2026 ?", answer:8, unit:"pays", hint:"Un nombre en forte hausse grâce au format à 48 équipes" },
  { q:"Combien d'équipes nord et centraméricaines (CONCACAF) participent au Mondial 2026 ?", answer:6, unit:"pays", hint:"Dont les 3 pays hôtes qualifiés automatiquement" },
];

const TOP_TRUMPS_CARDS = [
  { name:"Kylian Mbappé",     emoji:"🇫🇷", titres:1, euroTitres:0, butscdm:12, matchscdm:38, ballondor:0, note:"Champion du monde 2018, meilleur buteur du Mondial 2022" },
  { name:"Lionel Messi",      emoji:"🇦🇷", titres:1, euroTitres:0, butscdm:13, matchscdm:26, ballondor:8, note:"Champion du monde 2022, 8 Ballons d'Or — record absolu" },
  { name:"Cristiano Ronaldo", emoji:"🇵🇹", titres:0, euroTitres:0, butscdm:14, matchscdm:22, ballondor:5, note:"Recordman absolu de buts en sélection nationale" },
  { name:"Erling Haaland",    emoji:"🇳🇴", titres:0, euroTitres:0, butscdm:0,  matchscdm:32, ballondor:0, note:"Machine à buts en club, jamais qualifié en CdM" },
  { name:"Harry Kane",        emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:6,  matchscdm:22, ballondor:0, note:"Meilleur buteur du Mondial 2018 avec l'Angleterre" },
  { name:"Vinicius Jr.",      emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:3,  matchscdm:13, ballondor:0, note:"Star montante du Real Madrid et du Brésil" },
  { name:"Julián Álvarez",    emoji:"🇦🇷", titres:1, euroTitres:0, butscdm:4,  matchscdm:14, ballondor:0, note:"Champion du monde 2022 et Copa América avec l'Argentine" },
  { name:"Bukayo Saka",       emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:5,  matchscdm:18, ballondor:0, note:"Titulaire indiscutable d'Arsenal et de l'Angleterre" },
  { name:"Jude Bellingham",   emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:4,  matchscdm:20, ballondor:0, note:"Milieu phénomène du Real Madrid, révélation Mondial 2022" },
  { name:"Lamine Yamal",      emoji:"🇪🇸", titres:0, euroTitres:1, butscdm:5,  matchscdm:15, ballondor:0, note:"Champion d'Europe 2024, plus jeune star espagnole" },
  { name:"Pedri",             emoji:"🇪🇸", titres:0, euroTitres:1, butscdm:2,  matchscdm:25, ballondor:0, note:"Milieu de classe mondiale du FC Barcelone" },
  { name:"Cody Gakpo",        emoji:"🇳🇱", titres:0, euroTitres:0, butscdm:16, matchscdm:35, ballondor:0, note:"Meilleur buteur des Pays-Bas au Mondial 2022" },
  { name:"Sadio Mané",        emoji:"🇸🇳", titres:0, euroTitres:0, butscdm:41, matchscdm:100,ballondor:0, note:"Champion d'Afrique 2022 avec le Sénégal" },
  { name:"Son Heung-min",     emoji:"🇰🇷", titres:0, euroTitres:0, butscdm:35, matchscdm:120,ballondor:0, note:"Capitaine et légende du football sud-coréen" },
  { name:"Christian Pulisic", emoji:"🇺🇸", titres:0, euroTitres:0, butscdm:29, matchscdm:70, ballondor:0, note:"Visage du football américain, pays co-hôte 2026" },
  { name:"Romelu Lukaku",     emoji:"🇧🇪", titres:0, euroTitres:0, butscdm:85, matchscdm:117,ballondor:0, note:"Meilleur buteur de l'histoire de la Belgique" },
  { name:"Kevin De Bruyne",   emoji:"🇧🇪", titres:0, euroTitres:0, butscdm:33, matchscdm:106,ballondor:0, note:"Meilleur passeur du football belge moderne" },
  { name:"Federico Valverde", emoji:"🇺🇾", titres:0, euroTitres:0, butscdm:6,  matchscdm:45, ballondor:0, note:"Milieu box-to-box du Real Madrid, pilier uruguayen" },
  { name:"Rodri",             emoji:"🇪🇸", titres:0, euroTitres:2, butscdm:9,  matchscdm:50, ballondor:1, note:"Ballon d'Or 2024, double champion d'Europe avec l'Espagne" },
  { name:"Achraf Hakimi",     emoji:"🇲🇦", titres:0, euroTitres:0, butscdm:11, matchscdm:75, ballondor:0, note:"Demi-finaliste Mondial 2022 avec le Maroc" },
  { name:"Hakim Ziyech",      emoji:"🇲🇦", titres:0, euroTitres:0, butscdm:18, matchscdm:60, ballondor:0, note:"Artificier du parcours marocain historique en 2022" },
  { name:"Victor Osimhen",    emoji:"🇳🇬", titres:0, euroTitres:0, butscdm:23, matchscdm:35, ballondor:0, note:"Attaquant star du Nigeria, champion d'Italie avec Naples" },
  { name:"Mohamed Salah",     emoji:"🇪🇬", titres:0, euroTitres:0, butscdm:56, matchscdm:100,ballondor:0, note:"Meilleur buteur de l'histoire de l'Égypte" },
  { name:"Bruno Fernandes",   emoji:"🇵🇹", titres:0, euroTitres:0, butscdm:30, matchscdm:80, ballondor:0, note:"Capitaine du Portugal, milieu créateur prolifique" },
  { name:"João Félix",        emoji:"🇵🇹", titres:0, euroTitres:0, butscdm:12, matchscdm:45, ballondor:0, note:"Talent polyvalent de l'attaque portugaise" },
  { name:"Antoine Griezmann", emoji:"🇫🇷", titres:1, euroTitres:1, butscdm:44, matchscdm:140,ballondor:0, note:"Champion du monde 2018 et d'Europe 2016, pilier des Bleus" },
  { name:"Ousmane Dembélé",   emoji:"🇫🇷", titres:1, euroTitres:0, butscdm:8,  matchscdm:45, ballondor:0, note:"Champion du monde 2018, ailier rapide du PSG" },
  { name:"Aurélien Tchouaméni",emoji:"🇫🇷",titres:0, euroTitres:0, butscdm:3,  matchscdm:30, ballondor:0, note:"Milieu défensif du Real Madrid, pilier des Bleus" },
  { name:"William Saliba",    emoji:"🇫🇷", titres:0, euroTitres:0, butscdm:0,  matchscdm:25, ballondor:0, note:"Défenseur central d'Arsenal, finaliste Mondial 2022" },
  { name:"Florian Wirtz",     emoji:"🇩🇪", titres:0, euroTitres:0, butscdm:9,  matchscdm:25, ballondor:0, note:"Jeune prodige du milieu offensif allemand" },
  { name:"Jamal Musiala",     emoji:"🇩🇪", titres:0, euroTitres:0, butscdm:14, matchscdm:35, ballondor:0, note:"Étoile montante du Bayern Munich et de la Mannschaft" },
  { name:"İlkay Gündoğan",    emoji:"🇩🇪", titres:0, euroTitres:0, butscdm:19, matchscdm:80, ballondor:0, note:"Capitaine expérimenté de l'Allemagne" },
  { name:"Lautaro Martínez",  emoji:"🇦🇷", titres:1, euroTitres:0, butscdm:32, matchscdm:75, ballondor:0, note:"Champion du monde 2022 et Copa América, buteur de l'Inter" },
  { name:"Enzo Fernández",    emoji:"🇦🇷", titres:1, euroTitres:0, butscdm:8,  matchscdm:40, ballondor:0, note:"Meilleur jeune joueur du Mondial 2022, champion avec l'Argentine" },
  { name:"Rodrigo De Paul",   emoji:"🇦🇷", titres:1, euroTitres:0, butscdm:7,  matchscdm:75, ballondor:0, note:"Milieu infatigable, champion du monde 2022" },
  { name:"Marquinhos",        emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:5,  matchscdm:55, ballondor:0, note:"Défenseur capitaine du Brésil et du PSG" },
  { name:"Rodrygo",           emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:8,  matchscdm:30, ballondor:0, note:"Attaquant polyvalent du Real Madrid" },
  { name:"Casemiro",          emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:7,  matchscdm:75, ballondor:0, note:"Sentinelle du milieu brésilien, 5 Ligues des Champions" },
  { name:"Alisson Becker",    emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:0,  matchscdm:65, ballondor:0, note:"Gardien titulaire du Brésil, pilier de Liverpool" },
  { name:"Thibaut Courtois",  emoji:"🇧🇪", titres:0, euroTitres:0, butscdm:0,  matchscdm:105,ballondor:0, note:"Considéré parmi les meilleurs gardiens au monde" },
  { name:"Virgil van Dijk",   emoji:"🇳🇱", titres:0, euroTitres:0, butscdm:9,  matchscdm:90, ballondor:0, note:"Capitaine et roc défensif des Pays-Bas" },
  { name:"Memphis Depay",     emoji:"🇳🇱", titres:0, euroTitres:0, butscdm:46, matchscdm:96, ballondor:0, note:"Meilleur buteur de l'histoire des Pays-Bas" },
  { name:"Frenkie de Jong",   emoji:"🇳🇱", titres:0, euroTitres:0, butscdm:6,  matchscdm:55, ballondor:0, note:"Milieu technique du FC Barcelone" },
  { name:"Joshua Kimmich",    emoji:"🇩🇪", titres:0, euroTitres:0, butscdm:9,  matchscdm:100,ballondor:0, note:"Polyvalent et précieux pour la Mannschaft" },
  { name:"Declan Rice",       emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:4,  matchscdm:60, ballondor:0, note:"Milieu défensif clé d'Arsenal et de l'Angleterre" },
  { name:"Phil Foden",        emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:13, matchscdm:38, ballondor:0, note:"Jeune star formée à Manchester City" },
  { name:"Pedro Neto",        emoji:"🇵🇹", titres:0, euroTitres:0, butscdm:5,  matchscdm:30, ballondor:0, note:"Ailier rapide et technique du Portugal" },
  { name:"Marcus Rashford",   emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:17, matchscdm:65, ballondor:0, note:"Attaquant offensif emblématique de Manchester United" },
  { name:"Endrick",           emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:13, matchscdm:18, ballondor:0, note:"Plus jeune espoir brésilien évoluant au Real Madrid" },
  { name:"Hirving Lozano",    emoji:"🇲🇽", titres:0, euroTitres:0, butscdm:31, matchscdm:90, ballondor:0, note:"Buteur emblématique du Mexique, pays hôte 2026" },
  { name:"Raphinha",          emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:24, matchscdm:40, ballondor:0, note:"Ailier offensif du FC Barcelone et du Brésil" },
  { name:"Luis Díaz",         emoji:"🇨🇴", titres:0, euroTitres:0, butscdm:26, matchscdm:65, ballondor:0, note:"Star colombienne offensive de Liverpool" },
  { name:"Darwin Núñez",      emoji:"🇺🇾", titres:0, euroTitres:0, butscdm:21, matchscdm:45, ballondor:0, note:"Attaquant puissant de l'Uruguay et de Liverpool" },
  { name:"Youssef En-Nesyri", emoji:"🇲🇦", titres:0, euroTitres:0, butscdm:21, matchscdm:65, ballondor:0, note:"Buteur clé du parcours marocain en 2022" },
  { name:"Kai Havertz",       emoji:"🇩🇪", titres:0, euroTitres:0, butscdm:22, matchscdm:55, ballondor:0, note:"Polyvalent offensif d'Arsenal et de l'Allemagne" },
  // ── Légendes ──
  { name:"Pelé",               emoji:"🇧🇷", titres:3, euroTitres:0, butscdm:77, matchscdm:92,  ballondor:0, note:"Triple champion du monde (1958, 1962, 1970), légende absolue" },
  { name:"Diego Maradona",     emoji:"🇦🇷", titres:1, euroTitres:0, butscdm:34, matchscdm:91,  ballondor:0, note:"Champion du monde 1986, auteur du but du siècle" },
  { name:"Zinédine Zidane",    emoji:"🇫🇷", titres:1, euroTitres:0, butscdm:31, matchscdm:108, ballondor:1, note:"Champion du monde 1998, double buteur en finale" },
  { name:"Ronaldo Nazário",    emoji:"🇧🇷", titres:2, euroTitres:0, butscdm:62, matchscdm:98,  ballondor:2, note:"Double champion du monde, recordman des buts en Coupe du Monde" },
  { name:"Ronaldinho",         emoji:"🇧🇷", titres:1, euroTitres:0, butscdm:33, matchscdm:97,  ballondor:0, note:"Champion du monde 2002, magicien du Brésil" },
  { name:"Thierry Henry",      emoji:"🇫🇷", titres:1, euroTitres:0, butscdm:51, matchscdm:123, ballondor:0, note:"Champion du monde 1998, meilleur buteur historique des Bleus" },
  { name:"Roberto Baggio",     emoji:"🇮🇹", titres:0, euroTitres:0, butscdm:27, matchscdm:56,  ballondor:1, note:"Finaliste malheureux 1994, l'un des plus grands n°10 italiens" },
  { name:"Franz Beckenbauer",  emoji:"🇩🇪", titres:1, euroTitres:0, butscdm:14, matchscdm:103, ballondor:2, note:"Champion du monde 1974, inventeur du poste de libéro" },
  { name:"Johan Cruyff",       emoji:"🇳🇱", titres:0, euroTitres:0, butscdm:33, matchscdm:48,  ballondor:3, note:"Finaliste 1974, génie du football total néerlandais" },
  { name:"George Best",        emoji:"🇬🇧", titres:0, euroTitres:0, butscdm:9,  matchscdm:37,  ballondor:1, note:"Légende nord-irlandaise, jamais qualifié en Coupe du Monde" },
  { name:"Michel Platini",     emoji:"🇫🇷", titres:0, euroTitres:0, butscdm:41, matchscdm:72,  ballondor:3, note:"Triple Ballon d'Or consécutif, capitaine des Bleus" },
  { name:"Paolo Maldini",      emoji:"🇮🇹", titres:0, euroTitres:0, butscdm:7,  matchscdm:126, ballondor:0, note:"Record de longévité, finaliste de la Coupe du Monde 1994" },
  { name:"David Beckham",      emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", titres:0, euroTitres:0, butscdm:17, matchscdm:115, ballondor:0, note:"Icône anglaise, maître des coups francs" },
  { name:"Zico",               emoji:"🇧🇷", titres:0, euroTitres:0, butscdm:48, matchscdm:72,  ballondor:0, note:"Légende de Flamengo, jamais sacré champion du monde" },
  { name:"Romário",            emoji:"🇧🇷", titres:1, euroTitres:0, butscdm:55, matchscdm:70,  ballondor:0, note:"Champion du monde 1994, buteur d'instinct redoutable" },
];

const TOP_TRUMPS_CATEGORIES = [
  { key:"titres",    label:"🏆 Titres CdM",      higher:true,  desc:"Coupes du Monde remportées" },
  { key:"euroTitres",label:"🌍 Titres Euro/Copa", higher:true,  desc:"Titres continentaux (Euro / Copa América)" },
  { key:"butscdm",   label:"⚽ Buts sélection",   higher:true,  desc:"Buts marqués en équipe nationale" },
  { key:"matchscdm", label:"📅 Matchs sél.",       higher:true,  desc:"Matchs joués en équipe nationale" },
  { key:"ballondor", label:"🥇 Ballons d'Or",     higher:true,  desc:"Ballons d'Or remportés" },
];

// ── MEILLEUR BUTEUR — données vérifiées WC 2026 (clubs et stats 2024) ──────
const BUTEUR_CARDS = [
  { name:"Kylian Mbappé",     emoji:"🇫🇷", team:"France",     club:"Real Madrid",    clubGoals:19, intlGoals:48, age:26 },
  { name:"Lionel Messi",      emoji:"🇦🇷", team:"Argentine",  club:"Inter Miami",    clubGoals:20, intlGoals:109,age:37 },
  { name:"Cristiano Ronaldo", emoji:"🇵🇹", team:"Portugal",   club:"Al-Nassr",       clubGoals:35, intlGoals:133,age:41 },
  { name:"Harry Kane",        emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", team:"Angleterre",  club:"Bayern Munich",  clubGoals:25, intlGoals:68, age:31 },
  { name:"Vinicius Jr.",      emoji:"🇧🇷", team:"Brésil",     club:"Real Madrid",    clubGoals:24, intlGoals:27, age:24 },
  { name:"Erling Haaland",    emoji:"🇳🇴", team:"Norvège",    club:"Man City",       clubGoals:27, intlGoals:31, age:24 },
  { name:"Julián Álvarez",    emoji:"🇦🇷", team:"Argentine",  club:"Atlético Madrid",clubGoals:28, intlGoals:28, age:24 },
  { name:"Bukayo Saka",       emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", team:"Angleterre",  club:"Arsenal",        clubGoals:16, intlGoals:19, age:23 },
  { name:"Kai Havertz",       emoji:"🇩🇪", team:"Allemagne",  club:"Arsenal",        clubGoals:13, intlGoals:22, age:25 },
  { name:"Lamine Yamal",      emoji:"🇪🇸", team:"Espagne",    club:"FC Barcelone",   clubGoals:8,  intlGoals:8,  age:17 },
  { name:"Cody Gakpo",        emoji:"🇳🇱", team:"Pays-Bas",   club:"Liverpool",      clubGoals:13, intlGoals:16, age:25 },
  { name:"Sadio Mané",        emoji:"🇸🇳", team:"Sénégal",    club:"Al-Nassr",       clubGoals:9,  intlGoals:41, age:32 },
  { name:"Son Heung-min",     emoji:"🇰🇷", team:"Corée du Sud",club:"Tottenham",     clubGoals:17, intlGoals:35, age:32 },
  { name:"Christian Pulisic", emoji:"🇺🇸", team:"États-Unis", club:"AC Milan",       clubGoals:12, intlGoals:29, age:26 },
  { name:"Romelu Lukaku",     emoji:"🇧🇪", team:"Belgique",   club:"Napoli",         clubGoals:21, intlGoals:85, age:31 },
  { name:"Darwin Núñez",      emoji:"🇺🇾", team:"Uruguay",    club:"Liverpool",      clubGoals:11, intlGoals:21, age:25 },
  { name:"Richarlison",       emoji:"🇧🇷", team:"Brésil",     club:"Tottenham",      clubGoals:4,  intlGoals:22, age:27 },
  { name:"Youssef En-Nesyri", emoji:"🇲🇦", team:"Maroc",      club:"Fenerbahçe",     clubGoals:12, intlGoals:21, age:27 },
  { name:"Raphinha",          emoji:"🇧🇷", team:"Brésil",     club:"FC Barcelone",   clubGoals:27, intlGoals:24, age:27 },
  { name:"Memphis Depay",     emoji:"🇳🇱", team:"Pays-Bas",   club:"Atletico Madrid",clubGoals:11, intlGoals:46, age:30 },
  { name:"Luis Díaz",         emoji:"🇨🇴", team:"Colombie",   club:"Liverpool",      clubGoals:13, intlGoals:26, age:27 },
  { name:"Phil Foden",        emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", team:"Angleterre",  club:"Man City",       clubGoals:19, intlGoals:13, age:24 },
  { name:"Endrick",           emoji:"🇧🇷", team:"Brésil",     club:"Real Madrid",    clubGoals:7,  intlGoals:13, age:18 },
  { name:"Hirving Lozano",    emoji:"🇲🇽", team:"Mexique",    club:"PSV",            clubGoals:8,  intlGoals:31, age:29 },
  // ── Légendes ──
  { name:"Pelé",               emoji:"🇧🇷", team:"Brésil",    club:"Santos",         clubGoals:643, intlGoals:77 },
  { name:"Diego Maradona",     emoji:"🇦🇷", team:"Argentine", club:"Napoli",         clubGoals:115, intlGoals:34 },
  { name:"Zinédine Zidane",    emoji:"🇫🇷", team:"France",    club:"Real Madrid",    clubGoals:49,  intlGoals:31 },
  { name:"Ronaldo Nazário",    emoji:"🇧🇷", team:"Brésil",    club:"Real Madrid",    clubGoals:104, intlGoals:62 },
  { name:"Ronaldinho",         emoji:"🇧🇷", team:"Brésil",    club:"FC Barcelone",   clubGoals:94,  intlGoals:33 },
  { name:"Thierry Henry",      emoji:"🇫🇷", team:"France",    club:"Arsenal",        clubGoals:228, intlGoals:51 },
  { name:"Roberto Baggio",     emoji:"🇮🇹", team:"Italie",    club:"Juventus",       clubGoals:115, intlGoals:27 },
  { name:"Franz Beckenbauer",  emoji:"🇩🇪", team:"Allemagne", club:"Bayern Munich",  clubGoals:60,  intlGoals:14 },
  { name:"Johan Cruyff",       emoji:"🇳🇱", team:"Pays-Bas",  club:"Ajax",           clubGoals:190, intlGoals:33 },
  { name:"George Best",        emoji:"🇬🇧", team:"Irlande du Nord", club:"Manchester United", clubGoals:179, intlGoals:9 },
  { name:"Michel Platini",     emoji:"🇫🇷", team:"France",    club:"Juventus",       clubGoals:68,  intlGoals:41 },
  { name:"Paolo Maldini",      emoji:"🇮🇹", team:"Italie",    club:"AC Milan",       clubGoals:29,  intlGoals:7  },
  { name:"David Beckham",      emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", team:"Angleterre", club:"Manchester United", clubGoals:85, intlGoals:17 },
  { name:"Zico",               emoji:"🇧🇷", team:"Brésil",    club:"Flamengo",       clubGoals:508, intlGoals:48 },
  { name:"Romário",            emoji:"🇧🇷", team:"Brésil",    club:"PSV Eindhoven",  clubGoals:145, intlGoals:55 },
];

// ═══ FOOTBALLEUR MYSTÈRE — banque de ~30 joueurs (légendes + actuels) ═══
// `wiki` = titre exact de l'article Wikipédia anglais, `wikiFr` = repli sur le
// wiki français si besoin (cas ambigus). Photo récupérée via l'API Wikipedia
// au lancement de la partie (voir fetchMysteryPhoto). On ne stocke pas d'URL
// d'image en dur : Wikipedia renomme/déplace parfois ses fichiers, alors que
// le titre de la page, lui, ne change presque jamais.
// `hints` = 10 indices texte, du plus vague au plus évident — un nouveau
// indice est révélé à chaque tour, en plus de la case de la grille.
// ── Titres Wikipedia pour les cartes des jeux Buteur / Top Trumps ──────────
// Pour la grande majorité des joueurs, le nom affiché correspond exactement
// au titre de l'article Wikipedia. Cette table ne couvre que les exceptions
// (abréviations, homonymes nécessitant une désambiguïsation).
const PLAYER_WIKI_OVERRIDES = {
  // Joueurs actuels avec désambiguïsations ou accents
  "Vinicius Jr.":      "Vinícius Júnior",
  "Bruno Fernandes":   "Bruno Fernandes (footballer, born 1994)",
  "Endrick":           "Endrick (footballer, born 2006)",
  "Julián Álvarez":    "Julián Álvarez",
  "Youssef En-Nesyri": "Youssef En-Nesyri",
  "Romelu Lukaku":     "Romelu Lukaku",
  "Memphis Depay":     "Memphis Depay",
  "Darwin Núñez":      "Darwin Núñez",
  "Cody Gakpo":        "Cody Gakpo",
  "Hirving Lozano":    "Hirving Lozano",
  "Sadio Mané":        "Sadio Mané",
  "Raphinha":          "Raphinha (footballer)",
  "Richarlison":       "Richarlison",
  // Légendes
  "Ronaldo Nazário":   "Ronaldo (Brazilian footballer)",
  "Zico":              "Zico (footballer)",
  "Zinédine Zidane":   "Zinedine Zidane",
  "Romário":           "Romário",
  "Roberto Baggio":    "Roberto Baggio",
  "Franz Beckenbauer": "Franz Beckenbauer",
  "Johan Cruyff":      "Johan Cruyff",
  "George Best":       "George Best",
  "Michel Platini":    "Michel Platini",
  "Paolo Maldini":     "Paolo Maldini",
  "David Beckham":     "David Beckham",
  "Ronaldinho":        "Ronaldinho",
  "Thierry Henry":     "Thierry Henry",
  "Diego Maradona":    "Diego Maradona",
  "Pelé":              "Pelé",
};
function wikiTitleFor(name) { return PLAYER_WIKI_OVERRIDES[name] || name; }

const FOOTBALL_PLAYERS_BANK = [
  // ── Légendes ──
  { id:"pele",        name:"Pelé",               wiki:"Pelé",                           aliases:["edson arantes","o rei"],
    hints:["Né au Brésil dans les années 1940.","Surnommé « O Rei » (le Roi) dans son pays.","A débuté en pro à seulement 15 ans.","Évoluait au poste d'attaquant.","A toujours joué pour un seul grand club brésilien.","A remporté la Coupe du Monde à 17 ans, en 1958.","Le seul joueur à avoir gagné 3 Coupes du Monde.","A terminé sa carrière aux États-Unis, au New York Cosmos.","Son vrai prénom est Edson.","Considéré par beaucoup comme le meilleur joueur de tous les temps."] },
  { id:"maradona",    name:"Diego Maradona",     wiki:"Diego Maradona",                 aliases:["maradona","el pibe de oro"],
    hints:["Né en Argentine dans les années 1960.","Surnommé « El Pibe de Oro » (le Gamin d'Or).","Très petit de taille mais redoutable techniquement.","Évoluait au poste de meneur de jeu.","A porté le maillot du Napoli en Italie.","A inscrit le « but du siècle » contre l'Angleterre en 1986.","A aussi marqué le tristement célèbre « but de la main de Dieu ».","A porté le numéro 10 de l'Argentine.","Champion du monde 1986, capitaine emblématique.","Une légende argentine adulée comme un dieu vivant."] },
  { id:"zidane",      name:"Zinédine Zidane",    wiki:"Zinedine Zidane",                aliases:["zidane","zizou"],
    hints:["Né en France dans les années 1970, d'origine algérienne.","Surnommé « Zizou ».","Évoluait au poste de milieu offensif.","A débuté à Cannes avant de briller à Bordeaux.","A porté les couleurs de la Juventus en Italie.","A inscrit un but exceptionnel en finale de Ligue des Champions 2002.","Champion du monde 1998 avec la France, double buteur en finale.","A reçu un carton rouge en finale de Coupe du Monde 2006.","A ensuite porté le maillot du Real Madrid.","Devenu entraîneur, il a aussi gagné 3 Ligues des Champions sur ce banc."] },
  { id:"ronaldoR9",   name:"Ronaldo Nazário",    wiki:"Ronaldo (Brazilian footballer)", wikiFr:"Ronaldo (footballeur)", aliases:["ronaldo","fenomeno","r9"],
    hints:["Né au Brésil dans les années 1970.","Surnommé « le Phénomène » (Fenômeno).","Évoluait au poste d'attaquant pur.","A explosé très jeune au PSV Eindhoven.","A porté le maillot du FC Barcelone puis de l'Inter Milan.","Sa carrière a été marquée par de graves blessures au genou.","Double Ballon d'Or dans les années 1990.","Décisif lors de la finale de la Coupe du Monde 2002.","A aussi joué pour le Real Madrid et l'AC Milan.","Souvent cité comme le meilleur attaquant pur de l'histoire."] },
  { id:"ronaldinho",  name:"Ronaldinho",         wiki:"Ronaldinho",                     aliases:["ronaldinho gaucho"],
    hints:["Né au Brésil dans les années 1980.","Connu pour sa technique et ses dribbles spectaculaires.","Évoluait au poste de meneur de jeu / ailier.","A débuté au Grêmio avant de partir en Europe.","A porté le maillot du PSG avant de rejoindre la Catalogne.","Élu meilleur joueur du monde au milieu des années 2000.","Champion du monde 2002 avec le Brésil.","Réputé pour son sourire et son numéro 10 emblématique.","A brillé au FC Barcelone aux côtés d'un jeune Messi.","Une des stars les plus charismatiques de l'histoire du football."] },
  { id:"henry",       name:"Thierry Henry",      wiki:"Thierry Henry",                  aliases:["henry"],
    hints:["Né en France dans les années 1970, en région parisienne.","Évoluait au poste d'attaquant.","A débuté à Monaco avant de partir en Italie puis en Angleterre.","Devenu une légende dans un grand club londonien.","Longtemps meilleur buteur de l'histoire de ce club anglais.","Champion du monde 1998 et champion d'Europe 2000 avec la France.","Réputé pour sa vitesse et sa finition.","A rejoint le FC Barcelone avant de terminer sa carrière aux États-Unis.","Devenu consultant télé très populaire après sa carrière.","Une icône d'Arsenal, où une statue lui est dédiée."] },
  { id:"baggio",      name:"Roberto Baggio",     wiki:"Roberto Baggio",                 aliases:["baggio"],
    hints:["Né en Italie dans les années 1960.","Surnommé « il Divin Codino » (le divin queue de cheval).","Évoluait au poste d'attaquant / meneur de jeu.","Connu pour sa fameuse coiffure en queue de cheval.","A porté le maillot de la Juventus puis de l'AC Milan.","Ballon d'Or au début des années 1990.","Héros malheureux de la finale de Coupe du Monde 1994.","A manqué le tir au but décisif de cette finale.","Une des figures les plus aimées du football italien.","Considéré comme l'un des plus grands numéros 10 de l'histoire."] },
  { id:"beckenbauer", name:"Franz Beckenbauer",  wiki:"Franz Beckenbauer",              aliases:["beckenbauer","der kaiser"],
    hints:["Né en Allemagne dans les années 1940.","Surnommé « der Kaiser » (l'Empereur).","A révolutionné le poste de défenseur central / libéro.","A passé l'essentiel de sa carrière au Bayern Munich.","Champion du monde en tant que capitaine en 1974.","Double Ballon d'Or dans les années 1970.","A terminé sa carrière aux États-Unis, au New York Cosmos.","A aussi été champion du monde comme sélectionneur en 1990.","L'un des seuls à avoir gagné la Coupe du Monde comme joueur et entraîneur.","Une légende absolue du football allemand."] },
  { id:"cruyff",      name:"Johan Cruyff",       wiki:"Johan Cruyff",                   aliases:["cruyff"],
    hints:["Né aux Pays-Bas dans les années 1940.","Évoluait au poste d'attaquant / meneur de jeu.","A porté le numéro 14, devenu culte.","Star de l'Ajax Amsterdam dans les années 1970.","Inventeur d'un dribble devenu célèbre, qui porte son nom.","Triple Ballon d'Or dans les années 1970.","Finaliste de la Coupe du Monde 1974 avec les Pays-Bas.","A ensuite brillé au FC Barcelone, comme joueur puis entraîneur.","Père du « football total » qui a influencé tout le jeu moderne.","Considéré comme l'un des plus grands génies du football européen."] },
  { id:"best",        name:"George Best",        wiki:"George Best",                    aliases:["best"],
    hints:["Né en Irlande du Nord dans les années 1940.","Évoluait au poste d'ailier.","Réputé pour son dribble et son style de vie extravagant.","A passé l'essentiel de sa carrière dans un grand club anglais.","Star de Manchester United dans les années 1960.","Ballon d'Or à la fin des années 1960.","Champion d'Europe des clubs avec son équipe en 1968.","Surnommé le « cinquième Beatle » pour sa popularité.","Sa carrière a été freinée par des soucis extra-sportifs.","Une légende culte du football britannique."] },
  { id:"platini",     name:"Michel Platini",     wiki:"Michel Platini",                 aliases:["platini"],
    hints:["Né en France dans les années 1950.","Évoluait au poste de milieu offensif.","A débuté à Nancy avant de briller à Saint-Étienne.","A porté le maillot de la Juventus en Italie.","Triple Ballon d'Or consécutif dans les années 1980.","Capitaine emblématique de l'équipe de France des années 1980.","Champion d'Europe des nations en 1984, meilleur buteur du tournoi.","Réputé pour ses coups francs et sa vision de jeu.","Devenu plus tard président de l'UEFA.","Considéré comme le meilleur joueur français avant l'ère Zidane."] },
  { id:"maldini",     name:"Paolo Maldini",      wiki:"Paolo Maldini",                  aliases:["maldini"],
    hints:["Né en Italie dans les années 1960.","Évoluait au poste de défenseur.","A joué toute sa carrière dans un seul club milanais.","Réputé pour son élégance et sa longévité au plus haut niveau.","A soulevé plusieurs fois la Ligue des Champions avec son club.","Longtemps capitaine de l'AC Milan.","A disputé une finale de Ligue des Champions à 40 ans passés.","Fils d'un autre footballeur professionnel italien.","Son fils est aussi devenu footballeur professionnel.","Considéré comme l'un des plus grands défenseurs de l'histoire."] },
  { id:"beckham",     name:"David Beckham",      wiki:"David Beckham",                  aliases:["beckham","becks"],
    hints:["Né en Angleterre dans les années 1970.","Évoluait au poste de milieu de terrain.","Réputé pour ses coups francs et ses passes longues.","Star de Manchester United dans les années 1990-2000.","A ensuite porté le maillot du Real Madrid.","Très populaire grâce à son image autant que son jeu.","A aussi joué au Milan AC et au PSG en fin de carrière.","A terminé sa carrière aux États-Unis, dans un club qu'il a aidé à fonder.","Marié à une ancienne Spice Girl.","Une véritable icône pop autant que sportive des années 2000."] },
  { id:"zico",        name:"Zico",               wiki:"Zico (footballer)",              wikiFr:"Zico (footballeur)", aliases:["arthur antunes coimbra"],
    hints:["Né au Brésil dans les années 1950.","Surnommé le « Pelé blanc » par certains observateurs.","Évoluait au poste de meneur de jeu / numéro 10.","Star historique d'un grand club de Rio de Janeiro.","Réputé pour sa technique sur coups francs.","Vice-champion du monde malheureux dans les années 1980.","N'a jamais remporté la Coupe du Monde malgré son immense talent.","A aussi joué au Japon en fin de carrière.","Considéré comme l'un des meilleurs joueurs n'ayant jamais été champion du monde.","Une légende absolue de Flamengo."] },
  { id:"romario",     name:"Romário",            wiki:"Romário",                        aliases:["romario","baixinho"],
    hints:["Né au Brésil dans les années 1960.","Surnommé « Baixinho » (le petit) pour sa taille.","Évoluait au poste d'attaquant, redoutable buteur dans la surface.","A porté le maillot du PSV Eindhoven puis du FC Barcelone.","Champion du monde avec le Brésil en 1994.","Décisif et buteur clé lors de cette Coupe du Monde.","Réputé pour son sens du but plus que pour son investissement défensif.","Revendique plus de 700 buts marqués en carrière.","A terminé sa carrière en jouant encore au Brésil à 40 ans passés.","Considéré comme l'un des plus grands buteurs brésiliens de l'histoire."] },
  // ── Actuels ──
  { id:"messi",       name:"Lionel Messi",       wiki:"Lionel Messi",                   aliases:["messi","leo messi","la pulga"],
    hints:["Né en Argentine dans les années 1980.","Surnommé « la Pulga » (la Puce) pour sa petite taille.","Évoluait au poste d'attaquant / ailier.","A quitté l'Argentine très jeune pour rejoindre l'Europe.","A passé l'essentiel de sa carrière dans un club catalan.","Détient le record du plus grand nombre de Ballons d'Or.","A longtemps formé un duo de rivalité avec un autre champion portugais.","Champion du monde avec l'Argentine en 2022.","A porté le brassard de capitaine lors de ce sacre mondial.","A aussi joué au PSG avant de partir terminer sa carrière aux États-Unis."] },
  { id:"cr7",         name:"Cristiano Ronaldo",  wiki:"Cristiano Ronaldo",               aliases:["cristiano","cr7","ronaldo"],
    hints:["Né au Portugal dans les années 1980, sur l'île de Madère.","Connu sous le surnom « CR7 ».","Évoluait au poste d'attaquant.","A débuté à Sporting Lisbonne avant de partir en Angleterre.","A porté le maillot de Manchester United puis du Real Madrid.","Quintuple Ballon d'Or au cours de sa carrière.","Meilleur buteur de l'histoire de la Ligue des Champions.","Champion d'Europe des nations avec le Portugal en 2016.","A aussi joué en Italie, à la Juventus.","A ensuite rejoint un club saoudien pour la suite de sa carrière."] },
  { id:"mbappe",      name:"Kylian Mbappé",      wiki:"Kylian Mbappé",                  aliases:["mbappe","kylian"],
    hints:["Né en France dans les années 1990, en région parisienne.","Évoluait au poste d'attaquant, réputé pour sa vitesse.","A explosé très jeune à l'AS Monaco.","Champion du monde avec la France en 2018, encore adolescent.","A inscrit un triplé en finale de Coupe du Monde 2022.","A longtemps porté le maillot du Paris Saint-Germain.","A ensuite rejoint un grand club espagnol.","Réputé pour sa pointe de vitesse exceptionnelle.","Souvent comparé à Thierry Henry à ses débuts.","Une des plus grandes stars françaises du football moderne."] },
  { id:"haaland",     name:"Erling Haaland",     wiki:"Erling Haaland",                  aliases:["haaland","erling"],
    hints:["Né en Norvège dans les années 1990.","Évoluait au poste d'attaquant pur, très grand de taille.","A explosé en Autriche avant de rejoindre l'Allemagne.","A marqué l'histoire avec un nombre record de buts en Bundesliga.","A rejoint un club anglais où il a continué à battre des records.","Réputé pour sa puissance physique et son sens du but.","Fils d'un ancien footballeur professionnel norvégien.","A pulvérisé le record de buts en une saison de Premier League.","Surnommé parfois « la Machine » pour sa régularité devant le but.","Une des plus grandes stars scandinaves du football moderne."] },
  { id:"debruyne",    name:"Kevin De Bruyne",    wiki:"Kevin De Bruyne",                 aliases:["de bruyne","kdb"],
    hints:["Né en Belgique dans les années 1990.","Évoluait au poste de milieu offensif, passeur hors normes.","A connu un passage difficile à Chelsea avant de rebondir.","A explosé en Allemagne, au Wolfsburg.","A ensuite brillé pendant de nombreuses années en Angleterre.","Réputé pour ses passes décisives et ses frappes lointaines.","Pilier majeur de la « génération dorée » belge.","A remporté de nombreux titres de champion d'Angleterre.","Considéré comme l'un des meilleurs milieux de sa génération.","Une référence mondiale au poste de passeur depuis le milieu de terrain."] },
  { id:"vinicius",    name:"Vinícius Júnior",    wiki:"Vinícius Júnior",                 aliases:["vinicius","vinicius jr","vini jr"],
    hints:["Né au Brésil dans les années 2000.","Évoluait au poste d'ailier, réputé pour son dribble.","A explosé très jeune à Flamengo avant de partir en Europe.","A rejoint un grand club espagnol dès l'adolescence.","A mis du temps à trouver son efficacité devant le but en Europe.","Devenu une pièce essentielle de son club madrilène.","Buteur décisif en finale de Ligue des Champions.","Souvent dans les débats pour le Ballon d'Or ces dernières années.","Réputé pour son style de jeu joyeux et expressif.","Une des grandes stars brésiliennes de la génération actuelle."] },
  { id:"bellingham",  name:"Jude Bellingham",    wiki:"Jude Bellingham",                 aliases:["bellingham","jude"],
    hints:["Né en Angleterre dans les années 2000.","Évoluait au poste de milieu de terrain.","A débuté très jeune à Birmingham City.","A explosé en Allemagne, au Borussia Dortmund.","A rejoint un grand club espagnol à l'été 2023.","Réputé pour sa puissance physique et son sens du but pour un milieu.","Devenu rapidement titulaire indiscutable en sélection anglaise.","Une des plus grandes promesses du football anglais récent.","Très décisif dès sa première saison dans son nouveau club espagnol.","Considéré comme un futur candidat sérieux au Ballon d'Or."] },
  { id:"neymar",      name:"Neymar",             wiki:"Neymar",                          aliases:["neymar jr","ney"],
    hints:["Né au Brésil dans les années 1990.","Évoluait au poste d'attaquant / ailier, dribbleur spectaculaire.","A explosé très jeune à Santos, le club historique de Pelé.","A rejoint le FC Barcelone aux côtés de Messi et Suárez.","A signé un transfert record vers Paris.","Réputé pour ses dribbles et ses gestes techniques.","Souvent critiqué pour ses simulations en match.","Capitaine emblématique de la sélection brésilienne.","Sa carrière a souvent été freinée par les blessures.","Une des plus grandes stars brésiliennes des années 2010-2020."] },
  { id:"lewandowski", name:"Robert Lewandowski", wiki:"Robert Lewandowski",              aliases:["lewandowski","lewy"],
    hints:["Né en Pologne dans les années 1980.","Évoluait au poste d'attaquant pur.","A explosé en Allemagne, au Borussia Dortmund.","A ensuite rejoint le grand rival de son ancien club.","Réputé pour son sens du but exceptionnel et sa régularité.","A inscrit cinq buts en moins de dix minutes lors d'un match resté célèbre.","Longtemps meilleur buteur de la Bundesliga.","A ensuite rejoint le FC Barcelone en fin de carrière européenne.","Capitaine et meilleur buteur historique de la sélection polonaise.","Considéré comme l'un des plus grands attaquants de sa génération."] },
  { id:"salah",       name:"Mohamed Salah",      wiki:"Mohamed Salah",                   aliases:["salah","mo salah"],
    hints:["Né en Égypte dans les années 1990.","Évoluait au poste d'ailier / attaquant.","A débuté en Europe en Suisse, au FC Bâle.","A connu un passage discret à Chelsea, suivi d'un prêt en Italie.","A explosé véritablement quelques années plus tard, sur les bords de la Mersey.","Réputé pour son efficacité et sa frappe du pied gauche.","Très populaire en Égypte, où il est une véritable icône nationale.","A souvent terminé parmi les meilleurs buteurs de Premier League.","Une véritable idole dans tout le monde arabe.","Une des plus grandes stars africaines du football moderne."] },
  { id:"kane",        name:"Harry Kane",         wiki:"Harry Kane",                      aliases:["kane"],
    hints:["Né en Angleterre dans les années 1990.","Évoluait au poste d'attaquant pur.","A connu plusieurs prêts en début de carrière avant de percer.","Devenu la référence offensive d'un grand club londonien pendant une décennie.","Longtemps meilleur buteur de l'histoire de ce club londonien.","Réputé pour sa finition et sa vision de jeu pour un attaquant.","Capitaine emblématique de la sélection anglaise.","A longtemps été critiqué pour n'avoir jamais soulevé de trophée majeur.","A finalement rejoint un grand club allemand pour relancer sa quête de titres.","Une des références offensives du football anglais de sa génération."] },
  { id:"modric",      name:"Luka Modrić",        wiki:"Luka Modrić",                     aliases:["modric"],
    hints:["Né en Croatie dans les années 1980.","Évoluait au poste de milieu de terrain, très technique.","A débuté au Dinamo Zagreb avant de partir à l'étranger.","A explosé à Tottenham avant de rejoindre l'Espagne.","Pilier du Real Madrid pendant de nombreuses saisons.","Réputé pour sa vision de jeu malgré son petit gabarit.","Finaliste de la Coupe du Monde 2018 avec la Croatie.","Ballon d'Or, mettant fin à une longue domination de deux rivaux.","Capitaine historique de la sélection croate.","Considéré comme l'un des plus grands milieux européens de sa génération."] },
  { id:"benzema",     name:"Karim Benzema",      wiki:"Karim Benzema",                   aliases:["benzema"],
    hints:["Né en France dans les années 1980, près de Lyon.","Évoluait au poste d'attaquant.","A explosé à l'Olympique Lyonnais avant de partir en Espagne.","A passé l'essentiel de sa carrière dans un grand club madrilène.","Réputé pour son jeu de remise et son intelligence tactique.","A longtemps évolué dans l'ombre d'un autre grand attaquant portugais.","Devenu la référence offensive de son club après le départ de ce dernier.","Ballon d'Or après une saison exceptionnelle en Ligue des Champions.","A ensuite rejoint un club saoudien.","L'un des meilleurs attaquants français de sa génération."] },
  { id:"saka",        name:"Bukayo Saka",        wiki:"Bukayo Saka",                     aliases:["saka"],
    hints:["Né en Angleterre dans les années 2000.","Évoluait au poste d'ailier.","Formé dans le centre de formation d'un grand club londonien.","Devenu rapidement titulaire indiscutable dans ce club.","Réputé pour son sens du dribble et sa polyvalence.","A manqué un tir au but lors de la finale de l'Euro 2020 avec l'Angleterre.","A rebondi pour devenir l'un des meilleurs jeunes joueurs d'Europe.","Affectueusement surnommé par les supporters de son club.","Une des grandes promesses du football anglais de sa génération.","Capable de jouer ailier droit comme arrière selon les besoins de son équipe."] },
  { id:"griezmann",   name:"Antoine Griezmann",  wiki:"Antoine Griezmann",               aliases:["griezmann","grizou"],
    hints:["Né en France dans les années 1990.","Évoluait au poste d'attaquant / meneur de jeu.","A quitté la France très jeune pour rejoindre l'Espagne.","A explosé à la Real Sociedad avant de rejoindre un grand club madrilène.","Réputé pour sa polyvalence et sa technique.","Finaliste malheureux de l'Euro 2016 avec la France.","Champion du monde avec la France en 2018.","Désigné meilleur joueur du tournoi lors de ce Mondial 2018.","Réputé pour son célèbre « geste Fortnite » pour célébrer ses buts.","Une des figures majeures du football français du XXIe siècle."] },
];

// ── Repli JSONP pour l'API Wikipedia : si fetch() échoue (CORS, CSP
// connect-src, etc.), on tente via une balise <script>, qui n'est pas
// soumise aux mêmes restrictions qu'un fetch() cross-origin classique.
function jsonpRequest(baseUrl) {
  return new Promise((resolve, reject) => {
    const cbName = `_wikiJsonpCb${Date.now()}${Math.floor(Math.random()*1e6)}`;
    const script = document.createElement("script");
    const cleanup = () => { try { delete window[cbName]; } catch(e) {} script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("jsonp timeout")); }, 6000);
    window[cbName] = (data) => { clearTimeout(timer); cleanup(); resolve(data); };
    script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error("jsonp script error")); };
    script.src = `${baseUrl}&callback=${cbName}`;
    document.body.appendChild(script);
  });
}

// ── Rappels de pronostics par phase éliminatoire ──────────────────────────
// `valKey`   : clé dans validatedGroups pour savoir si le joueur a déjà validé
// `deadline` : ISO — dernier moment où les pronos sont encore accessibles
// `countdown`: ISO — date/heure de début de la 1ère rencontre (pour le décompte login)
// `msg`      : message affiché dans la modale de rappel
const ELIM_REMINDERS = [
  {
    phase: "seiziemes",
    valKey: "ELIM_seiziemes",
    deadline: "2026-06-28T21:00:00", // R1 le 28 juin à 21h00 — 1er match de la phase
    countdown: "2026-06-28T21:00:00",
    label: "1/16 de finale",
    msg: "N'oubliez pas de faire vos pronostics pour les 1/16 de finale\navant le dimanche 28 juin à 21h !",
  },
  {
    phase: "huitiemes",
    valKey: "ELIM_huitiemes",
    deadline: "2026-07-04T19:00:00", // Q1 le 4 juillet à 19h00 — 1er match de la phase
    countdown: "2026-07-04T19:00:00",
    label: "8e de finale",
    msg: "N'oubliez pas de faire vos pronostics pour les 8e de finale\navant le samedi 4 juillet à 19h !",
  },
  {
    phase: "quarts",
    valKey: "ELIM_quarts",
    deadline: "2026-07-09T22:00:00", // S1 le 9 juillet à 22h00 — 1er match de la phase
    countdown: "2026-07-09T22:00:00",
    label: "Quarts de finale",
    msg: "N'oubliez pas de faire vos pronostics pour les Quarts de finale\navant le jeudi 9 juillet à 22h !",
  },
  {
    phase: "demis",
    valKey: "ELIM_demis",
    deadline: "2026-07-14T21:00:00", // SF1 le 14 juillet à 21h00 — 1er match de la phase
    countdown: "2026-07-14T21:00:00",
    label: "Demi-finales",
    msg: "N'oubliez pas de faire vos pronostics pour les Demi-finales\navant le mardi 14 juillet à 21h !",
  },
  {
    phase: "finale",
    valKey: "ELIM_finale",
    deadline: "2026-07-19T21:00:00", // FIN le 19 juillet à 21h00 — coup d'envoi de la finale
    countdown: "2026-07-19T21:00:00",
    label: "Finale",
    msg: "N'oubliez pas de faire vos pronostics pour la Grande Finale\navant le dimanche 19 juillet à 21h !",
  },
];

const blank = () => ({ users:{}, predictions:{}, results:{}, scores:{}, validatedGroups:{}, finalLock:{}, seenAnim:{}, officialThirds:{}, thirdPicks:{}, seenEgg:{}, presence:{}, chat:{famille:[],collegues:[],externe:[]}, matchComments:{}, chatEnabled:true, appVersion: APP_VERSION, forceLogoutSignal: 0, seenChat:{}, gameScores:{}, gameScoresTotal:{}, gameHistory:{}, challenges:{}, gamePlaysToday:{},
  elimUnlocked: [],          // phases déverrouillées par admin: ["seiziemes","huitiemes",...]
  elimRealTeams: {},         // équipes réelles saisies par admin: {"R1":{home:"Maroc",away:"France"}, ...}
  finaleData: { official:null, predictions:{} }, // résultat spécial finale (vainqueur/mode/buteurs/score)
});
function load() {
  try {
    // Vérifier si la version a changé
    const storedVersion = localStorage.getItem("APP_VERSION");
    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log(`[VERSION CHECK] Changement détecté: ${storedVersion} → ${APP_VERSION}. Forçage de déconnexion.`);
      // Supprimer les données de la vieille version
      localStorage.removeItem(KEY);
      localStorage.removeItem("APP_VERSION");
      return blank();
    }
    
    // Version OK ou première visite, charger normalement
    const s = localStorage.getItem(KEY);
    if (s) {
      const data = {...blank(),...JSON.parse(s)};
      // Sauvegarder la version courante
      localStorage.setItem("APP_VERSION", APP_VERSION);
      return data;
    }
    
    // Première visite, sauvegarder la version
    localStorage.setItem("APP_VERSION", APP_VERSION);
    return blank();
  }
  catch {
    // En cas d'erreur, nettoyer et retourner blank
    localStorage.removeItem(KEY);
    localStorage.removeItem("APP_VERSION");
    return blank();
  }
}
function persist(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

async function persistFirebase(ns) {
  if (FB_ENABLED && _fbReady) {
    // 🛡️ PROTECTION CRITIQUE : ne jamais écrire si l'état est vide/blank
    // Sans ça, un redéploiement ou un chargement partiel efface TOUT Firebase
    const hasUsers = ns.users && Object.keys(ns.users).length > 0;
    if (!hasUsers) {
      console.warn("[persistFirebase] Bloqué : état vide détecté, Firebase protégé");
      persist(ns);
      return;
    }
    try {
      // Écriture sélective : on ne touche qu'aux champs réellement renseignés
      // Cela évite d'écraser des champs vides par accident
      const updates = {
        users:             ns.users,
        predictions:       ns.predictions     || {},
        results:           ns.results         || {},
        scores:            ns.scores          || {},
        validatedGroups:   ns.validatedGroups || {},
        finalLock:         ns.finalLock       || {},
        seenAnim:          ns.seenAnim        || {},
        officialThirds:    ns.officialThirds  || {},
        thirdPicks:        ns.thirdPicks      || {},
        seenEgg:           ns.seenEgg         || {},
        chatEnabled:       ns.chatEnabled !== false,
        forceLogoutSignal: ns.forceLogoutSignal || 0,
        seenChat:          ns.seenChat         || {},
        appVersion:        ns.appVersion || APP_VERSION,
        // ⚠️ elimUnlocked / elimRealTeams : VOLONTAIREMENT absents d'ici.
        // Ces deux champs ont leur propre écriture Firebase scopée + protégée
        // anti-écrasement (toggleUnlock / saveRealTeams, avec trackWrite).
        // Les inclure ici permettait à n'importe quelle action anodine faite
        // sur UN AUTRE appareil (finir un défi, un mini-jeu...) d'écraser les
        // affiches tout juste saisies par l'admin avec une copie locale périmée
        // de CET appareil-là (qui n'avait pas encore reçu la dernière saisie).
        // C'est ce qui causait la disparition "toute seule" des affiches.
        gameScores:        ns.gameScores      || {},
        gameScoresTotal:   ns.gameScoresTotal || {},
        gameHistory:       ns.gameHistory     || {},
        gamePlaysToday:    ns.gamePlaysToday   || {},
        challenges:        ns.challenges      || {},
        presence:          ns.presence        || {},
        finaleData:        ns.finaleData      || { official:null, predictions:{} },
      };
      // ⚠️ Le chat ET les commentaires par match ne sont PAS inclus ici —
      // ils sont gérés via des écritures atomiques (sendChat/addReaction)
      // pour éviter les race conditions (écrasement mutuel de messages
      // quand une autre action quelconque appelle save() avec un état local périmé)
      const chatHasContent =
        (ns.chat?.famille?.length  || 0) > 0 ||
        (ns.chat?.collegues?.length || 0) > 0 ||
        (ns.chat?.externe?.length  || 0) > 0;
      if (!chatHasContent) {
        // Première fois ou chat vide → initialiser la structure
        updates.chat = { famille: [], collegues: [], externe: [] };
      }
      // matchComments : jamais réécrit en entier ici (uniquement via écritures
      // atomiques) — sauf s'il n'existe pas encore du tout côté local (init)
      if (!ns.matchComments || Object.keys(ns.matchComments).length === 0) {
        updates.matchComments = {};
      }
      await _fbUpdate("/", updates);
    } catch(e) { console.warn("Firebase write error:", e); persist(ns); }
  } else { persist(ns); }
}

// (le chat est envoyé via _fbUpdate atomique directement dans sendChat)

// ══════════════════════════════════════════
// CALC SCORES
// ══════════════════════════════════════════
// ═══ BARÈME DES POINTS ════════════════════════════════════════════
// Défini avant calcScores qui en a besoin
const PHASE_POINTS = {
  poules: 1, seiziemes: 3, huitiemes: 3,
  quarts: 3, demis: 3, p3: 3,
  finale: 5  // +5 bonus score exact, +2 par buteur bien pronostiqué
};
// Bonus finale
const FINALE_BONUS_SCORE  = 5;  // score exact
const FINALE_BONUS_BUTEUR = 2;  // par buteur bien pronostiqué (max 2 buteurs)

function calcScores(st) {
  const sc = {};
  Object.keys(st.users).forEach(u => {
    let pts = 0;
    const userPreds = st.predictions[u] || {};

    Object.keys(st.scores || {}).forEach(id => {
      if (id === "FIN") return; // la finale a son propre système de calcul (voir plus bas)
      const score = st.scores[id];
      const match = MATCHES.find(m => m.id === id);
      if (!match) return;

      const outcome = outcomeOf(score, match.phase !== "poules");
      const pred    = userPreds[id];
      if (!outcome || !pred) return;

      if (match.phase === "poules") {
        // ── Poules : comparaison directe (équipes toujours connues) ──
        if (pred === outcome) pts += PHASE_POINTS["poules"];

      } else {
        // ── Phases éliminatoires ──────────────────────────────
        // Les vraies équipes sont communiquées par l'admin (elimRealTeams) dès
        // le déverrouillage de la phase : tout le monde voit la même affiche.
        // Il n'y a donc plus de "bonne équipe à deviner" : seul le résultat
        // (1 ou 2) compte, avec un barème qui monte crescendo jusqu'à la finale.
        if (pred === outcome) pts += PHASE_POINTS[match.phase] || 2;
      }
    });

    // ── Finale : système spécial (vainqueur+mode = 5pts, +5 score exact, +2/buteur max 2) ──
    const finOfficial = st.finaleData?.official;
    const finMine = st.finaleData?.predictions?.[u];
    if (finOfficial && finOfficial.winner && finMine && finMine.winner) {
      const modeMatch = finOfficial.mode === finMine.mode;
      const winnerMatch = finOfficial.winner === finMine.winner;
      if (winnerMatch && modeMatch) pts += PHASE_POINTS.finale;
      if (winnerMatch && finOfficial.scoreH != null && finOfficial.scoreA != null
          && finMine.scoreH != null && finMine.scoreA != null
          && finOfficial.scoreH === finMine.scoreH && finOfficial.scoreA === finMine.scoreA) {
        pts += FINALE_BONUS_SCORE;
      }
      if (finOfficial.buteurs && finMine.buteurs) {
        const offSet = new Set(finOfficial.buteurs.map(b=>(b||"").toLowerCase().trim()).filter(Boolean));
        const matched = (finMine.buteurs||[]).filter(b => b && offSet.has(b.toLowerCase().trim()));
        pts += Math.min(matched.length, 2) * FINALE_BONUS_BUTEUR;
      }
    }

    sc[u] = pts;
  });
  return sc;
}

// ══════════════════════════════════════════
// TODAY
// ══════════════════════════════════════════
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ══════════════════════════════════════════
// DESIGN TOKENS
// ══════════════════════════════════════════
// ── Palette été festif ──────────────────────────────────────────────
const BG       = "#0a0e1a";          // nuit douce (pas noir total)
const SURF     = "#131828";          // surface principale
const SURF2    = "#1a2035";          // surface secondaire
const BRD      = "#263050";          // bordure visible

// Barème des points — utilisé dans calcScores ET dans l'UI
const GOLD     = "#FFD234";          // jaune soleil intense
const GOLD2    = "#FF8C00";          // orange chaud
const TEAL     = "#00D4AA";          // turquoise été
const SKY      = "#38BDF8";          // bleu ciel
const MUTED    = "#6b7fa8";          // texte secondaire (plus bleuté)
const TXT      = "#f0f4ff";          // texte principal (légèrement bleuté)
const GREEN    = "#2ECC71";          // vert gazon vif
const RED      = "#FF4757";          // rouge festif
const AMB      = "#FF9F43";          // ambre/orange
const PINK     = "#FF6B9D";          // accent rose chaud
// Gradients réutilisables
const GRAD_SUN  = "linear-gradient(135deg, #FFD234 0%, #FF8C00 100%)";
const GRAD_OCEAN= "linear-gradient(135deg, #00D4AA 0%, #38BDF8 100%)";
const GRAD_FIELD= "linear-gradient(135deg, #2ECC71 0%, #27ae60 100%)";
const GRAD_NIGHT= "linear-gradient(180deg, #0a0e1a 0%, #0f1628 50%, #0a1020 100%)";

const t = {
  root:{minHeight:"100vh",background:GRAD_NIGHT,color:TXT,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",WebkitFontSmoothing:"antialiased"},
  wrap:{maxWidth:480,width:"100%",margin:"0 auto",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))",overflowX:"hidden"},

  // LOGIN
  loginWrap:{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24},
  loginCard:{width:"100%",maxWidth:340,background:"rgba(19,24,40,.95)",border:`1px solid ${BRD}`,borderRadius:24,padding:28,display:"flex",flexDirection:"column",gap:14,backdropFilter:"blur(12px)"},
  input:{background:"rgba(10,14,26,.8)",border:`1px solid ${BRD}`,borderRadius:12,padding:"13px 14px",color:TXT,fontSize:16,width:"100%",fontFamily:"inherit",outline:"none",WebkitAppearance:"none",boxSizing:"border-box"},
  btnGold:{background:GRAD_SUN,color:"#0a0e1a",border:"none",borderRadius:14,padding:"14px 20px",fontSize:16,fontWeight:800,cursor:"pointer",width:"100%",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(255,140,0,.4)"},

  // HEADER
  hdr:{background:`linear-gradient(90deg, ${SURF} 0%, #162040 100%)`,borderBottom:`1px solid ${BRD}`,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 16px rgba(0,0,0,.4)"},
  hdrName:{fontSize:17,fontWeight:800,background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  hdrRole:{fontSize:11,color:MUTED,marginTop:2},
  btnXS:{background:"rgba(255,255,255,.06)",border:`1px solid ${BRD}`,color:TXT,borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit"},

  // BOTTOM NAV
  bnav:{position:"fixed",bottom:0,left:0,right:0,background:`linear-gradient(0deg, ${SURF} 0%, rgba(19,24,40,.98) 100%)`,borderTop:`1px solid ${BRD}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom, 0px)"},
  nbtn:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"9px 4px",background:"transparent",border:"none",cursor:"pointer",color:MUTED,fontSize:10,fontWeight:600,gap:2,fontFamily:"inherit",transition:"all .15s"},
  nbtnOn:{color:GOLD,textShadow:"0 0 8px rgba(255,210,52,.6)"},

  // TABS
  tabs:{display:"flex",gap:6,padding:"10px 12px",overflowX:"auto",overflowY:"hidden",scrollbarWidth:"none",WebkitOverflowScrolling:"touch",touchAction:"pan-x",minWidth:0,width:"100%"},
  tab:{background:SURF2,border:`1px solid ${BRD}`,borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,color:MUTED,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0,transition:"all .15s"},
  tabOn:{background:GRAD_SUN,color:"#0a0e1a",borderColor:"transparent",boxShadow:"0 2px 12px rgba(255,140,0,.35)"},

  // SECTION
  sec:{padding:"0 12px"},
  stitle:{fontSize:11,fontWeight:800,background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",textTransform:"uppercase",letterSpacing:1.5,marginBottom:10,marginTop:4},

  // CARD
  card:{background:SURF,border:`1px solid ${BRD}`,borderRadius:18,padding:14,marginBottom:10,transition:"border-color .2s"},
  cGreen:{borderColor:GREEN,background:"rgba(46,204,113,.06)",boxShadow:"0 0 0 1px rgba(46,204,113,.2)"},
  cRed:{borderColor:RED,background:"rgba(255,71,87,.05)",boxShadow:"0 0 0 1px rgba(255,71,87,.15)"},

  // MATCH
  mmeta:{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:MUTED,marginBottom:10},
  tvbadge:{background:"rgba(255,210,52,.12)",border:`1px solid rgba(255,210,52,.3)`,borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:700,color:GOLD,flexShrink:0},
  teams:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginBottom:12},
  teamBox:{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flex:1,minWidth:0},
  flag:{fontSize:32,lineHeight:1,filter:"drop-shadow(0 2px 4px rgba(0,0,0,.4))"},
  tname:{fontSize:11,fontWeight:700,textAlign:"center",lineHeight:1.2,color:TXT},
  resolvedName:{fontSize:10,color:GOLD,textAlign:"center",marginTop:1},
  vs:{color:MUTED,fontSize:12,fontWeight:700,flexShrink:0,padding:"0 4px"},
  pbrow:{display:"flex",gap:8},
  pb:{flex:1,padding:"11px 4px",borderRadius:14,border:`1px solid ${BRD}`,background:"rgba(255,255,255,.04)",color:MUTED,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",minHeight:44,transition:"all .15s"},
  pbOn:{background:GRAD_SUN,borderColor:"transparent",color:"#0a0e1a",boxShadow:"0 3px 14px rgba(255,140,0,.4)"},
  pbDis:{opacity:.35,cursor:"not-allowed"},

  // STREAM
  srow:{display:"flex",flexWrap:"wrap",gap:6,marginTop:10},
  sbtn:{background:"rgba(255,210,52,.1)",border:"1px solid rgba(255,210,52,.3)",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,color:GOLD,cursor:"pointer",textDecoration:"none",display:"inline-block"},

  // BADGES
  bOk:{marginTop:8,textAlign:"center",fontSize:12,fontWeight:700,padding:"5px 10px",borderRadius:8,background:"rgba(46,204,113,.12)",color:GREEN},
  bKo:{marginTop:8,textAlign:"center",fontSize:12,fontWeight:700,padding:"5px 10px",borderRadius:8,background:"rgba(255,71,87,.12)",color:RED},

  // ALERTS
  aWarn:{borderRadius:14,padding:"11px 14px",fontSize:13,fontWeight:600,textAlign:"center",background:"rgba(255,159,67,.1)",border:"1px solid rgba(255,159,67,.35)",color:AMB,marginBottom:10},
  aOk:{borderRadius:14,padding:"11px 14px",fontSize:13,fontWeight:600,textAlign:"center",background:"rgba(46,204,113,.1)",border:"1px solid rgba(46,204,113,.35)",color:GREEN,marginBottom:10},
  aLock:{borderRadius:14,padding:"11px 14px",fontSize:13,fontWeight:600,textAlign:"center",background:"rgba(255,71,87,.08)",border:"1px solid rgba(255,71,87,.3)",color:RED,marginBottom:10},

  // BUTTONS
  btnGreen:{width:"100%",background:GRAD_FIELD,color:"#fff",border:"none",borderRadius:14,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:48,boxShadow:"0 4px 16px rgba(46,204,113,.3)"},
  btnLock:{width:"100%",background:GRAD_SUN,color:"#0a0e1a",border:"none",borderRadius:14,padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:10,minHeight:48,boxShadow:"0 4px 16px rgba(255,140,0,.35)"},

  // STANDINGS / LB
  srow2:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${BRD}`,fontSize:13},
  spts:{fontWeight:700,color:GOLD,fontSize:12},
  srank:{color:MUTED,fontSize:11,width:18,flexShrink:0},
  lbrow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${BRD}`,fontSize:13},
  lbMe:{color:GOLD,fontWeight:700},
  lbPts:{fontWeight:700,color:GOLD},
  lbRank:{width:26,flexShrink:0,color:MUTED,fontSize:12},

  // ADMIN
  abadge:{background:"rgba(255,71,87,.1)",border:"1px solid rgba(255,71,87,.3)",color:RED,borderRadius:10,padding:"8px 12px",fontWeight:700,fontSize:13,textAlign:"center",marginBottom:12},
  ucard:{background:SURF,border:`1px solid ${BRD}`,borderRadius:14,padding:12,marginBottom:8},
  rrow:{display:"flex",gap:8,marginTop:8},
  brole:{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${BRD}`,background:"rgba(255,255,255,.03)",color:MUTED,fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:40,transition:"all .15s"},
  bFam:{background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",borderColor:"transparent",color:"#fff",boxShadow:"0 2px 10px rgba(59,130,246,.3)"},
  bCol:{background:"linear-gradient(135deg,#7c3aed,#a855f7)",borderColor:"transparent",color:"#fff",boxShadow:"0 2px 10px rgba(168,85,247,.3)"},
  bExt:{background:"linear-gradient(135deg,#0f766e,#0d9488)",borderColor:"transparent",color:"#fff",boxShadow:"0 2px 10px rgba(13,148,136,.3)"},
  bRes:{flex:1,padding:"10px 4px",borderRadius:10,border:`1px solid ${BRD}`,background:"rgba(255,255,255,.03)",color:MUTED,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",minHeight:44,transition:"all .15s"},
  bResOn:{background:"linear-gradient(135deg,#FF4757,#ff6b81)",borderColor:"transparent",color:"#fff"},

  // MODAL
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"},
  mbox:{background:`linear-gradient(180deg,${SURF2} 0%, ${SURF} 100%)`,border:`1px solid ${BRD}`,borderRadius:"28px 28px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480,textAlign:"center"},
  mtitle:{fontSize:22,fontWeight:800,color:GOLD,margin:"12px 0 8px"},
  mtext:{color:MUTED,fontSize:13,lineHeight:1.7,marginBottom:20},
  mbtns:{display:"flex",gap:10},
  bCancel:{flex:1,background:"rgba(255,255,255,.06)",border:`1px solid ${BRD}`,color:MUTED,padding:"12px",borderRadius:14,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",minHeight:48},
  bConfirm:{flex:1,background:"linear-gradient(135deg,#FF4757,#ff6b81)",border:"none",color:"#fff",padding:"12px",borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:48},

  empty:{textAlign:"center",color:MUTED,padding:"20px 0",fontSize:13},
  divider:{height:1,background:`linear-gradient(90deg,transparent,${BRD},transparent)`,margin:"12px 0"},
};

// ══════════════════════════════════════════
// MATCH CARD
// ══════════════════════════════════════════
function MatchCard({ m, pred, official, score, locked, onPick, isAdmin, onScore, onClear, results, userRole, predictions,
  thirdPick, onThirdPick, takenGroups, officialThirds, userThirds, realTeams }) {
  const isElim = m.phase !== "poules";
  const btns = isElim ? ["1","2"] : ["1","N","2"];
  const correct = official && pred === official;
  const wrong   = official && pred && pred !== official;
  const cStyle  = {...t.card,...(correct?t.cGreen:wrong?t.cRed:{})};

  // Résolution avec userThirds → corrige "3e ABCDF" en vraie équipe
  const resolveWithFallback = (team) => {
    return resolveTeamWithPredictions(team, results, predictions, {}, officialThirds||{}, userThirds||{});
  };

  // Résolution spéciale pour les "3e xxx" avec le pick du groupe
  // Priorité : 1) résultats officiels admin  2) pronos du joueur pour les poules
  const resolveThirdTeam = (teamStr, side) => {
    if (!teamStr.startsWith("3e ")) return resolveWithFallback(teamStr);
    const pickedGroup = thirdPick?.[side];
    if (!pickedGroup) return teamStr; // aucun groupe sélectionné

    // 1. Résultats officiels disponibles pour ce groupe → utiliser
    const standings_off = groupStandings(pickedGroup, results || {});
    if (standings_off[2] && FLAGS[standings_off[2]]) return standings_off[2];

    // 2. Pas encore de résultats officiels → utiliser les pronos du joueur
    //    (le joueur a rempli ses matchs de poules → on peut calculer le 3e)
    if (predictions) {
      const standings_pred = groupStandings(pickedGroup, predictions);
      if (standings_pred[2] && FLAGS[standings_pred[2]]) return standings_pred[2];
    }

    // 3. Aucun pronostic non plus → afficher "3e F" en attendant
    return `3e ${pickedGroup}`;
  };

  const rHome = realTeams?.home || (m.home.startsWith("3e ") ? resolveThirdTeam(m.home, "home") : resolveWithFallback(m.home));
  const rAway = realTeams?.away || (m.away.startsWith("3e ") ? resolveThirdTeam(m.away, "away") : resolveWithFallback(m.away));
  const homeChanged = rHome !== m.home && FLAGS[rHome];
  const awayChanged = rAway !== m.away && FLAGS[rAway];

  // Picker de groupe pour les "3e" — affiche les lettres disponibles dans le placeholder
  function ThirdGroupPicker({ side, teamStr }) {
    if (!teamStr.startsWith("3e ")) return null;
    const groupLetters = teamStr.replace("3e ", "").split(""); // ex: ["A","B","C","D","F"]
    const selected = thirdPick?.[side];
    return (
      <div style={{marginTop:5}}>
        <div style={{fontSize:9,color:MUTED,marginBottom:4,textAlign:"center",textTransform:"uppercase",letterSpacing:.5}}>
          {isAdmin ? "📋 Officiel — " : ""}Groupe du 3e ?
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
          {groupLetters.map(g => {
            // Pris dans un AUTRE match (pas le sélectionné ici)
            const isTaken = takenGroups?.has(g) && g !== selected;
            return (
              <button key={g}
                disabled={isTaken}
                onClick={()=>!isTaken && onThirdPick && (isAdmin||!locked) && onThirdPick(side, g)}
                title={isTaken ? `Groupe ${g} déjà attribué à un autre seizième` : `Sélectionner le 3e du groupe ${g}`}
                style={{
                  width:26,height:26,borderRadius:6,
                  border:`1.5px solid ${
                    selected===g ? GOLD :
                    isTaken     ? "rgba(255,255,255,.1)" :
                    isAdmin     ? "rgba(239,68,68,.4)" : BRD
                  }`,
                  background:
                    selected===g ? "rgba(245,200,66,.22)" :
                    isTaken     ? "rgba(255,255,255,.03)" :
                    isAdmin     ? "rgba(239,68,68,.06)" : BG,
                  color:
                    selected===g ? GOLD :
                    isTaken     ? "rgba(255,255,255,.18)" :
                    isAdmin     ? "rgba(239,68,68,.8)" : MUTED,
                  fontSize:10,fontWeight:800,
                  cursor: isTaken || (!isAdmin && locked) ? "not-allowed" : "pointer",
                  fontFamily:"inherit",padding:0,lineHeight:"24px",
                  opacity: isTaken ? 0.35 : 1,
                  textDecoration: isTaken ? "line-through" : "none",
                  boxShadow: isAdmin && selected===g ? "0 0 6px rgba(245,200,66,.3)" : "none",
                }}>{g}</button>
            );
          })}
        </div>
        {selected && <div style={{fontSize:9,color:GOLD,textAlign:"center",marginTop:3}}>
          Groupe {selected} sélectionné {isAdmin?"(officiel)":""}
        </div>}
        {!selected && !isAdmin && (
          <div style={{
            fontSize:9, color:AMB, textAlign:"center", marginTop:5,
            lineHeight:1.4, maxWidth:200, margin:"5px auto 0",
            background:"rgba(245,158,11,.08)", borderRadius:6, padding:"4px 6px",
            border:"1px solid rgba(245,158,11,.2)",
          }}>
            💡 Choisis un groupe pour afficher l'équipe — même si tu pronostics l'adversaire gagnant
          </div>
        )}
      </div>
    );
  }

  const { badges, links } = getStreamInfo(m.tv);

  // Nom court affiché dans le bouton de pronostic
  function shortName(team) {
    if (!team || !FLAGS[team]) return null; // pas encore résolu
    // Tronque après le premier mot pour les noms longs (ex: "Arabie Saoudite" → "Arabie")
    const parts = team.split(" ");
    return parts.length > 1 && team.length > 10 ? parts[0] : team;
  }

  return (
    <div style={cStyle}>
      <div style={t.mmeta}>
        <span>📅 {m.date} · {m.time} · {m.city}</span>
        {m.tv && <span style={t.tvbadge}>📺 {m.tv}</span>}
      </div>

      <div style={t.teams}>
        <div style={t.teamBox}>
          <span style={t.flag}>{F(rHome)}</span>
          <span style={t.tname}>{isElim ? rHome : m.home}</span>
          <ThirdGroupPicker side="home" teamStr={m.home}/>
        </div>
        <div style={{...t.vs, display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          {official ? (
            <span style={{
              fontSize:score?20:15,fontWeight:900,
              color: correct ? GREEN : wrong ? RED : GOLD,
              letterSpacing:1,
              animation:"scorePop .3s ease",
              textShadow: correct?`0 0 12px ${GREEN}`:wrong?`0 0 12px ${RED}`:`0 0 12px ${GOLD}`,
            }}>
              {score ? scoreLabel(score) : (official==="1"?"1–0":official==="2"?"0–1":"N")}
            </span>
          ) : <span style={{fontSize:12,color:MUTED,fontWeight:700,letterSpacing:1}}>VS</span>}
          {official && <span style={{fontSize:8,color:MUTED,fontWeight:700,letterSpacing:.5}}>FIN</span>}
        </div>
        <div style={t.teamBox}>
          <span style={t.flag}>{F(rAway)}</span>
          <span style={t.tname}>{isElim ? rAway : m.away}</span>
          <ThirdGroupPicker side="away" teamStr={m.away}/>
        </div>
      </div>

      {isAdmin ? (
        <div>
          {/* Saisie du score réel */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            {/* Score domicile */}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:.5}}>{(homeChanged?rHome:m.home).split(" ")[0]}</span>
              <input
                type="number" min="0" max="99"
                value={score?.h ?? ""}
                onChange={e=>onScore(m.id,"h",e.target.value)}
                style={{
                  width:"100%",textAlign:"center",fontSize:28,fontWeight:900,
                  background:SURF2,border:`2px solid ${score?.h!==""&&score?.h!=null?GOLD:BRD}`,
                  borderRadius:12,padding:"10px 4px",color:TXT,
                  fontFamily:"inherit",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"
                }}
              />
            </div>
            {/* Séparateur */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:10,color:MUTED,opacity:0}}> </span>
              <span style={{fontSize:22,fontWeight:900,color:MUTED,padding:"0 4px"}}>–</span>
            </div>
            {/* Score extérieur */}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:.5}}>{(awayChanged?rAway:m.away).split(" ")[0]}</span>
              <input
                type="number" min="0" max="99"
                value={score?.a ?? ""}
                onChange={e=>onScore(m.id,"a",e.target.value)}
                style={{
                  width:"100%",textAlign:"center",fontSize:28,fontWeight:900,
                  background:SURF2,border:`2px solid ${score?.a!==""&&score?.a!=null?GOLD:BRD}`,
                  borderRadius:12,padding:"10px 4px",color:TXT,
                  fontFamily:"inherit",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"
                }}
              />
            </div>
          </div>
          {/* Résultat dérivé + bouton reset */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            {official ? (
              <span style={{
                fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:8,
                background: official==="1"?"rgba(34,197,94,.15)":official==="2"?"rgba(239,68,68,.15)":"rgba(245,200,66,.15)",
                color: official==="1"?GREEN:official==="2"?RED:GOLD
              }}>
                {official==="1"?`Victoire ${(homeChanged?rHome:m.home).split(" ")[0]}`:official==="2"?`Victoire ${(awayChanged?rAway:m.away).split(" ")[0]}`:"Match nul"}
              </span>
            ) : (
              <span style={{fontSize:11,color:MUTED}}>
                {isElim ? "Pas de match nul possible" : "Saisis les buts"}
              </span>
            )}
            {(score?.h!==""&&score?.h!=null||score?.a!==""&&score?.a!=null) && (
              <button onClick={()=>onClear(m.id)} style={{
                background:"transparent",border:"none",color:MUTED,
                fontSize:11,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",padding:"4px"
              }}>Effacer</button>
            )}
          </div>
        </div>
      ) : (
        <div style={t.pbrow}>
          {btns.map((b) => {
            const isNul = b === "N";
            const team  = isNul ? null : (b === "1" ? rHome : rAway);
            const sn    = team ? shortName(team) : null;
            const isResolved = !!sn; // vraie équipe connue
            return (
              <button key={b}
                style={{
                  ...t.pb,
                  ...(pred===b ? t.pbOn : {}),
                  ...(locked   ? t.pbDis : {}),
                  display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center",
                  gap:3, padding:"8px 4px", minHeight:54,
                }}
                disabled={locked}
                onClick={() => onPick(m.id, b)}>
                {isNul ? (
                  <span style={{fontSize:13,fontWeight:700}}>Nul</span>
                ) : isResolved ? (
                  /* Équipe connue → drapeau + nom */
                  <>
                    <span style={{fontSize:24, lineHeight:1}}>{F(team)}</span>
                    <span style={{
                      fontSize:10, fontWeight:700, lineHeight:1.2,
                      textAlign:"center", maxWidth:"100%",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    }}>{sn}</span>
                  </>
                ) : (
                  /* Équipe pas encore déterminée → placeholder lisible */
                  <>
                    <span style={{fontSize:16, lineHeight:1}}>❓</span>
                    <span style={{fontSize:9, color:"inherit", opacity:.7, textAlign:"center", lineHeight:1.2}}>
                      {team && team.length > 10 ? team.slice(0,9)+"…" : team}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {correct && <div style={t.bOk}>✓ Bon pronostic · +{PHASE_POINTS[m.phase] ?? 1} pts {score?`(${scoreLabel(score)})`:""}</div>}
      {wrong   && <div style={t.bKo}>✗ Raté · {score?scoreLabel(score):""} · Tu jouais {pred==="1"?rHome:pred==="2"?rAway:"Nul"}{score?"":" · Résultat : "+official}</div>}

      {/* En phase éliminatoire, affiche le pronostic original du joueur (équipes qu'il avait) */}
      {isElim && official && pred && !isAdmin && predictions && (() => {
        // Résoudre les équipes telles que vues par le joueur (via ses pronos, pas résultats officiels)
        const predHome = resolveTeam(m.home, predictions, {}, {});
        const predAway = resolveTeam(m.away, predictions, {}, {});
        const offHome  = rHome; // équipes officielles (résultats admin)
        const offAway  = rAway;
        const predTeam = pred === "1" ? predHome : predAway;
        const offTeam  = pred === "1" ? offHome  : offAway;
        // Afficher seulement si les équipes dans le match ont changé vs ce que le joueur voyait
        const homeChanged = FLAGS[predHome] && predHome !== offHome;
        const awayChanged = FLAGS[predAway] && predAway !== offAway;
        if (!homeChanged && !awayChanged) return null;
        return (
          <div style={{
            marginTop:6,padding:"5px 10px",borderRadius:8,
            background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
            fontSize:11,color:MUTED,textAlign:"center",lineHeight:1.5
          }}>
            📋 Ton match pronostiqué : {FLAGS[predHome]||"❓"} {predHome} vs {FLAGS[predAway]||"❓"} {predAway}
            {" · "}Tu jouais {pred==="1"?`${FLAGS[predHome]||""} ${predHome}`:`${FLAGS[predAway]||""} ${predAway}`}
          </div>
        );
      })()}

      {!isAdmin && badges.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
          {badges.map(b=>(
            <span key={b.label} style={{
              background:`rgba(${b.color==="#6366f1"?"99,102,241":"245,158,11"},.1)`,
              border:`1px solid ${b.color}44`,
              borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,
              color:b.color, display:"flex",alignItems:"center",gap:4
            }}>{b.icon} {b.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// FINALE — panneau spécial : vainqueur / nul+prolongation / TAB / buteurs / score exact
// ══════════════════════════════════════════════════════════════════════
function FinaleResultBadge({ data, homeT, awayT }) {
  if (!data || !data.winner) return null;
  const winnerName = data.winner === "home" ? homeT : awayT;
  const modeLabel = data.mode === "reg" ? "(temps réglementaire)"
    : data.mode === "prolong" ? "(après prolongation)"
    : data.mode === "tab" ? "(aux tirs au but)" : "";
  return (
    <div style={{textAlign:"center",fontSize:12,fontWeight:700,color:GOLD,marginTop:4}}>
      🏆 {winnerName} champion du monde {modeLabel}
      {data.scoreH != null && data.scoreA != null && (
        <div style={{fontSize:11,color:MUTED,marginTop:2,fontWeight:400}}>
          Score : {data.scoreH} – {data.scoreA}
        </div>
      )}
    </div>
  );
}

function FinalePanel({ m, isAdmin, homeT, awayT, official, myPick, onSave, locked, officialButeurs }) {
  // official  = résultat admin (affiché en lecture seule côté joueur après verrouillage)
  // myPick    = pronostic du joueur (toujours dans les champs de saisie côté joueur)
  // Les champs de saisie utilisent TOUJOURS myPick (ou official si admin)
  const data = isAdmin ? (official || {}) : (myPick || {});
  const [scoreH, setScoreH] = useState(data.scoreH ?? "");
  const [scoreA, setScoreA] = useState(data.scoreA ?? "");
  const NB_BUTEUR_FIELDS = isAdmin ? 6 : 2;
  const [buteurs, setButeurs] = useState(() => {
    const arr = data.buteurs || [];
    return Array.from({length:NB_BUTEUR_FIELDS}, (_,i) => arr[i] || "");
  });

  useEffect(() => {
    setScoreH(data.scoreH ?? ""); setScoreA(data.scoreA ?? "");
    const arr = data.buteurs || [];
    setButeurs(Array.from({length:NB_BUTEUR_FIELDS}, (_,i) => arr[i] || ""));
  }, [data.winner, data.mode, data.scoreH, data.scoreA, JSON.stringify(data.buteurs)]);

  // ── Choisir le vainqueur en 90 minutes : remet toujours mode="reg" et efface tout état nul/prolong/tab ──
  const setWinner90 = (side) => {
    if (locked) return;
    onSave({ winner: side, mode: "reg" });
  };
  const setDraw = () => {
    if (locked) return;
    onSave({ winner: null, mode: "draw" });
  };
  const setProlongWinner = (side) => {
    if (locked) return;
    onSave({ winner: side, mode: "prolong" });
  };
  const setTabWinner = (side) => {
    if (locked) return;
    onSave({ winner: side, mode: "tab" });
  };
  const saveScore = () => {
    if (locked) return;
    const h = scoreH === "" ? null : parseInt(scoreH);
    const a = scoreA === "" ? null : parseInt(scoreA);
    onSave({ scoreH: isNaN(h) ? null : h, scoreA: isNaN(a) ? null : a });
  };
  const saveButeurs = (newArr) => {
    if (locked) return;
    // Dédupliquer : un même nom (insensible à la casse/espaces) ne compte qu'une fois,
    // même si l'admin l'a inscrit dans plusieurs champs (ex: doublé du même buteur)
    const seen = new Set();
    const cleaned = [];
    newArr.forEach(b => {
      const trimmed = (b || "").trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      cleaned.push(trimmed);
    });
    onSave({ buteurs: cleaned });
  };

  // isDraw : on est dans le contexte "match nul après 90min" tant que le mode
  // est draw/prolong/tab — ça permet de garder le sous-menu visible et de pouvoir
  // changer d'avis entre prolongation et TAB sans perdre l'accès au bouton 90min
  const inDrawContext = data.mode === "draw" || data.mode === "prolong" || data.mode === "tab";
  const isReg = data.mode === "reg" && data.winner;

  // ── Équipe pas encore déterminée (demi-finales pas encore jouées/saisies) ──
  // Plutôt qu'un drapeau blanc + texte technique brut ("Vainqueur SF1"), on
  // affiche un message clair pour que ce ne soit pas pris pour un bug.
  const isUnresolved = (team) => !team || /^(Vainqueur|Perdant|V\.|1er |2e |3e )/i.test(team.trim());
  const renderTeam = (team) => {
    if (isUnresolved(team)) {
      return (
        <>
          <div style={{fontSize:26}}>⏳</div>
          <div style={{fontSize:11,fontWeight:600,color:MUTED}}>En attente</div>
        </>
      );
    }
    return (
      <>
        <div style={{fontSize:26}}>{F(team)}</div>
        <div style={{fontSize:12,fontWeight:700}}>{team}</div>
      </>
    );
  };

  return (
    <div style={{...t.card, border:`2px solid ${GOLD}`, background:"linear-gradient(135deg,rgba(245,200,66,.1),rgba(245,200,66,.03))"}}>
      <div style={{textAlign:"center",marginBottom:10}}>
        <div style={{fontSize:11,color:GOLD,fontWeight:800,textTransform:"uppercase",letterSpacing:1}}>🏆 Finale de la Coupe du Monde</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8}}>
          <div style={{textAlign:"center"}}>{renderTeam(homeT)}</div>
          <span style={{fontSize:14,color:MUTED,fontWeight:700}}>VS</span>
          <div style={{textAlign:"center"}}>{renderTeam(awayT)}</div>
        </div>
        {(isUnresolved(homeT) || isUnresolved(awayT)) && (
          <div style={{fontSize:10,color:MUTED,marginTop:6,fontStyle:"italic"}}>
            Les finalistes seront connus après les demi-finales
          </div>
        )}
      </div>

      {/* ── Explication du barème (toujours visible, joueur et admin) ── */}
      <div style={{marginBottom:10,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,.04)",border:`1px solid ${BRD}`}}>
        <div style={{fontSize:10,color:GOLD,fontWeight:700,marginBottom:4}}>📊 Comment sont calculés les points ?</div>
        <div style={{fontSize:10,color:MUTED,lineHeight:1.6}}>
          • <strong style={{color:TXT}}>Vainqueur + bonne issue</strong> (90min / prolongation / TAB) : <strong style={{color:GOLD}}>{PHASE_POINTS.finale} pts</strong><br/>
          • 🎁 <strong style={{color:TXT}}>Bonus score exact</strong> (90 min, hors TAB) : <strong style={{color:GOLD}}>+{FINALE_BONUS_SCORE} pts</strong><br/>
          • 🎁 <strong style={{color:TXT}}>Bonus par buteur juste</strong> (max 2 comptés) : <strong style={{color:GOLD}}>+{FINALE_BONUS_BUTEUR} pts</strong> chacun<br/>
          <span style={{opacity:.8}}>Total maximum possible : {PHASE_POINTS.finale + FINALE_BONUS_SCORE + FINALE_BONUS_BUTEUR*2} pts</span>
        </div>
      </div>

      {/* ── 1. Qui gagne en 90 minutes ? ── */}
      <div style={{fontSize:11,color:MUTED,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>
        {isAdmin ? "1️⃣ Résultat officiel — 90 minutes" : "1️⃣ Ton pronostic — 90 minutes"}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {["home","away"].map(side=>(
          <button key={side} disabled={locked} onClick={()=>setWinner90(side)}
            style={{flex:1,padding:"10px 6px",borderRadius:10,border:"none",cursor:locked?"default":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12,
              opacity:locked?.6:1,
              background:isReg&&data.winner===side?"rgba(245,200,66,.25)":"rgba(255,255,255,.06)",
              color:isReg&&data.winner===side?GOLD:MUTED,
              boxShadow:isReg&&data.winner===side?`0 0 0 2px ${GOLD}`:"none"}}>
            🏆 {side==="home"?homeT:awayT}
          </button>
        ))}
        <button disabled={locked} onClick={setDraw}
          style={{flex:1,padding:"10px 6px",borderRadius:10,border:"none",cursor:locked?"default":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12,
            opacity:locked?.6:1,
            background:inDrawContext?"rgba(96,165,250,.25)":"rgba(255,255,255,.06)",
            color:inDrawContext?"#60a5fa":MUTED,
            boxShadow:inDrawContext?"0 0 0 2px #60a5fa":"none"}}>
          🤝 Nul après 90 min
        </button>
      </div>

      {/* ── 2. Si nul après 90min : prolongation ou TAB — reste affiché tant qu'on n'a pas re-choisi une victoire 90min ── */}
      {inDrawContext && (
        <div style={{marginBottom:8,padding:"10px",borderRadius:10,background:"rgba(96,165,250,.06)",border:"1px solid rgba(96,165,250,.25)"}}>
          <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,marginBottom:6}}>Et ensuite ?</div>
          <div style={{fontSize:10,color:MUTED,marginBottom:6}}>Vainqueur après prolongation :</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {["home","away"].map(side=>(
              <button key={side} disabled={locked} onClick={()=>setProlongWinner(side)}
                style={{flex:1,padding:"8px 6px",borderRadius:8,border:"none",cursor:locked?"default":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11,
                  opacity:locked?.6:1,
                  background:data.winner===side&&data.mode==="prolong"?"rgba(34,197,94,.2)":"rgba(255,255,255,.06)",
                  color:data.winner===side&&data.mode==="prolong"?GREEN:MUTED}}>
                ⏱ {side==="home"?homeT:awayT}
              </button>
            ))}
          </div>
          <div style={{fontSize:10,color:MUTED,marginBottom:6}}>Ou aux tirs au but :</div>
          <div style={{display:"flex",gap:6}}>
            {["home","away"].map(side=>(
              <button key={side} disabled={locked} onClick={()=>setTabWinner(side)}
                style={{flex:1,padding:"8px 6px",borderRadius:8,border:"none",cursor:locked?"default":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11,
                  opacity:locked?.6:1,
                  background:data.winner===side&&data.mode==="tab"?"rgba(231,76,60,.2)":"rgba(255,255,255,.06)",
                  color:data.winner===side&&data.mode==="tab"?"#e74c3c":MUTED}}>
                🎯 {side==="home"?homeT:awayT}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.winner && (
        <div style={{textAlign:"center",fontSize:11,color:MUTED,marginBottom:10,fontStyle:"italic"}}>
          {data.mode==="reg" && `Victoire ${data.winner==="home"?homeT:awayT} dans le temps réglementaire`}
          {data.mode==="prolong" && `Victoire ${data.winner==="home"?homeT:awayT} après prolongation`}
          {data.mode==="tab" && `Victoire ${data.winner==="home"?homeT:awayT} aux tirs au but`}
        </div>
      )}

      {/* ── 3. Bonus score exact ── */}
      <div style={{fontSize:11,color:MUTED,fontWeight:700,marginBottom:6,marginTop:10,textTransform:"uppercase",letterSpacing:.5}}>
        2️⃣ {isAdmin?"Score exact (90 min, hors TAB)":"🎁 Bonus : score exact (+"+FINALE_BONUS_SCORE+" pts)"}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <input type="number" min="0" max="20" value={scoreH} disabled={locked}
          onChange={e=>setScoreH(e.target.value)} onBlur={saveScore}
          placeholder="0"
          style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800,background:SURF2,border:`2px solid ${scoreH!==""?GOLD:BRD}`,borderRadius:10,padding:"8px 4px",color:TXT,fontFamily:"inherit",outline:"none"}}/>
        <span style={{fontSize:16,color:MUTED,fontWeight:700}}>–</span>
        <input type="number" min="0" max="20" value={scoreA} disabled={locked}
          onChange={e=>setScoreA(e.target.value)} onBlur={saveScore}
          placeholder="0"
          style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800,background:SURF2,border:`2px solid ${scoreA!==""?GOLD:BRD}`,borderRadius:10,padding:"8px 4px",color:TXT,fontFamily:"inherit",outline:"none"}}/>
      </div>

      {/* ── 4. Buteurs ── */}
      <div style={{fontSize:11,color:MUTED,fontWeight:700,marginBottom:6,marginTop:10,textTransform:"uppercase",letterSpacing:.5}}>
        3️⃣ {isAdmin?`Buteurs officiels (jusqu'à ${NB_BUTEUR_FIELDS})`:`🎁 Bonus : noms des buteurs (+${FINALE_BONUS_BUTEUR} pts chacun, max 2 comptés)`}
      </div>
      {isAdmin && (
        <div style={{fontSize:9,color:MUTED,marginBottom:6,fontStyle:"italic"}}>Un même buteur auteur d'un doublé ne doit être inscrit qu'une fois.</div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:6}}>
        {buteurs.map((val,i)=>(
          <input key={i} value={val} disabled={locked}
            placeholder={isAdmin ? `Buteur ${i+1} (optionnel)` : `Nom buteur ${i+1} (optionnel)`}
            onChange={e=>{
              const next=[...buteurs]; next[i]=e.target.value; setButeurs(next);
            }}
            onBlur={()=>saveButeurs(buteurs)}
            style={{padding:"8px",borderRadius:8,border:`1px solid ${BRD}`,background:SURF2,color:TXT,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
        ))}
      </div>

      {/* ── Buteurs officiels déjà saisis par l'admin (affichés côté joueur) ── */}
      {!isAdmin && officialButeurs && officialButeurs.length > 0 && (
        <div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.25)"}}>
          <div style={{fontSize:10,color:GREEN,fontWeight:700,marginBottom:4}}>⚽ Buteurs officiels de la finale :</div>
          <div style={{fontSize:12,color:TXT,fontWeight:600}}>{officialButeurs.join(", ")}</div>
        </div>
      )}

      {isAdmin && <FinaleResultBadge data={official} homeT={homeT} awayT={awayT}/>}

      {/* ── Résultat officiel affiché côté joueur après verrouillage ── */}
      {!isAdmin && official && official.winner && locked && (
        <div style={{marginTop:12,padding:"12px",borderRadius:10,background:"rgba(245,200,66,.08)",border:`2px solid ${GOLD}`}}>
          <div style={{fontSize:11,color:GOLD,fontWeight:800,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>🏆 Résultat officiel</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:8}}>
            <div style={{textAlign:"center",opacity:official.winner==="away"?.4:1}}>
              <div style={{fontSize:24}}>{F(homeT)}</div>
              <div style={{fontSize:11,fontWeight:700,color:official.winner==="home"?GOLD:MUTED}}>{homeT}</div>
            </div>
            {official.scoreH != null && official.scoreA != null ? (
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:900,color:TXT}}>{official.scoreH} – {official.scoreA}</div>
                <div style={{fontSize:10,color:MUTED}}>(90 min)</div>
              </div>
            ) : (
              <span style={{fontSize:18,color:MUTED}}>–</span>
            )}
            <div style={{textAlign:"center",opacity:official.winner==="home"?.4:1}}>
              <div style={{fontSize:24}}>{F(awayT)}</div>
              <div style={{fontSize:11,fontWeight:700,color:official.winner==="away"?GOLD:MUTED}}>{awayT}</div>
            </div>
          </div>
          <div style={{textAlign:"center",fontSize:12,fontWeight:700,color:GOLD}}>
            {official.mode==="reg" && `🏆 ${official.winner==="home"?homeT:awayT} champion du monde (90 min)`}
            {official.mode==="prolong" && `🏆 ${official.winner==="home"?homeT:awayT} champion du monde (prolongation)`}
            {official.mode==="tab" && `🏆 ${official.winner==="home"?homeT:awayT} champion du monde (TAB)`}
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════
// APP
// ══════════════════════════════════════════


// ── CHAT COMPONENTS (top-level pour éviter hook violations) ──────
function ChatInput({ onSend }) {
  const [localMsg, setLocalMsg] = useState("");
  return (
    <div style={{padding:"10px 12px",borderTop:`1px solid ${BRD}`,display:"flex",gap:8}}>
      <input
        style={{flex:1,background:"rgba(255,255,255,.06)",border:`1px solid ${BRD}`,borderRadius:12,padding:"10px 12px",color:TXT,fontSize:13,fontFamily:"inherit",outline:"none"}}
        placeholder="Ton message..."
        value={localMsg}
        maxLength={280}
        onChange={e=>setLocalMsg(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Enter"&&localMsg.trim()){ onSend(localMsg); setLocalMsg(""); } }}
        autoComplete="off" autoCorrect="off" spellCheck="false"
      />
      <button
        onClick={()=>{ if(localMsg.trim()){ onSend(localMsg); setLocalMsg(""); } }}
        style={{background:GRAD_SUN,border:"none",borderRadius:12,padding:"10px 14px",color:"#0a0e1a",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
        ➤
      </button>
    </div>
  );
}

function ChatBox({ matchId, title, getChatMsgs, addReaction, validChatRole, user, st, save, chatEnabled, sendChat }) {
  const msgs = getChatMsgs(matchId);
  const EMOJIS = ["👍","🔥","😂","😮","👏","💪","🎉","😢"];
  const endRef = useRef(null);
  const [showPickers, setShowPickers] = useState({}); // { "msgIdx": true/false }
  const [hoveredMsg, setHoveredMsg] = useState(null); // Track which message is hovered
  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs.length]);
  const role = (st.users[user]||{}).role;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      {/* Header */}
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${BRD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:13,color:TXT}}>{title || "💬 Chat général"}</span>
        <span style={{fontSize:11,color:MUTED}}>{msgs.length} message{msgs.length>1?"s":""}</span>
      </div>
      {/* Messages */}
      <div style={{maxHeight:280,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
        {msgs.length === 0 && <div style={{textAlign:"center",color:MUTED,fontSize:12,padding:"20px 0"}}>Sois le premier à écrire ! 👋</div>}
        {msgs.map((msg, i) => {
          const isMe = msg.user === user;
          const usedEmojis = Object.entries(msg.reactions||{}).filter(([e, users]) => Array.isArray(users) && users.length > 0);
          const showPicker = showPickers[i];
          return (
            <div key={i} 
              onMouseEnter={() => setHoveredMsg(i)}
              onMouseLeave={() => setHoveredMsg(null)}
              style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
              <div style={{
                maxWidth:"80%",
                background:isMe?"linear-gradient(135deg,#FFD234,#FF8C00)":"rgba(255,255,255,.07)",
                color:isMe?"#0a0e1a":TXT,
                borderRadius:isMe?"16px 16px 4px 16px":"16px 16px 16px 4px",
                padding:"8px 12px",fontSize:13,lineHeight:1.4,
              }}>
                {!isMe && <div style={{fontSize:10,fontWeight:700,color:GOLD,marginBottom:3}}>{msg.user.toUpperCase()}</div>}
                {msg.text}
              </div>
              
              {/* Réactions utilisées + bouton ajouter */}
              <div style={{display:"flex",gap:3,marginTop:4,flexWrap:"wrap",justifyContent:isMe?"flex-end":"flex-start"}}>
                {/* Afficher seulement les emojis avec réactions */}
                {usedEmojis.map(([e, users]) => (
                  <span key={e} onClick={()=>addReaction(e,i,matchId)}
                    style={{
                      fontSize:13,cursor:"pointer",userSelect:"none",
                      padding:"2px 7px",borderRadius:10,
                      background: users.includes(user) ? "rgba(255,210,52,.2)" : "rgba(255,255,255,.07)",
                      border: users.includes(user) ? `1px solid rgba(255,210,52,.5)` : `1px solid ${BRD}`,
                      color: users.includes(user) ? GOLD : TXT,
                      fontWeight: users.includes(user) ? 700 : 400,
                      transition:"all .15s",
                    }}>
                    {e} {users.length}
                  </span>
                ))}
                
                {/* Bouton "+" — TOUJOURS visible pour indiquer l'interaction */}
                {!showPicker && (
                  <span onClick={()=>setShowPickers(p=>({...p,[i]:true}))}
                    style={{
                      fontSize:13,cursor:"pointer",userSelect:"none",
                      padding:"2px 7px",borderRadius:10,
                      background:"rgba(251,191,36,.15)",
                      border:"1px solid rgba(251,191,36,.5)",
                      color:"#fbbf24",
                      transition:"all .15s",
                      fontWeight:700,
                      opacity: hoveredMsg === i ? 1 : 0.65,
                    }}>
                    +
                  </span>
                )}
              </div>
              
              {/* Picker des emojis — affiche seulement si demandé */}
              {showPicker && (
                <div style={{display:"flex",gap:2,marginTop:4,flexWrap:"wrap",justifyContent:isMe?"flex-end":"flex-start"}}>
                  {EMOJIS.map(e=>(
                    <span key={e} onClick={()=>{addReaction(e,i,matchId); setShowPickers(p=>({...p,[i]:false}));}}
                      style={{
                        fontSize:13,cursor:"pointer",userSelect:"none",
                        padding:"2px 6px",borderRadius:8,
                        background:"rgba(255,255,255,.1)",
                        border:`1px solid ${BRD}`,
                        color:TXT,
                        transition:"all .15s",
                        hover:{background:"rgba(255,255,255,.15)"},
                      }}>
                      {e}
                    </span>
                  ))}
                  <span onClick={()=>setShowPickers(p=>({...p,[i]:false}))}
                    style={{
                      fontSize:13,cursor:"pointer",userSelect:"none",
                      padding:"2px 6px",borderRadius:8,
                      background:"rgba(255,0,0,.1)",
                      border:`1px solid rgba(255,0,0,.3)`,
                      color:"#ff6b6b",
                      fontWeight:700,
                      transition:"all .15s",
                    }}>
                    ✕
                  </span>
                </div>
              )}
              
              <div style={{fontSize:9,color:MUTED,marginTop:2}}>{new Date(msg.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>
      {/* Input — state local pour éviter le re-render du clavier */}
      {role && role !== "waiting" && chatEnabled!==false && (
        <ChatInput onSend={txt => {
          if (!txt.trim() || !user || !validChatRole) return;
          sendChat(matchId, txt);
        }}/>
      )}
      {role && role !== "waiting" && chatEnabled===false && (
        <div style={{padding:"12px 14px",borderTop:`1px solid ${BRD}`,textAlign:"center",fontSize:12,color:MUTED}}>
          🔒 Le chat est temporairement fermé par l'administrateur
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [st, setSt]     = useState(load);
  const [user, setUser] = useState("");
  const [scr, setScr]   = useState("login");
  const contentRef = useRef(null);
  
  // ═══ CONSOLIDATED STATE — Groupé pour moins de re-renders ═══
  // Audio settings grouped
  const [audio, setAudio] = useState({ muted: false, trackIdx: 0, loginMuted: false, musicSource: "synth", playMode: "playlist", mp3Idx: 0 });
  
  // UI & App state grouped
  const [appState, setAppState] = useState({
    tab: "home",
    grp: "A",
    ePhase: "seiziemes",
    aPhase: "poules",
    adminSub: "users",
    adminPronoGroup: "A",
    showCal: false,
    showTrophy: false,
    modal: false,
    confirmReset: false,
    shareCopied: false,
    eggClicks: 0,
    eggActive: false
  });

  // Login form grouped
  const [login, setLogin] = useState({ uname: "", pw: "", pwConfirm: "", fname: "", lname: "", showPw: false, showPwConfirm: false, rememberMe: false });
  // Auto-remplissage si "Se souvenir" activé lors de la dernière connexion
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cdm2026_remember");
      if (saved) {
        const { uname: su, pw: sp } = JSON.parse(saved);
        if (su) setLogin(l => ({...l, uname: su, pw: sp || "", rememberMe: true}));
      }
    } catch(e) {}
  }, []);
  
  // Other states
  const eggTimer = useRef(null);
  const quizTimerRef = useRef(null); // permet d'annuler l'auto-avance si le joueur clique "Suivant"
  const [tick, setTick] = useState(0);
  const [pronoReminder, setPronoReminder] = useState(null); // clé de phase affichée dans la modale de rappel
  const [showConsolation, setShowConsolation] = useState(null); // {winnerName, modeLabel} | null — pronostic finale manqué
  const [showBestPredictor, setShowBestPredictor] = useState(null); // {totalPts, groupLabel} | null — meilleur score du groupe
  const [resultsScreen, setResultsScreen] = useState(null);
  const [notification, setNotification] = useState(null);
  
  // Auto-dismiss notifications
  const showNotif = useCallback((type, msg) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 3500);
  }, []);
  
  // Destructure for compatibility
  const { muted, trackIdx, loginMuted, musicSource, playMode, mp3Idx } = audio;

  // Synchronise mp3Idx React quand la playlist avance automatiquement
  useEffect(() => {
    _onMp3AutoNext = (nextIdx) => setAudio(a => ({...a, mp3Idx: nextIdx}));
    return () => { _onMp3AutoNext = null; };
  }, []);
  const { tab, grp, ePhase, aPhase, adminSub, adminPronoGroup, showCal, showTrophy, modal, confirmReset, shareCopied, eggClicks, eggActive } = appState;
  const { uname, pw, pwConfirm, fname, lname, showPw, showPwConfirm, rememberMe } = login;
  const setRememberMe = useCallback((v) => setLogin(l => ({...l, rememberMe: v})), []);
  
  // Helper setters for backward compatibility
  const setTab = useCallback((v) => setAppState(s => ({...s, tab: v})), []);
  const setGrp = useCallback((v) => { setAppState(s => ({...s, grp: v})); setConfirmUnval(null); }, []);
  const setEPhase = useCallback((v) => setAppState(s => ({...s, ePhase: v})), []);
  const setAPhase = useCallback((v) => setAppState(s => ({...s, aPhase: v})), []);
  const setAdminSub = useCallback((v) => setAppState(s => ({...s, adminSub: v})), []);
  const [adminEditPhase, setAdminEditPhase] = useState(null);
  const [adminTeamInputs, setAdminTeamInputs] = useState({});
  const setAdminPronoGroup = useCallback((v) => setAppState(s => ({...s, adminPronoGroup: v})), []);
  const setLoginMuted = useCallback((v) => setAudio(a => ({...a, loginMuted: v})), []);
  const setShowCal = useCallback((v) => setAppState(s => ({...s, showCal: v})), []);
  const setEggClicks = useCallback((v) => setAppState(s => ({...s, eggClicks: v})), []);
  const setEggActive = useCallback((v) => setAppState(s => ({...s, eggActive: v})), []);
  const setShowTrophy = useCallback((v) => setAppState(s => ({...s, showTrophy: v})), []);
  const setModal = useCallback((v) => setAppState(s => ({...s, modal: v})), []);
  const setConfirmReset = useCallback((v) => setAppState(s => ({...s, confirmReset: v})), []);
  const [adminConfirmUser, setAdminConfirmUser] = useState(null);
  const [adminNewPw, setAdminNewPw] = useState("");          // Bug 4 : reset MDP joueur
  const [confirmUnval, setConfirmUnval] = useState(null);    // Bug 3 : dé-valider groupe
  const [adminPronoView, setAdminPronoView] = useState("tableau");
  const [adminPronoPlayer, setAdminPronoPlayer] = useState(null);
  const [chatMsg, setChatMsg] = useState("");
  // ── États jeux (top-level obligatoire pour respecter les règles des Hooks) ──
  const [activeGame, setActiveGame]       = useState(null);
  const [gamePhase, setGamePhase]         = useState("menu");
  const [jeuxSubTab, setJeuxSubTab]       = useState("jouer"); // "jouer" | "classements" | "historique"
  const trumpetFiredRef = useRef(false); // évite que la fanfare rejoue à chaque visite de l'onglet
  const [elimCollapsed, setElimCollapsed] = useState(new Set()); // phases repliées dans l'onglet élim
  const [gameMode, setGameMode]           = useState(null);   // null | "solo" | "defi" | "ordi"
  // ── Penalty vs Ordi ──
  const [penOrdiPhase, setPenOrdiPhase]   = useState("choose"); // "choose"|"waiting"|"reveal"
  const [penOrdiRole, setPenOrdiRole]     = useState(null);     // "tireur"|"gardien"
  const [penOrdiPick, setPenOrdiPick]     = useState(null);     // zone choisie par joueur
  const [penOrdiCpu, setPenOrdiCpu]       = useState(null);     // zone choisie par l'ordi
  const [penOrdiScore, setPenOrdiScore]   = useState({player:0, cpu:0, round:1, total:5}); // score
  const [scoresSubTab, setScoresSubTab]   = useState("pronos"); // "pronos" | "parmatch" | "jeux"
  const [statsMatchPlayer, setStatsMatchPlayer] = useState(null); // joueur sélectionné pour stats détaillées (admin)
  const [qIdx, setQIdx]                   = useState(0);
  const [qScore, setQScore]               = useState(0);
  const [answered, setAnswered]           = useState(null);
  const [showFact, setShowFact]           = useState(false);
  const [indiceIdx, setIndiceIdx]         = useState(0);
  const [guessInput, setGuessInput]       = useState("");
  const [guessResult, setGuessResult]     = useState(null);
  const [qsjQ, setQsjQ]                  = useState([]);
  const [quizSet, setQuizSet]             = useState([]); // sous-ensemble de QUIZ_QUESTIONS pour la partie en cours
  const [pmQ, setPmQ]                    = useState([]);
  const [pmIdx, setPmIdx]                 = useState(0);
  const [pmInput, setPmInput]             = useState("");
  const [pmAnswered, setPmAnswered]       = useState(false);
  const [pmTotal, setPmTotal]             = useState(0);
  const [ttCard1, setTtCard1]             = useState(null);
  const [ttCard2, setTtCard2]             = useState(null);
  const [ttRound, setTtRound]             = useState(0);
  const [ttWins, setTtWins]               = useState(0);
  const [penShots, setPenShots]           = useState([]);
  const [penPhase, setPenPhase]           = useState("shoot");
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [ttReveal, setTtReveal]               = useState(null); // {win, cat, v1, v2}
  const [buteurWinner, setButeurWinner]       = useState(null); // carte champion actuel
  const [buteurDeck,   setButeurDeck]         = useState([]);   // challengers restants
  const [buteurPick,   setButeurPick]         = useState(null); // "keep"|"swap"|null (animation)
  const [buteurDone,   setButeurDone]         = useState(false);// tournoi terminé
  const [penChallengeId, setPenChallengeId]   = useState(null); // id du défi penalty en cours
  const [penZonePick, setPenZonePick]         = useState(null); // zone choisie par ce joueur
  const [penRevealStage, setPenRevealStage]   = useState("none"); // "none" | "animating" | "result"
  const penAnimRef = useRef(null); // dernier challengeId pour lequel l'animation a déjà été lancée
  // ── Curseurs animés solo (joueur + IA) ──
  const [penCursorPos, setPenCursorPos]   = useState({x:50, y:35});
  const penCursorIntervalRef = useRef(null);
  const penCursorStartRef    = useRef(null);
  const [penAiCursorPos, setPenAiCursorPos] = useState({x:50, y:35});
  const penAiIntervalRef = useRef(null);
  const penAiStartRef    = useRef(null);
  const [penDifficulty, setPenDifficulty] = useState(null); // {label,HA,VA,color}
  const [activeChallengeId, setActiveChallengeId] = useState(null); // défi en cours (quiz/quisuisje/plusmoins/toptrumps)
  const [ttChallengeQueue, setTtChallengeQueue]   = useState(null); // paires de cartes restantes en mode défi (Top Trumps)
  const [challengePicker, setChallengePicker]     = useState(null); // game id en cours de sélection d'adversaire
  const [mysteryPlayer, setMysteryPlayer]         = useState(null); // joueur à deviner {id,name,wiki,aliases}
  const [mysteryRevealOrder, setMysteryRevealOrder] = useState([]); // permutation des 25 cases de la grille
  const [mysteryTurn, setMysteryTurn]             = useState(0);    // nombre de cases révélées (1 à 10)
  const [mysteryPhotoUrl, setMysteryPhotoUrl]     = useState(null); // null=chargement, false=indisponible, string=URL
  const [mysteryPhotoError, setMysteryPhotoError] = useState(null); // raison technique si indisponible (affichée dans l'UI)
  const [mysteryLastGuess, setMysteryLastGuess]   = useState("");   // dernière réponse proposée (pour comparaison en mode défi)
  const [cardPhotos, setCardPhotos] = useState({}); // { nomJoueur: url|false } — photos des cartes Buteur / Top Trumps
  const cardPhotoInFlightRef = useRef(new Set());   // évite de relancer 2x le même fetch en parallèle
  const photoCacheRef = useRef({}); // cache mémoire { playerId: {url,error} } pour éviter de re-fetcher Wikipedia
  const [adminChatGroup, setAdminChatGroup] = useState("famille");
  const [groupPronoPlayer, setGroupPronoPlayer] = useState(null); // joueur sélectionné dans l'onglet groupe
  // chatMatchId, groupPronoPhase, chatTab supprimés — chat par match retiré
  const setShareCopied = useCallback((v) => setAppState(s => ({...s, shareCopied: v})), []);
  const setUname = useCallback((v) => setLogin(l => ({...l, uname: v})), []);
  const setPw = useCallback((v) => setLogin(l => ({...l, pw: v})), []);
  const setPwConfirm = useCallback((v) => setLogin(l => ({...l, pwConfirm: v})), []);
  const toggleShowPw = useCallback(() => setLogin(l => ({...l, showPw: !l.showPw})), []);
  const toggleShowPwConfirm = useCallback(() => setLogin(l => ({...l, showPwConfirm: !l.showPwConfirm})), []);
  const setFname = useCallback((v) => setLogin(l => ({...l, fname: v})), []);
  const setLname = useCallback((v) => setLogin(l => ({...l, lname: v})), []);
  
  // Initialisé depuis le localStorage pour survivre aux refreshs
  const seen = useRef(new Set());
  const fbListenerRef = useRef(null);
  const presenceRef = useRef(null);   // ← intervalle du heartbeat présence
  // Mémoire courte des défis (challenges) tout juste créés/modifiés localement.
  // Sert à protéger ces écritures d'un écrasement par un retour Firebase encore
  // en retard (onValue peut renvoyer un snapshot légèrement périmé juste après
  // notre propre écriture) — sans ça, un nouveau défi pouvait disparaître
  // instantanément, redirigeant l'utilisateur vers l'écran précédent.
  const recentChallengeWritesRef = useRef({}); // {challengeId: {data, ts}}
  // ── Protection anti-écrasement GÉNÉRIQUE (toutes les données hors challenges) ──
  // Même principe que recentChallengeWritesRef mais pour predictions, results,
  // scores, validatedGroups, finalLock, thirdPicks, elimRealTeams, elimUnlocked,
  // users, finaleData, etc. Sans ça, un retour Firebase légèrement en retard
  // juste après notre propre écriture pouvait effacer localement ce qu'on venait
  // tout juste de saisir (un pronostic, un score officiel...).
  const recentWritesRef = useRef({}); // {"path.to.key": {value, ts}} — value === DELETE_MARK signifie "supprimer cette clé"
  const DELETE_MARK = "__DELETE__";
  const trackWrite = (path, value) => { recentWritesRef.current[path] = { value, ts: Date.now() }; };
  const trackDelete = (path) => { recentWritesRef.current[path] = { value: DELETE_MARK, ts: Date.now() }; };
  const setPathValue = (obj, path, value) => {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
      else cur[p] = { ...cur[p] }; // éviter de muter l'original
      cur = cur[p];
    }
    const lastKey = parts[parts.length - 1];
    if (value === DELETE_MARK) delete cur[lastKey];
    else cur[lastKey] = value;
  };
  const [fbStatus, setFbStatus] = useState(FB_ENABLED ? "connecting" : "offline");

  // ── Firebase init + écoute temps réel ──────────────────────────────
  useEffect(() => {
    if (!FB_ENABLED) return;
    _initFirebase().then(ok => {
      if (!ok) { setFbStatus("offline"); return; }
      setFbStatus("ok");
      const rootRef = _fbRef("/");
      _fbOnValue(rootRef, snap => {
        const val = snap.val() || {};
        
        // Normaliser le chat : Firebase stocke {key: msg} après les push atomiques
        // mais le code attend des arrays → convertir et trier par timestamp
        const normalizeChat = (chatData) => {
          if (!chatData) return { famille: [], collegues: [], externe: [] };
          const toArray = (data) => {
            if (!data) return [];
            if (Array.isArray(data)) return data; // ancien format: déjà array
            // Nouveau format: objet {key1: msg, key2: msg} → conserver la clé (_key) et trier par ts
            return Object.entries(data).map(([k,v])=>({...v, _key:k})).sort((a, b) => (a.ts||0) - (b.ts||0));
          };
          return {
            famille:  toArray(chatData.famille),
            collegues: toArray(chatData.collegues),
            externe:  toArray(chatData.externe),
          };
        };

        const normalizeComments = (comments) => {
          if (!comments) return {};
          const result = {};
          Object.entries(comments).forEach(([matchId, matchData]) => {
            if (!matchData) return;
            const toArray = (data) => {
              if (!data) return [];
              if (Array.isArray(data)) return data;
              return Object.entries(data).map(([k,v])=>({...v, _key:k})).sort((a, b) => (a.ts||0) - (b.ts||0));
            };
            result[matchId] = {
              famille:  toArray(matchData.famille),
              collegues: toArray(matchData.collegues),
              externe:  toArray(matchData.externe),
            };
          });
          return result;
        };

        const normalized = {
          ...blank(),
          ...val,
          chat:          normalizeChat(val.chat),
          matchComments: normalizeComments(val.matchComments),
        };
        // ── Protection anti-écrasement : réinjecter les défis créés/modifiés
        // localement il y a moins de 6s si le snapshot Firebase ne les a pas
        // encore (retour en retard) ──
        const now = Date.now();
        const recentWrites = recentChallengeWritesRef.current;
        const mergedChallenges = {...(normalized.challenges||{})};
        Object.keys(recentWrites).forEach(id => {
          const entry = recentWrites[id];
          if (now - entry.ts > 6000) { delete recentWrites[id]; return; } // expiré
          // Toujours prioriser notre écriture locale récente (même si Firebase
          // a déjà une entrée pour cet id — elle peut être une version périmée
          // reçue juste avant que notre update ne soit pris en compte)
          mergedChallenges[id] = entry.data;
        });
        normalized.challenges = mergedChallenges;

        // ── Protection anti-écrasement GÉNÉRIQUE : réinjecter toute donnée
        // écrite localement il y a moins de 6s si Firebase ne l'a pas encore
        // (retour en retard). Couvre predictions, results, scores, validatedGroups,
        // finalLock, thirdPicks, elimRealTeams, elimUnlocked, users, finaleData, etc.
        const recentGeneric = recentWritesRef.current;
        Object.keys(recentGeneric).forEach(path => {
          const entry = recentGeneric[path];
          if (now - entry.ts > 6000) { delete recentGeneric[path]; return; } // expiré
          setPathValue(normalized, path, entry.value);
        });

        setSt(normalized);
        persist(normalized);
      }, err => {
        console.warn("Firebase listener error:", err);
        setFbStatus("offline");
      });
      fbListenerRef.current = () => _fbOff(rootRef);
    });
    return () => { if (fbListenerRef.current) fbListenerRef.current(); };
  }, []);

  // ── Presence heartbeat : écrit lastSeen toutes les 30s ──────────
  useEffect(() => {
    if (!user || user === "admin" || !FB_ENABLED) return;
    const writePresence = () => {
      if (_fbReady) _fbUpdate(`/presence/${user}`, { lastSeen: Date.now(), online: true });
    };
    writePresence();
    const iv = setInterval(writePresence, 30000);
    presenceRef.current = iv;
    return () => {
      clearInterval(iv);
      if (_fbReady) _fbUpdate(`/presence/${user}`, { lastSeen: Date.now(), online: false });
    };
  }, [user]);

  // Écran waiting : se met à jour automatiquement via Firebase
  useEffect(() => {
    if (scr === "waiting" && user && st.users[user]?.role && st.users[user].role !== "waiting") {
      setTab("home"); setScr("app");
    }
  }, [st.users, scr, user]);

  // ── Déconnexion forcée par l'admin ───────────────────────────────
  const lastLogoutSignal = useRef(0);
  useEffect(() => {
    const signal = st.forceLogoutSignal || 0;
    const prev = lastLogoutSignal.current;
    // Toujours mémoriser le signal courant (même avant connexion)
    // pour éviter qu'un ancien signal déclenche une déconnexion à la prochaine connexion
    lastLogoutSignal.current = Math.max(lastLogoutSignal.current, signal);
    if (signal === 0) lastLogoutSignal.current = 0;
    // N'agir QUE si c'est un nouveau signal ET qu'on est déjà connecté en mode app
    if (signal > prev && user && user !== "admin" && scr === "app") {
      doLogout();
    }
  }, [st.forceLogoutSignal, user, scr]);

  // Animation ballon de foot easter egg — déclenchée une seule fois à l'ouverture
  useEffect(() => {
    if (!eggActive) return;
    let cancelled = false;
    const timers = []; // ✅ Track all timers

    // Créer animation ballons de foot au lieu de confettis
    const createBallAnimation = () => {
      for (let i = 0; i < 12; i++) {
        const ball = document.createElement("div");
        ball.innerHTML = "⚽";
        ball.style.cssText = `
          position: fixed;
          font-size: ${20 + Math.random() * 30}px;
          left: ${Math.random() * 100}%;
          top: -50px;
          z-index: 9998;
          pointer-events: none;
          animation: ballFall ${2 + Math.random() * 2}s linear forwards;
          opacity: ${0.6 + Math.random() * 0.4};
        `;
        document.body.appendChild(ball);
        const timer = setTimeout(() => {
          if (!cancelled) ball.remove();
        }, (2.5 + Math.random() * 2) * 1000);
        timers.push(timer); // ✅ Track timer
      }
    };

    // Ajouter animation CSS si pas existante
    if (!document.getElementById("ballFallStyle")) {
      const style = document.createElement("style");
      style.id = "ballFallStyle";
      style.innerHTML = `
        @keyframes ballFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          50% { transform: translateY(50vh) rotate(180deg); opacity: 0.8; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    // Lancer 3 vagues de ballons
    createBallAnimation();
    const timer1 = setTimeout(() => { if (!cancelled) createBallAnimation(); }, 400);
    const timer2 = setTimeout(() => { if (!cancelled) createBallAnimation(); }, 800);
    timers.push(timer1, timer2);

    return () => { 
      cancelled = true;
      timers.forEach(t => clearTimeout(t)); // ✅ Cleanup all timers
    };
  }, [eggActive]);

  // ── PENALTY MULTI-ROUND : résolution auto quand les deux joueurs ont posé leur pick ──
  useEffect(() => {
    if (!penChallengeId) return;
    const ch = (st.challenges||{})[penChallengeId];
    if (!ch || ch.game!=="penalty" || ch.status!=="active") return;
    if (ch.shotFrom !== undefined) return; // ancien format — ne pas toucher
    const pick = ch.pick || {};
    const tireur = ch.tireur;
    if (!tireur) return;
    const gardien = ch.from===tireur ? ch.to : ch.from;
    if (!pick[tireur] || !pick[gardien]) return;
    const kickKey = `${penChallengeId}_k${(ch.kicks||[]).length}`;
    if (penAnimRef.current === kickKey) return;
    penAnimRef.current = kickKey;
    const goal = pick[tireur] !== pick[gardien];
    const kicks = [...(ch.kicks||[]), {tireur, gardien, tp:pick[tireur], gp:pick[gardien], goal, ts:Date.now()}];
    const fromGoals = kicks.filter(k=>k.tireur===ch.from&&k.goal).length;
    const toGoals   = kicks.filter(k=>k.tireur===ch.to  &&k.goal).length;
    const done = kicks.length >= 6;
    const nextTireur = done ? null : (tireur===ch.from ? ch.to : ch.from);
    const winner = done ? (fromGoals>toGoals?ch.from:fromGoals<toGoals?ch.to:null) : null;
    const newCh = {...ch, kicks, pick:{}, tireur:nextTireur, fromGoals, toGoals, status:done?"done":"active", winner};
    if (done) {
      const DAILY_LIMIT_LOCAL = 999; // pas de limite quotidienne
      const gptl0 = st.gamePlaysToday || {};
      const wdc0 = winner ? (((gptl0.penalty||{})[winner]?.date===todayKey()) ? (gptl0.penalty[winner].count||0) : 0) : 0;
      const winCapped = winner ? wdc0 >= DAILY_LIMIT_LOCAL : false;
      setSt(prev => {
        const gs=prev.gameScores||{}, gst=prev.gameScoresTotal||{};
        const pp=gs.penalty||{}, ppt=gst.penalty||{};
        const gh=prev.gameHistory||{}, ts=Date.now();
        const gptl = prev.gamePlaysToday || {};
        const wdc = winner ? (((gptl.penalty||{})[winner]?.date===todayKey()) ? (gptl.penalty[winner].count||0) : 0) : 0;
        const newPlaysToday = winner ? {...gptl, penalty:{...(gptl.penalty||{}),[winner]:{date:todayKey(),count:wdc+1}}} : prev.gamePlaysToday;
        const mkE=(won,opp)=>({game:"penalty",score:won?1:0,mode:"defi",opponent:opp,won:won?"win":"loss",ts});
        const ns = {...prev,
          gamePlaysToday: newPlaysToday,
          challenges:{...(prev.challenges||{}),[penChallengeId]:newCh},
          gameScores:    (winner&&!winCapped)?{...gs,penalty:{...pp,[winner]:(pp[winner]||0)+1}}:gs,
          gameScoresTotal:(winner&&!winCapped)?{...gst,penalty:{...ppt,[winner]:(ppt[winner]||0)+1}}:gst,
          gameHistory:{...gh,
            [ch.from]:[...(gh[ch.from]||[]),mkE(winner===ch.from,ch.to)].slice(-50),
            [ch.to]:  [...(gh[ch.to]  ||[]),mkE(winner===ch.to,  ch.from)].slice(-50),
          },
        };
        // ⚠️ Pas de persistFirebase(ns) ici — il écraserait users/predictions/results
        // avec l'état local potentiellement périmé. Écriture scopée uniquement :
        if (_fbReady) {
          const scopedUpdates = {
            [`challenges/${penChallengeId}`]: newCh,
            gamePlaysToday: ns.gamePlaysToday,
            gameScores: ns.gameScores,
            gameScoresTotal: ns.gameScoresTotal,
            [`gameHistory/${ch.from}`]: ns.gameHistory[ch.from],
            [`gameHistory/${ch.to}`]:   ns.gameHistory[ch.to],
          };
          _fbUpdate("/", scopedUpdates);
        }
        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
        return ns;
      });
      if (winner===user&&winCapped) showNotif("info","⏳ Limite quotidienne atteinte — victoire non comptabilisée.");
    } else {
      setSt(prev => {
        const ns = {...prev, challenges:{...(prev.challenges||{}),[penChallengeId]:newCh}};
        // Écriture scopée uniquement — pas de persistFirebase pour éviter d'écraser users/predictions
        if (_fbReady) _fbUpdate(`/challenges/${penChallengeId}`, newCh);
        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
        return ns;
      });
    }
  }, [penChallengeId, st.challenges]);

  // ── PENALTY SOLO : curseur joueur animé ──
  useEffect(() => {
    const soloRole = penShots.length%2===0 ? "tireur" : "gardien";
    const on = activeGame==="penalty" && gameMode==="solo" && penPhase==="shoot" && penShots.length<6;
    if (!on) { clearInterval(penCursorIntervalRef.current); penCursorIntervalRef.current=null; return; }
    if (!penCursorStartRef.current) penCursorStartRef.current = Date.now();
    const H=soloRole==="tireur"?1800:1500, V=soloRole==="tireur"?2700:2200;
    penCursorIntervalRef.current = setInterval(()=>{
      const t=Date.now()-penCursorStartRef.current;
      const tH=(t%H)/H, tV=(t%V)/V;
      setPenCursorPos({x:12+(tH<.5?tH*2:2-tH*2)*76, y:12+(tV<.5?tV*2:2-tV*2)*56});
    },40);
    return ()=>{ clearInterval(penCursorIntervalRef.current); penCursorIntervalRef.current=null; };
  }, [activeGame, gameMode, penPhase, penShots.length]);

  // ── PENALTY SOLO : curseur IA animé + difficulté aléatoire par tir ──
  useEffect(() => {
    const on = activeGame==="penalty" && gameMode==="solo" && penPhase==="shoot" && penShots.length<6;
    if (!on) { clearInterval(penAiIntervalRef.current); penAiIntervalRef.current=null; return; }
    if (!penAiStartRef.current) {
      penAiStartRef.current = Date.now()+600;
      const DIFFS=[
        {label:"😌 Facile",   HA:2200,VA:3100,color:"#22c55e"},
        {label:"🙂 Normal",   HA:1600,VA:2400,color:GOLD},
        {label:"😤 Difficile",HA:1050,VA:1550,color:"#f97316"},
        {label:"😱 Très dur", HA:700, VA:1000,color:"#ef4444"},
      ];
      const weights=[0.25,0.40,0.25,0.10];
      let r=Math.random(), idx=0;
      for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0){idx=i;break;}}
      setPenDifficulty(DIFFS[idx]);
    }
    const HA=penDifficulty?.HA??1600, VA=penDifficulty?.VA??2400;
    penAiIntervalRef.current = setInterval(()=>{
      const t=Date.now()-penAiStartRef.current;
      const tH=(t%HA)/HA, tV=(t%VA)/VA;
      setPenAiCursorPos({x:12+(tH<.5?tH*2:2-tH*2)*76, y:12+(tV<.5?tV*2:2-tV*2)*56});
    },40);
    return ()=>{ clearInterval(penAiIntervalRef.current); penAiIntervalRef.current=null; };
  }, [activeGame, gameMode, penPhase, penShots.length, penDifficulty]);

  // Enregistre le score dans le défi en cours une fois la partie terminée (quiz/quisuisje/plusmoins/toptrumps)
  useEffect(() => {
    if (gamePhase !== "result" || !activeChallengeId) return;
    const ch = (st.challenges||{})[activeChallengeId];
    if (!ch) return;
    const isFromSide = ch.from === user;
    const already = isFromSide ? ch.fromScore !== null : ch.toScore !== null;
    if (already) return;
    const updated = {...ch, [isFromSide?"fromScore":"toScore"]: qScore, ...(ch.game==="mystere" ? {[isFromSide?"fromGuess":"toGuess"]: mysteryLastGuess} : {})};
    const bothDone = updated.fromScore !== null && updated.toScore !== null;
    if (bothDone) updated.status = "done";

    // ── Historique : enregistrer la partie de défi ──
    const gameHistoryAll = st.gameHistory || {};
    const userHistory = gameHistoryAll[user] || [];
    const oppName = isFromSide ? ch.to : ch.from;
    const myScore = qScore;
    const oppScore = isFromSide ? ch.toScore : ch.fromScore;
    // won = null si l'adversaire n'a pas encore joué, sinon true/false/draw
    const won = bothDone
      ? (isFromSide ? (updated.fromScore > updated.toScore ? "win" : updated.fromScore < updated.toScore ? "loss" : "draw")
                    : (updated.toScore > updated.fromScore ? "win" : updated.toScore < updated.fromScore ? "loss" : "draw"))
      : null;
    const newEntry = { game: ch.game, score: myScore, mode: "defi", opponent: oppName, won, ts: Date.now() };
    const cappedHistory = [...userHistory, newEntry].slice(-50);

    // ── Si les deux joueurs ont joué, mettre à jour l'entrée won=null de l'adversaire ──
    let updatedGameHistory = { ...gameHistoryAll, [user]: cappedHistory };
    if (bothDone) {
      const oppWon = won==="win"?"loss":won==="loss"?"win":"draw";
      const oppHistRaw = [...(gameHistoryAll[oppName]||[])];
      const oppEntryIdx = oppHistRaw.map((h,i)=>({h,i})).reverse()
        .find(({h})=>h.mode==="defi"&&h.game===ch.game&&h.opponent===user&&h.won===null);
      if (oppEntryIdx) {
        oppHistRaw[oppEntryIdx.i] = {...oppEntryIdx.h, won:oppWon};
        updatedGameHistory = {...updatedGameHistory, [oppName]: oppHistRaw.slice(-50)};
      }
    }

    recentChallengeWritesRef.current[activeChallengeId] = { data: updated, ts: Date.now() };
    setSt(prev => {
      const ns = {...prev,
        challenges:{...(prev.challenges||{}), [activeChallengeId]: updated},
        gameHistory: updatedGameHistory,
      };
      // ⚠️ NE JAMAIS appeler persistFirebase(ns) ici : ça réécrirait TOUT l'état
      // (predictions, results, validatedGroups, scores...) avec la copie locale
      // de CE client, potentiellement périmée — ce qui pouvait effacer les
      // pronostics tout juste validés par un autre joueur en train de jouer
      // à un mini-jeu en même temps. Écritures scopées uniquement.
      if (_fbReady) {
        _fbUpdate(`/challenges/${activeChallengeId}`, updated); // protection scopée anti-écrasement
        _fbUpdate("/gameHistory", updatedGameHistory);
      }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
  }, [gamePhase, activeChallengeId, qScore]);

  const save = useCallback(ns => { 
    setSt(ns);
    persistFirebase(ns);
  }, []);

  // ── Nettoyage des défis "penalty" mal formés (séquelles d'un bug désormais
  // corrigé : le bouton générique "Défier quelqu'un" pouvait créer un défi
  // penalty sans roleFrom/roleTo, qui plantait l'écran à l'affichage). On ne
  // supprime que les entrées clairement corrompues (penalty + pas terminé +
  // sans roleFrom), via une écriture Firebase atomique scopée par clé.
  useEffect(() => {
    if (!FB_ENABLED || !_fbReady) return;
    const all = st.challenges || {};
    const badIds = Object.entries(all)
      .filter(([,c]) => c.game==="penalty" && c.status!=="done" && !c.roleFrom && c.tireur===undefined)
      .map(([id]) => id);
    if (!badIds.length) return;
    const updates = {};
    badIds.forEach(id => { updates[`challenges/${id}`] = null; });
    _fbUpdate("/", updates).catch(e => console.warn("Nettoyage défis penalty corrompus — erreur:", e));
  }, [st.challenges]);

  // ── FOOTBALLEUR MYSTÈRE : récupère la VRAIE photo du joueur, en direct,
  // via l'API publique officielle de Wikipedia — ce sont de vraies photos de
  // presse/portrait hébergées sur Wikipedia, pas des images générées.
  // Deux méthodes essayées dans l'ordre :
  //  1) fetch() + origin=* (méthode standard documentée par MediaWiki pour le CORS)
  //  2) repli JSONP via <script> (contourne CORS/CSP connect-src entièrement)
  // On essaie le wiki anglais puis, en repli, le wiki français.
  // Retourne { url, error } — error est une étiquette courte affichée dans
  // l'UI (sans console) si la photo ne charge pas, pour pouvoir diagnostiquer
  // depuis un mobile : "fetch-blocked" (réseau/CORS/CSP), "jsonp-blocked"
  // (même le repli a échoué), "no-image" (Wikipedia n'a pas de photo pour ce
  // titre), "http-xxx" (erreur HTTP).
  const fetchMysteryPhoto = useCallback(async (player) => {
    const cached = photoCacheRef.current[player.id];
    if (cached !== undefined) return cached;
    let lastError = null;
    const tryLang = async (lang, title) => {
      const base = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=500&redirects=1`;
      try {
        const res = await fetch(`${base}&origin=*`);
        if (res.ok) {
          const data = await res.json();
          const page = Object.values(data?.query?.pages || {})[0];
          if (page?.thumbnail?.source) return page.thumbnail.source;
          lastError = "no-image";
          return null;
        }
        lastError = `http-${res.status}`;
      } catch(e) {
        lastError = "fetch-blocked";
      }
      try {
        const data = await jsonpRequest(base);
        const page = Object.values(data?.query?.pages || {})[0];
        if (page?.thumbnail?.source) return page.thumbnail.source;
        lastError = lastError || "no-image";
      } catch(e) {
        lastError = lastError || "jsonp-blocked";
      }
      return null;
    };
    let url = await tryLang("en", player.wiki);
    if (!url && player.wikiFr) url = await tryLang("fr", player.wikiFr);
    if (!url) url = await tryLang("fr", player.name); // dernier repli : nom tel quel sur le wiki FR
    const result = { url: url || null, error: url ? null : (lastError || "unknown") };
    photoCacheRef.current[player.id] = result;
    return result;
  }, []);

  // ── Photos des cartes Buteur / Top Trumps : réutilise fetchMysteryPhoto
  // (même cache, même repli EN→FR→JSONP) à partir du simple nom affiché sur
  // la carte. Résultat stocké dans cardPhotos, partagé entre les 2 jeux.
  const ensureCardPhoto = useCallback((name) => {
    if (cardPhotos[name] !== undefined || cardPhotoInFlightRef.current.has(name)) return;
    cardPhotoInFlightRef.current.add(name);
    fetchMysteryPhoto({ id:name, wiki:wikiTitleFor(name), name }).then(({url}) => {
      cardPhotoInFlightRef.current.delete(name);
      setCardPhotos(prev => ({...prev, [name]: url || false}));
    });
  }, [cardPhotos, fetchMysteryPhoto]);

  useEffect(() => {
    if (ttCard1) ensureCardPhoto(ttCard1.name);
    if (ttCard2) ensureCardPhoto(ttCard2.name);
  }, [ttCard1, ttCard2, ensureCardPhoto]);

  useEffect(() => {
    if (buteurWinner) ensureCardPhoto(buteurWinner.name);
    if (buteurDeck[0]) ensureCardPhoto(buteurDeck[0].name);
  }, [buteurWinner, buteurDeck, ensureCardPhoto]);

  // ── Marque les messages comme lus EN CONTINU tant qu'on est sur l'onglet Chat ──
  // (avant, le "vu" n'était mis à jour qu'au clic sur l'onglet : si de nouveaux
  // messages arrivaient en temps réel pendant qu'on lisait déjà le chat, le
  // compteur restait périmé et la pastille verte réapparaissait dès qu'on
  // changeait d'onglet, même sans rien avoir manqué)
  useEffect(() => {
    if (tab !== "chat") return;
    const chatRole2 = (st.users[user]||{}).role;
    const myChatGroups = (user==="admin") ? ["famille","collegues","externe"]
      : (chatRole2==="famille"||chatRole2==="collegues"||chatRole2==="externe" ? [chatRole2] : []);
    if (!myChatGroups.length) return;
    const seenForUser = (st.seenChat||{})[user];
    const seenObj = (typeof seenForUser==="object" && seenForUser) ? seenForUser : {};
    const updated = {...seenObj};
    let changed = false;
    myChatGroups.forEach(g => {
      const len = ((st.chat||{})[g]||[]).length;
      if (updated[g] !== len) { updated[g] = len; changed = true; }
    });
    if (changed) {
      const ns = {...st, seenChat:{...(st.seenChat||{}),[user]:updated}};
      // 🛡️ Mise à jour locale immédiate (pour faire disparaître le badge "non lu")
      setSt(ns);
      persist(ns);
      // 🛡️ Écriture Firebase ATOMIQUE : on ne touche QUE seenChat/<user>, jamais le
      // reste de l'état (scores, results, etc.). Avant ce fix, ceci passait par
      // save() qui réécrivait TOUT st — si un autre changement (ex: l'admin qui
      // vient de saisir un score) n'avait pas encore atteint ce client au moment
      // où un message de chat arrivait, ce save() ré-écrivait un st.scores périmé
      // et effaçait silencieusement le score tout juste saisi par l'admin.
      if (FB_ENABLED && _fbReady) {
        _fbUpdate("/", { [`seenChat/${user}`]: updated }).catch(e => console.warn("seenChat Firebase write error:", e));
      }
    }
  }, [tab, st.chat, user]);

  // ═══ ACCESSIBILITY HELPERS ═══
  const a11y = {
    btnLogin: {
      "aria-label": "Se connecter",
      tabIndex: 0,
      role: "button"
    },
    btnLogout: {
      "aria-label": "Se déconnecter",
      tabIndex: 0
    },
    btnValidate: {
      "aria-label": `Valider le groupe ${grp}`,
      tabIndex: 0
    },
    inputField: {
      "aria-label": "Champ de saisie",
      tabIndex: 0
    },
    trophyBtn: {
      "aria-label": "Afficher le trophée 3D",
      tabIndex: 0,
      role: "button"
    },
    eggTrophy: {
      "aria-label": `Cliquer pour le secret (${eggClicks}/5)`,
      tabIndex: 0,
      role: "button"
    }
  };
  
  const role   = st.users[user]?.role;
  const locked = !!st.finalLock[user];
  const preds  = st.predictions[user] || {};
  const userThirds = (st.thirdPicks||{})[user] || {}; // choix des meilleurs 3es du joueur
  const scores = calcScores(st);
  
  // ═══ MEMOIZED SELECTORS FOR PERFORMANCE ═══
  const groupMatches = useMemo(() => 
    MATCHES.filter(m => m.group === grp && m.phase === "poules"),
    [grp]
  );
  
  const elimMatches = useMemo(() =>
    MATCHES.filter(m => m.phase === "seiziemes"),
    []
  );
  
  const quarterMatches = useMemo(() =>
    MATCHES.filter(m => m.phase === "quarts"),
    []
  );
  
  const currentPhaseMatches = useMemo(() => {
    if (aPhase === "poules") return groupMatches;
    return MATCHES.filter(m => m.phase === ePhase && m.group === "ELIM");
  }, [aPhase, ePhase, groupMatches]);
  const today  = todayKey();

  // Résout un nom d'équipe pour l'affichage côté joueur :
  // 1) résultats officiels admin (avec scores réels pour tiebreakers)
  // 2) pronos du joueur (fallback)
  // 3) pour "3e X" : thirdPick du joueur + standings selon ses pronos
  function resolveForPlayer(team, matchId, side) {
    const sc = st.scores || {};
    const off = resolveTeam(team, st.results||{}, sc, st.officialThirds||{});
    if (FLAGS[off]) return off;                          // résolu officiellement ✓

    if (team.startsWith("3e ")) {
      const offThirds  = st.officialThirds || {};
      const pg = matchId && side
        ? (offThirds[matchId+"_"+side] || userThirds[matchId+"_"+side])
        : null;
      if (pg) {
        const s1 = groupStandings(pg, st.results||{}, sc);
        if (s1[2] && FLAGS[s1[2]]) return s1[2];        // résultat officiel du 3e
        const s2 = groupStandings(pg, preds, {});
        if (s2[2] && FLAGS[s2[2]]) return s2[2];        // 3e selon les pronos joueur
        return `3e ${pg}`;
      }
      return team;                                       // groupe pas encore choisi
    }

    // Équipes éliminatoires (V. R1, V. Q1…) → chaîne de résolution via pronos
    const withPred = resolveTeam(team, preds, {}, st.officialThirds||{});
    if (FLAGS[withPred]) return withPred;

    // Si "X ou Y" trop verbeux → retourner juste le placeholder original
    if (off && off.includes(" ou ")) return team;
    return off;                                          // non résolu (À déterm.)
  }

  // Version calendrier : uniquement résultats officiels admin, jamais les pronos joueur
  // Garantit que les affiches éliminatoires n'apparaissent pas avant confirmation admin
  function resolveForCalendar(team, matchId, side) {
    const sc  = st.scores  || {};
    const res = st.results || {};
    const off = resolveTeam(team, res, sc, st.officialThirds||{});
    if (FLAGS[off]) return off;                          // résolu officiellement ✓

    // "3e XXXXX" : utiliser uniquement le pick officiel de l'admin
    if (team.startsWith("3e ")) {
      const offThirds = st.officialThirds || {};
      const pg = matchId && side ? offThirds[matchId+"_"+side] : null;
      if (pg) {
        const s = groupStandings(pg, res, sc);
        if (s[2] && FLAGS[s[2]]) return s[2];
      }
      return team;                                       // pas encore officiel
    }

    // Non résolu → rendre le placeholder lisible
    // "V. R3" → "Vainq. 1/16 #3", "V. Q2" → "Vainq. 1/8 #2", etc.
    if (off.startsWith("V. R")) return `Vainq. 1/16 #${off.slice(4)}`;
    if (off.startsWith("V. Q")) return `Vainq. 1/8 #${off.slice(4)}`;
    if (off.startsWith("V. SF")) return `Vainq. 1/4 #${off.slice(5)}`;
    if (off.startsWith("V. S")) return `Vainq. 1/2 #${off.slice(4)}`;
    if (off.match(/^Vainqueur SF\d+$/)) return "Vainq. 1/2 finale";
    if (off.match(/^Perdant SF\d+$/)) return "Perdant 1/2 finale";
    return off;
  }

  // Musique selon l'écran
  useEffect(() => {
    if (scr === "login") {
      stopBgMusic();
      // Ne pas tenter de jouer au montage — le contexte sera suspended
      // La musique démarre au premier clic via handleLoginInteraction
    } else if (scr === "app") {
      stopLoginMusic();
      // Si une partie de jeu est en cours, ne pas écraser sa musique dédiée
      // avec la musique de fond classique (sinon silence/coupure ressentie
      // par le joueur en changeant d'onglet pendant une partie) ──
      if (activeGame && gamePhase === "playing") return;
      if (!_isMuted) {
        if (musicSource === "mp3") {
          mp3LoopMode = playMode === "loop";
          setTimeout(() => playMp3(mp3Idx, mp3LoopMode), 400);
        } else {
          currentTrackIdx = trackIdx;
          setTimeout(() => { try { _getMusicCtx(); playBgMusic(); } catch(e){} }, 400);
        }
      }
    } else {
      stopAllMusic();
    }
  }, [scr]);

  // ═══ COMPONENT MOUNT - Initialize _isMuted ═══
  useEffect(() => {
    _isMuted = muted; // Initialize on mount
  }, []);

  // ═══ SYNCHRONIZE GLOBAL _isMuted WITH REACT STATE ═══
  useEffect(() => {
    _isMuted = muted; // Sync global variable with React state
  }, [muted]);

  // Premier clic sur la page login → démarre la musique si pas encore lancée
  const handleLoginInteraction = useCallback(() => {
    if (scr !== "login") return;
    if (muted || _isMuted) return; // Check both
    if (loginMusicPlaying) return;
    
    try {
      playLoginMusic(); // Appel direct, pas besoin de compliqué
    } catch(e) {
      console.error("Login music error:", e);
    }
  }, [scr, muted]);

  // ── Tick chaque seconde pour les countdowns (login + accueil)
  useEffect(() => {
    if (scr !== "login" && !(scr === "app" && tab === "home") && !pronoReminder) return;
    const interval = setInterval(() => setTick(t=>t+1), 1000);
    return () => clearInterval(interval);
  }, [scr, tab, pronoReminder]);

  // ── Modale de rappel de pronostic : affichée à chaque connexion tant que
  // le joueur n'a pas validé la phase éliminatoire en cours
  useEffect(() => {
    if (scr !== "app" || !user || user === "admin") return;
    const now = new Date();
    const validated = st.validatedGroups[user] || [];
    const elimUnlocked = st.elimUnlocked || [];
    // Cherche la première phase déverrouillée par l'admin dont la deadline
    // n'est pas encore passée ET que le joueur n'a pas encore validée
    const active = ELIM_REMINDERS.find(r =>
      elimUnlocked.includes(r.phase) &&
      now < new Date(r.deadline) &&
      !validated.includes(r.valKey)
    );
    if (active) setPronoReminder(active.phase);
  }, [scr, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll en haut à chaque changement d'onglet, de groupe, ou de sous-écran jeux
  // (le scroll réel se fait sur contentRef, pas sur window/body — le shell racine
  // est en height:100vh + overflow:hidden, donc window.scrollTo ne servait à rien)
  useEffect(() => {
    contentRef.current?.scrollTo({top:0, behavior:"smooth"});
  }, [tab, grp, ePhase, jeuxSubTab, gamePhase, activeGame]);

  // (La relance de la musique de jeu après changement d'onglet se fait au moment
  // du clic sur la nav elle-même — voir onClick du bottom nav — car sur mobile,
  // un AudioContext suspendu ne peut être repris que depuis un vrai geste
  // utilisateur, pas depuis un setInterval/setTimeout en arrière-plan.)

  // ── LOGIN ──
  function doLogin() {
    // Filet de sécurité : repart toujours d'un écran jeux propre, même si
    // doLogout n'a pas été appelé proprement (changement de session forcé, etc.)
    setActiveGame(null); setGamePhase("menu"); setChallengePicker(null);
    setChallengeTarget(null); setPenChallengeId(null); setActiveChallengeId(null);

    const u = uname.trim().toLowerCase();
    if (!u) { showNotif("error", "❌ Entre ton pseudo"); return; }
    if (u === "admin") {
      if (pw !== "2026") { showNotif("error", "❌ Mot de passe incorrect"); return; }
      // ⚠️ Ne pas save(ns) avec tout l'état — écriture atomique uniquement sur users/admin
      setSt(prev => {
        const ns = {...prev, users:{...prev.users, admin:{role:"admin"}}};
        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
        return ns;
      });
      if (_fbReady) _fbUpdate("/users/admin", {role:"admin"});
      soundLogin(); stopLoginMusic(); localStorage.setItem("APP_VERSION", APP_VERSION); setUser("admin");
      seen.current = new Set(Object.keys(st.seenAnim||{}));
      showNotif("success", "✅ Connecté en tant qu'Admin");
      setTab("home"); setScr("app"); return;
    }

    const existingUser = st.users[u];

    // ── Nouveau joueur ──
    if (!existingUser) {
      if (!pw) { showNotif("error", "❌ Choisis un mot de passe"); return; }
      if (pw.length < 4) { showNotif("error", "❌ Mot de passe trop court (min 4 caractères)"); return; }
      if (pw !== (login.pwConfirm||"")) { showNotif("error", "❌ Les mots de passe ne correspondent pas"); return; }
      if (!fname.trim()) { showNotif("error", "❌ Ton prénom est obligatoire"); return; }
      if (!lname.trim()) { showNotif("error", "❌ Ton nom est obligatoire"); return; }
      const newUserData = {role:"waiting", pw, fname, lname};
      setSt(prev => {
        const ns = {...prev, users:{...prev.users, [u]: newUserData}};
        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
        return ns;
      });
      // Écriture scopée sur ce seul nouveau compte : ne touche jamais aux
      // comptes des autres joueurs, même si un autre événement (approbation
      // admin d'un autre joueur, etc.) survient au même instant.
      if (_fbReady) { _fbUpdate(`/users/${u}`, newUserData); trackWrite(`users.${u}`, newUserData); }
      localStorage.setItem("APP_VERSION", APP_VERSION); setUser(u);
      soundLogin(); stopLoginMusic();
      seen.current = new Set(Object.keys(st.seenAnim||{}));
      setLogin({uname: "", pw: "", pwConfirm: "", fname: "", lname: ""}); // Reset fields
      setScr("waiting");
      showNotif("info", "⏳ Compte créé ! En attente d'assignation par l'admin");
      return;
    }

    // ── Joueur existant sans mot de passe (première connexion) ──
    if (!existingUser.pw) {
      // Première connexion : doit créer un mot de passe (peu importe si assigné ou pas)
      if (!pw) { showNotif("error", "❌ Première connexion : choisis un mot de passe"); return; }
      if (pw.length < 4) { showNotif("error", "❌ Mot de passe trop court (min 4 caractères)"); return; }
      if (pw !== (login.pwConfirm||"")) { showNotif("error", "❌ Les mots de passe ne correspondent pas"); return; }
      if (!fname.trim() && !existingUser.fname) { showNotif("error", "❌ Ton prénom est obligatoire"); return; }
      if (!lname.trim() && !existingUser.lname) { showNotif("error", "❌ Ton nom est obligatoire"); return; }
      const updatedUserData = {...existingUser, pw, fname: fname || existingUser.fname, lname: lname || existingUser.lname};
      setSt(prev => {
        const prevExisting = prev.users[u] || existingUser;
        const merged = {...prevExisting, pw, fname: fname || prevExisting.fname, lname: lname || prevExisting.lname};
        const ns = {...prev, users:{...prev.users, [u]: merged}};
        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
        return ns;
      });
      if (_fbReady) _fbUpdate(`/users/${u}`, updatedUserData);
      localStorage.setItem("APP_VERSION", APP_VERSION); setUser(u);
      soundLogin(); stopLoginMusic();
      seen.current = new Set(Object.keys(st.seenAnim||{}));
      setLogin({uname: "", pw: "", pwConfirm: "", fname: "", lname: ""}); // Reset fields
      showNotif("success", "✅ Mot de passe créé !");
      if (updatedUserData.role === "waiting") { setScr("waiting"); return; }
      setTab("home"); setScr("app"); return;
    }

    // ── Joueur existant avec mot de passe ──
    if (!pw) { showNotif("error", "❌ Entre ton mot de passe"); return; }
    if (pw !== existingUser.pw) { showNotif("error", "❌ Mot de passe incorrect"); return; }

    // ⚠️ NE PAS appeler save(ns) ici — écrire tout l'état Firebase à la connexion
    // écrase les données récentes (rôles, résultats, pronos) avec la version locale
    // potentiellement périmée. On se contente de noter la version et de passer à l'app.
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch(e) {}
    localStorage.setItem("APP_VERSION", APP_VERSION); setUser(u);
    soundLogin(); stopLoginMusic();
    seen.current = new Set(Object.keys(st.seenAnim||{}));
    // Mémoriser les identifiants si demandé
    if (rememberMe) localStorage.setItem("cdm2026_remember", JSON.stringify({uname: u, pw}));
    else localStorage.removeItem("cdm2026_remember");
    setLogin({uname: "", pw: "", pwConfirm: "", fname: "", lname: "", showPw: false, showPwConfirm: false, rememberMe: false});
    if (st.users[u].role === "waiting") {
      setScr("waiting");
      showNotif("info", "⏳ En attente d'assignation par l'admin");
    } else {
      showNotif("success", `✅ Bienvenue ${u} !`);
      setTab("home"); setScr("app");
    }
  }

  function doLogout() {
    stopAllMusic();
    _isMuted = false;
    setAudio(a => ({...a, muted: false}));
    // ── Reset complet des états jeux — sinon ils "fuitent" vers la session
    // du joueur suivant qui se connecte sur le même appareil (ex : écran de
    // sélection d'adversaire qui réapparaît tout seul) ──
    setActiveGame(null); setGamePhase("menu"); setJeuxSubTab("jouer"); setGameMode(null);
    setPenOrdiPhase("choose"); setPenOrdiRole(null); setPenOrdiPick(null); setPenOrdiCpu(null); setPenOrdiScore({player:0,cpu:0,round:1,total:5});
    setScoresSubTab("pronos"); setGroupPronoPlayer(null); setStatsMatchPlayer(null);
    setTab("home");
    setChallengePicker(null); setChallengeTarget(null);
    setPenChallengeId(null); setActiveChallengeId(null); setTtChallengeQueue(null);
    setQIdx(0); setQScore(0); setAnswered(null); setShowFact(false);
    setIndiceIdx(0); setGuessInput(""); setGuessResult(null);
    setQsjQ([]); setQuizSet([]);
    setPmQ([]); setPmIdx(0); setPmInput(""); setPmAnswered(false); setPmTotal(0);
    setTtCard1(null); setTtCard2(null); setTtRound(0); setTtWins(0); setTtReveal(null);
    setPenShots([]); setPenPhase("shoot"); setPenZonePick(null); setPenRevealStage("none");
    setButeurWinner(null); setButeurDeck([]); setButeurPick(null); setButeurDone(false);
    // Ne pas effacer le "Se souvenir" au logout — l'utilisateur a demandé à être mémorisé
    setUser(""); setUname(""); setPw(""); setLogin(l => ({...l, uname: l.rememberMe ? l.uname : "", pw: l.rememberMe ? l.pw : "", pwConfirm:"", fname:"", lname:""})); setScr("login");
  }

  // ── MODERATION ──
  function deleteMessage(group, idx) {
    const msgs = st.chat?.[group] || [];
    const msg = msgs[idx];
    const updated = msgs.filter((_, i) => i !== idx);
    const ns = {...st, chat: {...(st.chat||{}), [group]: updated}};
    setSt(ns);
    persist(ns);
    if (FB_ENABLED && _fbReady && msg?._key) {
      _fbUpdate("/", { [`chat/${group}/${msg._key}`]: null }).catch(e => console.warn("Delete chat msg error:", e));
    } else if (FB_ENABLED && _fbReady) {
      // Fallback (ancien format sans _key) — écriture scopée sur ce seul groupe de
      // chat, jamais un save(ns) global qui écraserait pronostics/résultats/etc.
      _fbUpdate("/", { [`chat/${group}`]: updated }).catch(e => console.warn("Delete chat msg error:", e));
    }
    showNotif("success", "✅ Message supprimé");
  }

  function deleteMatchComment(matchId, group, idx) {
    const matchData = st.matchComments?.[matchId] || {};
    const comments = matchData[group] || [];
    const msg = comments[idx];
    const updated = comments.filter((_, i) => i !== idx);
    const ns = {...st, matchComments: {...st.matchComments, [matchId]: {...matchData, [group]: updated.length > 0 ? updated : []}}};
    setSt(ns);
    persist(ns);
    if (FB_ENABLED && _fbReady && msg?._key) {
      _fbUpdate("/", { [`matchComments/${matchId}/${group}/${msg._key}`]: null }).catch(e => console.warn("Delete match comment error:", e));
    } else if (FB_ENABLED && _fbReady) {
      // Fallback (ancien format sans _key) — écriture scopée sur ce seul match/groupe,
      // jamais un save(ns) global qui écraserait pronostics/résultats/etc.
      _fbUpdate("/", { [`matchComments/${matchId}/${group}`]: updated }).catch(e => console.warn("Delete match comment error:", e));
    }
    showNotif("success", "✅ Commentaire supprimé");
  }

  // ── PICK ──
  function pick(id, val) {
    if (locked) return;
    soundClick();
    let scopedPreds = null;
    setSt(prev => {
      const prevPreds = prev.predictions?.[user] || {};
      const updatedPreds = {...prevPreds, [id]:val};
      scopedPreds = updatedPreds;
      const ns = {...prev, predictions:{...prev.predictions, [user]:updatedPreds}};
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    // Écriture scopée sur ce seul joueur : ne touche JAMAIS aux pronostics des
    // autres joueurs, ni aux scores/validations en cours (ex: l'admin qui entre
    // un résultat exactement au même instant, ou un autre joueur qui valide une
    // phase élim comme les demis).
    if (_fbReady) { _fbUpdate(`/predictions/${user}`, {[id]: val}); trackWrite(`predictions.${user}.${id}`, val); }
  }

  // ── ADMIN: modifier les pronos d'un joueur ──
  function adminEditPred(targetUser, matchId, value) {
    setSt(prev => {
      const currentPreds = (prev.predictions||{})[targetUser] || {};
      const updatedUserPreds = { ...currentPreds, [matchId]: value };
      const ns = {
        ...prev,
        predictions: { ...(prev.predictions||{}), [targetUser]: updatedUserPreds },
      };
      // Écriture scopée sur ce seul joueur : ne touche jamais aux pronostics
      // des autres joueurs, même si l'état admin local est momentanément
      // en retard par rapport à une validation concurrente d'un autre joueur.
      if (_fbReady) { _fbUpdate(`/predictions/${targetUser}`, updatedUserPreds); trackWrite(`predictions.${targetUser}`, updatedUserPreds); }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    showNotif("success", `✅ Prono de ${targetUser.toUpperCase()} modifié`);
  }

  // ── ADMIN: modifier le pronostic FINALE d'un joueur (vainqueur/mode/score/buteurs) ──
  function adminEditFinalePrediction(targetUser, partial) {
    setSt(prev => {
      const prevAllPreds = prev.finaleData?.predictions || {};
      const prevUserPred = prevAllPreds[targetUser] || {};
      const updatedUserPred = { ...prevUserPred, ...partial };
      const ns = {
        ...prev,
        finaleData: { ...(prev.finaleData||{}), predictions: { ...prevAllPreds, [targetUser]: updatedUserPred } },
      };
      // Écriture scopée sur ce seul joueur : ne touche jamais aux pronostics
      // finale des autres joueurs.
      if (_fbReady) { _fbUpdate(`/finaleData/predictions/${targetUser}`, updatedUserPred); trackWrite(`finaleData.predictions.${targetUser}`, updatedUserPred); }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    showNotif("success", `✅ Prono finale de ${targetUser.toUpperCase()} modifié`);
  }


  function adminEditThird(targetUser, matchId, side, group) {
    const userThirds = (st.thirdPicks||{})[targetUser] || {};
    // Vérifier qu'un autre match n'a pas déjà ce groupe pour ce joueur
    const alreadyUsed = Object.entries(userThirds).some(([key, val]) => {
      const [mId] = key.split("_");
      return mId !== matchId && val === group;
    });
    if (alreadyUsed) {
      showNotif("error", `❌ Le groupe ${group} est déjà utilisé dans un autre match pour ${targetUser.toUpperCase()}`);
      return;
    }
    setSt(prev => {
      const prevUserThirds = (prev.thirdPicks||{})[targetUser] || {};
      const updatedUserThirds = { ...prevUserThirds, [matchId+"_"+side]: group };
      const ns = {
        ...prev,
        thirdPicks: { ...(prev.thirdPicks||{}), [targetUser]: updatedUserThirds },
      };
      if (_fbReady) { _fbUpdate(`/thirdPicks/${targetUser}`, updatedUserThirds); trackWrite(`thirdPicks.${targetUser}`, updatedUserThirds); }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    showNotif("success", `✅ 3e du groupe ${group} assigné à ${targetUser.toUpperCase()}`);
  }

  // ── 3e ÉQUIPE (sélection du groupe pour les seizièmes) ──
  function pickThird(matchId, side, group) {
    if (locked) return;
    const prevUserThirds    = (st.thirdPicks||{})[user] || {};
    const updatedUserThirds = { ...prevUserThirds, [matchId+"_"+side]: group };
    setSt(prev => {
      const ns = {...prev, thirdPicks:{...(prev.thirdPicks||{}), [user]: updatedUserThirds}};
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    if (_fbReady) { _fbUpdate(`/thirdPicks/${user}`, updatedUserThirds); trackWrite(`thirdPicks.${user}`, updatedUserThirds); }
  }
  function setOfficialThird(matchId, side, group) {
    // Vérifier que ce groupe n'est pas déjà utilisé ailleurs dans les seizièmes
    const officialThirds = st.officialThirds || {};
    const alreadyUsed = Object.entries(officialThirds).some(([key, val]) => {
      const [mId] = key.split("_");
      return mId !== matchId && val === group;
    });
    
    if (alreadyUsed) {
      showNotif("error", `❌ Le groupe ${group} est déjà utilisé dans un autre match !`);
      return;
    }
    
    const key = matchId+"_"+side;
    setSt(prev => {
      const updated = { ...(prev.officialThirds||{}), [key]: group };
      const ns = {...prev, officialThirds: updated};
      if (_fbReady) { _fbUpdate(`/officialThirds/${key}`, group); trackWrite(`officialThirds.${key}`, group); }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    showNotif("success", `✅ Groupe ${group} assigné`);
  }

  // ── VALIDATE GROUP ──
  function valGroup(g) {
    let alreadyDone = false;
    let scopedVG = null;
    setSt(prev => {
      const prevVal = prev.validatedGroups?.[user] || [];
      if (prevVal.includes(g)) { alreadyDone = true; return prev; }
      const updatedVG = [...prevVal,g];
      scopedVG = updatedVG;
      const ns = {...prev, validatedGroups:{...prev.validatedGroups, [user]:updatedVG}};
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    if (alreadyDone) return;
    if (scopedVG && _fbReady) { _fbUpdate("/validatedGroups", {[user]: scopedVG}); trackWrite(`validatedGroups.${user}`, scopedVG); }
    soundValidate(); celebrate("poules");
    showNotif("success", `✅ Groupe ${g} validé !`);
    // Auto-navigate to next group
    const idx = GROUPS.indexOf(g);
    if (idx >= 0 && idx < GROUPS.length - 1) {
      const nextGrp = GROUPS[idx + 1];
      setTimeout(() => setGrp(nextGrp), 500);
    }
  }

  function unvalGroup(g) {
    let scopedVG = null;
    setSt(prev => {
      const prevVal = prev.validatedGroups?.[user] || [];
      const updatedVG = prevVal.filter(x=>x!==g);
      scopedVG = updatedVG;
      const ns = {...prev, validatedGroups:{...prev.validatedGroups, [user]: updatedVG}};
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    if (scopedVG !== null && _fbReady) { _fbUpdate("/validatedGroups", {[user]: scopedVG}); trackWrite(`validatedGroups.${user}`, scopedVG); }
    showNotif("info", `✏️ Groupe ${g} déverrouillé — tu peux modifier tes pronos`);
  }
  // ── FINAL LOCK ──
  function doLock() {
    // On pose uniquement le verrou — validatedGroups reste intact (ce que le joueur a vraiment validé)
    // La navigation en lecture seule fonctionne via le bypass "locked || isPhaseUnlocked"
    setSt(prev => {
      const ns = { ...prev, finalLock: {...prev.finalLock, [user]: true} };
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    // Écriture scopée sur /finalLock uniquement : ne touche jamais aux pronostics
    // ou validations en cours des autres joueurs.
    if (_fbReady) { _fbUpdate("/finalLock", {[user]: true}); trackWrite(`finalLock.${user}`, true); }
    soundLock(); setModal(false); celebrate("finale");
  }

  // ── ADMIN ──
  function setRole(u,r) {
    let updatedUser = null;
    setSt(prev => {
      updatedUser = {...(prev.users[u]||{}), role:r};
      const ns = {...prev, users:{...prev.users,[u]:updatedUser}};
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    // Écriture scopée sur ce seul compte : ne touche jamais aux autres joueurs
    if (_fbReady) { _fbUpdate("/users", {[u]: updatedUser}); trackWrite(`users.${u}`, updatedUser); }
  }
  function setScore(id, side, val) {
    // Utilise setSt fonctionnel pour éviter la race condition :
    // deux saisies rapides (score dom puis ext) ne s'écrasent plus
    let scopedScore, scopedResult, scopedResultTs, resultDeleted = false;
    setSt(prev => {
      const cur = (prev.scores||{})[id] || {h:"", a:""};
      const updated = {...cur, [side]: val};
      const ns = {...prev, scores:{...(prev.scores||{}), [id]: updated}};
      const match = MATCHES.find(m=>m.id===id);
      const outcome = outcomeOf(updated, match?.phase !== "poules");
      ns.results = {...(prev.results||{})};
      if (outcome) {
        ns.results[id] = outcome;
        // Stocker le timestamp de saisie pour trier par ordre réel de saisie
        ns.resultTs = {...(prev.resultTs||{}), [id]: Date.now()};
        scopedResult = outcome; scopedResultTs = ns.resultTs[id];
      } else {
        delete ns.results[id];
        const ts2 = {...(prev.resultTs||{})};
        delete ts2[id];
        ns.resultTs = ts2;
        resultDeleted = true;
      }
      scopedScore = updated;
      if (updated.h && updated.a) {
        const homeTeam = resolveTeam(match.home, ns.results||{}, {}, ns.officialThirds||{});
        const awayTeam = resolveTeam(match.away, ns.results||{}, {}, ns.officialThirds||{});
        showNotif("success", `⚽ ${homeTeam} ${updated.h}-${updated.a} ${awayTeam}`);
        soundScore();
      }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    // Écriture scopée sur ce seul match (scores/results/resultTs) : ne touche
    // JAMAIS aux pronostics, validations ou verrous des joueurs, même si l'un
    // d'eux valide une phase (ex: demis) exactement au même instant.
    if (_fbReady) {
      const updates = { [`scores/${id}`]: scopedScore };
      if (resultDeleted) { updates[`results/${id}`] = null; updates[`resultTs/${id}`] = null; }
      else { updates[`results/${id}`] = scopedResult; updates[`resultTs/${id}`] = scopedResultTs; }
      _fbUpdate("/", updates);
    }
  }

  function clearScore(id) {
    setSt(prev => {
      const ns = {...prev, scores:{...(prev.scores||{})}};
      delete ns.scores[id];
      ns.results = {...(prev.results||{})};
      delete ns.results[id];
      const ts2 = {...(prev.resultTs||{})};
      delete ts2[id];
      ns.resultTs = ts2;
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      return ns;
    });
    // Écriture scopée : supprime uniquement ce match précis, jamais le reste.
    if (_fbReady) { _fbUpdate("/", { [`scores/${id}`]: null, [`results/${id}`]: null, [`resultTs/${id}`]: null }); trackDelete(`scores.${id}`); trackDelete(`results.${id}`); trackDelete(`resultTs.${id}`); }
  }

  // ── FINALE : sauvegarde du résultat officiel (admin) ──
  function saveFinaleOfficial(partial) {
    setSt(prev => {
      const prevOfficial = prev.finaleData?.official || {};
      const merged = {...prevOfficial, ...partial};
      const ns = {...prev, finaleData:{...(prev.finaleData||{}), official: merged}};
      // Synchroniser aussi st.results["FIN"] pour rester compatible avec
      // tout code qui lirait results["FIN"] (animations, stats par match...)
      if (merged.winner) {
        ns.results = {...(prev.results||{}), FIN: merged.winner === "home" ? "1" : "2"};
        ns.resultTs = {...(prev.resultTs||{}), FIN: Date.now()};
      }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      // Écriture scopée : ne touche qu'à finaleData.official + FIN (results/resultTs),
      // jamais aux pronostics ou validations des joueurs.
      if (_fbReady) {
        const updates = { "finaleData/official": merged };
        if (merged.winner) {
          updates["results/FIN"] = ns.results.FIN;
          updates["resultTs/FIN"] = ns.resultTs.FIN;
        }
        _fbUpdate("/", updates);
      }
      return ns;
    });
  }
  // ── FINALE : sauvegarde du pronostic du joueur courant ──
  function saveFinalePrediction(partial) {
    setSt(prev => {
      const prevMine = prev.finaleData?.predictions?.[user] || {};
      const merged = {...prevMine, ...partial};
      const ns = {...prev, finaleData:{...(prev.finaleData||{}), predictions:{...(prev.finaleData?.predictions||{}), [user]: merged}}};
      // Synchroniser aussi predictions[user]["FIN"] en "1"/"2" pour rester compatible
      let finPredVal = null;
      if (merged.winner) {
        finPredVal = merged.winner === "home" ? "1" : "2";
        ns.predictions = {...prev.predictions, [user]: {...(prev.predictions?.[user]||{}), FIN: finPredVal}};
      }
      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
      // Écriture scopée EN FUSION : ne touche qu'à finaleData.predictions/{user} et à la
      // seule clé predictions/{user}/FIN — jamais aux pronostics des autres joueurs, ni
      // (surtout) aux autres matchs déjà pronostiqués par CE joueur (quarts, demis, 3e
      // place...). Avant : on remplaçait tout le nœud predictions/{user} avec une copie
      // locale, ce qui pouvait effacer les pronos précédents si un écho Firebase en
      // retard arrivait après l'expiration de la fenêtre anti-écrasement (6s).
      if (_fbReady) {
        const updates = { [`finaleData/predictions/${user}`]: merged };
        if (finPredVal) updates[`predictions/${user}/FIN`] = finPredVal;
        _fbUpdate("/", updates);
      }
      trackWrite(`finaleData.predictions.${user}`, merged);
      if (finPredVal) trackWrite(`predictions.${user}.FIN`, finPredVal);
      return ns;
    });
  }

  // ── FINALE : calcul des points (3 pts vainqueur+mode, +5 score exact, +2/buteur max 2) ──
  function calcFinalePoints(off, mine) {
    if (!off || !off.winner || !mine || !mine.winner) return 0;
    let pts = 0;
    const modeMatch = off.mode === mine.mode;
    const winnerMatch = off.winner === mine.winner;
    if (winnerMatch && modeMatch) pts += PHASE_POINTS.finale;
    if (winnerMatch && off.scoreH != null && off.scoreA != null && mine.scoreH != null && mine.scoreA != null
        && Number(off.scoreH) === Number(mine.scoreH) && Number(off.scoreA) === Number(mine.scoreA)) {
      pts += FINALE_BONUS_SCORE;
    }
    if (off.buteurs && mine.buteurs) {
      // Les buteurs officiels sont déjà dédupliqués à la saisie admin
      const offSet = new Set(off.buteurs.map(b=>(b||"").toLowerCase().trim()).filter(Boolean));
      // Pour les buteurs du joueur : dédupliquer aussi pour éviter la triche
      const myUnique = [...new Set((mine.buteurs||[]).map(b=>(b||"").toLowerCase().trim()).filter(Boolean))];
      const matched = myUnique.filter(b => offSet.has(b));
      pts += Math.min(matched.length, 2) * FINALE_BONUS_BUTEUR;
    }
    return pts;
  }

  // ── ANIMATION ON CORRECT RESULT ──
  // Déclenche confettis + trophée uniquement sur les NOUVEAUX résultats corrects
  // (ceux qui ne sont pas encore dans seenAnim, persisté entre les sessions)
  useEffect(() => {
    if (!user || !st.results) return;

    // Collecter les nouvelles animations à déclencher (pas encore vues)
    const toAnimate = [];   // résultats corrects → confettis/trophée
    const toConsole = [];   // finale ratée → animation "dommage"
    Object.keys(st.results).forEach(id => {
      const key = `${user}_${id}`;
      if (seen.current.has(key)) return;          // déjà vu → skip

      if (id === "FIN") {
        // ── Finale : on exige vainqueur ET déroulé corrects (90min/prolong/TAB) ──
        const finOfficial = st.finaleData?.official;
        const finMine = st.finaleData?.predictions?.[user];
        if (!finOfficial?.winner) return; // pas encore de résultat officiel complet
        if (!finMine?.winner) { seen.current.add(key); return; } // le joueur n'a rien pronostiqué
        const winnerModeOk = finOfficial.winner === finMine.winner && finOfficial.mode === finMine.mode;
        if (winnerModeOk) {
          toAnimate.push({ key, id });
        } else {
          toConsole.push({ key, id });
        }
      } else if ((preds[id]) === st.results[id]) {
        toAnimate.push({ key, id });
      } else {
        // Résultat connu mais mauvais prono → marquer comme vu sans animer
        seen.current.add(key);
      }
    });

    if (toAnimate.length === 0 && toConsole.length === 0) return;

    // Marquer tout comme vu immédiatement (évite double-déclenchement)
    [...toAnimate, ...toConsole].forEach(({ key }) => seen.current.add(key));

    // Persister dans seenAnim pour survivre aux rechargements
    const newSeen = { ...(st.seenAnim || {}) };
    [...toAnimate, ...toConsole].forEach(({ key }) => { newSeen[key] = true; });
    // Mise à jour silencieuse (sans re-render inutile)
    const ns = { ...st, seenAnim: newSeen };
    persist(ns); // fallback local si Firebase offline
    // 🛡️ Écriture Firebase ATOMIQUE : on ne touche QUE les clés seenAnim/<clé>
    // concernées, jamais le reste de l'état. AVANT ce fix, persistFirebase(ns)
    // réécrivait l'intégralité de st (scores, results, etc.) à partir de l'état
    // local de CE client — déclenché chez TOUS les joueurs connectés à chaque
    // nouveau score saisi par l'admin. Si le score d'un match suivant arrivait
    // côté admin avant que ce client n'ait reçu ce résultat-ci, cette écriture
    // "fantôme" pouvait effacer le score suivant tout juste saisi par l'admin.
    if (FB_ENABLED && _fbReady) {
      const seenAnimUpdates = {};
      [...toAnimate, ...toConsole].forEach(({ key }) => { seenAnimUpdates[`seenAnim/${key}`] = true; });
      _fbUpdate("/", seenAnimUpdates).catch(e => console.warn("seenAnim Firebase write error:", e));
    }

    // ── Animation "dommage" si la finale est ratée (vainqueur ou déroulé faux) ──
    if (toConsole.some(a => a.id === "FIN")) {
      const finOfficial = st.finaleData?.official;
      const homeR = resolveTeamWithPredictions(MATCHES.find(m=>m.id==="FIN")?.home, st.results||{}, {}, {}, st.officialThirds||{}, {});
      const awayR = resolveTeamWithPredictions(MATCHES.find(m=>m.id==="FIN")?.away, st.results||{}, {}, {}, st.officialThirds||{}, {});
      const winnerName = finOfficial.winner === "home" ? homeR : awayR;
      const modeLabel = finOfficial.mode==="reg" ? "temps réglementaire" : finOfficial.mode==="prolong" ? "prolongation" : finOfficial.mode==="tab" ? "tirs au but" : "";
      setTimeout(() => { soundValidate(); setShowConsolation({ winnerName, modeLabel }); }, 400);
    }

    // Déclencher les animations avec stagger si plusieurs nouveaux résultats
    // (max 3 animations pour ne pas spammer, priorité finale > demis > etc.)
    const PHASE_PRIO = { finale:0, p3:1, demis:2, quarts:3, huitiemes:4, seiziemes:5, poules:6 };
    const sorted = toAnimate
      .map(({ id }) => MATCHES.find(m => m.id === id))
      .filter(Boolean)
      .sort((a, b) => (PHASE_PRIO[a.phase] ?? 9) - (PHASE_PRIO[b.phase] ?? 9))
      .slice(0, 3); // max 3 animations simultanées

    sorted.forEach((match, i) => {
      setTimeout(() => {
        if (match.phase === "finale") {
          celebrate("finale");
          setShowTrophy(true);
        } else {
          celebrate(match.phase);
        }
      }, 400 + i * 800); // stagger 800ms entre chaque
    });
  }, [st.results, user]);

  // ── MEILLEUR PRONOSTIQUEUR : une fois la finale jouée, si ce joueur a le
  // meilleur score de son groupe, afficher un badge dédié (une seule fois) ──
  useEffect(() => {
    if (!user || isAdmin || !st.finaleData?.official?.winner) return;
    const key = `${user}_bestpredictor`;
    if ((st.seenAnim||{})[key]) return; // déjà vu
    const scores = calcScores(st);
    const peers = Object.keys(st.users).filter(u => u!=="admin" && (st.users[u]||{}).role===role);
    if (peers.length < 2) return; // pas assez de monde pour que ce soit significatif
    const myScore = scores[user] || 0;
    const isTopScorer = myScore > 0 && peers.every(p => (scores[p]||0) <= myScore) && peers.some(p=>p!==user);
    if (!isTopScorer) return;
    // Marquer comme vu (une seule fois, persisté)
    setSt(prev => {
      const ns = { ...prev, seenAnim: { ...(prev.seenAnim||{}), [key]: true } };
      persist(ns);
      if (_fbReady) _fbUpdate("/", { [`seenAnim/${key}`]: true }).catch(()=>{});
      return ns;
    });
    const groupLabel = role==="famille" ? "Famille" : role==="collegues" ? "Collègues" : "Ton groupe";
    setTimeout(() => setShowBestPredictor({ totalPts: myScore, groupLabel }), 600);
  }, [st.finaleData?.official?.winner, st.results, user]);

  // Auto-play login music when entering or unmuting on login screen
  useEffect(() => {
    let timer = null;
    
    if (scr === "login") {
      if (!muted && !loginMusicPlaying) {
        // Play music after small delay to ensure context ready
        timer = setTimeout(() => {
          try {
            playLoginMusic();
          } catch(e) {
            console.error("Error playing login music:", e);
          }
        }, 200);
      } else if (muted && loginMusicPlaying) {
        // Stop music if muted
        stopLoginMusic();
      }
    } else {
      // Stop login music when leaving login screen
      if (loginMusicPlaying) stopLoginMusic();
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [scr, muted]);

  // ── HELPERS PRÉSENCE ──────────────────────────────────────────
  const onlinePlayers = Object.keys(st.presence || {}).filter(u => {
    const p = st.presence[u];
    return p && p.online && (Date.now() - (p.lastSeen || 0)) < 60000;
  });

  // ── CHAT — filtré par groupe (famille / collègues) ─────────────
  const chatRole = (st.users[user]||{}).role;
  const validChatRole = (role === "admin") ? adminChatGroup
    : (chatRole === "famille" || chatRole === "collegues" || chatRole === "externe") ? chatRole : null;

  function getChatMsgs(matchId) {
    if (!validChatRole) return [];
    if (matchId) {
      const mc = (st.matchComments||{})[matchId] || {};
      return mc[validChatRole] || [];
    }
    const c = st.chat || {};
    return Array.isArray(c) ? [] : (c[validChatRole] || []);
  }

  function sendChat(matchId, textArg) {
    const txt = (textArg !== undefined ? textArg : chatMsg).trim();
    if (!txt || !user || !validChatRole) return;
    const msg = { user, text: txt, ts: Date.now(), reactions: {} };

    // Mise à jour locale immédiate pour l'affichage
    let ns;
    if (matchId) {
      const mcPrev = (st.matchComments||{})[matchId] || {};
      const groupPrev = Array.isArray(mcPrev) ? [] : (mcPrev[validChatRole] || []);
      ns = { ...st, matchComments: { ...(st.matchComments||{}),
        [matchId]: { ...(Array.isArray(mcPrev)?{}:mcPrev), [validChatRole]: [...groupPrev, msg] }
      }};
    } else {
      const chatPrev = st.chat || {};
      const groupPrev = Array.isArray(chatPrev) ? [] : (chatPrev[validChatRole] || []);
      const cappedPrev = groupPrev.length > 180 ? groupPrev.slice(-180) : groupPrev; // purge si > 180 pour garder de la marge
      ns = { ...st, chat: { ...(Array.isArray(chatPrev)?{}:chatPrev), [validChatRole]: [...cappedPrev, msg] }};
    }
    // Mise à jour état local immédiatement (affichage instantané, sans toucher Firebase)
    setSt(ns);
    persist(ns);

    // 🛡️ Envoi Firebase atomique : n'écrit QUE ce message, ne touche pas aux autres
    // Empêche l'écrasement de messages envoyés simultanément par d'autres joueurs
    if (FB_ENABLED && _fbReady) {
      const ts = Date.now();
      const msgKey = `${ts}_${Math.random().toString(36).slice(2,6)}`;
      if (matchId) {
        _fbUpdate("/", {
          [`matchComments/${matchId}/${validChatRole}/${msgKey}`]: msg
        }).catch(e => console.warn("Chat Firebase write error:", e));
      } else {
        _fbUpdate("/", {
          [`chat/${validChatRole}/${msgKey}`]: msg
        }).catch(e => console.warn("Chat Firebase write error:", e));
      }
    }

    setChatMsg("");
  }

  function addReaction(emoji, msgIdx, matchId) {
    if (!validChatRole || !user) return;
    // reactions = { emoji: [user1, user2, ...] } — un user ne peut réagir qu'une fois par emoji
    function toggleReaction(msg) {
      const reactions = { ...(msg.reactions||{}) };
      const previousEmoji = Object.keys(reactions).find(e =>
        Array.isArray(reactions[e]) && reactions[e].includes(user)
      );
      if (previousEmoji && previousEmoji !== emoji) {
        reactions[previousEmoji] = reactions[previousEmoji].filter(u => u !== user);
      }
      const prev = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
      const alreadyReacted = prev.includes(user);
      reactions[emoji] = alreadyReacted ? prev.filter(u => u !== user) : [...prev, user];
      return { ...msg, reactions };
    }
    const msgs = matchId
      ? (Array.isArray((st.matchComments||{})[matchId]) ? [] : (((st.matchComments||{})[matchId]||{})[validChatRole]||[]))
      : (Array.isArray(st.chat) ? [] : ((st.chat||{})[validChatRole]||[]));
    if (!msgs[msgIdx]) return;
    const updatedMsg = toggleReaction(msgs[msgIdx]);
    const newReactions = updatedMsg.reactions;

    // Mise à jour locale immédiate pour l'affichage
    const newMsgs = [...msgs]; newMsgs[msgIdx] = updatedMsg;
    let ns;
    if (matchId) {
      const mcPrev = (st.matchComments||{})[matchId] || {};
      ns = { ...st, matchComments: { ...(st.matchComments||{}),
        [matchId]: { ...(Array.isArray(mcPrev)?{}:mcPrev), [validChatRole]: newMsgs }
      }};
    } else {
      const chatPrev = st.chat || {};
      ns = { ...st, chat: { ...(Array.isArray(chatPrev)?{}:chatPrev), [validChatRole]: newMsgs }};
    }
    setSt(ns);
    persist(ns);

    // 🛡️ Écriture Firebase atomique sur le champ reactions UNIQUEMENT
    // (utilise la clé Firebase _key du message, conservée par normalizeChat)
    if (FB_ENABLED && _fbReady && updatedMsg._key) {
      const base = matchId ? `matchComments/${matchId}/${validChatRole}` : `chat/${validChatRole}`;
      _fbUpdate("/", {
        [`${base}/${updatedMsg._key}/reactions`]: newReactions
      }).catch(e => console.warn("Reaction Firebase write error:", e));
    } else if (FB_ENABLED && _fbReady) {
      // Fallback (message sans _key, ex: ancien format array) — écriture scopée sur
      // ce seul groupe de chat/commentaires. AVANT : save(ns) réécrivait TOUT l'état
      // (predictions, results, validatedGroups, scores...) avec la copie locale de CE
      // client — potentiellement périmée par rapport aux pronostics d'un autre joueur
      // tout juste enregistrés. C'était la cause de la disparition aléatoire des pronos
      // à chaque réaction emoji sur un vieux message.
      const base = matchId ? `matchComments/${matchId}/${validChatRole}` : `chat/${validChatRole}`;
      _fbUpdate("/", { [base]: newMsgs }).catch(e => console.warn("Reaction fallback Firebase write error:", e));
    }
  }


  // ─────────────────────────────────
  // SUB-VIEWS
  // ─────────────────────────────────

  // ── CHATBOX COMPONENT ─────────────────────────────────────────

  // ── CHATINPUT — state local pour éviter re-render clavier ──────
  function GroupStandings({g}) {
    // ✅ TOUJOURS basé sur les PRONOS du joueur — pas les résultats officiels
    // Les résultats officiels ne modifient pas le classement prédit du joueur
    const predTeams={};
    MATCHES.filter(m=>m.group===g&&m.phase==="poules").forEach(m=>{
      if(!predTeams[m.home])predTeams[m.home]={pts:0};
      if(!predTeams[m.away])predTeams[m.away]={pts:0};
      const r=preds[m.id];
      if(r==="1")predTeams[m.home].pts+=3;
      else if(r==="2")predTeams[m.away].pts+=3;
      else if(r==="N"){predTeams[m.home].pts++;predTeams[m.away].pts++;}
    });
    const sorted=Object.entries(predTeams).sort((a,b)=>b[1].pts-a[1].pts);
    const hasOfficialResults = MATCHES.filter(m=>m.group===g&&m.phase==="poules").some(m=>!!(st.results||{})[m.id]);
    return (
      <div style={{...t.card,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={t.stitle}>Classement Groupe {g}</div>
          <span style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:.5}}>TES PRONOS</span>
        </div>
        {sorted.map(([name,data],i)=>(
          <div key={name} style={t.srow2}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{...t.srank,color:i<2?"#F5C842":MUTED}}>{i+1}.</span>
              <span style={{fontSize:20}}>{F(name)}</span>
              <span style={{fontSize:13}}>{name}</span>
              {i<2&&<span style={{fontSize:9,background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:800}}>▲Q</span>}
            </div>
            <span style={t.spts}>{data.pts} pts</span>
          </div>
        ))}
        {hasOfficialResults && <div style={{fontSize:9,color:AMB,marginTop:6,textAlign:"center"}}>📋 Résultats officiels disponibles — voir l'onglet Résultats</div>}
      </div>
    );
  }

  function ValidationBox({g}) {
    if (locked) return <div style={t.aLock}>🔒 Pronostics verrouillés</div>;
    const gm=MATCHES.filter(m=>m.group===g&&m.phase==="poules");
    const done=gm.every(m=>preds[m.id]);
    const val=(st.validatedGroups[user]||[]).includes(g);
    const allGroupsFilled=GROUPS.every(gr=>MATCHES.filter(m=>m.group===gr&&m.phase==="poules").every(m=>preds[m.id]));
    const allGroupsVal=GROUPS.every(gr=>(st.validatedGroups[user]||[]).includes(gr));

    return (
      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
        {!done && <div style={t.aWarn}>⚠️ Complète tous les matchs pour valider le groupe</div>}
        {done && !val && <button style={t.btnGreen} onClick={()=>valGroup(g)}>✅ Valider Groupe {g} 🎉</button>}
        {val && !allGroupsVal && (
          confirmUnval === g ? (
            <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:10}}>
              <div style={{fontSize:12,color:TXT,marginBottom:8,lineHeight:1.5}}>
                Déverrouiller le groupe <strong>{g}</strong> pour modifier tes pronos ?
              </div>
              <div style={{display:"flex",gap:8}}>
                <button style={{flex:1,background:"rgba(239,68,68,.8)",border:"none",color:"#fff",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                  onClick={()=>{ unvalGroup(g); setConfirmUnval(null); }}>✏️ Oui, modifier</button>
                <button style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:TXT,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                  onClick={()=>setConfirmUnval(null)}>Annuler</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <div style={t.aOk}>✅ Groupe {g} validé</div>
              <button style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:TXT,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>setConfirmUnval(g)}>✏️ Modifier</button>
            </div>
          )
        )}
        {/* Bouton valider TOUTES les poules */}
        {allGroupsFilled && !allGroupsVal && (
          <button style={{...t.btnGreen,background:"#7c3aed",marginTop:4}} onClick={()=>{
            let toAddResult = null;
            setSt(prev => {
              const prevVal = prev.validatedGroups?.[user]||[];
              const toAdd = GROUPS.filter(gr=>!prevVal.includes(gr));
              if (toAdd.length===0) return prev;
              const updatedUserVG = [...prevVal, ...toAdd];
              toAddResult = updatedUserVG;
              const ns = {...prev, validatedGroups:{...(prev.validatedGroups||{}),[user]:updatedUserVG}};
              try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
              return ns;
            });
            if (toAddResult) {
              // Écriture scopée sur ce seul joueur : ne touche jamais aux validations
              // des autres joueurs, même si l'un d'eux valide une autre phase au même instant.
              if (_fbReady) { _fbUpdate("/validatedGroups", {[user]: toAddResult}); trackWrite(`validatedGroups.${user}`, toAddResult); }
              soundValidate();
              setTimeout(()=>{ celebrate("poules"); setTab("elim"); setEPhase("seiziemes"); },300);
            }
          }}>✅ Valider toutes les poules → Phases éliminatoires</button>
        )}
        {allGroupsVal && (
          <div style={t.aOk}>✅ Toutes les poules validées → <button style={{background:"none",border:"none",color:GREEN,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit",fontSize:13}} onClick={()=>{setTab("elim");setEPhase("seiziemes");}}>Aller aux 1/16</button></div>
        )}
      </div>
    );
  }

  function LB({filterRole,title}) {
    const results = st.results || {};
    const totalResults = Object.keys(results);
    const pl=Object.keys(st.users).filter(u=>st.users[u].role===filterRole).sort((a,b)=>{
      // 1. Points
      const diff = (scores[b]||0) - (scores[a]||0);
      if (diff !== 0) return diff;
      // 2. Nombre de pronos soumis sur les matchs joués (joueur plus actif)
      const predA = totalResults.filter(id=>(st.predictions[a]||{})[id]).length;
      const predB = totalResults.filter(id=>(st.predictions[b]||{})[id]).length;
      if (predB !== predA) return predB - predA;
      // 3. Alphabétique
      return a.localeCompare(b);
    });
    if(!pl.length) return <div style={t.empty}>Aucun joueur.</div>;
    const totalPlayed = Object.keys(st.results||{}).length;
    const maxScore = Object.keys(st.results||{}).reduce((sum, id) => {
      const match = MATCHES.find(m => m.id === id);
      return sum + (PHASE_POINTS[match?.phase] ?? 1);
    }, 0) || 1;
    const topScore = scores[pl[0]]||0;
    // Tous les ex-aequo en 1ère place
    const leaders = pl.filter(u=>(scores[u]||0)===topScore && topScore>0);
    return (
      <div style={{...t.card,marginBottom:12}}>
        {/* Bannière meilleur pronostiqueur */}
        {leaders.length>0 && totalPlayed>0 && (
          <div style={{
            background:"linear-gradient(135deg,rgba(255,210,52,.2),rgba(255,140,0,.12),rgba(255,107,157,.08))",
            border:"1px solid rgba(255,210,52,.45)",
            borderRadius:14,padding:"10px 12px",marginBottom:12,
            display:"flex",alignItems:"center",gap:10,
            boxShadow:"0 4px 20px rgba(255,140,0,.15), inset 0 1px 0 rgba(255,210,52,.15)",
            animation:"glowPulse 4s ease-in-out infinite",
          }}>
            <span style={{fontSize:28}}>🏅</span>
            <div>
              <div style={{fontSize:11,color:GOLD,fontWeight:800,textTransform:"uppercase",letterSpacing:.5}}>
                {leaders.length===1?"Meilleur pronostiqueur":"Ex-æquo en tête"}
              </div>
              <div style={{fontSize:14,fontWeight:900,color:"#fff",marginTop:2}}>
                {leaders.map(u=>u.toUpperCase()).join(" & ")}
                <span style={{fontSize:12,color:GOLD,fontWeight:700,marginLeft:8}}>{topScore} pts</span>
              </div>
            </div>
          </div>
        )}
        <div style={t.stitle}>{title}</div>
        {pl.map((u,i)=>{
          const pts = scores[u]||0;
          const correct = Object.keys(st.results||{}).filter(id=>(st.predictions[u]||{})[id]===st.results[id]).length;
          const pct = Math.round((pts/maxScore)*100);
          const isLeader = leaders.includes(u) && totalPlayed>0;
          return (
            <div key={u} style={{
              padding:"10px 0",
              borderBottom:`1px solid ${SURF2}`,
              ...(isLeader?{background:"rgba(245,200,66,.03)",borderRadius:8,paddingLeft:4,paddingRight:4}:{})
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8,...(u===user?{color:GOLD,fontWeight:700}:{})}}>
                  <span style={t.lbRank}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`}</span>
                  <span style={{fontSize:13}}>
                    {u.toUpperCase()}
                    {(st.users[u]?.fname||st.users[u]?.lname) && (
                      <span style={{fontSize:11,color:MUTED,fontWeight:400,marginLeft:5}}>
                        ({[st.users[u].fname,st.users[u].lname].filter(Boolean).join(" ")})
                      </span>
                    )}
                    {u===user?" · toi":""}
                    {isLeader && <span style={{marginLeft:6,fontSize:14}}>⭐</span>}
                  </span>
                </div>
                <div style={{textAlign:"right"}}>
                  <span style={{fontWeight:800,color:isLeader?GOLD:"#fff",fontSize:15}}>{pts}</span>
                  <span style={{color:MUTED,fontSize:11}}> pts</span>
                  <span style={{color:MUTED,fontSize:10,marginLeft:6}}>{correct}/{totalPlayed}</span>
                </div>
              </div>
              {totalPlayed > 0 && (
                <div style={{height:isLeader?6:4,background:SURF2,borderRadius:4,overflow:"hidden"}}>
                  <div style={{
                    height:"100%",width:`${pct}%`,
                    background:isLeader?`linear-gradient(90deg,#FFD234,#FF8C00,#FF6B9D)`:`linear-gradient(90deg,#2ECC71,#00D4AA)`,
                    borderRadius:4,transition:"width .5s ease",
                    boxShadow:isLeader?"0 0 8px rgba(245,200,66,.5)":"none"
                  }}/>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ──────────────────────────────────
  // SCREENS
  // ──────────────────────────────────
  if (scr==="login") return (
    <div onClick={handleLoginInteraction} style={{
      ...t.root,
      minHeight:"100vh",
      background:"linear-gradient(170deg, #0a0e20 0%, #0a1e10 25%, #0a1830 55%, #0d1525 80%, #0a0e20 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:24, position:"relative", overflow:"hidden"
    }}>

      {/* Cercles décoratifs flottants */}
      <div style={{position:"absolute",top:-80,right:-60,width:260,height:260,borderRadius:"50%",background:"radial-gradient(circle, rgba(245,200,66,.12) 0%, transparent 65%)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-60,left:-80,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle, rgba(245,100,20,.1) 0%, transparent 65%)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"40%",left:-40,width:140,height:140,borderRadius:"50%",background:"radial-gradient(circle, rgba(59,130,246,.08) 0%, transparent 65%)",pointerEvents:"none"}}/>

      {/* ── DÉFILÉ DRAPEAUX 3D ── */}
      {(()=>{
        // Tous les pays de la CdM 2026
        const allFlags = [
          "🇲🇽","🇿🇦","🇰🇷","🇨🇿","🇨🇦","🇧🇦","🇺🇸","🇵🇾","🇶🇦","🇨🇭",
          "🇧🇷","🇲🇦","🇭🇹","🏴󠁧󠁢󠁳󠁣󠁴󠁿","🇦🇺","🇹🇷","🇩🇪","🇨🇼","🇳🇱","🇯🇵",
          "🇨🇮","🇪🇨","🇸🇪","🇹🇳","🇪🇸","🇨🇻","🇧🇪","🇪🇬","🇸🇦","🇺🇾",
          "🇮🇷","🇳🇿","🇫🇷","🇸🇳","🇮🇶","🇳🇴","🇦🇷","🇩🇿","🇦🇹","🇯🇴",
          "🇵🇹","🇨🇩","🏴󠁧󠁢󠁥󠁮󠁧󠁿","🇭🇷","🇬🇭","🇵🇦","🇺🇿","🇨🇴",
        ];
        // Doubler pour boucle infinie
        const doubled = [...allFlags, ...allFlags];
        const totalWidth = allFlags.length * 52; // px par drapeau
        return (
          <>
            {/* Rangée du haut — va vers la gauche */}
            <div style={{
              position:"absolute", top:0, left:0, right:0,
              height:52, overflow:"hidden",
              maskImage:"linear-gradient(90deg,transparent,black 10%,black 90%,transparent)",
              WebkitMaskImage:"linear-gradient(90deg,transparent,black 10%,black 90%,transparent)",
            }}>
              <div style={{
                display:"flex", gap:4, width:`${totalWidth*2}px`,
                animation:`marquee ${allFlags.length*0.55}s linear infinite`,
              }}>
                {doubled.map((f,i)=>(
                  <span key={i} style={{
                    fontSize:28, flexShrink:0, width:48, textAlign:"center",
                    display:"inline-block",
                    animation:`flagFloat3d ${2+((i*0.37)%1.5)}s ease-in-out infinite`,
                    animationDelay:`${(i*0.13)%2}s`,
                    transformOrigin:"center center",
                  }}>{f}</span>
                ))}
              </div>
            </div>

            {/* Rangée du bas — va vers la droite (sens inverse) */}
            <div style={{
              position:"absolute", bottom:0, left:0, right:0,
              height:52, overflow:"hidden",
              maskImage:"linear-gradient(90deg,transparent,black 10%,black 90%,transparent)",
              WebkitMaskImage:"linear-gradient(90deg,transparent,black 10%,black 90%,transparent)",
            }}>
              <div style={{
                display:"flex", gap:4, width:`${totalWidth*2}px`,
                animation:`marquee ${allFlags.length*0.55}s linear infinite reverse`,
                transform:"translateX(-50%)",
              }}>
                {doubled.map((f,i)=>(
                  <span key={i} style={{
                    fontSize:28, flexShrink:0, width:48, textAlign:"center",
                    display:"inline-block",
                    animation:`flagFloat3d ${2+((i*0.41)%1.5)}s ease-in-out infinite`,
                    animationDelay:`${(i*0.17)%2}s`,
                    transformOrigin:"center center",
                  }}>{f}</span>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* Bouton mute musique login */}
      <button
        onClick={()=>setAudio(a => ({...a, muted: !a.muted}))}
        style={{
          position:"absolute", top:16, right:16,
          background:"rgba(255,255,255,.08)",
          border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10, padding:"6px 10px",
          fontSize:18, cursor:"pointer",
          color:"rgba(255,255,255,.7)",
          backdropFilter:"blur(8px)",
          zIndex:10,
        }}
        title={muted ? "Activer la musique" : "Couper la musique"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      <div style={{width:"100%",maxWidth:360,position:"relative",zIndex:1}}>

        {/* HERO */}
        <div style={{textAlign:"center",marginBottom:28}}>

          {/* Trophée avec glow */}
          <div style={{position:"relative",display:"inline-block",marginBottom:12}}>
            <div style={{
              position:"absolute",top:"50%",left:"50%",
              transform:"translate(-50%,-50%)",
              width:100,height:100,borderRadius:"50%",
              background:"radial-gradient(circle, rgba(245,200,66,.35) 0%, transparent 70%)",
              pointerEvents:"none"
            }}/>
            <span style={{fontSize:72,filter:"drop-shadow(0 0 18px rgba(245,200,66,.7))",position:"relative",display:"inline-block"}}>🏆</span>
          </div>

          {/* Titre */}
          <div style={{
            fontSize:28,fontWeight:900,
            background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            letterSpacing:1,lineHeight:1,marginBottom:6,
            filter:"drop-shadow(0 0 16px rgba(255,140,0,.5))"
          }}>COUPE DU MONDE</div>
          <div style={{
            fontSize:42,fontWeight:900,color:"#fff",
            letterSpacing:3,lineHeight:1,marginBottom:14,
            textShadow:"0 0 30px rgba(56,189,248,.4), 0 2px 12px rgba(0,0,0,.8)"
          }}>2026</div>

          {/* Pays hôtes */}
          <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:10}}>
            {[
              {label:"🇺🇸 USA",    bg:"rgba(56,189,248,.12)", border:"rgba(56,189,248,.3)", color:"rgba(56,189,248,.9)"},
              {label:"🇨🇦 Canada", bg:"rgba(255,71,87,.12)",  border:"rgba(255,71,87,.3)",  color:"rgba(255,107,107,.9)"},
              {label:"🇲🇽 Mexique",bg:"rgba(46,204,113,.12)", border:"rgba(46,204,113,.3)", color:"rgba(46,204,113,.9)"},
            ].map(p=>(
              <span key={p.label} style={{
                background:p.bg,border:`1px solid ${p.border}`,
                borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:700,color:p.color
              }}>{p.label}</span>
            ))}
          </div>

          {/* Dates */}
          <div style={{
            display:"inline-flex",alignItems:"center",gap:8,
            background:"rgba(245,200,66,.1)",
            border:"1px solid rgba(245,200,66,.25)",
            borderRadius:10,padding:"6px 14px",
          }}>
            <span style={{fontSize:12,fontWeight:700,color:"#F5C842"}}>11 Juin</span>
            <span style={{fontSize:16,color:"rgba(245,200,66,.4)"}}>→</span>
            <span style={{fontSize:12,fontWeight:700,color:"#F5C842"}}>19 Juillet 2026</span>
          </div>

          {/* Tagline */}
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:10,letterSpacing:.5}}>
            48 équipes · 104 matchs · 1 champion
          </div>

          {/* COUNTDOWN LOGIN — dynamique : pointe vers la prochaine phase élim
              si le tournoi est déjà lancé, sinon vers le coup d'envoi */}
          {(()=>{
            void tick; // force le re-render chaque seconde via le setInterval
            const now2 = new Date();
            const kickoff = new Date("2026-06-11T21:00:00");
            // Trouve la prochaine fenêtre de pronostic élim non encore fermée
            const nextElim = ELIM_REMINDERS.find(r => now2 < new Date(r.deadline));
            // Cible : soit le coup d'envoi (avant le 11 juin), soit la prochaine phase élim
            const target = now2 < kickoff ? kickoff : nextElim ? new Date(nextElim.countdown) : null;
            const label  = now2 < kickoff ? "⚽ Coup d'envoi dans"
              : nextElim ? `⏰ Pronostics ${nextElim.label} dans` : null;
            if (!target || now2 >= target) return (
              <div style={{
                marginTop:12,
                border:"1px solid rgba(46,204,113,.4)",
                borderRadius:14,padding:"10px 18px",
                fontSize:13,fontWeight:800,
                background:GRAD_OCEAN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
                boxShadow:"0 0 20px rgba(0,212,170,.15)",
                animation:"glowPulse 2s ease-in-out infinite",
                filter:"drop-shadow(0 0 6px rgba(0,212,170,.3))"
              }}>{now2 < kickoff ? "🟢 La compétition est lancée !" : nextElim ? `🔓 Pronostics ${nextElim.label} ouverts !` : "🏆 Le tournoi est terminé !"}</div>
            );
            const diff2 = target - now2;
            const days = Math.floor(diff2/86400000);
            const hrs  = Math.floor((diff2%86400000)/3600000);
            const mins = Math.floor((diff2%3600000)/60000);
            const secs = Math.floor((diff2%60000)/1000);
            return (
              <div style={{marginTop:14}}>
                <div style={{fontSize:9,color:"rgba(255,210,52,.5)",letterSpacing:2,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
                  {label}
                </div>
                <div style={{
                  display:"inline-flex",gap:8,
                  background:"linear-gradient(135deg,rgba(255,140,0,.12),rgba(255,210,52,.08))",
                  border:"1px solid rgba(255,210,52,.3)",
                  borderRadius:16,padding:"12px 18px",
                  boxShadow:"0 4px 20px rgba(255,140,0,.15)",
                }}>
                  {[[days,"j"],[hrs,"h"],[mins,"m"],[secs,"s"]].filter(([v,l])=>l!=="j"||v>0).map(([v,l],i,arr)=>(
                    <div key={l} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{
                        fontSize:26,fontWeight:900,
                        background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
                        fontVariantNumeric:"tabular-nums",
                        minWidth:l==="j"?32:26,
                        textAlign:"center",lineHeight:1,
                      }}>{String(v).padStart(2,"0")}</div>
                      <div style={{fontSize:8,color:"rgba(255,255,255,.35)",fontWeight:600,letterSpacing:.5}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* FORM */}
        <div style={{
          background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(255,255,255,.1)",
          borderRadius:22,padding:22,
          backdropFilter:"blur(12px)",
          display:"flex",flexDirection:"column",gap:12
        }}>
          <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.6)",textAlign:"center",letterSpacing:.5,marginBottom:2}}>
            Rejoins le tournoi de pronos
          </div>
          <input style={{
            ...t.input,
            background:"rgba(0,0,0,.4)",
            border:"1px solid rgba(255,255,255,.12)",
            borderRadius:14,fontSize:16,padding:"14px 16px",
            color:"#fff",
          }}
            placeholder="✏️  Ton pseudo"
            value={uname}
            onChange={e=>{ setUname(e.target.value); setPw(""); }}
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            autoCapitalize="none" autoCorrect="off" autoComplete="off"
            aria-label="Pseudo du joueur"
            tabIndex={0}
          />
          {(()=>{
            const u = uname.trim().toLowerCase();
            if (!u) return null;
            const isAdmin = u === "admin";
            const existingUser = st.users[u];
            const needsNewPw = !isAdmin && (!existingUser || !existingUser.pw);
            const placeholder = isAdmin ? "🔑  Mot de passe admin"
              : needsNewPw ? "🔑  Choisis un mot de passe (min 4 car.)"
              : "🔑  Ton mot de passe";
            return (
              <>
                <div style={{position:"relative",width:"100%"}}>
                  <input style={{
                    ...t.input,
                    background:"rgba(0,0,0,.4)",
                    border:"1px solid rgba(255,255,255,.12)",
                    borderRadius:14,fontSize:16,padding:"14px 48px 14px 16px",
                    color:"#fff",width:"100%",boxSizing:"border-box",
                  }}
                    type={showPw?"text":"password"} placeholder={placeholder}
                    value={pw}
                    onChange={e=>setPw(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&doLogin()}
                    autoComplete="new-password"
                  />
                  <button onClick={toggleShowPw} type="button" style={{
                    position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                    background:"none",border:"none",cursor:"pointer",fontSize:18,
                    color:"rgba(255,255,255,.4)",padding:4,lineHeight:1,
                  }}>{showPw?"🙈":"👁️"}</button>
                </div>
                {needsNewPw && (
                  <>
                    <div style={{position:"relative",width:"100%"}}>
                      <input style={{
                        ...t.input,
                        background:"rgba(0,0,0,.4)",
                        border:"1px solid rgba(255,255,255,.12)",
                        borderRadius:14,fontSize:16,padding:"14px 48px 14px 16px",
                        color:"#fff",width:"100%",boxSizing:"border-box",
                      }}
                        type={showPwConfirm?"text":"password"} placeholder="🔑  Confirme ton mot de passe"
                        value={pwConfirm}
                        onChange={e=>setPwConfirm(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&doLogin()}
                        autoComplete="new-password"
                      />
                      <button onClick={toggleShowPwConfirm} type="button" style={{
                        position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                        background:"none",border:"none",cursor:"pointer",fontSize:18,
                        color:"rgba(255,255,255,.4)",padding:4,lineHeight:1,
                      }}>{showPwConfirm?"🙈":"👁️"}</button>
                    </div>
                    {/* Nom et Prénom pour identification admin */}
                    <input style={{
                      ...t.input,
                      background:"rgba(0,0,0,.4)",
                      border:`1px solid ${fname ? "rgba(255,255,255,.12)" : "rgba(239,68,68,.5)"}`,
                      borderRadius:14,fontSize:16,padding:"14px 16px",
                      color:"#fff",
                    }}
                      placeholder="👤 Prénom *"
                      value={fname}
                      onChange={e=>setFname(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doLogin()}
                      autoComplete="given-name"
                    />
                    <input style={{
                      ...t.input,
                      background:"rgba(0,0,0,.4)",
                      border:`1px solid ${lname ? "rgba(255,255,255,.12)" : "rgba(239,68,68,.5)"}`,
                      borderRadius:14,fontSize:16,padding:"14px 16px",
                      color:"#fff",
                    }}
                      placeholder="👤 Nom *"
                      value={lname}
                      onChange={e=>setLname(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doLogin()}
                      autoComplete="family-name"
                    />
                    <div style={{fontSize:11,color:"rgba(239,68,68,.7)",textAlign:"center",marginTop:-4}}>
                      * Prénom et nom obligatoires pour que l'admin puisse t'identifier
                    </div>
                    {!existingUser && (
                      <div style={{fontSize:11,color:"rgba(0,212,170,.8)",textAlign:"center",lineHeight:1.6}}>
                        ✨ Ce pseudo n'existe pas encore — tu vas créer ton compte.<br/>
                        <span style={{color:"rgba(255,255,255,.4)"}}>Tu pourras jouer dès que l'admin t'aura assigné à un groupe.</span>
                      </div>
                    )}
                    {existingUser && !existingUser.pw && (
                      <div style={{fontSize:11,color:AMB,textAlign:"center",lineHeight:1.5}}>
                        👋 Première connexion — crée ton mot de passe pour accéder à ton compte
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}
          {/* INFO PHASES ÉLIMINATOIRES */}
          <div style={{
            background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",
            borderRadius:12,padding:"10px 14px",fontSize:11,lineHeight:1.5,
            color:"rgba(255,100,100,.9)",textAlign:"center"
          }}>
            ⚠️ Une fois les poules terminées, les pronostics des phases éliminatoires s'ouvriront <strong>progressivement</strong>, au fil du tournoi.
          </div>

          {/* Se souvenir de moi — uniquement pour joueurs existants (pas nouveau compte) */}
          {!(!st.users[uname.trim().toLowerCase()] && uname.trim()) && (
            <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"4px 0",userSelect:"none"}}>
              <div
                onClick={() => setRememberMe(!rememberMe)}
                style={{
                  width:20, height:20, borderRadius:6, flexShrink:0,
                  border:`2px solid ${rememberMe ? GOLD : BRD}`,
                  background: rememberMe ? "rgba(245,200,66,.2)" : "rgba(255,255,255,.04)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"all .15s", cursor:"pointer",
                }}>
                {rememberMe && <span style={{fontSize:13, color:GOLD, lineHeight:1}}>✓</span>}
              </div>
              <span style={{fontSize:12, color:MUTED}}>Se souvenir de moi sur cet appareil</span>
            </label>
          )}

          <button style={{
            background:"linear-gradient(135deg, #F5C842 0%, #e8a800 100%)",
            color:"#0a0600",border:"none",borderRadius:14,
            padding:"15px 20px",fontSize:16,fontWeight:900,
            cursor:"pointer",width:"100%",fontFamily:"inherit",
            boxShadow:"0 4px 20px rgba(245,200,66,.4)",
            letterSpacing:.5
          }} 
          onClick={doLogin}
          aria-label="Se connecter et entrer dans l'arène"
          tabIndex={0}>
            ⚽ &nbsp;Entrer dans l'arène
          </button>
        </div>

      </div>
    </div>
  );

  if (scr==="waiting") return (
    <div style={t.root}>
      <div style={{...t.loginWrap,gap:16,textAlign:"center"}}>
        <div style={{fontSize:56}}>⏳</div>
        <div style={{fontSize:20,fontWeight:800,color:GOLD}}>En attente</div>
        <div style={{fontSize:13,color:MUTED,maxWidth:260,lineHeight:1.7}}>L'admin doit t'assigner à un groupe pour que tu puisses jouer.</div>
        <button style={{...t.btnGold,width:"auto",padding:"10px 24px",fontSize:14,marginTop:8}} onClick={()=>{
          const r = st.users[user]?.role;
          if(r && r!=="waiting"){ setScr("app"); setTab("home"); }
          else { showNotif("info", "⏳ Pas encore assigné. Contacte l'admin !"); }
        }}>🔄 Rafraîchir</button>
        <button style={{...t.btnXS,marginTop:4}} onClick={doLogout}>Déconnexion</button>
      </div>
    </div>
  );

  // ─── APP ───
  // Garde anti-crash : si st.users[user] n'est pas encore arrivé via Firebase
  // (latence de propagation après changement de rôle ou création de compte),
  // on affiche un écran de chargement plutôt que de crasher.
  if (scr !== "login" && scr !== "waiting" && user && user !== "admin" && !st.users[user]) {
    return (
      <div style={{minHeight:"100dvh",background:"#0a0e1a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <div style={{fontSize:36,animation:"spin 1.2s linear infinite"}}>⚽</div>
        <div style={{color:"#6b7fa8",fontSize:13}}>Chargement de ton compte…</div>
      </div>
    );
  }
  const isAdmin = role==="admin";
  const myValidated = st.validatedGroups[user] || [];
  const iFullyValidated = allPhasesValidated(myValidated) || locked;
  const competitionStarted = Object.keys(st.finalLock||{}).length > 0 &&
    Object.keys(st.users||{}).filter(u=>u!=="admin").every(u => st.finalLock[u]);
  const canSeeGroupPronos = iFullyValidated; // accès dès que soi-même est validé/verrouillé

  const navItems = isAdmin
    ? [{k:"home",l:"🏠",lbl:"Accueil"},{k:"poules",l:"⚽",lbl:"Poules"},{k:"elim",l:"🏆",lbl:"Élim."},{k:"scores",l:"📊",lbl:"Scores"},{k:"jeux",l:"🎮",lbl:"Jeux"},{k:"chat",l:"💬",lbl:"Chat"},{k:"histo",l:"📋",lbl:"Résultats"},{k:"admin",l:"⚙️",lbl:"Admin"}]
    : [...[{k:"home",l:"🏠",lbl:"Accueil"},{k:"poules",l:"⚽",lbl:"Poules"},{k:"elim",l:"🏆",lbl:"Élim."},{k:"scores",l:"📊",lbl:"Scores"}],
       ...(canSeeGroupPronos?[{k:"groupe",l:"👥",lbl:"Groupe"}]:[]),
       {k:"jeux",l:"🎮",lbl:"Jeux"},{k:"chat",l:"💬",lbl:"Chat"},{k:"histo",l:"📋",lbl:"Résultats"}];

  // ── Constantes partagées entre l'onglet Stats (sous-onglet Jeux) et l'onglet Jeux lui-même ──
  const NUMERIC_GAMES = ["quiz","quisuisje","plusmoins","toptrumps","penalty","mystere"]; // exclut "buteur" (score = nom, pas un nombre)
  const ALL_GAMES_LIST = ["quiz","quisuisje","plusmoins","toptrumps","penalty","mystere","buteur"];
  const sameGroupUsers = Object.keys(st.users).filter(u => u !== "admin" && (isAdmin || (st.users[u]||{}).role===role));
  const allNonAdminUsers = Object.keys(st.users).filter(u => u !== "admin");
  const gameScores = st.gameScores || {};
  const gameScoresTotal = st.gameScoresTotal || {};
  const gamePlaysToday = st.gamePlaysToday || {};
  const GAME_LABELS = {quiz:"🧠 Quiz Coupe du Monde",quisuisje:"👤 Qui suis-je ?",plusmoins:"🔢 Plus ou Moins",toptrumps:"🃏 Qui a le plus ?",penalty:"⚽ Tirs au but",mystere:"🧩 Footballeur Mystère",buteur:"🥅 Buteur"};

  const elimPhases=[{k:"seiziemes",l:"1/16"},{k:"huitiemes",l:"1/8"},{k:"quarts",l:"Quarts"},{k:"demis",l:"Demis"},{k:"p3",l:"3e pl."},{k:"finale",l:"Finale"}];
  const todayMatches = MATCHES.filter(m=>m.dk===today);
  const allGroupsValidated = GROUPS.every(g=>(st.validatedGroups[user]||[]).includes(g));

  return (
    <div style={{...t.root, height:"100vh", display:"flex", flexDirection:"column", overflow:"hidden"}}>
      <style>{`
        .app-scroll-area {
          scrollbar-width: thin;
          scrollbar-color: rgba(245,200,66,.4) rgba(255,255,255,.04);
        }
        .app-scroll-area::-webkit-scrollbar {
          width: 6px;
        }
        .app-scroll-area::-webkit-scrollbar-track {
          background: rgba(255,255,255,.04);
        }
        .app-scroll-area::-webkit-scrollbar-thumb {
          background: rgba(245,200,66,.4);
          border-radius: 6px;
        }
        .app-scroll-area::-webkit-scrollbar-thumb:hover {
          background: rgba(245,200,66,.65);
        }
      `}</style>
      {/* HEADER */}
      <div style={{...t.hdr, flexShrink:0, position:"static"}}>
        <div>
          <div style={t.hdrName}>{user.toUpperCase()}</div>
          <div style={t.hdrRole}>
            {isAdmin?"Admin":"Joueur"}
            {locked?" · 🔒":""}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>

          {/* ══ MINI LECTEUR MUSIQUE ══ */}
          {(()=>{
            const tracks = musicSource==="synth" ? TRACKS : MP3_TRACKS;
            const currentIdx = musicSource==="synth" ? trackIdx : mp3Idx;
            const currentName = (tracks[currentIdx]?.name || "—").replace(/^.\s/,"");

            const goPrev = () => {
              const idx=(currentIdx-1+tracks.length)%tracks.length;
              if(musicSource==="synth"){ setAudio(a=>({...a,trackIdx:idx})); currentTrackIdx=idx; if(!_isMuted) switchTrack(idx); }
              else { setAudio(a=>({...a,mp3Idx:idx})); currentMp3Idx=idx; if(!_isMuted) playMp3(idx,playMode==="loop"); }
            };
            const goNext = () => {
              const idx=(currentIdx+1)%tracks.length;
              if(musicSource==="synth"){ setAudio(a=>({...a,trackIdx:idx})); currentTrackIdx=idx; if(!_isMuted) switchTrack(idx); }
              else { setAudio(a=>({...a,mp3Idx:idx})); currentMp3Idx=idx; if(!_isMuted) playMp3(idx,playMode==="loop"); }
            };
            const toggleMute = () => {
              if(!muted){ _isMuted=true; stopAllMusic(); setAudio(a=>({...a,muted:true})); }
              else { _isMuted=false; setAudio(a=>({...a,muted:false}));
                setTimeout(()=>{ if(musicSource==="mp3"){mp3LoopMode=playMode==="loop";playMp3(mp3Idx,mp3LoopMode);}else playBgMusic(); },100);
              }
            };
            const toggleSource = (src) => {
              if(src===musicSource) return;
              stopAllMusic(); setAudio(a=>({...a,musicSource:src}));
              if(!_isMuted) setTimeout(()=>{ if(src==="mp3"){mp3LoopMode=playMode==="loop";playMp3(mp3Idx,mp3LoopMode);}else{currentTrackIdx=trackIdx;playBgMusic();} },150);
            };

            const btnNav = {
              background:"none",border:"none",cursor:"pointer",padding:"4px 6px",
              fontSize:16,lineHeight:1,color:GOLD,fontFamily:"inherit",borderRadius:6,
            };

            return (
              <div style={{
                display:"flex",flexDirection:"column",gap:5,
                background:`linear-gradient(135deg,rgba(255,210,52,.08),rgba(255,140,0,.05))`,
                border:`1px solid rgba(255,210,52,.22)`,
                borderRadius:14,padding:"7px 10px",minWidth:195,
              }}>

                {/* Ligne 1 : Source tabs + mute */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}}>
                  <div style={{display:"flex",gap:3}}>
                    {[{k:"synth",label:"🎵 Synth"},{k:"mp3",label:"🎤 MP3"}].map(s=>(
                      <button key={s.k} onClick={()=>toggleSource(s.k)} style={{
                        padding:"3px 8px",borderRadius:8,fontSize:10,fontWeight:700,
                        border:`1px solid ${musicSource===s.k?GOLD:BRD}`,
                        background:musicSource===s.k?"rgba(255,210,52,.18)":"transparent",
                        color:musicSource===s.k?GOLD:MUTED,
                        cursor:"pointer",fontFamily:"inherit",transition:"all .15s",
                      }}>{s.label}</button>
                    ))}
                  </div>
                  <button onClick={toggleMute} title={muted?"Activer la musique":"Couper la musique"} style={{
                    background:muted?"rgba(255,255,255,.05)":"rgba(255,210,52,.12)",
                    border:`1px solid ${muted?BRD:"rgba(255,210,52,.3)"}`,
                    borderRadius:8,padding:"3px 7px",cursor:"pointer",
                    fontSize:13,lineHeight:1,color:muted?MUTED:GOLD,fontFamily:"inherit",
                  }}>{muted?"🔇":"🔊"}</button>
                </div>

                {/* Ligne 2 : Contrôles lecture */}
                <div style={{display:"flex",alignItems:"center",gap:2}}>
                  <button onClick={goPrev} title="Précédent" style={btnNav}>⏮</button>

                  <div style={{
                    flex:1,textAlign:"center",
                    fontSize:11,fontWeight:700,color:muted?MUTED:GOLD,
                    overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",
                    padding:"0 2px",
                    opacity:muted?.5:1,
                  }}>
                    {muted ? "⏸ En pause" : `▶ ${currentName}`}
                  </div>

                  <button onClick={goNext} title="Suivant" style={btnNav}>⏭</button>

                  {musicSource==="mp3" && (
                    <button
                      title={playMode==="loop"?"🔁 Boucle (cliquer → playlist)":"📋 Playlist (cliquer → boucle)"}
                      onClick={()=>{ const n=playMode==="loop"?"playlist":"loop"; mp3LoopMode=n==="loop"; setAudio(a=>({...a,playMode:n})); }}
                      style={{...btnNav,fontSize:13,color:playMode==="loop"?"#22c55e":MUTED,
                        background:playMode==="loop"?"rgba(34,197,94,.1)":"none",
                        border:`1px solid ${playMode==="loop"?"rgba(34,197,94,.3)":"transparent"}`,
                        borderRadius:6,padding:"3px 5px",
                      }}
                    >{playMode==="loop"?"🔁":"📋"}</button>
                  )}
                </div>
              </div>
            );
          })()}

          <button style={t.btnXS} onClick={doLogout}>Quitter</button>
        </div>
      </div>

      <div ref={contentRef} className="app-scroll-area" style={{...t.wrap, flex:1, minHeight:0, overflowY:"auto", WebkitOverflowScrolling:"touch", paddingBottom:24}}>

        {/* ── HOME ── */}
        {tab==="home" && (
          <div style={{...t.sec, paddingBottom:8}}>

            {/* HERO BANNER */}
            <div style={{
              margin:"12px 0 14px",
              borderRadius:22,
              overflow:"hidden",
              background:"linear-gradient(160deg, #0d1f3c 0%, #0a2a1a 40%, #1a1a0a 100%)",
              border:"1px solid rgba(255,210,52,.3)",
              padding:"22px 16px 18px",
              textAlign:"center",
              position:"relative",
              boxShadow:"0 8px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,210,52,.1)",
            }}>
              {/* Terrain de foot stylisé en arrière-plan */}
              <div style={{
                position:"absolute",inset:0,
                background:"radial-gradient(ellipse 80% 60% at 50% 110%, rgba(46,204,113,.12) 0%, transparent 70%)",
                pointerEvents:"none"
              }}/>
              {/* Lignes terrain */}
              <div style={{
                position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",
                width:120,height:60,borderRadius:"50% 50% 0 0",
                border:"1px solid rgba(255,255,255,.05)",borderBottom:"none",
                pointerEvents:"none"
              }}/>
              <div style={{
                position:"absolute",bottom:0,left:0,right:0,height:1,
                background:"rgba(255,255,255,.05)",pointerEvents:"none"
              }}/>
              {/* Sun glow top */}
              <div style={{
                position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)",
                width:220,height:90,
                background:"radial-gradient(ellipse, rgba(255,210,52,.2) 0%, transparent 70%)",
                pointerEvents:"none"
              }}/>

              {/* 🏆 Easter egg — 5 clics */}
              <div style={{position:"relative",display:"inline-block",marginBottom:6}}
                onClick={()=>{
                  const next = eggClicks+1;
                  setEggClicks(next);
                  if(eggTimer.current) clearTimeout(eggTimer.current);
                  eggTimer.current = setTimeout(()=>setEggClicks(0),2000);
                  if(next>=5){
                    setEggActive(true);
                    playEggMusic();
                    setEggClicks(0);
                    // Mémoriser la découverte pour ne plus proposer le badge
                    if (!(st.seenEgg||{})[user]) {
                      setSt(prev => ({...prev, seenEgg:{...(prev.seenEgg||{}),[user]:true}}));
                      try { localStorage.setItem(KEY, JSON.stringify({...st, seenEgg:{...(st.seenEgg||{}),[user]:true}})); } catch(e) {}
                      if (FB_ENABLED && _fbReady) {
                        _fbUpdate("/", { [`seenEgg/${user}`]: true }).catch(e => console.warn("seenEgg Firebase write error:", e));
                      }
                    }
                    try{[523,659,784,1047,784,1047,1319].forEach((f,i)=>playTone(f,"sine",0.3,0.4,i*0.12));}catch(e){}
                  }
                }}>
                <span style={{
                  fontSize:60,
                  display:"inline-block",
                  cursor:"pointer",
                  userSelect:"none",
                  animation:eggClicks>0&&!eggActive
                    ?`pulse ${0.4-eggClicks*0.05}s ease-in-out infinite`
                    :"sunPulse 3s ease-in-out infinite"
                }}>🏆</span>
                {eggClicks>0&&eggClicks<5&&!eggActive&&(
                  <div style={{position:"absolute",top:-2,right:-2,background:"#ef4444",color:"#fff",
                    borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>{eggClicks}</div>
                )}
                {/* Badge "déjà trouvé" discret — après première découverte */}
                {(st.seenEgg||{})[user] && eggClicks===0 && (
                  <div style={{position:"absolute",top:-4,right:-4,fontSize:10,lineHeight:1}}>🥚</div>
                )}
              </div>
              <div style={{
                fontSize:22,fontWeight:900,
                background:"linear-gradient(90deg, #FFD234, #FF8C00, #FFD234)",
                backgroundSize:"200% auto",
                WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
                letterSpacing:.5,lineHeight:1.1,marginBottom:4,
                animation:"shimmer 3s linear infinite"
              }}>⚽ Coupe du Monde 2026 ⚽</div>

              {/* Pays hôtes */}
              <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:10,marginTop:6}}>
                {[
                  {label:"🇺🇸 USA",   color:"rgba(56,189,248,.8)",  bg:"rgba(56,189,248,.12)",  border:"rgba(56,189,248,.3)"},
                  {label:"🇨🇦 Canada", color:"rgba(255,71,87,.8)",   bg:"rgba(255,71,87,.12)",   border:"rgba(255,71,87,.3)"},
                  {label:"🇲🇽 Mexique",color:"rgba(46,204,113,.8)",  bg:"rgba(46,204,113,.12)",  border:"rgba(46,204,113,.3)"},
                ].map(p=>(
                  <span key={p.label} style={{
                    background:p.bg,border:`1px solid ${p.border}`,
                    borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:p.color
                  }}>{p.label}</span>
                ))}
              </div>

              {/* Dates */}
              <div style={{
                display:"inline-flex",alignItems:"center",gap:8,
                background:"rgba(0,0,0,.35)",borderRadius:10,
                padding:"7px 16px",marginBottom:12,
                border:"1px solid rgba(255,255,255,.08)"
              }}>
                <span style={{fontSize:13,color:"#fff",fontWeight:700}}>11 Juin 2026</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>→</span>
                <span style={{fontSize:13,color:"#fff",fontWeight:700}}>19 Juillet 2026</span>
              </div>

              {/* Status */}
              <div style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>
                {locked?"🔒 Pronostics verrouillés":allPhasesValidated(st.validatedGroups[user]||[])?"✅ Tout est validé 🎉":allGroupsValidated?"✅ Poules validées — fais les élim !":"⚽ Fais tes pronostics par groupe"}
              </div>

              {/* COUNTDOWN temps réel */}
              {(()=>{
                void tick; // force re-render chaque seconde
                const start = new Date("2026-06-11T21:00:00");
                const now2 = new Date();
                const diff = start - now2;
                if(diff<=0) return null;
                const days=Math.floor(diff/86400000);
                const hrs=Math.floor((diff%86400000)/3600000);
                const mins=Math.floor((diff%3600000)/60000);
                const secs=Math.floor((diff%60000)/1000);
                return (
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.3)",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Coup d'envoi dans</div>
                    <div style={{display:"inline-flex",gap:6,background:"linear-gradient(135deg,rgba(255,140,0,.12),rgba(255,210,52,.07))",border:"1px solid rgba(255,210,52,.3)",borderRadius:14,padding:"8px 14px",boxShadow:"0 2px 14px rgba(255,140,0,.12)"}}>
                      {[[days,"j"],[hrs,"h"],[mins,"m"],[secs,"s"]].map(([v,l],i)=>(
                        <div key={l} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                          <div style={{fontSize:22,fontWeight:900,background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontVariantNumeric:"tabular-nums",minWidth:l==="j"?28:22,textAlign:"center",lineHeight:1}}>
                            {String(v).padStart(2,"0")}
                          </div>
                          <div style={{fontSize:8,color:"rgba(255,255,255,.3)",fontWeight:600}}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* SCORE CARD */}
            <div style={{
              borderRadius:18,padding:"16px 14px",marginBottom:14,
              background:"linear-gradient(135deg, rgba(255,210,52,.15) 0%, rgba(255,140,0,.08) 50%, rgba(0,212,170,.06) 100%)",
              border:"1px solid rgba(255,210,52,.35)",
              display:"flex",alignItems:"center",justifyContent:"space-between",
              boxShadow:"0 4px 24px rgba(255,140,0,.12), inset 0 1px 0 rgba(255,210,52,.1)",
              animation:"glowPulse 3s ease-in-out infinite",
            }}>
              <div>
                <div style={{fontSize:11,color:MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Ton score</div>
                <div style={{fontSize:52,fontWeight:900,lineHeight:1,background:GRAD_SUN,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"scorePop .4s ease"}}>{scores[user]||0}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:3}}>points</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:MUTED,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Bons pronos</div>
                <div style={{fontSize:36,fontWeight:900,color:"#22c55e",lineHeight:1}}>{Object.keys(st.results||{}).filter(id=>(preds[id])===st.results[id]).length}</div>
                <div style={{fontSize:11,color:MUTED,marginTop:3}}>/ {Object.keys(st.results||{}).length} joués</div>
              </div>
            </div>

            {/* VERROU — seulement si TOUT est validé (poules + toutes phases élim) */}
            {allPhasesValidated(st.validatedGroups[user]||[]) && !locked && (
              <div style={{
                borderRadius:16,padding:"14px",marginBottom:14,
                background:"rgba(245,200,66,.07)",
                border:"1px solid rgba(245,200,66,.3)",
                textAlign:"center"
              }}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>🔒 Tout est validé !</div>
                <div style={{fontSize:12,color:MUTED,marginBottom:10}}>
                  Poules + toutes phases éliminatoires validées.<br/>Tu peux verrouiller définitivement.
                </div>
                <button style={t.btnLock} onClick={()=>setModal(true)}>Verrouiller définitivement</button>
              </div>
            )}
            {locked && (
              <div style={{...t.aLock,marginBottom:14}}>🔒 Pronostics verrouillés — tu suis tes scores en direct</div>
            )}

            {/* BOUTON PARTAGE */}
            {(scores[user]||0) > 0 && (
              <>
              <button
                onClick={()=>{
                  const total = Object.keys(st.results||{}).length;
                  const good  = Object.keys(st.results||{}).filter(id=>preds[id]===st.results[id]).length;
                  const txt = `🏆 Coupe du Monde 2026 — Pronos\nJe suis à ${scores[user]||0} pts avec ${good}/${total} bons pronostics ! ⚽\nTu joues aussi ?`;
                  soundClick();

                  const showCopied = () => { setShareCopied(true); setTimeout(()=>setShareCopied(false), 2500); };

                  const legacyCopy = () => {
                    try {
                      const ta = document.createElement("textarea");
                      ta.value = txt;
                      Object.assign(ta.style, {position:"fixed",top:0,left:0,opacity:0,pointerEvents:"none"});
                      document.body.appendChild(ta);
                      ta.focus(); ta.select();
                      document.execCommand("copy");
                      document.body.removeChild(ta);
                      showCopied();
                    } catch { showCopied(); }
                  };

                  if (navigator.share) {
                    navigator.share({title:"Mes pronos CdM 2026", text:txt})
                      .catch(e => { if (e?.name !== "AbortError") legacyCopy(); });
                  } else if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(txt).then(showCopied).catch(legacyCopy);
                  } else {
                    legacyCopy();
                  }
                }}
                style={{
                  width:"100%",marginBottom:shareCopied?6:14,
                  background:"transparent",
                  border:`1px solid ${BRD}`,
                  borderRadius:12,padding:"10px",
                  fontSize:13,fontWeight:700,color:MUTED,
                  cursor:"pointer",fontFamily:"inherit",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8
                }}>
                📤 Partager mon score
              </button>
              {shareCopied && (
                <div style={{...t.aOk,marginBottom:14,fontSize:12}}>✅ Score copié dans le presse-papier !</div>
              )}
              </>
            )}

            {/* MATCHS DU JOUR / PROCHAINS — toutes phases */}
            {(()=>{
              const allUpcoming = MATCHES
                .filter(m=>m.dk>=today)
                .sort((a,b)=>a.dk.localeCompare(b.dk)||a.time.localeCompare(b.time));
              const nextDate = allUpcoming[0]?.dk;
              const nextMatches = nextDate
                ? MATCHES.filter(m=>m.dk===nextDate).sort((a,b)=>a.time.localeCompare(b.time))
                : [];
              const isToday = nextDate === today;
              const played = MATCHES.filter(m=>m.dk<today);
              const lastPlayed = played.length>0 ? played[played.length-1] : null;
              return (
                <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,marginTop:4}}>
                    <div style={t.stitle} >
                      {isToday?"📅 Matchs du jour":nextDate?`📅 Prochain — ${allUpcoming[0]?.date}`:"🏁 Tournoi terminé"}
                    </div>
                    <span style={{fontSize:10,color:MUTED}}>{nextMatches.length} match{nextMatches.length>1?"s":""}</span>
                  </div>
                  {nextMatches.length===0
                    ? <div style={{...t.card,textAlign:"center",padding:"18px 14px",background:"rgba(255,255,255,.02)"}}>
                        <div style={{fontSize:28,marginBottom:6}}>🏁</div>
                        <div style={{fontSize:13,color:MUTED}}>Tournoi terminé !</div>
                      </div>
                    : nextMatches.map(m=>(
                        <MatchCard key={m.id} m={m} pred={preds[m.id]}
                          official={(st.results||{})[m.id]} score={(st.scores||{})[m.id]}
                          locked={true} realTeams={(st.elimRealTeams||{})[m.id]}
                          onPick={()=>{}} results={st.results||{}} officialThirds={st.officialThirds||{}} userRole={role} />
                      ))
                  }
                </>
              );
            })()}

            {/* CALENDRIER PAR DATE */}
            <button onClick={()=>setShowCal(!showCal)} style={{
              width:"100%",marginBottom:10,
              background:"transparent",border:`1px solid ${BRD}`,
              borderRadius:12,padding:"9px",fontSize:13,fontWeight:700,
              color:MUTED,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8
            }}>
              📆 {showCal?"Masquer":"Voir"} tous les matchs par date
            </button>
            {showCal && [...new Set(MATCHES.map(m=>m.dk))].sort().map(dk=>{
              const dayMatches=MATCHES.filter(m=>m.dk===dk).sort((a,b)=>a.time.localeCompare(b.time));
              const isPast=dk<today,isNow=dk===today;
              return(
                <div key={dk} style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:isNow?GOLD:isPast?"rgba(255,255,255,.3)":TXT,textTransform:"uppercase",letterSpacing:1,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                    {isNow?"📅":isPast?"✓":"🔜"} {dayMatches[0].date}
                    {isNow&&<span style={{background:GOLD,color:BG,fontSize:9,padding:"1px 6px",borderRadius:4,fontWeight:800}}>AUJOURD'HUI</span>}
                  </div>
                  {dayMatches.map(m=>{
                    const sc=(st.scores||{})[m.id],off=(st.results||{})[m.id],myP=preds[m.id];
                    const rHraw=resolveForCalendar(m.home,m.id,"home"),rAraw=resolveForCalendar(m.away,m.id,"away");
                    // Si équipe non encore déterminée (non dans FLAGS) → label court
                    const rH=FLAGS[rHraw]?rHraw:(m.phase==="poules"?rHraw:"À déterm.");
                    const rA=FLAGS[rAraw]?rAraw:(m.phase==="poules"?rAraw:"À déterm.");
                    const teamFH=FLAGS[rHraw]?F(rHraw):"❓";
                    const teamFA=FLAGS[rAraw]?F(rAraw):"❓";
                    // Score: si officiel avec score → afficher score, sinon résultat, sinon heure
                    const centerLabel = sc ? `${sc.h}–${sc.a}` : off ? (off==="1" ? "V. Dom." : off==="2" ? "V. Ext." : "Nul") : m.time;
                    return(
                      <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",marginBottom:4,borderRadius:10,background:isPast?"rgba(255,255,255,.03)":SURF,border:`1px solid ${isPast?"rgba(255,255,255,.06)":BRD}`,opacity:isPast?.7:1}}>
                        <div style={{flex:1,display:"flex",alignItems:"center",gap:4,minWidth:0}}>
                          <span style={{fontSize:16,flexShrink:0}}>{teamFH}</span>
                          <span style={{fontSize:11,fontWeight:off?700:400,color:off&&off==="1"?GREEN:TXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rH}</span>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",margin:"0 6px",flexShrink:0,minWidth:50}}>
                          <span style={{fontSize:sc?14:11,fontWeight:900,color:off?GOLD:MUTED,textAlign:"center",letterSpacing:.5}}>
                            {sc?`${sc.h} – ${sc.a}`:off?(off==="1"?"1–0":off==="2"?"0–1":"N"):m.time}
                          </span>
                          {myP&&<span style={{fontSize:9,color:off&&myP===off?GREEN:off&&myP!==off?RED:MUTED,fontWeight:700,marginTop:1}}>
                            {myP==="1"?"▲Dom":myP==="2"?"▲Ext":"▲Nul"}
                          </span>}
                        </div>
                        <div style={{flex:1,display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",minWidth:0}}>
                          <span style={{fontSize:11,fontWeight:off?700:400,color:off&&off==="2"?GREEN:TXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right"}}>{rA}</span>
                          <span style={{fontSize:16,flexShrink:0}}>{teamFA}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* ── CARTE DÉFIS EN ATTENTE ── */}
            {(()=>{
              const GAME_SHORT_HOME = {quiz:"Quiz",quisuisje:"Qui suis-je",plusmoins:"Plus/Moins",toptrumps:"Top Trumps",penalty:"Penalty",mystere:"Footballeur Mystère",buteur:"Buteur"};
              const allCh = st.challenges || {};
              const pendingReceived = Object.entries(allCh).filter(([,c])=>
                c.to===user && c.status==="pending"
              );
              const pendingSent = Object.entries(allCh).filter(([,c])=>
                c.from===user && c.status==="pending" && ["quiz","quisuisje","plusmoins","toptrumps","mystere"].includes(c.game)
              );
              const myTurn = Object.entries(allCh).filter(([,c])=>
                c.status==="active" && ((c.from===user&&c.fromScore===null)||(c.to===user&&c.toScore===null))
                || (c.status==="accepted"&&((c.from===user&&c.fromScore===null)||(c.to===user&&c.toScore===null)))
                || (c.game==="penalty"&&c.status==="active"&&c.tireur!=null&&!(c.pick||{})[user])
              );
              const total = pendingReceived.length + myTurn.length + pendingSent.length;
              if (!total) return null;
              return (
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:AMB,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>⚔️ Défis en attente — {total}</div>
                  {pendingReceived.map(([id,ch])=>(
                    <div key={id} style={{...t.card,marginBottom:8,border:`1px solid ${AMB}`,background:"rgba(245,158,11,.08)",padding:"12px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div>
                          <span style={{fontSize:13,fontWeight:800,color:TXT}}>{ch.from?.toUpperCase?.()||ch.from||"?"}</span>
                          <span style={{fontSize:11,color:MUTED}}> te défie au </span>
                          <span style={{fontSize:12,fontWeight:700,color:AMB}}>{GAME_SHORT_HOME[ch.game]||ch.game}</span>
                        </div>
                        <span style={{fontSize:18}}>⚔️</span>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setTab("jeux"); setJeuxSubTab("jouer");}} style={{flex:2,padding:"9px",borderRadius:8,border:"none",background:AMB,color:"#000",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✅ Répondre →</button>
                      </div>
                    </div>
                  ))}
                  {pendingSent.map(([id,ch])=>(
                    <div key={id} style={{...t.card,marginBottom:8,border:`1px solid rgba(255,255,255,.12)`,background:"rgba(255,255,255,.03)",padding:"12px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <span style={{fontSize:11,color:MUTED}}>Défi envoyé à </span>
                          <span style={{fontSize:13,fontWeight:800,color:TXT}}>{ch.to?.toUpperCase?.()||ch.to||"?"}</span>
                          <span style={{fontSize:11,color:MUTED}}> — </span>
                          <span style={{fontSize:12,fontWeight:700,color:MUTED}}>{GAME_SHORT_HOME[ch.game]||ch.game}</span>
                        </div>
                        <span style={{fontSize:11,color:MUTED}}>⏳ En attente</span>
                      </div>
                    </div>
                  ))}
                  {myTurn.map(([id,ch])=>{
                    const opp = ch.from===user?ch.to:ch.from;
                    return (
                      <div key={id} style={{...t.card,marginBottom:8,border:`1px solid ${GOLD}`,background:"rgba(245,200,66,.06)",padding:"12px 14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div>
                            <span style={{fontSize:11,color:MUTED}}>C'est ton tour vs </span>
                            <span style={{fontSize:13,fontWeight:800,color:TXT}}>{opp?.toUpperCase?.()||opp||"?"}</span>
                            <span style={{fontSize:11,color:MUTED}}> — </span>
                            <span style={{fontSize:12,fontWeight:700,color:GOLD}}>{GAME_SHORT_HOME[ch.game]||ch.game}</span>
                          </div>
                          <span style={{fontSize:18}}>🎯</span>
                        </div>
                        <button onClick={()=>{setTab("jeux"); setJeuxSubTab("jouer");}} style={{width:"100%",padding:"9px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>▶️ Jouer mon tour</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={t.divider}/>
            <div style={t.stitle}>📊 Classement</div>
            {isAdmin && (() => {
              const onlineNow = allNonAdminUsers.filter(u => onlinePlayers.includes(u));
              const offlineNow = allNonAdminUsers.filter(u => !onlinePlayers.includes(u));
              if (!allNonAdminUsers.length) return null;
              return (
                <div style={{...t.card, marginBottom:14, padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:GOLD,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>
                    🟢 Joueurs en ligne — {onlineNow.length}/{allNonAdminUsers.length}
                  </div>
                  {onlineNow.length === 0 && (
                    <div style={{fontSize:12,color:MUTED,fontStyle:"italic"}}>Aucun joueur connecté actuellement</div>
                  )}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {[...onlineNow, ...offlineNow].map(u => {
                      const isOn = onlinePlayers.includes(u);
                      const r = (st.users[u]||{}).role;
                      const roleColor = r==="famille"?"#3b82f6":r==="collegues"?"#8b5cf6":"#5a5a7a";
                      return (
                        <div key={u} style={{
                          display:"flex",alignItems:"center",gap:5,
                          padding:"5px 10px",borderRadius:20,
                          background: isOn?"rgba(46,204,113,.1)":"rgba(255,255,255,.04)",
                          border:`1px solid ${isOn?"rgba(46,204,113,.3)":"rgba(255,255,255,.08)"}`,
                        }}>
                          <span style={{fontSize:8,color:isOn?GREEN:MUTED}}>●</span>
                          <span style={{fontSize:11,fontWeight:isOn?700:400,color:isOn?TXT:MUTED}}>{u.toUpperCase()}</span>
                          <span style={{fontSize:9,color:roleColor}}>
                            {r==="famille"?"Fam.":r==="collegues"?"Col.":r==="waiting"?"⏳":"?"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {isAdmin
              ? <><LB filterRole="famille" title="Famille"/><LB filterRole="collegues" title="Collègues"/><LB filterRole="externe" title="Externes"/></>
              : <LB filterRole={role} title="Classement"/>
            }
          </div>
        )}

        {/* ── POULES ── */}
        {tab==="poules" && <>
          {/* ── BARÈME POULES ── */}
          <div style={{
            margin:"0 0 10px 0", padding:"8px 12px", borderRadius:10,
            background:"rgba(245,200,66,.07)", border:"1px solid rgba(245,200,66,.2)",
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:8
          }}>
            <div style={{fontSize:11, color:GOLD, fontWeight:700}}>🏆 Barème</div>
            <div style={{display:"flex", gap:10, alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:16, fontWeight:900, color:GREEN}}>1</div>
                <div style={{fontSize:9, color:MUTED, marginTop:1}}>pt / bon prono</div>
              </div>
              <div style={{fontSize:10, color:MUTED}}>·</div>
              <div style={{fontSize:10, color:MUTED, fontStyle:"italic"}}>
                Résultat exact (1 / Nul / 2)
              </div>
            </div>
          </div>
          <div style={t.tabs}>
            {GROUPS.map(g=>{
              const validated = st.validatedGroups[user]||[];
              const isVal = validated.includes(g);
              const isActive = grp===g;
              const unlocked = isPhaseUnlocked(g, validated);
              return (
                <button key={g} style={{
                  ...t.tab,
                  ...(isActive ? t.tabOn : {}),
                  ...(!isActive && !isVal && unlocked ? {
                    borderColor:"rgba(245,158,11,.5)",
                    color:"#f59e0b",
                    background:"rgba(245,158,11,.08)"
                  } : {}),
                  ...(!isActive && isVal ? {
                    borderColor:"rgba(34,197,94,.4)",
                    color:"#22c55e",
                    background:"rgba(34,197,94,.06)"
                  } : {}),
                  ...(!isActive && !unlocked ? {
                    opacity:.35, cursor:"not-allowed"
                  } : {}),
                }} onClick={()=>{ if(isPhaseUnlocked(g, st.validatedGroups[user]||[])) setGrp(g); }}>
                  {(()=>{
                    const gm = MATCHES.filter(m=>m.group===g&&m.phase==="poules");
                    const done = gm.filter(m=>(st.predictions[user]||{})[m.id]).length;
                    if (!unlocked) return `${g} 🔒`;
                    if (isVal) return `${g} ✓`;
                    if (done>0) return `${g} ${done}/${gm.length}`;
                    return g;
                  })()}
                </button>
              );
            })}
          </div>
          <div style={{...t.sec,animation:"waveIn .25s ease"}}>
            <GroupStandings g={grp}/>
            {(()=>{
              // Un groupe déjà validé par le joueur doit rester verrouillé (non modifiable)
              // tant qu'il n'a pas cliqué "Modifier" pour le déverrouiller explicitement,
              // indépendamment du verrou global finalLock et des phases élim déverrouillées.
              const groupValidated = (st.validatedGroups[user]||[]).includes(grp);
              const groupLocked = locked || groupValidated;
              return MATCHES.filter(m=>m.group===grp&&m.phase==="poules").map(m=>(
                <MatchCard key={m.id} m={m} pred={preds[m.id]} official={(st.results||{})[m.id]} score={(st.scores||{})[m.id]}
                  locked={groupLocked} onPick={pick} results={st.results||{}} officialThirds={st.officialThirds||{}} userThirds={userThirds} userRole={role} />
              ));
            })()}
            <ValidationBox g={grp}/>
            <div style={{height:16}}/>
          </div>
        </>}

        {/* ── ÉLIM ── */}
        {tab==="elim" && (()=>{
          const elimUnlocked = st.elimUnlocked || [];
          const elimRealTeams = st.elimRealTeams || {};
          const phaseOrder = ["seiziemes","huitiemes","quarts","demis","p3","finale"];
          const phaseLabels = {seiziemes:"1/16 de finale",huitiemes:"Huitièmes",quarts:"Quarts",demis:"Demi-finales",p3:"3e place",finale:"Finale"};
          const phaseKeys = {seiziemes:"ELIM_seiziemes",huitiemes:"ELIM_huitiemes",quarts:"ELIM_quarts",demis:"ELIM_demis",p3:"ELIM_p3",finale:"ELIM_finale"};

          if (elimUnlocked.length === 0) return (
            <div style={{...t.sec, paddingTop:40, textAlign:"center"}}>
              <div style={{fontSize:40, marginBottom:16}}>⏳</div>
              <div style={{fontSize:16, fontWeight:700, color:TXT, marginBottom:8}}>Phases éliminatoires</div>
              <div style={{fontSize:13, color:MUTED, lineHeight:1.6}}>
                Les affiches des phases éliminatoires<br/>
                seront débloquées par l'admin<br/>
                au fur et à mesure du tournoi.
              </div>
              <div style={{fontSize:10, color:MUTED, marginTop:14, lineHeight:1.8, background:"rgba(255,255,255,.03)", borderRadius:10, padding:"8px 14px", display:"inline-block"}}>
                Ordre du tournoi :<br/>
                1/16 → 1/8 → Quarts → Demies → 3e place → 🏆 Finale
              </div>
              <div style={{fontSize:11, color:MUTED, marginTop:14, fontStyle:"italic"}}>Reviens ici quand les 1/16 de finale seront connus !</div>
            </div>
          );

          // Barème
          const phaseInfo={seiziemes:{label:"1/16",full:PHASE_POINTS.seiziemes},huitiemes:{label:"1/8",full:PHASE_POINTS.huitiemes},quarts:{label:"QF",full:PHASE_POINTS.quarts},demis:{label:"SF",full:PHASE_POINTS.demis},p3:{label:"3e",full:PHASE_POINTS.p3},finale:{label:"🏆",full:PHASE_POINTS.finale}};

          return (
            <div style={t.sec}>
              {/* Barème compact */}
              <div style={{padding:"8px 10px",borderRadius:10,background:"rgba(245,200,66,.07)",border:"1px solid rgba(245,200,66,.2)",marginBottom:10}}>
                <div style={{fontSize:11,color:GOLD,fontWeight:700,marginBottom:6}}>🏆 Barème — points par bon pronostic</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {elimUnlocked.map(ph=>phaseInfo[ph]&&(
                    <div key={ph} style={{flex:1,minWidth:44,textAlign:"center",padding:"4px",borderRadius:6,background:"rgba(255,255,255,.05)"}}>
                      <div style={{fontSize:10,color:GOLD,fontWeight:700}}>{phaseInfo[ph].label}</div>
                      <div style={{fontSize:13,fontWeight:800,color:"rgba(34,197,94,.9)"}}>{phaseInfo[ph].full} pts</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:9,color:MUTED,marginTop:4}}>Les affiches sont communes à tous — seul le bon résultat compte</div>
              </div>

              {/* Phases déverrouillées — la phase en cours (non encore validée) s'affiche toujours en premier */}
              {(()=>{
                const isLocked = !!st.finalLock[user];
                const validatedKeys = st.validatedGroups[user] || [];
                // Séparer phases à faire (non validées) des phases déjà validées
                const todo  = elimUnlocked.filter(ph => !validatedKeys.includes(phaseKeys[ph]));
                const done  = elimUnlocked.filter(ph =>  validatedKeys.includes(phaseKeys[ph]));
                // Afficher d'abord la phase à faire, puis les phases déjà validées repliées
                const ordered = [...todo, ...done];
                return ordered.map((phase, phIdx) => {
                const matchList = MATCHES.filter(m=>m.phase===phase&&m.group==="ELIM");
                const phLabel = phaseLabels[phase]||phase;
                const valKey = phaseKeys[phase];
                const isValidated = (st.validatedGroups[user]||[]).includes(valKey);
                const canEdit = !isLocked && !isValidated; // 🔒 verrou anti-triche : une fois validé, plus aucune modification possible
                const isDonePhase = isValidated;
                // Replié par défaut si la phase est déjà validée (non déverrouillée)
                const phCollapsed = isDonePhase && !elimCollapsed.has(phase + "_open");
                const toggleCollapse = () => setElimCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(phase + "_open")) next.delete(phase + "_open");
                  else next.add(phase + "_open");
                  return next;
                });

                const validatePhase = () => {
                  if(!canEdit) return;
                  let scopedVG = null;
                  setSt(prev => {
                    const prevVal = (prev.validatedGroups||{})[user] || [];
                    if (prevVal.includes(valKey)) return prev;
                    const updatedVG = [...prevVal, valKey];
                    scopedVG = updatedVG;
                    const ns = {...prev, validatedGroups:{...prev.validatedGroups, [user]:updatedVG}};
                    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                    showNotif("success", `✅ ${phLabel} validés !`);
                    return ns;
                  });
                  // Écriture scopée sur ce seul joueur : ne touche jamais aux validations
                  // des autres joueurs (ex: un autre joueur qui valide une autre phase élim
                  // au même instant, ou l'admin qui verrouille/réinitialise un compte).
                  if (scopedVG && _fbReady) { _fbUpdate("/validatedGroups", {[user]: scopedVG}); trackWrite(`validatedGroups.${user}`, scopedVG); }
                };

                return (
                  <div key={phase} style={{marginBottom:14,opacity:isDonePhase?.85:1}}>
                    <div onClick={isDonePhase ? toggleCollapse : undefined}
                      style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:phCollapsed?0:8,
                        cursor:isDonePhase?"pointer":"default",
                        padding:isDonePhase?"6px 10px":"0",
                        borderRadius:isDonePhase?8:0,
                        background:isDonePhase?"rgba(34,197,94,.06)":undefined,
                        border:isDonePhase?"1px solid rgba(34,197,94,.2)":undefined}}>
                      <div style={{fontSize:13,fontWeight:800,color:isDonePhase?GREEN:GOLD}}>
                        {isDonePhase?"✅ ":""}{phLabel}
                      </div>
                      {isDonePhase
                        ? <span style={{fontSize:10,color:GREEN,fontWeight:700}}>{phCollapsed?"▼ Voir":"▲ Replier"}</span>
                        : isValidated
                          ? <span style={{fontSize:10,color:GREEN,fontWeight:700}}>✅ Validé</span>
                          : canEdit && <span style={{fontSize:10,color:AMB}}>⏳ En attente de validation</span>}
                    </div>
                    {!phCollapsed && (<>
                    {isValidated && (
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",marginBottom:10}}>
                        <span style={{fontSize:16}}>🔒</span>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:RED}}>Pronostics verrouillés</div>
                          <div style={{fontSize:10,color:MUTED}}>Tu as validé cette phase — aucune modification n'est possible</div>
                        </div>
                      </div>
                    )}
                    {matchList.map(m=>{
                      const realHome = elimRealTeams[m.id]?.home || m.home;
                      const realAway = elimRealTeams[m.id]?.away || m.away;
                      const official = (st.results||{})[m.id];
                      const myPred = (preds||{})[m.id];
                      const correct = official && myPred === official;
                      const wrong = official && myPred && myPred !== official;

                      // ── FINALE : panneau spécial joueur ──
                      if (m.id === "FIN") {
                        const finOfficial = st.finaleData?.official;
                        const finMine = st.finaleData?.predictions?.[user];
                        const finLocked = !canEdit;
                        // Révéler dès que l'admin a saisi un résultat complet (winner présent)
                        // On n'attend pas le verrouillage individuel — la finale est publique une fois jouée
                        const finRevealed = !!(finOfficial && finOfficial.winner);
                        const finPts = finRevealed ? calcFinalePoints(finOfficial, finMine) : null;
                        const winnerModeOk = finRevealed && finMine?.winner &&
                          finOfficial.winner === finMine.winner && finOfficial.mode === finMine.mode;
                        const scoreOk = winnerModeOk &&
                          finOfficial.scoreH != null && finOfficial.scoreA != null &&
                          finMine?.scoreH != null && finMine?.scoreA != null &&
                          Number(finOfficial.scoreH) === Number(finMine.scoreH) && Number(finOfficial.scoreA) === Number(finMine.scoreA);
                        const normFin=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g," ").trim();
                        const levFin=(a,b)=>{const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[m][n];};
                        const isMFin=(g,r)=>{const gn=normFin(g),rn=normFin(r);if(!gn||!rn)return false;const thr=Math.min(rn.length,gn.length)<=5?1:2;if(levFin(gn,rn)<=thr)return true;const ln=(rn.split(" ").filter(Boolean));const last=ln[ln.length-1];return last&&last.length>=3&&levFin(gn,last)<=1;};
                        const offButeursUniq=[...new Set((finOfficial?.buteurs||[]).map(b=>normFin(b)).filter(Boolean))];
                        const myButeursMatched = finRevealed ? offButeursUniq.filter(r=>(finMine?.buteurs||[]).some(g=>isMFin(g,r))) : [];
                        return (
                          <div key={m.id}>
                            <FinalePanel m={m} isAdmin={false} homeT={realHome} awayT={realAway}
                              official={finRevealed ? finOfficial : null} myPick={finMine}
                              onSave={saveFinalePrediction} locked={finLocked}
                              officialButeurs={finRevealed ? finOfficial?.buteurs : null}/>
                          {/* ── Résultat officiel + comparaison avec le pronostic du joueur ── */}
                          {finRevealed && (() => {
                            const offWinner = finOfficial.winner==="home" ? realHome : realAway;
                            const modeLabel = {reg:"Victoire 90 min", prolong:"Victoire après prolongation", tab:"Victoire aux tirs au but", draw:"Match nul"}[finOfficial.mode] || finOfficial.mode;
                            const myWinner  = finMine?.winner ? (finMine.winner==="home" ? realHome : realAway) : null;
                            const myModeLabel = finMine?.mode ? ({reg:"Victoire 90 min", prolong:"Victoire après prolongation", tab:"Victoire aux tirs au but", draw:"Match nul"}[finMine.mode]||finMine.mode) : null;
                            const hasScore  = finOfficial.scoreH != null && finOfficial.scoreA != null;
                            const hasButeurs = (finOfficial.buteurs||[]).length > 0;
                            return (
                              <div style={{marginTop:12,borderRadius:12,overflow:"hidden",border:`2px solid ${finPts>0?"rgba(34,197,94,.4)":"rgba(239,68,68,.3)"}`}}
                                ref={el=>{if(el&&!trumpetFiredRef.current&&finPts>0){trumpetFiredRef.current=true;soundTrumpetVictory();}}}>

                                {/* En-tête total points */}
                                <div style={{padding:"10px 14px",textAlign:"center",
                                  background:finPts>0?"rgba(34,197,94,.12)":"rgba(239,68,68,.08)"}}>
                                  <div style={{fontSize:22,fontWeight:900,color:finPts>0?GREEN:RED}}>
                                    {finPts>0 ? `🏆 +${finPts} pts` : "❌ 0 pt"}
                                  </div>
                                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                                    {finPts>0 ? "Bravo pour ton pronostic finale !" : !finMine?.winner ? "Aucun pronostic enregistré" : "Pronostic finale manqué"}
                                  </div>
                                </div>

                                {/* Résultat officiel */}
                                <div style={{padding:"10px 14px",background:"rgba(255,255,255,.03)",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                                  <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>📋 Résultat officiel</div>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                    <span style={{fontSize:18}}>{FLAGS[offWinner]||"🏳️"}</span>
                                    <span style={{fontSize:13,fontWeight:800,color:GOLD}}>{offWinner}</span>
                                    <span style={{fontSize:10,color:MUTED}}>· {modeLabel}</span>
                                  </div>
                                  {hasScore && (
                                    <div style={{fontSize:11,color:MUTED,marginBottom:4}}>
                                      Score 90 min : <strong style={{color:TXT}}>{finOfficial.scoreH} – {finOfficial.scoreA}</strong>
                                    </div>
                                  )}
                                  {hasButeurs && (
                                    <div style={{fontSize:11,color:MUTED}}>
                                      Buteurs : <strong style={{color:TXT}}>{finOfficial.buteurs.join(", ")}</strong>
                                    </div>
                                  )}
                                </div>

                                {/* Ce que le joueur avait mis */}
                                {finMine?.winner && (
                                  <div style={{padding:"10px 14px",background:"rgba(255,255,255,.02)",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                                    <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>🎯 Ton pronostic</div>
                                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                      <span style={{fontSize:18}}>{FLAGS[myWinner]||"🏳️"}</span>
                                      <span style={{fontSize:13,fontWeight:700,color:winnerModeOk?GREEN:RED}}>{myWinner}</span>
                                      {myModeLabel && <span style={{fontSize:10,color:MUTED}}>· {myModeLabel}</span>}
                                      <span style={{fontSize:14,marginLeft:"auto"}}>{winnerModeOk?"✅":"❌"}</span>
                                    </div>
                                    {(finMine.scoreH!=null&&finMine.scoreA!=null) && (
                                      <div style={{fontSize:11,color:MUTED,marginBottom:4,display:"flex",justifyContent:"space-between"}}>
                                        <span>Score : <strong style={{color:scoreOk?GREEN:TXT}}>{finMine.scoreH} – {finMine.scoreA}</strong></span>
                                        <span style={{fontSize:14}}>{scoreOk?"✅":"❌"}</span>
                                      </div>
                                    )}
                                    {(finMine.buteurs||[]).filter(Boolean).length>0 && (
                                      <div style={{fontSize:11,color:MUTED,display:"flex",justifyContent:"space-between"}}>
                                        <span>Buteurs : <strong style={{color:TXT}}>{(finMine.buteurs||[]).filter(Boolean).join(", ")}</strong></span>
                                        <span style={{fontSize:14}}>{myButeursMatched.length>0?"✅":"❌"}</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Détail des points */}
                                <div style={{padding:"10px 14px",background:"rgba(255,255,255,.02)",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                                  <div style={{fontSize:10,color:MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>💰 Détail des points</div>
                                  {[
                                    {ok:winnerModeOk,  label:"Vainqueur + issue correcte", pts:PHASE_POINTS.finale},
                                    {ok:scoreOk,       label:"Score exact (90 min)",        pts:FINALE_BONUS_SCORE},
                                    ...(myButeursMatched.length>0 ? myButeursMatched.slice(0,2).map(b=>({ok:true, label:`Buteur : ${b}`, pts:FINALE_BONUS_BUTEUR})) : hasButeurs ? [{ok:false, label:"Buteur(s)", pts:FINALE_BONUS_BUTEUR}] : []),
                                  ].map((row,i)=>(
                                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,fontSize:11}}>
                                      <span style={{fontSize:13}}>{row.ok?"✅":"❌"}</span>
                                      <span style={{flex:1,color:row.ok?TXT:MUTED}}>{row.label}</span>
                                      <span style={{fontWeight:800,color:row.ok?GREEN:MUTED}}>{row.ok?`+${row.pts} pts`:"—"}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {finLocked && (!finMine || !finMine.winner) && (
                            <div style={{textAlign:"center",marginTop:8,padding:"8px",borderRadius:8,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.25)",fontSize:12,color:RED}}>
                              ❌ Aucun pronostic enregistré pour la finale
                            </div>
                          )}
                          </div>
                        );
                      }

                      return (
                        <div key={m.id} style={{...t.card,marginBottom:8,padding:"10px 12px",background:correct?"rgba(34,197,94,.08)":wrong?"rgba(239,68,68,.08)":"rgba(255,255,255,.04)",border:`1px solid ${correct?"rgba(34,197,94,.3)":wrong?"rgba(239,68,68,.3)":"rgba(255,255,255,.08)"}`}}>
                          <div style={{fontSize:10,color:MUTED,marginBottom:8}}>{m.date} · {m.time} · {m.city}</div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:canEdit?10:0}}>
                            <div style={{flex:1,textAlign:"center"}}>
                              <div style={{fontSize:22}}>{FLAGS[realHome]||"🏳️"}</div>
                              <div style={{fontSize:11,fontWeight:700,color:TXT,marginTop:2}}>{realHome}</div>
                            </div>
                            <div style={{textAlign:"center"}}>
                              {official
                                ? <div style={{fontSize:12,fontWeight:800,color:correct?GREEN:wrong?RED:GOLD,textAlign:"center",lineHeight:1.2}}>
                                    {official==="1"? `✓ ${realHome.split(" ")[0]}` : official==="2" ? `✓ ${realAway.split(" ")[0]}` : "Nul"}
                                  </div>
                                : <div style={{fontSize:11,color:MUTED}}>VS</div>}
                            </div>
                            <div style={{flex:1,textAlign:"center"}}>
                              <div style={{fontSize:22}}>{FLAGS[realAway]||"🏳️"}</div>
                              <div style={{fontSize:11,fontWeight:700,color:TXT,marginTop:2}}>{realAway}</div>
                            </div>
                          </div>
                          {canEdit && (
                            <div style={{display:"flex",gap:6}}>
                              {["1","2"].map(v=>(
                                <button key={v} onClick={()=>{
                                  let scopedPreds = null;
                                  setSt(prev => {
                                    const prevPreds = (prev.predictions||{})[user] || {};
                                    const updatedPreds = {...prevPreds, [m.id]:v};
                                    scopedPreds = updatedPreds;
                                    const ns = {...prev, predictions:{...prev.predictions, [user]:updatedPreds}};
                                    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                    return ns;
                                  });
                                  // Écriture scopée : ne touche jamais aux pronostics des autres
                                  // joueurs, ni aux scores saisis par l'admin au même instant.
                                  if (_fbReady) { _fbUpdate(`/predictions/${user}`, {[m.id]: v}); trackWrite(`predictions.${user}.${m.id}`, v); }
                                }}                                  style={{flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11,transition:"all .15s",
                                    background:myPred===v?"rgba(245,200,66,.25)":"rgba(255,255,255,.06)",
                                    color:myPred===v?GOLD:MUTED,
                                    boxShadow:myPred===v?`0 0 0 2px ${GOLD}`:"none"}}>
                                  {v==="1"?`${FLAGS[realHome]||"🏳️"} ${realHome}`:`${FLAGS[realAway]||"🏳️"} ${realAway}`}
                                </button>
                              ))}
                            </div>
                          )}
                          {myPred && official && (
                            <div style={{textAlign:"center",fontSize:11,marginTop:6,color:correct?GREEN:wrong?RED:MUTED}}>
                              {correct?"✅ Bon pronostic !":wrong?`❌ Tu avais ${myPred==="1"?realHome:realAway}`:""}
                            </div>
                          )}
                          {myPred && !official && (
                            <div style={{textAlign:"center",fontSize:10,color:MUTED,marginTop:4}}>
                              Ton prono : {myPred==="1"?`${FLAGS[realHome]||"🏳️"} ${realHome}`:`${FLAGS[realAway]||"🏳️"} ${realAway}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {canEdit && matchList.every(m=>(preds||{})[m.id]) && (
                      <button onClick={validatePhase} style={{width:"100%",padding:"12px",borderRadius:10,border:`1px solid ${GOLD}`,background:"rgba(245,200,66,.15)",color:GOLD,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
                        ✅ Valider {phLabel}
                      </button>
                    )}
                    </>)}
                  </div>
                );
              }); // fin ordered.map
              })()}
            </div>
          );
        })()}


        {tab==="chat" && (
          <div style={{...t.sec,animation:"waveIn .25s ease"}}>
            {!validChatRole && !isAdmin && (
              <div style={t.aWarn}>⏳ Tu dois être assigné à un groupe pour accéder au chat.</div>
            )}
            {/* Sélecteur de groupe pour l'admin */}
            {isAdmin && (
              <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
                <span style={{fontSize:12,color:MUTED,fontWeight:600}}>✍️ Écrire dans :</span>
                {["famille","collegues","externe"].map(g=>(
                  <button key={g} onClick={()=>setAdminChatGroup(g)} style={{
                    padding:"6px 14px",borderRadius:10,fontSize:12,fontWeight:700,
                    border:`1px solid ${adminChatGroup===g?GOLD:BRD}`,
                    background:adminChatGroup===g?"rgba(255,210,52,.15)":SURF2,
                    color:adminChatGroup===g?GOLD:MUTED,cursor:"pointer",fontFamily:"inherit",
                  }}>{g==="famille"?"👨‍👩‍👧 Famille":g==="collegues"?"💼 Collègues":"🌐 Externes"}</button>
                ))}
              </div>
            )}
            {validChatRole && (<>
              {/* En ligne — filtré par même groupe */}
              {(()=>{
                const sameGroupOnline = onlinePlayers.filter(u =>
                  u !== user && (st.users[u]||{}).role === validChatRole
                );
                if (sameGroupOnline.length === 0) return null;
                return (
                  <div style={{...t.card,padding:"8px 14px",marginBottom:10,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",background:"rgba(46,204,113,.06)",borderColor:"rgba(46,204,113,.25)"}}>
                    <span style={{fontSize:10,color:GREEN,fontWeight:700}}>🟢 En ligne :</span>
                    {sameGroupOnline.map(u=>(
                      <span key={u} style={{fontSize:11,background:"rgba(46,204,113,.12)",border:"1px solid rgba(46,204,113,.25)",borderRadius:10,padding:"2px 8px",color:GREEN,fontWeight:600}}>
                        {u}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Chat général du groupe uniquement */}
              <div style={{...t.card,padding:0,overflow:"hidden",marginBottom:12}}>
                <ChatBox matchId={null} title="💬 Chat du groupe" getChatMsgs={getChatMsgs} addReaction={addReaction} validChatRole={validChatRole} user={user} st={st} save={save} chatEnabled={st.chatEnabled} sendChat={sendChat}/>
              </div>

            </>)}
          </div>
        )}

        {tab==="scores" && (()=>{
          // Son si on est en tête
          const myScore = scores[user]||0;
          const peers = Object.keys(st.users).filter(u=>st.users[u].role===role&&u!=="admin");
          const isLeading = peers.length>1 && myScore>0 && peers.every(u=>u===user||(scores[u]||0)<=myScore);
          const challenges = st.challenges || {};
          const DAILY_PLAY_LIMIT = 999; // pas de limite quotidienne // doit rester synchronisé avec la valeur utilisée dans l'onglet Jeux

          // ── Sous-onglet "Pronos du groupe par match" ──
          function MatchStatsBlock() {
            const groupUsers = isAdmin ? allNonAdminUsers : sameGroupUsers.concat(sameGroupUsers.includes(user)?[]:[user]);
            const resultTs = st.resultTs || {};
            const playedMatches = [...MATCHES.filter(m => (st.results||{})[m.id])].sort((a,b) => {
              const tsA = resultTs[a.id] || 0;
              const tsB = resultTs[b.id] || 0;
              if (tsA !== tsB) return tsB - tsA; // plus récemment saisi en premier
              return MATCHES.indexOf(b) - MATCHES.indexOf(a); // fallback : ordre calendrier inversé
            });
            if (!playedMatches.length) return <div style={t.empty}>Les stats par match apparaîtront dès le premier résultat officiel. ⚽</div>;
            return (
              <div>
                {playedMatches.map(m => {
                  const official = st.results[m.id];
                  const voters = groupUsers.filter(u => (st.predictions[u]||{})[m.id]);
                  const correct = voters.filter(u => (st.predictions[u]||{})[m.id]===official);
                  const pct = voters.length ? Math.round(correct.length/voters.length*100) : 0;
                  return (
                    <div key={m.id} style={{...t.card,marginBottom:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        {(()=>{
                          const rH = (st.elimRealTeams||{})[m.id]?.home || m.home;
                          const rA = (st.elimRealTeams||{})[m.id]?.away || m.away;
                          return <span style={{fontSize:12,fontWeight:700}}>{F(rH)} {rH} - {rA} {F(rA)}</span>;
                        })()}
                        <span style={{fontSize:11,fontWeight:800,color:pct>=50?GREEN:pct>0?AMB:MUTED}}>{correct.length}/{voters.length} ({pct}%)</span>
                      </div>
                      <div style={{background:"rgba(255,255,255,.06)",borderRadius:6,height:5,overflow:"hidden",marginBottom:6}}>
                        <div style={{height:"100%",width:pct+"%",background:pct>=50?GREEN:AMB,transition:"width .3s"}}/>
                      </div>
                      {voters.length>0 && (
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {voters.map(u=>{
                            const ok = (st.predictions[u]||{})[m.id]===official;
                            return (
                              <span key={u} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:5,
                                background:ok?"rgba(46,204,113,.12)":"rgba(231,76,60,.1)",color:ok?GREEN:"#e74c3c"}}>
                                {ok?"✓":"✗"} {u.toUpperCase()}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          // ── Sous-onglet "Jeux" (admin uniquement) : stats avancées des jeux ──
          function GamesStatsBlock() {
            return (
              <div>
                <div style={{fontSize:12,color:MUTED,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>🏅 Meilleur score — 1 partie</div>
                {NUMERIC_GAMES.map(g=>{
                  const rows=allNonAdminUsers.map(u=>({u,score:(gameScores[g]||{})[u]})).filter(r=>typeof r.score==="number").sort((a,b)=>b.score-a.score);
                  return (
                    <div key={g} style={{marginBottom:14}}>
                      <div style={{fontSize:11,color:GOLD,fontWeight:700,marginBottom:6}}>{GAME_LABELS[g]}</div>
                      {rows.length===0 ? (
                        <div style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Personne n'a encore joué</div>
                      ) : rows.map((r,i)=>(
                        <div key={r.u} style={{...t.card,marginBottom:5,display:"flex",alignItems:"center",gap:10,padding:"6px 12px",background:"rgba(255,255,255,.04)"}}>
                          <div style={{fontSize:13,fontWeight:900,color:i===0?GOLD:i===1?"#94a3b8":i===2?"#cd7f32":MUTED,width:18}}>{i+1}</div>
                          <div style={{flex:1,fontSize:11,color:TXT}}>{r.u.toUpperCase()}</div>
                          <div style={{fontSize:12,fontWeight:700,color:GOLD}}>{r.score} pts</div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                <div style={{marginTop:14,marginBottom:14}}>
                  <div style={{fontSize:12,color:MUTED,marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>📈 Score cumulé — total</div>
                  {allNonAdminUsers.map(u=>({
                    u,total:NUMERIC_GAMES.reduce((s,g)=>s+((typeof (gameScoresTotal[g]||{})[u]==="number"?(gameScoresTotal[g]||{})[u]:0)),0)
                  })).sort((a,b)=>b.total-a.total).map((entry,i)=>(
                    <div key={entry.u} style={{...t.card,marginBottom:6,display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,.04)"}}>
                      <div style={{fontSize:14,fontWeight:900,color:i===0?"#60a5fa":i===1?"#94a3b8":i===2?"#cd7f32":MUTED,width:20}}>{i+1}</div>
                      <div style={{flex:1,fontSize:12,color:TXT}}>{entry.u.toUpperCase()}</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>{entry.total} pts</div>
                    </div>
                  ))}
                </div>

                <div style={{fontSize:12,color:MUTED,marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>🎯 Activité quotidienne (parties jouées aujourd'hui)</div>
                {ALL_GAMES_LIST.map(g=>{
                  const dayUsers = allNonAdminUsers.filter(u => {
                    const v = (gamePlaysToday[g]||{})[u];
                    return v && v.date===todayKey() && v.count>0;
                  });
                  const totalToday = dayUsers.reduce((s,u)=>s+((gamePlaysToday[g]||{})[u]?.count||0), 0);
                  return (
                    <div key={g} style={{...t.card,marginBottom:6,padding:"8px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,fontWeight:700}}>{GAME_LABELS[g]}</span>
                        <span style={{fontSize:11,fontWeight:800,color:GOLD}}>{totalToday} partie{totalToday>1?"s":""}</span>
                      </div>
                      {dayUsers.length>0 && (
                        <div style={{fontSize:9,color:MUTED,marginTop:4}}>
                          {dayUsers.map(u=>`${u.toUpperCase()} (${(gamePlaysToday[g]||{})[u]?.count||0}/${DAILY_PLAY_LIMIT})`).join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{fontSize:12,color:MUTED,margin:"16px 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>⚔️ Défis — vue d'ensemble</div>
                {(()=>{
                  const allCh = Object.values(challenges);
                  const pending = allCh.filter(c=>c.status==="pending").length;
                  const active = allCh.filter(c=>c.status==="active").length;
                  const done = allCh.filter(c=>c.fromScore!=null && c.toScore!=null).length;
                  const declined = allCh.filter(c=>c.status==="declined").length;
                  return (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                      <div style={{...t.card,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:18,fontWeight:900,color:AMB}}>{pending}</div>
                        <div style={{fontSize:9,color:MUTED}}>En attente</div>
                      </div>
                      <div style={{...t.card,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:18,fontWeight:900,color:GOLD}}>{active}</div>
                        <div style={{fontSize:9,color:MUTED}}>En cours</div>
                      </div>
                      <div style={{...t.card,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:18,fontWeight:900,color:GREEN}}>{done}</div>
                        <div style={{fontSize:9,color:MUTED}}>Terminés</div>
                      </div>
                      <div style={{...t.card,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:18,fontWeight:900,color:"#e74c3c"}}>{declined}</div>
                        <div style={{fontSize:9,color:MUTED}}>Refusés</div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{fontSize:12,color:MUTED,marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>👤 Détail par joueur</div>
                {allNonAdminUsers.map(u=>{
                  const totalPlays = ALL_GAMES_LIST.reduce((s,g)=>{
                    const v=(gamePlaysToday[g]||{})[u];
                    return s + ((v&&v.date===todayKey())?v.count:0);
                  },0);
                  const sentChallenges = Object.values(challenges).filter(c=>c.from===u).length;
                  const totalCumul = NUMERIC_GAMES.reduce((s,g)=>s+((typeof (gameScoresTotal[g]||{})[u]==="number"?(gameScoresTotal[g]||{})[u]:0)),0);
                  return (
                    <button key={u} onClick={()=>setStatsMatchPlayer(statsMatchPlayer===u?null:u)} style={{...t.card,marginBottom:6,width:"100%",textAlign:"left",cursor:"pointer",border:"1px solid rgba(255,255,255,.08)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,fontWeight:800}}>{u.toUpperCase()}</span>
                        <span style={{fontSize:11,color:"#60a5fa",fontWeight:700}}>{totalCumul} pts cumulés</span>
                      </div>
                      {statsMatchPlayer===u && (
                        <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,.08)",display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{fontSize:10,color:MUTED}}>🎮 Parties jouées aujourd'hui : <strong style={{color:TXT}}>{totalPlays}</strong></div>
                          <div style={{fontSize:10,color:MUTED}}>⚔️ Défis envoyés au total : <strong style={{color:TXT}}>{sentChallenges}</strong></div>
                          {NUMERIC_GAMES.map(g=>{
                            const best=(gameScores[g]||{})[u];
                            if (typeof best!=="number") return null;
                            return <div key={g} style={{fontSize:10,color:MUTED}}>{GAME_LABELS[g]} — meilleur : <strong style={{color:GOLD}}>{best} pts</strong></div>;
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          }

          const scoresTabs = isAdmin
            ? [{k:"pronos",l:"🏆 Pronos"},{k:"parmatch",l:"⚽ Par match"},{k:"jeux",l:"🎮 Jeux"}]
            : [{k:"pronos",l:"🏆 Pronos"},{k:"parmatch",l:"⚽ Par match"}];

          return (
            <div style={t.sec}>
              <div style={{height:16}}/>
              {isLeading && !isAdmin && scoresSubTab==="pronos" && (
                <div style={{
                  background:"linear-gradient(135deg,rgba(245,200,66,.15),rgba(255,140,0,.08))",
                  border:"1px solid rgba(245,200,66,.4)",borderRadius:16,
                  padding:"14px 16px",marginBottom:14,textAlign:"center",
                  animation:"pulse 2s infinite"
                }}>
                  <div style={{fontSize:32,marginBottom:4}}>🏆</div>
                  <div style={{fontSize:14,fontWeight:900,color:GOLD}}>Tu mènes le classement !</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:4}}>{myScore} pts — Continue comme ça 🔥</div>
                </div>
              )}

              {/* Switcher sous-onglets */}
              <div style={{display:"flex",gap:6,marginBottom:14,background:"rgba(255,255,255,.04)",borderRadius:10,padding:4}}>
                {scoresTabs.map(s=>(
                  <button key={s.k} onClick={()=>setScoresSubTab(s.k)} style={{flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit",
                    background:scoresSubTab===s.k?GOLD:"transparent",color:scoresSubTab===s.k?"#0a0e1a":MUTED}}>{s.l}</button>
                ))}
              </div>

              {scoresSubTab==="pronos" && (
                isAdmin
                  ? <><LB filterRole="famille" title="Famille"/><LB filterRole="collegues" title="Collègues"/><LB filterRole="externe" title="Externes"/></>
                  : <LB filterRole={role} title="Classement"/>
              )}

              {scoresSubTab==="parmatch" && (()=>{
                const hasResults = Object.keys(st.results||{}).length > 0;
                if (!hasResults) return (
                  <div style={t.empty}>Les stats par match apparaîtront dès le premier résultat officiel. ⚽</div>
                );
                return <MatchStatsBlock/>;
              })()}

              {scoresSubTab==="jeux" && isAdmin && <GamesStatsBlock/>}
            </div>
          );
        })()}

        {/* ── GROUPE : pronos des coéquipiers (visible une fois soi-même verrouillé) ── */}
        {tab==="groupe" && canSeeGroupPronos && (()=>{
          const teammates = Object.keys(st.users).filter(u => u!=="admin" && u!==user && (st.users[u]||{}).role===role);
          const selected = groupPronoPlayer && teammates.includes(groupPronoPlayer) ? groupPronoPlayer : null;

          if (!teammates.length) {
            return (
              <div style={t.sec}>
                <div style={{height:16}}/>
                <div style={{...t.card,textAlign:"center",padding:24}}>
                  <div style={{fontSize:32,marginBottom:8}}>👥</div>
                  <div style={{fontSize:13,color:MUTED}}>Aucun autre joueur dans ton groupe pour l'instant.</div>
                </div>
              </div>
            );
          }

          if (!selected) {
            return (
              <div style={t.sec}>
                <div style={{height:16}}/>
                <div style={{fontSize:12,color:MUTED,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>
                  Voir les pronos de :
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {teammates.map(u=>{
                    const uLocked = !!st.finalLock[u];
                    const uValidated = allPhasesValidated(st.validatedGroups[u]||[]) || uLocked;
                    return (
                      <button key={u} disabled={!uValidated} onClick={()=>setGroupPronoPlayer(u)}
                        style={{...t.card,display:"flex",alignItems:"center",justifyContent:"space-between",
                          cursor:uValidated?"pointer":"default",opacity:uValidated?1:.5,textAlign:"left",
                          border:"1px solid rgba(255,255,255,.08)"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{fontSize:20}}>{onlinePlayers.includes(u)?"🟢":"⚪"}</div>
                          <div>
                            <div style={{fontWeight:800,fontSize:14}}>{u.toUpperCase()}</div>
                            <div style={{fontSize:11,color:MUTED}}>
                              {uLocked ? "🔒 Pronos verrouillés" : uValidated ? "✅ Tout validé" : "⏳ Pas encore terminé"}
                            </div>
                          </div>
                        </div>
                        <div style={{fontWeight:800,color:GOLD,fontSize:13}}>{scores[u]||0} pts</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          // ── Détail des pronos du coéquipier sélectionné ──
          const uPreds = st.predictions[selected] || {};
          const uThirds = (st.thirdPicks||{})[selected] || {};
          // Priorité à l'affiche officielle admin (elimRealTeams) — sinon recalcul via pronos du joueur affiché
          const resolve = (team, matchId, side) => {
            const real = (st.elimRealTeams||{})[matchId];
            if (real && real[side]) return real[side];
            return resolveTeamWithPredictions(team, st.results||{}, uPreds, st.scores||{}, st.officialThirds||{}, uThirds);
          };

          return (
            <div style={t.sec}>
              <div style={{height:16}}/>
              <button onClick={()=>setGroupPronoPlayer(null)} style={{...t.btnXS,marginBottom:12}}>← Tous les joueurs</button>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontWeight:900,fontSize:16}}>{selected.toUpperCase()}</div>
                <div style={{fontWeight:800,color:GOLD,fontSize:14}}>{scores[selected]||0} pts</div>
              </div>

              <div style={{fontSize:11,color:MUTED,marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>⚽ Phase de poules</div>
              {GROUPS.map(g=>{
                const gm = MATCHES.filter(m=>m.group===g && m.phase==="poules");
                if (!gm.some(m=>uPreds[m.id])) return null;
                return (
                  <div key={g} style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:800,color:GOLD,marginBottom:4}}>Groupe {g}</div>
                    {gm.map(m=>{
                      const p = uPreds[m.id];
                      if (!p) return null;
                      const official = st.results?.[m.id];
                      const correct = official && p===official;
                      const wrong = official && p!==official;
                      const label = p==="1" ? m.home : p==="2" ? m.away : "Match nul";
                      return (
                        <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          padding:"6px 10px",borderRadius:8,marginBottom:4,fontSize:12,
                          background:correct?"rgba(46,204,113,.1)":wrong?"rgba(231,76,60,.08)":"rgba(255,255,255,.04)"}}>
                          <span>{F(m.home)} {m.home} - {m.away} {F(m.away)}</span>
                          <span style={{fontWeight:700,color:correct?GREEN:wrong?"#e74c3c":TXT}}>
                            {p==="N"?"🤝 Nul":`${F(label)} ${label}`}{correct?" ✓":wrong?" ✗":""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              <div style={{fontSize:11,color:MUTED,margin:"14px 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>🏆 Phase éliminatoire</div>
              {elimPhases.map(ph=>{
                const pm = MATCHES.filter(m=>m.group==="ELIM" && m.phase===ph.k);
                if (!pm.some(m=>uPreds[m.id])) return null;
                return (
                  <div key={ph.k} style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:800,color:GOLD,marginBottom:4}}>{ph.l}</div>
                    {pm.map(m=>{
                      // ── FINALE : affichage enrichi (déroulé, score, buteurs) ──
                      if (m.id === "FIN") {
                        const finPred = st.finaleData?.predictions?.[selected];
                        if (!finPred || !finPred.winner) return null;
                        const finOfficial = st.finaleData?.official;
                        const homeR = resolve(m.home, m.id, "home");
                        const awayR = resolve(m.away, m.id, "away");
                        const winnerName = finPred.winner==="home" ? homeR : awayR;
                        const modeLabel = finPred.mode==="reg" ? "temps réglementaire"
                          : finPred.mode==="prolong" ? "après prolongation"
                          : finPred.mode==="tab" ? "aux tirs au but" : "";
                        const winnerModeOk = finOfficial?.winner && finOfficial.winner===finPred.winner && finOfficial.mode===finPred.mode;
                        const scoreOk = winnerModeOk && finOfficial.scoreH!=null && finOfficial.scoreA!=null
                          && finPred.scoreH!=null && finPred.scoreA!=null
                          && Number(finOfficial.scoreH)===Number(finPred.scoreH) && Number(finOfficial.scoreA)===Number(finPred.scoreA);
                        const hasResult = !!(finOfficial && finOfficial.winner);
                        return (
                          <div key={m.id} style={{padding:"10px 12px",borderRadius:8,marginBottom:4,fontSize:12,
                            background:hasResult?(winnerModeOk?"rgba(46,204,113,.1)":"rgba(231,76,60,.08)"):"rgba(255,255,255,.04)"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                              <span>{F(homeR)} {homeR} - {awayR} {F(awayR)}</span>
                              <span style={{fontWeight:700,color:hasResult?(winnerModeOk?GREEN:"#e74c3c"):TXT}}>
                                {F(winnerName)} {winnerName}{hasResult?(winnerModeOk?" ✓":" ✗"):""}
                              </span>
                            </div>
                            <div style={{fontSize:11,color:MUTED}}>🏆 Vainqueur {modeLabel}</div>
                            {finPred.scoreH!=null && finPred.scoreA!=null && (
                              <div style={{fontSize:11,color:hasResult?(scoreOk?GREEN:MUTED):MUTED,marginTop:2}}>
                                📊 Score pronostiqué : {finPred.scoreH} – {finPred.scoreA}{hasResult&&scoreOk?" ✓":""}
                              </div>
                            )}
                            {finPred.buteurs && finPred.buteurs.length>0 && (
                              <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                                ⚽ Buteur{finPred.buteurs.length>1?"s":""} pronostiqué{finPred.buteurs.length>1?"s":""} : {finPred.buteurs.join(", ")}
                              </div>
                            )}
                          </div>
                        );
                      }
                      const p = uPreds[m.id];
                      if (!p) return null;
                      const homeR = resolve(m.home, m.id, "home");
                      const awayR = resolve(m.away, m.id, "away");
                      const official = st.results?.[m.id];
                      const correct = official && p===official;
                      const wrong = official && p!==official;
                      const label = p==="1" ? homeR : p==="2" ? awayR : "Match nul";
                      return (
                        <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          padding:"6px 10px",borderRadius:8,marginBottom:4,fontSize:12,
                          background:correct?"rgba(46,204,113,.1)":wrong?"rgba(231,76,60,.08)":"rgba(255,255,255,.04)"}}>
                          <span>{F(homeR)} {homeR} - {awayR} {F(awayR)}</span>
                          <span style={{fontWeight:700,color:correct?GREEN:wrong?"#e74c3c":TXT}}>
                            {p==="N"?"🤝 Nul":`${F(label)} ${label}`}{correct?" ✓":wrong?" ✗":""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── ADMIN ── */}
        {tab==="admin" && isAdmin && (
          <div style={t.sec}>
            <div style={{height:12}}/>
            <div style={t.abadge}>⚙️ MODE ADMINISTRATEUR</div>

            {/* Stats rapides */}
            {(() => {
              const allP = Object.keys(st.users).filter(u=>u!=="admin");
              const fam  = allP.filter(u=>st.users[u].role==="famille");
              const col  = allP.filter(u=>st.users[u].role==="collegues");
              const ext  = allP.filter(u=>st.users[u].role==="externe");
              const wait = allP.filter(u=>st.users[u].role==="waiting");
              const scoresEntered = Object.keys(st.scores||{}).filter(id=>{const sc=st.scores[id];return sc&&sc.h!==""&&sc.h!=null&&sc.a!==""&&sc.a!=null;}).length;
              const totalPoolMatches = MATCHES.filter(m=>m.phase==="poules").length;
              const completionPercent = Math.round((scoresEntered / totalPoolMatches) * 100);
              
              const stats = [
                {label:"Famille",  val:fam.length,  color:"#3b82f6", tooltip:"Joueurs en groupe Famille"},
                {label:"Collègues",val:col.length,  color:"#7c3aed", tooltip:"Joueurs en groupe Collègues"},
                {label:"Attente",  val:wait.length, color:AMB, tooltip:"Joueurs en attente d'assignation"},
                {label:"Matchs ✓", val:`${scoresEntered}/${totalPoolMatches}`, color:GREEN, tooltip:`${completionPercent}% des matchs de poules avec scores`},
              ];
              
              return (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:14}}>
                  {stats.map(s=>(
                    <div key={s.label} style={{background:SURF2,borderRadius:10,padding:"8px 4px",textAlign:"center",cursor:"help",position:"relative",group:"hover"}} title={s.tooltip}>
                      <div style={{fontSize:20,fontWeight:900,color:s.color}}>{s.val}</div>
                      <div style={{fontSize:9,color:MUTED,marginTop:2}}>{s.label}</div>
                      {s.label === "Matchs ✓" && (
                        <div style={{height:3,background:SURF,borderRadius:2,marginTop:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:completionPercent+"%",background:GREEN,transition:"width .3s"}}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Sous-onglets admin */}
            <div style={{...t.tabs, paddingLeft:0, paddingRight:0, marginBottom:8}}>
              {[{k:"users",l:"👥 Joueurs"},{k:"pronos",l:"🔍 Pronos"},{k:"results",l:"✏️ Résultats"},{k:"stats",l:"📊 Stats"},{k:"moderation",l:"🛡️ Modération"}].map(s=>(
                <button key={s.k} style={{...t.tab,...(adminSub===s.k?t.tabOn:{})}} onClick={()=>{ setAdminSub(s.k); setAdminConfirmUser(null); }}>{s.l}</button>
              ))}
            </div>

            {/* ── SOUS-ONGLET JOUEURS ── */}
            {adminSub==="users" && <>
              {/* Alerte salle d'attente */}
              {(()=>{
                const waiting = Object.keys(st.users).filter(u=>u!=="admin"&&st.users[u]?.role==="waiting");
                if (waiting.length===0) return null;
                return (
                  <div style={{...t.card,marginBottom:10,background:"rgba(239,68,68,.08)",borderColor:"rgba(239,68,68,.4)",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:24}}>⏳</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:800,fontSize:13,color:RED}}>
                        {waiting.length} joueur{waiting.length>1?"s":""} en salle d'attente
                      </div>
                      <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                        {waiting.map(u=>u.toUpperCase()).join(", ")}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Bouton déconnexion forcée */}
              <div style={{...t.card,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>🚪 Déconnecter les joueurs</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>Renvoie tous les joueurs connectés à l'écran de login</div>
                </div>
                <button
                  onClick={()=>{
                    const ts = Date.now();
                    setSt(prev => {
                      const ns = {...prev, forceLogoutSignal: ts};
                      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                      return ns;
                    });
                    if (_fbReady) { _fbUpdate("/", { forceLogoutSignal: ts }); trackWrite("forceLogoutSignal", ts); }
                    showNotif("success","✅ Déconnexion envoyée");
                  }}
                  style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)",color:RED,borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                  🚪 Déconnecter
                </button>
              </div>

              {/* Bouton activation/désactivation du chat */}
              <div style={{...t.card,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>💬 Chat joueurs</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                    {st.chatEnabled!==false ? "Ouvert — les joueurs peuvent écrire" : "Fermé — les joueurs ne peuvent pas écrire"}
                  </div>
                </div>
                <button
                  onClick={()=>{
                    const newVal = st.chatEnabled===false?true:false;
                    setSt(prev => {
                      const ns = {...prev, chatEnabled: newVal};
                      try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                      return ns;
                    });
                    if (_fbReady) { _fbUpdate("/", { chatEnabled: newVal }); trackWrite("chatEnabled", newVal); }
                  }}
                  style={{
                    background:st.chatEnabled!==false?"rgba(239,68,68,.15)":"rgba(46,204,113,.15)",
                    border:`1px solid ${st.chatEnabled!==false?"rgba(239,68,68,.4)":"rgba(46,204,113,.4)"}`,
                    color:st.chatEnabled!==false?RED:GREEN,
                    borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,
                    cursor:"pointer",fontFamily:"inherit",
                  }}>
                  {st.chatEnabled!==false?"🔒 Fermer":"🔓 Ouvrir"}
                </button>
              </div>
              {Object.keys(st.users).filter(u=>u!=="admin").length===0
                ? <div style={t.empty}>Aucun joueur.</div>
                : <>
                  {/* ── Verrouillage global ── */}
                  {(() => {
                    const players = Object.keys(st.users).filter(u=>u!=="admin");
                    const allLocked = players.length>0 && players.every(u=>st.finalLock[u]);
                    const allKeys = [...GROUPS,"ELIM_seiziemes","ELIM_huitiemes","ELIM_quarts","ELIM_demis","ELIM_p3","ELIM_finale"];
                    return (
                      <div style={{...t.card,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"12px 14px"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13}}>
                            {allLocked ? "🔒 Tous verrouillés" : "🔓 Verrouillage des pronos"}
                          </div>
                          <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                            {allLocked
                              ? "Tous les joueurs sont en lecture seule"
                              : `${players.filter(u=>st.finalLock[u]).length}/${players.length} verrouillés`}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,flexShrink:0}}>
                          <button
                            title="Verrouiller tous les joueurs"
                            onClick={()=>{
                              const lockUpdates = {};
                              players.forEach(u=>{ lockUpdates[u] = true; });
                              setSt(prev => {
                                const ns = {...prev, finalLock:{...(prev.finalLock||{}), ...lockUpdates}};
                                try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                return ns;
                              });
                              // Écriture scopée sur /finalLock uniquement : ne touche jamais aux
                              // pronostics/validations en cours des joueurs, même si l'état admin
                              // local est momentanément en retard.
                              if (_fbReady) { _fbUpdate("/finalLock", lockUpdates); Object.keys(lockUpdates).forEach(k=>trackWrite(`finalLock.${k}`, lockUpdates[k])); }
                              showNotif("success","🔒 Tous les joueurs verrouillés");
                            }}
                            style={{background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.35)",color:RED,borderRadius:10,padding:"7px 12px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                            🔒 Tout verrouiller
                          </button>
                          <button
                            title="Déverrouiller tous les joueurs"
                            onClick={()=>{
                              setSt(prev => {
                                const ns = {...prev, finalLock:{}};
                                try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                return ns;
                              });
                              if (_fbReady) { _fbUpdate("/finalLock", null); trackDelete("finalLock"); }
                              showNotif("success","🔓 Tous les joueurs déverrouillés");
                            }}
                            style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.35)",color:GREEN,borderRadius:10,padding:"7px 12px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                            🔓 Tout déverrouiller
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Info sur la mise à jour mot de passe */}
                  {Object.keys(st.users).some(u=>u!=="admin"&&!st.users[u].pw) && (
                    <div style={{
                      background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.3)",
                      borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"
                    }}>
                      <span style={{fontSize:18,flexShrink:0}}>ℹ️</span>
                      <div>
                        <div style={{fontWeight:700,fontSize:12,color:AMB,marginBottom:3}}>Mise à jour : mot de passe requis</div>
                        <div style={{fontSize:11,color:MUTED,lineHeight:1.5}}>
                          Les joueurs marqués <strong style={{color:AMB}}>⚠️ Pas de mdp</strong> ont été créés avec une ancienne version sans mot de passe.
                          Ils devront se connecter une fois pour définir leur mot de passe et leurs nom/prénom. Leur rôle et pronos sont conservés.
                          Tu peux aussi leur définir un mot de passe via le bouton <strong>🔑 MDP</strong>.
                        </div>
                      </div>
                    </div>
                  )}
                  {Object.keys(st.users).filter(u=>u!=="admin").map(u=>{
                    const r=st.users[u].role;
                    const isConfirming = adminConfirmUser?.name === u;
                    const hasPw = !!st.users[u].pw;
                    return (
                      <div key={u} style={t.ucard}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                              {onlinePlayers.includes(u)&&<span style={{color:GREEN}}>🟢</span>}
                              {u.toUpperCase()} {st.finalLock[u]?"🔒":""}
                              {!hasPw && (
                                <span title="Compte ancienne version — le joueur doit se connecter une fois pour définir son mot de passe"
                                  style={{fontSize:9,background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",color:AMB,borderRadius:6,padding:"2px 6px",fontWeight:700,letterSpacing:.3}}>
                                  ⚠️ Pas de mdp
                                </span>
                              )}
                            </div>
                            {(st.users[u].fname||st.users[u].lname) ? (
                              <div style={{fontSize:12,color:GOLD,marginTop:1,fontWeight:600}}>
                                👤 {[st.users[u].fname, st.users[u].lname].filter(Boolean).join(" ")}
                              </div>
                            ) : hasPw ? (
                              <div style={{fontSize:11,color:MUTED,marginTop:1,fontStyle:"italic"}}>Nom non renseigné</div>
                            ) : null}
                            <div style={{fontSize:11,color:MUTED,marginTop:2}}>Rôle : {r} · {scores[u]||0} pts{onlinePlayers.includes(u)?" · en ligne":""}</div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            {/* Verrou individuel */}
                            <button
                              title={st.finalLock[u] ? "Déverrouiller ce joueur" : "Verrouiller ce joueur"}
                              style={{
                                background: st.finalLock[u] ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
                                border: `1px solid ${st.finalLock[u] ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.3)"}`,
                                color: st.finalLock[u] ? GREEN : RED,
                                borderRadius:8,padding:"5px 8px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"
                              }}
                              onClick={()=>{
                                if (st.finalLock[u]) {
                                  // Déverrouiller — validatedGroups intact = le joueur retrouve son avancement exact
                                  setSt(prev => {
                                    const rest = {...(prev.finalLock||{})}; delete rest[u];
                                    const ns = {...prev, finalLock: rest};
                                    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                    return ns;
                                  });
                                  if (_fbReady) { _fbUpdate("/finalLock", {[u]: null}); trackDelete(`finalLock.${u}`); }
                                  showNotif("success",`🔓 ${u.toUpperCase()} déverrouillé`);
                                } else {
                                  // Verrouiller — on ne touche PAS validatedGroups
                                  setSt(prev => {
                                    const ns = {...prev, finalLock:{...(prev.finalLock||{}),[u]:true}};
                                    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                    return ns;
                                  });
                                  if (_fbReady) { _fbUpdate("/finalLock", {[u]: true}); trackWrite(`finalLock.${u}`, true); }
                                  showNotif("success",`🔒 ${u.toUpperCase()} verrouillé`);
                                }
                              }}>
                              {st.finalLock[u] ? "🔓" : "🔒"}
                            </button>
                            <button
                              title="Remettre les pronos à zéro"
                              style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",color:AMB,borderRadius:8,padding:"5px 8px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                              onClick={()=>setAdminConfirmUser({name:u,action:"reset"})}>
                              🔄 Reset
                            </button>
                            <button
                              title="Changer le mot de passe"
                              style={{background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.3)",color:"#a5b4fc",borderRadius:8,padding:"5px 8px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                              onClick={()=>{ setAdminNewPw(""); setAdminConfirmUser({name:u,action:"pw"}); }}>
                              🔑 MDP
                            </button>
                            <button
                              title="Supprimer ce joueur"
                              style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",color:RED,borderRadius:8,padding:"5px 8px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                              onClick={()=>setAdminConfirmUser({name:u,action:"delete"})}>
                              🗑️
                            </button>
                          </div>
                        </div>
                        <div style={t.rrow}>
                          <button style={{...t.brole,...(r==="famille"?t.bFam:{})}} onClick={()=>setRole(u,"famille")}>Famille</button>
                          <button style={{...t.brole,...(r==="collegues"?t.bCol:{})}} onClick={()=>setRole(u,"collegues")}>Collègues</button>
                          <button style={{...t.brole,...(r==="externe"?t.bExt:{})}} onClick={()=>setRole(u,"externe")}>Externe</button>
                          <button style={{...t.brole,...(r==="waiting"?{background:SURF2,color:TXT}:{})}} onClick={()=>setRole(u,"waiting")}>Attente</button>
                        </div>

                        {/* Confirmation inline */}
                        {isConfirming && (
                          <div style={{marginTop:10,background:adminConfirmUser.action==="delete"?"rgba(239,68,68,.08)":adminConfirmUser.action==="pw"?"rgba(99,102,241,.08)":"rgba(245,158,11,.08)",border:`1px solid ${adminConfirmUser.action==="delete"?"rgba(239,68,68,.3)":adminConfirmUser.action==="pw"?"rgba(99,102,241,.3)":"rgba(245,158,11,.3)"}`,borderRadius:10,padding:10}}>
                            {adminConfirmUser.action==="pw" ? (
                              <>
                                <div style={{fontSize:12,color:TXT,marginBottom:8,lineHeight:1.4}}>
                                  Nouveau mot de passe pour <strong>{u.toUpperCase()}</strong> :
                                </div>
                                <input
                                  type="password"
                                  placeholder="Nouveau mot de passe (min 4 car.)"
                                  value={adminNewPw}
                                  onChange={e=>setAdminNewPw(e.target.value)}
                                  style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"8px 10px",color:TXT,fontSize:12,fontFamily:"inherit",marginBottom:8,outline:"none"}}
                                />
                                <div style={{display:"flex",gap:8}}>
                                  <button style={{flex:1,background:"rgba(99,102,241,.8)",border:"none",color:"#fff",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                                    onClick={()=>{
                                      if (adminNewPw.length < 4) { showNotif("error","❌ Mot de passe trop court (min 4 car.)"); return; }
                                      let updatedUser = null;
                                      setSt(prev => {
                                        updatedUser = {...prev.users[u],pw:adminNewPw};
                                        const ns = {...prev, users:{...prev.users,[u]:updatedUser}};
                                        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                        return ns;
                                      });
                                      if (_fbReady) { _fbUpdate("/users", {[u]: updatedUser}); trackWrite(`users.${u}`, updatedUser); }
                                      showNotif("success",`✅ MDP de ${u.toUpperCase()} modifié`);
                                      setAdminNewPw(""); setAdminConfirmUser(null);
                                    }}>🔑 Enregistrer</button>
                                  <button style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:TXT,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                                    onClick={()=>{ setAdminNewPw(""); setAdminConfirmUser(null); }}>Annuler</button>
                                </div>
                              </>
                            ) : adminConfirmUser.action==="delete" ? (
                              <>
                                <div style={{fontSize:12,color:TXT,marginBottom:8,lineHeight:1.4}}>
                                  Supprimer <strong>{u.toUpperCase()}</strong> définitivement ?<br/>
                                  <span style={{fontSize:11,color:MUTED}}>Compte, pronos et historique effacés.</span>
                                </div>
                                <div style={{display:"flex",gap:8}}>
                                  <button style={{flex:1,background:"rgba(239,68,68,.8)",border:"none",color:"#fff",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                                    onClick={()=>{
                                      setSt(prev => {
                                        const {[u]:_u,...restUsers}=prev.users;
                                        const {[u]:_p,...restPreds}=prev.predictions||{};
                                        const {[u]:_v,...restVG}=prev.validatedGroups||{};
                                        const {[u]:_f,...restFL}=prev.finalLock||{};
                                        const {[u]:_s,...restSA}=prev.seenAnim||{};
                                        const ns = {...prev, users:restUsers, predictions:restPreds,
                                          validatedGroups:restVG, finalLock:restFL, seenAnim:restSA};
                                        try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                        return ns;
                                      });
                                      // Écritures Firebase scopées : chacune ne supprime QUE la clé
                                      // de ce joueur précis dans sa branche respective, sans jamais
                                      // toucher aux autres joueurs (même si leur état vient de changer
                                      // au même instant — ex: un autre joueur valide les demis pendant
                                      // que l'admin supprime ce compte).
                                      if (_fbReady) {
                                        _fbUpdate("/users", {[u]: null});
                                        _fbUpdate("/predictions", {[u]: null});
                                        _fbUpdate("/validatedGroups", {[u]: null});
                                        _fbUpdate("/finalLock", {[u]: null});
                                        trackDelete(`users.${u}`);
                                        trackDelete(`predictions.${u}`);
                                        trackDelete(`validatedGroups.${u}`);
                                        trackDelete(`finalLock.${u}`);
                                      }
                                      showNotif("success",`✅ ${u.toUpperCase()} supprimé`);
                                      setAdminConfirmUser(null);
                                    }}>🗑️ Supprimer</button>
                                  <button style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:TXT,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                                    onClick={()=>setAdminConfirmUser(null)}>Annuler</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{fontSize:12,color:TXT,marginBottom:8,lineHeight:1.5}}>
                                  Que veux-tu remettre à zéro pour <strong>{u.toUpperCase()}</strong> ?
                                </div>
                                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                  {[
                                    {label:"⚽ Poules uniquement",      scope:"poules",  color:"rgba(59,130,246,.8)"},
                                    {label:"🏆 Phases éliminatoires",   scope:"elim",    color:"rgba(124,58,237,.8)"},
                                    {label:"🔄 Tout remettre à zéro",   scope:"all",     color:"rgba(239,68,68,.8)"},
                                  ].map(opt=>(
                                    <button key={opt.scope}
                                      style={{background:opt.color,border:"none",color:"#fff",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}
                                      onClick={()=>{
                                        const ELIM_KEYS = ["ELIM_seiziemes","ELIM_huitiemes","ELIM_quarts","ELIM_demis","ELIM_p3","ELIM_finale"];
                                        const POULE_KEYS = GROUPS;
                                        let scopedPreds, scopedVG, scopedFL;
                                        setSt(prev => {
                                          const prevUserPreds = {...(prev.predictions?.[u]||{})};
                                          const prevUserVG = prev.validatedGroups?.[u] || [];
                                          let ns = {...prev};
                                          if (opt.scope==="all") {
                                            const {[u]:_p,...rP}=prev.predictions||{};
                                            const {[u]:_v,...rV}=prev.validatedGroups||{};
                                            const {[u]:_f,...rF}=prev.finalLock||{};
                                            const {[u]:_s,...rS}=prev.seenAnim||{};
                                            ns.predictions=rP; ns.validatedGroups=rV; ns.finalLock=rF; ns.seenAnim=rS;
                                            scopedPreds = null; scopedVG = null; scopedFL = null;
                                          } else if (opt.scope==="poules") {
                                            MATCHES.filter(m=>m.phase==="poules").forEach(m=>{ delete prevUserPreds[m.id]; });
                                            ns.predictions={...prev.predictions,[u]:prevUserPreds};
                                            const vg = prevUserVG.filter(k=>!POULE_KEYS.includes(k));
                                            ns.validatedGroups={...prev.validatedGroups,[u]:vg};
                                            scopedPreds = prevUserPreds; scopedVG = vg; scopedFL = undefined; // ne pas toucher finalLock
                                          } else { // elim
                                            MATCHES.filter(m=>m.phase!=="poules").forEach(m=>{ delete prevUserPreds[m.id]; });
                                            ns.predictions={...prev.predictions,[u]:prevUserPreds};
                                            const vg = prevUserVG.filter(k=>!ELIM_KEYS.includes(k));
                                            ns.validatedGroups={...prev.validatedGroups,[u]:vg};
                                            const {[u]:_f,...rF}=prev.finalLock||{};
                                            ns.finalLock=rF;
                                            scopedPreds = prevUserPreds; scopedVG = vg; scopedFL = null;
                                          }
                                          try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                          return ns;
                                        });
                                        // Écritures Firebase scopées : chaque branche ne touche QUE
                                        // la clé de ce joueur précis. Ça garantit que le reset d'un
                                        // joueur ne peut jamais écraser la validation d'un AUTRE joueur
                                        // en cours au même instant (ex: quelqu'un qui valide les demis
                                        // pendant que l'admin réinitialise un autre compte).
                                        if (_fbReady) {
                                          if (scopedPreds === null) { _fbUpdate("/predictions", {[u]: null}); trackDelete(`predictions.${u}`); }
                                          else { _fbUpdate("/predictions", {[u]: scopedPreds}); trackWrite(`predictions.${u}`, scopedPreds); }
                                          if (scopedVG === null) { _fbUpdate("/validatedGroups", {[u]: null}); trackDelete(`validatedGroups.${u}`); }
                                          else { _fbUpdate("/validatedGroups", {[u]: scopedVG}); trackWrite(`validatedGroups.${u}`, scopedVG); }
                                          if (scopedFL === null) { _fbUpdate("/finalLock", {[u]: null}); trackDelete(`finalLock.${u}`); }
                                          // scopedFL === undefined → ne rien envoyer (finalLock non concerné par ce scope)
                                        }
                                        showNotif("success",`✅ Reset ${opt.label} pour ${u.toUpperCase()}`);
                                        setAdminConfirmUser(null);
                                      }}>{opt.label}</button>
                                  ))}
                                  <button style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:TXT,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                                    onClick={()=>setAdminConfirmUser(null)}>Annuler</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              }
              {/* Reset danger zone */}
              <div style={{marginTop:16,padding:"12px",background:"rgba(239,68,68,.05)",border:"1px solid rgba(239,68,68,.15)",borderRadius:12}}>
                <div style={{fontSize:11,color:RED,fontWeight:700,marginBottom:8}}>⚠️ Zone dangereuse</div>
                <button style={{background:"transparent",border:"1px solid rgba(239,68,68,.4)",color:RED,borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%"}}
                  onClick={()=>setConfirmReset(true)}>🗑️ Réinitialiser pronos & résultats</button>

                {confirmReset && (
                  <div style={{marginTop:10,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:10,padding:12}}>
                    <div style={{fontSize:12,color:TXT,marginBottom:10,lineHeight:1.4}}>
                      Effacer <strong>TOUS</strong> les pronos et résultats ?<br/>
                      <span style={{color:MUTED,fontSize:11}}>Les utilisateurs restent.</span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button
                        style={{flex:1,background:"rgba(239,68,68,.8)",border:"none",color:"#fff",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                        onClick={()=>{
                          const ns={...st, predictions:{}, results:{}, scores:{}, validatedGroups:{}, finalLock:{}, seenAnim:{}};
                          save(ns);
                          setConfirmReset(false);
                        }}>Confirmer</button>
                      <button
                        style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:TXT,borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                        onClick={()=>setConfirmReset(false)}>Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            </>}

            {/* ── SOUS-ONGLET PRONOS ── */}
            {adminSub==="pronos" && (() => {
              const allPlayers = Object.keys(st.users).filter(u=>u!=="admin");
              if (allPlayers.length===0) return <div style={t.empty}>Aucun joueur.</div>;

              // ── Export CSV ──────────────────────────────────────────
              const exportCSV = (targetPlayers, filename) => {
                const resolveForExport = (team, preds) => {
                  if (FLAGS[team]) return team;
                  const hasOff = (gid) => MATCHES.some(m=>m.group===gid&&m.phase==="poules"&&(st.results||{})[m.id]);
                  const m1=team.match(/^1er ([A-L])$/); if(m1){ if(hasOff(m1[1])){const s=groupStandings(m1[1],st.results||{},st.scores||{});if(s[0])return s[0];} const s=groupStandings(m1[1],preds,{});return s[0]||team; }
                  const m2=team.match(/^2e ([A-L])$/);  if(m2){ if(hasOff(m2[1])){const s=groupStandings(m2[1],st.results||{},st.scores||{});if(s[1])return s[1];} const s=groupStandings(m2[1],preds,{});return s[1]||team; }
                  const vm=team.match(/^V\.\s*([A-Z]+\d+)$/); if(vm){ const r=(st.results||{})[vm[1]]||preds[vm[1]]; if(!r) return team; const ref=MATCHES.find(m=>m.id===vm[1]); if(!ref) return team; return resolveForExport(r==="1"?ref.home:ref.away, preds); }
                  return team;
                };
                const predLabel = (matchId, pred, preds) => {
                  if (!pred) return "";
                  const m = MATCHES.find(x=>x.id===matchId);
                  if (!m) return pred;
                  if (pred==="N") return "Nul";
                  const team = pred==="1" ? resolveForExport(m.home,preds) : resolveForExport(m.away,preds);
                  return team;
                };

                // En-têtes
                const phases = [
                  { label:"POULES",    matches: MATCHES.filter(m=>m.phase==="poules") },
                  { label:"1/16",      matches: MATCHES.filter(m=>m.phase==="seiziemes") },
                  { label:"1/8",       matches: MATCHES.filter(m=>m.phase==="huitiemes") },
                  { label:"QUARTS",    matches: MATCHES.filter(m=>m.phase==="quarts") },
                  { label:"DEMIS",     matches: MATCHES.filter(m=>m.phase==="demis") },
                  { label:"3E PLACE",  matches: MATCHES.filter(m=>m.phase==="p3") },
                  { label:"FINALE",    matches: MATCHES.filter(m=>m.phase==="finale") },
                ];

                const headerRow = ["JOUEUR","GROUPE","PTS"];
                phases.forEach(ph => {
                  ph.matches.forEach(m => {
                    headerRow.push(`${ph.label}:${m.id} (${m.home} vs ${m.away})`);
                  });
                });

                const rows = [headerRow];
                targetPlayers.forEach(u => {
                  const uPreds = st.predictions[u] || {};
                  const userGroup = (st.users[u]||{}).role || "";
                  const row = [u.toUpperCase(), userGroup, scores[u]||0];
                  phases.forEach(ph => {
                    ph.matches.forEach(m => {
                      row.push(predLabel(m.id, uPreds[m.id], uPreds));
                    });
                  });
                  rows.push(row);
                });

                // Ajouter ligne résultats officiels
                const offRow = ["RÉSULTATS OFFICIELS","",""];
                phases.forEach(ph => {
                  ph.matches.forEach(m => {
                    const off = (st.results||{})[m.id];
                    offRow.push(off ? (off==="N"?"Nul":off==="1"?resolveForExport(m.home,{}):resolveForExport(m.away,{})) : "");
                  });
                });
                rows.push([]);
                rows.push(offRow);

                const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(";")).join("\n");
                const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href=url; a.download=filename+".csv"; a.click();
                URL.revokeObjectURL(url);
              };

              const renderGroupPronos = (players, groupTitle) => {
                if (players.length===0) return null;
                return (
                  <div key={groupTitle} style={{marginBottom:20}}>
                    <div style={{
                      fontSize:12,fontWeight:800,color:"#fff",
                      textTransform:"uppercase",letterSpacing:1,
                      marginBottom:10,padding:"6px 10px",
                      background:"rgba(255,255,255,.06)",borderRadius:8,
                      display:"flex",justifyContent:"space-between",alignItems:"center"
                    }}>
                      <span>{groupTitle}</span>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:10,color:MUTED,fontWeight:400}}>{players.length} joueur{players.length>1?"s":""}</span>
                        <button onClick={()=>exportCSV(players,`pronos_${groupTitle.toLowerCase().replace(/\s+/g,"_")}`)}
                          style={{padding:"3px 8px",borderRadius:6,border:"none",background:"rgba(46,204,113,.2)",color:GREEN,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                          📥 CSV
                        </button>
                      </div>
                    </div>

                    {/* Toggle vue tableau / joueur / éditer */}
                    <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                      {[{k:"tableau",l:"📊 Tableau"},{k:"joueur",l:"👤 Par joueur"},{k:"editer",l:"✏️ Éditer"}].map(v=>(
                        <button key={v.k}
                          style={{...t.tab,flex:1,fontSize:12,...(adminPronoView===v.k?t.tabOn:{})}}
                          onClick={()=>{ setAdminPronoView(v.k); setAdminPronoPlayer(null); }}>
                          {v.l}
                        </button>
                      ))}
                      <button onClick={()=>exportCSV(allPlayers,"pronos_tous_joueurs")}
                        style={{padding:"6px 12px",borderRadius:8,border:"none",background:"rgba(46,204,113,.2)",color:GREEN,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        📥 Tout exporter
                      </button>
                    </div>

                    {/* ── MODE ÉDITER ── */}
                    {adminPronoView==="editer" && (
                      <div style={{marginBottom:10}}>
                        {/* Sélection joueur */}
                        <div style={{fontSize:11,color:MUTED,marginBottom:6,fontWeight:700}}>Sélectionne un joueur à modifier :</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                          {players.map(u=>(
                            <button key={u}
                              style={{...t.tab,padding:"5px 10px",fontSize:12,...(adminPronoPlayer===u?t.tabOn:{}),
                                borderColor:onlinePlayers.includes(u)?"rgba(46,204,113,.6)":undefined}}
                              onClick={()=>setAdminPronoPlayer(u)}>
                              {onlinePlayers.includes(u)&&<span style={{color:GREEN,marginRight:3}}>🟢</span>}
                              {u.toUpperCase()}
                              <span style={{fontSize:10,marginLeft:4,color:adminPronoPlayer===u?"#0a0e1a":MUTED}}>({scores[u]||0}pts)</span>
                            </button>
                          ))}
                        </div>

                        {adminPronoPlayer ? (()=>{
                          const uPreds = st.predictions[adminPronoPlayer] || {};
                          const isElimPhase = ["seiziemes","huitiemes","quarts","demis","p3","finale"].includes(adminPronoGroup);

                          // Résolution des équipes selon les pronos du joueur (même logique que le joueur voit)
                          const playerThirds = (st.thirdPicks||{})[adminPronoPlayer] || {};
                          const resolveForPlayer = (team, matchId, side) => {
                            if (FLAGS[team]) return team;
                            const hasOfficialGroupResults = (gid) =>
                              MATCHES.some(m => m.group === gid && m.phase === "poules" && (st.results||{})[m.id]);
                            const m1 = team.match(/^1er ([A-L])$/);
                            if (m1) {
                              if (hasOfficialGroupResults(m1[1])) { const s=groupStandings(m1[1],st.results||{},st.scores||{}); if(s[0]) return s[0]; }
                              const s=groupStandings(m1[1],uPreds,{}); return s[0]||team;
                            }
                            const m2 = team.match(/^2e ([A-L])$/);
                            if (m2) {
                              if (hasOfficialGroupResults(m2[1])) { const s=groupStandings(m2[1],st.results||{},st.scores||{}); if(s[1]) return s[1]; }
                              const s=groupStandings(m2[1],uPreds,{}); return s[1]||team;
                            }
                            // "3e XXXXX" — chercher le groupe choisi par le joueur
                            const m3 = team.match(/^3e ([A-L]+)$/);
                            if (m3) {
                              const eligibles = m3[1].split('');
                              // 1. Résultat officiel admin
                              const offAssign = build3rdAssignment(st.results||{}, st.scores||{}, st.officialThirds||{});
                              if (offAssign[m3[1]]) return offAssign[m3[1]];
                              // 2. Choix du joueur via playerThirds (clé = matchId_side)
                              const slotKey = matchId ? `${matchId}_${side||"home"}` : null;
                              const chosenGroup = slotKey ? playerThirds[slotKey] : null;
                              if (chosenGroup && eligibles.includes(chosenGroup)) {
                                if (hasOfficialGroupResults(chosenGroup)) {
                                  const s=groupStandings(chosenGroup,st.results||{},st.scores||{}); if(s[2]) return s[2];
                                }
                                const s=groupStandings(chosenGroup,uPreds,{}); if(s[2]) return s[2];
                              }
                              // 3. Chercher dans tous les slots du joueur
                              for (const [k,g] of Object.entries(playerThirds)) {
                                if (!eligibles.includes(g)) continue;
                                const [mid, sd] = k.split('_');
                                const ref = MATCHES.find(mm=>mm.id===mid);
                                if (ref && ref[sd]===team) {
                                  const s=groupStandings(g,uPreds,{}); if(s[2] && FLAGS[s[2]]) return s[2];
                                }
                              }
                              return team;
                            }
                            const vm = team.match(/^V\.\s*([A-Z]+\d+)$/);
                            if (vm) {
                              const refId=vm[1];
                              const result=(st.results||{})[refId]||uPreds[refId];
                              if (!result) return team;
                              const ref=MATCHES.find(m=>m.id===refId);
                              if (!ref) return team;
                              const nextSide = result==="1"?"home":"away";
                              return resolveForPlayer(ref[nextSide], refId, nextSide);
                            }
                            if (team.startsWith("Vainqueur")) {
                              const sfm=team.match(/SF(\d+)/);
                              if(sfm){ const r=(st.results||{})["SF"+sfm[1]]||uPreds["SF"+sfm[1]]; if(!r) return team; const ref=MATCHES.find(m=>m.id==="SF"+sfm[1]); if(!ref) return team; return resolveForPlayer(r==="1"?ref.home:ref.away); }
                            }
                            if (team.startsWith("Perdant")) {
                              const sfm=team.match(/SF(\d+)/);
                              if(sfm){ const r=(st.results||{})["SF"+sfm[1]]||uPreds["SF"+sfm[1]]; if(!r) return team; const ref=MATCHES.find(m=>m.id==="SF"+sfm[1]); if(!ref) return team; return resolveForPlayer(r==="1"?ref.away:ref.home); }
                            }
                            return team;
                          };

                          const matchList = isElimPhase
                            ? MATCHES.filter(m=>m.group==="ELIM"&&m.phase===adminPronoGroup)
                            : MATCHES.filter(m=>m.group===adminPronoGroup&&m.phase==="poules");

                          return (
                            <div>
                              {/* Infos joueur */}
                              <div style={{...t.card,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <div>
                                  <div style={{fontWeight:800,fontSize:14}}>{adminPronoPlayer.toUpperCase()} {onlinePlayers.includes(adminPronoPlayer)?"🟢":""}</div>
                                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                                    {(st.users[adminPronoPlayer]?.fname||"")} {(st.users[adminPronoPlayer]?.lname||"")}
                                    {st.finalLock?.[adminPronoPlayer] && <span style={{color:RED,marginLeft:6,fontSize:10}}>🔒 VERROUILLÉ</span>}
                                  </div>
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <div style={{color:GOLD,fontWeight:700,fontSize:16}}>{scores[adminPronoPlayer]||0} pts</div>
                                  {st.finalLock?.[adminPronoPlayer] && (
                                    <div style={{fontSize:10,color:AMB,marginTop:2}}>Modif. possible (admin)</div>
                                  )}
                                </div>
                              </div>

                              {/* Sélecteur phase */}
                              <div style={{...t.tabs,paddingLeft:0,paddingRight:0,marginBottom:10,flexWrap:"wrap"}}>
                                {GROUPS.map(g=>(
                                  <button key={g} style={{...t.tab,padding:"5px 10px",fontSize:12,...(adminPronoGroup===g?t.tabOn:{})}} onClick={()=>setAdminPronoGroup(g)}>{g}</button>
                                ))}
                                {[["seiziemes","1/16"],["huitiemes","1/8"],["quarts","QF"],["demis","SF"],["p3","3e"],["finale","🏆"]].map(([ph,lbl])=>(
                                  <button key={ph} style={{...t.tab,padding:"5px 10px",fontSize:12,...(adminPronoGroup===ph?t.tabOn:{})}} onClick={()=>setAdminPronoGroup(ph)}>{lbl}</button>
                                ))}
                              </div>

                              {/* Matches à modifier */}
                              {matchList.length===0 && <div style={t.empty}>Aucun match dans cette phase</div>}
                              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                {matchList.map(m=>{
                                  const rH = resolveForPlayer(m.home, m.id, "home");
                                  const rA = resolveForPlayer(m.away, m.id, "away");

                                  // ── FINALE : panneau spécial admin — voir/modifier le pronostic complet du joueur ──
                                  if (m.id === "FIN") {
                                    const finMine = st.finaleData?.predictions?.[adminPronoPlayer];
                                    const finOfficial = st.finaleData?.official;
                                    return (
                                      <FinalePanel key={`${m.id}_${adminPronoPlayer}`} m={m} isAdmin={false} homeT={rH} awayT={rA}
                                        official={finOfficial} myPick={finMine}
                                        onSave={(partial)=>adminEditFinalePrediction(adminPronoPlayer, partial)}
                                        locked={false}
                                        officialButeurs={finOfficial?.buteurs}/>
                                    );
                                  }

                                  const cur = uPreds[m.id];
                                  const off = (st.results||{})[m.id];
                                  const btns = m.phase==="poules" ? ["1","N","2"] : ["1","2"];
                                  const lbls = {
                                    "1": `${FLAGS[rH]||"❓"} ${rH}`,
                                    "N": "🟰 Nul",
                                    "2": `${FLAGS[rA]||"❓"} ${rA}`
                                  };

                                  // Détecter les slots "3e XXXXX" pour ce match
                                  const homeIs3e = m.home.startsWith("3e ");
                                  const awayIs3e = m.away.startsWith("3e ");
                                  const userThirdsEdit = (st.thirdPicks||{})[adminPronoPlayer] || {};
                                  const homeGroups = homeIs3e ? m.home.replace("3e ","").split("") : [];
                                  const awayGroups = awayIs3e ? m.away.replace("3e ","").split("") : [];
                                  const homeThirdPick = userThirdsEdit[m.id+"_home"] || null;
                                  const awayThirdPick = userThirdsEdit[m.id+"_away"] || null;
                                  // Pour résoudre la 3e équipe si un groupe est choisi
                                  const resolve3e = (side, chosenGroup) => {
                                    if (!chosenGroup) return null;
                                    const hasOff = MATCHES.some(mm => mm.group===chosenGroup && mm.phase==="poules" && (st.results||{})[mm.id]);
                                    const s = hasOff
                                      ? groupStandings(chosenGroup, st.results||{}, st.scores||{})
                                      : groupStandings(chosenGroup, uPreds, {});
                                    return s[2] || null;
                                  };

                                  return (
                                    <div key={m.id} style={{...t.card,padding:"10px 12px"}}>
                                      {/* Header match */}
                                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                        <div style={{fontSize:10,color:MUTED}}>{m.date} · {m.time} · {m.city}</div>
                                        {off && (
                                          <div style={{fontSize:10,fontWeight:700,color:off==="1"?GREEN:off==="2"?GREEN:AMB}}>
                                            Officiel : {off==="1"?`${FLAGS[rH]||""} ${rH}`:off==="2"?`${FLAGS[rA]||""} ${rA}`:"Nul"}
                                          </div>
                                        )}
                                      </div>

                                      {/* Sélecteur 3e HOME si besoin */}
                                      {homeIs3e && (
                                        <div style={{marginBottom:8,padding:"6px 8px",background:"rgba(245,200,66,.07)",borderRadius:8,border:`1px solid rgba(245,200,66,.2)`}}>
                                          <div style={{fontSize:10,color:GOLD,fontWeight:700,marginBottom:5}}>
                                            🎯 Meilleur 3e {m.home} (côté domicile)
                                          </div>
                                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                            {homeGroups.map(g=>{
                                              const team3 = resolve3e("home", g);
                                              const isSelected = homeThirdPick===g;
                                              return (
                                                <button key={g}
                                                  onClick={()=>adminEditThird(adminPronoPlayer, m.id, "home", g)}
                                                  style={{
                                                    padding:"4px 8px",borderRadius:6,border:"none",cursor:"pointer",
                                                    fontSize:11,fontWeight:700,fontFamily:"inherit",
                                                    background:isSelected?"rgba(245,200,66,.3)":"rgba(255,255,255,.07)",
                                                    color:isSelected?GOLD:MUTED,
                                                    boxShadow:isSelected?`0 0 0 1.5px ${GOLD}`:"none"
                                                  }}>
                                                  Grp {g}{team3?` · ${FLAGS[team3]||""} ${team3}`:""}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          {homeThirdPick && (
                                            <div style={{fontSize:10,color:GOLD,marginTop:4}}>
                                              ✅ Choix actuel : Groupe {homeThirdPick} — {FLAGS[resolve3e("home",homeThirdPick)]||"❓"} {resolve3e("home",homeThirdPick)||"?"}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Sélecteur 3e AWAY si besoin */}
                                      {awayIs3e && (
                                        <div style={{marginBottom:8,padding:"6px 8px",background:"rgba(245,200,66,.07)",borderRadius:8,border:`1px solid rgba(245,200,66,.2)`}}>
                                          <div style={{fontSize:10,color:GOLD,fontWeight:700,marginBottom:5}}>
                                            🎯 Meilleur 3e {m.away} (côté extérieur)
                                          </div>
                                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                            {awayGroups.map(g=>{
                                              const team3 = resolve3e("away", g);
                                              const isSelected = awayThirdPick===g;
                                              return (
                                                <button key={g}
                                                  onClick={()=>adminEditThird(adminPronoPlayer, m.id, "away", g)}
                                                  style={{
                                                    padding:"4px 8px",borderRadius:6,border:"none",cursor:"pointer",
                                                    fontSize:11,fontWeight:700,fontFamily:"inherit",
                                                    background:isSelected?"rgba(245,200,66,.3)":"rgba(255,255,255,.07)",
                                                    color:isSelected?GOLD:MUTED,
                                                    boxShadow:isSelected?`0 0 0 1.5px ${GOLD}`:"none"
                                                  }}>
                                                  Grp {g}{team3?` · ${FLAGS[team3]||""} ${team3}`:""}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          {awayThirdPick && (
                                            <div style={{fontSize:10,color:GOLD,marginTop:4}}>
                                              ✅ Choix actuel : Groupe {awayThirdPick} — {FLAGS[resolve3e("away",awayThirdPick)]||"❓"} {resolve3e("away",awayThirdPick)||"?"}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {/* Équipes */}
                                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                                        <div style={{flex:1,textAlign:"center"}}>
                                          <div style={{fontSize:22}}>{FLAGS[rH]||"❓"}</div>
                                          <div style={{fontSize:11,fontWeight:700,color:TXT,marginTop:2}}>{rH}</div>
                                        </div>
                                        <div style={{fontSize:11,color:MUTED,fontWeight:700}}>VS</div>
                                        <div style={{flex:1,textAlign:"center"}}>
                                          <div style={{fontSize:22}}>{FLAGS[rA]||"❓"}</div>
                                          <div style={{fontSize:11,fontWeight:700,color:TXT,marginTop:2}}>{rA}</div>
                                        </div>
                                      </div>
                                      {/* Boutons de prono */}
                                      <div style={{display:"flex",gap:6}}>
                                        {btns.map(v=>{
                                          const isSelected = cur === v;
                                          const correct = off && v === off;
                                          return (
                                            <button key={v}
                                              onClick={()=>adminEditPred(adminPronoPlayer, m.id, v)}
                                              style={{
                                                flex:1, padding:"8px 4px", borderRadius:10, border:"none",
                                                fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                                                minHeight:44, transition:"all .15s",
                                                background: isSelected
                                                  ? (off ? (correct?"rgba(34,197,94,.35)":"rgba(239,68,68,.35)") : "rgba(245,200,66,.25)")
                                                  : "rgba(255,255,255,.06)",
                                                color: isSelected
                                                  ? (off ? (correct?GREEN:RED) : GOLD)
                                                  : MUTED,
                                                boxShadow: isSelected ? `0 0 0 2px ${off?(correct?GREEN:RED):GOLD}` : "none",
                                              }}>
                                              {lbls[v]}
                                              {isSelected && off && (correct?" ✅":" ❌")}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {/* Prono actuel */}
                                      {!cur && <div style={{textAlign:"center",fontSize:10,color:MUTED,marginTop:6,fontStyle:"italic"}}>Aucun prono — clique pour en ajouter un</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })() : <div style={t.empty}>👆 Sélectionne un joueur ci-dessus</div>}
                      </div>
                    )}

                    {/* Vue par joueur */}
                    {adminPronoView==="joueur" && (
                      <div style={{marginBottom:10}}>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                          {players.map(u=>(
                            <button key={u}
                              style={{...t.tab,padding:"5px 10px",fontSize:12,...(adminPronoPlayer===u?t.tabOn:{}),
                                borderColor:onlinePlayers.includes(u)?"rgba(46,204,113,.6)":undefined}}
                              onClick={()=>setAdminPronoPlayer(u)}>
                              {onlinePlayers.includes(u)&&<span style={{color:GREEN,marginRight:3}}>🟢</span>}
                              {u.toUpperCase()}
                              <span style={{fontSize:10,marginLeft:4,color:adminPronoPlayer===u?"#0a0e1a":MUTED}}>({scores[u]||0}pts)</span>
                            </button>
                          ))}
                        </div>
                        {adminPronoPlayer ? (()=>{
                          const uPreds = (st.predictions[adminPronoPlayer]||{});
                          const isElimP = ["seiziemes","huitiemes","quarts","demis","p3","finale"].includes(adminPronoGroup);
                          const ml = isElimP
                            ? MATCHES.filter(m=>m.group==="ELIM"&&m.phase===adminPronoGroup)
                            : MATCHES.filter(m=>m.group===adminPronoGroup&&m.phase==="poules");
                          // Pour les élims : résoudre les équipes via la chaîne de pronos du joueur
                          // (officialResults en base + pronos du joueur pour les matchs sans résultat officiel)
                          const mixedR = {...(st.results||{}), ...uPreds};
                          return (
                            <div style={t.card}>
                              <div style={{fontWeight:800,fontSize:14,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <span>{adminPronoPlayer.toUpperCase()} {onlinePlayers.includes(adminPronoPlayer)?"🟢":""}</span>
                                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                                  <span style={{color:GOLD}}>{scores[adminPronoPlayer]||0} pts</span>
                                  <button onClick={()=>exportCSV([adminPronoPlayer],`pronos_${adminPronoPlayer}`)}
                                    style={{padding:"3px 8px",borderRadius:6,border:"none",background:"rgba(46,204,113,.2)",color:GREEN,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                                    📥 CSV
                                  </button>
                                </div>
                              </div>
                              {ml.length===0 && <div style={{color:MUTED,fontSize:12,textAlign:"center",padding:"8px 0"}}>Aucun match dans cette phase</div>}
                              {ml.map(m=>{
                                const p=uPreds[m.id];
                                const off=(st.results||{})[m.id];
                                const ok=p&&off&&p===off;
                                const ko=p&&off&&p!==off;
                                // Résolution via chaîne de pronos du joueur pour les élims
                                const rH = isElimP
                                  ? resolveTeam(m.home, mixedR, st.scores||{}, st.officialThirds||{})
                                  : resolveTeam(m.home, st.results||{}, st.scores||{}, st.officialThirds||{});
                                const rA = isElimP
                                  ? resolveTeam(m.away, mixedR, st.scores||{}, st.officialThirds||{})
                                  : resolveTeam(m.away, st.results||{}, st.scores||{}, st.officialThirds||{});
                                // Équipe pronostiquée gagnante par le joueur
                                const predWinner = p==="1" ? rH : p==="2" ? rA : null;
                                const predEmoji = predWinner && FLAGS[predWinner] ? FLAGS[predWinner] : "";
                                return (
                                  <div key={m.id} style={{padding:"8px 0",borderBottom:`1px solid ${BRD}`}}>
                                    {/* Ligne des équipes */}
                                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                                      <span style={{fontSize:18}}>{FLAGS[rH]||"❓"}</span>
                                      <span style={{fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:TXT}}>{rH}</span>
                                      <span style={{fontSize:10,color:MUTED,fontWeight:700,minWidth:20,textAlign:"center"}}>vs</span>
                                      <span style={{fontSize:11,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:TXT,textAlign:"right"}}>{rA}</span>
                                      <span style={{fontSize:18}}>{FLAGS[rA]||"❓"}</span>
                                    </div>
                                    {/* Prono du joueur */}
                                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                                      <span style={{fontSize:10,color:MUTED}}>Prono :</span>
                                      {p ? (
                                        <span style={{
                                          fontSize:12,fontWeight:800,padding:"2px 8px",borderRadius:6,
                                          background:ok?"rgba(34,197,94,.2)":ko?"rgba(239,68,68,.2)":"rgba(245,200,66,.1)",
                                          color:ok?GREEN:ko?RED:GOLD,
                                          display:"flex",alignItems:"center",gap:4
                                        }}>
                                          {predEmoji && <span style={{fontSize:14}}>{predEmoji}</span>}
                                          {predWinner||p}
                                          {ok&&" ✅"}{ko&&" ❌"}
                                        </span>
                                      ) : (
                                        <span style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Pas de prono</span>
                                      )}
                                      {off&&!p&&<span style={{fontSize:10,color:MUTED,marginLeft:"auto"}}>Résultat : {off==="1"?`${FLAGS[rH]||""} ${rH}`:off==="2"?`${FLAGS[rA]||""} ${rA}`:"Nul"}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })() : <div style={t.empty}>Sélectionne un joueur</div>}
                      </div>
                    )}

                    {/* Sélecteur poules + phases élim (visible dans les deux modes) */}
                    <div style={{...t.tabs,paddingLeft:0,paddingRight:0,marginBottom:10}}>
                      {GROUPS.map(g=>(
                        <button key={g}
                          style={{...t.tab,padding:"5px 10px",fontSize:12,...(adminPronoGroup===g?t.tabOn:{})}}
                          onClick={()=>setAdminPronoGroup(g)}>{g}</button>
                      ))}
                      {["seiziemes","huitiemes","quarts","demis","p3","finale"].map(ph=>(
                        <button key={ph}
                          style={{...t.tab,padding:"5px 10px",fontSize:12,...(adminPronoGroup===ph?t.tabOn:{})}}
                          onClick={()=>setAdminPronoGroup(ph)}>
                          {ph==="seiziemes"?"1/16":ph==="huitiemes"?"1/8":ph==="quarts"?"QF":ph==="demis"?"SF":ph==="p3"?"3e":"🏆"}
                        </button>
                      ))}
                    </div>

                    {/* Tableau des pronos */}
                    {(()=>{
                      const isElimPhase = ["seiziemes","huitiemes","quarts","demis","p3","finale"].includes(adminPronoGroup);
                      const matchList = isElimPhase
                        ? MATCHES.filter(m=>m.group==="ELIM"&&m.phase===adminPronoGroup)
                        : MATCHES.filter(m=>m.group===adminPronoGroup&&m.phase==="poules");
                      return (
                        <div style={{...t.card,padding:"10px 8px",overflowX:"auto"}}>
                          <div style={{display:"grid",gridTemplateColumns:`130px repeat(${players.length},1fr)`,gap:4,marginBottom:6}}>
                            <div style={{fontSize:10,color:MUTED}}>Match</div>
                            {players.map(u=>(
                              <div key={u} style={{fontSize:10,fontWeight:700,color:"#F5C842",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.toUpperCase()}</div>
                            ))}
                          </div>
                          {matchList.map(m=>{
                            const official = (st.results||{})[m.id];
                            const rH = resolveTeam(m.home, st.results||{}, st.scores||{}, st.officialThirds||{});
                            const rA = resolveTeam(m.away, st.results||{}, st.scores||{}, st.officialThirds||{});
                            return (
                              <div key={m.id} style={{display:"grid",gridTemplateColumns:`130px repeat(${players.length},1fr)`,gap:4,marginBottom:4,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                                <div style={{fontSize:10,color:"rgba(255,255,255,.6)",lineHeight:1.4}}>
                                  {F(rH)} {rH.split(" ")[0]}<br/>
                                  <span style={{color:MUTED,fontSize:9}}>vs</span><br/>
                                  {F(rA)} {rA.split(" ")[0]}
                                </div>
                                {players.map(u=>{
                                  const p=(st.predictions[u]||{})[m.id];
                                  const correct=official&&p===official;
                                  const wrong=official&&p&&p!==official;
                                  return (
                                    <div key={u} style={{textAlign:"center",fontSize:13,fontWeight:700,padding:"4px 2px",borderRadius:6,
                                      background:correct?"rgba(34,197,94,.2)":wrong?"rgba(239,68,68,.2)":p?"rgba(245,200,66,.1)":"rgba(255,255,255,.04)",
                                      color:correct?"#22c55e":wrong?"#ef4444":p?"#F5C842":MUTED}}>
                                      {p||"–"}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              };

              const famille = allPlayers.filter(u=>st.users[u].role==="famille");
              const collegues = allPlayers.filter(u=>st.users[u].role==="collegues");
              const externe = allPlayers.filter(u=>st.users[u].role==="externe");

              return (
                <div>
                  {renderGroupPronos(famille, "👨‍👩‍👧 Famille")}
                  {renderGroupPronos(collegues, "💼 Collègues")}
                  {renderGroupPronos(externe, "🌐 Externes")}
                </div>
              );
            })()}

            {/* ── SOUS-ONGLET MODÉRATION ── */}
            {/* ── SOUS-ONGLET STATS ── */}
            {adminSub==="stats" && (()=>{
              const players = Object.keys(st.users).filter(u => u !== "admin");
              const totalInscrits = players.length;
              const byRole = {};
              players.forEach(u => {
                const r = st.users[u]?.role || "waiting";
                byRole[r] = (byRole[r] || []);
                byRole[r].push(u);
              });

              // Validation complète = toutes les phases validées ou verrouillé
              const fullyValidated = players.filter(u =>
                allPhasesValidated(st.validatedGroups[u] || []) || !!st.finalLock[u]
              );

              // Stats par match avec résultat officiel
              const matchesWithResult = MATCHES.filter(m => !!(st.results||{})[m.id]);

              return (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>

                  {/* ── Carte synthèse globale ── */}
                  <div style={{...t.card, padding:"14px 16px"}}>
                    <div style={{fontWeight:800, fontSize:13, color:GOLD, marginBottom:12}}>📊 Vue d'ensemble</div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                      {[
                        {label:"Inscrits", value:totalInscrits, icon:"👤"},
                        {label:"Tout validé", value:fullyValidated.length, icon:"✅"},
                        {label:"Matchs joués", value:matchesWithResult.length, icon:"⚽"},
                        {label:"Pronos saisis", value: players.reduce((acc,u)=>acc+Object.keys(st.predictions[u]||{}).length,0), icon:"📝"},
                      ].map(({label,value,icon})=>(
                        <div key={label} style={{background:"rgba(255,255,255,.04)",border:`1px solid ${BRD}`,borderRadius:10,padding:"10px 12px"}}>
                          <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
                          <div style={{fontSize:22,fontWeight:900,color:GOLD}}>{value}</div>
                          <div style={{fontSize:11,color:MUTED}}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Par groupe/rôle ── */}
                  <div style={{...t.card, padding:"14px 16px"}}>
                    <div style={{fontWeight:800, fontSize:13, color:GOLD, marginBottom:10}}>👥 Par groupe</div>
                    {Object.keys(byRole).filter(r=>r!=="waiting"&&r!=="admin").map(role => {
                      const rolePlayers = byRole[role] || [];
                      const roleValidated = rolePlayers.filter(u => allPhasesValidated(st.validatedGroups[u]||[]) || !!st.finalLock[u]);
                      const pct = rolePlayers.length ? Math.round(roleValidated.length/rolePlayers.length*100) : 0;
                      return (
                        <div key={role} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <span style={{fontWeight:700,fontSize:12,textTransform:"capitalize"}}>{role}</span>
                            <span style={{fontSize:12,color:GOLD,fontWeight:700}}>{roleValidated.length}/{rolePlayers.length} validés ({pct}%)</span>
                          </div>
                          {/* Barre de progression */}
                          <div style={{height:6,background:"rgba(255,255,255,.08)",borderRadius:4,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${GREEN},#86efac)`,borderRadius:4,transition:"width .3s"}}/>
                          </div>
                          {/* Liste joueurs */}
                          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                            {rolePlayers.map(u => {
                              const isVal = allPhasesValidated(st.validatedGroups[u]||[]) || !!st.finalLock[u];
                              return (
                                <span key={u} style={{
                                  fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:6,
                                  background:isVal?"rgba(34,197,94,.15)":"rgba(255,255,255,.05)",
                                  border:`1px solid ${isVal?"rgba(34,197,94,.4)":BRD}`,
                                  color:isVal?GREEN:MUTED,
                                }}>
                                  {isVal?"✓ ":""}{u}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {/* Joueurs en attente */}
                    {(byRole["waiting"]||[]).length > 0 && (
                      <div style={{marginTop:6,paddingTop:8,borderTop:`1px solid ${BRD}`}}>
                        <span style={{fontSize:11,color:MUTED}}>⏳ En attente d'assignation : {(byRole["waiting"]||[]).join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {matchesWithResult.length === 0 && (
                    <div style={{...t.card,textAlign:"center",padding:"24px 16px"}}>
                      <div style={{fontSize:32,marginBottom:8}}>⏳</div>
                      <div style={{color:MUTED,fontSize:13}}>Les statistiques de pronos apparaîtront une fois les premiers résultats officiels saisis.</div>
                    </div>
                  )}

                  {/* ── Stats détaillées par joueur ── */}
                  {players.length > 0 && (
                    <div style={{...t.card, padding:"14px 16px"}}>
                      <div style={{fontWeight:800, fontSize:13, color:GOLD, marginBottom:12}}>👤 Détail par joueur</div>
                      {players
                        .filter(u => (st.users[u]||{}).role !== "waiting")
                        .sort((a,b) => (scores[b]||0) - (scores[a]||0))
                        .map((u, rank) => {
                          const uPreds = st.predictions[u] || {};
                          const uRole = (st.users[u]||{}).role;
                          const totalPronos = Object.keys(uPreds).length;
                          const totalMatchs = matchesWithResult.length;
                          // Bons pronos par phase
                          const byPhase = {};
                          matchesWithResult.forEach(m => {
                            if (!byPhase[m.phase]) byPhase[m.phase] = { correct:0, total:0 };
                            if (uPreds[m.id]) {
                              byPhase[m.phase].total++;
                              if (uPreds[m.id] === (st.results||{})[m.id]) byPhase[m.phase].correct++;
                            }
                          });
                          const totalCorrect = Object.values(byPhase).reduce((a,b)=>a+b.correct,0);
                          const totalPlayed = Object.values(byPhase).reduce((a,b)=>a+b.total,0);
                          const pctCorrect = totalPlayed ? Math.round(totalCorrect/totalPlayed*100) : 0;
                          const isFullyVal = allPhasesValidated(st.validatedGroups[u]||[]) || !!st.finalLock[u];
                          return (
                            <div key={u} style={{
                              marginBottom:10,padding:"10px 12px",
                              background:"rgba(255,255,255,.03)",
                              border:`1px solid ${rank===0&&(scores[u]||0)>0?GOLD:BRD}`,
                              borderRadius:10,
                            }}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:13,fontWeight:800,color:rank===0&&(scores[u]||0)>0?GOLD:TXT}}>
                                    {rank===0&&(scores[u]||0)>0?"🥇":rank===1?"🥈":rank===2?"🥉":`#${rank+1}`} {u.toUpperCase()}
                                  </span>
                                  <span style={{fontSize:10,
                                    background:uRole==="famille"?"rgba(59,130,246,.15)":uRole==="externe"?"rgba(13,148,136,.15)":"rgba(168,85,247,.15)",
                                    border:`1px solid ${uRole==="famille"?"rgba(59,130,246,.3)":uRole==="externe"?"rgba(13,148,136,.3)":"rgba(168,85,247,.3)"}`,
                                    color:uRole==="famille"?"#93c5fd":uRole==="externe"?"#5eead4":"#d8b4fe",
                                    borderRadius:6,padding:"1px 6px",fontWeight:700
                                  }}>{uRole}</span>
                                  {isFullyVal && <span style={{fontSize:10,color:GREEN}}>🔒</span>}
                                </div>
                                <span style={{fontSize:16,fontWeight:900,color:GOLD}}>{scores[u]||0} pts</span>
                              </div>
                              {/* Barre globale */}
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:MUTED,marginBottom:3}}>
                                <span>{totalCorrect}/{totalPlayed} bons pronos</span>
                                <span style={{color:pctCorrect>=70?GREEN:pctCorrect>=50?AMB:RED,fontWeight:700}}>{pctCorrect}%</span>
                              </div>
                              <div style={{height:4,background:"rgba(255,255,255,.08)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
                                <div style={{height:"100%",width:`${pctCorrect}%`,
                                  background:pctCorrect>=70?GRAD_FIELD:pctCorrect>=50?`linear-gradient(90deg,${AMB},#fbbf24)`:`linear-gradient(90deg,${RED},#f87171)`,
                                  borderRadius:3}}/>
                              </div>
                              {/* Détail par phase */}
                              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                {Object.entries(byPhase).map(([phase,data])=>(
                                  <span key={phase} style={{
                                    fontSize:10,padding:"2px 7px",borderRadius:6,fontWeight:700,
                                    background:data.correct===data.total&&data.total>0?"rgba(46,204,113,.15)":"rgba(255,255,255,.05)",
                                    border:`1px solid ${data.correct===data.total&&data.total>0?"rgba(46,204,113,.3)":BRD}`,
                                    color:data.correct===data.total&&data.total>0?GREEN:MUTED,
                                  }}>
                                    {phase==="poules"?"Poules":phase==="seiziemes"?"1/16":phase==="huitiemes"?"1/8":phase==="quarts"?"QF":phase==="demis"?"SF":phase==="p3"?"3e":"Finale"} {data.correct}/{data.total}
                                  </span>
                                ))}
                              </div>
                              {/* Pronos saisis */}
                              <div style={{fontSize:10,color:MUTED,marginTop:5}}>{totalPronos} pronos saisis sur {MATCHES.length}</div>
                            </div>
                          );
                        })
                      }
                    </div>
                  )}

                  {/* ── Stats des jeux ── */}
                  <div style={{...t.card, padding:"14px 16px"}}>
                    <div style={{fontWeight:800, fontSize:13, color:GOLD, marginBottom:12}}>🎮 Statistiques des jeux</div>
                    {[
                      {id:"quiz",      icon:"🧠",name:"Quiz Coupe du Monde"},
                      {id:"quisuisje", icon:"👤",name:"Qui suis-je ?"},
                      {id:"plusmoins", icon:"🔢",name:"Plus ou Moins"},
                      {id:"toptrumps", icon:"🃏",name:"Qui a le plus ?"},
                      {id:"penalty",   icon:"⚽",name:"Tirs au but"},
                      {id:"buteur",    icon:"🥅",name:"Meilleur Buteur"},
                    ].map(g => {
                      const gs = (st.gameScores||{})[g.id]||{};
                      const gst = (st.gameScoresTotal||{})[g.id]||{};
                      const playedCount = Object.keys(gs).length;
                      const isNumericGame = g.id !== "buteur";
                      const bestEntry = isNumericGame
                        ? Object.entries(gs).filter(([,v])=>typeof v==="number").sort((a,b)=>b[1]-a[1])[0]
                        : null;
                      const totalEntry = isNumericGame
                        ? Object.entries(gst).filter(([,v])=>typeof v==="number").sort((a,b)=>b[1]-a[1])[0]
                        : null;
                      // Pour "buteur" : le choix le plus populaire
                      let topPick = null;
                      if (!isNumericGame && playedCount>0) {
                        const counts = {};
                        Object.values(gs).forEach(name => { counts[name] = (counts[name]||0)+1; });
                        topPick = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
                      }
                      return (
                        <div key={g.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${BRD}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:12,fontWeight:700,color:TXT}}>{g.icon} {g.name}</span>
                            <span style={{fontSize:11,color:MUTED}}>{playedCount} joueur{playedCount!==1?"s":""}</span>
                          </div>
                          {bestEntry && <div style={{fontSize:11,color:GOLD}}>🏅 Meilleure partie : <strong>{bestEntry[0].toUpperCase()}</strong> ({bestEntry[1]} pts)</div>}
                          {totalEntry && <div style={{fontSize:11,color:"#60a5fa",marginTop:2}}>📈 Plus gros cumul : <strong>{totalEntry[0].toUpperCase()}</strong> ({totalEntry[1]} pts)</div>}
                          {topPick && <div style={{fontSize:11,color:GOLD}}>🥅 Choix le plus fréquent : <strong>{topPick[0]}</strong> ({topPick[1]}x)</div>}
                          {playedCount===0 && <div style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Pas encore joué</div>}
                        </div>
                      );
                    })}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MUTED,marginTop:4}}>
                      <span>⚔️ Défis envoyés (total)</span><span style={{fontWeight:700,color:TXT}}>{Object.keys(st.challenges||{}).length}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MUTED,marginTop:4}}>
                      <span>✅ Défis terminés</span><span style={{fontWeight:700,color:TXT}}>{Object.values(st.challenges||{}).filter(c=>c.status==="done").length}</span>
                    </div>
                  </div>

                  {/* ── Stats des défis : qui envoie/gagne/refuse le plus ── */}
                  {(() => {
                    const allChallenges = Object.values(st.challenges||{});
                    const cgLabels = {quiz:"Quiz",quisuisje:"Qui suis-je ?",plusmoins:"Plus ou Moins",toptrumps:"Qui a le plus ?",penalty:"Tirs au but",mystere:"Footballeur Mystère"};

                    const sentByUser = {};
                    allChallenges.forEach(c => {
                      if (!sentByUser[c.from]) sentByUser[c.from] = {total:0, byGame:{}};
                      sentByUser[c.from].total++;
                      sentByUser[c.from].byGame[c.game] = (sentByUser[c.from].byGame[c.game]||0)+1;
                    });

                    const wonByUser = {};
                    allChallenges.forEach(c => {
                      if (c.status !== "done") return;
                      let winner = null;
                      if (c.game === "penalty") winner = c.winner;
                      else if (c.fromScore!=null && c.toScore!=null) {
                        if (c.fromScore > c.toScore) winner = c.from;
                        else if (c.toScore > c.fromScore) winner = c.to;
                      }
                      if (!winner) return;
                      if (!wonByUser[winner]) wonByUser[winner] = {total:0, byGame:{}};
                      wonByUser[winner].total++;
                      wonByUser[winner].byGame[c.game] = (wonByUser[winner].byGame[c.game]||0)+1;
                    });

                    const declinedByUser = {};
                    allChallenges.forEach(c => {
                      if (c.status !== "declined") return;
                      declinedByUser[c.to] = (declinedByUser[c.to]||0)+1;
                    });

                    const topSent = Object.entries(sentByUser).sort((a,b)=>b[1].total-a[1].total)[0];
                    const topWon  = Object.entries(wonByUser).sort((a,b)=>b[1].total-a[1].total)[0];
                    const topDeclined = Object.entries(declinedByUser).sort((a,b)=>b[1]-a[1])[0];

                    return (
                      <div style={{...t.card, padding:"14px 16px", marginTop:12}}>
                        <div style={{fontWeight:800, fontSize:13, color:GOLD, marginBottom:12}}>⚔️ Statistiques des défis</div>

                        <div style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${BRD}`}}>
                          <div style={{fontSize:12,fontWeight:700,color:TXT,marginBottom:4}}>📤 Plus de défis envoyés</div>
                          {topSent ? (<>
                            <div style={{fontSize:12,color:GOLD}}>{topSent[0].toUpperCase()} — {topSent[1].total} défi{topSent[1].total>1?"s":""}</div>
                            <div style={{fontSize:10,color:MUTED,marginTop:2}}>{Object.entries(topSent[1].byGame).map(([g,n])=>`${cgLabels[g]||g}: ${n}`).join(" · ")}</div>
                          </>) : <div style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Aucun défi envoyé</div>}
                        </div>

                        <div style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${BRD}`}}>
                          <div style={{fontSize:12,fontWeight:700,color:TXT,marginBottom:4}}>🏆 Plus de défis gagnés</div>
                          {topWon ? (<>
                            <div style={{fontSize:12,color:GREEN}}>{topWon[0].toUpperCase()} — {topWon[1].total} victoire{topWon[1].total>1?"s":""}</div>
                            <div style={{fontSize:10,color:MUTED,marginTop:2}}>{Object.entries(topWon[1].byGame).map(([g,n])=>`${cgLabels[g]||g}: ${n}`).join(" · ")}</div>
                          </>) : <div style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Aucun défi terminé</div>}
                        </div>

                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:TXT,marginBottom:4}}>🙅 Plus de défis refusés</div>
                          {topDeclined ? <div style={{fontSize:12,color:RED}}>{topDeclined[0].toUpperCase()} — {topDeclined[1]} refus</div> : <div style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Aucun défi refusé</div>}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              );
            })()}

            {adminSub==="moderation" && <>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>💬 Chat Famille</div>
              {(st.chat?.famille || []).length === 0
                ? <div style={t.empty}>Aucun message</div>
                : (st.chat?.famille || []).map((msg, idx) => (
                    <div key={idx} style={{
                      background:SURF2,borderRadius:10,padding:"10px 12px",marginBottom:8,
                      display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8
                    }}>
                      <div style={{flex:1,fontSize:12}}>
                        <div style={{fontWeight:700,color:GREEN}}>{msg.user}</div>
                        <div style={{color:TXT,marginTop:2}}>{msg.text}</div>
                        <div style={{fontSize:10,color:MUTED,marginTop:4}}>{new Date(msg.ts).toLocaleString()}</div>
                      </div>
                      <button style={{...t.btnXS,background:"rgba(239,68,68,.2)",color:RED,padding:"4px 8px"}} 
                        onClick={() => deleteMessage("famille", idx)}>🗑️</button>
                    </div>
                  ))}

              <div style={{fontSize:13,fontWeight:700,marginBottom:10,marginTop:16}}>💬 Chat Collègues</div>
              {(st.chat?.collegues || []).length === 0
                ? <div style={t.empty}>Aucun message</div>
                : (st.chat?.collegues || []).map((msg, idx) => (
                    <div key={idx} style={{
                      background:SURF2,borderRadius:10,padding:"10px 12px",marginBottom:8,
                      display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8
                    }}>
                      <div style={{flex:1,fontSize:12}}>
                        <div style={{fontWeight:700,color:"#7c3aed"}}>{msg.user}</div>
                        <div style={{color:TXT,marginTop:2}}>{msg.text}</div>
                        <div style={{fontSize:10,color:MUTED,marginTop:4}}>{new Date(msg.ts).toLocaleString()}</div>
                      </div>
                      <button style={{...t.btnXS,background:"rgba(239,68,68,.2)",color:RED,padding:"4px 8px"}} 
                        onClick={() => deleteMessage("collegues", idx)}>🗑️</button>
                    </div>
                  ))}

              <div style={{fontSize:13,fontWeight:700,marginBottom:10,marginTop:16}}>💬 Chat Externes</div>
              {(st.chat?.externe || []).length === 0
                ? <div style={t.empty}>Aucun message</div>
                : (st.chat?.externe || []).map((msg, idx) => (
                    <div key={idx} style={{
                      background:SURF2,borderRadius:10,padding:"10px 12px",marginBottom:8,
                      display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8
                    }}>
                      <div style={{flex:1,fontSize:12}}>
                        <div style={{fontWeight:700,color:"#0d9488"}}>{msg.user}</div>
                        <div style={{color:TXT,marginTop:2}}>{msg.text}</div>
                        <div style={{fontSize:10,color:MUTED,marginTop:4}}>{new Date(msg.ts).toLocaleString()}</div>
                      </div>
                      <button style={{...t.btnXS,background:"rgba(239,68,68,.2)",color:RED,padding:"4px 8px"}} 
                        onClick={() => deleteMessage("externe", idx)}>🗑️</button>
                    </div>
                  ))}

              <div style={{fontSize:13,fontWeight:700,marginBottom:10,marginTop:16}}>📝 Commentaires Matchs</div>
              {Object.keys(st.matchComments || {}).length === 0
                ? <div style={t.empty}>Aucun commentaire</div>
                : Object.entries(st.matchComments || {}).map(([matchId, matchData]) => {
                    const familleComments = (matchData?.famille || []);
                    const colleaguesComments = (matchData?.collegues || []);
                    const totalComments = familleComments.length + colleaguesComments.length + (matchData?.externe||[]).length;
                    
                    if (totalComments === 0) return null;
                    
                    return (
                      <div key={matchId} style={{marginBottom:14,background:SURF2,borderRadius:10,padding:12}}>
                        <div style={{fontSize:11,color:MUTED,fontWeight:700,marginBottom:10}}>Match {matchId} · {totalComments} 💬</div>
                        
                        {/* Commentaires Famille */}
                        {familleComments.length > 0 && (
                          <>
                            <div style={{fontSize:10,color:GREEN,fontWeight:700,marginBottom:6}}>👥 Famille</div>
                            {familleComments.map((comment, idx) => (
                              <div key={`fam-${idx}`} style={{
                                background:"rgba(34,197,94,.08)",borderRadius:8,padding:"8px 10px",marginBottom:6,
                                display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8
                              }}>
                                <div style={{flex:1,fontSize:11}}>
                                  <div style={{fontWeight:700,color:GREEN}}>{comment.user}</div>
                                  <div style={{color:TXT,marginTop:1}}>{comment.text}</div>
                                </div>
                                <button style={{...t.btnXS,background:"rgba(239,68,68,.2)",color:RED,padding:"2px 6px",fontSize:10}} 
                                  onClick={() => deleteMatchComment(matchId, "famille", idx)}>🗑️</button>
                              </div>
                            ))}
                          </>
                        )}
                        
                        {/* Commentaires Collègues */}
                        {colleaguesComments.length > 0 && (
                          <>
                            <div style={{fontSize:10,color:"#7c3aed",fontWeight:700,marginBottom:6,marginTop:10}}>👥 Collègues</div>
                            {colleaguesComments.map((comment, idx) => (
                              <div key={`col-${idx}`} style={{
                                background:"rgba(124,58,237,.08)",borderRadius:8,padding:"8px 10px",marginBottom:6,
                                display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8
                              }}>
                                <div style={{flex:1,fontSize:11}}>
                                  <div style={{fontWeight:700,color:"#7c3aed"}}>{comment.user}</div>
                                  <div style={{color:TXT,marginTop:1}}>{comment.text}</div>
                                </div>
                                <button style={{...t.btnXS,background:"rgba(239,68,68,.2)",color:RED,padding:"2px 6px",fontSize:10}} 
                                  onClick={() => deleteMatchComment(matchId, "collegues", idx)}>🗑️</button>
                              </div>
                            ))}
                          </>
                        )}
                        {/* Commentaires Externes */}
                        {(matchData?.externe||[]).length > 0 && (
                          <>
                            <div style={{fontSize:10,color:"#0d9488",fontWeight:700,marginBottom:6,marginTop:10}}>🌐 Externes</div>
                            {(matchData.externe||[]).map((comment, idx) => (
                              <div key={`ext-${idx}`} style={{
                                background:"rgba(13,148,136,.08)",borderRadius:8,padding:"8px 10px",marginBottom:6,
                                display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8
                              }}>
                                <div style={{flex:1,fontSize:11}}>
                                  <div style={{fontWeight:700,color:"#0d9488"}}>{comment.user}</div>
                                  <div style={{color:TXT,marginTop:1}}>{comment.text}</div>
                                </div>
                                <button style={{...t.btnXS,background:"rgba(239,68,68,.2)",color:RED,padding:"2px 6px",fontSize:10}} 
                                  onClick={() => deleteMatchComment(matchId, "externe", idx)}>🗑️</button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  }).filter(Boolean)}
            </>}
            {adminSub==="results" && <>
              {/* ── DÉVERROUILLAGE PHASES ÉLIM (admin) ── */}
              {(() => {
                const elimUnlocked = st.elimUnlocked || [];
                const elimRealTeams = st.elimRealTeams || {};
                const phaseOrder = ["seiziemes","huitiemes","quarts","demis","p3","finale"];
                const phaseLabels = {seiziemes:"1/16 de finale",huitiemes:"Huitièmes",quarts:"Quarts de finale",demis:"Demi-finales",p3:"3e place",finale:"Finale"};
                const editPhase = adminEditPhase;
                const setEditPhase = setAdminEditPhase;
                const teamInputs = adminTeamInputs;
                const setTeamInputs = setAdminTeamInputs;

                const toggleUnlock = (phase) => {
                  const cur = st.elimUnlocked || [];
                  const isLocked = cur.includes(phase);
                  const newUnlocked = isLocked ? cur.filter(p=>p!==phase) : [...cur, phase];
                  setSt(prev => {
                    const ns = {...prev, elimUnlocked: newUnlocked};
                    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                    showNotif("success", `${isLocked?"🔒 Verrouillé":"🔓 Déverrouillé"} : ${phaseLabels[phase]}`);
                    return ns;
                  });
                  if (_fbReady) { _fbUpdate("/", { elimUnlocked: newUnlocked }); trackWrite("elimUnlocked", newUnlocked); }
                };

                const saveRealTeams = (phase) => {
                  const matchList = MATCHES.filter(m=>m.phase===phase&&m.group==="ELIM");
                  // Calculé AVANT setSt (synchrone) — évite que la variable soit null
                  // quand _fbUpdate est appelé (bug du callback async setSt)
                  const prevElimRealTeams = st.elimRealTeams || {};
                  const updates = {};
                  matchList.forEach(m => {
                    const h = teamInputs[m.id+"_home"] || (prevElimRealTeams[m.id]?.home) || "";
                    const a = teamInputs[m.id+"_away"] || (prevElimRealTeams[m.id]?.away) || "";
                    if (h || a) updates[m.id] = {home:h||m.home, away:a||m.away};
                  });
                  const newElimRealTeams = {...prevElimRealTeams, ...updates};
                  setSt(prev => {
                    const ns = {...prev, elimRealTeams: newElimRealTeams};
                    try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                    showNotif("success", "✅ Affiches enregistrées !");
                    setTeamInputs({});
                    return ns;
                  });
                  if (_fbReady) { _fbUpdate("/", { elimRealTeams: newElimRealTeams }); trackWrite("elimRealTeams", newElimRealTeams); }
                };

                return (
                  <div style={{...t.card, marginBottom:12, border:"1px solid rgba(245,200,66,.2)", background:"rgba(245,200,66,.05)"}}>
                    <div style={{fontSize:12,color:GOLD,fontWeight:700,marginBottom:8}}>🔓 Déverrouillage phases éliminatoires</div>
                    <div style={{fontSize:10,color:MUTED,marginBottom:10}}>Déverrouille une phase → les joueurs voient les vrais matchs et peuvent pronostiquer</div>
                    {phaseOrder.map(phase=>{
                      const unlocked = elimUnlocked.includes(phase);
                      const matchList = MATCHES.filter(m=>m.phase===phase&&m.group==="ELIM");
                      const hasRealTeams = matchList.some(m=>elimRealTeams[m.id]?.home);
                      return (
                        <div key={phase} style={{marginBottom:8,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,.04)",border:`1px solid ${unlocked?"rgba(34,197,94,.3)":"rgba(255,255,255,.08)"}`}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                            <div>
                              <div style={{fontSize:12,fontWeight:700,color:unlocked?GREEN:MUTED}}>{phaseLabels[phase]}</div>
                              <div style={{fontSize:10,color:MUTED}}>{matchList.length} matchs · {hasRealTeams?"affiches saisies":"pas d'affiches"}</div>
                            </div>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>setEditPhase(editPhase===phase?null:phase)}
                                style={{padding:"5px 8px",borderRadius:6,border:"none",background:"rgba(245,200,66,.15)",color:GOLD,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                                ✏️ Affiches
                              </button>
                              <button onClick={()=>toggleUnlock(phase)}
                                style={{padding:"5px 8px",borderRadius:6,border:"none",background:unlocked?"rgba(34,197,94,.2)":"rgba(255,255,255,.08)",color:unlocked?GREEN:MUTED,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                                {unlocked?"🔓 Déverr.":"🔒 Verr."}
                              </button>
                            </div>
                          </div>
                          {editPhase===phase && (
                            <div style={{marginTop:8}}>
                              {(() => {
                                // Équipes déjà choisies DANS CETTE PHASE (toutes affiches confondues),
                                // pour empêcher un doublon entre deux matchs du même tour.
                                const usedInPhase = new Set();
                                matchList.forEach(mm => {
                                  const hh = teamInputs[mm.id+"_home"] ?? elimRealTeams[mm.id]?.home;
                                  const aa = teamInputs[mm.id+"_away"] ?? elimRealTeams[mm.id]?.away;
                                  if (hh) usedInPhase.add(hh);
                                  if (aa) usedInPhase.add(aa);
                                });
                                return matchList.map(m=>{
                                  const curHome = teamInputs[m.id+"_home"] ?? elimRealTeams[m.id]?.home ?? "";
                                  const curAway = teamInputs[m.id+"_away"] ?? elimRealTeams[m.id]?.away ?? "";
                                  return (
                                    <div key={m.id} style={{marginBottom:8}}>
                                      <div style={{fontSize:10,color:MUTED,marginBottom:4}}>{m.id} — {m.date} {m.time} {m.city}</div>
                                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                        <select value={curHome}
                                          onChange={e=>setTeamInputs(ti=>({...ti,[m.id+"_home"]:e.target.value}))}
                                          style={{flex:1,padding:"6px 4px",borderRadius:6,border:`1px solid ${BRD}`,background:SURF2,color:curHome?TXT:MUTED,fontSize:11,fontFamily:"inherit"}}>
                                          <option value="">— Équipe —</option>
                                          {ALL_TEAMS.map(team=>(
                                            <option key={team} value={team} disabled={usedInPhase.has(team)&&team!==curHome}>
                                              {team}{usedInPhase.has(team)&&team!==curHome?" (déjà prise)":""}
                                            </option>
                                          ))}
                                        </select>
                                        <span style={{color:MUTED,fontWeight:700}}>VS</span>
                                        <select value={curAway}
                                          onChange={e=>setTeamInputs(ti=>({...ti,[m.id+"_away"]:e.target.value}))}
                                          style={{flex:1,padding:"6px 4px",borderRadius:6,border:`1px solid ${BRD}`,background:SURF2,color:curAway?TXT:MUTED,fontSize:11,fontFamily:"inherit"}}>
                                          <option value="">— Équipe —</option>
                                          {ALL_TEAMS.map(team=>(
                                            <option key={team} value={team} disabled={usedInPhase.has(team)&&team!==curAway}>
                                              {team}{usedInPhase.has(team)&&team!==curAway?" (déjà prise)":""}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                              <button onClick={()=>saveRealTeams(phase)}
                                style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                                💾 Enregistrer les affiches
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div style={t.tabs}>
                {[{k:"poules",l:"Poules"},...elimPhases].map(p=>(
                  <button key={p.k} style={{...t.tab,...(aPhase===p.k?t.tabOn:{})}} onClick={()=>setAPhase(p.k)}>{p.l}</button>
                ))}
              </div>
              {[...MATCHES.filter(m=>m.phase===aPhase)]
                .sort((a,b)=>a.dk.localeCompare(b.dk)||a.time.localeCompare(b.time))
                .map(m=>{
                  const hasThirdHome = m.home.startsWith("3e ");
                  const hasThirdAway = m.away.startsWith("3e ");
                  const offThirds = st.officialThirds || {};

                  // Groupes déjà attribués dans les AUTRES seizièmes (côté admin)
                  let takenGroups = undefined;
                  if (m.phase === "seiziemes" && (hasThirdHome || hasThirdAway)) {
                    takenGroups = new Set();
                    MATCHES.filter(other => other.phase === "seiziemes" && other.id !== m.id).forEach(other => {
                      [["home", other.home], ["away", other.away]].forEach(([side, slot]) => {
                        if (slot.startsWith("3e ")) {
                          const g = offThirds[other.id + "_" + side];
                          if (g) takenGroups.add(g);
                        }
                      });
                    });
                  }

                  // ── FINALE : panneau spécial (vainqueur/nul/prolongation/TAB/buteurs/score) ──
                  if (m.id === "FIN") {
                    const realTeams = (st.elimRealTeams||{})[m.id];
                    const homeT = realTeams?.home || resolveTeamWithPredictions(m.home, st.results||{}, {}, {}, st.officialThirds||{}, {});
                    const awayT = realTeams?.away || resolveTeamWithPredictions(m.away, st.results||{}, {}, {}, st.officialThirds||{}, {});
                    return (
                      <FinalePanel key={m.id} m={m} isAdmin homeT={homeT} awayT={awayT}
                        official={st.finaleData?.official} myPick={null}
                        onSave={saveFinaleOfficial} locked={false}/>
                    );
                  }

                  return (
                    <MatchCard key={m.id} m={m} official={(st.results||{})[m.id]}
                      score={(st.scores||{})[m.id]}
                      isAdmin onScore={setScore} onClear={clearScore} results={st.results||{}} officialThirds={st.officialThirds||{}} predictions={{}} userThirds={{}}
                      realTeams={(st.elimRealTeams||{})[m.id]}
                      thirdPick={(hasThirdHome||hasThirdAway) ? {
                        home: hasThirdHome ? (offThirds[m.id+"_home"] || null) : null,
                        away: hasThirdAway ? (offThirds[m.id+"_away"] || null) : null,
                      } : null}
                      onThirdPick={(hasThirdHome||hasThirdAway)
                        ? (side, g) => setOfficialThird(m.id, side, g)
                        : null}
                      takenGroups={takenGroups}
                    />
                  );
                })
              }
            </>}

            <div style={{height:16}}/>
          </div>
        )}

        {/* ── HISTORIQUE RÉSULTATS ── */}
        {tab==="histo" && (
          <div style={t.sec}>
            <div style={{height:12}}/>
            {(()=>{
              const _resultTs = st.resultTs || {};
              const played = [...MATCHES.filter(m=>(st.results||{})[m.id])].sort((a,b) => {
                const tsA = _resultTs[a.id] || 0;
                const tsB = _resultTs[b.id] || 0;
                if (tsA !== tsB) return tsB - tsA;
                return MATCHES.indexOf(b) - MATCHES.indexOf(a); // fallback ordre calendrier inversé
              });
              if (played.length===0) return (
                <div style={{...t.card,textAlign:"center",padding:"28px 16px"}}>
                  <div style={{fontSize:32,marginBottom:8}}>⏳</div>
                  <div style={{fontSize:13,color:MUTED}}>Aucun résultat officiel encore</div>
                </div>
              );
              // Vérifier si le joueur a des pronostics sur les matchs joués
              const hasAnyPred = played.some(m => preds[m.id]);
              // Grouper par date en préservant l'ordre inversé (récent en haut)
              const byDate = {};
              const dateOrder = []; // ordre des dates d'après played (déjà inversé)
              played.forEach(m=>{
                if(!byDate[m.date]) { byDate[m.date]=[]; dateOrder.push(m.date); }
                byDate[m.date].push(m);
              });
              return (<>
                {!hasAnyPred && (
                  <div style={{
                    ...t.card, marginBottom:12, padding:"12px 16px",
                    background:"rgba(245,158,11,.08)", border:`1px solid rgba(245,158,11,.25)`,
                    display:"flex", alignItems:"center", gap:10,
                  }}>
                    <span style={{fontSize:24}}>📋</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:AMB}}>Aucun pronostic enregistré</div>
                      <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                        Tu n'avais pas encore validé de pronostics pour ces matchs.
                        Va dans l'onglet Poules pour commencer !
                      </div>
                    </div>
                  </div>
                )}
                {dateOrder.map(date=>{
                const matches = byDate[date];
                return (
                <div key={date} style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:GOLD,textTransform:"uppercase",
                    letterSpacing:1,marginBottom:8,padding:"4px 0",
                    borderBottom:`1px solid ${BRD}`}}>
                    📅 {date}
                  </div>
                  {matches.map(m=>{
                    const sc = (st.scores||{})[m.id];
                    const off = (st.results||{})[m.id];
                    const myPred = preds[m.id];
                    const correct = myPred && myPred===off;
                    const wrong   = myPred && myPred!==off;
                    const rH = resolveForPlayer(m.home, m.id, "home");
                    const rA = resolveForPlayer(m.away, m.id, "away");
                    return (
                      <div key={m.id} style={{
                        ...t.card,
                        ...(correct?t.cGreen:wrong?t.cRed:{}),
                        padding:"10px 12px",marginBottom:8
                      }}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          {/* Equipe domicile */}
                          <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:20}}>{F(rH)}</span>
                            <span style={{fontSize:12,fontWeight:600,lineHeight:1.2}}>{rH}</span>
                          </div>
                          {/* Score */}
                          <div style={{textAlign:"center",flexShrink:0}}>
                            <div style={{
                              fontSize:18,fontWeight:900,
                              color:correct?GREEN:wrong?RED:GOLD,
                              letterSpacing:1
                            }}>
                              {sc?`${sc.h} – ${sc.a}`:off==="1"?"1–0":off==="2"?"0–1":"N"}
                            </div>
                            <div style={{fontSize:9,color:MUTED,marginTop:2}}>
                              {correct?`✓ +${PHASE_POINTS[m.phase]??1}pts`:wrong?"✗ raté":myPred?"non validé":""}
                            </div>
                          </div>
                          {/* Equipe extérieure */}
                          <div style={{flex:1,display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
                            <span style={{fontSize:12,fontWeight:600,lineHeight:1.2,textAlign:"right"}}>{rA}</span>
                            <span style={{fontSize:20}}>{F(rA)}</span>
                          </div>
                        </div>
                        {/* Prono du joueur */}
                        {myPred && (
                          <div style={{
                            marginTop:6,fontSize:10,textAlign:"center",
                            color:correct?GREEN:wrong?RED:MUTED,fontWeight:600
                          }}>
                            Ton prono : {myPred==="1"?rH:myPred==="2"?rA:"Match nul"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
                })}
              </>);
            })()}
            <div style={{height:16}}/>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            🎮 ONGLET JEUX
            ══════════════════════════════════════════════════ */}
        {tab==="jeux" && (()=>{
          // players : tous les joueurs du même groupe, ou tous si admin
          // Note : on vérifie que role est défini pour éviter les exclusions inattendues
          const players = Object.keys(st.users).filter(u => {
            if (u === "admin" || u === user) return false;
            const uRole = (st.users[u]||{}).role;
            if (isAdmin) return true;
            if (!role || !uRole) return true; // si rôle non défini, on inclut
            return uRole === role;
          });
          const gameScores = st.gameScores || {};
          const gameScoresTotal = st.gameScoresTotal || {};
          const challenges = st.challenges || {};
          const NUMERIC_GAMES = ["quiz","quisuisje","plusmoins","toptrumps","penalty","mystere"]; // exclut "buteur" (score = nom, pas un nombre)
          // Joueurs du même groupe que l'utilisateur (admin voit tout le monde)
          const sameGroupUsers = Object.keys(st.users).filter(u => u !== "admin" && (isAdmin || (st.users[u]||{}).role===role));

          // ── Plafond quotidien anti-grind : maximum 3 parties par jour et par jeu.
          // Au-delà, impossible de lancer une nouvelle partie OU un nouveau défi
          // (et pas seulement "ça ne compte pas") — pour éviter de retomber sur
          // les mêmes questions/cartes et fausser l'équité entre joueurs ──
          const DAILY_PLAY_LIMIT = 999; // pas de limite quotidienne
          const gamePlaysToday = st.gamePlaysToday || {};
          const getDailyCount = (game, who) => {
            const v = (gamePlaysToday[game]||{})[who];
            return (v && v.date===todayKey()) ? v.count : 0;
          };
          const bumpDailyCount = (game, who) => {
            const cur = getDailyCount(game, who);
            return { ...gamePlaysToday, [game]: { ...(gamePlaysToday[game]||{}), [who]: { date: todayKey(), count: cur+1 } } };
          };
          // Renvoie true si BLOQUÉ (et affiche le message) — à appeler avant tout lancement de partie/défi
          const blockIfDailyLimitReached = (game, who = user) => {
            if (game === "buteur") return false; // pas de plafond pour Buteur (pas de "questions")
            if (getDailyCount(game, who) >= DAILY_PLAY_LIMIT) {
              showNotif("info", who===user
                ? `⏳ Tu as déjà joué ${DAILY_PLAY_LIMIT} parties de ce jeu aujourd'hui. Reviens demain !`
                : `⏳ ${who.toUpperCase()} a déjà joué ${DAILY_PLAY_LIMIT} parties de ce jeu aujourd'hui — défi impossible pour l'instant.`);
              return true;
            }
            return false;
          };

          // ── Plafond quotidien sur les INVITATIONS ENVOYÉES (distinct des parties jouées) :
          // max 3 défis envoyés par jour, par jeu, par joueur — même si certains sont
          // refusés ou jamais terminés, pour empêcher le spam d'invitations ──
          const DAILY_CHALLENGE_SEND_LIMIT = 999; // pas de limite d'envoi de défis
          const challengesSentToday = st.challenges
            ? Object.values(st.challenges).filter(c =>
                c.from===user && new Date(c.ts).toDateString()===new Date().toDateString()
              )
            : [];
          const getSentTodayCount = (game) => challengesSentToday.filter(c => c.game===game).length;
          const blockIfSendLimitReached = (game) => {
            if (getSentTodayCount(game) >= DAILY_CHALLENGE_SEND_LIMIT) {
              showNotif("info", `⏳ Tu as déjà envoyé ${DAILY_CHALLENGE_SEND_LIMIT} défis pour ce jeu aujourd'hui. Réessaie demain !`);
              return true;
            }
            return false;
          };

          const saveGameScore = (game, score, mode = "solo", opponent = null, won = null) => {
            const isNumeric = typeof score === "number";
            if (!isNumeric) {
              // Cas "buteur" : score = nom du gagnant choisi
              const updatedGS = { ...((st.gameScores||{})[game]||{}), [user]: score };
              setSt(prev => {
                const ns = { ...prev, gameScores: { ...(prev.gameScores||{}), [game]: updatedGS } };
                try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                return ns;
              });
              if (_fbReady) _fbUpdate(`/gameScores/${game}`, updatedGS);
              return;
            }

            const currentCount = getDailyCount(game, user);
            const capped = currentCount >= DAILY_PLAY_LIMIT;

            let scopedPlaysToday, scopedHistory, scopedGameScores, scopedGameScoresTotal;
            setSt(prev => {
              const gameHistoryAll = prev.gameHistory || {};
              const userHistory = (gameHistoryAll[user] || []);
              const newEntry = { game, score, mode, opponent, won, ts: Date.now() };
              const cappedHistory = [...userHistory, newEntry].slice(-50); // max 50 entrées
              const newPlaysToday = bumpDailyCount(game, user);
              scopedPlaysToday = newPlaysToday[game];
              scopedHistory = cappedHistory;

              let ns;
              if (capped) {
                ns = { ...prev, gamePlaysToday: newPlaysToday, gameHistory: { ...gameHistoryAll, [user]: cappedHistory } };
              } else {
                const gs = prev.gameScores || {};
                const gst = prev.gameScoresTotal || {};
                const prevBest  = (gs[game] || {})[user];
                const prevTotal = (gst[game] || {})[user] || 0;
                const newBest = (typeof prevBest === "number" && prevBest > score) ? prevBest : score;
                scopedGameScores = { ...(gs[game]||{}),  [user]: newBest };
                scopedGameScoresTotal = { ...(gst[game]||{}), [user]: prevTotal + score };
                ns = {
                  ...prev,
                  gamePlaysToday:  newPlaysToday,
                  gameScores:      { ...gs,  [game]: scopedGameScores },
                  gameScoresTotal: { ...gst, [game]: scopedGameScoresTotal },
                  gameHistory:     { ...gameHistoryAll, [user]: cappedHistory },
                };
              }
              try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
              return ns;
            });
            // Écritures scopées : chaque branche ne touche que ses propres clés
            // (jeu précis / joueur précis), jamais les pronostics ou validations.
            if (_fbReady) {
              const updates = { [`gamePlaysToday/${game}`]: scopedPlaysToday, [`gameHistory/${user}`]: scopedHistory };
              if (scopedGameScores) updates[`gameScores/${game}`] = scopedGameScores;
              if (scopedGameScoresTotal) updates[`gameScoresTotal/${game}`] = scopedGameScoresTotal;
              _fbUpdate("/", updates);
            }

            if (capped) {
              showNotif("info", `⏳ Limite quotidienne atteinte (${DAILY_PLAY_LIMIT}/${DAILY_PLAY_LIMIT}) pour ce jeu — cette partie ne compte pas dans ton score.`);
            } else if (currentCount + 1 === DAILY_PLAY_LIMIT) {
              showNotif("info", `ℹ️ Dernière partie comptée aujourd'hui pour ce jeu (${DAILY_PLAY_LIMIT}/${DAILY_PLAY_LIMIT})`);
            }
          };

          // ── DÉFIS GÉNÉRALISÉS (quiz / quisuisje / plusmoins / toptrumps) ──
          // Principe : le défi est envoyé AVANT de jouer, avec un set de questions
          // FIGÉ et IDENTIQUE pour les deux joueurs, afin de pouvoir comparer équitablement.
          const CHALLENGE_GAMES = ["quiz","quisuisje","plusmoins","toptrumps","mystere"];
          const MYSTERY_MAX_TURNS = 10; // nombre max de cases révélées avant fin de partie
          const buildQuestionSet = (game) => {
            if (game==="quiz")      return [...QUIZ_QUESTIONS].sort(()=>Math.random()-.5).slice(0,10);
            if (game==="quisuisje") return [...QUI_SUIS_JE].sort(()=>Math.random()-.5).slice(0,6);
            if (game==="plusmoins") return [...PLUS_MOINS_QUESTIONS].sort(()=>Math.random()-.5).slice(0,14);
            if (game==="toptrumps") {
              const sh=[...TOP_TRUMPS_CARDS].sort(()=>Math.random()-.5);
              const pairs=[]; for(let i=0;i<8;i++) pairs.push([sh[i*2%sh.length],sh[(i*2+1)%sh.length]]);
              return pairs;
            }
            if (game==="mystere") {
              const p = FOOTBALL_PLAYERS_BANK[Math.floor(Math.random()*FOOTBALL_PLAYERS_BANK.length)];
              const revealOrder = [...Array(25).keys()].sort(()=>Math.random()-.5);
              return { player:p, revealOrder };
            }
            return [];
          };
          const launchChallengeGame = (id, chOverride) => {
            const ch = chOverride || challenges[id];
            if (!ch) return;
            setActiveGame(ch.game); setGamePhase("playing"); resetGame();
            setActiveChallengeId(id);
            playGameMusic(ch.game); soundWhistle();
            if (ch.game==="quiz")      setQuizSet(ch.questionSet);
            if (ch.game==="quisuisje") setQsjQ(ch.questionSet);
            if (ch.game==="plusmoins") setPmQ(ch.questionSet);
            if (ch.game==="toptrumps") {
              setTtChallengeQueue(ch.questionSet.slice(1));
              setTtCard1(ch.questionSet[0][0]); setTtCard2(ch.questionSet[0][1]);
            }
            if (ch.game==="mystere") {
              setMysteryPlayer(ch.questionSet.player);
              setMysteryRevealOrder(ch.questionSet.revealOrder);
              setMysteryTurn(1);
              setMysteryPhotoUrl(null);
              setMysteryPhotoError(null);
              fetchMysteryPhoto(ch.questionSet.player).then(({url,error})=>{ setMysteryPhotoUrl(url || false); setMysteryPhotoError(error); });
            }
          };
          const sendGameChallenge = (toUser, game) => {
            if (!CHALLENGE_GAMES.includes(game)) { setChallengePicker(null); return; } // ce jeu a son propre système de défi
            if (blockIfSendLimitReached(game)) { setChallengePicker(null); return; }
            if (blockIfDailyLimitReached(game, user)) { setChallengePicker(null); return; }
            if (blockIfDailyLimitReached(game, toUser)) { setChallengePicker(null); return; }
            // Un seul défi non résolu à la fois par (moi, adversaire, jeu)
            const existing = Object.values(challenges).find(c =>
              c.game===game && (c.status==="pending"||c.status==="accepted") &&
              ((c.from===user&&c.to===toUser)||(c.from===toUser&&c.to===user))
            );
            if (existing) {
              showNotif("error", `❌ Tu as déjà un défi en cours avec ${toUser.toUpperCase()} pour ce jeu — attends qu'il soit terminé.`);
              setChallengePicker(null);
              return;
            }
            const id = `chal_${user}_${toUser}_${game}_${Date.now()}`;
            const qSet = buildQuestionSet(game);
            const chData = {from:user,to:toUser,game,status:"pending",questionSet:qSet,fromScore:null,toScore:null,ts:Date.now()};
            recentChallengeWritesRef.current[id] = { data: chData, ts: Date.now() };
            setSt(prev => {
              const ns = {...prev, challenges:{...(prev.challenges||{}),[id]:chData}};
              try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
              return ns;
            });
            // Écriture scopée : ne touche qu'à ce défi précis, protège les autres
            // défis (potentiellement créés/modifiés au même instant) contre un écrasement.
            if (_fbReady) _fbUpdate(`/challenges/${id}`, chData);
            setChallengePicker(null);
            showNotif("success",`⚔️ Défi envoyé à ${toUser.toUpperCase()} ! À toi de jouer en premier.`);
            launchChallengeGame(id, chData);
          };
          const acceptChallenge = (id) => {
            const ch = challenges[id];
            if (ch && blockIfDailyLimitReached(ch.game, user)) return;
            const updated = {...ch, status:"accepted"};
            recentChallengeWritesRef.current[id] = { data: updated, ts: Date.now() };
            setSt(prev => {
              const ns = {...prev, challenges:{...(prev.challenges||{}),[id]:updated}};
              try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
              return ns;
            });
            if (_fbReady) _fbUpdate(`/challenges/${id}`, updated);
            launchChallengeGame(id);
          };
          const declineChallenge = (id) => {
            const ch=challenges[id];
            const updated = {...ch, status:"declined"};
            recentChallengeWritesRef.current[id] = { data: updated, ts: Date.now() };
            setSt(prev => {
              const ns = {...prev, challenges:{...(prev.challenges||{}),[id]:updated}};
              try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
              return ns;
            });
            if (_fbReady) _fbUpdate(`/challenges/${id}`, updated);
            showNotif("info",`Défi de ${ch.from?.toUpperCase?.()||ch.from||"?"} refusé`);
          };
          // Une fois "accepted", le challenger (from) doit aussi jouer son tour
          const playMyTurn = (id) => {
            const ch = challenges[id];
            if (ch && blockIfDailyLimitReached(ch.game, user)) return;
            launchChallengeGame(id);
          };

          const myPendingChallenges = Object.entries(challenges).filter(([,c]) => CHALLENGE_GAMES.includes(c.game) && c.to===user && c.status==="pending");
          const myTurnToPlay = Object.entries(challenges).filter(([,c]) => CHALLENGE_GAMES.includes(c.game) && (
            (c.status==="accepted" && ((c.from===user&&c.fromScore===null)||(c.to===user&&c.toScore===null))) ||
            (c.status==="pending" && c.from===user && c.fromScore===null)
          ));
          // myDoneChallenges retiré — remplacé par gameHistory dans l'historique complet
          const myDeclinedChallenges = Object.entries(challenges).filter(([,c]) => CHALLENGE_GAMES.includes(c.game) && c.status==="declined" && c.from===user).sort((a,b)=>b[1].ts-a[1].ts).slice(0,5);

          const resetGame = () => {
            setQIdx(0); setQScore(0); setAnswered(null); setShowFact(false);
            setIndiceIdx(0); setGuessInput(""); setGuessResult(null);
            setTtRound(0); setTtWins(0); setTtReveal(null);
            setPenShots([]); setPenPhase("shoot");
            setPmInput(""); setPmAnswered(false); setPmTotal(0); setPmIdx(0);
            setButeurWinner(null); setButeurDeck([]); setButeurPick(null); setButeurDone(false);
            setPenChallengeId(null); setPenZonePick(null); setPenRevealStage("none"); penAnimRef.current=null;
            setPenCursorPos({x:50,y:35}); penCursorStartRef.current=null;
            if(penCursorIntervalRef.current){clearInterval(penCursorIntervalRef.current);penCursorIntervalRef.current=null;}
            setPenAiCursorPos({x:50,y:35}); penAiStartRef.current=null;
            if(penAiIntervalRef.current){clearInterval(penAiIntervalRef.current);penAiIntervalRef.current=null;}
            setPenDifficulty(null);
            setActiveChallengeId(null); setTtChallengeQueue(null); setGameMode(null);
            setPenOrdiPhase("choose"); setPenOrdiRole(null); setPenOrdiPick(null); setPenOrdiCpu(null); setPenOrdiScore({player:0,cpu:0,round:1,total:5});
            setMysteryPlayer(null); setMysteryRevealOrder([]); setMysteryTurn(0); setMysteryPhotoUrl(null); setMysteryPhotoError(null); setMysteryLastGuess("");
          };

          const startGame = (game, length, mode=null) => {
            setActiveGame(game); setGamePhase("playing"); resetGame();
            if (mode) setGameMode(mode); // après resetGame qui efface gameMode
            playGameMusic(game);
            soundWhistle();
            if (game==="toptrumps") {
              const sh=[...TOP_TRUMPS_CARDS].sort(()=>Math.random()-.5);
              setTtCard1(sh[0]); setTtCard2(sh[1]);
            }
            if (game==="quisuisje") {
              setQsjQ([...QUI_SUIS_JE].sort(()=>Math.random()-.5).slice(0,6));
            }
            if (game==="plusmoins") {
              const shuffled=[...PLUS_MOINS_QUESTIONS].sort(()=>Math.random()-.5);
              setPmQ(length ? shuffled.slice(0,length) : shuffled);
            }
            if (game==="quiz") {
              const shuffled=[...QUIZ_QUESTIONS].sort(()=>Math.random()-.5);
              setQuizSet(length ? shuffled.slice(0,length) : shuffled);
            }
            if (game==="mystere") {
              const p = FOOTBALL_PLAYERS_BANK[Math.floor(Math.random()*FOOTBALL_PLAYERS_BANK.length)];
              const revealOrder = [...Array(25).keys()].sort(()=>Math.random()-.5);
              setMysteryPlayer(p); setMysteryRevealOrder(revealOrder); setMysteryTurn(1); setMysteryPhotoUrl(null); setMysteryPhotoError(null);
              fetchMysteryPhoto(p).then(({url,error})=>{ setMysteryPhotoUrl(url || false); setMysteryPhotoError(error); });
            }
            if (game==="buteur") {
              // Tournoi : mélanger les cartes, poser la 1ère comme champion, le reste comme deck
              const shuffled = [...BUTEUR_CARDS].sort(()=>Math.random()-.5);
              setButeurWinner(shuffled[0]);
              setButeurDeck(shuffled.slice(1));
            }
          };

          // Pour quiz et plusmoins : on demande la longueur de partie avant de lancer
          const askLength = (game) => { setActiveGame(game); setGamePhase("length"); };
          const lengthOptions = {
            quiz:      [{n:10,l:"⚡ Rapide"},{n:20,l:"🎯 Normal"}],
            plusmoins: [{n:8, l:"⚡ Rapide"},{n:14,l:"🎯 Normal"}],
          };

          // ── CHOIX DE L'ADVERSAIRE POUR UN DÉFI ────────────────
          // (ce bloc DOIT être vérifié avant l'écran "mode" : cliquer sur
          // "Défier quelqu'un" ne change pas gamePhase, qui reste "mode" —
          // si on testait gamePhase==="mode" en premier, on retombait
          // toujours sur l'écran mode au lieu du choix de l'adversaire)
          if (challengePicker) {
            const gName2 = {quiz:"Quiz Coupe du Monde",quisuisje:"Qui suis-je ?",plusmoins:"Plus ou Moins",toptrumps:"Qui a le plus ?",mystere:"Footballeur Mystère"}[challengePicker]||challengePicker;
            return (
              <div style={t.sec}>
                <div style={{height:8}}/>
                <button onClick={()=>{setChallengePicker(null); setGamePhase("mode");}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer",marginBottom:14}}>← Retour</button>
                <div style={{...t.card,textAlign:"center",marginBottom:14,background:"rgba(245,158,11,.06)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:AMB,marginBottom:4}}>⚔️ Défier — {gName2}</div>
                  <div style={{fontSize:10,color:MUTED}}>Même set de questions pour vous deux, afin de comparer équitablement</div>
                </div>
                {players.length===0 && <div style={t.empty}>Aucun autre joueur disponible dans ton groupe</div>}
                {players.map(p=>(
                  <div key={p} style={{...t.card,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:TXT}}>{onlinePlayers.includes(p)&&<span style={{color:GREEN,marginRight:4}}>🟢</span>}{p.toUpperCase()}</div>
                    </div>
                    <button onClick={()=>sendGameChallenge(p,challengePicker)} style={{padding:"8px 12px",borderRadius:8,border:"none",background:AMB,color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚔️ Défier</button>
                  </div>
                ))}
              </div>
            );
          }

          // ── CHOIX DU MODE : SOLO ou DÉFI ─────────────────────
          if (gamePhase === "mode" && activeGame) {
            const gInfo = {
              quiz:      {icon:"🧠", name:"Quiz Coupe du Monde",   canDefi:true,  needLength:true},
              quisuisje: {icon:"👤", name:"Qui suis-je ?",         canDefi:true,  needLength:false},
              plusmoins: {icon:"🔢", name:"Plus ou Moins",         canDefi:true,  needLength:true},
              toptrumps: {icon:"🃏", name:"Qui a le plus ?",       canDefi:true,  needLength:false},
              buteur:    {icon:"🥅", name:"Meilleur Buteur",       canDefi:false, needLength:false},
              penalty:   {icon:"⚽", name:"Tirs au but",           canDefi:true,  needLength:false, canOrdi:true},
              mystere:   {icon:"🧩", name:"Footballeur Mystère",   canDefi:true,  needLength:false},
            }[activeGame] || {icon:"🎮", name:activeGame, canDefi:false, needLength:false};
            return (
              <div style={t.sec}>
                <div style={{height:8}}/>
                <button onClick={()=>{setGamePhase("menu");setActiveGame(null);setGameMode(null);}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer",marginBottom:14}}>← Retour</button>
                <div style={{textAlign:"center",marginBottom:24}}>
                  <div style={{fontSize:40,marginBottom:6}}>{gInfo.icon}</div>
                  <div style={{fontSize:18,fontWeight:900,color:TXT,marginBottom:4}}>{gInfo.name}</div>
                  <div style={{fontSize:11,color:MUTED}}>Comment veux-tu jouer ?</div>
                </div>
                {/* Solo */}
                <button onClick={()=>{
                  if (blockIfDailyLimitReached(activeGame, user)) { setGamePhase("menu"); setActiveGame(null); return; }
                  if (gInfo.needLength) { setGameMode("solo"); setGamePhase("length"); }
                  else startGame(activeGame, 0, "solo");
                }} style={{
                  display:"block",width:"100%",marginBottom:12,padding:"18px 14px",
                  borderRadius:14,border:`2px solid ${GOLD}`,background:"rgba(245,200,66,.06)",
                  cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:28}}>🎯</span>
                    <div>
                      <div style={{fontSize:15,fontWeight:800,color:GOLD}}>Jouer seul</div>
                      <div style={{fontSize:11,color:MUTED,marginTop:2}}>Bats ton propre record, à ton rythme</div>
                    </div>
                  </div>
                </button>
                {/* Défi */}
                {gInfo.canDefi && players.length > 0 && (
                  <button onClick={()=>{
                    try {
                      setGameMode("defi");
                      if (blockIfDailyLimitReached(activeGame, user)) { setGamePhase("menu"); setActiveGame(null); return; }
                      if (activeGame === "penalty") { startGame("penalty", 0, "defi"); return; }
                      setChallengePicker(activeGame);
                    } catch(err) {
                      console.error("Erreur lancement défi:", err);
                      showNotif("error", "❌ Erreur — réessaie ou contacte l'admin");
                    }
                  }} style={{
                    display:"block",width:"100%",marginBottom:12,padding:"18px 14px",
                    borderRadius:14,border:`2px solid ${AMB}`,background:"rgba(245,158,11,.06)",
                    cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:28}}>⚔️</span>
                      <div>
                        <div style={{fontSize:15,fontWeight:800,color:AMB}}>Défier quelqu'un</div>
                        <div style={{fontSize:11,color:MUTED,marginTop:2}}>Même questions, chacun joue de son côté — qui gagne ?</div>
                      </div>
                    </div>
                  </button>
                )}
                {gInfo.canDefi && players.length === 0 && (
                  <div style={{...t.card,textAlign:"center",padding:"16px",opacity:.5}}>
                    <div style={{fontSize:11,color:MUTED}}>⚔️ Aucun autre joueur disponible pour un défi</div>
                  </div>
                )}
                {!gInfo.canDefi && (
                  <div style={{...t.card,textAlign:"center",padding:"14px",background:"rgba(255,255,255,.03)"}}>
                    <div style={{fontSize:11,color:MUTED}}>Ce jeu est en mode solo uniquement</div>
                  </div>
                )}
              </div>
            );
          }

          // ── CHOIX DE LA LONGUEUR (quiz / plus ou moins) ──────────
          if (gamePhase === "length" && activeGame) {
            const gName = activeGame==="quiz" ? "Quiz Coupe du Monde" : "Plus ou Moins";
            return (
              <div style={t.sec}>
                <div style={{height:8}}/>
                <button onClick={()=>setGamePhase("mode")} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer",marginBottom:14}}>← Retour</button>
                <div style={{...t.card,textAlign:"center",marginBottom:14}}>
                  <div style={{fontSize:14,fontWeight:800,color:GOLD,marginBottom:4}}>{gName}</div>
                  <div style={{fontSize:12,color:MUTED}}>Choisis la durée de ta partie</div>
                </div>
                {lengthOptions[activeGame].map(opt=>(
                  <button key={opt.l} onClick={()=>startGame(activeGame,opt.n,"solo")}
                    style={{display:"block",width:"100%",marginBottom:8,padding:"14px",borderRadius:10,border:`1px solid ${BRD}`,background:"rgba(255,255,255,.05)",color:TXT,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                    {opt.l}{opt.n?` — ${opt.n} questions`:" — toutes les questions"}
                  </button>
                ))}
              </div>
            );
          }

          // ── MENU ──────────────────────────────────────────────
          // ══ MENU ══════════════════════════════════════════════
          if (gamePhase === "menu" || !activeGame) return (
            <div style={t.sec}>
              <div style={{height:8}}/>
              {/* Switcher Jouer / Classements / Historique */}
              <div style={{display:"flex",gap:4,marginBottom:14,background:"rgba(255,255,255,.04)",borderRadius:10,padding:4}}>
              {(()=>{
                const pendingCount = (
                  Object.values(challenges).filter(c=>c.to===user&&c.status==="pending").length +
                  Object.values(challenges).filter(c=>(c.from===user||c.to===user)&&c.game==="penalty"&&c.status==="active"&&c.tireur!=null&&!(c.pick||{})[user]).length +
                  Object.values(challenges).filter(c=>CHALLENGE_GAMES.includes(c.game)&&((c.from===user&&c.fromScore===null&&c.status==="active")||(c.to===user&&c.toScore===null&&c.status==="active"))).length
                );
                return (
                  <div style={{display:"flex",gap:4,marginBottom:12,background:"rgba(255,255,255,.04)",borderRadius:10,padding:4}}>
                    {[{k:"jouer",l:"🎮 Jouer"},{k:"classements",l:"🏆 Scores"},{k:"historique",l:"📜 Historique"}].map(s=>(
                      <button key={s.k} onClick={()=>setJeuxSubTab(s.k)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit",position:"relative",
                        background:jeuxSubTab===s.k?GOLD:"transparent",color:jeuxSubTab===s.k?"#0a0e1a":MUTED}}>
                        {s.l}
                        {s.k==="jouer"&&pendingCount>0&&(
                          <span style={{position:"absolute",top:2,right:4,background:RED,color:"#fff",borderRadius:"50%",fontSize:9,fontWeight:900,minWidth:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>
                            {pendingCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })()}
              </div>

              {jeuxSubTab==="classements" && (
                <div>
                  <div style={{fontSize:12,color:MUTED,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>🏅 Meilleur score — 1 partie</div>
                  {NUMERIC_GAMES.map(g=>{
                    const rows=sameGroupUsers.map(u=>({u,score:(gameScores[g]||{})[u]})).filter(r=>typeof r.score==="number").sort((a,b)=>b.score-a.score);
                    return (
                      <div key={g} style={{marginBottom:14}}>
                        <div style={{fontSize:11,color:GOLD,fontWeight:700,marginBottom:6}}>{GAME_LABELS[g]}</div>
                        {rows.length===0
                          ? <div style={{fontSize:11,color:MUTED,fontStyle:"italic"}}>Personne n'a encore joué</div>
                          : rows.map((r,i)=>(
                            <div key={r.u} style={{...t.card,marginBottom:5,display:"flex",alignItems:"center",gap:10,padding:"6px 12px",background:r.u===user?"rgba(245,200,66,.1)":"rgba(255,255,255,.04)"}}>
                              <div style={{fontSize:13,fontWeight:900,color:i===0?GOLD:i===1?"#94a3b8":i===2?"#cd7f32":MUTED,width:18}}>{i+1}</div>
                              <div style={{flex:1,fontSize:11,fontWeight:r.u===user?700:400,color:r.u===user?GOLD:TXT}}>{r.u.toUpperCase()}</div>
                              <div style={{fontSize:12,fontWeight:700,color:GOLD}}>{r.score} pts</div>
                            </div>
                          ))
                        }
                      </div>
                    );
                  })}
                  <div style={{marginTop:14}}>
                    <div style={{fontSize:12,color:MUTED,marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>📈 Score cumulé — total</div>
                    {sameGroupUsers.map(u=>({
                      u,total:NUMERIC_GAMES.reduce((s,g)=>s+((typeof (gameScoresTotal[g]||{})[u]==="number"?(gameScoresTotal[g]||{})[u]:0)),0)
                    })).sort((a,b)=>b.total-a.total).map((entry,i)=>(
                      <div key={entry.u} style={{...t.card,marginBottom:6,display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:entry.u===user?"rgba(96,165,250,.1)":"rgba(255,255,255,.04)"}}>
                        <div style={{fontSize:14,fontWeight:900,color:i===0?"#60a5fa":i===1?"#94a3b8":i===2?"#cd7f32":MUTED,width:20}}>{i+1}</div>
                        <div style={{flex:1,fontSize:12,fontWeight:entry.u===user?700:400,color:entry.u===user?"#60a5fa":TXT}}>{entry.u.toUpperCase()}</div>
                        <div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>{entry.total} pts</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {jeuxSubTab==="jouer" && <>
              {myPendingChallenges.map(([id,ch])=>(
                <div key={id} style={{...t.card,marginBottom:8,border:`1px solid ${AMB}`,background:"rgba(245,158,11,.08)"}}>
                  <div style={{fontSize:12,color:AMB,marginBottom:6}}>⚔️ <strong>{ch.from?.toUpperCase?.()||ch.from||"?"}</strong> te défie au {({quiz:"Quiz",quisuisje:"Qui suis-je ?",plusmoins:"Plus ou Moins",toptrumps:"Qui a le plus ?",mystere:"Footballeur Mystère"})[ch.game]||ch.game} !</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>acceptChallenge(id)} style={{flex:2,padding:"8px",borderRadius:8,border:"none",background:AMB,color:"#000",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✅ Accepter →</button>
                    <button onClick={()=>declineChallenge(id)} style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid rgba(239,68,68,.4)",background:"rgba(239,68,68,.1)",color:RED,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✗ Refuser</button>
                  </div>
                </div>
              ))}
              {/* Mon tour de jouer (défis déjà acceptés) */}
              {myTurnToPlay.map(([id,ch])=>{
                const opp = ch.from===user?ch.to:ch.from;
                return (
                  <div key={id} style={{...t.card,marginBottom:8,border:`1px solid ${GOLD}`,background:"rgba(245,200,66,.08)"}}>
                    <div style={{fontSize:12,color:GOLD,marginBottom:6}}>🎯 C'est ton tour contre <strong>{opp?.toUpperCase?.()||opp||"?"}</strong> ({({quiz:"Quiz",quisuisje:"Qui suis-je ?",plusmoins:"Plus ou Moins",toptrumps:"Qui a le plus ?",mystere:"Footballeur Mystère"})[ch.game]||ch.game})</div>
                    <button onClick={()=>playMyTurn(id)} style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>▶️ Jouer mon tour</button>
                  </div>
                );
              })}
              {/* Défis penalty en attente d'acceptation (même groupe uniquement) */}
              {Object.entries(challenges).filter(([,c])=>{
                if (c.game!=="penalty"||c.to!==user||c.status!=="pending") return false;
                const fromRole=(st.users[c.from]||{}).role;
                return isAdmin||fromRole===role;
              }).map(([id,ch])=>(
                <div key={id} style={{...t.card,marginBottom:8,border:`1px solid ${AMB}`,background:"rgba(245,158,11,.08)"}}>
                  <div style={{fontSize:12,color:AMB,marginBottom:6}}>⚔️ <strong>{ch.from?.toUpperCase?.()}</strong> te défie aux Tirs au but !</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{
                        if(blockIfDailyLimitReached("penalty",user))return;
                        const firstTireur=Math.random()<.5?ch.from:ch.to;
                        const updated = {...ch,status:"active",tireur:firstTireur};
                        recentChallengeWritesRef.current[id] = { data: updated, ts: Date.now() };
                        setSt(prev => {
                          const ns = {...prev, challenges:{...(prev.challenges||{}),[id]:updated}};
                          try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                          return ns;
                        });
                        if (_fbReady) _fbUpdate(`/challenges/${id}`, updated);
                        setActiveGame("penalty");setGamePhase("playing");resetGame();playGameMusic("penalty");soundWhistle();setPenChallengeId(id);
                      }} style={{flex:2,padding:"8px",borderRadius:8,border:"none",background:AMB,color:"#000",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✅ Accepter →</button>
                    <button onClick={()=>{
                        setSt(prev => {
                          const ns2 = {...(prev.challenges||{})}; delete ns2[id];
                          const ns = {...prev, challenges: ns2};
                          try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                          return ns;
                        });
                        // Suppression scopée : ne touche qu'à ce défi précis, jamais aux autres
                        if (_fbReady) _fbUpdate(`/challenges/${id}`, null);
                        showNotif("info",`Défi de ${ch.from?.toUpperCase?.()||ch.from} refusé`);
                      }}
                      style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid rgba(239,68,68,.4)",background:"rgba(239,68,68,.1)",color:RED,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✗ Refuser</button>
                  </div>
                </div>
              ))}
              {/* Mes défis penalty envoyés, en attente d'acceptation */}
              {Object.entries(challenges).filter(([,c])=>{
                if (c.game!=="penalty"||c.from!==user||c.status!=="pending") return false;
                const toRole=(st.users[c.to]||{}).role;
                return isAdmin||toRole===role;
              }).map(([id,ch])=>(
                <div key={id} style={{...t.card,marginBottom:8,border:`1px solid ${BRD}`,opacity:.8}}>
                  <div style={{fontSize:11,color:MUTED}}>⏳ Défi envoyé à <strong>{ch.to?.toUpperCase?.()}</strong> — en attente d'acceptation</div>
                </div>
              ))}
              {/* Défis penalty actifs (multi-rounds) — à mon tour de jouer, même groupe */}
              {Object.entries(challenges).filter(([,ch])=>{
                if (ch.game!=="penalty"||ch.tireur==null||ch.status!=="active") return false;
                if (!(ch.from===user||ch.to===user)||(ch.pick||{})[user]) return false;
                const opp=ch.from===user?ch.to:ch.from;
                const oppRole=(st.users[opp]||{}).role;
                return isAdmin||oppRole===role;
              }).map(([id,ch])=>{
                const opp=ch.from===user?ch.to:ch.from;
                const iAmTireur=ch.tireur===user;
                const kickNum=(ch.kicks||[]).length+1;
                const myGoals=ch.from===user?(ch.fromGoals||0):(ch.toGoals||0);
                const oppGoals=ch.from===user?(ch.toGoals||0):(ch.fromGoals||0);
                return (
                  <div key={id} style={{...t.card,marginBottom:8,border:`2px solid ${iAmTireur?GOLD:"#60a5fa"}`,background:iAmTireur?"rgba(245,200,66,.08)":"rgba(59,130,246,.08)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:22}}>{iAmTireur?"⚽":"🧤"}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:iAmTireur?GOLD:"#60a5fa"}}>{iAmTireur?"Tu TIRES":"Tu GARDES"} — Tir {kickNum}/6</div>
                        <div style={{fontSize:10,color:MUTED}}>vs {opp?.toUpperCase?.()}  ·  <span style={{color:GOLD,fontWeight:700}}>{myGoals}</span>–{oppGoals}</div>
                      </div>
                    </div>
                    <button onClick={()=>{ setActiveGame("penalty");setGamePhase("playing");resetGame();playGameMusic("penalty");setPenChallengeId(id); }}
                      style={{width:"100%",padding:"9px",borderRadius:9,border:"none",background:iAmTireur?GOLD:"#3b82f6",color:iAmTireur?"#0a0e1a":"#fff",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      ▶️ {iAmTireur?"Choisir ma zone de tir":"Choisir ma zone de plongeon"}
                    </button>
                  </div>
                );
              })}
              {myDeclinedChallenges.length>0 && (
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,color:RED,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>😔 Défis refusés</div>
                  {myDeclinedChallenges.map(([id,ch])=>(
                    <div key={id} style={{...t.card,marginBottom:6,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.25)"}}>
                      <span style={{fontSize:11,color:TXT}}>{({quiz:"Quiz",quisuisje:"Qui suis-je ?",plusmoins:"Plus ou Moins",toptrumps:"Qui a le plus ?",mystere:"Footballeur Mystère"})[ch.game]||ch.game} vs {ch.to.toUpperCase()} — refusé</span>
                      <button onClick={()=>{setSt(prev=>{const ns={...(prev.challenges||{})};delete ns[id];const ns2={...prev,challenges:ns};if(_fbReady)_fbUpdate("/",{[`challenges/${id}`]:null});try{localStorage.setItem(KEY,JSON.stringify(ns2));}catch(e){}return ns2;});}} style={{background:"none",border:"none",color:MUTED,fontSize:14,cursor:"pointer",padding:"0 4px"}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {/* ── SOUS-ONGLET HISTORIQUE ── */}
              {jeuxSubTab==="historique" && (()=>{
                const myHistory = [...(st.gameHistory?.[user] || [])].reverse();
                const oldDoneChallenges = Object.values(challenges)
                  .filter(c => c.status==="done" && (c.from===user||c.to===user))
                  .filter(c => !myHistory.some(h => h.mode==="defi" && h.ts===c.ts))
                  .map(c => {
                    const isFrom = c.from===user;
                    const my = isFrom?c.fromScore:c.toScore;
                    const opp = isFrom?c.toScore:c.fromScore;
                    return { game:c.game, score:my, mode:"defi", opponent:isFrom?c.to:c.from,
                      won: my>opp?"win":my<opp?"loss":"draw", ts:c.ts };
                  });
                const allHistory = [...myHistory, ...oldDoneChallenges].sort((a,b)=>b.ts-a.ts).slice(0,50);
                const GAME_ICONS = {quiz:"🧠",quisuisje:"👤",plusmoins:"🔢",toptrumps:"🃏",penalty:"⚽",mystere:"🧩",buteur:"🥅"};
                const GAME_SHORT = {quiz:"Quiz",quisuisje:"Qui suis-je",plusmoins:"Plus/Moins",toptrumps:"Top Trumps",penalty:"Tirs au but",mystere:"Footballeur Mystère",buteur:"Buteur"};
                if (!allHistory.length) return <div style={t.empty}>Aucune partie jouée pour l'instant. Lance ton premier jeu ! 🎮</div>;
                return (
                  <div>
                    <div style={{fontSize:11,color:MUTED,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>
                      {allHistory.length} partie{allHistory.length>1?"s":" jouée"}
                    </div>
                    {allHistory.map((h,i) => {
                      const date = new Date(h.ts);
                      const dateStr = date.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
                      const timeStr = date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
                      const isDefi = h.mode==="defi";
                      const wonColor = h.won==="win"?GREEN:h.won==="loss"?RED:h.won==="draw"?AMB:MUTED;
                      const wonIcon = h.won==="win"?"🏆":h.won==="loss"?"😔":h.won==="draw"?"🤝":"⏳";
                      const wonLabel = h.won==="win"?"Victoire":h.won==="loss"?"Défaite":h.won==="draw"?"Égalité":"En attente";
                      return (
                        <div key={i} style={{...t.card,marginBottom:6,padding:"10px 12px",
                          borderLeft:`3px solid ${wonColor}`,background:"rgba(255,255,255,.03)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                <span style={{fontSize:15}}>{GAME_ICONS[h.game]||"🎮"}</span>
                                <span style={{fontSize:12,fontWeight:700,color:TXT}}>{GAME_SHORT[h.game]||h.game}</span>
                                {isDefi && <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:"rgba(245,158,11,.15)",color:AMB}}>⚔️ DÉFI</span>}
                              </div>
                              {isDefi && h.opponent && (
                                <div style={{fontSize:10,color:MUTED}}>vs <strong style={{color:TXT}}>{h.opponent.toUpperCase()}</strong></div>
                              )}
                              <div style={{fontSize:9,color:MUTED,marginTop:2}}>{dateStr} à {timeStr}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              {typeof h.score === "number" && (
                                <div style={{fontSize:18,fontWeight:900,color:GOLD,lineHeight:1}}>{h.score} pts</div>
                              )}
                              {h.won !== null && (
                                <div style={{fontSize:10,fontWeight:700,color:wonColor,marginTop:2}}>
                                  {wonIcon} {wonLabel}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div style={{fontSize:12,color:MUTED,marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Choisir un jeu</div>
              {[
                {id:"quiz",      icon:"🧠",name:"Quiz Coupe du Monde", desc:"Questions vérifiées sur l'histoire du Mondial"},
                {id:"quisuisje", icon:"👤",name:"Qui suis-je ?",  desc:"Indices progressifs sur des légendes du foot"},
                {id:"plusmoins", icon:"🔢",name:"Plus ou Moins",  desc:"Stats foot — scoring strict par paliers"},
                {id:"toptrumps", icon:"🃏",name:"Qui a le plus ?", desc:"Duel de fiches — stats cachées jusqu'à la réponse"},
                {id:"mystere",   icon:"🧩",name:"Footballeur Mystère", desc:"Une grille de 25 cases cache sa photo — devine-le avant la 10e case"},
                {id:"buteur",    icon:"🥅",name:"Meilleur Buteur",desc:"Tournoi : choisis ton buteur favori jusqu'au bout !"},
                {id:"penalty",   icon:"⚽",name:"Tirs au but",     desc:"Défie un joueur : tireur vs gardien en secret"},
              ].map(g=>(
                <div key={g.id} style={{...t.card,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:28}}>{g.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:TXT}}>{g.name}</div>
                    <div style={{fontSize:10,color:MUTED,marginTop:2}}>{g.desc}</div>
                    {typeof (gameScores[g.id]||{})[user] === "number" && (
                      <div style={{marginTop:4}}>
                        <div style={{fontSize:10,color:GOLD,fontWeight:700}}>🏅 Meilleur (1 partie) : {(gameScores[g.id]||{})[user]} pts</div>
                        {typeof (gameScoresTotal[g.id]||{})[user] === "number" && (
                          <div style={{fontSize:12,color:"#60a5fa",fontWeight:800,marginTop:2}}>📈 Cumulé : {(gameScoresTotal[g.id]||{})[user]} pts</div>
                        )}
                      </div>
                    )}
                    {typeof (gameScores[g.id]||{})[user] === "string" && <div style={{fontSize:10,color:GOLD,marginTop:2}}>🏅 Choix : {(gameScores[g.id]||{})[user]}</div>}
                    {g.id!=="buteur" && (()=>{
                      const playedToday = getDailyCount(g.id, user);
                      const atLimit = playedToday >= DAILY_PLAY_LIMIT;
                      return (
                        <div style={{fontSize:9,color:atLimit?RED:MUTED,marginTop:3}}>
                          {atLimit ? "⏳ Limite quotidienne atteinte" : `🎯 ${playedToday}/${DAILY_PLAY_LIMIT} partie${playedToday>1?"s":""} jouée${playedToday>1?"s":""} aujourd'hui`}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <button onClick={()=>{
                      setActiveGame(g.id);
                      setGameMode(null);
                      setGamePhase("mode");
                    }} style={{padding:"10px 18px",borderRadius:10,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:800,fontSize:13,cursor:"pointer"}}>Jouer</button>
                  </div>
                </div>
              ))}
              </>
              }
            </div>
          );

          // ══ RÉSULTAT ═══════════════════════════════════════════
          if (gamePhase === "result") {
            const gLabel={quiz:"Quiz Coupe du Monde",quisuisje:"Qui suis-je",plusmoins:"Plus ou Moins",toptrumps:"Qui a le plus ?",buteur:"Meilleur Buteur",penalty:"Tirs au but",mystere:"Footballeur Mystère"}[activeGame]||activeGame;
            const ch = activeChallengeId ? challenges[activeChallengeId] : null;
            const isFromSide = ch && ch.from===user;
            const myChScore = ch ? (isFromSide?ch.fromScore:ch.toScore) : null;
            const oppChScore = ch ? (isFromSide?ch.toScore:ch.fromScore) : null;
            const oppName = ch ? (isFromSide?ch.to:ch.from) : null;
            const bothDone = ch && ch.fromScore!==null && ch.toScore!==null;
            return (
              <div style={t.sec}>
                <div style={{...t.card,textAlign:"center",padding:"24px 16px",marginTop:12}}>
                  <div style={{fontSize:48,marginBottom:8}}>{qScore>=10?"🏆":qScore>=5?"⭐":"💪"}</div>
                  <div style={{fontSize:24,fontWeight:900,color:GOLD,marginBottom:4}}>{qScore} pts</div>
                  <div style={{fontSize:12,color:MUTED,marginBottom:16}}>{gLabel}</div>
                  {ch && (
                    <div style={{marginBottom:16,padding:"12px",borderRadius:10,
                      background: ch.status==="declined" ? "rgba(239,68,68,.1)" : bothDone ? (myChScore>oppChScore?"rgba(34,197,94,.15)":myChScore<oppChScore?"rgba(239,68,68,.15)":"rgba(255,255,255,.05)") : "rgba(245,200,66,.08)",
                      border:`1px solid ${BRD}`}}>
                      <div style={{fontSize:11,color:GOLD,fontWeight:700,marginBottom:8}}>⚔️ Défi vs {oppName.toUpperCase()}</div>
                      {ch.status==="declined" ? (
                        <div style={{fontSize:12,color:RED,fontWeight:700}}>😔 {oppName.toUpperCase()} a refusé ce défi</div>
                      ) : bothDone ? (<>
                        <div style={{display:"flex",justifyContent:"space-around",marginBottom:8,alignItems:"center"}}>
                          <div><div style={{fontSize:20,fontWeight:900,color:GOLD}}>{myChScore}</div><div style={{fontSize:10,color:MUTED}}>Toi</div></div>
                          <div style={{fontSize:13,color:MUTED}}>vs</div>
                          <div><div style={{fontSize:20,fontWeight:900,color:TXT}}>{oppChScore}</div><div style={{fontSize:10,color:MUTED}}>{oppName.toUpperCase()}</div></div>
                        </div>
                        <div style={{fontSize:13,fontWeight:800,color:myChScore>oppChScore?GREEN:myChScore<oppChScore?RED:MUTED}}>
                          {myChScore>oppChScore?"🏆 Tu gagnes le défi !":myChScore<oppChScore?"😔 Tu perds le défi":"🤝 Égalité parfaite !"}
                        </div>
                        {activeGame==="mystere" && (ch.fromGuess || ch.toGuess) && (
                          <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${BRD}`,textAlign:"left"}}>
                            <div style={{fontSize:10,color:MUTED}}>💬 Toi : <strong style={{color:TXT}}>{(isFromSide ? ch.fromGuess : ch.toGuess) || "—"}</strong></div>
                            <div style={{fontSize:10,color:MUTED,marginTop:2}}>💬 {oppName.toUpperCase()} : <strong style={{color:TXT}}>{(isFromSide ? ch.toGuess : ch.fromGuess) || "—"}</strong></div>
                          </div>
                        )}
                      </>) : (
                        <div style={{fontSize:11,color:MUTED}}>⏳ En attente du score de {oppName.toUpperCase()}...</div>
                      )}
                    </div>
                  )}
                  {activeGame!=="buteur" && (() => {
                    const rows = sameGroupUsers.map(u=>({
                      u,
                      best: typeof (gameScores[activeGame]||{})[u]==="number" ? (gameScores[activeGame]||{})[u] : null,
                      total: typeof (gameScoresTotal[activeGame]||{})[u]==="number" ? (gameScoresTotal[activeGame]||{})[u] : 0,
                    })).filter(r=>r.best!==null).sort((a,b)=>b.best-a.best);
                    if (!rows.length) return null;
                    return (
                      <div style={{marginBottom:16,textAlign:"left"}}>
                        <div style={{fontSize:11,color:MUTED,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,textAlign:"center"}}>🏅 Classement — {gLabel}</div>
                        {rows.map((r,i)=>(
                          <div key={r.u} style={{...t.card,marginBottom:6,display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:r.u===user?"rgba(245,200,66,.1)":"rgba(255,255,255,.04)"}}>
                            <div style={{fontSize:13,fontWeight:900,color:i===0?GOLD:i===1?"#94a3b8":i===2?"#cd7f32":MUTED,width:18}}>{i+1}</div>
                            <div style={{flex:1,fontSize:11,fontWeight:r.u===user?700:400,color:r.u===user?GOLD:TXT}}>{r.u.toUpperCase()}</div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:12,fontWeight:700,color:GOLD}}>{r.best} pts</div>
                              <div style={{fontSize:9,color:"#60a5fa"}}>cumulé : {r.total}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setGamePhase("menu");setActiveGame(null);setActiveChallengeId(null);stopGameMusic();}} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"rgba(255,255,255,.08)",color:TXT,fontWeight:700,fontSize:12,cursor:"pointer"}}>← Menu</button>
                    <button onClick={()=>{setActiveChallengeId(null);startGame(activeGame);}} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:700,fontSize:12,cursor:"pointer"}}>🔄 Rejouer</button>
                  </div>
                </div>
              </div>
            );
          }

          // ══ QUIZ ═══════════════════════════════════════════════
          if (activeGame==="quiz") {
            if(!quizSet.length) return null;
            const q=quizSet[qIdx]; const isLast=qIdx>=quizSet.length-1;
            const goNext=(ns)=>{
              if(isLast){saveGameScore("quiz",ns);setQScore(ns);setGamePhase("result");stopGameMusic();}
              else{setQScore(ns);setQIdx(i=>i+1);setAnswered(null);setShowFact(false);}
            };
            const handleAnswer=(idx)=>{
              if(answered!==null)return; setAnswered(idx); setShowFact(true);
              const pts=idx===q.answer?1:0; const ns=qScore+pts;
              if(pts)soundCorrectGame();else soundWrongGame();
              // Auto-avance généreuse (4.5s) — le joueur peut aussi cliquer "Suivant" pour continuer immédiatement
              clearTimeout(quizTimerRef.current);
              quizTimerRef.current=setTimeout(()=>goNext(ns),4500);
            };
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>{clearTimeout(quizTimerRef.current);setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                  <div style={{fontSize:11,color:MUTED}}>Q {qIdx+1}/{quizSet.length}</div>
                  <div style={{fontSize:12,fontWeight:700,color:GOLD}}>🧠 {qScore} pts</div>
                </div>
                <div style={{background:"rgba(255,255,255,.04)",borderRadius:4,height:4,marginBottom:10}}>
                  <div style={{height:4,borderRadius:4,background:GOLD,width:`${((qIdx+1)/quizSet.length)*100}%`,transition:"width .3s"}}/>
                </div>
                <div style={{...t.card,marginBottom:10}}><div style={{fontSize:14,fontWeight:700,color:TXT,lineHeight:1.5}}>{q.q}</div></div>
                {showFact&&(
                  <div style={{...t.card,marginBottom:10,background:"rgba(245,200,66,.1)",border:`1.5px solid ${GOLD}`}}>
                    <div style={{fontSize:11,fontWeight:800,color:GOLD,marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>
                      {answered===q.answer?"✅ Bonne réponse !":"💡 Le savais-tu ?"}
                    </div>
                    <div style={{fontSize:13,color:TXT,lineHeight:1.6}}>{q.fact}</div>
                    <button onClick={()=>{clearTimeout(quizTimerRef.current);goNext(qScore+(answered===q.answer?1:0));}} style={{marginTop:10,width:"100%",padding:"8px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      {isLast?"Voir mon score →":"Suivant →"}
                    </button>
                  </div>
                )}
                {q.choices.map((c,i)=>{
                  let bg="rgba(255,255,255,.06)",col=TXT,brd="rgba(255,255,255,.1)";
                  if(answered!==null){if(i===q.answer){bg="rgba(34,197,94,.2)";col=GREEN;brd="rgba(34,197,94,.5)";}else if(i===answered){bg="rgba(239,68,68,.2)";col=RED;brd="rgba(239,68,68,.5)";}}
                  return <button key={i} onClick={()=>handleAnswer(i)} style={{display:"block",width:"100%",marginBottom:8,padding:"12px 14px",borderRadius:10,border:`1px solid ${brd}`,background:bg,color:col,fontWeight:i===q.answer&&answered!==null?700:400,fontSize:13,textAlign:"left",cursor:answered!==null?"default":"pointer",fontFamily:"inherit"}}>{c}{answered!==null&&i===q.answer?" ✅":""}{answered!==null&&i===answered&&i!==q.answer?" ❌":""}</button>;
                })}
              </div>
            );
          }

          // ══ QUI SUIS-JE ════════════════════════════════════════
          if (activeGame==="quisuisje") {
            if(!qsjQ.length)return null;
            const q=qsjQ[qIdx]; const isLast=qIdx>=qsjQ.length-1; const ptsAvail=Math.max(5-indiceIdx,1);
            const normalize=s=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g," ").trim();
            const lev=(a,b)=>{const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[m][n];};
            const isCorrect=(inp)=>{const i=normalize(inp);if(i.length<2)return false;const answers=[normalize(q.answer),...(q.aliases||[]).map(normalize),...normalize(q.answer).split(" ")].filter(a=>a.length>=3);return answers.some(a=>i===a||i.includes(a)||a.includes(i)||lev(i,a)<=2);};
            const handleGuess=()=>{
              if(!guessInput.trim())return; const correct=isCorrect(guessInput);
              setGuessResult(correct); const ns=qScore+(correct?ptsAvail:0);
              if(correct)soundCorrectGame();else soundWrongGame();
              if(isLast){saveGameScore("quisuisje",ns);setTimeout(()=>{setQScore(ns);setGamePhase("result");stopGameMusic();},2000);}
              else{setQScore(ns);setTimeout(()=>{setQIdx(i=>i+1);setIndiceIdx(0);setGuessInput("");setGuessResult(null);},2000);}
            };
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                  <div style={{fontSize:11,color:MUTED}}>Joueur {qIdx+1}/{qsjQ.length}</div>
                  <div style={{fontSize:12,fontWeight:700,color:GOLD}}>👤 {qScore} pts</div>
                </div>
                <div style={{...t.card,marginBottom:8,textAlign:"center"}}>
                  <div style={{fontSize:13,color:MUTED,marginBottom:2}}>Qui suis-je ? {q.emoji}</div>
                  <div style={{fontSize:11,color:AMB,fontWeight:700}}>💡 Répondre maintenant = {ptsAvail} pt{ptsAvail>1?"s":""}</div>
                  <div style={{fontSize:9,color:MUTED,marginTop:2}}>{q.indices.length-indiceIdx-1} indice{q.indices.length-indiceIdx-1>1?"s":""} restant{q.indices.length-indiceIdx-1>1?"s":""}</div>
                </div>
                {q.indices.slice(0,indiceIdx+1).map((ind,i)=>(
                  <div key={i} style={{...t.card,marginBottom:6,padding:"10px 12px",background:i===indiceIdx?"rgba(245,200,66,.08)":"rgba(255,255,255,.03)"}}>
                    <span style={{fontSize:11,color:i===indiceIdx?AMB:MUTED,fontStyle:i<indiceIdx?"italic":"normal"}}>{i+1}. {ind}</span>
                  </div>
                ))}
                {guessResult===null?(
                  <div>
                    <input value={guessInput} onChange={e=>setGuessInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&guessInput.trim()&&handleGuess()}
                      placeholder="Nom ou prénom..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${BRD}`,background:SURF2,color:TXT,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
                    <div style={{display:"flex",gap:6}}>
                      {indiceIdx<q.indices.length-1&&<button onClick={()=>setIndiceIdx(i=>i+1)} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>💡 Indice (-1pt)</button>}
                      <button onClick={()=>guessInput.trim()&&handleGuess()} disabled={!guessInput.trim()} style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:guessInput.trim()?GOLD:"rgba(255,255,255,.06)",color:guessInput.trim()?"#0a0e1a":MUTED,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Valider →</button>
                    </div>
                  </div>
                ):(
                  <div style={{...t.card,textAlign:"center",background:guessResult?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)",border:`1px solid ${guessResult?GREEN:RED}`}}>
                    <div style={{fontSize:20,marginBottom:4}}>{guessResult?"✅":"❌"}</div>
                    <div style={{fontSize:13,fontWeight:700,color:guessResult?GREEN:RED}}>{guessResult?`+${ptsAvail} pts !`:"0 pt"} — {q.answer} {q.emoji}</div>
                  </div>
                )}
              </div>
            );
          }

          // ══ FOOTBALLEUR MYSTÈRE ════════════════════════════════
          if (activeGame==="mystere") {
            if (!mysteryPlayer) return null;
            const revealedCount = Math.min(mysteryTurn, MYSTERY_MAX_TURNS);
            const ptsAvail = Math.max(11 - revealedCount, 0);
            const concluding = guessResult===true || (guessResult===false && revealedCount>=MYSTERY_MAX_TURNS);
            const revealedCells = concluding
              ? new Set(Array.from({length:25},(_,i)=>i))
              : new Set(mysteryRevealOrder.slice(0, revealedCount));
            const normalize=s=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g," ").trim();
            const lev=(a,b)=>{const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[m][n];};
            const isCorrect=(inp)=>{const i=normalize(inp);if(i.length<2)return false;const answers=[normalize(mysteryPlayer.name),...(mysteryPlayer.aliases||[]).map(normalize),...normalize(mysteryPlayer.name).split(" ")].filter(a=>a.length>=3);return answers.some(a=>i===a||i.includes(a)||a.includes(i)||lev(i,a)<=2);};
            const handleGuess=()=>{
              if(!guessInput.trim())return;
              const guessText=guessInput.trim();
              const correct=isCorrect(guessText);
              setGuessResult(correct);
              if(correct){
                soundCorrectGame();
                const pts=ptsAvail;
                setMysteryLastGuess(guessText);
                setTimeout(()=>{saveGameScore("mystere",pts);setQScore(pts);setGamePhase("result");stopGameMusic();},1800);
              } else {
                soundWrongGame();
                if(revealedCount>=MYSTERY_MAX_TURNS){
                  setMysteryLastGuess(guessText);
                  setTimeout(()=>{saveGameScore("mystere",0);setQScore(0);setGamePhase("result");stopGameMusic();},1800);
                } else {
                  setTimeout(()=>{setMysteryTurn(t=>t+1);setGuessInput("");setGuessResult(null);},1400);
                }
              }
            };
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                  <div style={{fontSize:11,color:MUTED}}>Case {revealedCount}/{MYSTERY_MAX_TURNS}</div>
                  <div style={{fontSize:12,fontWeight:700,color:GOLD}}>🧩 Mystère</div>
                </div>
                <div style={{...t.card,marginBottom:10,textAlign:"center"}}>
                  <div style={{fontSize:11,color:AMB,fontWeight:700}}>💡 Trouver maintenant = {ptsAvail} pt{ptsAvail>1?"s":""}</div>
                </div>
                <div style={{position:"relative",width:"100%",maxWidth:260,margin:"0 auto 14px",aspectRatio:"1/1",borderRadius:14,overflow:"hidden",border:`1px solid ${BRD}`}}>
                  {mysteryPhotoUrl ? (
                    <img src={mysteryPhotoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                  ) : mysteryPhotoUrl===false ? (
                    <div style={{width:"100%",height:"100%",background:SURF2,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:8,textAlign:"center"}}>
                      <span style={{fontSize:32}}>⚽</span>
                      {mysteryPhotoError && <span style={{fontSize:9,color:MUTED,fontFamily:"monospace"}}>({mysteryPhotoError})</span>}
                    </div>
                  ) : (
                    <div style={{width:"100%",height:"100%",background:SURF2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:MUTED}}>⏳</div>
                  )}
                  <div style={{position:"absolute",inset:0,display:"grid",gridTemplateColumns:"repeat(5,1fr)",gridTemplateRows:"repeat(5,1fr)"}}>
                    {Array.from({length:25}).map((_,i)=>(
                      <div key={i} style={{background:revealedCells.has(i)?"transparent":"#000",border:"1px solid rgba(255,255,255,.05)",transition:"background .5s"}}/>
                    ))}
                  </div>
                </div>
                {mysteryPlayer.hints && (
                  <div style={{marginBottom:10}}>
                    {mysteryPlayer.hints.slice(0, revealedCount).map((h,i)=>(
                      <div key={i} style={{...t.card,marginBottom:6,padding:"8px 12px",background:i===revealedCount-1?"rgba(245,200,66,.08)":"rgba(255,255,255,.03)"}}>
                        <span style={{fontSize:11,color:i===revealedCount-1?AMB:MUTED,fontStyle:i<revealedCount-1?"italic":"normal"}}>💬 {h}</span>
                      </div>
                    ))}
                  </div>
                )}
                {guessResult===null?(
                  <div>
                    <input value={guessInput} onChange={e=>setGuessInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&guessInput.trim()&&handleGuess()}
                      placeholder="Nom du joueur..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${BRD}`,background:SURF2,color:TXT,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
                    <button onClick={()=>guessInput.trim()&&handleGuess()} disabled={!guessInput.trim()} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:guessInput.trim()?GOLD:"rgba(255,255,255,.06)",color:guessInput.trim()?"#0a0e1a":MUTED,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginBottom:gameMode==="solo"&&revealedCount<MYSTERY_MAX_TURNS?8:0}}>Valider →</button>
                    {gameMode==="solo" && revealedCount<MYSTERY_MAX_TURNS && (
                      <button onClick={()=>{soundClick();setMysteryTurn(tn=>Math.min(tn+1,MYSTERY_MAX_TURNS));}} style={{width:"100%",padding:"9px",borderRadius:8,border:`1px solid ${BRD}`,background:"transparent",color:MUTED,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>💡 Demander un indice (−1 case, −1 pt)</button>
                    )}
                  </div>
                ):(
                  <div style={{...t.card,textAlign:"center",background:guessResult?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)",border:`1px solid ${guessResult?GREEN:RED}`}}>
                    <div style={{fontSize:20,marginBottom:4}}>{guessResult?"✅":"❌"}</div>
                    <div style={{fontSize:13,fontWeight:700,color:guessResult?GREEN:RED}}>
                      {guessResult ? `+${ptsAvail} pts !` : (revealedCount>=MYSTERY_MAX_TURNS ? `0 pt — c'était ${mysteryPlayer.name}` : "Pas trouvé, encore une case...")}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // ══ PLUS OU MOINS ══════════════════════════════════════
          if (activeGame==="plusmoins") {
            if(!pmQ.length)return null;
            const q=pmQ[pmIdx]; const isLast=pmIdx>=pmQ.length-1;
            const handlePM=()=>{
              const val=parseInt(pmInput);if(isNaN(val))return;
              const diff=Math.abs(val-q.answer),pct=diff/q.answer;
              const pts=pct===0?10:pct<=0.03?7:pct<=0.08?4:pct<=0.15?1:0;
              const ns=pmTotal+pts; setPmAnswered(true);
              if(pts>0)soundCorrectGame();else soundWrongGame();
              if(isLast){saveGameScore("plusmoins",ns);setTimeout(()=>{setQScore(ns);setGamePhase("result");stopGameMusic();},2500);}
              else{setTimeout(()=>{setPmIdx(i=>i+1);setPmInput("");setPmAnswered(false);setPmTotal(ns);},2500);}
            };
            const diff2=pmAnswered?Math.abs(parseInt(pmInput||0)-q.answer):null;
            const pct2=pmAnswered?(q.answer===0 ? (parseInt(pmInput||0)===0?0:1) : diff2/q.answer):null;
            const pts2=pmAnswered?(pct2===0?10:pct2<=0.03?7:pct2<=0.08?4:pct2<=0.15?1:0):null;
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                  <div style={{fontSize:11,color:MUTED}}>Stat {pmIdx+1}/{pmQ.length}</div>
                  <div style={{fontSize:12,fontWeight:700,color:GOLD}}>🔢 {pmTotal} pts</div>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:8}}>
                  {[["Exact","10",GREEN],["±3%","7",GOLD],["±8%","4",AMB],["±15%","1",MUTED],[">15%","0",RED]].map(([lbl,pts,col])=>(
                    <div key={lbl} style={{flex:1,textAlign:"center",padding:"3px 2px",borderRadius:6,background:"rgba(255,255,255,.04)"}}>
                      <div style={{fontSize:9,color:MUTED}}>{lbl}</div>
                      <div style={{fontSize:11,fontWeight:700,color:col}}>{pts}pts</div>
                    </div>
                  ))}
                </div>
                <div style={{...t.card,marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:TXT,lineHeight:1.5,marginBottom:4}}>{q.q}</div>
                  <div style={{fontSize:10,color:MUTED,fontStyle:"italic"}}>💡 {q.hint}</div>
                </div>
                {!pmAnswered?(
                  <div>
                    <input type="number" value={pmInput} onChange={e=>setPmInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&pmInput&&handlePM()}
                      placeholder="Ton estimation..." style={{width:"100%",padding:"12px",borderRadius:8,border:`1px solid ${BRD}`,background:SURF2,color:TXT,fontSize:16,fontFamily:"inherit",boxSizing:"border-box",marginBottom:8,textAlign:"center"}}/>
                    <button onClick={handlePM} disabled={!pmInput} style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:pmInput?GOLD:"rgba(255,255,255,.06)",color:pmInput?"#0a0e1a":MUTED,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Valider →</button>
                  </div>
                ):(
                  <div style={{...t.card,textAlign:"center",background:pts2>=7?"rgba(34,197,94,.15)":pts2>=4?"rgba(245,200,66,.15)":pts2>=1?"rgba(245,200,66,.08)":"rgba(239,68,68,.1)"}}>
                    <div style={{fontSize:22,fontWeight:900,color:pts2>=7?GREEN:pts2>=4?GOLD:pts2>=1?AMB:RED,marginBottom:4}}>+{pts2} pts</div>
                    <div style={{fontSize:12,color:MUTED}}>Réponse : <span style={{fontWeight:700,color:TXT}}>{q.answer} {q.unit}</span></div>
                    <div style={{fontSize:11,color:MUTED,marginTop:2}}>Toi : {pmInput} — écart {diff2} ({Math.round(pct2*100)}%)</div>
                  </div>
                )}
              </div>
            );
          }

          // ══ TOP TRUMPS ═════════════════════════════════════════
          if (activeGame==="toptrumps") {
            if(!ttCard1||!ttCard2)return null;
            const maxRounds=8;
            const pickCat=(cat)=>{
              if(ttReveal)return;
              const win=cat.higher?ttCard1[cat.key]>ttCard2[cat.key]:ttCard1[cat.key]<ttCard2[cat.key];
              setTtReveal({win,cat}); if(win)soundCorrectGame();else soundWrongGame();
            };
            const nextRound=()=>{
              const nw=ttWins+(ttReveal?.win?1:0),nr=ttRound+1;
              if(nr>=maxRounds){
                saveGameScore("toptrumps",nw);setQScore(nw);setTtWins(nw);setGamePhase("result");stopGameMusic();
                setTtChallengeQueue(null);
                return;
              }
              setTtWins(nw);setTtRound(nr);setTtReveal(null);
              if (ttChallengeQueue && ttChallengeQueue.length>0) {
                // Mode défi : on pioche dans la file figée, identique pour les 2 joueurs
                const [pair,...rest]=ttChallengeQueue;
                setTtChallengeQueue(rest);
                setTtCard1(pair[0]); setTtCard2(pair[1]);
              } else {
                const rem=[...TOP_TRUMPS_CARDS].filter(c=>c.name!==ttCard1.name&&c.name!==ttCard2.name).sort(()=>Math.random()-.5);
                if(rem.length>=2){setTtCard1(rem[0]);setTtCard2(rem[1]);}else{const all=[...TOP_TRUMPS_CARDS].sort(()=>Math.random()-.5);setTtCard1(all[0]);setTtCard2(all[1]);}
              }
            };
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                  <div style={{fontSize:11,color:MUTED}}>Manche {ttRound+1}/{maxRounds}</div>
                  <div style={{fontSize:12,fontWeight:700,color:GOLD}}>🃏 {ttWins}/{ttRound}</div>
                </div>
                <div style={{fontSize:11,color:AMB,fontWeight:700,marginBottom:8,textAlign:"center"}}>
                  {ttReveal?(ttReveal.win?"✅ Bonne réponse !":"❌ Mauvaise réponse"):<span>Choisis la stat où <span style={{color:GOLD}}>{ttCard1.name.split(" ")[0]}</span> bat <span style={{color:RED}}>{ttCard2.name.split(" ")[0]}</span></span>}
                </div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  {[ttCard1,ttCard2].map((card,ci)=>(
                    <div key={ci} style={{...t.card,flex:1,textAlign:"center",background:ci===0?"rgba(245,200,66,.08)":"rgba(239,68,68,.08)",border:`1px solid ${ci===0?"rgba(245,200,66,.3)":"rgba(239,68,68,.3)"}`}}>
                      <div style={{width:50,height:50,borderRadius:"50%",overflow:"hidden",margin:"0 auto 4px",background:"rgba(255,255,255,.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
                        {cardPhotos[card.name] ? <img src={cardPhotos[card.name]} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : card.emoji}
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:ci===0?GOLD:RED}}>{card.name}</div>
                      {ttReveal&&TOP_TRUMPS_CATEGORIES.map(cat=>(
                        <div key={cat.key} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:MUTED,marginTop:3,padding:"0 4px"}}>
                          <span>{cat.label}</span>
                          <span style={{fontWeight:700,color:ttReveal.cat.key===cat.key?(ci===0?(ttReveal.win?GREEN:RED):(ttReveal.win?RED:GREEN)):TXT}}>{card[cat.key]}</span>
                        </div>
                      ))}
                      {!ttReveal&&<div style={{fontSize:9,color:MUTED,marginTop:4,fontStyle:"italic"}}>{card.note}</div>}
                    </div>
                  ))}
                </div>
                {!ttReveal?(
                  TOP_TRUMPS_CATEGORIES.map(cat=>(
                    <button key={cat.key} onClick={()=>pickCat(cat)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:8,padding:"12px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:TXT,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      <span style={{fontWeight:600}}>{cat.label}</span>
                      <span style={{fontSize:10,color:MUTED}}>??? vs ???</span>
                    </button>
                  ))
                ):(
                  <button onClick={nextRound} style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:ttReveal.win?GREEN:RED,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                    {ttRound+1<maxRounds?"Manche suivante →":"Voir mon score 🏆"}
                  </button>
                )}
              </div>
            );
          }

          // ══ MEILLEUR BUTEUR — TOURNOI ══════════════════════════
          if (activeGame==="buteur") {
            if(!buteurWinner)return null;
            const challenger=buteurDeck[0];
            if(!challenger||buteurDone){
              return (
                <div style={t.sec}>
                  <div style={{...t.card,textAlign:"center",padding:"24px 16px",marginTop:12}}>
                    <div style={{fontSize:48,marginBottom:8}}>🏆</div>
                    <div style={{fontSize:12,color:MUTED,marginBottom:4}}>Ton meilleur buteur du Mondial 2026</div>
                    <div style={{width:84,height:84,borderRadius:"50%",overflow:"hidden",margin:"0 auto 4px",background:"rgba(255,255,255,.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>
                      {cardPhotos[buteurWinner.name] ? <img src={cardPhotos[buteurWinner.name]} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : buteurWinner.emoji}
                    </div>
                    <div style={{fontSize:20,fontWeight:900,color:GOLD,marginBottom:2}}>{buteurWinner.name}</div>
                    <div style={{fontSize:11,color:MUTED,marginBottom:16}}>{buteurWinner.team} · {buteurWinner.intlGoals} buts sél.</div>
                    <div style={{textAlign:"left",marginBottom:16}}>
                      <div style={{fontSize:11,color:MUTED,fontWeight:700,marginBottom:8}}>🏟️ Choix du groupe</div>
                      {Object.keys(st.users).filter(u=>u!=="admin").map(u=>{
                        const choice=(gameScores.buteur||{})[u];
                        const card=BUTEUR_CARDS.find(c=>c.name===choice);
                        if(!choice)return null;
                        return(<div key={u} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"6px 10px",borderRadius:8,background:u===user?"rgba(245,200,66,.1)":"rgba(255,255,255,.04)"}}>
                          <span style={{fontSize:16}}>{card?.emoji||"🌍"}</span>
                          <span style={{flex:1,fontSize:11,fontWeight:u===user?700:400,color:u===user?GOLD:TXT}}>{u.toUpperCase()}</span>
                          <span style={{fontSize:11,color:TXT}}>{choice}</span>
                        </div>);
                      })}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"rgba(255,255,255,.08)",color:TXT,fontWeight:700,fontSize:12,cursor:"pointer"}}>← Menu</button>
                      <button onClick={()=>startGame("buteur")} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:700,fontSize:12,cursor:"pointer"}}>🔄 Rejouer</button>
                    </div>
                  </div>
                </div>
              );
            }
            const pickButeur=(side)=>{
              if(buteurPick)return; setButeurPick(side);
              const winner=side==="champion"?buteurWinner:challenger;
              const newDeck=buteurDeck.slice(1);
              setTimeout(()=>{
                setButeurWinner(winner);setButeurDeck(newDeck);setButeurPick(null);
                if(newDeck.length===0){saveGameScore("buteur",winner.name);setButeurDone(true);soundGoal();}
              },900);
            };
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                  <div style={{fontSize:11,color:MUTED}}>{BUTEUR_CARDS.length-buteurDeck.length}/{BUTEUR_CARDS.length} duels</div>
                  <div style={{fontSize:11,color:GOLD,fontWeight:700}}>🥅 Tournoi</div>
                </div>
                <div style={{...t.card,textAlign:"center",marginBottom:10,background:"rgba(245,200,66,.06)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:GOLD}}>Qui gardes-tu ?</div>
                  <div style={{background:"rgba(255,255,255,.06)",borderRadius:4,height:3,marginTop:8}}>
                    <div style={{height:3,borderRadius:4,background:GOLD,width:`${((BUTEUR_CARDS.length-buteurDeck.length)/BUTEUR_CARDS.length)*100}%`,transition:"width .3s"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  {[{card:buteurWinner,side:"champion",label:"🏆 CHAMPION",col:"rgba(245,200,66,.08)",brd:"rgba(245,200,66,.3)",tc:GOLD},
                    {card:challenger,side:"challenger",label:"⚔️ CHALLENGER",col:"rgba(255,255,255,.05)",brd:"rgba(255,255,255,.15)",tc:MUTED}
                  ].map(({card,side,label,col,brd,tc})=>(
                    <button key={side} onClick={()=>pickButeur(side)} disabled={!!buteurPick}
                      style={{flex:1,padding:"16px 10px",borderRadius:14,border:`2px solid ${buteurPick===side?"rgba(245,200,66,.8)":brd}`,
                        background:buteurPick===side?"rgba(245,200,66,.2)":col,
                        cursor:buteurPick?"default":"pointer",textAlign:"center",transition:"all .2s"}}>
                      <div style={{fontSize:10,color:tc,fontWeight:700,marginBottom:4}}>{label}</div>
                      <div style={{width:50,height:50,borderRadius:"50%",overflow:"hidden",margin:"0 auto 6px",background:"rgba(255,255,255,.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
                        {cardPhotos[card.name] ? <img src={cardPhotos[card.name]} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : card.emoji}
                      </div>
                      <div style={{fontSize:12,fontWeight:800,color:TXT}}>{card.name}</div>
                      <div style={{fontSize:10,color:MUTED,marginTop:2}}>{card.team}</div>
                      <div style={{fontSize:10,color:MUTED}}>{card.club}</div>
                      <div style={{fontSize:10,color:GREEN,fontWeight:700,marginTop:4}}>{card.intlGoals} buts sél.</div>
                      <div style={{fontSize:10,color:MUTED}}>{card.clubGoals} buts carrière{card.age ? ` · ${card.age} ans` : ""}</div>
                    </button>
                  ))}
                </div>
                {buteurPick&&<div style={{textAlign:"center",marginTop:10,fontSize:13,fontWeight:700,color:GOLD}}>✅ {buteurPick==="champion"?buteurWinner.name:challenger.name} avance !</div>}
              </div>
            );
          }

          // ══ PENALTY — jeu de timing ════════════════════════════
          if (activeGame==="penalty") {
            // Zones identiques à l'ancien système (compat. challenges existants)
            const zones=[
              {id:"hg",label:"Haut Gauche",emoji:"↖️",x:18,y:22},
              {id:"hc",label:"Haut Centre",emoji:"⬆️",x:50,y:14},
              {id:"hd",label:"Haut Droite",emoji:"↗️",x:82,y:22},
              {id:"bg",label:"Bas Gauche", emoji:"↙️",x:18,y:78},
              {id:"bc",label:"Bas Centre", emoji:"⬇️",x:50,y:86},
              {id:"bd",label:"Bas Droite", emoji:"↘️",x:82,y:78},
            ];
            const zoneOf = id => zones.find(z=>z.id===id);

            // Zone dérivée de la position du curseur (en %)
            // Le but occupe x 12-88, y 12-68 dans le conteneur
            const getPenZone = pos => {
              const col = pos.x < 36.7 ? "g" : pos.x < 63.3 ? "c" : "d";
              const row = pos.y < 40   ? "h" : "b";
              return row + col;
            };
            const curZoneId = getPenZone(penCursorPos);

            // ── Vue du but (réutilisable solo + défi) ─────────────
            // Appelée comme fonction (pas comme composant) pour éviter les re-montages
            const renderGoal = ({showCursor=false, cursorEmoji="🎯", cursor2Emoji=null, cursor2Pos=null, resultShot=null, resultAi=null, resultIsGood=null}={}) => {
              const GL = [ // layout des 6 zones sur le conteneur
                {id:"hg",l:"10%",t:"10%",w:"26.7%",h:"30%"},
                {id:"hc",l:"36.7%",t:"10%",w:"26.6%",h:"30%"},
                {id:"hd",l:"63.3%",t:"10%",w:"26.7%",h:"30%"},
                {id:"bg",l:"10%",t:"40%",w:"26.7%",h:"30%"},
                {id:"bc",l:"36.7%",t:"40%",w:"26.6%",h:"30%"},
                {id:"bd",l:"63.3%",t:"40%",w:"26.7%",h:"30%"},
              ];
              return (
                <div style={{position:"relative",width:"100%",paddingBottom:"64%",borderRadius:14,
                  overflow:"hidden",border:"1.5px solid rgba(255,255,255,.1)",
                  background:"linear-gradient(180deg,#0b1320 0%,#0b1320 70%,#12320f 70%,#12320f 100%)",marginBottom:8}}>
                  {/* Filet */}
                  <div style={{position:"absolute",top:"10%",left:"10%",right:"10%",height:"60%",
                    backgroundImage:"repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0,rgba(255,255,255,.05) 1px,transparent 1px,transparent 14%),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0,rgba(255,255,255,.05) 1px,transparent 1px,transparent 14%)"}}/>
                  {/* Cadre du but */}
                  <div style={{position:"absolute",top:"10%",left:"10%",right:"10%",height:"60%",
                    border:"3px solid rgba(255,255,255,.85)",borderBottom:"none",
                    borderRadius:"3px 3px 0 0",boxSizing:"border-box"}}/>
                  {/* Pelouse */}
                  <div style={{position:"absolute",top:"70%",left:0,right:0,bottom:0,
                    borderTop:"2px solid rgba(34,197,94,.5)",
                    background:"linear-gradient(180deg,rgba(22,101,22,.4),rgba(22,101,22,.65))"}}/>
                  {/* Point de penalty */}
                  <div style={{position:"absolute",bottom:"4%",left:"50%",transform:"translateX(-50%)",
                    width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,.45)"}}/>
                  {/* Overlay des 6 zones */}
                  {GL.map(({id,l,t,w,h})=>{
                    const isCur = showCursor && id===curZoneId;
                    const isBall= resultShot && id===resultShot;
                    const isGk  = resultAi   && id===resultAi && !isBall;
                    return (
                      <div key={id} style={{
                        position:"absolute",left:l,top:t,width:w,height:h,boxSizing:"border-box",
                        background:isBall?"rgba(245,200,66,.3)":isGk?"rgba(59,130,246,.22)":isCur?"rgba(245,200,66,.16)":"transparent",
                        border:isBall?`2px solid ${GOLD}`:isGk?"2px solid #60a5fa":isCur?`1.5px solid rgba(245,200,66,.6)`:"1px solid rgba(255,255,255,.06)",
                        transition:"background .07s,border .07s",
                        display:"flex",alignItems:"center",justifyContent:"center",
                      }}>
                        {isBall&&<span style={{fontSize:20}}>⚽</span>}
                        {isGk  &&<span style={{fontSize:20}}>🧤</span>}
                        {isCur&&!isBall&&!isGk&&(
                          <span style={{fontSize:8,color:GOLD,fontWeight:800,textAlign:"center",lineHeight:1.4,opacity:.9}}>
                            {zoneOf(id)?.emoji}<br/>{zoneOf(id)?.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {/* Curseur animé joueur */}
                  {showCursor&&(
                    <div style={{position:"absolute",left:`${penCursorPos.x}%`,top:`${penCursorPos.y}%`,
                      transform:"translate(-50%,-50%)",fontSize:24,pointerEvents:"none",zIndex:10,
                      filter:"drop-shadow(0 0 9px rgba(245,200,66,1)) drop-shadow(0 0 3px rgba(0,0,0,.9))",
                    }}>{cursorEmoji}</div>
                  )}
                  {/* Curseur IA (gardien adverse visible quand on est tireur) */}
                  {cursor2Pos&&cursor2Emoji&&!resultShot&&(
                    <div style={{position:"absolute",left:`${cursor2Pos.x}%`,top:`${cursor2Pos.y}%`,
                      transform:"translate(-50%,-50%)",fontSize:22,pointerEvents:"none",zIndex:9,
                      filter:"drop-shadow(0 0 8px rgba(96,165,250,0.95))",
                    }}>{cursor2Emoji}</div>
                  )}
                  {/* Label résultat */}
                  {resultShot&&(
                    <div style={{position:"absolute",bottom:5,left:0,right:0,textAlign:"center",
                      fontSize:15,fontWeight:900,letterSpacing:.5,
                      color: resultIsGood!==null ? (resultIsGood?GREEN:"#60a5fa") : (resultShot!==resultAi?GREEN:"#60a5fa"),
                      textShadow:"0 2px 10px rgba(0,0,0,.95)"}}>
                      {resultShot!==resultAi?"⚽  B U T !":"🧤  A R R Ê T É !"}
                    </div>
                  )}
                </div>
              );
            };

            // ══ SOLO : 6 tirs alternés tireur / gardien ═════════════
            if (gameMode==="solo") {
              const role = penShots.length%2===0 ? "tireur" : "gardien";
              const isTireur = role==="tireur";
              const kickNum  = penShots.length+1;
              const last     = penShots[penShots.length-1];
              const shooting = penPhase==="shoot" && penShots.length<6;
              const myPts = penShots.filter(s=>(s.role==="tireur"&&s.isGoal)||(s.role==="gardien"&&!s.isGoal)).length;
              const aiPts = penShots.filter(s=>(s.role==="tireur"&&!s.isGoal)||(s.role==="gardien"&&s.isGoal)).length;
              const curZoneId = getPenZone(penCursorPos);
              const aiZoneId  = getPenZone(penAiCursorPos);

              const handleKick = () => {
                if (!shooting) return;
                const myZone = getPenZone(penCursorPos);
                let aiZone, isGoal;
                if (isTireur) {
                  aiZone = getPenZone(penAiCursorPos);
                  isGoal = myZone!==aiZone;
                  isGoal ? soundGoal() : soundSave();
                } else {
                  const allZ=["hg","hc","hd","bg","bc","bd"];
                  const others=allZ.filter(z=>z!==myZone);
                  aiZone = getPenZone(penAiCursorPos); // tireur IA = là où son curseur pointait quand tu as plongé
                  isGoal = aiZone!==myZone;
                  !isGoal ? soundSave() : soundWrongGame();
                }
                const ns=[...penShots,{role,myZone,aiZone,isGoal}];
                setPenShots(ns); setPenPhase("anim");
                penAiStartRef.current=null; penCursorStartRef.current=null;
                setPenDifficulty(null); // force new difficulty draw on next kick
                setTimeout(()=>{
                  if(ns.length>=6){
                    const pts=ns.filter(s=>(s.role==="tireur"&&s.isGoal)||(s.role==="gardien"&&!s.isGoal)).length;
                    saveGameScore("penalty",pts); setQScore(pts);
                    setTimeout(()=>{setGamePhase("result");stopGameMusic();},400);
                  } else { setPenPhase("shoot"); }
                },2000);
              };

              const resultShot = penPhase==="anim"&&last ? (last.role==="tireur"?last.myZone:last.aiZone) : null;
              const resultAi   = penPhase==="anim"&&last ? (last.role==="tireur"?last.aiZone:last.myZone) : null;
              const resultIsGood = penPhase==="anim"&&last ? ((last.role==="tireur"&&last.isGoal)||(last.role==="gardien"&&!last.isGoal)) : null;

              return (
                <div style={t.sec}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                    <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                    <div style={{fontSize:12,fontWeight:800,color:shooting?(isTireur?GOLD:"#60a5fa"):MUTED}}>
                      {shooting?(isTireur?"⚽ Tu TIRES":"🧤 Tu GARDES"):"⏳"} — {Math.min(kickNum,6)}/6
                    </div>
                    <div style={{fontSize:12,fontWeight:700}}>
                      <span style={{color:GOLD}}>{myPts}</span><span style={{color:MUTED}}>–</span><span style={{color:RED}}>{aiPts}</span>
                    </div>
                  </div>

                  <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:12}}>
                    {Array.from({length:6},(_,i)=>{
                      const s=penShots[i];
                      const isKickTireur=i%2===0;
                      const isNext=i===penShots.length&&penPhase==="shoot";
                      const iGood=s&&((s.role==="tireur"&&s.isGoal)||(s.role==="gardien"&&!s.isGoal));
                      return (
                        <div key={i} style={{
                          width:34,height:34,borderRadius:"50%",
                          background:s?(iGood?"rgba(34,197,94,.2)":"rgba(239,68,68,.15)"):"rgba(255,255,255,.05)",
                          border:`2px solid ${s?(iGood?GREEN:RED):isNext?(isKickTireur?GOLD:"#60a5fa"):"rgba(255,255,255,.12)"}`,
                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,
                          boxShadow:isNext?`0 0 12px ${isKickTireur?"rgba(245,200,66,.4)":"rgba(59,130,246,.35)"}`:"none",
                          transition:"all .3s",
                        }}>
                          {s?(iGood?"✅":"❌"):(isNext?(isKickTireur?"⚽":"🧤"):"")}
                        </div>
                      );
                    })}
                  </div>

                  {shooting&&(
                    <div style={{...t.card,textAlign:"center",marginBottom:10,padding:"12px",
                      background:isTireur?"rgba(245,200,66,.1)":"rgba(59,130,246,.1)",
                      border:`2px solid ${isTireur?"rgba(245,200,66,.45)":"rgba(59,130,246,.45)"}`}}>
                      <div style={{fontSize:30,marginBottom:3}}>{isTireur?"⚽":"🧤"}</div>
                      <div style={{fontSize:16,fontWeight:900,color:isTireur?GOLD:"#60a5fa",letterSpacing:.5}}>
                        {isTireur?"TU TIRES !":"TU GARDES !"}
                      </div>
                      <div style={{fontSize:10,color:MUTED,marginTop:4}}>
                        {isTireur
                          ?"Le 🧤 gardien bouge en temps réel — tire là où il n'est PAS !"
                          :"L'attaquant se prépare — anticipe et plonge au bon endroit !"}
                      </div>
                      {penDifficulty&&(
                        <div style={{display:"inline-block",marginTop:8,padding:"3px 12px",borderRadius:20,
                          background:`${penDifficulty.color}22`,border:`1px solid ${penDifficulty.color}66`,
                          fontSize:11,fontWeight:800,color:penDifficulty.color}}>
                          {penDifficulty.label}
                        </div>
                      )}
                    </div>
                  )}

                  {renderGoal({
                    showCursor: shooting,
                    cursorEmoji: isTireur?"🎯":"🧤",
                    cursor2Emoji: shooting ? (isTireur?"🧤":"⚽") : null,
                    cursor2Pos:   shooting ? penAiCursorPos : null,
                    resultShot,
                    resultAi,
                    resultIsGood,
                  })}

                    {shooting&&(
                    <div style={{textAlign:"center",marginBottom:10}}>
                      <div style={{fontSize:13,fontWeight:800,color:isTireur?GOLD:"#60a5fa"}}>
                        {isTireur?"Tu vises ":"Tu plonges → "}
                        {zoneOf(curZoneId)?.emoji} <strong>{zoneOf(curZoneId)?.label}</strong>
                      </div>
                      {isTireur&&(
                        <div style={{fontSize:11,marginTop:4,color:"#60a5fa"}}>
                          Gardien : {zoneOf(aiZoneId)?.emoji} {zoneOf(aiZoneId)?.label}
                          {curZoneId!==aiZoneId
                            ? <span style={{color:GREEN,fontWeight:700}}> ✅ Zone libre !</span>
                            : <span style={{color:RED,  fontWeight:700}}> ⚠️ Il est là !</span>}
                        </div>
                      )}
                      {!isTireur&&(
                        <div style={{fontSize:11,marginTop:4,color:GOLD}}>
                          Tireur ⚽ : {zoneOf(aiZoneId)?.emoji} {zoneOf(aiZoneId)?.label}
                          {curZoneId===aiZoneId
                            ? <span style={{color:GREEN,fontWeight:700}}> ✅ Tu es bien placé !</span>
                            : <span style={{color:AMB,  fontWeight:700}}> ↔ Il vise ailleurs...</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {shooting&&(
                    <>
                      <button onClick={handleKick} style={{
                        width:"100%",padding:"20px",borderRadius:14,border:"none",
                        background:isTireur?`linear-gradient(135deg,${GOLD},#f59e0b)`:"linear-gradient(135deg,#3b82f6,#1d4ed8)",
                        color:isTireur?"#0a0e1a":"#fff",fontWeight:900,fontSize:22,cursor:"pointer",fontFamily:"inherit",
                        boxShadow:isTireur?`0 6px 30px rgba(245,200,66,.55)`:"0 6px 30px rgba(59,130,246,.4)",letterSpacing:.5,
                      }}>
                        {isTireur?"⚽  T I R E R !":"🧤  P L O N G E R !"}
                      </button>
                      <div style={{textAlign:"center",fontSize:10,color:MUTED,marginTop:7}}>
                        {isTireur?"Tire quand le 🧤 gardien est loin de ta zone !":"Plonge quand tu as anticipé la zone du tireur !"}
                      </div>
                    </>
                  )}

                  {penPhase==="anim"&&last&&penShots.length<6&&(()=>{
                    const iGood=(last.role==="tireur"&&last.isGoal)||(last.role==="gardien"&&!last.isGoal);
                    const msg=last.role==="tireur"
                      ?(last.isGoal?"⚽ But ! Bien visé !":"🧤 Arrêté ! Le gardien était là")
                      :(!last.isGoal?"✅ Arrêt ! Bien anticipé !":"❌ But encaissé...");
                    const detail=last.role==="tireur"
                      ?`Tir ${zoneOf(last.myZone)?.emoji} · Gardien ${zoneOf(last.aiZone)?.emoji}`
                      :`IA tire ${zoneOf(last.aiZone)?.emoji} · Tu plonges ${zoneOf(last.myZone)?.emoji}`;
                    return (
                      <div style={{...t.card,textAlign:"center",background:iGood?"rgba(34,197,94,.1)":"rgba(239,68,68,.08)",border:`1px solid ${iGood?GREEN:RED}`}}>
                        <div style={{fontSize:14,fontWeight:800,color:iGood?GREEN:RED}}>{msg}</div>
                        <div style={{fontSize:10,color:MUTED,marginTop:3}}>{detail}</div>
                      </div>
                    );
                  })()}

                  <div style={{textAlign:"center",marginTop:8,fontSize:11,color:MUTED}}>
                    Toi <span style={{color:GOLD,fontWeight:700}}>{myPts}</span> · IA <span style={{color:RED,fontWeight:700}}>{aiPts}</span>
                  </div>
                  <div style={{height:16}}/>
                </div>
              );
            }

            // ══ DÉFI PENALTY — multi-round (6 tirs, rôles alternants) ══════
            const currentChallenge=penChallengeId?(challenges[penChallengeId]):null;

            // Écran de sélection d'un adversaire
            if(!penChallengeId||!currentChallenge){
              const activeOnes=Object.entries(challenges).filter(([,c])=>{
                if (c.game!=="penalty" || c.status==="done") return false;
                // Inclure TOUS les défis (émis ou reçus) où je suis partie prenante,
                // quel que soit le statut exact — y compris les anciens défis bloqués
                // au format obsolète (shotFrom/shotTo), pour que je puisse toujours
                // les voir et les supprimer, même si je suis le destinataire.
                if (!(c.from===user || c.to===user)) return false;
                // Exclure les défis inter-groupes (l'adversaire doit être dans le même groupe)
                const opp = c.from===user ? c.to : c.from;
                const oppRole = (st.users[opp]||{}).role;
                return isAdmin || !role || !oppRole || oppRole===role;
              });
              return (
                <div style={t.sec}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,marginTop:8}}>
                    <button onClick={()=>{setGamePhase("menu");setActiveGame(null);stopGameMusic();}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Quitter</button>
                    <div style={{fontSize:13,fontWeight:700,color:GOLD}}>⚽ Penalty — Défi</div>
                    <div style={{width:60}}/>
                  </div>
                  <div style={{...t.card,marginBottom:14,background:"rgba(245,200,66,.05)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:GOLD,marginBottom:6}}>⚽ Comment ça marche ?</div>
                    <div style={{fontSize:11,color:MUTED,lineHeight:1.6}}>
                      6 tirs en alternance — tu tires 3 fois, tu gardes 3 fois.<br/>
                      <span style={{color:TXT}}>L'historique des zones est visible après chaque tir</span> : observe les habitudes de ton adversaire, bluff sur tes propres choix. Plus le match avance, moins c'est du hasard.
                    </div>
                  </div>
                  {activeOnes.length>0&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:MUTED,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>⚔️ Défis en cours</div>
                      {activeOnes.map(([id,c])=>{
                        const opp=c.from===user?c.to:c.from;
                        const kicks=c.kicks||[];
                        const myPick=(c.pick||{})[user];
                        const isOldFormat = c.shotFrom !== undefined;
                        const statusLabel = isOldFormat
                          ? "⚠️ Ancien format — à supprimer"
                          : c.status==="pending"
                          ? (c.to===user ? "⏳ À accepter/refuser" : "⏳ En attente d'acceptation")
                          : kicks.length===0?"Tir 1/6 — début":myPick?`Tir ${kicks.length+1}/6 — ⏳ tu as joué`:`Tir ${kicks.length+1}/6 — 🎯 à toi`;
                        return (
                          <button key={id} onClick={()=>setPenChallengeId(id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",marginBottom:6,padding:"10px 12px",borderRadius:10,border:`1px solid ${isOldFormat?RED:AMB}`,background:isOldFormat?"rgba(239,68,68,.08)":"rgba(245,158,11,.08)",color:TXT,cursor:"pointer",fontFamily:"inherit"}}>
                            <span style={{fontSize:12,fontWeight:700}}>vs {opp?.toUpperCase?.()}</span>
                            <span style={{fontSize:11,color:isOldFormat?RED:AMB,fontWeight:700}}>{statusLabel} →</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{fontSize:10,color:MUTED,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Nouveau défi</div>
                  {players.length===0&&<div style={t.empty}>Aucun autre joueur disponible</div>}
                  {players.map(p=>{
                    const exEntry=Object.entries(challenges).find(([,c])=>c.game==="penalty"&&c.status!=="done"&&((c.from===user&&c.to===p)||(c.from===p&&c.to===user)));
                    const ex = exEntry ? exEntry[1] : null;
                    const exId = exEntry ? exEntry[0] : null;
                    return (
                      <div key={p} style={{...t.card,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:700,color:TXT}}>{onlinePlayers.includes(p)&&<span style={{color:GREEN,marginRight:4}}>🟢</span>}{p?.toUpperCase?.()}</div>
                          <div style={{fontSize:10,color:MUTED}}>{scores[p]||0} pts</div>
                        </div>
                        {ex?(
                          <button onClick={()=>setPenChallengeId(exId)} style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${AMB}`,background:"rgba(245,158,11,.1)",color:AMB,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontStyle:"italic"}}>
                            ⏳ Défi en cours — voir →
                          </button>
                        ):(
                          <button onClick={()=>{
                            try {
                              const id=`pen_${user}_${p}_${Date.now()}`;
                              const newChallenge = {
                                game:"penalty",from:user,to:p,
                                kicks:[],pick:{},
                                tireur:null,             // assigné à l'acceptation seulement
                                fromGoals:0,toGoals:0,
                                status:"pending",          // ⬅️ attend l'acceptation de l'adversaire
                                winner:null,ts:Date.now(),
                              };
                              recentChallengeWritesRef.current[id] = { data: newChallenge, ts: Date.now() };
                              setSt(prev => {
                                const ns = {...prev, challenges:{...(prev.challenges||{}), [id]: newChallenge}};
                                try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                                return ns;
                              });
                              // Écriture Firebase scopée sur ce seul défi : ne touche jamais aux
                              // autres défis existants, même si l'état local est momentanément
                              // en retard par rapport au serveur (protège contre la perte d'un
                              // défi précédent lors de la création rapide d'un nouveau défi).
                              if (_fbReady) _fbUpdate(`/challenges/${id}`, newChallenge);
                              setPenChallengeId(id);
                            } catch(err) {
                              console.error("Erreur création défi penalty:", err);
                              showNotif("error", "❌ Erreur lors de la création du défi — réessaie ou contacte l'admin");
                            }
                          }} style={{padding:"8px 12px",borderRadius:8,border:"none",background:GOLD,color:"#0a0e1a",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚔️ Défier</button>
                        )}
                      </div>
                    );
                  })}
                  <div style={{height:24}}/>
                </div>
              );
            }

            // ── Vue d'un défi actif ──────────────────────────────
            const ch=currentChallenge;

            // Ancien format (shotFrom/shotTo) : proposer de supprimer pour repartir
            if (ch.shotFrom !== undefined) {
              return (
                <div style={t.sec}>
                  <button onClick={()=>setPenChallengeId(null)} style={{margin:"12px 0",padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Retour</button>
                  <div style={{...t.card,textAlign:"center",padding:20}}>
                    <div style={{fontSize:28,marginBottom:8}}>🗑️</div>
                    <div style={{fontSize:13,color:TXT,fontWeight:700,marginBottom:6}}>Défi dans l'ancien format</div>
                    <div style={{fontSize:11,color:MUTED,marginBottom:16}}>Ce défi ne peut plus être joué. Supprime-le pour en lancer un nouveau avec {ch.from===user?ch.to:ch.from}.</div>
                    <button onClick={()=>{
                      setSt(prev => {
                        const ns = {...(prev.challenges||{})};
                        delete ns[penChallengeId];
                        const ns2 = {...prev, challenges: ns};
                        try { localStorage.setItem(KEY, JSON.stringify(ns2)); } catch(e) {}
                        return ns2;
                      });
                      if (_fbReady) _fbUpdate(`/challenges/${penChallengeId}`, null);
                      setPenChallengeId(null);
                      showNotif("info","Ancien défi supprimé — tu peux maintenant en lancer un nouveau !");
                    }} style={{padding:"10px 20px",borderRadius:10,border:"none",background:RED,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      🗑️ Supprimer ce défi
                    </button>
                  </div>
                </div>
              );
            }

            // ── Défi en attente d'acceptation ──
            // Tant que le défi n'est pas accepté, AUCUN tir ne peut être joué.
            // C'est ce qui garantit que refuser empêche réellement de jouer.
            if (ch.status==="pending") {
              const isRecipient = ch.to===user;
              const opp2 = isRecipient ? ch.from : ch.to;
              const acceptPenalty = () => {
                if (blockIfDailyLimitReached("penalty", user)) return;
                const firstTireur = Math.random()<.5 ? ch.from : ch.to;
                const updated = {...ch,status:"active",tireur:firstTireur};
                recentChallengeWritesRef.current[penChallengeId] = { data: updated, ts: Date.now() };
                setSt(prev => {
                  const ns = {...prev, challenges:{...(prev.challenges||{}),[penChallengeId]:updated}};
                  try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                  return ns;
                });
                if (_fbReady) _fbUpdate(`/challenges/${penChallengeId}`, updated);
              };
              const declinePenalty = () => {
                setSt(prev => {
                  const ns2 = {...(prev.challenges||{})}; delete ns2[penChallengeId];
                  const ns = {...prev, challenges: ns2};
                  try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                  return ns;
                });
                if (_fbReady) _fbUpdate(`/challenges/${penChallengeId}`, null);
                showNotif("info",`Défi de ${ch.from?.toUpperCase?.()} refusé`);
                setPenChallengeId(null);
              };
              return (
                <div style={t.sec}>
                  <button onClick={()=>setPenChallengeId(null)} style={{margin:"12px 0",padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Retour</button>
                  {isRecipient ? (
                    <div style={{...t.card,textAlign:"center",background:"rgba(245,200,66,.08)",border:`1px solid rgba(245,200,66,.35)`}}>
                      <div style={{fontSize:32,marginBottom:6}}>⚔️</div>
                      <div style={{fontSize:14,fontWeight:800,color:GOLD,marginBottom:4}}>{opp2?.toUpperCase?.()} te défie aux tirs au but !</div>
                      <div style={{fontSize:10,color:MUTED,marginBottom:12}}>6 tirs alternés — rôles tirés au sort à l'acceptation</div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={acceptPenalty} style={{flex:2,padding:"10px",borderRadius:9,border:"none",background:GOLD,color:"#0a0e1a",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✅ Accepter</button>
                        <button onClick={declinePenalty} style={{flex:1,padding:"10px",borderRadius:9,border:"1px solid rgba(239,68,68,.4)",background:"rgba(239,68,68,.1)",color:RED,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✗ Refuser</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{...t.card,textAlign:"center",color:MUTED}}>
                      <div style={{fontSize:28,marginBottom:6}}>⏳</div>
                      <div style={{fontSize:13,fontWeight:700,color:TXT}}>En attente que {opp2?.toUpperCase?.()} accepte ton défi…</div>
                    </div>
                  )}
                </div>
              );
            }

            const isFrom=ch.from===user;
            const opponent=isFrom?ch.to:ch.from;
            if (!opponent) { setPenChallengeId(null); return null; }

            const myGoals   = isFrom ? ch.fromGoals||0 : ch.toGoals||0;
            const oppGoals  = isFrom ? ch.toGoals||0   : ch.fromGoals||0;
            const kicks     = ch.kicks||[];
            const kicksDone = kicks.length;
            const iAmTireur = ch.tireur===user;
            const myPick    = (ch.pick||{})[user];
            const totalKicks= 6;

            const myPastPicks = kicks.filter(k=>iAmTireur?k.tireur===user:k.gardien===user).map(k=>iAmTireur?k.tp:k.gp);
            const oppPastPicks= kicks.filter(k=>iAmTireur?k.gardien===opponent:k.tireur===opponent).map(k=>iAmTireur?k.gp:k.tp);

            const submitPick=(zone)=>{
              if(myPick)return;
              const updated = {...ch,pick:{...(ch.pick||{}),[user]:zone}};
              recentChallengeWritesRef.current[penChallengeId] = { data: updated, ts: Date.now() };
              setSt(prev => {
                const ns = {...prev, challenges:{...(prev.challenges||{}),[penChallengeId]:updated}};
                try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch(e) {}
                return ns;
              });
              if (_fbReady) _fbUpdate(`/challenges/${penChallengeId}`, updated);
            };

            // ── Résultat final ──
            if(ch.status==="done"){
              const won=ch.winner===user, draw=!ch.winner;
              return (
                <div style={t.sec}>
                  <button onClick={()=>setPenChallengeId(null)} style={{margin:"12px 0 8px",padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Retour</button>
                  <div style={{...t.card,textAlign:"center",marginBottom:12,
                    background:won?"rgba(34,197,94,.15)":draw?"rgba(255,255,255,.05)":"rgba(239,68,68,.12)",
                    border:`1px solid ${won?GREEN:draw?BRD:RED}`}}>
                    <div style={{fontSize:36,marginBottom:6}}>{won?"🏆":draw?"🤝":"😔"}</div>
                    <div style={{fontSize:18,fontWeight:900,color:won?GREEN:draw?MUTED:RED}}>
                      {won?"Victoire !":draw?"Match nul":"Défaite"}
                    </div>
                    <div style={{fontSize:22,fontWeight:900,marginTop:8,color:TXT}}>
                      <span style={{color:GOLD}}>{myGoals}</span>
                      <span style={{color:MUTED}}> — </span>
                      <span>{oppGoals}</span>
                    </div>
                    <div style={{fontSize:11,color:MUTED,marginTop:4}}>vs {opponent?.toUpperCase?.()}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>📊 Récapitulatif des 6 tirs</div>
                    {kicks.map((k,i)=>{
                      const zT=zoneOf(k.tp), zG=zoneOf(k.gp);
                      const tireurName  = k.tireur===user  ? "TOI" : (opponent?.toUpperCase?.()||k.tireur?.toUpperCase?.());
                      const gardienName = k.gardien===user ? "TOI" : (opponent?.toUpperCase?.()||k.gardien?.toUpperCase?.());
                      const meWon = (k.goal&&k.tireur===user)||(!k.goal&&k.gardien===user);
                      const winnerName = k.goal ? tireurName : gardienName;
                      const sameZone = k.tp===k.gp;
                      return (
                        <div key={i} style={{marginBottom:8,padding:"10px 12px",borderRadius:10,
                          border:`1.5px solid ${meWon?"rgba(34,197,94,.45)":"rgba(239,68,68,.4)"}`,
                          background:meWon?"rgba(34,197,94,.07)":"rgba(239,68,68,.05)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                            <span style={{fontSize:10,color:MUTED,fontWeight:700,letterSpacing:.5}}>TIR #{i+1}</span>
                            <span style={{fontSize:12,fontWeight:900,color:k.goal?GREEN:"#60a5fa"}}>
                              {k.goal?"⚽ BUT":"🧤 ARRÊTÉ"}
                            </span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,marginBottom:4}}>
                            <span style={{color:GOLD,fontWeight:800,minWidth:50}}>⚽ {tireurName}</span>
                            <span style={{color:MUTED,fontSize:10}}>tire</span>
                            <span style={{color:TXT,fontWeight:700}}>{zT?.emoji} {zT?.label}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                            <span style={{color:"#60a5fa",fontWeight:800,minWidth:50}}>🧤 {gardienName}</span>
                            <span style={{color:MUTED,fontSize:10}}>plonge</span>
                            <span style={{color:TXT,fontWeight:700}}>{zG?.emoji} {zG?.label}</span>
                            {sameZone&&<span style={{color:MUTED,fontSize:9,fontStyle:"italic"}}>— même zone !</span>}
                          </div>
                          <div style={{marginTop:7,fontSize:10,fontWeight:800,color:meWon?GREEN:RED,textAlign:"right"}}>
                            {meWon ? "✅ Point pour toi" : `❌ Point pour ${winnerName}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{height:24}}/>
                </div>
              );
            }

            // ── Tir en cours ──
            return (
              <div style={t.sec}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
                  <button onClick={()=>setPenChallengeId(null)} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,.08)",color:MUTED,fontSize:11,cursor:"pointer"}}>← Retour</button>
                  <div style={{fontSize:11,fontWeight:700,color:MUTED}}>Tir {kicksDone+1}/{totalKicks}</div>
                  <div style={{fontSize:11,color:MUTED}}>vs {opponent?.toUpperCase?.()}</div>
                </div>

                <div style={{...t.card,display:"flex",justifyContent:"space-around",alignItems:"center",marginBottom:12,padding:"12px"}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:30,fontWeight:900,color:GOLD,lineHeight:1}}>{myGoals}</div>
                    <div style={{fontSize:10,color:MUTED,marginTop:2}}>TOI</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{display:"flex",gap:4,marginBottom:4,justifyContent:"center"}}>
                      {Array.from({length:totalKicks},(_,i)=>{
                        const k=kicks[i];
                        if(!k) return <div key={i} style={{width:10,height:10,borderRadius:"50%",background:"rgba(255,255,255,.1)"}}/>;
                        const iWon=(k.goal&&k.tireur===user)||(!k.goal&&k.gardien===user);
                        return <div key={i} style={{width:10,height:10,borderRadius:"50%",background:iWon?GREEN:RED}}/>;
                      })}
                    </div>
                    <div style={{fontSize:9,color:MUTED}}>{totalKicks-kicksDone} restants</div>
                    <div style={{fontSize:8,color:MUTED,marginTop:2}}>🟢 toi · 🔴 adversaire</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:30,fontWeight:900,color:TXT,lineHeight:1}}>{oppGoals}</div>
                    <div style={{fontSize:10,color:MUTED,marginTop:2}}>{opponent?.toUpperCase?.()?.slice(0,8)}</div>
                  </div>
                </div>

                {kicks.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>📊 Historique du match</div>
                    {kicks.map((k,i)=>{
                      const zT=zoneOf(k.tp), zG=zoneOf(k.gp);
                      const tireurName  = k.tireur===user  ? "TOI" : (opponent?.toUpperCase?.()||k.tireur?.toUpperCase?.());
                      const gardienName = k.gardien===user ? "TOI" : (opponent?.toUpperCase?.()||k.gardien?.toUpperCase?.());
                      const meWon = (k.goal&&k.tireur===user)||(!k.goal&&k.gardien===user);
                      const winnerName = k.goal ? tireurName : gardienName;
                      const sameZone = k.tp===k.gp;
                      return (
                        <div key={i} style={{marginBottom:8,padding:"10px 12px",borderRadius:10,
                          border:`1.5px solid ${meWon?"rgba(34,197,94,.45)":"rgba(239,68,68,.4)"}`,
                          background:meWon?"rgba(34,197,94,.07)":"rgba(239,68,68,.05)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                            <span style={{fontSize:10,color:MUTED,fontWeight:700,letterSpacing:.5}}>TIR #{i+1}</span>
                            <span style={{fontSize:12,fontWeight:900,color:k.goal?GREEN:"#60a5fa"}}>
                              {k.goal?"⚽ BUT":"🧤 ARRÊTÉ"}
                            </span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,marginBottom:4}}>
                            <span style={{color:GOLD,fontWeight:800,minWidth:50}}>⚽ {tireurName}</span>
                            <span style={{color:MUTED,fontSize:10}}>tire</span>
                            <span style={{color:TXT,fontWeight:700}}>{zT?.emoji} {zT?.label}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                            <span style={{color:"#60a5fa",fontWeight:800,minWidth:50}}>🧤 {gardienName}</span>
                            <span style={{color:MUTED,fontSize:10}}>plonge</span>
                            <span style={{color:TXT,fontWeight:700}}>{zG?.emoji} {zG?.label}</span>
                            {sameZone&&<span style={{color:MUTED,fontSize:9,fontStyle:"italic"}}>— même zone !</span>}
                          </div>
                          <div style={{marginTop:7,fontSize:10,fontWeight:800,color:meWon?GREEN:RED,textAlign:"right"}}>
                            {meWon ? "✅ Point pour toi" : `❌ Point pour ${winnerName}`}
                          </div>
                        </div>
                      );
                    })}
                    {oppPastPicks.length>=2&&(
                      <div style={{marginTop:4,fontSize:10,color:AMB,padding:"6px 9px",borderRadius:7,background:"rgba(245,158,11,.08)"}}>
                        💡 {iAmTireur?"Le gardien a défendu ":"L'adversaire a tiré "}{[...new Set(oppPastPicks)].map(z=>zoneOf(z)?.emoji).join(" ")} — adapte-toi !
                      </div>
                    )}
                  </div>
                )}

                <div style={{...t.card,textAlign:"center",marginBottom:12,
                  background:iAmTireur?"rgba(245,200,66,.1)":"rgba(59,130,246,.1)",
                  border:`1px solid ${iAmTireur?"rgba(245,200,66,.35)":"rgba(59,130,246,.35)"}`}}>
                  <div style={{fontSize:28,marginBottom:2}}>{iAmTireur?"⚽":"🧤"}</div>
                  <div style={{fontSize:15,fontWeight:900,color:iAmTireur?GOLD:"#60a5fa"}}>
                    {iAmTireur?"Tu TIRES ce coup":"Tu GARDES ce coup"}
                  </div>
                  <div style={{fontSize:10,color:MUTED,marginTop:3}}>
                    {iAmTireur?"Observe l'historique — va là où le gardien ne s'attend pas !":"Analyse les tirs précédents — anticipe la zone !"}
                  </div>
                </div>

                {myPick?(
                  <div style={{...t.card,textAlign:"center",background:"rgba(245,200,66,.07)",border:`1px solid rgba(245,200,66,.25)`}}>
                    <div style={{fontSize:22,marginBottom:4}}>⏳</div>
                    <div style={{fontSize:13,fontWeight:700,color:GOLD}}>Tu as joué {zoneOf(myPick)?.emoji} {zoneOf(myPick)?.label}</div>
                    <div style={{fontSize:10,color:MUTED,marginTop:4}}>En attente de {opponent?.toUpperCase?.()}…</div>
                  </div>
                ):(
                  <>
                    {myPastPicks.length>0&&(
                      <div style={{fontSize:10,color:MUTED,textAlign:"center",marginBottom:8}}>
                        Tes zones précédentes : {myPastPicks.map(z=>zoneOf(z)?.emoji).join(" ")}
                        <span style={{color:AMB}}> · bluff possible !</span>
                      </div>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                      {zones.map(z=>{
                        const used=myPastPicks.filter(p=>p===z.id).length;
                        return (
                          <button key={z.id} onClick={()=>submitPick(z.id)} style={{
                            padding:"14px 4px",borderRadius:10,
                            border:`1px solid ${used>0?"rgba(245,200,66,.35)":BRD}`,
                            background:used>0?"rgba(245,200,66,.07)":"rgba(255,255,255,.04)",
                            color:TXT,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",
                            textAlign:"center",
                          }}>
                            {z.emoji}
                            <div style={{fontSize:9,color:MUTED,marginTop:2}}>{z.label}</div>
                            {used>0&&<div style={{fontSize:8,color:AMB}}>{"↩".repeat(used)}</div>}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{textAlign:"center",fontSize:10,color:MUTED}}>
                      {iAmTireur?"Bluff sur tes habitudes — évite d'être prévisible !":"L'adversaire voit tes plongeons précédents aussi !"}
                    </div>
                  </>
                )}
                <div style={{height:24}}/>
              </div>
            );
          } // fin if activeGame==="penalty"

          return null;
        })()}

      </div>

      {/* ── MODALE RAPPEL PRONOSTIC ÉLIM ── */}
      {pronoReminder && (()=>{
        void tick; // force re-render pour le compte à rebours
        const reminder = ELIM_REMINDERS.find(r=>r.phase===pronoReminder);
        if (!reminder) return null;
        const now = new Date();
        const dl = new Date(reminder.deadline);
        const diff = dl - now;
        const days = Math.floor(diff/86400000);
        const hrs  = Math.floor((diff%86400000)/3600000);
        const mins = Math.floor((diff%3600000)/60000);
        const lines = reminder.msg.split("\n");
        return (
          <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#0f1628",border:`2px solid ${GOLD}`,borderRadius:24,padding:28,maxWidth:360,width:"100%",textAlign:"center",boxShadow:`0 0 60px rgba(255,210,52,.25)`}}>
              <div style={{fontSize:48,marginBottom:12}}>⚽</div>
              <div style={{fontSize:20,fontWeight:900,color:GOLD,marginBottom:8,lineHeight:1.2}}>
                {reminder.label}
              </div>
              {lines.map((l,i)=>(
                <div key={i} style={{fontSize:15,color:TXT,fontWeight:i===0?600:400,lineHeight:1.5,marginBottom:i===0?4:0}}>
                  {l}
                </div>
              ))}
              {diff > 0 && (
                <div style={{display:"inline-flex",gap:10,marginTop:16,background:"rgba(255,210,52,.08)",border:`1px solid rgba(255,210,52,.3)`,borderRadius:14,padding:"10px 16px"}}>
                  {days>0 && <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:GOLD}}>{days}j</div><div style={{fontSize:9,color:MUTED}}>jour{days>1?"s":""}</div></div>}
                  <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:GOLD}}>{String(hrs).padStart(2,"0")}h</div><div style={{fontSize:9,color:MUTED}}>heures</div></div>
                  <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:GOLD}}>{String(mins).padStart(2,"0")}m</div><div style={{fontSize:9,color:MUTED}}>minutes</div></div>
                </div>
              )}
              <button
                onClick={()=>{ setPronoReminder(null); setTab("elim"); setEPhase(reminder.phase); }}
                style={{marginTop:22,width:"100%",padding:"14px",borderRadius:14,border:"none",background:GRAD_SUN,color:"#0a0e1a",fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(255,140,0,.4)"}}>
                OK, je vais faire mes pronostics !
              </button>
            </div>
          </div>
        );
      })()}

      {/* BOTTOM NAV */}
      <div style={{...t.bnav, position:"static", flexShrink:0}}>
        {navItems.map(n=>{
          const isOn = tab===n.k;
          // Badge salle d'attente sur onglet Admin
          const waitingCount = n.k==="admin" && isAdmin
            ? Object.keys(st.users).filter(u=>u!=="admin"&&st.users[u]?.role==="waiting").length
            : 0;
          // Badge nouveaux messages chat — gère les 3 groupes pour l'admin, 1 seul groupe pour un joueur
          const chatRole2 = (st.users[user]||{}).role;
          const myChatGroups = isAdmin ? ["famille","collegues","externe"] : (chatRole2==="famille"||chatRole2==="collegues"||chatRole2==="externe" ? [chatRole2] : []);
          const seenForUser = (st.seenChat||{})[user];
          const getSeenCount = (g) => {
            if (typeof seenForUser === "number") return g===chatRole2 ? seenForUser : 0; // ancien format
            return (seenForUser||{})[g] || 0;
          };
          const newChatMsgs = n.k==="chat" && myChatGroups.some(g => (((st.chat||{})[g]||[]).length) > getSeenCount(g));
          // Badge défis reçus en attente (invitations) + mon tour de jouer, sur l'onglet Jeux
          const pendingChallenges = n.k==="jeux"
            ? Object.values(st.challenges||{}).filter(c=>
                (c.to===user&&c.status==="pending") ||
                (c.status==="accepted"&&((c.from===user&&c.fromScore===null)||(c.to===user&&c.toScore===null))) ||
                (c.game==="penalty"&&c.status==="active"&&c.tireur!=null&&!(c.pick||{})[user])
              ).length
            : 0;
          return (
            <button key={n.k} style={{...t.nbtn,...(isOn?t.nbtnOn:{})}} onClick={()=>{
              setTab(n.k);
              // Marquer les messages comme vus quand on clique sur Chat (tous les groupes visibles pour l'admin)
              if (n.k==="chat" && myChatGroups.length) {
                const seenObj = typeof seenForUser==="object" && seenForUser ? seenForUser : {};
                const updated = {...seenObj};
                myChatGroups.forEach(g => { updated[g] = ((st.chat||{})[g]||[]).length; });
                // 🛡️ Écriture Firebase ATOMIQUE — ne touche QUE seenChat/<user>
                // (avant : persistFirebase(ns) réécrivait TOUT st et pouvait
                // écraser des scores saisis juste avant par un autre utilisateur)
                setSt(prev => ({...prev, seenChat:{...(prev.seenChat||{}),[user]:updated}}));
                try { localStorage.setItem(KEY, JSON.stringify({...st, seenChat:{...(st.seenChat||{}),[user]:updated}})); } catch(e) {}
                if (FB_ENABLED && _fbReady) {
                  _fbUpdate("/", { [`seenChat/${user}`]: updated }).catch(e => console.warn("seenChat (nav) Firebase write error:", e));
                }
              }
            }}>
              <div style={{position:"relative",display:"inline-block"}}>
                <span style={{fontSize:22,animation:isOn&&n.k==="poules"?"ballBounce 1.5s ease-in-out infinite":"none",filter:isOn?`drop-shadow(0 0 6px ${GOLD})`:"none"}}>{n.l}</span>
                {waitingCount>0&&(
                  <span style={{position:"absolute",top:-4,right:-6,background:RED,color:"#fff",borderRadius:10,fontSize:9,fontWeight:800,padding:"1px 5px",minWidth:14,textAlign:"center",lineHeight:"14px"}}>
                    {waitingCount}
                  </span>
                )}
                {pendingChallenges>0&&(
                  <span style={{position:"absolute",top:-4,right:-6,background:RED,color:"#fff",borderRadius:10,fontSize:9,fontWeight:800,padding:"1px 5px",minWidth:14,textAlign:"center",lineHeight:"14px"}}>
                    {pendingChallenges}
                  </span>
                )}
                {newChatMsgs&&!isOn&&(
                  <span style={{position:"absolute",top:-3,right:-4,width:9,height:9,background:GREEN,borderRadius:"50%",border:"1.5px solid #0a0e1a"}}/>
                )}
              </div>
              <span>{n.lbl}</span>
            </button>
          );
        })}
      </div>

      {/* ÉCRAN RÉSULTATS */}
      {resultsScreen && (
        <div style={{
          position:"fixed",inset:0,zIndex:1500,
          background:"rgba(7,7,15,.95)",
          display:"flex",flexDirection:"column",
          overflow:"auto",
          animation:"slideUp .4s ease"
        }}>
          {/* Header */}
          <div style={{
            background:"linear-gradient(135deg,#1a0e00,#0d0d1a)",
            borderBottom:`1px solid ${BRD}`,
            padding:"20px 16px 16px",
            textAlign:"center",
            flexShrink:0
          }}>
            <div style={{fontSize:11,color:MUTED,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
              Nouveaux résultats
            </div>
            <div style={{fontSize:22,fontWeight:900,color:GOLD}}>
              {resultsScreen.correct.length > 0 && resultsScreen.wrong.length === 0
                ? "🔥 Parfait !"
                : resultsScreen.correct.length > resultsScreen.wrong.length
                ? "👍 Bonne session !"
                : resultsScreen.correct.length === 0
                ? "😬 Pas de chance..."
                : "📊 Résultats mixtes"
              }
            </div>
            {/* Score session */}
            <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:12}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32,fontWeight:900,color:GREEN}}>{resultsScreen.correct.length}</div>
                <div style={{fontSize:10,color:MUTED}}>bon{resultsScreen.correct.length>1?"s":""}</div>
              </div>
              <div style={{fontSize:28,color:BRD,lineHeight:"42px"}}>|</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32,fontWeight:900,color:RED}}>{resultsScreen.wrong.length}</div>
                <div style={{fontSize:10,color:MUTED}}>raté{resultsScreen.wrong.length>1?"s":""}</div>
              </div>
              <div style={{fontSize:28,color:BRD,lineHeight:"42px"}}>|</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32,fontWeight:900,color:GOLD}}>+{resultsScreen.correct.length*3}</div>
                <div style={{fontSize:10,color:MUTED}}>pts</div>
              </div>
            </div>
          </div>

          {/* Liste des matchs */}
          <div style={{flex:1,padding:"12px 16px",maxWidth:480,margin:"0 auto",width:"100%"}}>

            {resultsScreen.correct.length > 0 && (
              <>
                <div style={{fontSize:11,fontWeight:700,color:GREEN,textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:4}}>
                  ✓ Bons pronostics
                </div>
                {resultsScreen.correct.map(m => {
                  const rH = resolveForPlayer(m.home, m.id, "home");
                  const rA = resolveForPlayer(m.away, m.id, "away");
                  const sc = (st.scores||{})[m.id];
                  return (
                    <div key={m.id} style={{
                      display:"flex",alignItems:"center",justifyContent:"space-between",
                      background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",
                      borderRadius:12,padding:"10px 12px",marginBottom:8
                    }}>
                      <div style={{fontSize:13,fontWeight:700}}>
                        {F(rH)} {rH} <span style={{color:MUTED,fontSize:11}}>vs</span> {rA} {F(rA)}
                      </div>
                      <div style={{fontSize:14,fontWeight:900,color:GREEN}}>
                        {sc ? scoreLabel(sc) : preds[m.id]} +{PHASE_POINTS[m.phase]??1}pts
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {resultsScreen.wrong.length > 0 && (
              <>
                <div style={{fontSize:11,fontWeight:700,color:RED,textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:12}}>
                  ✗ Pronostics ratés
                </div>
                {resultsScreen.wrong.map(m => {
                  const rH = resolveForPlayer(m.home, m.id, "home");
                  const rA = resolveForPlayer(m.away, m.id, "away");
                  const sc = (st.scores||{})[m.id];
                  return (
                    <div key={m.id} style={{
                      display:"flex",alignItems:"center",justifyContent:"space-between",
                      background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.2)",
                      borderRadius:12,padding:"10px 12px",marginBottom:8
                    }}>
                      <div style={{fontSize:13,fontWeight:700}}>
                        {F(rH)} {rH} <span style={{color:MUTED,fontSize:11}}>vs</span> {rA} {F(rA)}
                      </div>
                      <div style={{fontSize:12,color:RED,fontWeight:700}}>
                        {sc ? scoreLabel(sc) : st.results[m.id]}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Bouton fermer */}
          <div style={{padding:"16px",flexShrink:0,maxWidth:480,margin:"0 auto",width:"100%"}}>
            <button style={t.btnGold} onClick={()=>setResultsScreen(null)}>
              Voir mon classement 📊
            </button>
          </div>
        </div>
      )}

      {/* TROPHY 3D */}
      {showTrophy && <Trophy3D onClose={()=>setShowTrophy(false)} />}
      {showConsolation && <ConsolationOverlay onClose={()=>setShowConsolation(null)} winnerName={showConsolation.winnerName} modeLabel={showConsolation.modeLabel} />}
      {showBestPredictor && <BestPredictorOverlay onClose={()=>setShowBestPredictor(null)} totalPts={showBestPredictor.totalPts} groupLabel={showBestPredictor.groupLabel} />}

      {/* EASTER EGG MODAL — En-dehors du conteneur home pour s'afficher immédiatement */}
      {eggActive && (
        <div style={{
          position:"fixed",inset:0,zIndex:99999,
          background:"linear-gradient(135deg,#0a0020,#200040,#0a0020)",
          display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",
          gap:20,padding:32,
          animation:"slideUp .5s cubic-bezier(.34,1.56,.64,1)"
        }}>
          <div style={{ display:"flex", gap:16, alignItems:"center", marginBottom:4 }}>
            <div style={{ fontSize:64, animation:"eggPop .6s cubic-bezier(.34,1.56,.64,1) forwards" }}>⚽</div>
            <div style={{ fontSize:64, animation:"eggPop .6s cubic-bezier(.34,1.56,.64,1) .15s both" }}>🏆</div>
            <div style={{ fontSize:64, animation:"eggPop .6s cubic-bezier(.34,1.56,.64,1) .3s both" }}>⚽</div>
          </div>

          <div style={{
            textAlign:"center",
            animation:"eggMsg .5s ease .4s both",
          }}>
            <div style={{fontSize:11,color:"#a78bfa",fontWeight:700,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>
              🥚 Easter Egg trouvé !
            </div>
            <div style={{
              fontSize:22,fontWeight:900,color:"#fff",marginBottom:8,lineHeight:1.2
            }}>Tu as trouvé le secret ! 🎉</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.6)",lineHeight:1.7,maxWidth:260}}>
              Félicitations, curieux(se) ! 🕵️‍♂️<br/>
              Ce tournoi de pronos a été conçu avec ❤️<br/>
              Bonne chance pour la Coupe du Monde !<br/>
              <span style={{color:"#F5C842",fontWeight:700}}>⚽ FIFA World Cup 2026 ⚽</span>
            </div>
          </div>

          <div style={{
            background:"rgba(255,255,255,.05)",
            border:"1px solid rgba(255,255,255,.15)",
            borderRadius:16,padding:"12px 20px",
            textAlign:"center",maxWidth:300,width:"100%",
            animation:"eggMsg .5s ease .7s both",
          }}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:8}}>Les 48 équipes qualifiées</div>
            <div style={{fontSize:22,lineHeight:1.6,letterSpacing:2}}>
              {"🇲🇽🇿🇦🇰🇷🇨🇿🇨🇦🇧🇦🇺🇸🇵🇾🇶🇦🇨🇭🇧🇷🇲🇦🇭🇹🇦🇺🇹🇷🇩🇪🇨🇼🇳🇱🇯🇵🇨🇮🇪🇨🇸🇪🇹🇳🇪🇸🇨🇻🇧🇪🇪🇬🇸🇦🇺🇾🇮🇷🇳🇿🇫🇷🇸🇳🇮🇶🇳🇴🇦🇷🇩🇿🇦🇹🇯🇴🇵🇹🇨🇩🇭🇷🇬🇭🇵🇦🇺🇿🇨🇴"}
            </div>
          </div>

          <button
            onClick={()=>{ setEggActive(false); stopEggMusic(); if(!_isMuted){ setTimeout(()=>{ if(musicSource==="mp3"){mp3LoopMode=playMode==="loop";playMp3(mp3Idx,mp3LoopMode);}else{try{_getMusicCtx();playBgMusic();}catch(e){}} },200); } }}
            style={{
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
              border:"none",color:"#fff",
              borderRadius:14,padding:"13px 32px",
              fontSize:15,fontWeight:800,
              cursor:"pointer",fontFamily:"inherit",
              animation:"eggMsg .5s ease 1s both",
              boxShadow:"0 4px 20px rgba(124,58,237,.4)",
            }}>
            Fermer 🎮
          </button>
        </div>
      )}

      {/* NOTIFICATION TOAST */}
      {notification && (
        <div style={{
          position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)",
          zIndex:5000,
          animation:"slideUp .3s ease",
          maxWidth:320, width:"calc(100% - 40px)"
        }}>
          <div style={{
            borderRadius:12, padding:"13px 16px",
            fontSize:13, fontWeight:600,
            display:"flex", alignItems:"center", gap:10,
            background: notification.type === "error" 
              ? "rgba(239,68,68,.95)" 
              : notification.type === "success"
              ? "rgba(34,197,94,.95)"
              : "rgba(59,130,246,.95)",
            color:"#fff",
            backdropFilter:"blur(8px)",
            border: notification.type === "error"
              ? "1px solid rgba(239,68,68,.5)"
              : notification.type === "success"
              ? "1px solid rgba(34,197,94,.5)"
              : "1px solid rgba(59,130,246,.5)",
            boxShadow:"0 4px 16px rgba(0,0,0,.3)",
            lineHeight:1.4
          }}>
            <span>{notification.type === "error" ? "❌" : notification.type === "success" ? "✅" : "ℹ️"}</span>
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      {/* MODAL */}
      {modal && (
        <div style={t.overlay} onClick={()=>setModal(false)}>
          <div style={t.mbox} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:48}}>🔒</div>
            <div style={t.mtitle}>Verrou Final</div>
            <div style={t.mtext}>
              Action <strong style={{color:TXT}}>irréversible</strong>.<br/><br/>
              Plus aucune modification possible, mais tu pourras revenir consulter tes scores en temps réel.
            </div>
            <div style={t.mbtns}>
              <button style={t.bCancel} onClick={()=>setModal(false)}>Annuler</button>
              <button style={t.bConfirm} onClick={doLock}>Confirmer 🔒</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
