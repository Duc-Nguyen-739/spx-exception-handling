# Smart Agents — distill từ docs portal (2026-10-17)

> Nguồn: `smart.shopee.io/docs/agents/agent-2-0/*` + `smart.shopee.io/docs/agents/classic-agents/*` (intranet-only, paste bởi user ngày 2026-10-17).
> File này là distill các fact quyết định + shape chính xác; bản raw 2 file `.txt` của user giữ ở máy họ.
> Quy tắc: KHÔNG ghi secret thật vào file này.

## Hai loại agent — cùng bộ kênh

| | **Agent 2.0** (editor Beaver) | **Classic agent** (Single/Multi) |
|---|---|---|
| Gọi workflow có sẵn | ✅ **Config → Smart Apps → Select Agent / Select Workflow** (bind released app; save chặn loop) | Qua Tools (workflow-as-tool không thấy trong docs classic; Smart Apps là khái niệm Agent 2.0) |
| Kênh Integrate | Live App · **SeaTalk Bot** · **Agent as API** | Live App · **SeaTalk Bot** · **Agent as API** |
| API async poll | không (sync/streaming) | `deployments/get_messages` |
| Interrupt endpoint | `continue_agent_v2_interrupt` | `continue_interrupt` |

→ Với usecase "gọi workflow SPX Tìm đơn tương đồng": **chọn Agent 2.0** vì Smart Apps bind Workflow trực tiếp.

## SeaTalk Bot channel (E2 — quan trọng nhất)

Cơ chế: **bot vẫn phải tự tạo trên SeaTalk Open Platform trước** (capabilities + scopes + release). Rồi:

1. Smart portal → Agent → **Integrate → SeaTalk Bot → New Bot**.
2. Form điền: *Name of this Integration* · **SeaTalk ID** · **App ID** · **Secret** · **Signing Secret** (mỗi mục có link "How to find").
3. Welcome Message: mặc định **On**, mode *Auto-generate based on Role & Prompt* (hoặc Custom).
4. Advanced Settings:
   - **Quoted messages**: On mặc định (bot đọc được tin user quote).
   - **Combined Message Delivery API**: không có switch trên form — **bật trong SeaTalk Open Platform** để agent nhận **ảnh + text trong cùng 1 message** (không bật sẽ thành 2 event riêng — ảnh hỏng usecase).
   - *Only show messages sent by tools*: Off mặc định (bật mà không có tool gửi tin → user nhận trống).
5. **Classic** ghi rõ bước cắm callback: Confirm xong Smart hiện **callback URL** → dán vào **Event Callback** của bot trên Open Platform → tick test tới khi success. (Agent 2.0 docs còn TODO chưa ghi bước này — làm thực tế sẽ thấy.)
6. SeaTalk push event tới **host Smart (in-network)** → agent xử lý → trả lời trong cùng thread.

### SEATALT config trong Agent Config (xuất hiện sau khi bot active)

| Row | Default | Ghi chú |
|---|---|---|
| Private chat replies | **In thread** | 1-1 trả trong thread mở từ tin; *Inline* = trả trong chat chính; group luôn thread |
| Live status | **On** | 1 status card khi agent đang chạy, xong gộp thành receipt |
| Group replies without @ | **On** | Rule: chỉ trong thread có agent; **1 người → không cần @**; người 2 vào → chỉ @ (agent báo 1 lần); option *Always* |

⚠️ Đổi các mạng này phải **Save + Release lại** mới tới SeaTalk (release = "deployed to integration channels if any").

### Scope group cần bật trên Open Platform

Bot lỗi không đọc được tin cũ trong thread → bật scope **Get Thread by Thread ID in Group Chat** rồi Check again.

## Agent gọi workflow (E2 core)

- Config → **Smart Apps** → **+ Apps** → *Select Workflow* → chọn released workflow (danh sách chỉ hiện app released mà ta có access).
- Save: Smart check **loop** (A→B→A bị từ chối "This binding creates a loop").
- Agent (Beaver-built) nhận tin nhắn tự do từ SeaTalk → LLM hiểu ảnh + text → gọi bound workflow → trả kết quả. Format kết quả do prompt/instructions định.

## Agent as API (đối chiếu cho E1/bridge)

**Host vẫn `smart.shopee.io` → GAS/cloudshell vẫn NXDOMAIN — E1 webapp vẫn cần bridge in-network, không đổi.**

### Invoke (cả 2 loại agent)

```text
POST https://smart.shopee.io/apis/smart/v1/orchestrator/deployments/invoke
{
  "endpoint_deployment_hash_id": "<HASH>",   // required
  "endpoint_deployment_key": "<KEY>",        // required — giữ trên server
  "user_id": "user-123",                     // REQUIRED — thiếu → validation_error 993001
  "message": {"input_str": "Hello"},         // required
  "session_id": "<optional>",                // bỏ → hội thoại mới; gửi lại để continue
                                             // (classic: message.thread_id; tự đặt được "order-42")
  "streaming": false,                        // true → SSE
  "auto_approve": true,                      // false → tool call phải approve qua interrupt
  "user_credentials": {"token_inputs":[{"token":"…","ref":"jira_token","domain":"jira.shopee.io"}]},
  "tool_variables": {"timezone":"Asia/Ho_Chi_Minh"},  // tool nhận 1 arg smart_injected_tool_variables
  "override_tool_variables": {…},            // cần workspace bật; 403 nếu chưa; không dùng để bảo mật
  "auto_clean_up_session_files": false       // true → xóa file hội thoại khi turn end (streaming phải false)
}
```

Response luôn **HTTP 200** envelope (Agent 2.0):

```json
{ "status":"success", "error":"", "error_message":"", "code":0,
  "data": { "response": { "response_str": "Hi!", 
             "session_id": "endpoint_deployment_<hash>_<id>",  // = thread_id
             "turn_index": 0, "interrupt_message": "", "interrupts": [], "citations": [] },
            "is_interrupted": false, "is_invoke_error": false } }
```

- **Response Type** panel: Default | **Plain Text** | **Force Serialize JSON** (structured output không envelope).
- Classic: `session_id` rỗng, `turn_index` null, `thread_id` = `<id>_<số release>`; có thêm `message_id`, `model_id_to_token_usage`, `deployment_id`.

### Streaming (SSE)

`"streaming": true` → `text/event-stream`: event theo thứ tự
`response.start {id, session_id/thread_id}` → `response.final_response.chunk {id, content}`×N → `response.complete {id, model_id_to_token_usage, kb_citations}`; lỗi → `response.error {id, error_code, error_message}`; pause → `interrupt`. Mỗi event có `id` — giữ cái cuối để reconnect.
Reconnect: `POST …/orchestrator/resume_stream {last_event_id, channel:"endpoint_deployment", channel_auth_fields{channel, endpoint_deployment_hash_id, endpoint_deployment_key, thread_id}}` — chỉ khi đang chạy; hết → 404 "worker not found".
⚠️ Classic: streaming + `mode:"async"` → 400 `153005` "Streaming is not supported when mode is async."

### Async (classic) — poll get_messages

`mode:"async"` → trả ngay `[async mode started]` + `thread_id`; poll **≥3s/lần**:

```text
POST https://smart.shopee.io/apis/smart/v1/orchestrator/deployments/get_messages
{ hash, key, thread_id }
→ data: { status: running|idle|interrupted|error,
          debug_tree: { input_output_messages: [{input, output, attachments, output_attachments, total_duration_ms}],
                        pending_interrupts, last_error_data, message_tree },
          deployment_info: {active_deployment_id, is_thread_from_active_deployment} }
```

Ảnh từ tool/KB: trong `output` là placeholder `![Image](image/980712)`; lấy base64 tại `output_attachments` item khớp.

### Files

```text
POST https://smart.shopee.io/apis/smart/v1/orchestrator/deployments/invoke_with_files  (multipart/form-data)
  fields: hash, key, user_id, input_str, [thread_id, mode], files=@report.pdf (lặp), user_credentials/tool_variables (JSON string)
```

`auto_clean_up_session_files` hoặc `POST …/deployments/clean_up_session_files {hash, key, session_id}` (409 khi agent đang trả lời; gọi 2 lần an toàn).

### Interrupt (agent hỏi/approve/login)

Kiểm tra `data.is_interrupted` mỗi lượt; trả lời `interrupt_id` **mới nhất** (cũ → "This answer does not fit the question that waits"):

- **Agent 2.0**: `POST …/orchestrator/deployments/continue_agent_v2_interrupt {hash, key, user_id, session_id, <một trong>}`:
  - `ask_user` → `"ask_user_response": {interrupt_id, "status":"answered", "answers":[…] 1 item/questions, hoặc "cancelled"}`
  - `tool_approval` → `"decisions": [{interrupt_id, "type":"approve"|"reject"(+message)|"edit"(edited_action)}]`
  - login tool → `tool_authorization.url` cho user connect rồi approve như tool_approval
  - `browser_takeover` → user vào `live_view_url` xong gửi `"browser_takeover_response": {interrupt_id, "status":"completed"|"cancelled"}`
- **Classic**: `POST …/orchestrator/deployments/continue_interrupt {hash, key, user_id, thread_id, interrupt_type, interrupt_command}`:
  - `human_in_loop` + `{answer:"…"}`;  `human_in_loop_tool` + `{is_authorized:true|false(+"interrupt_message")}`.

Send feedback (classic): `POST …/deployments/send_feedback {hash, key, thread_id, message_id, sentiment:"positive"|"negative"}`. `/learn` chỉ cho hội thoại khởi từ API + agent phải có learnt KB (500 `990000`).

## Errors & quota (cùng họ code với Workflow-as-API)

| HTTP | code | Ý nghĩa |
|---|---|---|
| 403 | `213003` | invalid key — key sai; tắt/bật lại endpoint **sinh cặp mới**, mọi caller phải cập nhật |
| 400 | `214024` | endpoint deployment not exists — hash sai **hoặc endpoint bị tắt** |
| 400 | `993001` | validation_error — thiếu field (tên field trong message) |
| 403 | `153006` | session_id không thuộc endpoint này |
| 409 | `127031` | agent đang trả lời trong hội thoại đó |
| 429 | — | RateLimitTimeoutError — chờ vài giây, **không retry vòng lặp** |
| — | `800001` | budget_exceeded — hết App Quota (workspace admin chỉnh) |

Rate guide: ~200 RPM thường, ~10 RPM nếu agent có Python Script tool (advisory, không block).
Endpoint tắt rồi bật lại → **Hash ID + Key mới**, chuỗi cũ chết ngay.

## Khác đáng nhớ

- **Release**: Save → Release (Name ≤40 · Description ≤500 · Release Note required); thành công = *"released and deployed to integration channels if any"*. Mọi thay đổi Config (kể cả SEATALT rows) chỉ tới người dùng sau **release lại**. Rollback = tạo release mới chạy config cũ.
- **Live App**: App Status mặc định OFF kể cả sau release; bật → link `smart.shopee.io/apps/a/<id>/live`; Access **Restricted** (whitelist, áp dụng ngay) hoặc Public (Public vẫn phải **đăng nhập Smart** — không ẩn danh).
- **Operate**: Usage (quota, metrics, Channel Proportion theo SeaTalk/API/Live App/Smart Platform); **Session History** (owner+editor mới thấy) mọi channel + Export ≤10k; **Feedback** inbox triage; Memory spaces.
- **Trigger**: time-trigger (Minutely→Monthly, timezone, expire); Builder-created / User-created.
- **Attachment pre-processing**: Images = Send Original File hoặc OCR (chọn Send Original File để giữ ảnh gốc cho workflow/LLM); PDF/PPT/Word video/audio tương tự; Table&Text luôn Extract.
- **Structured Output**: schema JSON cố định — hữu ích nếu E1 sau này muốn output máy đọc.
- **Memory**: off mặc định; personal ≤1000 ký tự, không load trong group; shared trễ ~30'.
- **App Quota**: workspace admin set; agent mới có spend cap mặc định — theo dõi **Operate → Usage**.

## Chưa chắc đợi test trong P2 (Agent SeaTalk)

1. Agent gọi Smart App (workflow) **có truyền được ảnh làm file-input của workflow** không (workflow input `photo` là File/dataURL) — test trong **Preview** trước khi cắm SeaTalk; thất bại 2 lần → fallback bot tự dựng.
2. Form SeaTalk Bot của Agent 2.0: callback URL tự cắm hay cần paste thủ công (docs còn TODO) — test thực tế trả lời.
3. App Quota/token mỗi tin SeaTalk (LLM) — đo trên Operate → Usage.

## Trang Bot thật trên SeaTalk Open Platform (screenshot user 2026-10-17)

- App hiện hữu của user: **"Backlog HN SOC"**, **Status: Online** (đã release). Capabilities: **Bot** (đang xem) · Workspace App (Web App / Release) · Login with SeaTalk.
- Trang Bot hiển thị: **SeaTalk ID `9227685607`** (+ nút Copy) và **SeaTalk Link** (`link.seatalk.io/profile/open?seatalk_id=…`) — link nhắn bot 1-1.
- **Bot Integrations**: 3 thẻ partner — *Alpha Knowledge · AI Bot Platform · **SMART*** — mỗi thẻ hiển thị cùng bộ **App ID / App Secret / Signing Secret** với nút Copy. Thẻ SMART ghi *"Copy these app details to SMART to enhance your bot"* → đây chính là 3/4 giá trị cần cho form Smart **Integrate → SeaTalk Bot** (giá trị thứ 4 = SeaTalk ID ngay phía trên).
- Menu trái gồm: *Basic Info & Credentials · App Managers · **Scopes & Permission** · Bot · Workspace App (Web App / Release) · Login with SeaTalk* và *Advanced Settings: **Event Callback** · Security Settings*.
- **Event Callback** (Advanced Settings) = nơi dán callback URL mà Smart phát sau khi Confirm form SeaTalk Bot (đối chiếu docs classic — bước "paste it under Event Callback, click the tick button to test").
- Quy tắc: **đổi Scopes phải Release lại** (Workspace App → Release) mới có hiệu lực.
- Chưa xác nhận từ screenshot: danh sách scopes đã cấp, cấu hình **Service Scope** (ai được chat bot), vị trí toggle **Combined Message Delivery API** (lục advanced settings khi cấu hình).
- Lưu ý chính sách: app mang tên/dịch vụ *Backlog HN SOC* — tái dùng cho "tìm đơn tương đồng" thì **Service Scope/quyền dính chung** với dịch vụ cũ; muốn tách sạch → tạo app riêng (chậm hơn, duyệt lại từ đầu).
