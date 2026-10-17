# Smart Platform — Kiến thức tích hợp (tích lũy khi đang nối "SPX Tìm đơn tương đồng")

> File knowledge nội bộ do agent duy trì khi debug/integrate Smart Canvas Workflow qua Workflow-as-API.
> **Quy tắc: KHÔNG ghi hash/key/secret thật vào file này** — chỉ placeholder (`<HASH>`, `<KEY>`). Giá trị thật nằm ở `.env` (gitignored) / Script Properties GAS.

## Trạng thái điều tra (cập nhật 2026-10-17)

| Phần | Trạng thái |
|---|---|
| Mạng: máy văn phòng/VPN → `smart.shopee.io` | ✅ OK (HTTP 400 với body rỗng, DNS nội bộ `100.64.x.x` — xác nhận host intranet-only) |
| Mạng: máy cloudshell agent / hạ tầng Google (GAS) → `smart.shopee.io` | ❌ NXDOMAIN — không có đường nào công khai (đã dò 7 biến thể domain) |
| Invoke API (dùng hash/key thật) | 🔎 **Chẩn đoán có trong docs**: `error:workflow endpoint deployment not exists` = Hash ID sai **hoặc endpoint đã bị tắt** / release chưa gắn đủ channel — khả năng cao nhất: Workflow-as-API bật **sau** lần release → phải **release lại** (chi tiết mục *Contract*) |
| Regenerate key | ⏳ Chưa xác nhận có sinh giá trị mới (key masked cũ và mới cùng đuôi `…d7u`) |
| Mạng: máy văn phòng → `openapi.seatalk.io` | ✅ OK (server trả `JSON format is required (Ref:…)` cho body hỏng) |
| Mạng: cloudshell agent → `openapi.seatalk.io` | ✅ OK (`invalid app id (Ref:…)` cho dummy creds) — lỗi non-JSON dạng text + `Ref:` |
| Contract input `photo` (File type) | ⏳ Chưa rõ (đợi invoke chạy được mới test: dataUrl? URL? raw base64?) |
| Sync hay async invoke | ⏳ Chưa rõ — nếu async sẽ có `thread_id` để poll |

## Kết quả test thật (đã verify từ Windows PowerShell máy văn phòng)

### Envelope transport của invoke

```json
{
  "status": "success",
  "error": "",
  "error_message": "",
  "code": 0,
  "data": {
    "success": false,
    "thread_id": null,
    "error": "error:workflow endpoint deployment not exists",
    "output": null,
    "error_code": null,
    "provider": null,
    "node_id": null
  }
}
```

> HTTP 200 + `code:0` nghĩa là transport+auth endpoint OK; lỗi nghiệp vụ nằm trong `data.*`.
> `format` parse của `chatSmart` (Code.gs:1843) dò `result/data/output` — khớp envelope này.

### Request invoke (shape dùng, khớp sample portal)

```json
POST https://smart.shopee.io/apis/smart/v1/workflow_orchestrator/deployments/invoke
{
  "endpoint_deployment_hash_id": "<HASH>",
  "endpoint_deployment_key": "<KEY>",
  "user_id": "<EMAIL_CÔNG_TY>",
  "start_user_variables": {
    "product_name": "test",
    "inbound_time": "2026-10-16 17:41"
  }
}
```

Input workflow khai trên Integration: `photo` (File), `inbound_time` (String, **required**), `product_name` (String).

### SeaTalk auth endpoint (đối chiếu shape)

```text
POST https://openapi.seatalk.io/auth/app_access_token  (Content-Type: application/json)
- Creds sai → HTTP 400, body văn bản: "invalid app id (Ref:<guid>)"   ← KHÔNG phải JSON
- Creds đúng → kỳ vọng JSON {"code":0,"app_access_token":"…","expire":…}
```

## Giả thuyết đang xét cho "endpoint deployment not exists"

1. Workflow Canvas chỉ sinh endpoint deployment khi **trigger/Integration ở dạng API** — chưa bật ở tab Trigger.
2. Deployment là object riêng cần **được tạo/bật tường minh** ở tab Operate (chưa tạo lần nào).
3. Hash hiển thị thuộc phiên bản cũ (release lại sinh mới) — chưa khẳng định được do Regenerate chưa rõ đã xong.
4. Cần env/tenant riêng (test vs live) — chờ docs.

## Đang chờ nội dung docs (cấp 1: Integrate → Workflow as API)

(điền sau khi user paste Markdown của trang docs — mỗi mục ghi nguồn + ngày)

- [x] Docs: Integrate → **Workflow as API** — ✅ paste 2026-10-17 (mục *Contract*; gồm trang con "Run a workflow through the API")
- [x] Docs: Integrate → Operate — ✅ (Session History + Export CSV)
- [x] Docs: Integrate → Trigger — ✅ (chỉ time-trigger; workflow không có kênh SeaTalk Bot — dùng Agent)
- [ ] Docs: Agents (kênh SeaTalk) — để đánh giá phương án "Agent thay bot tự dựng"
- [x] Docs: Release — ✅ paste 2026-10-17 (mục *Docs: Release* bên dưới)
- [x] Docs: Canvas workflows — ✅ (trang chính; phần node chi tiết chưa cần)
- [x] Docs: Troubleshooting — ✅ (`failed to invoke graph`, endpoint draft, credential Tool node)
- [x] Docs: Code workflows (Build with Beaver / Inspect and update / Preview and test) — ✅ (đối chiếu Canvas vs Code; workflow của ta loại Canvas)
- [ ] Docs: Plugins/Agent (kênh SeaTalk) — để đánh giá opción thay thì bot tự build

## Docs: Release (nguồn: paste markdown trang docs, 2026-10-17)

- **Release = bản live.** Live App, **the API** và triggers đều chạy bản live release. Sửa sau release **không** tới API/Live App/triggers → phải **release lại** (khớp quan sát: Integration panel hiển thị "Saved 17:41 Oct 16" — nếu doc save sau bản release, hash/deployment có thể gắn bản cũ).
- Cửa sổ Release yêu cầu cả 3: Name (≤40) · Description (≤500) · Release Note. Thông báo thành công: *"…released and deployed to integration channels if any"* → endpoint/API là một "integration channel" gắn với bản release.
- **Release History**: bảng `Deploy ID` (số tăng dần, release đang chạy tag **Live**) · note · `Deployed by/at` · Action `Details/Rollback`. `Details` = xem read-only canvas của đúng release đó.
- **Rollback** tạo release mới nằm trên cùng, note *"Rollback to deployment ID: <id>"*; hàng Live thì Rollback mờ.
- Concept "deployment" liên quan API nằm ở **Integrate → Workflow as API** (chưa đọc) — Release chỉ tạo "deploy record", chưa chứng minh nó sinh *endpoint deployment* nền cho API call.
- FAQ: release bằng nút có chạy stored tests của Code Workflow chưa rõ (docs tự TODO); evaluations không lưu theo release; không sửa được release cũ.

### Docs map (đường dẫn raw markdown thật, từ link trong trang Release)

```text
/docs/workflows/integrate.md        ← yêu cầu trang này tiếp theo
/docs/workflows/operate.md
/docs/workflows/trigger.md
/docs/workflows/code-workflows/*    (build-with-beaver, inspect-and-update, preview-and-test)
/docs/workflows/canvas-workflows/*  (build, preview-and-debug) — workflow đang dùng là loại này
```

Portal serve trực tiếp dạng `.md` ("View as Markdown") — user copy page là nhận đúng markdown.

## Contract — Workflow as API (nguồn: docs "Run a workflow through the API" + "Integrate", paste 2026-10-17)

### Bật endpoint (điều kiện, giải thích lỗi hiện tại)

- `Integration` tab (Canvas) / `Integrate` (Code) → **Workflow as API** → **Endpoint Status** phải bật ON. Khi tắt: panel chỉ hiện *"Please enable Endpoint Status first."*; với draft: *"Endpoint access are not available for draft app. Please release the app fist."*
- **Endpoint chỉ bật được sau khi workflow Released**; và *"deployed to integration channels if any"* trong thông báo release nghĩa là: **mỗi bản release phải tải kèm các integration channel**. Nếu bật Workflow-as-API **sau** khi release → invocation trỏ vào release chưa gắn channel → **release lại** (đây là khả năng số 1 cho lỗi `endpoint deployment not exists`).

### Request

```json
POST https://smart.shopee.io/apis/smart/v1/workflow_orchestrator/deployments/invoke
{
  "endpoint_deployment_hash_id": "<HASH>",         // required — từ panel
  "endpoint_deployment_key": "<KEY>",             // required — giữ trên server, không thấy trong code/ảnh/chat với Beaver
  "user_id": "<any stable id>",                   // tùy chọn; email công ty hợp lệ
  "thread_id": "<optional>",                      // nếu bỏ → Smart tự sinh "<id>_<số release>"
  "mode": "sync | async",                         // mặc định sync (trường hợp sync chờ đến ~300s trong sample)
  "start_user_variables": {                       // input của node Start, theo tên
    "product_name": "…", "inbound_time": "…",
    "photo": "data:image/png;base64,…"            // FILE INPUT = data-URL base64; nhiều file → list
  },
  "user_credentials": {…}                         // chỉ khi Tool node Credential Source = End User
}
```

- **Không streaming** (`streaming` bị bỏ qua).
- Missing required input không bị từ chối sớm — chạy tới node cần nó mới fail (`failed to invoke graph. Error: <node>.run failed| …`).

### Response — LUÔN HTTP 200,错误 nghiệp vụ ở trong data

```json
{ "status":"success", "code":0,
  "data": { "success": true|false, "thread_id":"a1b2…_123456", "output":{…End node outputs theo tên…},
            "error": "<luc>false: nguyên nhân, thường tên node</lúc>", "error_code", "provider", "node_id" } }
```

| `data.error` | Nghĩa |
|---|---|
| `error:invalid key for workflow endpoint deployment` | Key sai |
| `error:workflow endpoint deployment not exists` | Hash ID sai **hoặc Endpoint Status đã tắt** (hoặc release chưa gắn channel) |
| `failed to invoke graph. Error: …` | Node nào đó fail — thường do thiếu input required |

> ⚠️ Chỉnh `chatSmart` (Code.gs:1843): hiện coi HTTP ≠ 200 là fail — thực tế luôn 200; phải check `data.success`.

### Async + poll `get_debug_tree` (coroutine đã đúng thiết kế, SAI ĐƯỜNG DẪN 1 đoạn)

1. invoke với `"mode":"async"` → trả ngay `data.thread_id`.
2. Poll vài giây/lần: `POST https://smart.shopee.io/apis/smart/v1/workflow_orchestrator/get_debug_tree` — **KHÔNG có `/deployments/` trong path** (`…/workflow_orchestrator/get_debug_tree`, không phải `…/workflow_orchestrator/deployments/get_debug_tree`).

   ```json
   { "channel":"endpoint_deployment", "endpoint_deployment_hash_id":"<HASH>",
     "endpoint_deployment_key":"<KEY>", "thread_id":"…" }   // channel mặc định "smart_platform" chỉ cho run khởi từ Smart platform
   ```
3. `debug_tree.summary.status`: `idle | running | success | failed`; `success` → kết quả trong `debug_tree.output`; `failed` → `summary.error_messages`. Bonus: `node_id_to_summary`, `traversed_edges`, `node_debug_details`, `summary.time_info`.

> 🔧 **Bug cần sửa `pollSmartAsync` (Code.gs:1911)**: đang `url.replace('/invoke','/get_debug_tree')` trên `.../deployments/invoke` → sinh `.../deployments/get_debug_tree` (SAI). Phải là `.../workflow_orchestrator/get_debug_tree`.

### Tham chiếu khác

- Full schema API: `https://smart.shopee.io/apis/smart/v1/docs` (mở không cần login, chỉ trong mạng nội bộ).
- Sample sync chờ tối đa `timeout=300`s → giữ timeout GAS 6 phút, đủ.
- Live App channel: `smart.shopee.io/apps/w/<id>/live`, Access Mode mặc định Restricted + Authorized Users and Groups; tắt = gạt App Status (không confirm).
- Operate: **Session History** ghi MỌI run mọi channel (Smart Platform/Preview, API, Live App) có Input/Output/Debug Details/Tree View + **Export Data** CSV — công cụ debug khi end-to-end.
- **Trigger tab = chỉ lịch trình thời gian** (Minutely→Monthly, có Timezone). **Workflows KHÔNG có kênh SeaTalk Bot** — docs: *"To reach people in SeaTalk, use an agent instead"* → với cầu SeaTalk cho user, cân nhắc Smart **Agent** (có thể gửi nhận SeaTalk) gọi được workflow như 1 capability, thay vì tự dựng bot REST hoàn toàn — đánh giá sau khi E2 chạy được bản tự dựng.

## Quy ước nắm giữ secret trong kiến trúc bridge

| Vị trí | Chứa gì |
|---|---|
| `.env` (gitignored, chmod 600, máy máy-in-network) | `SMART_ENDPOINT_*`, sau này thêm `SEATALK_APP_ID/SECRET`, token bridge |
| GAS Script Properties | `SMART_ENDPOINT_HASH`, `SMART_ENDPOINT_KEY`, `SMART_ENDPOINT_URL` (URL chỉ có tác dụng khi thay bằng public/proxy) |
| File này + code + log + chat | **Cấm gán giá trị thật** — `[REDACTED]`/placeholder |

## Link nhanh code liên quan

- `chatSmart(p, site)` — `Code.gs:1843` (proxy đồng bộ, parse nhiều tầng)
- `pollSmartAsync(...)` — `Code.gs:1911` (poll `get_debug_tree`, channel `endpoint_deployment`)
- `doPost(e)` — `Code.gs:80` (webhook nhận, hiện chỉ log + ACK)
- UI chat `🤖` — `index.html:2829-2849` (chờ `chatSmart` chạy được)

---

## Phụ lục — Docs Smart Open Platform (paste 2026-10-17)

# Install the Smart Platform Plugin

> Install the Smart Platform Plugin in the Claude app, the ChatGPT app, Claude Code or Codex, and sign in with your Shopee account.

The Smart Platform Plugin is the recommended way to build Smart agents and workflows from Claude Code or Codex. One install gives your tool the Smart MCP Server and the skills that teach it how to build in Smart, and you sign in with your Shopee account. Your tool works with your access: it can open what you can open in Smart, and nothing more.

## Before you begin

- One of: the Claude app (Code mode), the ChatGPT app, Claude Code or Codex.
- Using VS Code with GitHub Copilot, or another MCP app? Set up the [MCP Server by hand](https://smart.shopee.io/docs/open-platform/mcp-server.md) instead.

## Install it in your tool

Every tool adds the plugin from the same address:

```text
https://smart.shopee.io/plugins/marketplace.git
```

<Tabs>
  <Tab title="Claude app">
    <Steps>
      <Step title="Open Add marketplace">
        Open the Claude app in Code mode. Go to **Customize → Plugins**, click **+ Add**, then click **Add marketplace**.

        <Frame caption="Customize → Plugins: Add marketplace is in the + Add menu.">
          ![The Customize page on the Plugins tab, with the + Add menu open: Add marketplace, Manage marketplaces, Upload plugin and Create with Claude](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/claude-add-menu.jpg)
        </Frame>
      </Step>
      <Step title="Add the Smart marketplace">
        Click **Add from a repository**. Paste the address into **URL**, then click **Use "https://smart.shopee.io/plugins/marketplace.git"**. Click **Sync**.

        <Frame caption="Add marketplace: paste the address, then click Sync.">
          ![The Add marketplace window with the trust warning, the Smart marketplace address in URL, and Cancel and Sync](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/claude-add-marketplace.jpg)
        </Frame>

        The **Discover** tab now shows **Smart platform**.
      </Step>
      <Step title="Add the plugin">
        Click **Add** next to **Smart platform**. Claude shows "Smart platform is installed and ready to use."

        <Frame caption="Smart platform on the Discover tab, from the AI Solution team.">
          ![The Smart platform plugin row on the Discover tab: by AI Solution team, its version and description, and the Add button](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/claude-plugin-added.jpg)
        </Frame>
      </Step>
      <Step title="Sign in to Smart">
        Start a session and type `/mcp`. In **MCP servers**, find **smart-platform** ("Provided by the Smart platform plugin") and click **Connect**. When Claude asks "Open smart.shopee.io to authorize smart-platform?", click **OK**.

        <Frame caption="MCP servers: click Connect next to smart-platform.">
          ![The MCP servers window with the smart-platform row, Provided by the Smart platform plugin, and its Connect button](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/claude-mcp-connect.jpg)
        </Frame>

        If your browser asks, pick your Shopee account and click **Allow**. You see "Authentication successful."
      </Step>
      <Step title="Check that it works">
        Ask Claude:

        ```text
        List the Smart Platform tools available to me.
        ```

        Claude lists the Smart tools, such as `get_my_teams_and_workspaces`.

        <Frame caption="Signed in: Claude lists the Smart tools by group.">
          ![Claude's answer: Smart tools in groups, such as Start here with get_my_teams_and_workspaces, Find things, Read details and Build and edit agents](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/claude-tools-list.jpg)
        </Frame>
      </Step>
    </Steps>

    <Note>
      Sign in with `/mcp` in a session. The **Connect** button on the plugin's **Connectors** tab doesn't respond. {/* Remove this note when Customize → Plugins → Smart platform → Connectors → Connect signs in. It did nothing when the page was written. */}
    </Note>
  </Tab>
  <Tab title="ChatGPT app">
    <Steps>
      <Step title="Open Add a marketplace">
        In the left bar, click **Customize**. On **Plugins**, click **Add**, then click **Add a marketplace**.
      </Step>
      <Step title="Add the Smart marketplace">
        Paste the address into **Source**. Leave **Git ref** and **Sparse paths** empty. Click **Add marketplace**.

        <Frame caption="Add plugin marketplace: only Source is needed.">
          ![The Add plugin marketplace window with the Smart marketplace address in Source, empty Git ref and Sparse paths, and Cancel and Add marketplace](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/chatgpt-add-marketplace.jpg)
        </Frame>

        ChatGPT shows "smart-platform-marketplace marketplace added".
      </Step>
      <Step title="Install the plugin">
        Open the **Personal** tab and click **Smart Platform** ("Smart agents on live").

        <Frame caption="The Personal tab: Smart Platform has its own section.">
          ![The Plugins page on the Personal tab, with the Smart Platform section and its Smart Platform plugin, Smart agents on live](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/chatgpt-personal-tab.jpg)
        </Frame>

        Click **Install plugin**. The page also lists the plugin's MCP server and its skills.

        <Frame caption="The Smart Platform plugin page: one MCP server and the plugin's skills.">
          ![The Smart Platform plugin page with Install plugin, two example prompts, MCP servers with Smart-platform, and the list of skills](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/chatgpt-install-plugin.jpg)
        </Frame>
      </Step>
      <Step title="Allow access to Smart">
        Your browser opens. Pick your Shopee account. On "Allow Codex to access Smart MCP?", click **Allow**.

        <Frame caption="Smart asks before it lets your tool in. It acts as you.">
          ![The Smart page Allow Codex to access Smart MCP, listing what the app will be able to do, with Cancel and Allow](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/smart-allow-access.jpg)
        </Frame>
      </Step>
      <Step title="Check that it works">
        On the plugin page, click the prompt **List the Smart Platform tools available to me.** It opens on the **Work** tab with **Smart Platform** in the box. Send it. ChatGPT lists the Smart tools.

        <Frame caption="Signed in: ChatGPT lists the Smart tools.">
          ![ChatGPT's answer: Smart tools in groups, such as Agent V2 search and invoke, Code workflow tools, and Agents, sessions, and workflow details](https://deo.shopeemobile.com/shopee/smart/docs/api/open-platform/mcp-server/chatgpt-tools-list.jpg)
        </Frame>
      </Step>
    </Steps>

    <Note>
      Click **Allow** in step 4. If you close the page instead, the plugin still installs, but ChatGPT can't reach Smart. To sign in again, run `codex mcp login smart-platform` in a terminal.
    </Note>
  </Tab>
  <Tab title="Terminal">
    In **Claude Code**, run:

    ```bash
    claude plugin marketplace add https://smart.shopee.io/plugins/marketplace.git
    claude plugin install smart-platform@smart-platform-marketplace
    ```

    Then start Claude Code, type `/mcp` and sign in to **smart-platform**.

    In **Codex**, run:

    ```bash
    codex plugin marketplace add https://smart.shopee.io/plugins/marketplace.git
    codex plugin add smart-platform@smart-platform-marketplace
    codex mcp login smart-platform
    ```

    The last command opens your browser. Pick your Shopee account and click **Allow**.
  </Tab>
</Tabs>

Plugins you install in Claude Code also show in Claude Code for VS Code. Open the **/** menu and click **Manage plugins** to see them.

<Note>
  Set Smart up by hand before? Remove that `smart` server, or turn it off:

  - **Claude Code** hides the plugin's server while your old server has the same address, so every call goes through the old one and its token.
  - **The ChatGPT app and Codex** load both, and may call the old one. Add `enabled = false` under `[mcp_servers.smart]` in `~/.codex/config.toml`.
</Note>

## Next steps

- [Build with the Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/build-with-the-plugin.md): build, test and release agents, workflows and tools by asking your tool.
- [Troubleshooting](https://smart.shopee.io/docs/open-platform/troubleshooting.md): Smart tools don't show after you install the plugin.

# Build with the Smart Platform Plugin

> Build, test and release Agent 2.0 agents, code workflows and Python Script tools by asking Claude Code or Codex.

With the Smart Platform Plugin, you build in Smart by asking Claude Code or Codex in plain words. Your tool creates the agent, workflow or tool, tests it, and releases it when you say so.

## Before you begin

- Install the plugin and sign in: see [Install the Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/smart-platform-plugin.md). It brings the skills that teach your tool how to build in Smart.
- Using VS Code or another MCP app? [Set up the MCP Server by hand](https://smart.shopee.io/docs/open-platform/mcp-server.md). Everything on this page works the same.

<Note>
  Set up by hand, your tool has no skills yet. The first time you build an Agent 2.0 agent or a code workflow, the server asks your tool to install them. Say yes.
</Note>

## Build an Agent 2.0 agent

<Steps>
  <Step title="Describe the agent">
    Say what the agent should do. You don't need to know which tools or knowledge bases exist.

    ```text
    Build an Agent 2.0 agent on Smart that answers questions about our HR policy from the HR Policy knowledge base, in plain language. Put it in my default workspace.
    ```
  </Step>
  <Step title="Confirm what it found">
    Your tool searches Smart for tools and knowledge bases that fit, and asks you to confirm before it uses them. Say which ones are right.
  </Step>
  <Step title="Let it set up the agent">
    Your tool creates the agent as a draft, then sets its name, instructions, model, tools and knowledge bases, one change at a time. After each change, it reads the agent back, so it can tell you what's set.
  </Step>
</Steps>

## Test and improve it

Ask your tool to try the draft before you release it. It starts a test conversation, sends your message, and shows you the reply.

```text
Test the HR Policy agent with "How many days of annual leave do contractors get?" and show me the reply.
```

If the reply is wrong, say what's wrong. Your tool changes the agent, and you test again:

```text
The answer doesn't say which policy it comes from. Change the instructions so it always names the source document and section. Then test it again with the same question.
```

## Release and connect it

Your users only get the agent, and your changes, once you release:

```text
Release the HR Policy agent with the note "Cites the source document".
```

Changes after a release go to the draft. Ask your tool to release again when they're ready. To undo a release, ask it to roll back to the previous one.

Then connect the agent where people use it:

- **On a schedule:** "Run the HR Policy agent every weekday at 9:00 Singapore time with the message 'run'." Your tool can also list and delete schedules.
- **In SeaTalk:** your tool needs your bot's **App ID**, **App Secret** and **Signing Secret** from SeaTalk Open Platform. It returns a webhook URL: set it as your bot's callback URL in SeaTalk Open Platform.
- **From your own code:** turn on Agent as API. See [Call an Agent 2.0 agent through the API](https://smart.shopee.io/docs/agents/agent-2-0/agent-as-api.md).

## Build a code workflow

A code workflow is a workflow written in Python, step by step. Your tool writes it for you:

```text
Build a code workflow on Smart that takes a Jira ticket key, fetches the ticket, and returns a one-paragraph summary.
```

Your tool:

1. Creates the workflow as a draft.
2. Writes the code: a main script that runs each step, the step scripts, and tests for each.
3. Runs the tests, and shows you what passed.
4. Releases it, but only when you ask.

## Create a Python Script tool

A Python Script tool gives an agent something it can run, such as a calculation or a call to another system:

```text
Create a Python Script tool on Smart called word-count that takes some text and returns how many words it has.
```

Your tool:

1. Writes the script: a `main(input)` function that returns `{"output": {...}}`, with each input and output declared. Only approved Python packages can be used.
2. Creates the tool. Its first version, `1.0.0`, isn't released yet.
3. Runs it with a test input, and shows you the result.
4. Releases it when you say so. The first released version becomes the default.

## Classic agents

Your tool can still create and change classic single agents, including the code of a Rule-Driven agent. For what that code can do, see [Rule-Driven SDK](https://smart.shopee.io/docs/agents/classic-agents/rule-driven-mode/sdk.md). It can also move a classic agent to Agent 2.0:

```text
Move my "Daily Jira Briefing" agent to Agent 2.0.
```

## Example prompts

| You want to | Ask |
| --- | --- |
| Find tools | "Search Smart for tools about Jira." |
| Find knowledge bases | "Search Smart for knowledge bases about payment APIs in my workspace." |
| Create an agent | "Create an Agent 2.0 agent called Release Notes Writer in my default workspace." |
| Change its instructions | "Change the Release Notes Writer's instructions to always answer in bullet points." |
| Add a knowledge base | "Add the Payment API Specs knowledge base to the Release Notes Writer." |
| Test it | "Test the Release Notes Writer with 'Summarise SMART-1234' and show me the reply." |
| Release it | "Release the Release Notes Writer with the note 'First version'." |
| Roll back | "Roll back the Release Notes Writer to its previous release." |
| Build a workflow | "Build a code workflow that takes a list of numbers and returns their average." |
| Make a tool | "Create a Python Script tool that converts a date to ISO format." |

## What you still do in Smart

The MCP Server can't do these yet. Do them in Smart, then come back to your tool:

- Create a knowledge base.
- Build a canvas workflow.
- Build a classic multi-agent. Your tool can only change one agent inside one.
- Delete an agent, a workflow or a tool.

To ask for more, see [Get help](https://smart.shopee.io/docs/getting-started/get-help.md).

## Next steps

- [Call an Agent 2.0 agent through the API](https://smart.shopee.io/docs/agents/agent-2-0/agent-as-api.md): call your new agent from your own code.
- [Agent 2.0](https://smart.shopee.io/docs/agents/agent-2-0.md): everything an Agent 2.0 agent can do.

# Set up the MCP Server by hand

> Connect VS Code or another MCP app to the Smart MCP Server with a personal access token, and manage your tokens.

Use this page for VS Code with GitHub Copilot, or another MCP app that can't install the Smart Platform Plugin. It connects your tool to the Smart MCP Server with a personal access token. Your tool works with your access: it can open what you can open in Smart, and nothing more.

<Tip>
  In the Claude app, the ChatGPT app, Claude Code or Codex, [install the Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/smart-platform-plugin.md) instead. You sign in with your Shopee account, there's no token to copy, and it brings the skills that teach your tool how to build in Smart. See [how the two compare](#faq).
</Tip>

## Before you begin

- **You need a personal access token.** A service account token doesn't work here: the server answers "please use Personal Access Token to access MCP". (The box on the **MCP Server** tab is titled "Authenticate with a PAT or Service Account Token".)
- A personal access token has the same access you have in Smart.
- You can have up to 5 active tokens.

## Connect your tool

<Steps>
  <Step title="Open the MCP Server tab">
    Go to **Smart Open Platform** and click the **MCP Server** tab.

    <Frame caption="The MCP Server tab: the Personal Access Token link and the quickest way to set up.">
      ![The top of the MCP Server tab: Smart MCP Server with Open MCP Inspector, the blue box with the Personal Access Token link, and Set up the Smart MCP Server with the setup guide URL](https://deo.shopeemobile.com/shopee/smart/docs/api/mcp-server/mcp-server-tab.jpg)
    </Frame>
  </Step>
  <Step title="Create a token">
    In the blue box, click **Personal Access Token**. In the box that opens, click **+ Create new token**. Fill in **Token Name** (required; such as `VS Code - laptop`) and **Description**, then click **Create**.

    <Frame caption="Create New Token: only the name is required.">
      ![The Create New Token form with Token Name, Description, and Cancel and Create](https://deo.shopeemobile.com/shopee/smart/docs/api/mcp-server/create-token.jpg)
    </Frame>
  </Step>
  <Step title="Copy the token">
    Click **Copy** next to the new token. Smart shows "This token will not be shown again. Copy it now and add it to your MCP config."
  </Step>
  <Step title="Add the server to your tool">
    The quickest way: give your tool the setup guide and let it set itself up. Paste this into your tool:

    ```text
    Set up the Smart MCP Server using this guide: https://smart.shopee.io/openapi/v1/mcp-install.md
    ```

    Or add it yourself: see [Add the server yourself](#add-the-server-yourself).
  </Step>
  <Step title="Check the connection">
    Ask your tool:

    ```text
    What's my default team and workspace on Smart?
    ```

    You should see your team and workspace. If you do, you're ready.
  </Step>
</Steps>

### Add the server yourself

In each setup, replace `{your_token}` with your token.

<Tabs>
  <Tab title="Claude Code">
    Add this to `.mcp.json` in your project folder, then restart Claude Code.

    ```json .mcp.json
    {
      "mcpServers": {
        "smart": {
          "type": "http",
          "url": "https://smart.shopee.io/mcp",
          "headers": {
            "Authorization": "Bearer {your_token}"
          }
        }
      }
    }
    ```
  </Tab>
  <Tab title="VS Code">
    You need VS Code 1.99 or later, with GitHub Copilot or another MCP extension. Add this to `.vscode/mcp.json` (the key is `servers`, not `mcpServers`), then reload the window.

    ```json .vscode/mcp.json
    {
      "servers": {
        "smart": {
          "type": "http",
          "url": "https://smart.shopee.io/mcp",
          "headers": {
            "Authorization": "Bearer {your_token}"
          }
        }
      }
    }
    ```

    <Note>
      Keep the `Authorization` header. Without it, VS Code tries to sign in to Smart and stops with "Dynamic Client Registration not supported". {/* Remove when Smart's sign-in accepts VS Code's redirect address https://vscode.dev/redirect (found 2026-10-14, SMART-4264). */}
    </Note>
  </Tab>
  <Tab title="Codex">
    Add this to `~/.codex/config.toml`. Codex reads it when a session starts, so there's nothing to restart.

    ```toml ~/.codex/config.toml
    [mcp_servers.smart]
    url = "https://smart.shopee.io/mcp"
    http_headers = { "Authorization" = "Bearer {your_token}" }
    ```

    The **MCP Server** tab shows the header in a `[mcp_servers.smart.headers]` table. Codex ignores that table and connects without your token, so use `http_headers` as above.
  </Tab>
  <Tab title="Other">
    Any MCP app that supports HTTP:

    | Setting | Value |
    | --- | --- |
    | Transport | HTTP (Streamable HTTP or SSE) |
    | URL | `https://smart.shopee.io/mcp` |
    | Header | `Authorization: Bearer {your_token}` |

    Every request needs the token, including the first one that lists the tools.
  </Tab>
</Tabs>

<AccordionGroup>
  <Accordion title="Try the server in MCP Inspector">
    MCP Inspector lets you look at the server's tools in a browser, without a coding tool.

    1. On the **MCP Server** tab, click **Open MCP Inspector** at the top right.
    2. Check that **Transport Type** is **Streamable HTTP**, the URL is `https://smart.shopee.io/mcp`, and **Connection Type** is **Direct**.
    3. Open **Authentication** and add the header `Authorization` with `Bearer ` and your token. Don't use the OAuth 2.0 flow.
    4. Click **Connect**, then go to **Tools** and click **List Tools**.
  </Accordion>
</AccordionGroup>

## Revoke a token

Open the **Personal Access Token** box again and click **Revoke** next to the token. Smart asks **Revoke Access**: "The auth will fail and the PAT will be remove from the list. Are you sure to revoke access?" Click **Revoke**. Any tool that uses the token stops working.

## Keep the token safe

- Make one token per tool or computer, with a name that says where it's used.
- Never share it: it acts as you.
- Revoke tokens you no longer use.

## FAQ

<AccordionGroup>
  <Accordion title="How is the Smart Platform Plugin different from adding the MCP Server by hand?">
    Both connect your tool to the same MCP Server, with the same access, so both let you build Smart agents and workflows. The plugin does more of the setup for you, so use it whenever your tool can install it:

    | | Smart Platform Plugin | Set up by hand |
    | --- | --- | --- |
    | **Setup** | Add one address, install, sign in | Create a token, then edit your tool's config |
    | **Sign-in** | Your Shopee account, in your browser | A personal access token you copy into a config file. Anyone who has it can act as you |
    | **The plugin's skills** | Come installed. They teach your tool how to build, configure, release and run Agent 2.0 agents | Your tool installs them when the server asks, the first time you build |
    | **Works in** | The Claude app, the ChatGPT app, Claude Code and Codex | Any MCP app, such as VS Code with GitHub Copilot |

    Set it up by hand only for a tool that can't install the plugin.
  </Accordion>
</AccordionGroup>

## Next steps

- [Build with the Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/build-with-the-plugin.md): build agents, workflows and tools by asking your tool. It works the same once you're connected by hand.
- [Tool reference](https://smart.shopee.io/open-platform?tab=mcp-server), at the end of the **MCP Server** tab: every tool the server has.
- [Troubleshooting](https://smart.shopee.io/docs/open-platform/troubleshooting.md): fix a refused token or a tool that can't find your app.

# Call the Open API with a service account

> Create a service account, give it access, and call Smart's Open API from scripts, jobs and other systems.

The **Open API** is Smart's REST API. You find it on the **Open API** tab of **Smart Open Platform**. It lets a script or a system work with Smart without a person: list apps, read session history, manage knowledge bases, skills and tools. It signs in as a **service account**: an identity that belongs to your workspace, not to you.

For example:

- A script that runs every night queries a knowledge base.
- A bot uploads Confluence pages to a knowledge base.
- A data job exports an agent's session history for reports.

## Before you begin

- You need a workspace you manage.
- To give a service account **Full Workspace Access**, you need to be a workspace admin.

## Set up and call the API

<Steps>
  <Step title="Create a service account">
    Go to **Workspace Management → Service Account** and click **+ Service Account**. Fill in **Name** and **Description**: both are required. Use a name that says what will use it, such as `kb-sync-bot`. Leave **Full Workspace Access (Enabled for Admin Only)** off unless you need it (see [Choose what it can reach](#choose-what-it-can-reach)). Click **Confirm**. To copy the token, click **Token** in the service account's row.

    <Frame caption="Create Service Account: leave Full Workspace Access off for most uses.">
      ![The Create Service Account form with Name, the Full Workspace Access (Enabled for Admin Only) switch off, Description, and Cancel and Confirm](https://deo.shopeemobile.com/shopee/smart/docs/api/rest-api/create-service-account.jpg)
    </Frame>
  </Step>
  <Step title="Give it access">
    A new service account can't see anything yet: a call returns an empty list. For each app, knowledge base or tool it needs: in **Apps**, **Tools** or **Knowledge Bases**, click **⋮** on the asset's row, then **Permission**. Search for the service account and add it with a role. See [Control who can use an asset](https://smart.shopee.io/docs/manage/access-control.md).
  </Step>
  <Step title="Find the operation">
    Go to **Smart Open Platform → Open API**. The **API Reference** list has the groups **Agents**, **Apps**, **Workflows**, **Health**, **Knowledge Bases**, **Skills** and **Tools**. Click an operation to see its fields, and an **Example** in **cURL**, **JavaScript**, **Python** and **Golang**.

    <Frame caption="API Reference: each operation shows its path, what it does and its fields.">
      ![The Open API tab with the API Reference list on the left and List Agent Apps open: GET /openapi/v1/apps/agent, Authorize with token, and the Request fields](https://deo.shopeemobile.com/shopee/smart/docs/api/rest-api/api-reference.jpg)
    </Frame>
  </Step>
  <Step title="Call it">
    Send the token in the `Authorization` header as `Bearer <token>`. Every path starts with `https://smart.shopee.io/openapi/v1`.
  </Step>
</Steps>

This call lists the agents the service account can see:

<CodeGroup>
```bash cURL
curl "https://smart.shopee.io/openapi/v1/apps/agent?page_size=10" \
  -H "Authorization: Bearer <token>"
```

```javascript JavaScript
const res = await fetch("https://smart.shopee.io/openapi/v1/apps/agent?page_size=10", {
  headers: {Authorization: "Bearer <token>"},
});
const {data} = await res.json();
console.log(data.total, data.agent_apps.map((app) => app.name));
```

```python Python
import requests

res = requests.get(
    "https://smart.shopee.io/openapi/v1/apps/agent",
    params={"page_size": 10},
    headers={"Authorization": "Bearer <token>"},
    timeout=60,
)
data = res.json()["data"]
print(data["total"], [app["name"] for app in data["agent_apps"]])
```

```go Go
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("GET", "https://smart.shopee.io/openapi/v1/apps/agent?page_size=10", nil)
	req.Header.Set("Authorization", "Bearer <token>")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()
	var out struct {
		Data struct {
			Total     int `json:"total"`
			AgentApps []struct {
				Name string `json:"name"`
			} `json:"agent_apps"`
		} `json:"data"`
	}
	json.NewDecoder(res.Body).Decode(&out)
	fmt.Println(out.Data.Total, out.Data.AgentApps)
}
```
</CodeGroup>

The JavaScript sample uses top-level `await`: save it as a `.mjs` file and run it with Node.js 18 or later.

The answer's `data` has `agent_apps` (one item per agent: `id`, `name`, `description`, `workspace_name` and more), `total`, `page` and `has_next`. Without a token, or with a wrong one, you get HTTP 401 "authentication failed".

<Note>
  A personal access token also works on the Open API, but it acts as you, with everything you can open. Use a service account for anything that runs without you.
</Note>

## Choose what it can reach

| Access | What it reaches | Use it for |
| --- | --- | --- |
| Asset access (the default) | Only the apps, knowledge bases and tools you add it to | Most scripts and bots |
| **Full Workspace Access** | Everything in the workspace. Only an admin can turn it on | A trusted job that needs many assets, such as a data pipeline |

The role you give the service account on an asset decides what it can do there.

## Keep the token safe

- Use one service account per script or system.
- Give it a name that says what uses it.
- Give it access only to what it needs.
- Store the token in a secret manager. Never put it in code, chats or screenshots.
- Delete service accounts you no longer use.

## Next steps

- [Install the Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/smart-platform-plugin.md): build in Smart from Claude Code or Codex. For VS Code, [set up the MCP Server by hand](https://smart.shopee.io/docs/open-platform/mcp-server.md).
- [Troubleshooting](https://smart.shopee.io/docs/open-platform/troubleshooting.md): fix a 401, an empty list or a failing job.

# Troubleshooting

> Fix errors from the Open API, the Smart Platform Plugin and the MCP Server.

An error from Agent as API or Workflow as API? See the Troubleshooting page of [Agent 2.0](https://smart.shopee.io/docs/agents/agent-2-0/troubleshooting.md#agent-as-api), [classic agents](https://smart.shopee.io/docs/agents/classic-agents/troubleshooting.md#agent-as-api) or [workflows](https://smart.shopee.io/docs/workflows/troubleshooting.md#workflow-as-api).

## Find your problem

| Symptom | Go to |
| --- | --- |
| "authentication failed" from the Open API | [Open API 401](#authentication-failed) |
| An empty list or HTTP 403 from the Open API | [No access](#the-open-api-returns-an-empty-list-or-403) |
| A scheduled job suddenly fails | [Job fails](#a-scheduled-job-suddenly-fails) |
| "user tokens not found" when you upload to a knowledge base | [Upload from Confluence or Google](#user-tokens-not-found-when-you-upload-to-a-knowledge-base) |
| "please use Personal Access Token to access MCP" | [Service account on MCP](#please-use-personal-access-token-to-access-mcp) |
| Your AI coding tool can't connect, or can't find your app | [MCP connection](#your-ai-coding-tool-cant-connect-or-cant-find-something) |
| Smart tools don't show after you install the Smart Platform Plugin | [Plugin not signed in](#smart-tools-dont-show-after-you-install-the-plugin) |

## Open API

### "authentication failed"

HTTP 401, `error_code` `903001`: the call had no token, or a token Smart doesn't accept. Check that the header is `Authorization: Bearer <token>`, and that the service account is still there in **Workspace Management → Service Account**.

### The Open API returns an empty list, or 403

The service account has no access to that app, knowledge base or tool. A new service account sees nothing. Open the asset's permissions and add the service account with a role that allows the operation. See [Call the Open API with a service account](https://smart.shopee.io/docs/open-platform/open-api.md).

### A scheduled job suddenly fails

The service account may have been turned off or deleted, or its token changed. Check it in **Workspace Management → Service Account**, then update the token your job uses.

### "user tokens not found" when you upload to a knowledge base

Uploading from Confluence or Google Drive through the API uses the knowledge base owner's linked account, because a service account has none. Make sure the knowledge base's owner can open the pages or files you upload.

## Smart Platform Plugin and MCP Server

### "please use Personal Access Token to access MCP"

You connected with a service account token, which the MCP Server doesn't take. Install the [Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/smart-platform-plugin.md) instead, or use a personal access token: see [Set up the MCP Server by hand](https://smart.shopee.io/docs/open-platform/mcp-server.md).

### Your AI coding tool can't connect, or can't find something

- **401:** the token is wrong or was revoked. Create a new one and update your config.
- **It can't find an app, knowledge base or tool:** the server only sees what you can open. Check that you can open it in Smart.
- **Nothing changed after you edited the config:** restart Claude Code, reload the VS Code window, or start a new Codex session.

### Smart tools don't show after you install the plugin

The plugin is installed but not signed in, so your tool can't reach Smart. Its skills still load.

- **Claude app or Claude Code:** in a session, type `/mcp` and sign in to **smart-platform**. In the Claude app, click **Connect** next to it.
- **ChatGPT app or Codex:** run `codex mcp login smart-platform` in a terminal, then click **Allow** in your browser.
- **You set Smart up by hand before:** remove or turn off that old `smart` server. See [Install the Smart Platform Plugin](https://smart.shopee.io/docs/open-platform/smart-platform-plugin.md).
