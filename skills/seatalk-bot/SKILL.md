---
name: seatalk-bot
description: Build, wire and debug bots on the SeaTalk Open Platform (openapi.seatalk.io) — app setup & scopes, app access token, send to group/1-on-1, event callbacks & signature, interactive cards, threads, media, rate limits, error codes. Use when the user says "seatalk bot", "seatalk", "bot SeaTalk", "seatalk api", "openapi.seatalk.io", "seatalk webhook", or ships a Sheets/GAS/CI notification into a SeaTalk group.
license: MIT
metadata:
  author: Duc-Nguyen-739
  version: "1.0"
  category: api
  triggers: ["seatalk bot", "seatalk", "bot seatalk", "seatalk api", "seatalk open platform", "openapi.seatalk.io", "seatalk webhook", "interactive message card", "seatalk group chat"]
---

# SeaTalk Bot — Open Platform Playbook

> Everything needed to take a SeaTalk bot from "app created" to "handles messages in a group": channel choice, auth, send/receive, cards, threads, limits, and the error-code → cause → fix map.

## When to Use

- Building or debugging anything against `openapi.seatalk.io` — bot, group chat, service notice, contacts.
- Notifications: Google Sheets / Apps Script / CI / cron → SeaTalk group or 1-on-1.
- A bot that receives user messages, gets `@`-mentioned, or has interactive buttons.
- Errors like `4010`, `7001`, `103/104/105`, "callback not verifying", "token expired", "message not delivered".
- Setup questions: scopes, permissions, app status, release, group ID discovery.

Not for: Workspace App / Web SDK front-end work (`@seatalk/web-app-sdk`) or RN app packaging (`@seatalk-rn/cli`) — see *Adjacent capabilities* at the bottom.

## RULE 0 — five preconditions (check before writing a single call)

Nearly every "the bot doesn't work" report is one of these, not a code bug:

| # | Precondition | Symptom when missing |
|---|---|---|
| 1 | **Bot capability enabled** in the app | `104` bot capability not turned on |
| 2 | **App status = Online** (not *Not Configured* / *Maintenance* / *Offline*) | `105` app is not online |
| 3 | **API permission granted** for the exact endpoint | `103` permission denied · `4012` no permission |
| 4 | **App released** + target user inside **Service Scope** | `3002` deprecated subscriber error · `5002` app not released |
| 5 | **Token cached**, refreshed before `expire` (7200s) | `100` token expired/invalid · `1000` invalid app secret |

## Choose the channel first

| Method | Channel | Direction | Setup cost | Use for |
|---|---|---|---|---|
| **Bot** | 1-on-1 + any group | two-way | App + capability + callback URL | FAQ bot, AI assistant, commands, group @mention |
| **Workspace App** | Workspace tab (web / RN) | interactive | Web URL or `.stb` bundle + release | Dashboards, forms, tools with UI |
| **Service Notice** | App Center | one-way | `Send Service Notice` permission | Reminders, "your payslip is ready", nudges |
| **System Account** | one group | one-way | Desktop app only → webhook URL | DevOps alerts, group announcements |

Rule of thumb: needs a **reply** → Bot. Needs a **screen** → Workspace App. Needs a **nudge with no reply** → Service Notice.

## Architecture

```
user ──► SeaTalk client ──► Open Platform ──► POST callback URL ──► your server
                                                                  │ (verify signature)
                                                                  ▼
                                       app_access_token ──► openapi.seatalk.io ──► send / read
```

Terms that bite: **SeaTalk ID** (account-level, unique per person, in *Me → Profile*) vs **employee_code** (org-level id used by every API). **Service Scope** = who may use the app. **Data Scope** = whose employee data the app may read. **Permission** = which endpoints may be called. All three must line up.

## Step 1 — Create and configure the app

1. `open.seatalk.io` → *Create app* → wizard (basic info → service/data scope).
2. Copy **App ID** (Basic Info) and **App Secret** (Basic Info → Credentials). Regenerating the secret breaks every live deployment.
3. Enable the **Bot capability** → left menu gains a `Bot` section. Default API permissions switch on automatically.
4. Grant permissions explicitly: *Send Message to Bot User*, *Send Message to Group Chat*, *Send Service Notice*, *Get Group Info*, *Get Joined Group Chat List*, *Get Thread by Thread ID*, *Get Chat History* (needs org approval), *Get Contact Profile*, *Get Employee Code with Email*, *Set Typing Status in Private/Group Chat*, *Create Group Chat*, *Add/Remove Group Members*.
5. **Advanced Settings → Event Callback** → set `https://your-server.com/callback`. Handle the verification handshake (Step 4). Signing Secret lives here too.
6. *Scopes & Permissions* → **Apply for Service Scope** (department breadcrumb or employee whitelist) and **Data Scope**; then **Release** the app. Without a release, scope-dependent calls fail.
7. Set status → **Online**.

Find a `group_id`: `GET /messaging/v2/group_chat/joined`, or capture it from the `bot_added_to_group_chat` event. Note: a group created **by the bot via API does not auto-add the bot** and fires no event.

## Step 2 — Auth (get and cache the token)

```bash
curl -X POST https://openapi.seatalk.io/auth/app_access_token \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"APP_ID","app_secret":"APP_SECRET"}'
# {"code":0,"app_access_token":"c8bda0...","expire":1590581487}
```

- `Authorization: Bearer {app_access_token}` on every other call.
- Valid 7200s. Cache in memory/Redis keyed by app_id; refresh ~5 min before `expire`; refresh on `code: 100`. Do **not** fetch a token per request — the endpoint allows only **600/hour**.
- Token is app-wide, not per user. Every bot using that app shares it and shares the rate limits.

## Step 3 — Send (payload cookbook)

```bash
# To a group (thread reply = add thread_id; quote = add quoted_message_id)
POST /messaging/v2/group_chat          {"group_id":"abc","message":{"tag":"text","text":{"format":1,"content":"Hi **team**"}}}
POST /messaging/v2/group_chat          {"group_id":"abc","thread_id":"t1","message":{...}}
# To one user
POST /messaging/v2/single_chat         {"employee_code":"e_123","message":{...},"usable_platform":"all"}
# Service notice (App Center, one-way)
POST /messaging/v2/service_notice/send_message
     {"tag":"interactive_message","interactive_message":{"default":{"elements":[...]}},"employee_codes":["e_1","e_2"]}
# "Typing..." while a slow LLM thinks (shows 4s; 300/min)
POST /messaging/v2/group_chat_typing   {"group_id":"abc","thread_id":"t1"}
POST /messaging/v2/single_chat_typing  {"employee_code":"e_123"}
# Rewrite a card you already sent (within 7 days, same bot, bot still in group)
POST /messaging/v2/update              {"message_id":"m1","message":{"interactive_message":{"elements":[...]}}}
```

`format`: `1` = Markdown, `2` = plain text. Text content ≈ 4096 chars max.

Message tags: `text` · `image` (Base64 ≤5MB, PNG/JPG/GIF only) · `file` (Base64, 5MB max / 10B min, `filename` ≤100 chars) · `interactive_message` · `markdown` (**phasing out — use `text` + `format: 1`**) · streaming (client 3.67+, typewriter effect) · Markdown tables (3.67+).

Mention tags inside content:

```
<mention-tag target="seatalk://user?email=user@company.com"/>   # by email
<mention-tag target="seatalk://user?id=1234567890"/>             # by SeaTalk ID
<mention-tag target="seatalk://user?id=0"/>                       # @all (needs group setting)
```

Markdown supported: `**bold**` `*italic*` `` `code` `` · lists (`-`, `*`, `+`, `1.`) · nested lists (4 spaces/1 tab, 3.56+) · ```` ``` ```` code blocks · tables (3.67+, text messages only, not inside card descriptions) · `<br />` for line breaks · escape with `\\`. Received messages come back **plain text** — bold/italic/code are flattened, lists keep their markers, tables become space-separated rows, mentions become `@name` with ids in `mentioned_list`.

Unsupported inbound tags return `null` content: `gif`, `sticker`, `audio`, `contact_card`, `link`, `redirect_message`, `group_invitation_link`, `location`, `note`.

## Step 4 — Receive (event callbacks)

**Verification handshake** — on saving the URL, SeaTalk POSTs with `seatalk_challenge`. Reply HTTP 200 with that exact value in the body within **5s** (3 retries). Handle it *before* signature verification.

**Signature** — header `Signature`, `sha256(raw_body + signing_secret)` hex, case-insensitive. Compute over the **raw request bytes**, before any JSON parse or re-serialization.

```python
import hmac, hashlib
def verify(raw: bytes, signing_secret: str, signature: str) -> bool:
    expected = hashlib.sha256(raw + signing_secret.encode()).hexdigest()
    return hmac.compare_digest(expected.lower(), (signature or "").lower())
```

| Event | Fires when | Key payload | Typical reply |
|---|---|---|---|
| `user_enter_chatroom_with_bot` | user opens the 1-on-1 chat (3.56+) | `employee_code`, `seatalk_id` | welcome message |
| `message_from_bot_subscriber` | 1-on-1 text/image/file/video | `employee_code`, `message.message_id`, `message.thread_id` | `POST /messaging/v2/single_chat` |
| `new_mentioned_message_from_group_chat` | someone `@`s the bot in a group (`@all` does **not** fire) | `group_id`, `message`, `message.thread_id` | `POST /messaging/v2/group_chat` with `thread_id` |
| `new_message_received_from_thread` | new post in a thread the bot follows or started | `group_id`, `thread_id`, `message` | reply inside the thread |
| `interactive_message_click` | callback button tapped | `message_id`, `value`, `group_id`, `thread_id`, `employee_code` | `POST /messaging/v2/update` the card |
| `bot_added_to_group_chat` | added to a group | `group.group_id`, `group.external`, `inviter` | intro message |
| `bot_removed_from_group_chat` | removed, or group disbanded | `group_id`, `remover` | cleanup state |
| `group_chat_converted_to_external_group` | internal group → external group | `group_id`, `operator` | **stop leaking org data** |
| `new_bot_subscriber` | **deprecated** (logic removed 2025-02-06) | — | use `user_enter_chatroom_with_bot` |

Older event name still seen in the wild: `new_mentioned_message_received_from_group_chat` — accept both aliases.

Handler rules: always return 200 fast (queue heavy work), dedupe on `event_id`, skip events when the app is not Online, and never block on a slow LLM without first calling the typing-status API.

No public IP? SeaTalk also delivers events over **WebSocket** (Go / Python SDK, outbound connection only). One delivery method at a time per bot — pick URL callback *or* WebSocket.

## Step 5 — Interactive message cards

| Element | Fields | Limits per card |
|---|---|---|
| `title` | `text` | 1–120 chars, ≤3 |
| `description` | `text`, `format` (1=MD, 2=plain) | 1–1000 chars, ≤5 |
| `button` | `button_type`, `text`, `value`, `mobile_link`, `desktop_link` | text 1–50 chars, ≤5 |
| `button_group` | 1–3 buttons | ≤3 groups |
| `image` | `content` (Base64) | ≤5MB, ≤3 |

Send shape is `interactive_message.elements` (array); service notices and i18n cards use `interactive_message.<lang>.elements` with `default` as fallback (`en`, `zh-Hant`, `zh-Hans`, `id`, `th`, `vi`). Received cards carry `mentioned_list` alongside `elements`.

```json
{"tag":"interactive_message","interactive_message":{"elements":[
  {"element_type":"title","title":{"text":"Leave request"}},
  {"element_type":"description","description":{"format":1,"text":"Jane: 3–5 Mar (sick leave)."}},
  {"element_type":"button","button":{"button_type":"callback","text":"Approve","value":"approve"}},
  {"element_type":"button","button":{"button_type":"redirect","text":"Details",
     "mobile_link":{"type":"web","path":"https://app.com/req/1"},
     "desktop_link":{"type":"web","path":"https://app.com/req/1"}}}
]}}
```

`callback` → you get `interactive_message_click` with that `value`. `redirect` → opens the link; `mobile_link.type` may be `web` or `rn`. Turn the card into a live widget by replying to the click with `POST /messaging/v2/update` (same bot, ≤7 days, bot still in the group).

## Step 6 — Threads, groups, contacts, media

| Endpoint | Method | Notes |
|---|---|---|
| `/messaging/v2/group_chat/joined` | GET | list group IDs the bot joined |
| `/messaging/v2/group_chat/info` | GET | name, settings, user/bot/system-account lists, `external` |
| `/messaging/v2/group_chat/history` | GET | last **7 days only**, newest first, needs org approval |
| `/messaging/v2/group_chat/get_thread_by_thread_id` | GET | `?group_id=&thread_id=`, 7 days |
| `/messaging/v2/single_chat/get_thread_by_thread_id` | GET | `?employee_code=&thread_id=` (client 3.62.1+) |
| `/messaging/v2/get_message_by_message_id` | GET | by `message_id` or `quoted_message_id` |
| `/messaging/v2/group_chat/create_group` | POST | owner + 1–30 members, `role` 0=member 1=admin, `chat_history_for_new_members` 0/1/2 |
| `/messaging/v2/group_chat/add_group_members` | POST | 1–30 `employee_codes`, group setting "allow members to add members" must be ON |
| `/messaging/v2/group_chat/remove_group_members` | POST | owners/admins cannot be removed |
| `/contacts/v2/profile` | GET | up to **500** `employee_code` per call → name, email, seatalk_id, departments |
| `/contacts/v2/get_employee_code_with_email` | POST | emails → employee_code (≤500) |
| `/contacts/v2/check_employees` | GET | SeaTalk IDs → is_employee + employee_code |
| `/sso/v2/verify` | POST | Web/RN SSO token → `{employee_code, name, email}` |
| `/open_login/code2employee?code=` | GET | Login-with-SeaTalk code → profile (code dies in 10 min) |

Thread rules: a message with a `thread_id` is threaded; **root** = `thread_id == message_id`, **reply** = they differ. Reply with `thread_id` at the top level of the body. `@all` inside a thread → `4011`. Replies older than 7 days are gone; whisper and deleted messages are never returned.

Pagination is cursor-based everywhere: send `page_size` (1–100, default 50) on the first call, then echo the response's `next_cursor` back as `cursor`. Empty `next_cursor` = done. Expired cursor → `2004`.

Media (images / video / files arriving at the bot) is delivered as a `content` **URL** starting with `https://openapi.seatalk.io/messaging/v2/file/...` that requires `Authorization: Bearer <app_access_token>` and **expires in 7 days** (≤250MB, 100 req/min · 30/sec). Download it immediately; never store the URL.

## Step 7 — Reference client (copy, then adapt)

```python
import hashlib, hmac, json, time, requests

BASE = "https://openapi.seatalk.io"

class SeaTalkBot:
    def __init__(self, app_id: str, app_secret: str, signing_secret: str):
        self.app_id, self.app_secret, self.signing_secret = app_id, app_secret, signing_secret
        self._token, self._expire = None, 0.0

    def token(self) -> str:
        if self._token and time.time() < self._expire - 300:      # refresh 5 min early
            return self._token
        d = requests.post(f"{BASE}/auth/app_access_token", timeout=10,
                          json={"app_id": self.app_id, "app_secret": self.app_secret}).json()
        if d.get("code") != 0:
            raise RuntimeError(f"auth failed: {d}")
        self._token, self._expire = d["app_access_token"], d["expire"]
        return self._token

    def post(self, path: str, body: dict) -> dict:
        r = requests.post(f"{BASE}{path}", timeout=10, json=body,
                          headers={"Authorization": f"Bearer {self.token()}"})
        d = r.json()
        if d.get("code") != 0:
            raise RuntimeError(f"{path} -> {d}")
        return d

    def send_group(self, group_id, content, thread_id=None):
        body = {"group_id": group_id,
                "message": {"tag": "text", "text": {"format": 1, "content": content}}}
        if thread_id:
            body["thread_id"] = thread_id
        return self.post("/messaging/v2/group_chat", body)

    def send_direct(self, employee_code, content, usable_platform="all"):
        return self.post("/messaging/v2/single_chat", {
            "employee_code": employee_code,
            "message": {"tag": "text", "text": {"format": 1, "content": content}},
            "usable_platform": usable_platform})

    def verify(self, raw: bytes, signature: str) -> bool:
        expected = hashlib.sha256(raw + self.signing_secret.encode()).hexdigest()
        return hmac.compare_digest(expected.lower(), (signature or "").lower())
```

Callback handler (any framework — keep it thin):

```python
def callback():
    raw = request.get_data()                                   # RAW bytes, before json parsing
    challenge = request.args.get("seatalk_challenge") or request.form.get("seatalk_challenge")
    if challenge:                                              # RULE: handshake precedes signature check
        return challenge, 200                                  # must be < 5s
    if not bot.verify(raw, request.headers.get("Signature", "")):
        return "", 401

    evt = json.loads(raw)
    e, kind = evt.get("event", {}), evt.get("event_type")
    if kind == "message_from_bot_subscriber":
        bot.send_direct(e["employee_code"], handle(e["message"]))
    elif kind in ("new_mentioned_message_from_group_chat",
                  "new_mentioned_message_received_from_group_chat"):
        msg = e["message"]
        bot.send_group(e["group_id"], handle(msg), thread_id=msg.get("thread_id"))
    elif kind == "interactive_message_click":
        bot.post("/messaging/v2/update", build_card_state(e))   # e.g. "✅ Approved by …"
    elif kind == "group_chat_converted_to_external_group":
        pause_group(e["group_id"])                             # external group → stop internal data
    return "", 200                                              # always fast; queue the heavy work
```

Sheet/CI notifier in Google Apps Script (no server, no signature step — outbound only):

```javascript
const CFG = { APP_ID: '…', APP_SECRET: '…', GROUP_ID: '…' };

function getToken() {
  const r = UrlFetchApp.fetch('https://openapi.seatalk.io/auth/app_access_token', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ app_id: CFG.APP_ID, app_secret: CFG.APP_SECRET })
  });
  const d = JSON.parse(r.getContentText());
  if (d.code !== 0) throw new Error(JSON.stringify(d));
  return d.app_access_token;
}

function sendGroup(content) {
  const payload = { group_id: CFG.GROUP_ID,
    message: { tag: 'text', text: { format: 1, content } } };   // format 1 = Markdown → tables work
  return JSON.parse(UrlFetchApp.fetch('https://openapi.seatalk.io/messaging/v2/group_chat', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getToken() },
    payload: JSON.stringify(payload)
  }).getContentText());
}

function sheetToSeaTalk() {                                     // schedule via Triggers → Time-driven
  const [head, ...rows] = SpreadsheetApp.getActive().getDataRange().getValues();
  const line = (r) => '| ' + r.join(' | ') + ' |';
  const md = ['📊 ' + head[0], '', line(head), '|' + head.map(() => '---').join('|') + '|',
              ...rows.map(line), '', '_' + new Date().toLocaleString('vi-VN') + '_'].join('\n');
  sendGroup(md);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 SeaTalk').addItem('Gửi sheet vào nhóm', 'sheetToSeaTalk').addToUi();
}
```

## Rate limits

| Endpoint | Limit |
|---|---|
| Most APIs | 1000/min |
| `auth/app_access_token` | 600/hour |
| Send to bot user | 300/min · 20/sec |
| Send to group chat | 100/min · 20/sec |
| Get group info · chat history · thread (group) | 100/min |
| Thread (private chat) | 10/sec |
| Get message by ID · update message · file download | 100/min · 20–30/sec |
| Set typing status | 300/min |
| Create group chat | 100/day · 10/min |
| Add / remove group members | 10 groups/min (1–30 users per call) |
| Service notice | daily per-recipient limit |
| System account | 60/min, then a 10-minute silence period |

Group chats also enforce a **daily per-chat message limit shared by every bot and system account** in that chat — one noisy bot starves the rest. `usable_platform: "mobile"` renders a placeholder on desktop instead of a broken card.

## Error codes → cause → fix

| Code | Meaning | Fix |
|---|---|---|
| `0` | success | — |
| `100` | token expired/invalid | refresh token; confirm `Bearer ` prefix |
| `101` | rate limit exceeded | back off, batch, check the table above |
| `102` | invalid input | check body/query types |
| `103` | app permission denied | grant the API permission, re-release |
| `104` | bot capability off | enable Bot capability |
| `105` | app not online | set status Online (admin may have forced Offline) |
| `106` | daily limit reached | spread sends; wait for the next day |
| `1000` | invalid App Secret | copy again; regenerate the secret if rotated |
| `2000`–`2004` | SSO token / cursor problems | re-run SSO; restart pagination (`2003` invalid, `2004` expired cursor) |
| `3000` / `3001` | user not found by email / code | verify with `/contacts/v2/check_employees` |
| `3002` | (deprecated) not a subscriber | real cause: user outside Service Scope, or app not released |
| `3003` | user not signed in to SeaTalk | cannot deliver; drop with a log |
| `4001` / `4003` | message too long / empty | trim to ~4096 chars |
| `4006` | sensitive info, outside org | strip org data before posting to external groups |
| `4007` | bad image format | PNG/JPG/GIF only, Base64, ≤5MB |
| `4009` | message id not found | ids are per-app and expire — store the id you sent |
| `4010` | thread not found | `thread_id` points to an unthreaded or >7-day-old message |
| `4011` | `@all` in a thread reply | remove the mention tag |
| `4012` | no permission to update | only the original bot, ≤7 days, still in group |
| `5002` / `5003` | app not released / link quota | release the app |
| `7000` | group not found | bad `group_id` |
| `7001` | bot not in group | add the bot, or use a group from `/group_chat/joined` |
| `7002` / `7003` | group membership / size limit | docs disagree on which is "full"; both mean the add failed — check `add_failed[]` and group size (typing stops above 200 members) |

System account codes: `1` invalid webhook URL · `2` account inactive · `3`/`4001` too long · `4` empty · `5` image too large · `6` invalid image type · `7` unsupported type · `8`/`101` rate limit · `9`/`11`/`13` server error · `102` invalid params · `106` daily limit · `4002` invalid image.

## Anti-patterns (each one costs a debugging round)

- Fetching a token per call — 600/hour, you will hit `101` in minutes. Cache and refresh early.
- Verifying the signature after `json.loads` / `JSON.stringify` — the digest is over raw bytes; any re-serialization breaks it.
- Checking the signature before answering `seatalk_challenge` — the verification request may be unsigned; you fail configuration.
- Replying in chat instead of in the thread — always echo `thread_id` from the event payload, or context is lost.
- Sending `"tag":"markdown"` — deprecated; use `text` + `format: 1`.
- Treating `message_id` as global — ids differ per app by design (privacy). Use the id returned by *your* send call.
- Storing media URLs from inbound events — they expire in 7 days; download to storage immediately.
- Assuming `@all` reaches everyone — needs the group's "Notify all members with @All" setting; and never in a thread (`4011`).
- `@`-mentioning the bot with `@all` and expecting the event — `@all` never fires `new_mentioned_message_from_group_chat`.
- Using the deprecated `new_bot_subscriber` / subscriber-list APIs — subscription logic was removed 2025-02-06; use `user_enter_chatroom_with_bot`.
- Ignoring `group_chat_converted_to_external_group` — the moment a group goes external you must stop posting internal data (`4006`).
- Building the group with `create_group` and expecting membership — the creating bot is not auto-added.
- Long LLM replies without `typing` API — users see dead air; show typing, then answer.
- Logging the `Signature` header or app secret — secrets in logs leak into chat-ops channels.
- Hardcoding `group_id` — discover it via `/group_chat/joined` or the `bot_added_to_group_chat` event so transfers don't break the bot.

## Client version gates

| Version | Unlocks |
|---|---|
| 3.17 | Login with SeaTalk |
| 3.26 | App Links |
| 3.38.1 | update an interactive message |
| 3.44.5 | full thread interaction |
| 3.50 | images / files / videos from users to a 1-on-1 bot; `create_group` |
| 3.55 | typing status |
| 3.56 | nested lists; `user_enter_chatroom_with_bot` |
| 3.62.1 | threads in 1-on-1 chats |
| 3.67 | Markdown tables, streaming messages |

## Checklist before going live

| Area | Check |
|---|---|
| App | capability enabled · status Online · released · scopes applied |
| Auth | token cached with early refresh · secrets in env/secret manager, never in source |
| Callback | handshake < 5s · signature verified on raw bytes · 200 returned fast · dedupe on `event_id` |
| Messaging | `thread_id` echoed · `@all` absent from threads · limits in `usable_platform` considered |
| Media | inbound files downloaded immediately · PNG/JPG/GIF · ≤5MB |
| Cards | element counts within limits · every `callback` button has a click handler |
| Resilience | retry on `100` · backoff on `101` · alerting on `103/104/105` · dead-letter for failed sends |
| Ops | daily per-chat limit known · external-group event handled · secrets rotated at least once |

## Output Format

Follow host `AGENTS.md §8` if present, otherwise:

```
TL;DR ✅ Bot live — 1-on-1 + @mention + cards, 0 P0

| # | Sev | Item | Where | Fix / Done |
|---|---|---|---|---|
| 1 | 🟠 P1 | Token fetched per request | `server.py:41` | cache + refresh 5 min early |
| 2 | 🟡 P2 | `@all` inside thread reply | `reply.py:88` | drop mention tag (4011) |

Verdict: Ship / Hold
Next: 1) apply Service Scope  2) re-release  3) smoke-test a group mention
```

Markers: 🔴 P0 (bot cannot send/receive, secret exposure) · 🟠 P1 (breaks under load or scope) · 🟡 P2 (cosmetic/hardening).

## Adjacent capabilities (when the ask isn't a bot)

- **Workspace App (web)** — set the web URL, release to Mobile + Desktop Workspace, then use `@seatalk/web-app-sdk` (`npm i @seatalk/web-app-sdk`): `toast`, `showDialog`, `showLoading`/`hideLoading`, `getSSOToken` (valid 180s, one use), `getSystemInfo`, `showImages`, `pickImages`, `fetchImage`, `navigateBack`, `openUserProfile`, `scanCode`, `shareApp`, `emit`/`listen`, `openInExternalBrowser` (PC; whitelisted domains skip the confirm dialog). Verify SSO server-side via `POST /sso/v2/verify`, then keep your own session/JWT.
- **RN App** — `create-seatalk-app`, dev on a SeaTalk Dev client, bundle with `@seatalk-rn/cli` (`npx bundle-app` → `.stb`), upload, release. Packages: `sdk-client`, `sdk-application`, `sdk-widgets`, `sdk-storage`, `sdk-navigator`, `sdk-config`, `sdk-location`, `sdk-scanner`, `sdk-share`.
- **Login with SeaTalk** — drop `auth.js` from `static.cdn.haiserve.com/seatalk/client/shared/sop/auth.js` plus the two divs; `data-response_type` must be `code`; exchange the code at `/open_login/code2employee`.
- **Approval Center** — `/approval_center/v2/create|get|update|delete` with `item_id`, `item_name`, `item_state`, `approval_chain`, `pending_list`; Data Scope must cover every person in the chain. Its callbacks use an `Authorization` signature (app secret + method + path + content-type + body MD5 + `Date` + `X-Token` + query), not the bot SHA-256 scheme.
- **Org sync** — `/oa_sync/employees/*` (onboard, update, reboard, delete, avatar), `/oa_sync/departments/*`, `/contacts/v2/departments`, `/contacts/v2/department/employees`. Admin-only by nature; needs the matching permission and Data Scope.
- **MCP server** — `npx -y seatalk-mcp-server` with `SEATALK_APP_ID` / `SEATALK_APP_SECRET` exposes messaging, group and contacts tools to an AI agent; `seatalk-oapi-sdk` (Go/Python) handles WebSocket events; `cs-bot` (Python) is a batteries-included bot framework (plugins, scheduler, FSM).

## References

- Docs: https://open.seatalk.io/docs · format: `/docs/format-a-message` · streaming: `/docs/send-streaming-message`
- Portal: https://open.seatalk.io · status: https://status.seatalk.io · help: https://help.seatalk.io
- SDKs: `seatalk-oapi-sdk` (Go/Python, WebSocket events) · `mukung26/seatalk_server` (MCP) · `seatalk-io/cs-bot` (Python bot framework) · `lf4096/openclaw-seatalk` (plugin)
- Related skills in this repo: `project-bootstrap` (GAS + Sheets patterns, matches the notifier snippet above), `systematic-debugging` (for `code: 0` responses that never arrive), `security-review` (signing secrets, secret hygiene)