// blackjack-cards.js – bộ bài 52 lá: DỮ LIỆU (M1) + VẼ LÁ BÀI bằng HTML/CSS/SVG tự sinh (M2). Không dùng ảnh ngoài nào.
// Phần dữ liệu không đụng DOM, không phụ thuộc module QuizWheel nào; chạy được cả trong trình duyệt (window) lẫn Node (để test).
// Phần vẽ (createCardElement...) chỉ chạy khi có document. Mọi chuỗi HTML bên dưới là hằng do mình viết, không chèn dữ liệu người dùng.
(function (root) {
  "use strict";

  const SUITS = Object.freeze(["spades", "hearts", "diamonds", "clubs"]);
  const RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
  const SUIT_COLOR = Object.freeze({ spades: "black", clubs: "black", hearts: "red", diamonds: "red" });

  // Giá trị gốc của lá: A = 11 (engine tự hạ xuống 1 khi cần), J/Q/K = 10
  function rankValue(rank) {
    if (rank === "A") return 11;
    if (rank === "J" || rank === "Q" || rank === "K") return 10;
    const n = Number(rank);
    return n >= 2 && n <= 10 ? n : NaN;
  }

  function makeCard(suit, rank) {
    return Object.freeze({ id: suit + "-" + rank, suit: suit, rank: rank, value: rankValue(rank), color: SUIT_COLOR[suit] });
  }

  // 52 lá dựng đúng một lần; mọi bộ bài đều dùng lại các đối tượng đóng băng này (không ai sửa được lá bài)
  const ALL = [];
  const BY_ID = Object.create(null);
  SUITS.forEach(function (s) {
    RANKS.forEach(function (r) { const c = makeCard(s, r); ALL.push(c); BY_ID[c.id] = c; });
  });
  Object.freeze(ALL);

  // Một bộ bài mới, chưa xáo (mảng mới, sửa thoải mái không ảnh hưởng bộ khác)
  function createDeck() { return ALL.slice(); }

  // Tra lá bài theo id ("spades-A"); không có thì trả null
  function getCard(id) { return typeof id === "string" && BY_ID[id] ? BY_ID[id] : null; }

  // Số ngẫu nhiên [0,1): ưu tiên crypto, không có thì Math.random. Có thể thay bằng rng giả (cho test)
  function defaultRng() {
    const c = root.crypto;
    if (c && typeof c.getRandomValues === "function") {
      const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296;
    }
    return Math.random();
  }

  // Fisher-Yates. Trả về mảng MỚI, không sửa mảng truyền vào
  function shuffle(cards, rng) {
    const rand = typeof rng === "function" ? rng : defaultRng;
    const a = cards.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rand() * (i + 1)));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }


  // ================= VẼ LÁ BÀI (M2) =================
  // Cấu trúc một lá: .bj-card > .bj-card-inner > (.bj-face.bj-front + .bj-face.bj-back). Lật 3D = xoay .bj-card-inner (CSS .is-down).
  // Kích thước theo --bj-card-w (CSS); mọi thứ bên trong dùng đơn vị em nên co giãn theo lá.
  const SUIT_PATHS = {
    hearts: '<path d="M50 93C14 66 4 42 14 24 24 8 44 12 50 30 56 12 76 8 86 24 96 42 86 66 50 93Z"/>',
    diamonds: '<path d="M50 4C62 24 76 38 90 50 76 62 62 76 50 96 38 76 24 62 10 50 24 38 38 24 50 4Z"/>',
    spades: '<path d="M50 5C74 30 92 44 92 63 92 78 74 84 60 74 60 84 64 90 72 95L28 95C36 90 40 84 40 74 26 84 8 78 8 63 8 44 26 30 50 5Z"/>',
    clubs: '<circle cx="50" cy="27" r="20"/><circle cx="26" cy="62" r="20"/><circle cx="74" cy="62" r="20"/><circle cx="50" cy="52" r="13"/><path d="M50 48C50 70 46 86 36 95L64 95C54 86 50 70 50 48Z"/>'
  };
  function suitSvg(suit, cls) {
    return '<svg class="' + (cls || "bj-suit") + '" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">' + SUIT_PATHS[suit] + "</svg>";
  }

  // Vị trí các biểu tượng (x%, y%) trong vùng giữa lá; y > 50 thì lật ngược như bài thật
  const PIPS = {
    "2": [[50, 14], [50, 86]],
    "3": [[50, 14], [50, 50], [50, 86]],
    "4": [[26, 14], [74, 14], [26, 86], [74, 86]],
    "5": [[26, 14], [74, 14], [50, 50], [26, 86], [74, 86]],
    "6": [[26, 14], [74, 14], [26, 50], [74, 50], [26, 86], [74, 86]],
    "7": [[26, 14], [74, 14], [50, 32], [26, 50], [74, 50], [26, 86], [74, 86]],
    "8": [[26, 14], [74, 14], [50, 32], [26, 50], [74, 50], [50, 68], [26, 86], [74, 86]],
    "9": [[26, 11], [74, 11], [26, 37], [74, 37], [50, 50], [26, 63], [74, 63], [26, 89], [74, 89]],
    "10": [[26, 11], [74, 11], [50, 24], [26, 37], [74, 37], [26, 63], [74, 63], [50, 76], [26, 89], [74, 89]]
  };

  // Chân dung J / Q / K vẽ bằng SVG (viewBox 60x60). Áo lấy màu chất bài (currentColor), mão/viền vàng, hoa mai cho Q.
  const INK = "#3a1000", GOLD = "#e7bd62", SK = 'stroke="' + INK + '" stroke-width="1.2" stroke-linejoin="round"';
  const FACE_BASE = '<path d="M4 60C6 46 18 41 30 41 42 41 54 46 56 60Z" fill="currentColor" ' + SK + '/>' +
    '<path d="M22 42 30 53 38 42Z" fill="' + GOLD + '" ' + SK + '/><path d="M9 56H51" stroke="' + GOLD + '" stroke-width="2" stroke-linecap="round"/>' +
    '<rect x="26" y="34" width="8" height="10" fill="#e9bd8a"/>';
  const FACE_HEAD = '<ellipse cx="30" cy="27" rx="10" ry="11.5" fill="#f7d9b0" ' + SK + '/>' +
    '<circle cx="26" cy="26" r="1.4" fill="' + INK + '"/><circle cx="34" cy="26" r="1.4" fill="' + INK + '"/>' +
    '<circle cx="23.5" cy="30" r="2.2" fill="#ff8a7a" opacity=".5"/><circle cx="36.5" cy="30" r="2.2" fill="#ff8a7a" opacity=".5"/>' +
    '<path d="M27 33Q30 35.6 33 33" fill="none" stroke="#a1301f" stroke-width="1.3" stroke-linecap="round"/>';
  const PETALS = [[0, -3.4], [3.2, -1.05], [2, 2.75], [-2, 2.75], [-3.2, -1.05]].map(function (p) {
    return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.8" fill="#ffd21f" stroke="' + INK + '" stroke-width=".8"/>';
  }).join("");
  const PORTRAITS = {
    K: '<path d="M19 28C19 46 25 49 30 49 35 49 41 46 41 28Z" fill="#5b3a1e" ' + SK + '/>' + FACE_BASE + FACE_HEAD +
      '<path d="M23 31Q30 27.5 37 31Q30 33.5 23 31Z" fill="#5b3a1e"/>' +
      '<path d="M17 19 18 6 25 13 30 3 35 13 42 6 43 19Z" fill="' + GOLD + '" ' + SK + '/><path d="M17 19H43V23H17Z" fill="#c92f32" ' + SK + '/>' +
      '<circle cx="30" cy="10" r="1.9" fill="#c92f32"/><circle cx="21.5" cy="12" r="1.2" fill="#c92f32"/><circle cx="38.5" cy="12" r="1.2" fill="#c92f32"/>',
    Q: '<path d="M17 30C13 14 22 10 30 10 38 10 47 14 43 30L43 44 38 39 22 39 17 44Z" fill="#2b1a10" ' + SK + '/>' + FACE_BASE + FACE_HEAD +
      '<path d="M19 23C22 14 38 14 41 23 36 18 24 18 19 23Z" fill="#2b1a10"/>' +
      '<path d="M20 15 22 8 26 12 30 5 34 12 38 8 40 15Z" fill="' + GOLD + '" ' + SK + '/><circle cx="30" cy="10" r="1.5" fill="#c92f32"/>' +
      '<g transform="translate(46 21)">' + PETALS + '<circle r="1.8" fill="#ff8a1f" stroke="' + INK + '" stroke-width=".6"/></g>',
    J: FACE_BASE + FACE_HEAD +
      '<path d="M19 24 19 33 22.5 28Z M41 24 41 33 37.5 28Z" fill="#2b1a10"/>' +
      '<path d="M17 22C17 6 43 6 43 22Z" fill="currentColor" ' + SK + '/><rect x="15" y="20" width="30" height="4.5" rx="2.2" fill="' + GOLD + '" ' + SK + '/>' +
      '<path d="M39 12C48 0 58 4 57 15 51 11 46 12 41 17Z" fill="' + GOLD + '" ' + SK + '/><path d="M43 12Q50 7 54 10" fill="none" stroke="' + INK + '" stroke-width=".9"/>'
  };
  function portraitSvg(rank) { return '<svg class="bj-portrait" viewBox="0 0 60 60" aria-hidden="true" focusable="false">' + PORTRAITS[rank] + "</svg>"; }

  function cornerHtml(card, extra) {
    return '<div class="bj-corner' + (extra ? " " + extra : "") + '"><span class="bj-rank">' + card.rank + "</span>" + suitSvg(card.suit) + "</div>";
  }

  function frontHtml(card) {
    let center;
    if (card.rank === "A") {
      center = '<div class="bj-pips"><span class="bj-pip bj-ace" style="left:50%;top:50%">' + suitSvg(card.suit) + "</span></div>";
    } else if (PIPS[card.rank]) {
      center = '<div class="bj-pips' + (PIPS[card.rank].length >= 7 ? " dense" : "") + '">' + PIPS[card.rank].map(function (p) {
        return '<span class="bj-pip' + (p[1] > 50 ? " inv" : "") + '" style="left:' + p[0] + "%;top:" + p[1] + '%">' + suitSvg(card.suit) + "</span>";
      }).join("") + "</div>";
    } else { // J, Q, K: khung vàng, hai nửa đối xứng như bài thật
      const half = function (cls) {
        return '<div class="bj-half ' + cls + '">' + portraitSvg(card.rank) + "</div>";
      };
      center = '<div class="bj-court">' + half("a") + half("b") + "</div>";
    }
    return cornerHtml(card) + cornerHtml(card, "br") + center;
  }

  // Mặt sau: nền đỏ, viền vàng, lưới kim cương (CSS) + huy hiệu hoa mai ở giữa (SVG)
  const BACK_HTML = '<svg class="bj-emblem" viewBox="0 0 60 60" aria-hidden="true" focusable="false">' +
    '<circle cx="30" cy="30" r="27" fill="#a8191c" stroke="' + GOLD + '" stroke-width="2.5"/><circle cx="30" cy="30" r="21.5" fill="none" stroke="' + GOLD + '" stroke-width="1" stroke-dasharray="2 3"/>' +
    '<g transform="translate(30 30) scale(2.4)">' + PETALS + '<circle r="2" fill="#c92f32" stroke="' + INK + '" stroke-width=".6"/></g></svg>';

  // Độ nghiêng nhẹ cố định theo id (không ngẫu nhiên mỗi lần vẽ): -2.8° .. +2.8°
  function tiltFor(key) {
    let h = 0; key = String(key);
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
    return (((h % 9) - 4) * 0.7).toFixed(1) + "deg";
  }

  // Gắn / đổi mặt trước cho một phần tử lá (dùng khi lá úp của nhà cái được tiết lộ). card = null -> mặt trước trống
  function setCardFace(el, card) {
    const front = el.querySelector(".bj-front");
    if (!card || card.hidden) {
      front.innerHTML = ""; el.removeAttribute("data-id"); el.removeAttribute("data-suit"); el.removeAttribute("data-rank"); el.removeAttribute("aria-label");
      el.dataset.color = "black"; return el;
    }
    front.innerHTML = frontHtml(card);
    el.dataset.id = card.id; el.dataset.suit = card.suit; el.dataset.rank = card.rank; el.dataset.color = card.color;
    el.setAttribute("aria-label", card.rank + " " + card.suit);
    el.style.setProperty("--rot", tiltFor(card.id));
    return el;
  }

  // Tạo lá bài. opts.faceDown: úp. card = null (hoặc {hidden:true}): lá chưa biết mặt, dùng cho lá úp / bộ bài
  function createCardElement(card, opts) {
    const el = document.createElement("div");
    el.className = "bj-card" + (opts && opts.faceDown ? " is-down" : "");
    el.setAttribute("role", "img");
    el.innerHTML = '<div class="bj-card-inner"><div class="bj-face bj-front"></div><div class="bj-face bj-back">' + BACK_HTML + "</div></div>";
    setCardFace(el, card);
    if (!card || card.hidden) el.style.setProperty("--rot", tiltFor("x" + Math.random()));
    return el;
  }
  // Lá úp độc lập (bộ bài giữa bàn)
  function createBackElement() { return createCardElement(null, { faceDown: true }); }

  const api = { SUITS: SUITS, RANKS: RANKS, createDeck: createDeck, shuffle: shuffle, getCard: getCard, rankValue: rankValue };
  if (typeof document !== "undefined") { api.createCardElement = createCardElement; api.createBackElement = createBackElement; api.setCardFace = setCardFace; }
  // Gộp vào đối tượng có sẵn để file vẽ bài (M2) bổ sung thêm createCardElement / createBackElement
  root.BlackjackCards = Object.assign(root.BlackjackCards || {}, api);
  if (typeof module !== "undefined" && module.exports) module.exports = root.BlackjackCards;
})(typeof window !== "undefined" ? window : globalThis);
