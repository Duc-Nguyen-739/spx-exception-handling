# Plan: gộp `UsersHNSOC` + `Users` thành 1 sheet — trang Role quản lý tập trung

> Bối cảnh: hiện 2 kho HN2/HN mỗi kho giữ 1 sheet user riêng (`Users` cho HN2, `UsersHNSOC` cho HN)
> nên trang **Role** chỉ hiện 1 nửa danh sách và mỗi người có thể có 2 vai trò khác nhau.
> User muốn: **1 sheet user duy nhất**, trang Role đứng kho nào cũng hiện **đầy đủ** và **quản lý tập trung**.
> Ngày lập: 2026-10-16 · Trạng thái: **chờ user duyệt** (luật 13 — chưa code khi chưa duyệt).

---

## 0. Cần user chốt trước khi code (3 điểm — đang để mặc định khuyến nghị)

| # | Câu hỏi | Mặc định trong plan này | Nếu chọn khác thì sửa ở |
| :- | :-- | :-- | :-- |
| **Q1** | Email có mặt ở **cả 2** sheet thì lấy vai trò/quyền nào? | **Quyền cao nhất**: `ADMIN` thắng; key nào bật ở 1 trong 2 nơi thì giữ bật (không ai mất quyền đang có) | B3 (`mergeUsersRows_` — nhánh `else`) |
| **Q2** | Cách gộp dữ liệu? | **Hàm `mergeUsersHNSOCOnce()` chạy 1 lần trong Apps Script editor** sau khi deploy (có log + đổi tên sheet cũ thành backup) | B3 + B14 (đổi sang auto-merge ở `ensureUsersHeader_` hoặc bỏ code, hướng dẫn copy tay) |
| **Q3** | Quyền vào kho (cột `HN SOC`/`HN2 SOC`) sau khi gộp? | **Theo đúng list cũ**: chỉ ở `UsersHNSOC` → chỉ vào HN; chỉ ở `Users` → chỉ HN2; ở cả 2 → cả 2. Server chặn thật | B2 (gate) + B3 (gán cột kho theo membership) |

> Ảnh hưởng của Q1/Q3 tới người dùng: vai trò sau gộp là **toàn cục** (1 người 1 vai trò cho cả 2 kho);
> nếu chọn Q1 "quyền cao nhất" thì người trùng có thể rộng quyền hơn trước → kiểm bằng cột `Đã mở N/15` trong Role
> (log merge in ra đúng danh sách email trùng).

---

## 1. Hiện trạng (đọc kèm `file:line`)

| Nơi | Đang làm gì |
| :-- | :-- |
| `Code.gs:33-44` | `SITE_SUFFIX_ = { HN2:'', HN:'HNSOC' }` + `sheetName_(base, site)` áp đuôi cho **mọi** sheet, kể cả `Users` |
| `Code.gs:1417-1431` | `ensureUsersHeader_(site)` / `readUsers_(site)` đọc sheet user **của kho đang đứng** |
| `Code.gs:1433-1486` | `getRole_/permsOf_/isKnownUser_` tra bảng user theo `site` → vai trò & quyền **theo kho** |
| `Code.gs:1519-1623` | `listUsers/addAdmin/addUser/setUserPerms/deleteUser` ghi vào sheet user **của kho đang đứng** |
| `Code.gs:1497-1505` | `checkPerm_` chỉ kiểm key quyền; **không** kiểm quyền vào kho → việc "được vào kho nào" hiện do *có tên trong list kho đó* quyết định |
| `index.html:2133-2146` | `loadUsers()` gọi `listUsers(siteCur)` → Role hiện **1 nửa** |
| `index.html:935-939` | `siteCan_()` / `setSite_()` chặn chuyển kho theo `perms.siteHN/siteHN2` (client-side) |
| `docs/db-schema.md:34-41,78-84`, `README.md:43-44` | Tài liệu mô tả mô hình 2 sheet user |

**Hệ quả phụ đang là bug**: người **chỉ có trong `UsersHNSOC`** mở app (mặc định `siteCur='HN2'`, `index.html:932`) →
`me('HN2')` trả **0 quyền** → `siteCan_('HN')` = false → nút chuyển kho bị chặn → **kẹt ở HN2, không làm gì được**
(trừ khi là ADMIN seed trong `ADMIN_EMAILS`). B1/B4 dưới đây xử luôn.

---

## 2. Thiết kế chốt (trước → sau)

| Hành vi | Trước | Sau khi gộp |
| :-- | :-- | :-- |
| Sheet user | `Users` (HN2) + `UsersHNSOC` (HN) | **chỉ `Users`** (2 sheet khác — `Items`/`Photos`/`Backlog`… — vẫn tách `HNSOC` như cũ) |
| Vai trò | Theo từng kho (1 email có thể 2 vai trò) | **1 email = 1 vai trò** (ADMIN/STAFF) cho cả 2 kho |
| Bộ quyền | 2 bộ, theo kho | **1 bộ**/người; 2 cột `HN SOC`/`HN2 SOC` = được vào kho nào |
| Ai vào kho nào | Có tên trong list kho đó (ngầm) | Cột `siteHN`/`siteHN2` — **server chặn thật** trong `checkPerm_` |
| Trang Role | Chỉ thấy list của kho đang đứng | Đứng kho nào cũng thấy **cùng 1 danh sách đầy đủ**; thêm/xóa/đổi vai trò/quyền áp dụng **toàn cục** |
| `roleView` / `roleManage` | Gate theo kho | **Miễn chặn theo kho** (quản trị tập trung: có quyền là quản được ở cả 2 nơi) |
| ADMIN | ADMIN theo kho | ADMIN **mọi kho** (nhánh `getRole_()==='ADMIN'` giữ nguyên, đứng trước gate) |
| Đọc dữ liệu (`listItems`/`listFull`/`getItem`/`getThumb`/`getPhoto`) | Không gate theo kho | **Không đổi** (ngoài phạm vi; §6 non-goals) |
| Seed `ADMIN_EMAILS` | Seed sheet user khi trống | Không đổi (giờ seed vào `Users` chung) |

---

## 3. Các bước thực hiện (làm đúng thứ tự; mỗi bước có verify riêng)

Quy ước edit file có tiếng Việt theo `AGENTS.md §1.1`: đọc/ghi `utf-8` (`utf-8-sig` khi đọc để nuốt BOM cũ),
`newline=''`, **ghi bằng `utf-8` không BOM**, giữ **LF**. Sau mỗi lần sửa `index.html` phải chạy lại check LF/BOM ở B12.

> ℹ️ Thay đổi "bong bóng AI 🤖" ở `index.html` đã được commit (`dcb3673`) — cây làm việc sạch, anchor/line dưới đây
> tính theo `HEAD`. Vẫn nên mở file thật để dán anchor cho chắc (dùng `edit` với `oldString` chép nguyên văn).

---

### B1 — `Code.gs`: `Users` là sheet dùng chung 2 kho

**Mục đích**: `sheetName_('Users', site)` luôn trả `'Users'` → mọi hàm user tự dùng 1 sheet, không phải sửa call site nào.

**File**: `Code.gs:33-44`

Thay:
```js
var SITE_SUFFIX_ = { HN2: '', HN: 'HNSOC' };
var SITE_LABEL_ = { HN2: 'HN2 SOC', HN: 'HN SOC' };
var PROP_FOLDER_HN = 'FOLDER_ID_HN';
```
bằng:
```js
var SITE_SUFFIX_ = { HN2: '', HN: 'HNSOC' };
var SITE_LABEL_ = { HN2: 'HN2 SOC', HN: 'HN SOC' };
// Sheet dung chung 2 kho (khong gan hau to site) — hien tai chi Users (trang Role tap trung).
var GLOBAL_BASES_ = { Users: 1 };
var PROP_FOLDER_HN = 'FOLDER_ID_HN';
```
và thay:
```js
function sheetName_(base, site) { return String(base || '') + siteSuffix_(site); }
```
bằng:
```js
function sheetName_(base, site) {
  var b = String(base || '');
  if (GLOBAL_BASES_[b]) return b;
  return b + siteSuffix_(site);
}
```

**Ràng buộc**: `var GLOBAL_BASES_` **phải** nằm giữa `var SITE_SUFFIX_` và `function getSheetFor_(` —
`tests/station-site.test.js:22` cắt đúng khoảng này để dựng sandbox.

**Verify**: `node -e` chạy `npm test` ở B12 (test `station-site` + `perm-model` phải xanh).

---

### B2 — `Code.gs`: chặn theo kho ở server (`checkPerm_`)

**Mục đích**: giữ nguyên khả năng hiện tại — ai chỉ ở kho nào thì chỉ thao tác được ở kho đó.
Không có bước này, sau khi gộp người bên HN2 sẽ thao tác được cả bên HN (nới quyền ngoài ý muốn).
Mọi RPC ghi đều đã đi qua `checkPerm_` (21 call site, tất cả đều truyền `site`) nên chỉ cần sửa 1 chỗ.

**File**: `Code.gs:1497-1505`

Thay:
```js
function checkPerm_(key, site) {
  if (getRole_(site) === 'ADMIN') return;
  var p = currentPerms_(site);
  if (!p[key]) throw new Error('Bạn không có quyền: ' + (PERM_LABELS[key] || key) + '. Liên hệ ADMIN.');
}
```
bằng:
```js
// 2 key quan tri trang Role khong chan theo kho — Role la 1 danh sach dung chung 2 kho.
var ROLE_KEYS_ = { roleView: 1, roleManage: 1 };
function checkPerm_(key, site) {
  if (getRole_(site) === 'ADMIN') return;
  var p = currentPerms_(site);
  var sd = normSite_(site);
  if (!ROLE_KEYS_[key] && !p[sd === 'HN' ? 'siteHN' : 'siteHN2']) {
    throw new Error('Bạn không có quyền truy cập ' + SITE_LABEL_[sd] + '. Liên hệ ADMIN.');
  }
  if (!p[key]) throw new Error('Bạn không có quyền: ' + (PERM_LABELS[key] || key) + '. Liên hệ ADMIN.');
}
```

**Ghi chú thiết kế**:
- Gate **không** kèm điều kiện `site &&`: khi client không truyền `site` thì `normSite_(undefined) = 'HN2'` và
  đúng sheet HN2 được dùng → gate vẫn đúng, không có đường lách.
- Email lạ (0 quyền) giờ nhận thông báo "không có quyền truy cập kho" ở RPC ghi — chấp nhận (client đã ẩn hết nút).
- Test `tests/perm-rpc.test.js` phải bổ sung `normSite_`/`SITE_LABEL_` vào sandbox (xem B9) nếu không sẽ `ReferenceError`.

---

### B3 — `Code.gs`: hàm gộp (hàm thuần + hàm chạy 1 lần)

**Mục đích**: gộp dữ liệu 2 sheet đúng policy Q1/Q3, có backup, có log, không phải chạy tay từng dòng.

**File**: chèn ngay **sau** `deleteUser` (kết thúc `Code.gs:1623`), trước dòng `// ===== Feedback …`.

**(a) Hàm thuần `mergeUsersRows_`** (để unit test được, không đụng Sheets API):

```js
// Gop 2 danh sach user thanh 1 (email khong trung). Q1: ADMIN thang + quyen hop nhat.
// Q3: cot kho (siteHN/siteHN2) lay theo membership — co ten trong list kho nao thi vao kho do.
// Tra { rows, emails, log }: rows san sang setValues theo USERS_HEADER.
function mergeUsersRows_(baseRows, extraRows) {
  var order = [], map = {}, log = [];
  function add(row, inHN2, inHN) {
    var email = normEmail_(row[0]);
    if (!email) return;
    var role = String(cellText_(row[1])).trim().toUpperCase() === 'ADMIN' ? 'ADMIN' : 'STAFF';
    var perms = parsePerms_(cellText_(row[4]), role);
    var cur = map[email];
    if (!cur) {
      cur = map[email] = { email: email, role: role, addedAt: cellText_(row[2]),
        addedBy: cellText_(row[3]), perms: perms, hn2: false, hn: false };
      order.push(email);
    } else {
      if (role === 'ADMIN' && cur.role !== 'ADMIN') { cur.role = 'ADMIN'; log.push(email + ': ADMIN (HNSOC) thang'); }
      PERM_KEYS.forEach(function (k) { if (perms[k]) cur.perms[k] = 1; });
      if (!cur.addedAt) cur.addedAt = cellText_(row[2]);
      if (!cur.addedBy) cur.addedBy = cellText_(row[3]);
    }
    if (inHN2) cur.hn2 = true;
    if (inHN) cur.hn = true;
  }
  (baseRows || []).forEach(function (r) { add(r, true, false); });
  (extraRows || []).forEach(function (r) { add(r, false, true); });
  var rows = order.map(function (email) {
    var u = map[email];
    u.perms.siteHN2 = u.hn2 ? 1 : 0;
    u.perms.siteHN = u.hn ? 1 : 0;
    var clean = PERM_KEYS.filter(function (k) { return u.perms[k]; });
    var str = u.role === 'ADMIN' ? '' : (clean.length ? clean.join(',') : 'NONE');
    return [u.email, u.role, textDate_(u.addedAt), u.addedBy, str];
  });
  return { rows: rows, emails: order, log: log };
}
```
> `textDate_` (`Code.gs:324`) giữ ngày dạng text + dấu `'` (chống Sheets tự parse theo locale US).
> Mọi dòng gộp ra đều có ≥1 cột kho bật nên `str` không rỗng; nhánh `'NONE'` chỉ là chốt an toàn (giống `setUserPerms`).

**(b) Hàm chạy 1 lần `mergeUsersHNSOCOnce`** (Q2 mặc định) + helper đọc batch:

```js
// Doc toan bo data (bo header) cua 1 sheet thanh mang rows — 1 lan getValues.
function readRowsOf_(sh, nCols) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, nCols).getValues();
}

// Chay 1 lan trong Apps Script editor (KHONG phai RPC): gop UsersHNSOC -> Users,
// doi ten sheet cu thanh UsersHNSOC_backup_<dd-MM-yyyy>. Xem ket qua o Execution log.
function mergeUsersHNSOCOnce() {
  var ss = ss_();
  var legacy = ss.getSheetByName('UsersHNSOC');
  if (!legacy) { Logger.log('Khong co sheet UsersHNSOC — khong can gop.'); return 'skipped'; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('He thong dang ban — thu lai sau.');
  try {
    var sh = ensureUsersHeader_('HN2');
    if (legacy.getLastColumn() < USERS_HEADER.length) {
      legacy.getRange(1, 1, 1, USERS_HEADER.length).setValues([USERS_HEADER]);
    }
    var baseRows = readRowsOf_(sh, USERS_HEADER.length);
    var extraRows = readRowsOf_(legacy, USERS_HEADER.length);
    var m = mergeUsersRows_(baseRows, extraRows);
    var oldLast = sh.getLastRow();
    if (oldLast > 1) sh.getRange(2, 1, oldLast - 1, USERS_HEADER.length).clearContent();
    if (m.rows.length) sh.getRange(2, 1, m.rows.length, USERS_HEADER.length).setValues(m.rows);
    legacy.setName('UsersHNSOC_backup_' + todayPart_());
    Logger.log('Users gop: HN2 ' + baseRows.length + ' dong + HNSOC ' + extraRows.length
      + ' dong -> ' + m.rows.length + ' dong.');
    Logger.log('Trung email: ' + (m.log.length ? m.log.join(' | ') : 'khong co'));
    return 'merged';
  } finally { lock.releaseLock(); }
}
```

**(c) Refactor nhỏ cho SSOT (luật 10)**: `readUsers_` dùng chung helper đọc batch:

```js
function readUsers_(site) {
  var sh = ensureUsersHeader_(site);
  return { sh: sh, rows: readRowsOf_(sh, USERS_HEADER.length) };
}
```
> Giữ nguyên chữ ký `readUsers_(site)` và vẫn gọi `ensureUsersHeader_(` — guard `tests/perm-model.test.js:154-160` yêu cầu điều này.
> `ensureUsersHeader_` thêm 1 dòng comment: `// Users la sheet dung chung 2 kho (GLOBAL_BASES_) — site giu de dong bo chu ky RPC.`

**Rủi ro riêng của bước này**: đây là **chỗ duy nhất ghi lại toàn bộ sheet `Users`** (1 lần `clearContent` + 1 lần `setValues`).
Sheet user nhỏ (vài chục dòng) nên chấp nhận; guard `tests/perf-bounds.test.js:47` chỉ soi trong block `liquidateBatch`
nên không đụng tới code mới này.

---

### B4 — `index.html`: tự chuyển sang kho mình có quyền (fix kẹt site)

**Mục đích**: người chỉ được vào 1 kho vẫn dùng được app (bug ở §1) — mở app mặc định HN2 mà không có `siteHN2` thì tự nhảy sang HN.
Sau khi gộp, đây là đường đi **bắt buộc** cho người bên HN (Q3 mặc định).

**File**: `index.html:2068-2071` (`loadMe`)

Thay:
```js
async function loadMe(){
try{var r=await gs('me',[siteCur]);if(r.ok){state.me=r.data;renderWho();return;}}catch(e){}
state.me={email:'',role:'STAFF',perms:{}};renderWho();
}
```
bằng:
```js
async function loadMe(){
try{var r=await gs('me',[siteCur]);if(r.ok){state.me=r.data;renderWho();
var other=siteCur==='HN'?'HN2':'HN';
if(state.me.email&&!siteCan_(siteCur)&&siteCan_(other)){await setSite_(other);}
return;}}catch(e){}
state.me={email:'',role:'STAFF',perms:{}};renderWho();
}
```

**Vì sao an toàn (không lặp vô hạn)**:
- `renderWho()` gọi **trước** khi chuyển (để `state.me` đã set → `siteCan_` trong `setSite_` mới đúng, và nav/label được vẽ dù có return sớm).
- `setSite_` (`index.html:939`) **không** gọi `loadMe` → không đệ quy; nó chỉ `loadGrid` + (nếu đang ở Role) `loadUsers` — mà `listUsers` giờ đọc sheet chung nên kết quả y hệt.
- Chỉ chuyển khi kho còn lại **thật sự** có quyền (`siteCan_(other)`) → email lạ (0 quyền) giữ nguyên hành vi cũ.
- `setSite_` có ghi `localStorage.spx_site` + toast "Đã chuyển sang …" → lần sau vào thẳng đúng kho.

---

### B5 — `index.html`: Role hiện rõ "dùng chung 2 kho"

**Mục đích**: người dùng hiểu vì sao danh sách giống nhau ở cả 2 kho và cột kho làm gì.

**File 1**: `index.html:928` — sửa mô tả legend của 2 cột kho (giờ là gate thật, không còn là "phân station" mềm):

Đổi `siteHN:{off:'Phân Station'},siteHN2:{off:'Phân Station'},`
thành `siteHN:{off:'Chặn vào kho HN'},siteHN2:{off:'Chặn vào kho HN2'},`

**File 2**: `index.html:2113-2115` (`permTableHtml_`) — chèn dòng chú thích trên bảng:

```js
function permTableHtml_(mutable){
var me=(state.me&&state.me.email)||'';
var h='<div class="sub2" style="margin:0 0 6px">Danh sách dùng chung cho cả 2 kho — cột <b>HN SOC</b>/<b>HN2 SOC</b> quyết định kho mỗi người vào được.</div>';
h+='<div class="uptblWrap"><table class="uptbl"><thead><tr class="ugr">…
```
> `.sub2` đã có style trong `#usersTable` (`index.html:318`) — không cần CSS mới.
> Không đổi cấu trúc bảng/ID nào → `scripts/test-local-mock.js` (Role M6) vẫn chọn được `#usersTable table.uptbl tbody tr`.

---

### B6 — `api/logic.py`: mirror (giữ `check:drift` xanh)

**Mục đích**: `sheet_name` là 1 trong 10 cặp CORE của `scripts/check-drift.js:36`; logic quyền cũng nên mirror theo `AGENTS.md §13`.

**File**: `api/logic.py:417-430` (`sheet_name`) và `api/logic.py:272-276` (`check_perm`)

```python
# KHOP Code.gs normSite_/sheetName_: 2 kho HN2 (sheet goc) / HN (duoi HNSOC).
SITE_SUFFIX = {"HN2": "", "HN": "HNSOC"}
SITE_LABELS = {"HN2": "HN2 SOC", "HN": "HN SOC"}
# KHOP Code.gs GLOBAL_BASES_: sheet dung chung 2 kho (Users — trang Role tap trung).
GLOBAL_BASES = {"Users"}


def sheet_name(base, site=None):
    b = base or ""
    if b in GLOBAL_BASES:
        return b
    return f"{b}{SITE_SUFFIX.get(norm_site(site), '')}"
```

```python
# KHOP Code.gs checkPerm_: chan theo kho (tru 2 key quan tri trang Role).
ROLE_KEYS = {"roleView", "roleManage"}


def check_perm(perms, key, site=None):
    p = perms or {}
    sd = norm_site(site)
    if key not in ROLE_KEYS and not p.get("siteHN" if sd == "HN" else "siteHN2"):
        return (False, "Bạn không có quyền truy cập " + SITE_LABELS[sd] + ". Liên hệ ADMIN.")
    if not p.get(key):
        label = PERM_LABELS.get(key, key)
        return (False, "Bạn không có quyền: " + label + ". Liên hệ ADMIN.")
    return (True, "")
```
> `norm_site`/`SITE_LABELS` định nghĩa sau `check_perm` trong file — Python resolve lúc gọi nên vẫn đúng.

---

### B7 — `api/test_logic.py`: cập nhật test mirror

**File**: `api/test_logic.py:325-327` (`test_check_perm`) và `:342-351` (`test_sheet_name`)

1. `test_check_perm` — đổi/ thêm (giờ cần quyền kho):
```python
    def test_check_perm(self):
        self.assertEqual(check_perm({"create": 1, "siteHN2": 1}, "create", "HN2"), (True, ""))
        self.assertEqual(check_perm({"create": 0, "siteHN2": 1}, "create", "HN2")[0], False)
        # chan theo kho: co 'create' nhung khong co quyen vao kho HN
        self.assertIn("kho HN", check_perm({"create": 1, "siteHN2": 1}, "create", "HN")[1])
        # 2 key quan tri trang Role mien chan theo kho
        self.assertEqual(check_perm({"roleView": 1, "siteHN": 1}, "roleView", "HN"), (True, ""))
```
2. `test_sheet_name` — vòng lặp đang assert **mọi** base + `HNSOC`, phải tách `Users` ra:
```python
        for b in ["Logic", "Note", "Backlog", "Feedback", "FeedbackReplies",
                  "PrintQueue", "Thumbs", "PrintedCodes", "ActivityLog",
                  "Photos", "Items"]:
            self.assertEqual(sheet_name(b, "HN"), b + "HNSOC")
            self.assertEqual(sheet_name(b, "HN2"), b)
        # Users dung chung 2 kho (Code.gs GLOBAL_BASES_)
        self.assertEqual(sheet_name("Users", "HN"), "Users")
        self.assertEqual(sheet_name("Users", "HN2"), "Users")
```

---

### B8 — `tests/station-site.test.js`: chốt "Users không tách kho"

**File**: `tests/station-site.test.js:21-35` (test thứ 2) — thêm sau dòng `sheetName_('Items','HN2')`:

```js
  assert.strictEqual(vm.runInContext("sheetName_('Users','HN')", sb), 'Users');
  assert.strictEqual(vm.runInContext("sheetName_('Users','HN2')", sb), 'Users');
```
> Test này cắt source từ `var SITE_SUFFIX_` → `function getSheetFor_(`, nên B1 phải đặt `GLOBAL_BASES_` đúng chỗ.
> Test khác trong file (`:82-104`) đã assert RPC vẫn kèm `siteCur` — giữ nguyên chữ ký nên không phải sửa.

---

### B9 — `tests/perm-rpc.test.js`: test gate theo kho

**File**: `tests/perm-rpc.test.js:20-36` (sandbox) + thêm test mới sau `:51`

1. Trong `permSandbox`, bổ sung 2 biến mà `checkPerm_` mới dùng (nếu thiếu sẽ `ReferenceError`):
```js
    normSite_: null,
    SITE_LABEL_: null,
```
   và chạy thêm 2 khai báo tương ứng trong sandbox:
```js
  vm.runInContext("var normSite_=function(s){s=String(s||'').trim().toUpperCase();return(s==='HN'||s==='HN SOC'||s==='HNSOC')?'HN':'HN2';};" +
    "var SITE_LABEL_={HN2:'HN2 SOC',HN:'HN SOC'};", sb);
```
2. Test mới:
```js
test('perm-rpc: chan theo kho — STAFF khong co siteHN khong thao tac duoc o HN', () => {
  const sb = permSandbox('STAFF', { create: 1, siteHN2: 1, siteHN: 0 });
  vm.runInContext("checkPerm_('create','HN2')", sb);           // kho minh co quyen -> qua
  assert.throws(() => vm.runInContext("checkPerm_('create','HN')", sb), /kho HN/);
});

test('perm-rpc: checkPerm_ — roleView/roleManage mien chan theo kho', () => {
  const sb = permSandbox('STAFF', { roleView: 1, roleManage: 1, siteHN2: 1, siteHN: 0 });
  vm.runInContext("checkPerm_('roleView','HN')", sb);
  vm.runInContext("checkPerm_('roleManage','HN')", sb);
});
```

---

### B10 — `tests/users-merge.test.js` (file mới)

**Mục đích**: khoá policy gộp (Q1/Q3) bằng test thuần — không cần Sheets API.
**Cách làm**: copy pattern `tests/perm-model.test.js:108-152` (trích hàm từ `Code.gs` bằng `vm`).

Nội dung (khung):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function fnSrc(name) { /* cắt thân hàm như perm-model.test.js:110-119 */ }

function sb() {
  const b = { PERM_KEYS: null, PERM_DEFAULT: null, Logger: { log: () => {} } };
  vm.createContext(b);
  vm.runInContext(gs.match(/var PERM_KEYS\s*=\s*(\[[\s\S]*?\]);/)[0] + '\n' +
    gs.match(/var PERM_DEFAULT\s*=\s*(\{[\s\S]*?\});/)[0], b);
  b.normEmail_ = (s) => String(s || '').trim().toLowerCase();
  b.cellText_ = (v) => (v == null ? '' : String(v));
  b.textDate_ = (v) => { const s = b.cellText_(v); return /^\d{2}\/\d{2}\/\d{4}/.test(s) ? "'" + s : s; };
  vm.runInContext(fnSrc('parsePerms_') + '\n' + fnSrc('mergeUsersRows_') + '\nthis.__m = mergeUsersRows_;', b);
  return b;
}
```
Các case bắt buộc:
1. Chỉ ở HN2 → `hn2=1, hn=0`, vai trò giữ nguyên, `perms` viết đủ key (không để trống).
2. Chỉ ở HN → `hn=1, hn2=0`.
3. Cùng email ở cả 2 → **1 dòng**, `hn=hn2=1`, `ADMIN` thắng (Q1), key quyền là **hợp** 2 bên.
4. Dòng HN2 để trống cột `perms` (dùng default) → sau gộp vẫn **không** được cấp `siteHN` (Q3 thắng default).
5. Email viết hoa/khoảng trắng ở 2 sheet → gộp thành 1 dòng (`normEmail_`).
6. Guard: `gs.includes('function mergeUsersHNSOCOnce(')` và `gs.includes('function readRowsOf_(')`.
7. Ngày `addedAt` ra khỏi hàm phải có dấu `'` (text-date).

---

### B11 — Docs (cùng commit — luật 9)

**`README.md:43-44`**:
- Bỏ `UsersHNSOC` khỏi danh sách sheet có đuôi `HNSOC`.
- Thêm: `Users` là sheet **dùng chung 2 kho** (Role tập trung): 1 email = 1 vai trò + 1 bộ quyền; cột `HN SOC`/`HN2 SOC` quyết định kho được vào, **server chặn thật** trong `checkPerm_` (trừ `roleView`/`roleManage`).
- Ghi bước gộp 1 lần: `mergeUsersHNSOCOnce` → sheet cũ đổi tên `UsersHNSOC_backup_<ngày>`.
- Dòng API: ghi chú `listUsers()` / `addUser()` / `setUserPerms()` / `deleteUser()` giờ áp dụng cho **cả 2 kho**.
- Mục timestamps/thumbnail liên quan `Users.added_at` giữ nguyên.

**`docs/db-schema.md`**:
- `### Users` (`:34-41`): thêm ghi chú sheet dùng chung 2 kho, vai trò toàn cục, cột `perms` là quyền chung + 2 key kho.
- Mục "Hai kho HN2/HN" (`:78-84`): bỏ `UsersHNSOC` khỏi danh sách đuôi; thêm đoạn: `Users` không tách kho (`GLOBAL_BASES_`), RPC ghi bị `checkPerm_` chặn theo cột kho, migration 1 lần + backup.

---

### B12 — Verify (gate §7 — chạy đủ, dán output thật, không claim suông)

```bash
npm test                 # 59+ file: logic thuần + guard UI/server + gs-syntax + drift + merge mới
npm run test:py          # api/logic.py đổi -> BẮT BUỘC
npm run check:drift      # sheet_name ↔ sheet_name mirror (B6)
npm run build:local && npm run test:chrome   # UI đổi (B4/B5) -> BẮT BUỘC
```
Check LF/BOM sau khi sửa `index.html` (§1.1):
```bash
python3 -c "d=open('index.html','rb').read();print('CRLF',d.count(b'\r\n'),'LF',d.count(b'\n')-d.count(b'\r\n'),'BOM',d[:3]==b'\xef\xbb\xbf')"
# kỳ vọng: CRLF 0 · BOM False
```
Kiểm tay (tuỳ chọn, `npm run dev` + `node scripts/cdp-helper.js`): mở tab Role ở HN2 và HN → bảng giống nhau; đổi 1 ô quyền → `setUserPerms` gọi 1 lần; user chỉ có `siteHN` → tự nhảy sang HN khi mở app.

**Checkpoint B/C (luật 12)** trước/sau commit: soi từng dòng diff so với `§1` (không lộ ID/sheet, không comment rác, không hàm trùng, README/docs đã sync).

---

### B13 — Commit + push (luật 5)

1 commit duy nhất cho issue này, message tiếng Anh kèm verification:
```
feat(role): merge UsersHNSOC into shared Users sheet + per-kho server gate

- Code.gs: GLOBAL_BASES_ (Users dung chung 2 kho) + checkPerm_ chan theo siteHN/siteHN2 (mien roleView/roleManage)
- Code.gs: mergeUsersRows_ (pure) + mergeUsersHNSOCOnce (1 lan, backup UsersHNSOC_backup_<ngay>)
- index.html: loadMe tu chuyen kho khi kho hien tai khong co quyen; chu thich bang Role dung chung
- api/logic.py: mirror sheet_name/check_perm + tests
- tests: station-site, perm-rpc, users-merge (moi)
- docs: README + db-schema + plan nay
Verified: npm test / test:py / check:drift / build:local / test:chrome
```
Không tự `clasp push` (CI `deploy.yml` lo). File plan này vào **cùng commit** (§6.2).

---

### B14 — Runbook sau khi CI deploy xanh (user làm, ~2 phút)

1. Mở Apps Script editor của project → chọn hàm **`mergeUsersHNSOCOnce`** → **Run** → cấp quyền nếu được hỏi.
2. Đọc **Execution log**: dòng `Users gop: HN2 X dong + HNSOC Y dong -> Z dong` + `Trung email: …` (nếu có, soi lại quyền các email này trong Role).
3. Kiểm sheet: `Users` đủ người cả 2 kho; sheet cũ đã đổi tên `UsersHNSOC_backup_<dd-MM-yyyy>` (giữ làm backup, xoá tay khi đã yên tâm).
4. Mở webapp: vào **Role** ở HN2 và ở HN → 2 danh sách **giống hệt**; nhờ 1 email chỉ bên HN mở app xác nhận thấy dữ liệu kho HN.
5. ⚠️ Chưa chạy bước 1 thì người chỉ có trong `UsersHNSOC` **mất quyền tạm thời** (server đã đọc sheet `Users`) → chạy ngay sau deploy.

**Rollback** (nếu cần quay lại): `git revert <sha>` + push (CI deploy lại bản cũ) → **đổi tên sheet backup về `UsersHNSOC`**.
Vì code cũ đọc theo đuôi site nên phải có mặt `UsersHNSOC`; dữ liệu `Users` sau gộp vẫn dùng được ngay.

---

## 4. Test matrix (mỗi test chứng minh điều gì)

| Test | Chứng minh |
| :-- | :-- |
| `station-site.test.js` | `sheetName_('Users','HN') === 'Users'`; các base khác vẫn tách kho; SSOT `sheetName_` chỉ 1 định nghĩa |
| `perm-rpc.test.js` | gate theo kho: thiếu `siteHN` → chặn ở HN; `roleView`/`roleManage` miễn; ADMIN luôn qua |
| `users-merge.test.js` (mới) | Q1 (ADMIN thắng + hợp quyền) và Q3 (cột kho theo membership) đúng; không mất ngày/`added_by` |
| `perm-model.test.js` | 15 key giống nhau 4 nơi (Code.gs/logic.py/index.html/mock) — không đổi |
| `gs-syntax.test.js` | Code.gs mới parse sạch (GAS không reject `clasp push`) |
| `drift.test.js` | `sheet_name` mirror còn nguyên cặp CORE |
| `test:chrome` (mock) | Role M6 vẫn chạy: 5 dòng, khoá ô ADMIN, tự tắt `roleView` bị chặn |

---

## 5. Rủi ro & cách xử

| Rủi ro | Mức | Xử |
| :-- | :-- | :-- |
| Chưa chạy `mergeUsersHNSOCOnce` sau deploy → người bên HN mất quyền tạm thời | P1 | B14 bước 1 chạy ngay; thông báo rõ; rollback đổi tên sheet backup |
| Q1 "quyền cao nhất" làm rộng quyền người trùng | P1 | Log email trùng khi merge; soi cột `Đã mở N/15` trong Role; tắt tay nếu thừa |
| Người chỉ 1 kho bị kẹt ở kho còn lại | P1 | B4 tự chuyển kho (cũng fix bug sẵn có) |
| Ghi lại toàn sheet `Users` khi merge | P2 | Sheet nhỏ, chạy 1 lần, có lock + backup |
| `checkPerm_` chặn nhầm người đang làm việc (site perm bị tắt giữa lúc dùng) | P2 | Client tự chuyển kho; RPC trả lỗi rõ "không có quyền truy cập <kho>" |
| Sửa `index.html` đè lên thay đổi chưa commit (bong bóng AI 🤖) | P2 | Edit trên file hiện tại, anchor theo nội dung; verify `npm test` + `test:chrome` |

---

## 6. Ngoài phạm vi (không làm trong đợt này)

- Không gate theo kho cho các RPC **đọc** (`listItems`, `listFull`, `getItem`, `getThumb`, `getPhoto`) — giữ nguyên như hiện tại.
- Không đổi cấu trúc bảng Role, không thêm/bớt key quyền, không đổi `PERM_KEYS`/`PERM_DEFAULT`.
- Không gộp các sheet khác (`Items`/`Photos`/`ActivityLog`/`Backlog`…) — vẫn tách `HNSOC`.
- Không thêm UI "merge" vào webapp (chạy 1 lần trong editor).
- Không đổi `ADMIN_EMAILS` / cơ chế seed.
