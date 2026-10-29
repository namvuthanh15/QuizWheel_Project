// settings.js – màn hình Setting: thanh Sound / Music (icon loa / nốt nhạc, kéo trái -> phải).
// Kéo về sát trái (0) thì icon đổi sang dạng tắt tiếng. Bấm icon để tắt / bật lại (nhớ mức trước đó).
// Âm lượng lưu ở Store; nơi phát âm thanh/nhạc đọc qua Settings.sound() / Settings.music() (0..1).
(function () {
  const IMG = "assets/images/";
  const KINDS = {
    sound: { on: "icon-speaker.png", off: "icon-speaker-mute.png" },
    music: { on: "icon-music.png", off: "icon-music-mute.png" }
  };
  let vol = { sound: 70, music: 70 };
  const last = { sound: 70, music: 70 };            // mức trước khi tắt, để bấm icon bật lại

  function paint(kind) {
    const slider = UI.$("#vol-" + kind);
    slider.value = vol[kind];
    slider.style.setProperty("--fill", vol[kind] + "%");
    UI.$("#vol-" + kind + "-icon").src = IMG + (vol[kind] === 0 ? KINDS[kind].off : KINDS[kind].on);
  }
  function set(kind, v, persist) {
    vol[kind] = Math.min(100, Math.max(0, Math.round(Number(v)) || 0));
    if (vol[kind] > 0) last[kind] = vol[kind];
    paint(kind);
    if (persist) Store.saveAudio(vol);
    if (window.Sfx) Sfx.refresh();                 // áp dụng ngay cho nhạc nền đang phát
  }

  window.Settings = {
    init() {
      vol = Store.loadAudio();
      ["sound", "music"].forEach(function (kind) {
        if (vol[kind] > 0) last[kind] = vol[kind];
        paint(kind);
        UI.$("#vol-" + kind).addEventListener("input", function (e) { set(kind, e.target.value, false); });
        UI.$("#vol-" + kind).addEventListener("change", function (e) { set(kind, e.target.value, true); if (kind === "sound" && window.Sfx) Sfx.click(); });   // nghe thử mức Sound
        UI.$("#vol-" + kind + "-btn").addEventListener("click", function () { set(kind, vol[kind] === 0 ? last[kind] : 0, true); });
      });
    },
    sound() { return vol.sound / 100; },
    music() { return vol.music / 100; }
  };
})();
