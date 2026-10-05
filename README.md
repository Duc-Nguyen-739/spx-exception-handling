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
- API (`google.script.run`): `listItems(limit — tối đa 100 dòng đầu, đơn mới insert ở dòng 2 nên luôn mới nhất)` · `getItem(code)` (kèm history Resolve/Thanh Lý riêng + `extras`/`slots` ảnh) · `previewCode(kind)` · `createBox(p)` · `createItem(p)` (`p={description, note, photos[1..3]}` — ô hiện dần, tối thiểu 1 ảnh mới Confirm được) · `resolveItem(code, bill)` · `liquidateBatch(codes[], liqCode)` · `me()` · `listUsers()` · `setUserRole(email, role)` · `adminReopen(code, note)` (ADMIN mở lại về Lưu kho) · `adminUpdateItem(code, p)` (ADMIN sửa mô tả/ghi chú/xóa/thêm ảnh (unlink giữ file gốc, tổng ≤3), log đầy đủ) · `fixPhotoSharing()` (ADMIN share lại toàn bộ ảnh cũ). Mọi response `{ok, data/error}`.
- Luồng: Chính (scan → click ảnh → chi tiết → ấn Resolve mới hiện ô bill + Confirm, ghi bill + time + email riêng) · Create 2 bước (Create New Task: Thanh Lý → sang trang Thanh Lý; Non-AWB Recovery → chọn BOX/ITEM → form mô tả + 1–3 ảnh hiện dần, tối thiểu 1 mới Confirm được, xong hiện QR trên mobile để in từ máy tính (khổ 4x6in, không tự bật hộp thoại in)) · Thanh Lý (scan lọc trùng/Đã Resolve/Đã Thanh Lý → Next → mã `SPXVN...` bắt buộc → Confirm).
- Quét: camera `html5-qrcode` (QR + Code128) + súng = Enter trên ô scan. In: `window.print()` khổ tem nhiệt 4x6in (`@page { size: 4in 6in }`, QR + tên mã; Box/Item đều có nút In Mã).

- Phân quyền: STAFF chỉ tạo/Resolve/Thanh Lý khi còn Lưu kho, không có UI sửa (đơn xong bị khóa) · ADMIN sửa mọi task (mô tả/ghi chú/xóa/thêm ảnh (unlink giữ file gốc, tổng ≤3)) + quản lý ở tab Role (chỉ ADMIN thấy) + Mở lại đơn về Lưu kho (log đầy đủ). Seed ADMIN từ Script Properties `ADMIN_EMAILS`. Ảnh upload tự share công khai, rớt về nội bộ domain khi bị chặn (xem bằng email công ty); share lỗi vẫn lưu đơn + báo rõ. Tài khoản deploy (`Session.getEffectiveUser`, xem ở tab Role) phải là email công ty thì share nội bộ mới được.
- UI: bố cục theo mẫu AppSheet gallery (app đang dùng nội bộ): **thẻ ảnh vuông chiếm toàn card + caption mã đơn dưới ảnh + chip trạng thái overlay góc ảnh** (mobile 2 cột, ảnh lỗi hiện `Không tải được ảnh`, trống hiện `Không có ảnh`), desktop có **sidebar trái** (Danh sách/Thanh lý/Role) + **panel chi tiết bên phải dạng drawer không modal** (không phủ mờ lưới — ảnh stack dọc full-width có fallback + nút `Thử lại`, ngày tách dòng; card lịch sử Resolve/Thanh Lý riêng có đếm); đang mở vẫn click ẢNH thẻ khác để đổi nội dung trực tiếp (bấm caption chỉ báo nhắc), nút ‹ › chuyển đơn trong bộ lọc, ⤢ nới rộng panel, đóng thì trượt ẩn sang phải và lưới tự nở lại), ô tìm kiếm đỉnh (icon kính lúp, gõ lọc trực tiếp, Enter/bắn súng mở đơn — bản mobile giữ thanh điều hướng đáy, chi tiết mở bottom sheet). Nút hành động ghi `Resolve`/`Confirm` (không dùng chữ Hoàn thành/VTCODE trên UI). Dữ liệu giả: DEMO chỉ hiện khi chạy `file://`; trên GAS, lỗi đọc Sheet hiển thị thông báo lỗi thật của server (VD chưa cấu hình `SPREADSHEET_ID`). Bảng màu: cam phẳng `#ee4d2d`, navy `#172b48`, thẻ trắng viền mảnh, Be Vietnam Pro. Nút **☾ Tối /  Sáng** góc phải header đổi theme Sáng/Tối (navy), lưu `localStorage`; nút **＋ Create** to bên phải dưới ô tìm kiếm (mobile, desktop giữ trên header). Brand: **SPX Exception Handling**.

## Verify

`npm test` · `npm run test:py` · `npm run build:local` · `npm run test:chrome`.
