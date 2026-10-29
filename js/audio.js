// audio.js – nhạc nền (Music) và hiệu ứng (Sound). Âm lượng lấy từ Settings.music() / Settings.sound() (0..1).
// Đặt tên "Sfx" vì "Audio" đã là đối tượng có sẵn của trình duyệt.
// Trình duyệt chặn tự phát âm thanh trước khi người dùng chạm vào trang, nên nhạc nền sẽ bắt đầu ở lần chạm/bấm phím đầu tiên.
(function () {
  const MUSIC_SRC = "assets/music/ryukyuvania.mp3";
  const MUSIC_SCREENS = ["home", "settings", "levels"];            // màn hình có nhạc nền
  const SFX = { click: "assets/sounds/click.mp3", cat: "assets/sounds/cat-laugh.mp3",
                 wow: "assets/sounds/anime-wow.mp3", omg: "assets/sounds/oh-my-god.mp3" };
  const WRONG = ["assets/sounds/bruh.mp3", "assets/sounds/shocked.mp3", "assets/sounds/fart.mp3"];
  // Chỉ những phần tử này mới kêu "click"; ô nhập chữ và thanh trượt thì không
  const CLICKABLE = 'button, a[href], select, label.file-label, input[type="file"], input[type="color"], input[type="radio"], input[type="checkbox"], [role="tab"]';

  let music = null, wantMusic = false, bag = [], lastClick = 0;
  let ctx = null;                       // Web Audio: giải mã sẵn âm thanh vào bộ nhớ -> phát gần như tức thì
  const buffers = {};                   // src -> AudioBuffer
  const pools = {};                     // dự phòng (mở bằng file://, fetch bị chặn): vài thẻ <audio> đã nạp sẵn / mỗi tiếng

  function sound() { return window.Settings ? Settings.sound() : 0.7; }
  function musicVol() { return window.Settings ? Settings.music() : 0.7; }

  function allSfx() { return Object.keys(SFX).map(function (k) { return SFX[k]; }).concat(WRONG); }

  function preload() {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { if (AC) ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = null; }
    allSfx().forEach(function (src) {
      // Dự phòng luôn được dựng sẵn
      pools[src] = { i: 0, list: [0, 1, 2].map(function () { const a = new Audio(src); a.preload = "auto"; return a; }) };
      if (!ctx || !window.fetch) return;
      fetch((window.SFX_DATA && window.SFX_DATA[src]) || src).then(function (r) { return r.arrayBuffer(); })
        .then(function (data) { return new Promise(function (ok, no) { ctx.decodeAudioData(data, ok, no); }); })
        .then(function (buf) { buffers[src] = buf; })
        .catch(function () {});         // không được thì cứ dùng dự phòng
    });
  }

  function play(src) {
    const v = sound();
    if (v <= 0) return;
    try {
      if (ctx && buffers[src]) {
        if (ctx.state !== "running") ctx.resume();
        const node = ctx.createBufferSource(), gain = ctx.createGain();
        node.buffer = buffers[src]; gain.gain.value = v;
        node.connect(gain); gain.connect(ctx.destination);
        node.start(0);
        return;
      }
      const pool = pools[src];
      const a = pool ? pool.list[pool.i++ % pool.list.length] : new Audio(src);
      a.volume = v; a.currentTime = 0;
      const p = a.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  // Bốc ngẫu nhiên 1 trong 3 âm thanh trả lời sai: xáo cả "túi" rồi lấy lần lượt,
  // nên không bao giờ lặp 1 âm 2 lần liên tiếp và 3 lần sai liền sẽ nghe đủ cả 3.
  function wrong() {
    if (bag.length === 0) {
      bag = WRONG.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    play(bag.pop());
  }

  function syncMusic() {
    const v = musicVol();
    music.volume = v;
    if (wantMusic && v > 0) { if (!music.paused) return; const p = music.play(); if (p && p.catch) p.catch(function () {}); }   // bị chặn -> chờ lần chạm đầu tiên
    else music.pause();
  }

  window.Sfx = {
    init() {
      music = new Audio(MUSIC_SRC); music.loop = true; music.preload = "auto"; music.load();   // bắt đầu tải bài nhạc ngay khi vào web
      preload();
      // Nhạc nền: thử phát ngay, nếu bị chặn thì phát ở lần tương tác đầu tiên
      function unlock() { syncMusic(); if (ctx && ctx.state !== "running") ctx.resume(); }
      ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, unlock, { once: true, capture: true }); });
      // Tiếng click cho mọi phần tử bấm được (capture: kêu cả khi nút tự chuyển màn hình)
      // Mỗi lần bấm chỉ kêu 1 lần: chuột/chạm kêu ở pointerdown (nhanh nhất), rồi sự kiện click đi kèm bị bỏ qua.
      // Bàn phím (Enter/Space) không có pointerdown nên kêu ở click.
      let pressed = false;
      function target(e) {
        const el = e.target.closest && e.target.closest(CLICKABLE);
        return el && !el.disabled ? el : null;
      }
      document.addEventListener("pointerdown", function (e) {
        pressed = false;
        if (!target(e)) return;
        pressed = true; lastClick = performance.now(); play(SFX.click);
      }, true);
      document.addEventListener("click", function (e) {
        if (!target(e)) return;
        if (pressed) { pressed = false; return; }                         // đã kêu lúc pointerdown
        const now = performance.now();
        if (now - lastClick < 400) return;                                // nhãn "Nhập file" bắn thêm 1 click lên ô input
        lastClick = now; play(SFX.click);
      }, true);
      document.addEventListener("keydown", function () { pressed = false; }, true);
    },
    screen(name) { wantMusic = MUSIC_SCREENS.indexOf(name) >= 0; syncMusic(); },   // gọi mỗi lần đổi màn hình
    refresh() { if (music) syncMusic(); },                                           // gọi khi kéo thanh âm lượng
    click() { play(SFX.click); },
    wrong: wrong,
    catLaugh() { play(SFX.cat); },
    wow() { play(SFX.wow); },                         // quay xong vòng quay
    omg() { play(SFX.omg); }                          // thắng lớn ở mức Impossible
  };
})();
