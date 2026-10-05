# AGENTS.md — Quy ước cho AI agent (spx-exception-handling)

> Repo: `spx-exception-handling`. GAS WebApp xử lý ngoại lệ (khung ban đầu: `Code.gs` + `index.html` + `appsscript.json`) + backend Python song song (`api/`) + CI dual workflow (`deploy.yml` + `test.yml`) giống `spx-diem-danh`. Học từ `spx-diem-danh/AGENTS.md`, đã lược bỏ luật chưa áp dụng (UI 3-file, camera, SSOT map lớn, suite 541 test) và adapt cho repo skeleton này.

> [!TIP]
> **TL;DR 60s trước khi code:** Đọc bảng luật `§1` → Checkpoint A (`§6.1`) → sửa file có tiếng Việt qua pattern deterministic `§1.1` → không lộ secret/ID (`§1` luật 1) → verify `npm test` + `test:py` + `build:local` + `test:chrome` (`§7`) → 1 issue = 1 commit + push ngay, không tự `clasp push` (CI lo).

## Mục lục

| Phần | Nội dung | Section |
| :--- | :------- | :------ |
| **1 — Luật bắt buộc** | Bảng luật duy nhất + cách edit | `§1` · `§1.1` |
| **2 — Cách làm việc** | Ngôn ngữ · Nguyên tắc · Quyết định · Coding · Workflow | `§2`–`§6` |
| **3 — Tiêu chuẩn** | Fix priority · Security · Performance · Review · Done | `§7`–`§11` |
| **4 — Kiến thức dự án** | Platform GAS · Dự án · CI/mockup · Ghi nhớ · Output | `§12`–`§16` |

---

## PHẦN 1 — LUẬT BẮT BUỘC

## §1. Bảng luật

Mỗi luật có **đúng 1 số hiệu**. Cột "Override" quyết định user có thể yêu cầu bỏ qua không.

**Nhóm A — Không override được:**

| # | Luật | Chi tiết |
| :- | :-- | :-- |
| 1 | Không lộ secrets/ID/sheet (code/log/output/chat); mask bằng `[REDACTED]`. Áp dụng cho `GAS_SCRIPT_ID`, `CLASPRC_JSON`, `.clasp.json`, `~/.clasprc.json`, Spreadsheet ID sau này, file data thật (`*.csv`). | `§8` |
| 2 | GAS: batch `getValues()`/`setValues()`, không loop `getValue()`/`setValue()`. | `§12` |
| 3 | Tôn trọng GAS timeout 6 phút. | `§12` |
| 4 | Không claim "fixed"/"test pass" khi chưa verify bằng kết quả thực (`npm test`, `test:py`, log run, `gh run view`). Không đoán mò. | `§7` |

**Nhóm B — Mặc định bật, override được nếu user yêu cầu rõ:**

| # | Luật | Chi tiết |
| :- | :-- | :-- |
| 5 | 1 issue → verify → commit → push → issue tiếp theo. Batch nhiều edit nhỏ cùng 1 issue vào 1 commit; không gộp issue khác nhau. Tự động commit + push ngay, không chờ hỏi. Không tự `clasp push` (CI `deploy.yml` lo). | `§14` |
| 6 | Mỗi dòng thay đổi phải liên quan trực tiếp đến request — không sửa lan man. | `§5` |
| 7 | Giữ nguyên behavior trừ khi được yêu cầu đổi. | `§5` |

**Nhóm C — Luật quy trình (luôn áp dụng, miễn trừ ghi rõ trong luật):**

| # | Luật | Chi tiết |
| :- | :-- | :-- |
| 8 | Không thêm comment rác (`FIX(YYYY-MM-DD):`, `P1:`…). Chỉ giữ rationale non-obvious / gotcha đừng regress. | `§5.1` |
| 9 | Đổi API/UI/flow/số liệu/schema → sync `README.md` **cùng 1 commit**. Miễn trừ: fix nội bộ không đổi hành vi quan sát được. | `§13` |
| 10 | Không tạo hàm trùng — 1 logic 1 nơi (SSOT). Grep trước khi tạo hàm mới; đã có → reuse. | `§5.2` |
| 11 | Timezone duy nhất: `Asia/Ho_Chi_Minh` (theo `appsscript.json`). Cấm string `GMT+7` lẻ cho cùng 1 mục đích. File dùng **LF, utf-8 không BOM** (GAS serve `index.html` có BOM sẽ sinh khoảng trống trên header). | `§12` |
| 12 | Checkpoint A/B/C bắt buộc trước – trong – sau khi sửa code. | `§6.1` |
| 13 | Plan → duyệt → review gate khi chạm ≥3 file, hoặc đổi API/UI/flow/số liệu. Miễn trừ: fix trivial <5 dòng, 1 file, không đổi hành vi. | `§6.2` |

> **Ưu tiên khi xung đột:** Nhóm A > yêu cầu user > Nhóm B > Core Principles (`§3`). User yêu cầu vi phạm Nhóm A → từ chối phần đó, nêu lý do, đề xuất cách đúng.

### §1.1 Cách edit (file có tiếng Việt)

Repo dùng **LF** (không CRLF) — kiểm tra bằng `git ls-files --eol` (kỳ vọng `i/lf w/lf`).

Pattern chuẩn (Python):

```python
path = r"..."  # Code.gs hay index.html
# ĐỌC với newline='' — dùng utf-8-sig (strip BOM nếu file cũ có)
with open(path, 'r', encoding='utf-8-sig', newline='') as f:
    content = f.read()
# SỬA bằng string replace CHÍNH XÁC, assert count==1 cho từng anchor
# GHI với newline='' — BẮT BUỘC utf-8 (KHÔNG sig): utf-8-sig khi write THÊM BOM
# (EF BB BF) → index.html serve qua GAS sinh khoảng trống phía trên header.
with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
```

- String literal trong Python phải khớp LF (`\n`, không `\r\n`).
- Khối lớn: tách nhỏ thành file tạm rồi ghép bằng index (`content.find(marker)`).
- Sau mỗi edit HTML, verify LF + BOM:
  ```bash
  python3 -c "data=open('index.html','rb').read(); print('CRLF',data.count(b'\r\n'),'LF-only',data.count(b'\n')-data.count(b'\r\n'), 'BOM', data[:3]==b'\xef\xbb\xbf')"
  ```
  CRLF ≠ 0 hoặc BOM True → normalize + ghi lại.

---

## PHẦN 2 — CÁCH LÀM VIỆC

## §2. Ngôn ngữ (bắt buộc)

- Nghĩ bằng tiếng Anh, **luôn trả lời user bằng tiếng Việt** (trừ khi user yêu cầu khác).
- Tên biến/hàm/file/cột sheet: **tiếng Anh**. Label UI + nói với user: **tiếng Việt**.

## §3. Core Principles

- Correctness > speed. Simplicity > cleverness.
- Chỉ giải quyết đúng scope — never invent missing requirements.
- Nêu assumption khi cần; chỉ hỏi khi ambiguity chặn đường đúng.
- Verify trước khi kết luận (luật 4). Reuse trước khi tạo mới (luật 10).
- Để dự án sạch hơn lúc nhận: xóa dead code do mình tạo, gỡ wrapper thừa khi gặp.

## §4. Decision & Ambiguity

Trước khi code, trả lời 5 câu: **(1)** vấn đề thật là gì? **(2)** constraint nào? **(3)** thiếu info gì? **(4)** assumption nào? **(5)** rủi ro gì? → chọn giải pháp đơn giản nhất thỏa mọi constraint.

- **Rẻ để sửa sau** (local, không mất data) → ghi assumption, cứ làm.
- **Đắt để sửa sau** (mất data, đổi production, refactor lớn) / nhiều cách hiểu khác kết quả hẳn → hỏi ngay, tối đa 1 câu/task, không đoán.

## §5. Coding Rules

**Prefer:** đơn giản · dễ đọc · deterministic · hàm nhỏ 1 việc · theo convention sẵn có.

**Avoid:** abstraction phỏng đoán · refactor không cần thiết · dependency mới · feature creep · sửa code không liên quan (luật 6).

### §5.1 Comment (chi tiết luật #8)

Chỉ comment rationale/gotcha. Không marker vòng fix mới. Lịch sử nằm ở git log + commit message.

### §5.2 SSOT (chi tiết luật #10)

Trước khi tạo hàm mới, grep trước:

```bash
grep -rn "function <tên>" --include="*.gs" --include="*.html" --include="*.py" .
```

Đã có → **reuse**. Repo hiện skeleton nên chưa có map SSOT — khi logic phình ra (normalize, formatDate, cache, classify), lập bảng map như `spx-diem-danh §5.3` và giữ 1 bản duy nhất. Client/server duplicate (nếu sau này tách `css.html`/`js.html`) là ngoại lệ có chủ đích — cần comment `KHỚP server` ở cả 2 phía + guard test.

## §6. Workflow

**Understand → Plan (nếu chạm gate) → Implement → Verify → Review.**

- **Bug fix:** Reproduce → Localize → Root cause → Fix nguyên nhân (không fix triệu chứng) → Verify → Regression note.
- **Rule of Three:** fix thứ 3 không ăn → STOP, bàn với user (nghi architecture). Red flags: "thử X xem sao" · "sửa nhiều chỗ rồi chạy" → dừng, quay lại root cause.

### §6.1 Checkpoint A/B/C (chi tiết luật #12)

| Checkpoint | Khi nào | Làm gì |
| :--- | :--- | :--- |
| **A — Trước code** | Đọc `§1`, `§1.1`, `§5` | Liệt kê luật áp dụng; xung đột → báo user TRƯỚC khi code |
| **B — Sau sửa, trước commit** | `git diff --stat` + `git diff <file>` | So từng file với `§1`; flag dòng ngoài phạm vi / comment rác / secret lộ / hàm trùng / thiếu sync README |
| **C — Sau commit, trước push** | `git log -1 --stat` + `git show HEAD` | Soát lại comment + dòng ngoài phạm vi; vi phạm → `git revert HEAD` làm lại |

Khi trả kết quả có sửa code, thêm 1 dòng `**Rule check:** A: <tóm tắt> · B: <tóm tắt> · C: <tóm tắt>`.

### §6.2 Plan gate (chi tiết luật #13)

- Chạm gate → tạo `plan.md` (gitignored, không commit): Bối cảnh · Quyết định · Chi tiết file:line · Verify · Rủi ro → chờ user duyệt (`duyệt`/`LGTM`/`OK`) mới được sửa code.
- Muốn lưu vết → copy sang `docs/plans/YYYY-MM-DD-<slug>.md` commit CÙNG commit code.

---

## PHẦN 3 — TIÊU CHUẨN CHẤT LƯỢNG

## §7. Fix Priority & Verification

| Mức | Nghĩa |
| :-- | :-- |
| **P0** | Mất data / logic sai / crash `doGet`/`doPost` — fix ngay |
| **P1** | Tính năng hỏng |
| **P2** | Cosmetic / câu chữ |

Gate bắt buộc trước push (luật 4) — repo hiện skeleton, chạy đủ 4 lệnh:

| Lệnh | Chạy gì | Khi nào bắt buộc |
| :--- | :------ | :--------------- |
| `npm test` | `node --test tests/*.test.js` (hiện 1 smoke — tăng dần khi thêm logic) | Mọi commit |
| `npm run test:py` | `python3 -m unittest discover -s api -p 'test_*.py'` | Đổi `api/*.py` |
| `npm run build:local` | `scripts/build-local.js` → `index.local.html` cho `file://` (hiện stub copy `index.html`; khi tách `css.html`/`js.html` thì nâng lên inline `<?!= include() ?>` như `spx-diem-danh`) | Trước `test:chrome` |
| `npm run test:chrome` | `scripts/test-local-mock.js` (hiện stub; khi có UI thì nâng lên CDP headless + mock `google.script.run` như `spx-diem-danh` 12 check) | Đổi UI |

CI `.github/workflows/test.yml` chạy đủ 4 lệnh trên. Không claim pass khi chưa có output cụ thể. `index.local.html` đã `.gitignore`/`.claspignore`.

## §8. Security

- Mọi dữ liệu ngoài (form input, sheet, CSV data thật, response) là untrusted → validate trước khi dùng.
- Không lộ secret (luật 1). Không log full secret / response nhạy cảm — log `[REDACTED]`.
- Data thật (`*.csv`, ảnh ngoại lệ) không push lên GAS (đã có trong `.claspignore`) và không paste vào chat/output.

## §9. Performance

Để ý: loop `getValue` lẻ · `getDataRange()` toàn bảng khi chỉ cần vài cột · việc nặng trong lock · render không cần thiết. Optimize chỉ sau khi đúng — measure trước.

## §10. Code Review

Thứ tự: **(1)** Correctness **(2)** Readability **(3)** Architecture **(4)** Security **(5)** Performance. Tách required vs optional, luôn kèm đề xuất fix + `file:line`.

## §11. Done & Communication

- Done = requirement ✓ · test gate `§7` ✓ · behavior giữ ✓ · không đổi thừa ✓ · assumption/risk đã nêu ✓.
- Trả lời trực tiếp, không hoa mỹ. Task không trivial → Problem → Analysis → Solution → Verification → Risks. Task đơn giản → trả lời thẳng. Markdown ngắn gọn.

---

## PHẦN 4 — KIẾN THỨC DỰ ÁN

## §12. Platform GAS (subset áp dụng repo này)

- Timeout 6 phút; `CacheService` 100KB/key, luôn có fallback (không xem là source of truth); `LockService` script-level, scope tối thiểu; `UrlFetchApp` 20MB/60s.
- `Code.gs doGet` dùng `HtmlService.createTemplateFromFile('index').evaluate()` + hàm `include()` — **không dùng `createHtmlOutput`/`setContent`** (GAS sanitize, strip `<script>`).
- Timestamp chuẩn `Asia/Ho_Chi_Minh` + `Utilities.formatDate` (luật 11).
- Anti-patterns: loop `getValue`/`setValue` · `getDataRange()` khi chỉ cần 1 dòng (`getRange(row,col,1,n)`) · việc nặng trong lock · tin cache tuyệt đối · `console.log` ở production (dùng `Logger.log`).
- Checklist GAS: batch reads/writes ✓ · lock tối thiểu ✓ · cache có fallback ✓ · timezone chuẩn ✓ · timeout ổn ✓ · `Logger.log` ✓.

## §13. Dự án — cấu trúc & contract hiện tại

| File | Vai trò |
| :--- | :--- |
| `Code.gs` | Entry `doGet` + `include()` (khung — 13 dòng) |
| `index.html` | UI duy nhất (khung — chưa tách `css.html`/`js.html`; khi phình ra thì tách theo `spx-diem-danh §18` và giữ `index.html` chỉ HTML) |
| `appsscript.json` | Manifest (`Asia/Ho_Chi_Minh`, V8, WebApp `USER_DEPLOYING`/`DOMAIN`) |
| `api/` | Backend Python song song (hiện smoke; đổi logic → mirror cả `.gs` lẫn `api/*.py` như dual-runtime `spx-diem-danh`) |
| `tests/` | Test JS (`node:test`, glob `tests/*.test.js` — file mới tự chạy, không cần đăng ký) |
| `scripts/` | `build-local.js` + `test-local-mock.js` (stub — roadmap nâng cấp theo `§7`) |

Contract ngoài: WebApp `/exec` production redeploy qua CI (xem `§14`). Đổi API/schema/flow → sync `README.md` cùng commit (luật 9).

## §14. CI & Quy trình giao việc (kể cả cách làm mockup)

- CI `deploy.yml`: push `main` → `clasp push -f` (secrets `GAS_SCRIPT_ID`, `CLASPRC_JSON`) → tạo version → redeploy `/exec`. Agent **không tự chạy `clasp push`** (luật 5). Lưu ý: project GAS mới chưa có deployment versioned thì step redeploy SKIP xanh — phải tạo `Deploy > New deployment > Web app` 1 lần bằng tay.
- CI `test.yml`: chạy đủ gate `§7` (`npm test` + `test:py` + `build:local` + `test:chrome`).
- Chuẩn user: sửa code → verify (`§7`) → push GitHub ngay khi OK, **không hỏi, không làm preview/test link** trừ khi user yêu cầu.
- Commit message tiếng Anh, rõ vấn đề + giải pháp + verification (style: `feat: …`, `fix: …`, `fix(ci): …`).
- **Cách làm mockup — mặc định KHÔNG làm.** Chỉ làm khi user chủ động yêu cầu link xem (ngoại lệ duy nhất, luôn làm đúng các bước này, không hỏi lại):
  1. Mockup là HTML tĩnh độc lập trong `mockups/` (tên `NN-slug.html`: header giả lập + panel mẫu + JS demo spinner/toast, không gọi API thật). Mock GAS (`google.script.run`) để ở `mock/` (tham khảo `spx-diem-danh/mock/mock-google.js`, `gas-project-spx-trips/mock/gas-mock.js`). `mock/`, `mockups/`, `index.local.html` đã `.claspignore` — không lên GAS.
  2. Làm mẫu cho user duyệt trước, chốt mẫu mới làm tiếp, chốt xong mới commit + push (không commit mockup chưa duyệt).
  3. Link xem (repo PRIVATE nên `localhost`/ZIP/raw không mở được trên máy user): file mockup → commit lên branch preview tạm `preview/<slug>` + push → gom các file vào **1 secret gist** (`gh gist create f1.html f2.html …`, mặc định secret, cấm `--public`) → link bấm xem trực tiếp trên Chrome: `https://gist.githack.com/Duc-Nguyen-739/<gist-id>/raw/<file>` (dự phòng: `https://htmlpreview.github.io/?https://gist.githubusercontent.com/Duc-Nguyen-739/<gist-id>/raw/<file>`) → verify link bằng `webfetch` trước khi gửi → user chốt → port vào `index.html` → **xóa branch preview + xóa gist tạm** (`gh gist delete <id> --yes`).
  4. Lưu ý: githack cache theo URL → mỗi bản sửa tạo gist mới, không edit gist cũ; cấm bật GitHub Pages (repo chứa secret, Pages sẽ public). Làm >1 mẫu cùng đợt → dồn vào 1 file gallery tổng hợp (mọi biến thể trên cùng 1 trang, 1 bộ điều khiển dùng chung) — gist tạm chỉ chứa file gallery → gửi user đúng 1 link.

## §15. Ghi nhớ & Self-learning

- Sau mỗi task (5–10s): có pattern tái dùng >1 lần → đề xuất skill `skills/<tên>/SKILL.md`; quy ước dự án → cập nhật `AGENTS.md` này.
- Skip: one-off, typo, xã giao. Tự sửa lỗi: thừa nhận rõ → lưu bài học → lặp pattern thì tạo checklist.
- Không giả định pattern project A (`spx-diem-danh`, `gas-project-spx-trips`, `gas-project-spx-attendance`) áp dụng cho repo này khi chưa verify.

## §16. Định dạng output (rút gọn từ spx-diem-danh §20)

- Audit/review: TL;DR 1 dòng `✅ Approve — 0 P0 · 2 P1` / `⚠️ Cần duyệt — 1 P0` / `🔴 Blocked — 3 P0` + bảng `| # | Sev | Vấn đề | Vị trí | Đề xuất |` (mỗi finding có `file:line`, cell ≤1 dòng) + 2–3 dòng ưu tiên fix (P0→P1→P2). Không tường thuật dài ("có vẻ", "vài chỗ").
- Sửa code xong: thêm dòng `**Rule check:** A: … · B: … · C: …`.
- Q&A / bug đơn lẻ: trả lời thẳng <4 dòng, không đắp bảng.
