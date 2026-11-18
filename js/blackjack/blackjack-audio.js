// blackjack-audio.js – ÂM THANH Blackjack (M4). Tự tổng hợp bằng Web Audio (không có file âm thanh mới).
// Dùng chung âm lượng / tắt tiếng của QuizWheel: đọc Settings.sound() (0..1) mỗi lần phát; =0 là im lặng. KHÔNG có thiết lập âm lượng riêng.
// Tiếng "click" của nút do js/audio.js (Sfx) lo như mọi nút khác; file này chỉ lo tiếng bài và kết quả.
// API: play(name) với name = "deal" | "land" | "flip" | "collect" | "win" | "blackjack" | "lose" | "push".  Nối vào hoạt ảnh bằng BlackjackAnimation.setSfx.
(function (root) {
  "use strict";
  let ctx = null, noise = null;

  function volume() { return root.Settings && typeof root.Settings.sound === "function" ? root.Settings.sound() : 0.7; }

  function context() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = null; }
    return ctx;
  }

  function noiseBuffer(c) { // 0.3s nhiễu trắng dùng chung cho tiếng sột soạt của bài
    if (noise) return noise;
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  // Tiếng sột soạt: nhiễu lọc dải, tắt dần
  function swish(c, t0, dur, freq, gain) {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuffer(c); f.type = "bandpass"; f.frequency.setValueAtTime(freq, t0); f.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur); f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0, Math.random() * 0.1, dur + 0.02);
  }
  // Một nốt ngắn (sóng sin/tam giác) có bao hình
  function tone(c, t0, freq, dur, gain, type) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "triangle"; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  }

  const SOUNDS = {
    deal: function (c, t, v) { swish(c, t, 0.16, 2600, 0.5 * v); },
    land: function (c, t, v) { tone(c, t, 170, 0.07, 0.28 * v, "sine"); swish(c, t, 0.05, 900, 0.25 * v); },
    flip: function (c, t, v) { swish(c, t, 0.2, 3200, 0.45 * v); tone(c, t + 0.17, 220, 0.06, 0.18 * v, "sine"); },
    collect: function (c, t, v) { swish(c, t, 0.35, 2000, 0.35 * v); },
    win: function (c, t, v) { [523.25, 659.25, 783.99].forEach(function (f, i) { tone(c, t + i * 0.09, f, 0.28, 0.3 * v); }); },
    blackjack: function (c, t, v) { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(c, t + i * 0.085, f, 0.34, 0.3 * v); }); tone(c, t + 0.45, 2093, 0.4, 0.1 * v, "sine"); },
    lose: function (c, t, v) { tone(c, t, 233.08, 0.26, 0.28 * v); tone(c, t + 0.17, 174.61, 0.38, 0.28 * v); },
    push: function (c, t, v) { tone(c, t, 392, 0.2, 0.24 * v); tone(c, t + 0.14, 392, 0.26, 0.24 * v); }
  };

  function play(name) {
    const v = volume();
    if (!(v > 0) || !SOUNDS[name]) return;           // tắt tiếng / âm lượng 0 -> im
    const c = context();
    if (!c) return;
    try {
      if (c.state !== "running") c.resume();
      SOUNDS[name](c, c.currentTime + 0.005, v);
    } catch (e) { /* âm thanh không bao giờ được làm hỏng ván chơi */ }
  }

  root.BlackjackAudio = { play: play };
})(typeof window !== "undefined" ? window : globalThis);
