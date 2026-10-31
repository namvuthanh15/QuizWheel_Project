// Dữ liệu câu hỏi tách khỏi logic game.
// Demo dùng file .js vì mở trực tiếp index.html (file://) thì trình duyệt chặn fetch() file JSON.
// Ở milestone sau sẽ chuyển sang questions.json khi chạy bằng server cục bộ.
window.QUIZ_DATA = [
  { id: 1, text: "Trong C++, từ khóa nào khai báo hằng số?", answers: ["const", "static", "final", "define"], correct: 0, explain: "const khai báo giá trị không đổi." },
  { id: 2, text: "Ngôn ngữ nào chạy trực tiếp trong trình duyệt để xử lý logic trang web?", answers: ["C++", "JavaScript", "SQL", "Java"], correct: 1, explain: "Trình duyệt tích hợp sẵn bộ thực thi JavaScript." },
  { id: 3, text: "Thẻ HTML nào dùng để vẽ đồ họa 2D bằng mã?", answers: ["<svg>", "<img>", "<canvas>", "<draw>"], correct: 2, explain: "<canvas> cho phép vẽ từng pixel bằng JavaScript." },
  { id: 4, text: "Phím nào mở Developer Tools trên Chrome/Edge?", answers: ["F5", "F12", "F2", "F9"], correct: 1, explain: "F12 mở Console, Network, Elements..." },
  { id: 5, text: "CSS dùng để làm gì?", answers: ["Lưu dữ liệu", "Xử lý logic", "Định dạng giao diện", "Kết nối mạng"], correct: 2, explain: "CSS quy định màu sắc, bố cục, hiệu ứng." }
];
