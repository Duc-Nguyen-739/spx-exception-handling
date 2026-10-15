# PLAN — Phân quyền dạng tích ✓ theo TỪNG người dùng (Role tab)

> **Trạng thái:** mockup **Mẫu 6 đã user chốt** ngày 2026-10-15.
> **Mockup gốc (mẫu để port):** `mockups/06-m6-role-tich-quyen-theo-tung-nguoi-dung.html` — gist `03172a43815e45015759c30bad283f81`, link `https://gist.githack.com/Duc-Nguyen-739/03172a43815e45015759c30bad283f81/raw/06-m6-role-tich-quyen-theo-tung-nguoi-dung.html`
> **Đọc trước khi code:** `AGENTS.md §1` (luật), `§1.1` (edit file tiếng Việt), `§6.1` (Checkpoint A/B/C), `§7` (gate verify).
> **Người/agent làm sau:** làm đúng thứ tự Phase 1 → 5. Mỗi Phase = 1 commit. Không nhảy bước, không làm song song Phase 2 và 1.

---

## 0. TL;DR — vấn đề & cách giải quyết

| | Hiện tại (code đang chạy) | Sau plan này |
| :-- | :-- | :-- |
| Mô hình quyền | Nhị phân: `role` = `ADMIN` hoặc `STAFF`. ADMIN bật **toàn bộ**, STAFF dùng **chung một bộ cứng** nằm trong code (`requireAdmin_()`). | ADMIN vẫn = bật toàn bộ. **STAFF có bộ quyền riêng theo từng email**, tích được từng cái. |
| Lưu ở đâu | Cột `role` sheet Users. `requireAdmin_()` đọc trực tiếp. | Thêm **cột 5 `perms`** sheet Users — chuỗi key phân tách bằng dấu phẩy. |
| UI trang Role | Bảng 3 cột: Email / Quyền (chip ADMIN-STAFF) / Xóa. | **Một bảng duy nhất**: `Email · Vai trò · 12 cột quyền (mỗi ô 1 nút tích ✓) · Đã mở · Xóa` + khối chú thích 12 cột. |
| Server chặn | 8 điểm `requireAdmin_()`, 8 RPC thao tác chính **không chặn gì**. | `checkPerm_(key)` tại **mọi** RPC ghi; `requireAdmin_()` giữ cho 3 RPC admin-không-có-nút. |

**Tại sao phải đổi cả server lẫn UI:** nếu chỉ vẽ bảng tích cho đẹp thì quyền chỉ là trang trí (mockup đã ghi rõ "server chưa đọc bảng này"). Giá trị thật nằm ở `checkPerm_(key)` + cột `perms`.

---

## 1. Quyết định kiến trúc (đã chốt — không đổi nếu chưa hỏi user)

### 1.1. Khóa quyền (key) — 12 cột, đúng mockup

| # | key | Cột UI | RPC server bị khóa | Mặc định STAFF |
| :- | :-- | :-- | :-- | :-: |
| 1 | `create` | Tạo mới | `createBox()` `Code.gs:954`, `createItem()` `:959` | BẬT |
| 2 | `resolve` | Resolve | `resolveItem()` `Code.gs:964` | BẬT |
| 3 | `liq` | Thanh lý | `liquidateBatch()` `Code.gs:989` | BẬT |
| 4 | `print` | In mã | `enqueuePrintJob()` `Code.gs:695`, `pollPrintJobs()` `:729`, `claimPrintJob()` `:750`, `ackPrintJob()` `:777` | BẬT |
| 5 | `backlog` | Backlog | `listBacklog()` `Code.gs:1548` | BẬT |
| 6 | `note` | Mô tả | `editItem()` `Code.gs:1336` | BẬT |
| 7 | `feedback` | Góp ý | `addFeedback()` `Code.gs:1498` | BẬT |
| 8 | `editStatus` | Đổi TT | `adminEditItem()` `Code.gs:1193` (nhánh đổi trạng thái) | TẮT |
| 9 | `editPhotos` | Ảnh | `adminEditItem()` `Code.gs:1193` (nhánh ảnh) | TẮT |
| 10 | `adminReply` | Reply | `replyFeedback()` `Code.gs:1516` | TẮT |
| 11 | `roleView` | Xem Role | `listUsers()` `Code.gs:1412` | TẮT |
| 12 | `roleManage` | User | `addAdmin()` `Code.gs:1429`, `deleteUser()` `Code.gs:1445`, `setUserPerms()` (mới) | TẮT |

> **Mặc định = đúng hành vi app đang chạy** (7 bật / 5 tắt). Nhờ vậy sau khi deploy, **không ai mất quyền** so với hôm qua.

**3 RPC không nằm trong 12 cột** (admin thuần, giữ nguyên `requireAdmin_()`): `fixPhotoSharing()` `Code.gs:1028`, `auditPhotosOutsideFolder()` `:1111`, `diagIdentity()` `:1148`. Lý do: không có nút trên UI, chỉ để admin chạy tay.

### 1.2. Định dạng cột `perms` (sheet Users)

```
email                     role    added_at             added_by                perms
son.nguyenngoc@...        STAFF   14/09/2026 16:02:00  duc.nguyenvan05@...     create,resolve,liq,print,backlog,note,feedback
tuan.pham@...             STAFF   06/10/2026 11:20:00  duc.nguyenvan05@...     create,resolve,note,NONE
admin.mock@...            ADMIN   01/09/2026 08:14:00  seed ADMIN              (trống)
```

Quy ước **bắt buộc** (viết lại vào README ở Phase 5):

| Giá trị ô `perms` | Nghĩa | Vì sao |
| :-- | :-- | :-- |
| **Trống** | Theo mặc định của role (`PERM_DEFAULT` cho STAFF, tất cả cho ADMIN) | **Tương thích ngược**: 100% dòng đang tồn tại có ô trống → hành vi không đổi ngay khi deploy, chưa cần migrate dữ liệu. |
| Danh sách key, phẩy: `create,liq,note` | **Chỉ đúng các key đó được bật** | Đây là dạng mà bảng tích ghi ra. |
| `NONE` | Tắt toàn bộ (không quyền nào) | Cần token riêng vì "trống" đã mang nghĩa khác. |
| Key lạ / sai chính tả | Bỏ qua key đó + `Logger.log('perm key lạ: %s')` | Không được để chuỗi rác vô tình mở quyền. |
| `role === 'ADMIN'` | Bỏ qua `perms`, luôn = 12/12 | ADMIN là lối tắt "bật hết", không tích. |

### 1.3. Ai được sửa bảng quyền

Chỉ người có `roleManage`. Server check **mọi** RPC ghi quyền. Self-lock guard (3 lớp, xem §1.5).

### 1.4. SSOT — 1 logic 1 nơi (luật 10)

| Logic | Bản gốc (duy nhất) | Bản mirror (có chủ đích) | Guard test |
| :-- | :-- | :-- | :-- |
| `PERM_KEYS` + `PERM_DEFAULT` | `Code.gs` (mới, ngay sau `USERS_HEADER` `:11`) | `index.html` (`var PERM_KEYS`), `mock/mock-google.js`, `api/logic.py` | `tests/perm-model.test.js` so 4 bản **giống hệt nhau, cùng thứ tự** |
| `parsePerms_(str, role)` | `Code.gs` | `api/logic.py: parse_perms`, `index.html` **không** parse (chỉ nhận object từ `me()`) | `tests/perm-model.test.js` |
| `can(k)` phía client | `index.html` | — (mock không cần) | `tests/perm-ui.test.js` |

> Client **không bao giờ tự suy ra quyền** từ role — luôn dùng `perms` do `me()` trả về. Server vẫn là chân lý; `can()` chỉ để ẩn nút cho gọn, không phải để bảo mật.

### 1.5. Chống tự khóa (bắt buộc cả server + UI)

1. Không tự tắt `roleView` của chính mình → server `setUserPerms` throw `'Không tự tắt quyền xem trang Role của chính mình.'`
2. Không tự hạ mình từ ADMIN xuống STAFF → throw `'Không thể hạ ADMIN cuối cùng.'` nếu mình là ADMIN duy nhất.
3. `seedAdmins_()` (`Code.gs:1373`, Script Properties `ADMIN_EMAILS`) **luôn** là ADMIN bất kể bảng này — lối thoát nếu khóa nhầm cả nhóm.
4. Ô tích của dòng ADMIN hiển thị dạng khóa (✓ xanh, không bấm được) — mô phỏng đúng rule 3 trong mockup.

---

## 2. Contract mới (RPC)

| RPC | Loại | Thay đổi |
| :-- | :-- | :-- |
| `me()` | có sẵn `Code.gs:1405` | **Thêm field `perms`** (object 12 key `0/1`) vào `data`. Không đổi field cũ → client cũ vẫn chạy. |
| `listUsers()` | có sẵn `:1410` | **Thêm field `perms`** (object) mỗi dòng. Vẫn gate = `checkPerm_('roleView')`. |
| `addAdmin(email)` | có sẵn `:1427` | Giữ nguyên **chữ ký + hành vi** (luôn thêm ADMIN) cho tương thích; gate đổi thành `checkPerm_('roleManage')`. |
| `addUser(email, role)` | **MỚI** | Thêm với vai trò chọn trước (`STAFF` mặc định). STAFF → `perms` ghi `''` (theo mặc định). |
| `setUserPerms(email, role, keys)` | **MỚI** | Ghi đè 1 dòng: `role` + `perms`. `keys` = mảng key đang bật (bất kể thứ tự). Trả về `{email, role, perms}` mới. |
| `deleteUser(email)` | có sẵn `:1443` | Gate → `checkPerm_('roleManage')`. Giữ 2 guard cũ. |

**Shape trả về** (JSON qua `ok()`/`fail()` `Code.gs:57-58`):

```js
me()        -> { ok:true, data:{ email, role, deployer, perms:{create:1, resolve:1, ..., roleManage:0} } }
listUsers() -> { ok:true, data:[ { email, role, addedAt, addedBy, perms:{...} }, ... ] }
setUserPerms(email,'STAFF',['create','liq'])
            -> { ok:true, data:{ email, role:'STAFF', perms:{create:1, liq:1, ...0} } }
```

---

## 3. PHASE 1 — Server (`Code.gs`) + mirror Python (`api/logic.py`)

> **Mục tiêu Phase này:** bật xong là **hành vi y hệt hôm qua** (vì mọi ô `perms` đang trống → mặc định). UI chưa đổi. An toàn deploy riêng.

### B1.1 — Thêm bảng key + header 5 cột
- **File:** `Code.gs` dòng **11** (`var USERS_HEADER = [...]`).
- **Làm:**
  ```js
  var USERS_HEADER = ['email', 'role', 'added_at', 'added_by', 'perms'];
  var PERM_KEYS = ['create','resolve','liq','print','backlog','note','feedback',
                   'editStatus','editPhotos','adminReply','roleView','roleManage'];
  var PERM_DEFAULT = { create:1, resolve:1, liq:1, print:1, backlog:1, note:1, feedback:1,
                       editStatus:0, editPhotos:0, adminReply:0, roleView:0, roleManage:0 };
  // KHỚP index.html PERM_KEYS + api/logic.py PERM_KEYS — guard: tests/perm-model.test.js
  ```
- **Lưu ý bẫy:** `readUsers_()` `Code.gs:1382` và `deleteUser()` `:1459-1463` dùng `USERS_HEADER.length` → tự động đọc/ghi 5 cột, **không phải sửa vòng lặp**. Nhưng `getSheet_()` `:100` **chỉ ghi header khi tạo sheet mới** → sheet Users đã tồn tại sẽ KHÔNG tự có cột 5. Xử lý ở B1.2.
- **Verify:** `npm test` vẫn xanh (chưa đổi hành vi).

### B1.2 — Hàm bảo đảm cột `perms` tồn tại
- **File:** `Code.gs`, đặt ngay trên `readUsers_()` `:1378`.
- **Làm:** hàm `ensureUsersHeader_()`:
  ```js
  function ensureUsersHeader_() {
    var sh = getSheet_('Users', USERS_HEADER);
    if (sh.getLastColumn() < USERS_HEADER.length) {
      sh.getRange(1, 1, 1, USERS_HEADER.length).setValues([USERS_HEADER]);
    }
    return sh;
  }
  ```
  `readUsers_()` `:1379` đổi `getSheet_(...)` → `ensureUsersHeader_()`.
- **Vì sao:** tránh `getRange(2,1,n,5)` ném lỗi trên sheet 4 cột cũ (P0 — sập trang Role).
- **Verify:** test `perm-model` (B1.9) assert `readUsers_` có gọi `ensureUsersHeader_`.

### B1.3 — `parsePerms_(raw, role)` + `permsOfRow_`
- **File:** `Code.gs`, ngay dưới `getRole_()` `:1395`.
- **Làm:**
  ```js
  function parsePerms_(raw, role) {
    var o = {};
    if (role === 'ADMIN') { PERM_KEYS.forEach(function (k) { o[k] = 1; }); return o; }
    var s = String(raw == null ? '' : raw).trim();
    if (!s) { PERM_KEYS.forEach(function (k) { o[k] = PERM_DEFAULT[k] ? 1 : 0; }); return o; }  // tương thích ngược
    if (/^none$/i.test(s)) { PERM_KEYS.forEach(function (k) { o[k] = 0; }); return o; }
    var seen = {};
    s.split(',').forEach(function (kRaw) {
      var k = String(kRaw).trim().toLowerCase();
      if (!k) return;
      if (PERM_KEYS.indexOf(k) < 0) { Logger.log('perm key lạ: ' + k); return; }
      seen[k] = 1;
    });
    PERM_KEYS.forEach(function (k) { o[k] = seen[k] ? 1 : 0; });
    return o;
  }
  function permsOf_(email) { /* readUsers_ -> dòng khớp email -> parsePerms_(row[4], row[1]); email lạ -> parsePerms_('', 'STAFF') */ }
  ```
- **Ghi chú:** email không có trong sheet → STAFF + mặc định, **khớp** `getRole_()` `:1394` hiện hành.
- **Verify:** `tests/perm-model.test.js` (B1.9) — 8 case.

### B1.4 — `checkPerm_(key)` cạnh `requireAdmin_()`
- **File:** `Code.gs:1397-1399`.
- **Làm:** giữ nguyên `requireAdmin_()` (3 RPC admin-thuần vẫn dùng), thêm:
  ```js
  function currentPerms_() { /* memo theo biến script-level PERMS_MEMO_ trong 1 lần thực thi RPC */ }
  function checkPerm_(key) {
    if (getRole_() === 'ADMIN') return;
    if (!currentPerms_[key]) throw new Error('Bạn không có quyền: ' + PERM_LABELS[key] + '. Liên hệ ADMIN.');
  }
  ```
  Thêm `var PERM_LABELS = { create:'Tạo mới', ... }` (tiếng Việt, dùng cho message lỗi + tiêu đề cột tooltip — **KHỚP** `index.html`).
- **Memo là bắt buộc:** `getRole_()` đọc sheet; nếu `checkPerm_` gọi thẳng 2-3 lần/RPC sẽ nhân đôi `getValues()`. `PERMS_MEMO_` reset tự nhiên vì mỗi GAS request là một runtime mới — ghi comment này cạnh hàm (rationale, luật 8 cho phép).
- **Verify:** `npm run test:py` + test vm B1.10.

### B1.5 — Gắn `checkPerm_` vào 12 RPC
- **File:** `Code.gs`, chèn dòng đầu trong `try{}` của từng hàm:

| Dòng | Hàm | Chèn |
| :-- | :-- | :-- |
| 954 | `createBox` | `checkPerm_('create');` |
| 959 | `createItem` | `checkPerm_('create');` |
| 964 | `resolveItem` | `checkPerm_('resolve');` |
| 989 | `liquidateBatch` | `checkPerm_('liq');` |
| 695 | `enqueuePrintJob` | `checkPerm_('print');` |
| 729 | `pollPrintJobs` | `checkPerm_('print');` |
| 750 | `claimPrintJob` | `checkPerm_('print');` |
| 777 | `ackPrintJob` | `checkPerm_('print');` |
| 1336 | `editItem` | `checkPerm_('note');` |
| 1498 | `addFeedback` | `checkPerm_('feedback');` |
| 1548 | `listBacklog` | `checkPerm_('backlog');` |
| 1193 | `adminEditItem` | **tách nhánh**, xem B1.6 |

- **KHÔNG gate:** `doGet`, `listItems`/`listFull`/`getItem` (đọc danh sách — mọi email trong sheet đều xem được, giữ nguyên behavior, luật 7), `me()`, `previewCode`/`previewBulkCodes` (chỉ xem trước mã).
- **Verify (assert theo key, không đếm dòng):** với **cả 12** key trong `PERM_KEYS`, `Code.gs` phải chứa ít nhất một dòng `checkPerm_('<key>')`. Test B1.9#9 kiểm đúng 12 key này.

### B1.6 — Tách `adminEditItem()` thành 3 quyền (`Code.gs:1193-1334`)
- **Vấn đề:** hàm này đang `requireAdmin_()` ở `:1195` rồi sửa **cả** trạng thái, ảnh, mô tả, ghi chú. Cần tách mà **không đổi chữ ký** (client cũ vẫn gọi được).
- **Làm:** thay `requireAdmin_()` `:1195` bằng khối suy theo payload (`p` đã được chuẩn hóa ở `:1196`, `code`/`desc`/`note` đã đọc ở `:1197-1200` — chèn sau các dòng đó, **không** viết lại `p = p || {}`):
  ```js
  var changingStatus = p.status !== undefined && canonicalStatus_(p.status) !== currentStatus;
  var changingPhotos = !!(p.photos && p.photos.length) || !!p.removePhoto;
  if (changingStatus) checkPerm_('editStatus');
  if (changingPhotos) checkPerm_('editPhotos');
  if (!changingStatus && !changingPhotos) checkPerm_('note');   // chỉ mô tả/ghi chú
  ```
  (`currentStatus` = trạng thái gốc của đơn, lấy từ `findItemRow_(code)` `Code.gs:321` — kiểm tra xem hàm đã đọc sẵn dòng đơn chưa; nếu rồi thì dùng biến đang có, đừng đọc lại sheet.)
- **Rủi ro phải kiểm:** `adminEditItem` có 2 luồng ảnh (thêm mới + xóa slot). **Bắt buộc** mở hàm này ra đọc hết `:1193-1334` trước khi chèn, nếu không sẽ chặn nhầm luồng xóa ảnh.
- **Verify:** test `tests/perm-rpc.test.js` — 4 case: STAFF đổi status → fail; STAFF chỉ đổi mô tả → ok; STAFF thêm ảnh → fail; ADMIN → ok hết.

### B1.7 — Đổi 4 điểm `requireAdmin_()` còn lại sang `checkPerm_`
| Dòng cũ | Hàm | Thành |
| :-- | :-- | :-- |
| 1412 | `listUsers` | `checkPerm_('roleView');` |
| 1429 | `addAdmin` | `checkPerm_('roleManage');` |
| 1445 | `deleteUser` | `checkPerm_('roleManage');` |
| 1516 | `replyFeedback` | `checkPerm_('adminReply');` |

**Giữ nguyên `requireAdmin_()`:** `:1028`, `:1111`, `:1148`.
**Verify:** `grep -n "requireAdmin_()" Code.gs` còn đúng **4** dòng (1397 định nghĩa + 3 call site).

### B1.8 — RPC mới `addUser` + `setUserPerms`, và `me()`/`listUsers()` trả `perms`
- **File:** `Code.gs` khối `:1405-1467`.
- **Làm:**
  - `me()` `:1406`: `data:{ email, role, deployer, perms: parsePerms_(rowPerms, role) }`.
  - `listUsers()` `:1422`: thêm `perms: parsePerms_(cellText_(r[4]), cellText_(r[1]))` vào mỗi phần tử `out`; **appendRow seed** `:1418` thành 5 cột `[seed,'ADMIN',at,by,'']`.
  - `addUser(email, role)` — copy `addAdmin` `:1427`, thêm `role = (role === 'ADMIN' ? 'ADMIN' : 'STAFF')`, `appendRow([email, role, "'"+nowStr_(), currentEmail_(), ''])`, gate `roleManage`.
  - `setUserPerms(email, role, keys)` — **viết mới, trong `withLock_`** (pattern `:1432`, `:1449`):
    1. `checkPerm_('roleManage')` **ngoài** lock (lock chỉ bọc phần ghi sheet — luật §12 "scope tối thiểu").
    2. `email = normEmail_(email)`; validate `role ∈ {ADMIN,STAFF}`; `keys` là mảng, lọc theo `PERM_KEYS`.
    3. Tìm `idx` trong `u.rows`; không thấy → `throw 'Email không có trong danh sách.'`
    4. **Guard self-lock** (§1.5): nếu `email === currentEmail_()`:
       - `role==='STAFF' && !PERM_DEFAULT.roleView && keys.indexOf('roleView')<0` → throw `'Không tự tắt quyền xem trang Role của chính mình.'`
       - `role==='STAFF' && số ADMIN hiện có <= 1` → throw `'Không thể hạ ADMIN cuối cùng.'`
    5. Tính chuỗi `perms`: `role==='ADMIN' ? '' : (keys.length ? keys.join(',') : 'NONE')`.
    6. Ghi **1 ô** `u.sh.getRange(idx+2, 5).setValues([[str]])` + `getRange(idx+2,2).setValues([[role]])` — **không** ghi lại cả bảng (batch 1 ô, nhanh hơn + ít va chạm).
    7. Trả `{ email, role, perms: parsePerms_(str, role) }`.
- **Verify:** `listUsers()` trên sheet cũ 4 cột không lỗi (ô 5 undefined → `parsePerms_` xem là trống → mặc định).

### B1.9 — Test logic thuần: `tests/perm-model.test.js` (MỚI)
- **Pattern:** theo `tests/feedback.test.js:1-45` — mirror hàm thuần + assert chuỗi trong source.
- **Case bắt buộc (≥ 10):**
  1. `PERM_KEYS` của `Code.gs` ≡ `index.html` ≡ `mock/mock-google.js` ≡ `api/logic.py` (**cùng thứ tự**, so bằng regex extract từ file).
  2. `parsePerms_('', 'STAFF')` = đúng `PERM_DEFAULT` (7 bật / 5 tắt).
  3. `parsePerms_('create,liq','STAFF')` = chỉ 2 key bật.
  4. `parsePerms_('NONE','STAFF')` = 0 bật.
  5. `parsePerms_('','ADMIN')` = 12 bật.
  6. `parsePerms_('create,bogus','STAFF')` = chỉ `create` (key lạ bị bỏ).
  7. `parsePerms_(' CREATE , liq ','STAFF')` = 2 bật (chấp nhận hoa + khoảng trắng).
  8. `USERS_HEADER.length === 5` và `'perms'` là cột cuối.
  9. Gate đủ 12 key: với mỗi `k` trong `PERM_KEYS`, `Code.gs` chứa `checkPerm_('k')` (bắt lỗi quên gate RPC nào đó — R6).
  10. `readUsers_` có gọi `ensureUsersHeader_`.

### B1.10 — Test RPC qua vm: `tests/perm-rpc.test.js` (MỚI)
- **Pattern:** `vm.runInContext` + sheet giả, theo `tests/cache-pages.test.js`.
- **Case:** `checkPerm_` throw/đúng thông báo · `adminEditItem` tách 3 quyền (4 case B1.6) · `setUserPerms` tự tắt `roleView` của mình → fail · `setUserPerms` hạ ADMIN cuối → fail · `setUserPerms` ghi đúng ô cột 5 (assert `setValues` nhận `[['create,liq']]`).

### B1.11 — Mirror Python: `api/logic.py`
- **Làm:** thêm `PERM_KEYS`, `PERM_DEFAULT`, `PERM_LABELS`, `parse_perms(raw, role)`, `check_perm(perms, key)` — **dịch 1:1** §1.2/§1.3, docstring ghi `KHỚP server: Code.gs parsePerms_ / checkPerm_`.
- **Test:** `api/test_logic.py` thêm ≥ 6 case (giống B1.9 mục 2-7).
- **Verify:** `npm run test:py`.

### B1.12 — Gate kết thúc Phase 1
```bash
npm test && npm run test:py && npm run build:local
```
Cả 3 phải xanh (nền hiện tại: **252 test pass**). Commit theo §6.

---

## 4. PHASE 2 — UI `index.html` (port mockup Mẫu 6)

> **Chỉ làm sau Phase 1.** Dùng `mockups/06-...html` làm bản chuẩn về hình — mở song song 2 file.

### B2.1 — `state.me.perms` + helper `can(k)`
- **File:** `index.html:1935-1938` (`loadMe`).
- **Làm:**
  - `var PERM_KEYS = [...12 key...]; var PERM_LABELS = {...};` đặt cạnh `state` — comment `// KHỚP server Code.gs:PERM_KEYS — guard tests/perm-model.test.js`.
  - `can(k)`: `var m=state.me||{}; if(m.role==='ADMIN')return true; return !!(m.perms&&m.perms[k]);`
  - **Dòng fallback `:1937`** `state.me={email:'',role:'STAFF'}` → thêm `perms:{}` (rỗng = không có quyền nào, an toàn khi `me()` lỗi).
- **Verify:** `grep -c "function can(" index.html` = 1 (không trùng hàm khác — luật 10, grep trước khi tạo).

### B2.2 — Ẩn/hiện theo quyền (thay các điểm `role==='ADMIN'`)
| Vị trí | Hiện tại | Thành |
| :-- | :-- | :-- |
| `index.html:1944` `navAccess` | `e.role==='ADMIN'` | `can('roleView')` |
| `index.html:1468` (`openEdit`) | `adm` cho cả khối trạng thái + ảnh | `canA = can('editStatus')`, `canP = can('editPhotos')`, `canN = can('note')` → ẩn **riêng từng khối** |
| `index.html:1507` (`confirmEdit`) | `adm` | `can('editStatus')` cho nhánh status, `can('editPhotos')` cho nhánh ảnh, `can('note')` cho mô tả/ghi chú |
| `index.html:2490` `fbIsAdmin()` | `role==='ADMIN'` | `can('adminReply')` |
| Nút/side nav: Tạo mới, Backlog, In Mã, Thanh lý, 💬 | đang hiện cho mọi người | bọc `can('create')` / `can('backlog')` / `can('print')` / `can('liq')` / `can('feedback')` — **tìm bằng** `grep -n "navCreate\|navBacklog\|navPrint\|navLiq\|btnFeedback" index.html` và `RAILNAV` `index.html:1036` |
| Nút Resolve trong drawer | luôn hiện | `can('resolve')` |

- **Bẫy:** `RAILNAV` `index.html:1036` là mảng tĩnh → phải lọc lúc render theo `can()`, không hard-code trong mảng.
- **Bẫy 2:** `renderWho()` `:1940` là nơi duy nhất cập nhật chip + nav → gọi `renderWho()` lại sau khi đổi quyền của **chính mình** để UI cập nhật ngay.
- **Verify:** `npm run build:local` rồi mở `index.local.html` — STAFF mock không còn thấy tab bị tắt.

### B2.3 — Vẽ lại khối `#viewAccess` (bảng M6)
- **File:** `index.html:682-…` (khối `<main id="viewAccess">`, có `#msgAccess`, `#accessAdmin`, `#newEmail`, `#btnAddUser`, `#usersTable`).
- **Làm:**
  - Giữ `#msgAccess`, `#msgDeploy`, `#viewAccess` (đừng đổi id — `showAccess()` `:2383` và `showLiq()` `:2382` đang reference).
  - Hàng thêm user: thêm `<select id="newRole"><option value="STAFF">STAFF — bộ mặc định</option><option value="ADMIN">ADMIN — bật toàn bộ</option></select>` giữa `#newEmail` và `#btnAddUser`.
  - `#usersTable` → container `#permTable` dựng bảng 2 dòng header:
    - Dòng 1 (nhóm): `Email người dùng` (rowspan2, `class="pin"`) · `Vai trò` · `colspan=4 Đơn & thao tác chính` · `colspan=3 Sửa hồ sơ đơn` · `colspan=3 Backlog & Góp ý` · `colspan=2 Quản trị` · `Đã mở` · `Xóa`.
    - Dòng 2 (12 cột): nút `.hpk` = icon + nhãn tắt (`Tạo mới/Resolve/Thanh lý/In mã/Mô tả/Đổi TT/Ảnh/Backlog/Góp ý/Reply/Xem Role/User`) + badge `đang bật/số STAFF`, `data-k=<key>` để bật/tắt cả cột.
    - `tbody`: mỗi user 1 dòng — `.pin` email + `thêm … bởi …` + badge `BẠN`; `.seg` ADMIN/STAFF; 12 ô `.ck` (dòng ADMIN = `.ck.lk` khóa); `.cCnt` `n/12` + thanh; `.cDel` nút Xóa (ẩn ở dòng của chính mình).
  - Bên dưới: khối **chú thích 12 cột** (mỗi cột: key, tên đầy đủ, hàm server, tắt thì ẩn gì, `requireAdmin_()`/`checkPerm_()` chặn ở đâu) — copy nội dung từ `PG`/`RRULE` trong mockup 06, **bỏ** các dòng "mockup chỉ đổi giao diện".
- **Nguồn port:** `mockups/06-m6-role-tich-quyen-theo-tung-nguoi-dung.html` — hàm `roleTable()` / `roleCards()` / `permLegend()` / `rRole()` và CSS khối `/* ===== M6 ... ===== */`.

### B2.4 — CSS
- **File:** `index.html` `<style>`, cạnh `#usersTable .roleBtn` `index.html:285`.
- **Làm:** port các rule `.uptbl / .ugr / .hpk / .ck / .ck.lk / .seg / .cRole / .cCnt / .cDel / .selftag / .addrow / .ucard / .pchip` từ mockup 06, **đổi biến màu sang biến đang dùng trong `index.html`** (app thật không có `--stO/--acc` kiểu glass — kiểm tra bằng `grep -n ":root" index.html`, nếu không có thì dùng màu literal theo `#usersTable` hiện hành).
- **Bắt buộc:** cột `Email` `position:sticky;left:0` + `overflow-x:auto` trên wrapper (12 cột không vừa 1024px).

### B2.5 — Wiring sự kiện
- **File:** `index.html:1952-1970` (`loadUsers`), `:2013` (`delUser`), `:2354-2357` (`btnAddUser`/`addAdmin`).
- **Làm:**
  - `loadUsers()` render bảng từ `r.data[].perms`; gắn `onclick` cho `.ck` (1 ô), `.hpk` (cả cột), `.seg` (đổi vai trò), `.roleBtn` (xóa).
  - `savePerms(email, role, keys)` → `await gs('setUserPerms',[email, role, keys])` → `msg('msgAccess', 'Đã lưu …', true)` → `await loadUsers()`; nếu email == mình → `await loadMe()`.
  - **Chống spam sheet:** gom click trong 600ms bằng 1 `setTimeout` (debounce) rồi mới gửi 1 lần `setUserPerms` — vì mỗi lần tích là 1 lần ghi sheet + `withLock_`. Ghi rationale bằng 1 comment ngắn (luật 8).
  - `btnAddUser` `:2354` gọi `addUser(email, $('#newRole').value)` thay `addAdmin`.
  - `showAccess()` `:2383-2387`: bỏ thông báo "Chỉ ADMIN mới xem được trang này." ở client, **vẫn giữ** vì server đã `checkPerm_('roleView')` — chỉ đổi text khi `r.ok===false`.
- **Bẫy XSS:** mọi email/key render vào HTML phải qua `esc()` (đã có) — dữ liệu đến từ sheet = untrusted (luật §8).

### B2.6 — Mock + test chrome
- **File:** `mock/mock-google.js:120` (`me`), `:250-252` (`listUsers`/`addAdmin`/`deleteUser`).
- **Làm:**
  - Thêm `USERS` 5 người (2 ADMIN / 3 STAFF) đúng như mockup + `perms` theo `PERM_DEFAULT`; `me()` trả `perms` của `ME`.
  - Thêm `PERM_KEYS` (KHỚP server), `addUser(email, role)`, `setUserPerms(email, role, keys)` có **cùng 2 guard self-lock** như server.
  - Thêm `window.__setMockEmail(e)` để test chrome đổi người đăng nhập (hiện `ME` là biến cứng `mock-google.js:16`).
- **File:** `scripts/test-local-mock.js` — thêm `check(...)` (helper `:151`):
  1. `Bảng Role: 5 dòng x 12 cột tích` (đếm `.ck` = 36 nút + 24 ô khóa).
  2. `Tích 1 ô -> goi setUserPerms dung key`.
  3. `Bam nhan dau cot -> bat/tat ca cot cho STAFF`.
  4. `Dong ADMIN khoa o tich` (không có `data-k` trên ô khóa).
  5. `STAFF khong co roleView -> an tab Role` (dùng `__setMockEmail`).
  6. `Tu tat roleView cua minh -> server bao loi, UI khong doi`.
- **Verify:** `npm run build:local && npm run test:chrome` → tất cả check xanh.

---

## 5. PHASE 3 — Dữ liệu thật & rollout (không code)

| Bước | Ai | Việc | Kiểm tra |
| :-- | :-- | :-- | :-- |
| 3.1 | CI (tự động) | push `main` → `deploy.yml` `clasp push -f` + redeploy `/exec` | `gh run list --workflow=deploy.yml` xanh. **Agent không tự `clasp push`** (luật 5). |
| 3.2 | user/admin | Mở sheet Users → nhìn dòng 1 có 5 cột `email role added_at added_by perms` | Nếu chưa có cột `perms`: lần đầu vào tab Role (Phase 2 xong) sẽ tự ghi header (B1.2). |
| 3.3 | user/admin | Vào tab Role, **chưa tích gì cả** | 5 người dùng hiện đúng như cũ; STAFF vẫn làm được 7 việc cũ → xác nhận không mất quyền. |
| 3.4 | user/admin | Tích thử 1 quyền cho 1 STAFF (vd bật `Đổi TT` cho `tuan.pham`) | Reload bằng tài khoản đó → thấy khối Trạng thái trong Edit. |
| 3.5 | user/admin | Bật `roleView` cho 1 người rồi đăng nhập bằng người đó | Thấy tab Role, bảng ở chế độ **chỉ đọc** (không có `roleManage`). |
| 3.6 | — | Nếu có người bị mất quyền ngoài ý muốn | **Xóa nội dung ô `perms` của họ** → về `PERM_DEFAULT` = hành vi cũ. Không cần revert code. |

**Thứ tự an toàn:** Phase 1 deploy trước (hành vi y hệt) → Phase 2 deploy sau. Không gộp 1 commit.

---

## 6. Plan commit (luật 5: 1 issue → verify → commit → push)

| # | Commit | Phạm vi | Gate trước khi commit |
| :- | :-- | :-- | :-- |
| C1 | `feat(perms): per-user permission model in Code.gs (+ python mirror)` | B1.1–B1.11 | `npm test` + `test:py` |
| C2 | `feat(ui): rebuild Role tab as per-user tick table (index.html + mock)` | B2.1–B2.6 | `npm test` + `build:local` + `test:chrome` |
| C3 | `docs(readme): document perms column, 12 permission keys, new RPCs` | §7 | `npm test` |
| C4 | `chore(plan): add Plan-new/Plan.md for per-user permissions` | file plan này | — |

> **Luật 9:** C1 **đã đổi contract RPC** (`me()`, `listUsers()`) → README **phải** đổi cùng. Nếu tách C3 ra sau thì C1 và C3 phải push **cùng một đợt** (liên tiếp, không xen commit khác). Cách an toàn nhất: gộp README vào C1.
> Mỗi commit: Checkpoint B (`git diff --stat` + đọc từng dòng) → commit → Checkpoint C (`git show HEAD`) → push.

---

## 7. README cần viết thêm (luật 9)

Vị trí: `README.md` mục **`## Contract`** (dòng 24) và **`## Setup GAS (Script Properties)`** (dòng 17).

1. Bảng **Users** nay có **5 cột**, mô tả `perms` theo bảng §1.2 (trống = mặc định, `NONE` = tắt hết, ADMIN bỏ trống).
2. Liệt kê **12 key** + quyền nào mặc định bật/tắt + RPC tương ứng.
3. RPC mới: `addUser(email, role)`, `setUserPerms(email, role, keys)`; RPC cũ trả thêm `perms`: `me()`, `listUsers()`.
4. Ghi chú vận hành: `ADMIN_EMAILS` (Script Properties) vẫn là ADMIN tuyệt đối — lối thoát chống tự khóa.
5. Ảnh/link mockup: `mockups/06-m6-role-tich-quyen-theo-tung-nguoi-dung.html`.

---

## 8. Rủi ro & cách xử lý

| # | Rủi ro | Xác suất | Ảnh hưởng | Xử lý |
| :- | :-- | :-: | :-: | :-- |
| R1 | Sheet Users cũ chưa có cột 5 → `getRange(...,5)` lỗi | Cao (chắc chắn xảy ra nếu bỏ B1.2) | P0 — sập tab Role | B1.2 `ensureUsersHeader_()` + test B1.9#8 |
| R2 | Tích nhầm tắt hết quyền của mọi người | Trung bình | P1 — cả nhóm không tạo được đơn | Mặc định ô trống = hành vi cũ; §3.6 xóa ô là xong; không có nút "tắt tất cả cho mọi người" (chỉ theo cột/cá nhân) |
| R3 | `adminEditItem` tách quyền sai nhánh → STAFF sửa mô tả bị chặn | Trung bình | P1 | B1.6 bắt buộc đọc hết `:1193-1334` + 4 case test B1.10 |
| R4 | Mỗi click ghi 1 lần sheet + lock → chậm/nặng khi tích cả cột | Cao | P2 → P1 khi >10 người | Debounce 600ms (B2.5); bật/tắt cả cột = **1 RPC/người** nhưng tuần tự + toast tổng kết; cân nhắc `setUserPermsBulk` nếu phàn nàn |
| R5 | `getRole_()` + `permsOf_()` đọc sheet nhiều lần trong 1 RPC | Trung bình | P2 hiệu năng | `PERMS_MEMO_` B1.4; test `tests/perf-bounds.test.js` đang có — giữ ngưỡng |
| R6 | Client ẩn nút nhưng server chưa gate đủ → tưởng là bảo mật | Thấp | **P0 bảo mật** | B1.5 liệt kê **đủ 12 RPC**; test B1.9#9 assert cả 12 key đều có `checkPerm_('<key>')`; **không** tin `can()` |
| R7 | `esc()` thiếu khi render email từ sheet | Thấp | P0 XSS | B2.5 bắt buộc; test chrome assert không có `<` thô |
| R8 | Deploy GAS chưa có versioned deployment → CI SKIP bước redeploy | Cao (repo mới) | P2 | §14 AGENTS: tạo `Deploy > New deployment > Web app` 1 lần bằng tay |

---

## 9. Definition of Done (checklist cho agent thực hiện)

- [ ] `npm test` xanh, **số test tăng** (nền 252 → ≥ 275 với B1.9 + B1.10 + B2).
- [ ] `npm run test:py` xanh (thêm `parse_perms`/`check_perm`).
- [ ] `npm run build:local` + `npm run test:chrome` xanh, có ≥ 6 check mới của B2.6.
- [ ] `PERM_KEYS` giống hệt nhau ở **4** nơi, có guard test (luật 10).
- [ ] `grep -n "requireAdmin_()" Code.gs` còn đúng 4 dòng (1 định nghĩa + 3 RPC admin-thuần); **cả 12 key** đều có `checkPerm_('<key>')` tương ứng.
- [ ] Không còn `role==='ADMIN'` rời rạc ở UI ngoại trừ `can()` và `parsePerms_` server.
- [ ] README §Contract + §Setup đã đổi **cùng commit** với commit đổi contract (luật 9).
- [ ] Không lộ Script ID / email thật / đường dẫn sheet trong code, log, output (luật 1).
- [ ] File `index.html`/`Code.gs`: LF, UTF-8 **không BOM** (luật 11) — kiểm bằng
  `python3 -c "d=open('index.html','rb').read();print('CRLF',d.count(b'\r\n'),'BOM',d[:3]==b'\xef\xbb\xbf')"`.
- [ ] Có dòng `**Rule check:** A: … · B: … · C: …` trong báo cáo kết quả (§6.1).
- [ ] Không tự chạy `clasp push` — để CI `deploy.yml` (luật 5).

---

## 10. Bối cảnh thêm (để người khác làm tiếp được ngay)

- **Repo:** `spx-exception-handling` — GAS WebApp (`Code.gs` 1570 dòng, `index.html` 2584 dòng, `appsscript.json` 17 dòng) + backend Python song song `api/logic.py` (371 dòng) + 51 file test JS.
- **Mockup đã chốt** chỉ nằm ở gist `03172a43815e45015759c30bad283f81` (file `06-...`) + bản local `mockups/06-...` (mockup 02→05 đã được track trong git, nên 06 commit được nếu user đồng ý — **đã chốt mẫu**, xem C4).
- **Harness test JS:** 2 kiểu — (a) mirror hàm thuần (`tests/feedback.test.js`), (b) `vm.runInContext` + DOM/sheet giả (`tests/cache-pages.test.js`), (c) extract hàm từ `index.html` bằng `fnSrc()` (`tests/photo-chain.test.js:12-30`) — dùng (c) cho `can()`.
- **Điểm gate UI hiện có** (tất cả dựa vào `role`): `index.html:1468`, `:1507`, `:1944`, `:2387`, `:2490`.
- **Chưa làm (ngoài scope, ghi lại để bàn sau):**
  - Trang "log ai đổi quyền của ai" (nên dùng ActivityLog hiện có, thêm dòng `setUserPerms`).
  - Nhóm quyền preset ("chỉ đọc", "thao tác kho") — mockup chưa vẽ.
  - Tách `editStatus` / `editPhotos` thành 2 RPC riêng (hiện gộp `adminEditItem`) — chỉ làm khi cần quyền độc lập thật.
