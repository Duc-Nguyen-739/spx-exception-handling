# SeaTalk Bot (SeaTalk Open Platform) — kiến thức từ docs (2026-10-17)

> Nguồn: 11 trang docs `open.seatalk.io` do user paste 2026-10-17 (raw `.txt` giữ trên máy user — `pasted-context-1..11.txt`).
> Đề mục nguồn: Build a No-Code AI Chatbot · Getting Started · Understanding Bot Capabilities · Bot Overview · Quickly Build a Bot · Build an App For Your Team · Understand App Capabilities · Introduction to SeaTalk Open Platform · Build a Workspace App · Integrate Login With SeaTalk · Send Messages to Group Chat Through System Account.
> Quy tắc: KHÔNG ghi secret thật vào file — chỉ placeholder (`<APP_ID>`…). Giá trị thật ở `.env` / Script Properties.
> Đây là docs phía **SeaTalk Open Platform (SOP)**, bổ trợ `docs/smart-agents.md` (phía Smart) — không lặp phần đã có bên đó.

## 1. Bản đồ platform

- SOP = nền tảng mở của SeaTalk. App server của ta liên kết client SeaTalk qua: **Server APIs (`openapi.seatalk.io`) · Capabilities · SDK**. Console quản lý app: `open.seatalk.io`.
- **3 loại capability** (1 app bật được nhiều capability cùng lúc):

| Capability | Chạm user ở đâu | Client | Hợp khi… |
|---|---|---|---|
| **Bot** | Chat (1-1 + group) | Mobile, PC | Logic nhiều đoạn hội thoại (chatbot) |
| Workspace App (Web/RN) | Tab Workspace | Web: mobile+PC; RN: mobile | Nhúng web app có sẵn |
| Login with SeaTalk | Web ngoài | PC | Đăng nhập bằng tài khoản SeaTalk |

- App **không bắt buộc** bật capability nào — app thu backend (chỉ gọi server API) vẫn release được.
- **Bot = "người dùng đặc biệt"** trong SeaTalk. Hai nửa năng lực:
  - **Receive Interactions**: user nhắn tin, thêm bot vào group, @bot → SOP **push Event Callback tới server bot**.
  - **Initiate Actions**: gửi tin 1-1/group → server chủ động **gọi API** `openapi.seatalk.io` (kèm App Access Token).

## 2. Vòng đời app SOP (áp cho mọi capability)

1. **Create app** — wizard 2 bước (Basic app info → Service & Data scope). App mới ở status **Not Configured**.
2. **Enable capability** — nút *Enable* trên card (VD card Bot). Bật xong: capability xuất hiện ở menu trái, **API permission mặc định của capability cấp sẵn** (test được ngay với chính mình).
   - Đối chiếu repo: app `Backlog HN SOC` đã **Online** (xem `docs/smart-agents.md` mục *Trang Bot thật*) — 2 bước này đã qua.
3. **Dev & config** — menu trái app: `General Setting` (Basic Info & Credentials, Collaborators, Scopes & Permissions) · `Bot` · `Workspace App` · `Login with SeaTalk` · `Advanced Settings` (**Event Callback** · Security Settings).
   - **Credentials**: App ID + App Secret ở `Basic Info & Credentials` → mục *Credentials*; **Signing Secret** nằm ngay trang **Event Callback URL** (bấm Edit lần nữa mới thấy).
4. **Release** — trước khi cho nhiều người dùng phải nộp **Scopes & Permission**:
   - **Service Scope** = ai được nhìn/dùng app. Điền theo Department dạng breadcrumb "XX > YY > ZZ" (lưu ý: theo **team path của HRIS profile**, khác team path trong profile SeaTalk) + cá nhân lẻ qua **Whitelist Employee** (email).
   - **Data Scope** = dữ liệu của ai app được đọc. Lựa chọn dễ nhất: *Sync from Service Scope* = Yes.
   - **API Permission** = server được gọi API nào; tick checkbox từng API, cột "Limited by" cho biết API có giới hạn Service/Data Scope nào.
   - Duyệt: **Organization Admin của Sea Group review ≥ 1 lần/ngày làm việc** — không tức thì.
   - **3 API không cần permission**: Get App Access Token · Verify Single-Sign-on Token · Verify Login With SeaTalk Code.
   - Đổi scopes/config sau khi release → phải **Release lại** mới có hiệu lực (khớp ghi chú "Trang Bot thật" và docs Release của Smart).

## 3. Bot capability — chi tiết kỹ thuật

### 3.1 Phạm vi năng lực

- 1-1: nhận + gửi tin với bot user.
- Group: được thành viên thêm vào (bất kỳ ai cũng đuổi được bot), nhận event được @, gửi tin vào group.

### 3.2 Event Callback

- Cấu hình: `Advanced Settings → Event Callback → Edit (bút chít) cạnh ô URL` → dán URL → **Save kích hoạt bài test verify**. Xong **các event của capability được bật tự động**.
- Đích URL là server bot của ta (VD `https://<domain>/callback`). Localhost phải ngrok/turnel trước khi dán — **nhưng nếu dùng kênh SMART (mục 4) thì không cần**: Smart host in-network là bên nhận callback, ta chỉ dán callback URL mà Smart phát ra.
- **Xác request thật của SOP** — header `Signature` = `sha256_hex(raw_body_bytes + Signing_Secret)` (SHA-256 thuần, không phải HMAC: nối nguyên body bytes + chuỗi Signing Secret rồi hash). Khớp sai → trả HTTP 403. Chỉ cần khi **tự dựng engine** (fallback P2-F), không cần cho kênh SMART.

### 3.3 Event shapes (Getting Started, Go)

- Envelope chung: `{event_id, event_type, timestamp(uint64), app_id, event{…}}`.
- **`event_verification`** — khi Save URL, SOP gọi tới để verify: body chứa `event.seatalk_challenge` → server phải **echo lại đúng giá trị** trong `{"seatalk_challenge": "…"}`.
- **`message_from_bot_subscriber`** (trang danh sách API ghi tên *Message Received from Bot User*, path event `event_message_received_from_bot_subscriber`):

| Field | Ý nghĩa |
|---|---|
| `event.employee_code` | Mã NV người gửi — **khóa để trả lời lại qua Send Message API** |
| `event.message.tag` | Loại tin (`text`…) |
| `event.message.text.content` | Nội dung (kèm format) |
| `event.message.text.plain_text` | Nội dung plaintext |

- Lưu ý legacy: "subscriber" logic **đã bỏ** — user nhắn trực tiếp bot, không cần subscribe; tên API giữ nguyên để tương thích.

### 3.4 Initiate Actions — API chuẩn

- **Auth**: `POST https://openapi.seatalk.io/auth/app_access_token` body `{"app_id":"…","app_secret":"…"}` → JSON `{"code":0, "app_access_token":"…", "expire":…}`. Token sống **7200 s — phải cache** (không xin mỗi request).
  - Khớp quan sát trong `docs/smart.md` mục *SeaTalk auth endpoint*: creds sai → HTTP 400 **body dạng TEXT** `invalid app id (Ref:<guid>)`, không parse được JSON.
- **Send Message To Bot User** (1-1): `POST https://openapi.seatalk.io/messaging/v2/single_chat` header `Authorization: Bearer <token>` + `Content-Type: application/json`, body `{employee_code, message:{tag:"text", text:{format, content}}}`:
  - `format`: `1` = markdown, `2` = plain (mặc định 1). `content` ≤ 4096 ký tự. Trả `{"code":0}`.
  - Markdown hợp lệ (theo docs): bold, italic, ordered/unordered list, inline code, code block. Xuống dòng: `\n\n` hoặc thẻ `<br />`. Escape format bằng 2 dấu `\` (VD `\\_` để hủy in nghiêng).
- @user trong tin markdown: `<mention-tag target="seatalk://user?id=<SeaTalk_ID>"/>` (dùng trong group); alternative là dán `mentioned_list`/`mentioned_email_list`/`at_all` (xem mục 5).

### 3.5 Group chat — events & APIs

**Events**: *Bot Added to Group Chat* · *New Mentioned Message Received From Group Chat* (chỉ fire khi được **@text** trong tin; shape đầy đủ ở trang event riêng — chưa có trong 11 docs) · *Bot Removed From Group Chat* (cũng fire khi group giải tán).

**APIs** (`openapi.seatalk.io`):

| API | Chú ý |
|---|---|
| Get Joined Group Chat List | các group bot đang tham gia |
| Get Group Info | tên, settings, tổng số user/bot/system account |
| Send Message to Group Chat | gửi text + image (shape đầy đủ chưa có trong 11 docs) |
| Get Message by Message ID | đọc lại 1 tin theo ID |
| **Get Chat History** | nhạy cảm → **phải xin duyệt quản lý riêng**; đã biết scope group tương ứng *Get Thread by Thread ID in Group Chat* (docs Smart) |

### 3.6 Tương thích client

- **Interactive message (card)** cần client **≥ 3.38.1**.
- Client **≤ 3.33** không hiển thị chỉ dấu "Bot" ở nhiều chỗ (iOS: chatroom chính; Android: member list/@ list; Desktop: @ list) và có toast lỗi khi chọn bot trong vài danh sách — với app nội bộ tránh phụ thuộc UX cũ.

## 4. No-Code AI Chatbot — kênh partner (SMART) ⭐ chính cho E2

Docs `Build a No-Code AI Chatbot` — partnership với **Alpha Knowledge · AI Chatbot Platform (aichat.infra.shopee.io) · SMART (smart.shopee.io)**. Luồng chuẩn khớp 100% với screenshot trang Bot của user và khớp runbook P2 trong plan:

1. Tạo app + Enable **Bot** capability (xong trước — app `Backlog HN SOC` đã Online).
2. Trang **Bot capability** (chính là chỗ **Bot Integrations** có 3 thẻ partner) → bấm chevron góc phải thẻ **SMART** để mở **app details**: **App ID / App Secret / Signing Secret**, mỗi mục có nút Copy. Đây là 3/4 giá trị của form Smart *Integrate → SeaTalk Bot*; giá trị thứ 4 **SeaTalk ID** nằm ngay trên trang (đã có `9227685607` — xem `docs/smart-agents.md`).
3. Bấm link trong thẻ → sang portal partner (SMART) → **login + tạo app trên đó**, paste app details vừa copy.
4. Partner thành công sẽ phát ra **callback URL** → dán vào `Advanced Settings → Event Callback` → **tick/Save để verify**.
5. Tuỳ biến "bộ não" bot (knowledge base, câu trả lời chuẩn…) thực hiện trên portal partner — SMART có *Smart User Guide* trên Confluence (`spaceKey=SMAR`).

> Theo luồng này phần "server nhận event" hoàn toàn thuộc Smart — **không ngrok, không tự xử lý Signature/event_verification**. Bước verify callback chính là phần "tick test tới success" trong docs Agent classic cũ (giờ đã có docs của SOP xác nhận).

## 5. System Account — gửi tin 1 chiều vào group (khác bot)

Docs `Send Messages to Group Chat Through System Account` — phương án **push thông báo 1 chiều** vào group, **không cần app / không cần API permission**. Dùng được cho P4 (notify từ GAS side không qua agent) — vẫn phải POST tới `openapi.seatalk.io` webhook từ nơi chạm được mạng công ty.

- **Bản chất**: thành viên "đặc biệt" sống trong **1 group duy nhất**, chỉ push tin, **không nhận tin**.
- Tạo: chỉ từ **SeaTalk Desktop**, bởi **group owner / group admin / system account admin**; settings group → System Accounts → Add System Account (name, desc, avatar) → nhận **webhook URL**: `https://openapi.seatalk.io/webhook/group/<token>`.
- Giới hạn: **≤ 15 system account / group**; toggle On/Off để bật/dừng push; xóa = revoke webhook.
- Gửi: `POST <webhook_url>` JSON — response `{"code":0, "msg":"success (ref:…)", "message_id":"…"}`; HTTP 200 **chưa chắc là success** — phải đọc `code` body (non-zero = lỗi, tra System Account Error Codes).
- **Rate limit**: **60 tin/phút/system account**; vượt → **tin thứ 61 trở đi hỏng** kèm **câm lặng 10 phút**. Ngoài ra giới hạn **hằng ngày theo chat** chia sẻ giữa mọi bot & system account trong cùng chat.
- Message types:

| tag | Payload chính | Giới hạn |
|---|---|---|
| `text` | `{format, content, mentioned_list, mentioned_email_list, at_all}` | content 1…4096 ký tự; `format` 1=markdown 2=plain; @All cần setting group |
| `image` | `{image_base64.content}` | ≤ 5MB sau encode; chỉ PNG/JPG/GIF |
| `interactive_message` | `{elements}` (card: title/description/button callback hoặc redirect) | client ≥ 3.38.1 |
| `file` | `{content, filename}` | ≤ 5MB, ≥ 10B sau encode; filename ≤ 100 ký tự, cần extension |
| `markdown` | `{content}` | **đang bị phase-out** — ưu tiên `text` kèm `format:1` |

## 6. Workspace App + Login with SeaTalk (tóm gọn — ngoài scope dự án)

- **Workspace App**: bật capability → cấu hình **Web URL** (riêng cho mobile & desktop, có thể khác nhau) hoặc upload **RN bundle**; Release page → Create New Release → chọn Capability Setting → *Mobile/Desktop Workspace* → Release. Hiện ngay trong tab Workspace của client.
- **Login with SeaTalk**: OAuth 2.0. Cấu hình **Redirect URI** đúng tuyệt đối; đính login button qua JS (data attributes: `data-appid`, `data-redirect_uri`, `data-response_type="code"`, `data-state`); redirect về kèm `?code=…&state=…` — code **hết hạn sau 10 phút**, đổi lấy user profile bằng API *Verify Login With SeaTalk Code*; muốn lấy employee profile thêm scope *Get Employee Profile*.
- Không dùng cho dự án này (E1 webapp vẫn GASHtml + bridge), chỉ để nêu "app có thể nhét nhiều capability".

## 7. Áp về dự án — đối chiếu / khẳng định mới

| Fact mới từ docs SOP | Ảnh hưởng dự án |
|---|---|
| Partner flow SMART xác nhận bằng docs (lấy 3 secrets trên thẻ → paste vào Smart → callback URL dán ngược Event Callback) | **P2-A/P2-B runbook đúng nguyên tắc** — không đổi. SMART là lựa chọn chính cho E2 |
| `Signature` = SHA-256(body + Signing Secret), event `event_verification` cần echo `seatalk_challenge`, `EmployeeCode`, `tag/text.content/plain_text` | Khối nền cho **fallback P2-F** (engine tự dựng): nếu kênh Smart hỏng 2 lần → dựng engine cần đúng các mảnh này |
| Token 1-1 tồn tại 7200s + cache, `single_chat` shape chuẩn | Cho P4 (notify từ GAS qua SeaTalk API) — luôn cần `app_access_token` đi trước |
| Text ≤ 4096, card ≥ 3.38.1, Get Chat History cần duyệt khung scope | Giới hạn format tin — output agent/workflow cần gọn (markdown thuần, chia mục); card chỉ dùng nếu chấp nhận client tối thiểu 3.38.1 |
| System account: webhook 1 chiều vào group, 60/phút | Phương án nhẹ cho **notify** không cần thêm capability; dùng chung group với bot thì chung hạn mức ngày |
| Đổi Scopes / config → Release lại, duyệt Org Admin ≥1 lần/ngày làm việc | Chốt kỳ **đợi duyệt scope** tối đa ~24h — báo trước cho user biết nhịp |

## 8. Docs còn bỏ trống trong đợt này — cần user cung cấp thêm (khi nào cần thì hỏi)

| Ưu tiên | Trang docs thiếu | Vì sao cần |
|---|---|---|
| 🔴 cần sớm | `server-apis-event-callback` (docs Event Callback đầy đủ) · `list-of-events` | Cần shape event *group mention* khi test group P2-C; xác nhận vị trí toggle "Combined Message Delivery" |
| 🟡 trung bình | `messaging_send-message-to-bot-subscriber` (full API 1-1) · `Send Message to Group Chat` · `reference_server-api-error-code` · `SOP-App-Statuses` | Khi cần mã lỗi / gửi tin ngược qua bot API |
| 🟢 ít khẩn | `get-app-access-token` · `get-employee-profile` · `get-group-info` · `event-bot-added-to-group-chat` · `event_bot_removed_from_group_chat` | Chỉ cần khi thêm chi tiết hồ sơ NV / group |
| ⚪ chưa cần | Workspace App / RN / Login with SeaTalk chi tiết | Phía auth cho web — ngoài scope hay là sẽ không dựng |

> **Không thấy docs nào trong 11 trang nhắc "Combined Message Delivery API"** — vị trí toggle này trên portal vẫn chưa xác nhận (chỉ docs Agent có nhắc). Đi thẳng vào portal lần chạy P2-A/P2-B rồi quay lại cập nhật đây.

## 9. Trạng thái — cập nhật vào `docs/smart.md` nếu cần

- [x] Docs: SeaTalk Open Platform tổng quát — ✅ paste 2026-10-17 → distill ở file này
- [x] Docs: SOP Bot kỹ thuật (events, API shapes, signature) — ✅ file này
- [x] Docs: No-Code AI Chatbot partner flow → **xác nhận runbook P2-A/P2-B** — ✅ file này
- [ ] Docs: Event Callback đầy đủ + Combined Message Delivery — ⏳ chưa có trong batch
