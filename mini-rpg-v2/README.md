# ⚔️ Mini RPG v2 — Client & Server (extensible codebase)

Bản viết lại của mini RPG theo kiến trúc dễ mở rộng, dùng các thư viện
JavaScript chuẩn thay vì code "một cục".

## Thư viện sử dụng

| Phía | Thư viện | Vai trò |
|------|----------|---------|
| Server | **Express** | HTTP server, serve client build, JSON API |
| Server | **ws** | WebSocket server |
| Server | **zod** | Validate mọi gói tin client gửi lên |
| Client | **Phaser 3** | Game framework: scene, camera, input, render |
| Client | **Vite** | Dev server + build tool |

## Kiến trúc

```
mini-rpg-v2/
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js        # entry: Express + WebSocket + game loop
│       ├── config.js       # mọi thông số cân bằng game ở MỘT chỗ
│       ├── entities.js     # class Player / Slime (+ serialize)
│       ├── world.js        # World: giữ state + phát event qua bus
│       ├── systems.js      # movement / slimeAI / combat / respawn
│       └── net/
│           ├── schemas.js  # zod schema cho từng loại message
│           └── router.js   # Router: type -> (schema, handler)
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js         # khởi tạo Phaser + Net + UI
│       ├── net.js          # NetworkManager (EventEmitter)
│       ├── ui.js           # DOM: overlay join, chat, HUD, joystick
│       ├── terrain.js      # vẽ bản đồ tĩnh một lần
│       ├── scenes/
│       │   └── GameScene.js    # render + input, mirror state từ server
│       └── entities/
│           ├── PlayerView.js   # view nhân vật (Container)
│           └── SlimeView.js    # view slime
```

**Nguyên tắc:**
- Server là *authoritative*: mọi logic game nằm ở `systems.js`, client chỉ vẽ lại snapshot.
- Giao tiếp qua **event bus** (`world.bus`): `player:join`, `slime:killed`, `chat`...
  Muốn thêm tính năng (thông báo, lưu DB, log) → chỉ cần `bus.on(...)`, không sửa loop.
- Message mới: thêm zod schema + `router.on(...)` là xong, client cũ không ảnh hưởng.

## Chạy

```bash
# 1. Build client
cd client && npm install && npm run build && cd ..

# 2. Chạy server (serve luôn client vừa build)
cd server && npm install && npm start
# Mở http://localhost:8080
```

Dev client riêng (hot reload): `cd client && npm run dev`, rồi tạo file
`client/.env` với nội dung `VITE_WS_URL=ws://localhost:8080`.

Điều khiển: WASD / mũi tên di chuyển · Space đánh · Enter chat.
Điện thoại: joystick ảo + nút ⚔️.

## API thử nhanh

- `GET /api/health` → `{ ok, players, slimesAlive, uptime }`
- `GET /api/players` → danh sách người chơi online

## Mở rộng đồ họa & âm thanh

Mọi thứ đồ họa đều là module client độc lập — server không cần biết:

| Muốn thêm... | Sửa file nào |
|---|---|
| Map mới | Thêm `shared/maps/ten-map.json` (copy `meadow.json`), trỏ `mapFile` trong `server/src/config.js`. Server tự đọc va chạm, client tự vẽ |
| Tile/decor mới | Thêm ký tự vào `tiles` trong JSON + vẽ trong `client/src/terrain.js` (`drawMap`) |
| Background/parallax | `client/src/background.js` — các lớp có `scrollFactor` riêng, thêm lớp mới chỉ cần 1 container |
| Nhạc nền | `client/src/audio.js` — mảng `LEAD`/`BASS` là pattern 16 bước, thay nốt là đổi nhạc |
| Hiệu ứng âm thanh | `music.sfx(name)` trong `audio.js` — thêm case mới rồi gọi `sfx.ten()` ở `GameScene` |
| Particle FX | `client/src/fx.js` — thêm emitter + hàm trigger, gọi từ `GameScene.sync()` |
| Skin nhân vật | Thêm object vào `skins` trong `server/src/config.js` (`body`, `accent`, `hat`: `none`/`cap`/`hood`/`headband`). Client tự fetch qua `GET /api/skins`, vẽ mũ trong `PlayerView.drawHat()` |

Nhạc và SFX được tổng hợp bằng Web Audio API nên không cần file asset nào.

## Mở rộng thế nào? (ví dụ)

**Thêm quái Goblin:**
1. `entities.js`: `class Goblin extends Entity` (+ serialize)
2. `systems.js`: thêm hàm `goblinAI(world, dt)`, gọi trong loop ở `index.js`
3. `client/src/entities/GoblinView.js` + đăng ký trong `GameScene.sync()`

**Thêm message mới** (ví dụ `emote`):
1. `server/src/net/schemas.js`: thêm schema
2. `server/src/index.js`: `router.on('emote', schemas.Emote, ...)`
3. Client: `net.send({ t: 'emote', ... })`

**Lưu nhân vật vào DB:** `world.bus.on('player:leave', saveToDb)` — không chạm vào loop.
