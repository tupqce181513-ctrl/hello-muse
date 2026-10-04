# ⚔️ Mini RPG — Client & Server

Một game RPG 2D nhiều người chơi nhỏ gọn: **server Node.js** giữ trạng thái
game (authoritative) và **client web** vẽ bằng Canvas, giao tiếp qua WebSocket.

## Chạy game

```bash
npm install
node server.js
```

Mở trình duyệt vào **http://localhost:8080**, nhập tên nhân vật và chơi.
Mở nhiều tab để chơi cùng nhau!

## Điều khiển

| Phím | Hành động |
|------|-----------|
| WASD / mũi tên | Di chuyển |
| Space / J | Đánh |
| Enter | Mở khung chat, Enter lần nữa để gửi |

Trên điện thoại: dùng joystick ảo bên trái để di chuyển, nút ⚔️ để đánh.

## Tính năng

- Server authoritative: di chuyển, va chạm, quái, sát thương đều do server tính (tick 20Hz)
- Quái slime: lang thang, truy đuổi người chơi ở gần, chạm vào gây sát thương
- Chiến đấu: đánh trúng slime theo hướng nhìn, quái chết cho XP
- Lên cấp: tăng máu tối đa và sát thương
- Chết → hồi sinh sau 3 giây tại điểm spawn
- Chat realtime giữa các người chơi
- Camera bám theo nhân vật, HUD máu/XP/level, danh sách người online

## Cấu trúc

```
mini-rpg/
├── package.json        # dependency duy nhất: ws
├── server.js           # game server: WebSocket + vòng lặp game
├── README.md
└── public/
    ├── index.html      # khung game + HUD + chat
    ├── style.css       # giao diện
    └── client.js       # render canvas + input + mạng
```

## Giao thức mạng (JSON qua WebSocket)

Client → Server: `join`, `input {x,y}`, `attack`, `chat`
Server → Client: `welcome`, `state` (snapshot 20 lần/giây), `chat`

## Ý tưởng mở rộng

- Thêm loại quái mới, boss, vật phẩm rơi ra
- Lưu nhân vật vào database (SQLite/Redis)
- Bản đồ nhiều màn, cổng dịch chuyển
