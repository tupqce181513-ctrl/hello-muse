# hello-muse

Mini multiplayer RPG — xem `mini-rpg-v2/` (bản mới nhất).

- **Server**: Node.js + Express + `ws` + `zod` (authoritative, 20 ticks/s)
- **Client**: Phaser 3 + Vite
- Đồ họa: tile map dùng chung, parallax background, nhạc & SFX tổng hợp bằng Web Audio, particle FX, 6 skin nhân vật

Chạy: `cd mini-rpg-v2/client && npm install && npm run build`, rồi `cd ../server && npm install && npm start` → mở http://localhost:8080
