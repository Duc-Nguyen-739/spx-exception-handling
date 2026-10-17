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
> ✅ **Đợt paste 2 (2026-10-17) đã bù đủ các docs phía trên** — 116 trang chính thức SOP (`event-callback`, `list-of-events`, full API messaging/group/contacts, error codes, changelog…). Distill chi tiết từ mục **10** trở xuống. Section này giữ lại đối chiếu cũ.

**Về "Combined Message Delivery API" (câu hỏi mở của đợt 1):** không thấy nhắc trong 116 trang docs SOP (grep toàn bộ chỉ ra tag tin `combined_forwarded_chat_history` = tin forward lịch sử chat, khác). Toggle "ảnh + text gộp 1 event" chỉ docs Smart nhắc — khả năng là thuộc tính riêng phía Agent/Smart hoặc tính năng portal mới chưa ghi docs. Vẫn chờ xác nhận trên portal lần chạy P2-A/P2-B.

## 9. Trạng thái — cập nhật vào `docs/smart.md` nếu cần

- [x] Docs: SeaTalk Open Platform tổng quát — ✅ paste 2026-10-17 → distill ở file này
- [x] Docs: SOP Bot kỹ thuật (events, API shapes, signature) — ✅ file này
- [x] Docs: No-Code AI Chatbot partner flow → **xác nhận runbook P2-A/P2-B** — ✅ file này
- [x] Docs đợt 2: 116 trang server APIs + events + errors + changelog — ✅ distill mục 10–19 dưới đây

---

# PHẦN 2 — Distill docs đợt 2 (116 trang official, 2026-10-17)

## 10. Event Callback & cơ chế nhận event (đầy đủ)

- **Cấu hình URL + verify:** Save URL → SOP POST tới URL kèm `event_verification` chứa `event.seatalk_challenge` → server trả **HTTP 200 trong 5 giây** với body `{"seatalk_challenge": "<giá trị>"}`. SOP retry tối đa 3 lần nếu không thấy response. Lỗi verify hiển thị ngay trên trang config.
- **Sự kiện tự bật:** duyệt đổi config URL thành công → **tất cả event có sẵn được bật tự động** (chưa có tuỳ chỉnh chọn event riêng — docs ghi "sẽ hỗ trợ sau"). Xử lý event: phải trả **HTTP 200 trong 5 giây**; không response → SOP retry tối đa 3 lần (sau đó mất event — engine fallback phải trả 200 ngay và xếp hàng xử lý).
- **Signature header:** `Signature = sha256_hex( raw_body_bytes + signing_secret_bytes )`, hex thường (base 16, lowercase). Signing Secret xem dưới ô URL trên trang Event Callback, **reset được bất cứ lúc nào** (reset xong phải cập nhật phía kiểm tra chữ ký).
- Ví dụ docs: secret `1234567812345678` + body JSON `{"event_id":"1098780",…}` → `hashlib.sha256(request.body + signing_secret).hexdigest()`.
- Flask sample trong docs: check signature trước → parse event_type → route handler, else trả `""`.
- **App Statuses:** `Not Configured` (gọi được API **trừ Messaging APIs**) → `Online` (đủ trọn bộ) → `Maintenance` (đổi tay tạm khoá tương tác, vẫn gọi API trừ messaging) → `Offline` (do SOP admin, không tự đổi). Chuyển status: Not Configured ↔ Online tự chuyển theo capability; Online ↔ Maintenance đổi tay trên App Profile.
- **Tổng mức rate limit:** phần lớn server API **1000 req/phút/app**. Ngoại lệ ghi ở đoạn dưới: token 600/h; 1-1 send 300/min & 20/s; group send + group info + chat history 100/min; media download 100/min & 20–30/s; typing 300/min; update card 100/min & 20/s; thread 1-1 fetch 10/s; group member add/remove 10/min; create group 100/ngày + 10/phút.
- **Quy ước HTTP:** HTTP 200 luôn trả JSON body; `code == 0` = success; 4xx/5xx xử lý theo hướng dẫn (DNS/conn error → retry; 403 fix permission; 400 fix body). Raw error như `invalid app id (Ref:…)` (HTTP 400, body TEXT) gặp ở token endpoint — quan sát ghi trong `docs/smart.md`.

## 11. Danh mục event bot (đủ payload)

Danh sách event bot (8 event + 1 deprecated — nguồn `list-of-events`):

| `event_type` | Trigger | Payload chính trong `event` |
|---|---|---|
| `message_from_bot_subscriber` | User nhắn 1-1 (tag `text`/`image`/`file`/`video`; từ 14 Nov 2024, client ≥3.50 mới gửi được ảnh/file/video) | `seatalk_id`, `employee_code`, `email` (rỗng nếu khác org), `message{message_id, quoted_message_id, thread_id (client ≥3.62.1, Jan 2026), tag, text{content}}` |
| `new_mentioned_message_received_from_group_chat` | Thành viên group @bot trong tin text (**@All không trigger**) | `group_id`, `message{message_id, quoted_message_id, thread_id, sender{seatalk_id, employee_code, email, sender_type 1 user/2 bot/3 sysacc}, message_sent_time, tag:"text", text{plain_text, mentioned_list[]}}` |
| `bot_added_to_group_chat` | Bot được thêm vào group | `group{group_id, group_name, external (boolean: true = group external — có người ngoài org), group_settings{chat_history_for_new_members: disabled/1 day/7 days, can_notify_with_at_all, can_view_member_list}, inviter{seatalk_id, employee_code, email}}` |
| `bot_removed_from_group_chat` | Bị đuổi / group giải tán | `group_id`, `remover{seatalk_id, employee_code, email}` |
| `new_message_received_from_thread` | Tin mới trong thread bot đang follow (được @ trước đó hoặc chính bot là root — event Aug 2025) | như mention event nhưng không cần @: `group_id`, `message{…, sender{…}, tag + text/plain_text, image/file/video content}` |
| `interactive_message_click` | User bấm nút callback trên card | `message_id`, `employee_code`, `email`, `value`, `seatalk_id`, `group_id`, `thread_id` (group param từ Jun 2024) |
| `user_enter_chatroom_with_bot` | User mở chatroom 1-1 với bot (event Jul 2025; client ≥3.56; chỉ fire khi bot online) | `employee_code`, `seatalk_id`, `email` |
| `group_chat_converted_to_external_group` | Group internal → external | `group_id`, `operator{seatalk_id, employee_code, email}` |
| (dep) `new_bot_subscriber` | ~~đăng ký bot~~ (Feb 2025 bỏ logic subscribe) | `employee_code` |


(API `Get Bot Subscriber List` cũng bị deprecated May 2025 — không phải event.)

- `sender_type`: 1 user · 2 bot · 3 system account.
- **Media download:** image/file/video nhận được có field `content` = URL `https://openapi.seatalk.io/messaging/v2/file/…` — cần `Authorization: Bearer <app_access_token>`; URL **hết hạn 7 ngày**; file ≤250MB. Rate download 100 req/phút và 20–30/s.
- **message_id đổi theo app** (security) — không reuse message_id giữa 2 app; `quoted_message_id` chỉ quote tin ≤7 ngày + cùng feed (sai → code 4005/4008).

## 12. Messaging APIs — gửi tin (shapes chuẩn)

### 12.1 Access token (bắt buộc trước mọi API)

`POST https://openapi.seatalk.io/auth/app_access_token` — body `{"app_id":"…","app_secret":"…"}` (không cần Authorization) → `{"code":0,"app_access_token":"<32hex>","expire":<unix ts>}`. Token **hết 7200s** — cache; hạn mức **600 lần/h/app**.

### 12.2 Send Message to a Bot User (1-1)

`POST https://openapi.seatalk.io/messaging/v2/single_chat` — Authorization Bearer + JSON:

| Field | Nội dung |
|---|---|
| `employee_code` | bắt buộc |
| `message.tag` | `text` \| `image` \| `interactive_message` \| `file` \| `markdown` (phasing out) |
| `message.text.{format, content}` | format 1 markdown (mặc định) / 2 plain; content 1–4096 |
| `message.image.content` | base64 ≤5MB sau encode; chỉ PNG/JPG/GIF |
| `message.file.{content, filename}` | base64 10B–5MB; filename ≤100, cần extension |
| `message.interactive_message.elements` | card |
| `thread_id` | (Jan 2026, client ≥3.62.1) trả lời thread trong 1-1; để bắt thread mới: = message_id root (root ≤7 ngày) |
| `usable_platform` | (Oct 2025) `all`/`mobile`/`desktop` — client không hỗ trợ sẽ thấy thông báo thay card |

Response: text → `{"code":0}`; image/interactive/file → `{"code":0,"message_id":"…"}`. Rate **300/min & 20/s**. Yêu cầu: bot capability ON + app **Online** + permission `Send Message to Bot User` + Service Scope chứa user.

### 12.3 Send Message to Group Chat

`POST https://openapi.seatalk.io/messaging/v2/group_chat` — tương tự nhưng thay `employee_code` bằng `group_id`; text hỗ trợ thêm `quoted_message_id` (≤7 ngày, cùng feed) + `thread_id` (11 Jun 2024; client ≥3.44.5). Rate **100/min & 20/s** + **daily per-chat limit** dùng chung với system account (full cạn → code **106** tới sáng hôm sau). Thread: **không được @All** trong thread reply (code 4011).

### 12.4 Streaming (typewriter) — Jun 2026, client ≥3.67

Ba bước:
1. `POST …/messaging/v2/single_chat/init_stream` (hoặc `/group_chat/init_stream`) — body `employee_code|group_id` + `message{tag:"text", text{format, content:"Thinking…"}}` (+ thread_id/quoted nếu cần) → `{"code":0,"stream_id":"…"}`.
2. `POST …/update_stream` — body `employee_code|group_id` + `stream_id` + `seq` (đếm từ 1, +1 mỗi lần) + `finish` (false giữa chân, `true` lần cuối) + `message.text.content` = **NỘI DUNG ĐẦY ĐỦ từ đầu stream** (server render theo snapshot mới nhất — KHÔNG chỉ gửi phần tăng thêm).
3. Server tự close nếu có timeout.

Giới hạn: interval giữa 2 update **≤30s** (sai → stream chết tự động); tổng content ≤4096; gọi update cách ~200ms (không gõ từng ký tự). Vẫn dùng permission cũ; nhận ở client cũ → chỉ thấy tin cuối.
→ Dùng được cho **E1 sau này / engine fallback** cho phản hồi "agent đang soạn".

### 12.5 Typing indicator

`POST /messaging/v2/single_chat_typing` `{employee_code}` · `POST /messaging/v2/group_chat_typing` `{group_id, thread_id?}`. Hiện **4 giây**; 300/min; group >200 members → 7003; cần có event từ user trong 30s trước đó (4014).

### 12.6 Update interactive card

`POST /messaging/v2/update` `{message_id, message{interactive_message{elements}}}` — chỉ update được card; bot phải là sender ban đầu, trong group phải còn là member; card tuổi ≤7 ngày; 100/min & 20/s.

### 12.7 Đọc lại tin

| API | Endpoint | Ghi chú |
|---|---|---|
| Get message by ID | `GET /messaging/v2/get_message_by_message_id?message_id=` | cả 1-1 + group; 100/min & 20/s |
| Get chat history (group) | `GET /messaging/v2/group_chat/history?group_id=&page_size=1..100&cursor=` | chỉ 7 ngày; ngược thời gian; trả `next_cursor` + `chat_history[]`; **permission cần duyệt quản lý**; 100/min |
| Get thread (group) | `GET /messaging/v2/group_chat/get_thread_by_thread_id?group_id=&thread_id=&page_size=&cursor=` | unthreaded → code **4010**; 100/min & 20/s |
| Get thread (1-1) | `GET /messaging/v2/single_chat/get_thread_by_thread_id?employee_code=&thread_id=` | 10 req/s; user phải trong Service Scope |

## 13. Group chat APIs (quản trị)

- **Joined list:** `GET /messaging/v2/group_chat/joined?page_size=&cursor=` → `joined_group_chats.group_id[]` + `next_cursor`.
- **Get Group Info:** cần permission + Availability scope; 100/min. Trả group info + settings + kiểu external/internal (May 2026).
- **Create Group Chat:** client ≥3.50.0; `members` tuỳ chọn 1–30; rate **100 group/ngày/app + 10/phút/app**; user members phải thuộc Service Scope của bot gọi; **bot tự add vào group qua API không fire `bot_added_to_group_chat`**.
- **Add / Remove Group Members** (Nov 2025): bot phải là member + group cho phép member add/remove; `employee_codes` + `bot_seatalk_ids` gộp ≤30/lần; rate **10 req/phút/app** mỗi API; không remove được owner/admin. Từ **Sep 2026**: bot được add/remove **bot khác** (bot kia cần Bot Access + online + cho phép qua Service Scope).

## 14. Khái niệm & chuẩn chung

- **SeaTalk ID vs employee_code:** SeaTalk ID = định danh **tài khoản SeaTalk** (độc lập với từng org; không đổi khi chuyển org profile); employee_code = định danh **profile trong từng org**. 1 SeaTalk account join được nhiều org → nhiều employee_code. Event trả cả hai; API gửi 1-1 dùng employee_code; @user trong markdown dùng SeaTalk ID (`target="seatalk://user?id=<SeaTalk_ID>"`).
- Xem SeaTalk ID bot: App > **Bot** > SeaTalk ID (đúng chỗ `9227685607` trong screenshot).
- **Tag tin nhận được:** `text`, `image`, `file`, `video`, `combined_forwarded_chat_history` (forward dồn ≤3 tầng; content = mảng message nested; tag lạ (vd `note`, poll, sticker…) vẫn tới nhưng các field type null — **không parse được nội dung**).
- **Markdown gửi tin (text.format=1):** bold `**`, italic `*`, inline code `` ` ``, code block, ordered/unordered list; xuống dòng `\n\n`; **@All = `<mention-tag target="seatalk://user?id=0"/>`**; escape `\`. Tag `markdown` riêng đang bị **phase-out** → luôn dùng `text` + format 1. **Table-formatted text** mới (Jun 2026) cho cả bot + system account.
- **Interactive card:** client ≥3.38.1. Elements: `title` (≤120 ký tự từ Nov 2025), `description` (≤1000), `button` (`callback` → event click; `redirect` → `mobile_link`/`desktop_link` type `web`/`rn`), `image`, `button_groups` (≤3 nút/hàng; Aug 2025). Card i18n: `default` + key locale (`zh-Hans`…). Chi tiết build card (spec element + sample) nằm ở raw file `build_an_interactive_message_card.md` / `interactive_message_card_sample_code.md` raw giữ ở máy user.
- **Pagination chuẩn:** đơn `page_size` 1–100 + `cursor`; response `next_cursor` rỗng = hết data; cursor invalid (2003) / expired (2004).

## 15. Contacts & platform APIs khác (tóm)

| API | Endpoint | Ghi chú |
|---|---|---|
| Get Employee Profile | `GET /contacts/v2/profile?employee_code=` (×N ≤500) | trả `employee_code, seatalk_id, seatalk_nickname, avatar, name, email, departments[], gender, mobile, reporting_manager_employee_code, offboarding_time, custom_fields[]`; cần Data Scope |
| Get Employee Code With Email | `POST /contacts/v2/get_employee_code_with_email` `{emails[] ≤500}` | trả cả employee_status 0 none/1 pending/2 in position/3 leaving/4 terminated |
| Get User Language Pref | `GET /contacts/v2/language_preference` | ngôn ngữ client; code: `en`,`zh-hant`,`zh-hans`,`id`,`th`,`vi` |
| Check Employee Existence | `GET /contacts/v2/check_employees` | theo SeaTalk ID |
| Verify SSO Token | `POST /sso/v2/verify` `{token}` | Web SDK `getSSOToken()` → identity `{employee_code,name,email}` |
| Verify Login with SeaTalk Code | `GET /open_login/code2employee?code=` | code từ redirect URI, **hết hạn 10 phút**; trả profile + mobile |
| Send Service Notice | `POST /messaging/v2/service_notice/i18n` (+ bản mới interactive) | 1 chiều vào **Application Center** (chatlist) — cần Service Scope |
| Notification badge | `POST /messaging/v2/badge` | badge đỏ trên Workspace |
| Department CRUD / Onboard / Update / Delete employee | `…` (xem file raw) | quản trị HRIS qua API |
| Audit logs | `POST /governance/admin_logs` | chỉ org được chọn |
| App Link | generate + get origin URL | 100k vĩnh viễn + 500k/ngày; mobile ≥3.26 |

## 16. Error codes (tra nhanh)

**Server API (HTTP 200 + body `{code:…}`):**

| Code | Ý nghĩa |
|---|---|
| 0 | thành công |
| 100 | token hết hạn / sai (hay quên prefix `Bearer`) |
| 101 | rate limit |
| 102 | body sai/missing |
| 103 | thiếu API permission |
| 104 | bot capability chưa bật |
| 105 | app chưa Online |
| **106** | **hạn mức tin hằng ngày của chat đã cạn** (bot+sys account cùng) — chờ sang ngày |
| 1000 | app_secret sai |
| 2000–2004 | SSO token sai/hết; token app khác; cursor invalid (2003) / expired (2004) |
| 3000 | không tìm thấy user theo email (ngoài scope) |
| 3001 | không tìm thấy user theo employee_code (ngoài scope / code sai) |
| 3002 | (dep) user không subscribe |
| 3003 | user chưa đăng nhập SeaTalk |
| 4000 | tag tin không hợp lệ |
| 4001 | tin vượt độ dài/kích thước |
| 4002 | gửi tin thất bại |
| 4003 | tin rỗng |
| 4005 | quote không hợp lệ (>7 ngày / khác feed) |
| 4007 | sai định dạng ảnh (chỉ JPG/PNG/GIF) |
| 4008 | message_id không phải quoted message |
| 4009 | message hết hạn |
| 4010 | thread không tồn tại (ID không root / hết hạn) |
| 4011 | **@All không được trong thread reply** |
| 4012 | không có quyền edit (không phải sender / không data scope / group giải tán) |
| 4013 | chính sách org chặn liên hệ user |
| 4014 | typing: không có event nào từ user trong 30s trước |
| 5000–5003 | appID mismatch / linkID expired / **app chưa release** (5002) / hết hạn mức tạo app link (5003) |
| 7000 | group không tồn tại |
| **7001** | **bot không phải member của group** |
| 7002 | group không đủ member (min) |
| 7003 | group full (>200 members với typing) |

**System Account webhook:** 0 ok · 1 webhook hỏng (sys account xóa) · 2 đang inactive · 3 vượt dài · 4 rỗng · 5 ảnh quá lớn · 6 ảnh sai type · 7 tag lạ · 8/101 rate limit · 9/11/13 server · 102 params · 106 daily chat limit · 4001 dài · 4002 ảnh sai format. **HTTP 200 không đủ — phải đọc `code` trong body.**

**Web SDK:** 1000 lỗi native · 1001 params sai · 1002 không tìm thấy function.

## 17. Công cụ & khả năng platform khác (hữu ích khi cần)

- **3 phương thức messaging** (so sánh từ docs Overview of Messaging Methods): **Bot** 2 chiều (1-1 + group) — cần event callback để nhận; **System Account** 1 chiều vào group (webhook, không cần app); **Service Notice** 1 chiều vào Application Center (app riêng + Service Scope). Chọn cho P4: hạn tin cá nhân 1-1 → bot; thông báo group → system account hoặc bot; thông báo cá nhân nhẹ → service notice.
- **SeaTalk Link** (client ≥3.40): `https://link.seatalk.io/profile/open?seatalk_id=…` mở profile user/bot/tin nhắn — hữu ích làm deep-link trong output.
- **Web SDK** (`@seatalk/web-app-sdk` npm): getSSOToken, shareApp, toast/dialog/loading, pickImages/showImages/fetchImage, scanCode, getSystemInfo, listen/emit…, đóng gói web page thành SOP Web App có top-nav + SSO.
- **SeaTalk Open Platform MCP** (`open.seatalk.io/mcp`, **intranet-only**, hoặc npm `seatalk-mcp-server` với env `SEATALK_APP_ID/SECRET`): cho AI assistant tra docs/API SeaTalk trực tiếp — không truy cập được từ cloudshell (intranet-only).
- **SeaTalk Developer Tools** (Mac/Win): IDE debug Web App qua URL + demo Web SDK — chủ yếu cho Web App (E1 nếu sau này muốn nhúng khung).
- **Login with SeaTalk**: 3 cách (JS button redirect / One-Tap / code2employee); OAuth code hết hạn 10 phút; mobile ≥3.17.

## 18. Timeline API đáng nhớ (từ changelog SOP)

| Ngày | Thay đổi |
|---|---|
| 22 Sep 2026 | Bot add/remove bot khác trong group (Bot Access) |
| 24 Jun 2026 | Table-formatted text cho bot + system account |
| 12 Jun 2026 | **Streaming message** (typewriter, client ≥3.67) |
| 21 May 2026 | Group external/internal detect ở bot event + group info |
| 23 Jan 2026 | Thread trong 1-1 user–bot (client ≥3.62.1) |
| 21 Nov 2025 | Add/Remove group members APIs; card thêm element image; title 120 |
| 8 Aug 2025 | Event `new_message_received_from_thread` (follow thread) |
| 10 Jul 2025 | Event `user_enter_chatroom_with_bot` |
| 12 Jun 2025 | Typing status APIs |
| 29 May / 06 Feb 2025 | Bỏ hoàn toàn logic subscribe bot + API subscriber list |
| 14 Nov 2024 | 1-1 nhận/gửi image/file/video (client ≥3.50) + thread_id/quoted trong event |
| 17 Oct 2024 | API Update Message (card) |
| 11 Jun 2024 | Thread trong group chat (client ≥3.44.5) |

## 19. Đối chiếu dự án (cập nhật sau đợt 2)

| Mảnh mới | Đúc kết cho dự án |
|---|---|
| Event 1-1 trả **cả `seatalk_id` + `employee_code` + `email`** | E2 log/label theo cặp ID, bridge không cần lo org id |
| **Daily per-chat limit (106)** dùng chung bot+sys account | E2 output chạy qua Agent (Agent tự gửi) ít đụng; P4 nếu tự gửi phải throttle theo chat/ngày |
| **Streaming + typing APIs** | Nếu sau này engine tự dựng (P2-F): đang soạn tin dài → typing/update_stream; **Agent SeaTalk của Smart tự lo** — chỉ cần lúc engine fallback |
| media URL + token, hết hạn 7 ngày | P2-B: ảnh đi vào qua event là URL download — tải ngay (kèm token) rồi lưu Drive, **không cất URL lâu** |
| `sender_type` (1 user / 2 bot / 3 sysacc) | tránh loop: engine/bridge phải bỏ qua event do chính tin bot gửi ra |
| Thread support (group + 1-1) | P2-C group: trả lời trong thread (thread_id) giữ ngữ cảnh |
| 4010/4011/4005 error semantics | guard P2-C/P3 khi parse output |
| Rate limits chốt số | throttle bridge: 1-1 300/min, group 100/min, media download 100/min — đủ dư mức dự án |
| code 106 daily per-chat + sys account rate miễn phí | P4: dùng **system account webhook** cho thông báo group hàng loạt, bot cho 2 chiều |
| App statuses + `App not released yet` (5002) | nếu quên release mới scope → mã lỗi 5002 thay vì "không rõ" |
| MCP `open.seatalk.io/mcp` intranet-only | không dùng nổi từ cloudshell — docs vẫn cắt nghĩa thủ công như file này |

