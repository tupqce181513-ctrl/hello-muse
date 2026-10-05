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
- Snapshot `state` gửi cho mọi socket chỉ chứa dữ liệu render công khai; trạng
  thái riêng (túi, quest, vàng, skill) đi kèm trong trường `me` **chỉ socket sở
  hữu mới nhận**. Thanh HP vẽ theo max HP hiệu dụng (gốc + giáp).
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

Dev client riêng (hot reload, same-origin qua proxy — không cần CORS hay env):
`cd client && npm run dev` rồi mở `http://localhost:5173`. Vite proxy cả
`/api` (HTTP) và `/ws` (WebSocket) về server game `:8080`, giống hệt production.

Điều khiển: WASD / mũi tên di chuyển · Space đánh · Enter chat.
Điện thoại: joystick ảo + nút ⚔️.

## API thử nhanh

- `GET /api/health` → `{ ok, players, monstersAlive, uptime }`
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

## Giai đoạn 3: quái mới, Boss, inventory & trang bị

### Quái vật
- Kiến trúc quái tổng quát (`Monster` + `monsterAI`), giữ slime cũ:
  - **Slime** (8, đồng cỏ phía nam): như cũ.
  - **Goblin** (4, phía đông): cận chiến nhanh, đòn nặng **lao tới được báo trước**
    (vòng đỏ 0.8s) mỗi 5s.
  - **Wisp** (3, phía bắc): bắn đạn tím từ xa, giữ khoảng cách ~260px.
  - **Slime King** 👑 (1, đấu trường đông bắc): Boss 1500 HP với 2 hành vi —
    **đập diện rộng** (vòng đỏ báo trước 1.2s, bán kính 150) và **gọi 2 slime nhỏ**
    mỗi 15s. Thanh HP boss chỉ hiện khi bạn ở gần (< 700px).

### Co-op Boss
Quy tắc (ghi trong mô tả quest): gây **ít nhất 5% sát thương** lên Boss và **còn
online** khi Boss gục → nhận thưởng (quest credit + 150 XP + 50 vàng), một lần
mỗi lượt Boss. Ngắt kết nối = mất đóng góp. Người dưới ngưỡng không được gì —
kể cả người ra đòn kết liễu: **XP last-hit vẫn thuộc về người kết liễu** (quy
tắc riêng, đã ghi rõ), nhưng **quest credit Boss chỉ đi qua ngưỡng co-op**.

### Inventory & trang bị
- Túi **12 ô** (nút 🎒 hoặc phím `I`): Mảnh Slime, Vàng, **Thuốc hồi máu** 🧪
  (hồi 50% HP, hồi chiêu 5s), **Kiếm sắt** 🗡️ (+12 dmg), **Giáp da** 🦺 (+30 HP),
  **Kiếm Vương** 👑 (+30 dmg — phần thưởng cuối).
- Nhấn vào trang bị để mặc/tháo, nhấn thuốc để dùng. Server kiểm tra: quyền sở
  hữu (uid), khoảng cách nhặt, túi đầy, cooldown, trạng thái chết.
- Chỉ số trang bị **tính động**, không cộng dồn khi tháo/lắp nhiều lần.
- Vàng rơi ra đất (🪙) tự nhặt thẳng vào ví. Loot giữ **đúng số lượng cấu hình**
  (ví dụ Boss: 100–200 vàng, 2–3 thuốc); nhặt một phần thì phần còn lại ở yên
  trên đất, quest "nhặt" tính theo số thực nhận.

### Quest Boss
Chuỗi hoàn chỉnh: Diệt Slime → Mảnh Slime → **Thách đấu Slime King**.
Trả quest Boss nhận 300 XP + 150 vàng và **Kiếm Vương** — phần thưởng cuối
chuyến phiêu lưu, kèm thông báo toàn server.

## Giai đoạn 4: lưu tiến trình & nối lại phiên

- **Định danh ổn định**: mỗi nhân vật có UUID do server cấp + **resume token**
  ngẫu nhiên (64 ký tự hex). Tên hiển thị không bao giờ dùng để lấy dữ liệu.
- **Storage**: `server/src/persistence/store.js` — interface `PlayerRepository`
  (sau này thay bằng Redis/SQL không cần sửa game), bản MVP lưu file JSON
  `server/data/players.json` (đã gitignore) với `schemaVersion`, **ghi atomically**
  (temp + rename) và **tuần tự hóa** qua hàng đợi promise. Token chỉ lưu dạng
  **SHA-256 hash** — token gốc chỉ nằm trên thiết bị người chơi.
- **Lưu gì**: level, XP, điểm kỹ năng, skill/passive, vàng, inventory/equipment,
  quest, skin, HP, cooldown (dạng timestamp tuyệt đối). Chỉ số dẫn xuất
  (sát thương vũ khí, HP tối đa...) **tái tính khi load** — không bao giờ cộng dồn.
- **Khi nào lưu**: autosave mỗi 30s (không ghi trong tick), ngay khi lên cấp /
  trả quest / hạ boss / ngắt kết nối.
- **Cửa sổ mất dữ liệu**: nếu server crash, tối đa ~30s tiến trình thường
  (đánh quái/XP/vàng nhặt) có thể mất. Level-up, trả quest, hạ boss được lưu
  ngay (best-effort, bất đồng bộ): nếu ghi disk lỗi, tiến trình vẫn còn trong
  RAM và autosave 30s sẽ thử lại — không cam kết tuyệt đối. Vị trí không lưu —
  nối lại sẽ spawn ở điểm an toàn.
- **Tắt server đúng cách** (SIGTERM/SIGINT, ví dụ khi deploy): server dừng
  vòng lặp, lưu toàn bộ người chơi đang online xuống disk rồi mới thoát —
  restart/deploy không mất tiến trình đã lưu.
- **Client**: token trong localStorage; tự nối lại khi mở trang/mất mạng với
  **backoff mũ giới hạn** (1s→30s, tối đa 10 lần), không bao giờ mở 2 socket.
  Server chỉ cho **một kết nối active** mỗi nhân vật (kết nối mới đá kết nối cũ),
  nên không có duplicate player hay thưởng trùng.
- **Xử lý lỗi**: token sai → `resume_failed`, client xóa token và hiện form tạo
  mới; file save hỏng → backup `.bak` và bắt đầu sạch; **reconnect không reset
  cooldown** (cooldown chạy theo thời gian thực, kể cả khi offline).
- **UI**: góc dưới phải hiện `💾 giờ:lưu-cuối`; màn hình vào game ghi rõ tiến
  trình lưu trên thiết bị này, chưa đồng bộ giữa thiết bị.

## Giai đoạn 5: hoàn thiện client & UX

### HUD
- Thanh HP (số cụ thể) / XP, vàng 🪙, quest tracker, **cooldown kỹ năng dạng số**
  (giây, thập phân khi < 1s), túi đồ 12 ô, trạng thái mạng, giờ lưu cuối —
  tất cả cập nhật từ snapshot server.

### Hiệu ứng theo kết quả server
- **Số damage bay** (vàng cho đòn đánh ra, đỏ cho sát thương nhận) từ `dmgEvents`
  của server — client chỉ hiển thị, không tự tính.
- **Banner "LÊN CẤP!"** toàn màn hình, hiệu ứng trúng đòn/nhặt đồ/hoàn thành
  quest như cũ. Particle có giới hạn (`maxParticles`) để không tụt FPS khi
  đông người spam skill.

### Bố trí không chồng lấn
- Đã kiểm toán vị trí mọi phần tử ở **360×800** (mobile) và **1366×768**
  (desktop): chat, skill bar, joystick, nút đánh ⚔️ (88px, dễ bấm), nút NPC 💬
  (nằm trên nút đánh), các nút tiện ích gom vào HUD.
- Mobile: skill bar nổi trên hàng nút cảm ứng, chat dock phía trên skill bar.

### Người mới & cài đặt
- **Hướng dẫn nhanh** 📖 hiện lần đầu vào game (lưu cờ localStorage), mở lại
  bằng nút ❓.
- **Màn hình chết** 💀 với đếm ngược hồi sinh lấy từ server + mẹo chơi. Chết rồi
  thoát game cũng không thoát được: nối lại vẫn thấy đếm ngược tiếp tục (hoặc
  đã hồi sinh xong nếu hết giờ).
- **Nhạc và SFX chỉnh riêng** (🔊/🔔), nhớ lựa chọn trên thiết bị.

### Hiệu năng
- Giới hạn particle, dọn object/view đã mất khỏi world mỗi snapshot, pool số
  damage (24). Nhấn **F3** để hiện đồng hồ FPS đo thực tế.
- Chưa công bố con số FPS hay số người chơi tối đa — các giới hạn particle
  là chọn trước, cần đo trên thiết bị mục tiêu trước khi tinh chỉnh.

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
