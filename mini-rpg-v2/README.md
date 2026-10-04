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

Dev client riêng (Vite): `cd client && npm run dev` — proxy `/api` về server game
(`VITE_WS_URL=ws://localhost:8080` cho WebSocket, xem `client/src/api.js`).

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

## Hệ thống kinh nghiệm & kỹ năng

- **Kinh nghiệm**: đường cong `xpNeed(level) = 100 * level^1.25` (trong `server/src/config.js`).
  Mỗi cấp cho **+1 điểm kỹ năng**, +20 HP tối đa, hồi đầy HP.
- **Kỹ năng chủ động** (mở bằng điểm, dùng phím `1/2/3`, có cooldown):

  | Skill | Điểm | Hồi chiêu | Hiệu ứng |
  |---|---|---|---|
  | 💨 Lao tới | 1 | 6s | Lướt nhanh về phía đang nhìn |
  | 🌀 Xoáy kiếm | 2 | 8s | 150% sát thương lên quái xung quanh |
  | 💚 Hồi máu | 2 | 20s | Hồi 40% HP tối đa |

- **Kỹ năng bị động** (1 điểm/cấp, tối đa 5 cấp): ⚔️ Sức mạnh (+15% dmg), 🥾 Nhanh nhẹn
  (+8% tốc chạy), 🛡️ Cứng cáp (+20 HP tối đa), 💥 Chí mạng (+8% tỉ lệ x2 dmg).
- Mở bảng kỹ năng bằng nút 🎯 hoặc phím `K`. Mọi logic ở server (`systems.js`:
  `unlockSkill`/`allocatePassive`/`castSkill`), client chỉ hiển thị + gửi lệnh.

## Hệ thống nhiệm vụ

- **NPC Người dẫn đường** 🧙 ở vùng spawn an toàn. Lại gần và nhấn `E` (hoặc nút 💬
  trên mobile) để nói chuyện, nhận/trả nhiệm vụ.
- **Chuỗi 3 nhiệm vụ**: Diệt 5 slime → nhặt 3 Mảnh Slime → Thách đấu Boss.
  Quest Boss ở trạng thái `locked` đến giai đoạn 3 (có boss) — chỉ hiện "Sắp ra mắt",
  không thể nhận.
- **Quy tắc tính kill** (ghi rõ trong mô tả quest): chỉ tính cho **người kết liễu**,
  và chỉ khi quest đang ở trạng thái active.
- **Trạng thái quest** do server quản lý: `available → active → ready → done`.
  Thưởng (XP + vàng 🪙) chỉ trao **một lần** — gửi lệnh trả lặp lại bị bỏ qua.
- **Vật phẩm**: slime rơi Mảnh Slime (50%), chạm vào là tự nhặt; mỗi món chỉ nhặt
  được một lần (biến mất khỏi map). Inventory hiện chỉ đếm số lượng — giai đoạn 3
  mở rộng đầy đủ.
- Quest tracker góc phải màn hình, toast thông báo tiến độ, tiền vàng hiện trên HUD.

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
