# spx-exception-handling

GAS WebApp xử lý ngoại lệ (mất bill SPX): tạo mã Box/Item nội bộ, lưu ảnh Drive, Resolve bill, Thanh Lý theo lô, in QR, quét camera + súng.

Workflows giống repo `spx-diem-danh`:
- `.github/workflows/deploy.yml` — push `main` → `clasp push` + tạo version + redeploy production `/exec` (cần secrets `GAS_SCRIPT_ID`, `CLASPRC_JSON`).
- `.github/workflows/test.yml` — CI gate: `npm test` + Python `unittest` + `build:local` + `test:chrome`.

## Setup sau khi tạo repo

1. Vào repo Settings → Secrets and variables → Actions → New repository secret:
   - `GAS_SCRIPT_ID` = ID Apps Script project (đã set sẵn khi tạo repo).
   - `CLASPRC_JSON` = nội dung `~/.clasprc.json` (copy từ máy đã `clasp login`, hoặc từ repo cũ).
2. Push lên `main` → kiểm tra tab Actions (Deploy + Test chạy).
3. Mở Apps Script project → Deploy → kiểm tra `/exec` đã lên version mới.

## Setup GAS (Script Properties)

- `SPREADSHEET_ID` = ID Spreadsheet DB (không hardcode — luật 1). Sheet tự tạo: `Items` (12 cột theo `docs/db-schema.md`), `Photos`, `ActivityLog`.
- `FOLDER_ID` = ID thư mục Drive chứa ảnh (server tạo subfolder `YYYY-MM`). Lấy từ URL folder `drive.google.com/drive/folders/<ID>`, điền vào Script Properties, không hardcode/không gửi qua chat.
- `ADMIN_EMAILS` = email ADMIN seed, cách nhau dấu phẩy (khi sheet `Users` còn trống thì các email này là ADMIN, còn lại STAFF; có ADMIN rồi thì phân quyền tiếp ở trang Quyền Truy Cập).

## Contract

- Mã mới: `Box.DD-MM-YYYY.seq` / `Item.DD-MM-YYYY.seq` (seq/ngày từ 1, server cấp trong lock). Mã cũ `BOX.DDMMYYYY.NN` vẫn đọc được.
- Trạng thái canonical: `chua_xu_ly` (hiển thị Lưu kho) · `da_tim_bill` (hiển thị Resolve) · `thanh_ly` (hiển thị Thanh Lý) + `da_cho_di`/`tieu_huy` (import cũ). Map SSOT tại `scripts/import-csv.js:STATUS_RULES`, mirror `api/logic.py` + `Code.gs`.
- API (`google.script.run`): `listItems(limit)` · `getItem(code)` (kèm history Resolve/Thanh Lý riêng) · `previewCode(kind)` · `createBox(p)` · `createItem(p)` · `resolveItem(code, bill)` · `liquidateBatch(codes[], liqCode)` · `me()` · `listUsers()` · `setUserRole(email, role)` · `adminReopen(code, note)` (ADMIN mở lại về Lưu kho). Mọi response `{ok, data/error}`.
- Luồng: Chính (scan → click ảnh → chi tiết → Resolve ghi bill + time + email riêng) · Create cam (Non-AWB Box/Item đủ ảnh + mô tả mới Hoàn Thành, xong In Mã QR + tên khổ 4x6in) · Thanh Lý (scan lọc trùng/Đã Resolve/Đã Thanh Lý → Next → mã `SPXVN...` bắt buộc → Hoàn Thành).
- Quét: camera `html5-qrcode` (QR + Code128) + súng = Enter trên ô scan. In: `window.print()` khổ tem nhiệt 4x6in (`@page { size: 4in 6in }`, QR + tên mã; Box/Item đều có nút In Mã).

- Phân quyền: STAFF tạo/Resolve/Thanh Lý khi còn Lưu kho (đơn xong bị khóa) · ADMIN quản lý ở trang Quyền Truy Cập + Mở lại đơn về Lưu kho (log đầy đủ). Seed ADMIN từ Script Properties `ADMIN_EMAILS`.

## Verify

`npm test` · `npm run test:py` · `npm run build:local` · `npm run test:chrome`.
