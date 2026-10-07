# Database — Sheets + Drive (spx-exception-handling)

> Quyết định: dùng Google Sheets làm DB + Google Drive chứa ảnh (giống `spx-diem-danh`: `Config.gs:9`, `Database.gs`).
> Lý do: 0 hạ tầng mới, reuse pattern batch + `LockService` sẵn có, AppSheet đọc trực tiếp,
> import CSV 1 dòng lệnh. Ảnh giữ trong Drive (free tier Supabase 1GB / Firestore 1GiB không đủ cho ảnh kho).

## 1. Quy mô (từ CSV thật `[HN2] Mất bill`)

- ~1.500 dòng (02/03/2026 → 05/10/2026), ~30–50 dòng/ngày → ~15k dòng/năm.
- 11 cột × 15k dòng ≈ 165k cells/năm — xa dưới hạn Sheets (10M cells/sheet).
- Mỗi dòng < 2KB → DB text ~30MB/năm. Ảnh là phần nặng → để Drive, DB chỉ giữ file ID.

## 2. Spreadsheet layout — 3 sheets

Spreadsheet ID để ở Script Properties `SPREADSHEET_ID` (không hardcode — luật 1).

### `Items` (1 dòng = 1 mã sản phẩm, khóa = cột A)

| Cột | Tên (tiếng Anh) | Nguồn CSV | Ghi chú |
| :-- | :-- | :-- | :-- |
| A | `code` | Mã sản phẩm | UNIQUE, vd `BOX.02032026.01`. Mã `LT…`/`SPXVN…` lẫn trong CSV → cho vào `note`, không làm `code` |
| B | `created_at` | Thời gian | Text gốc `dd/mm/yyyy hh:mm:ss` (ghi kèm dấu `'` để Sheets không tự đổi sang Date theo locale US rồi tính ngày lưu kho sai), timezone `Asia/Ho_Chi_Minh`. Đọc tự đối chiếu ngày trong mã (`parseCreatedSmart_`: chuỗi đảo ngày/tháng mà khớp ngày trong mã thì lấy theo mã) |
| C | `description` | Mô tả | Text tự do |
| D | `kind` | Loại hàng | Chuẩn hóa `Box`/`Item` theo **prefix mã** (CSV gốc lệch nhiều: `ITEM…` ghi `Box`…) |
| E | `photo_outer` | Ảnh ngoại quan | Drive file ID (import xong điền) |
| F | `photo_product` | Ảnh sản phẩm | Drive file ID; `Item` thường trống |
| G | `status` | Hướng xử lý + update | Chuẩn hóa 5 giá trị (dưới) |
| H | `status_note` | Hướng xử lý (raw) | Giữ nguyên text gốc để đối chiếu |
| I | `mvdn` | Mã SPXVN tách ra | Regex `SPXVN[0-9A-Z]+`, 1 mã/dòng; nhiều mã → dòng đầu + `note` |
| J | `trip` | Mã trip tách ra | Regex `LT0Q[0-9A-Z]+` |
| K | `reporter` | Người nhập | Email; trống ở dữ liệu cũ |
| L | `note` | — | Ghi chú vận hành (mã lạ, nhiều MVDN…) |

### `Users` (phân quyền ADMIN/STAFF)

| `email` | `role` (`ADMIN`/`STAFF`) | `added_at` | `added_by` |

- Seed ADMIN từ Script Properties `ADMIN_EMAILS` (csv email) khi sheet còn trống;
  `listUsers` tự chèn seed ở lần gọi đầu. STAFF là mặc định.
- Chặn hạ ADMIN cuối cùng + chặn tự hạ quyền chính mình (server-side).
- Mọi check role bằng `Session.getActiveUser().getEmail()`, không tin client.

### `Photos`

| `code` | `slot` (`ngoai_quan`/`san_pham`/`bo_sung`/`bo_sung_1`/`bo_sung_2`) | `drive_file_id` | `uploaded_at` |

- Mọi cột ngày (`Photos.uploaded_at`, `ActivityLog.at`, `PrintedCodes.printed_at`, `Users.added_at`) cũng ghi text kèm dấu `'` như `Items.created_at` (chống locale US tự parse).

### `ActivityLog` (append-only, ai đổi trạng thái)

| `at` | `code` | `from` | `to` | `by` | `note` |

- `note`: mã bill khi chuyển sang Resolve/Thanh Lý (hiện dòng riêng trong Chi tiết trạng thái) · `ADMIN chỉnh sửa <Ảnh, Mô tả sản phẩm, Ghi chú>` khi ADMIN sửa trường (from = to) · mốc đổi trạng thái trong Edit ghi `by` = `ADMIN đổi trạng thái` (không ghi email ADMIN) · `Tạo mới…` khi tạo đơn. Ghi đè tay bị cấm — mọi đổi `status` qua WebApp để có log.

## 3. `status` chuẩn hóa (5 giá trị, tiếng Việt hiển thị)

`chua_xu_ly` · `da_tim_bill` · `da_cho_di` · `thanh_ly` · `tieu_huy`

Map từ text tự do (xem `scripts/import-csv.js:STATUS_RULES` — SSOT, WebApp reuse):
`thanh li/THANH LI/Thanhblys…` → `thanh_ly` · `tìm thấy bill` → `da_tim_bill` ·
`cho đi/giao/SPXVN…/done` → `da_cho_di` · `tiêu hủy/vứt/hỏng đã…` → `tieu_huy` · còn lại → `chua_xu_ly`.

## 4. Drive layout

```text
Matbill/
  2026-03/
    BOX.02032026.01.ngoai_quan.jpg
    BOX.02032026.01.san_pham.jpg
    ITEM.02032026.01.ngoai_quan.jpg
  2026-04/
    …
```

- Import ảnh: upload theo thư mục tháng của `created_at`, đặt tên `<CODE>.<slot>.jpg`.
- WebApp đọc ảnh qua thumbnail `sz=w400` cho gallery + detail (file share công khai `ANYONE_WITH_LINK` khi upload nên mở được không cần đăng nhập).
- Scriplet ảnh cũ `Data_Images_Matbill/…` chỉ là tên file nội bộ — import xong bỏ, dùng file ID.

## 5. Quy ước GAS (kế thừa spx-diem-danh)

- Batch `getValues()`/`setValues()`, không loop cell lẻ (luật 2).
- Ghi `status` qua `LockService` + append `ActivityLog` cùng execution.
- Đơn mới insert ở dòng 2 (mới nhất lên đầu); `listItems` chỉ đọc ≤100 dòng đầu + sắp xếp mới → cũ. `getItem`/ghi theo mã (Resolve/Thanh Lý/Edit đổi trạng thái) vẫn quét toàn sheet để không sót đơn cũ.
- `CacheService` có fallback — không xem là source of truth.

## 6. Lộ trình nâng cấp

- Vượt ~50k dòng hoặc cần realtime/offline mobile → migrate sang Supabase Postgres
  (schema này map 1-1 sang bảng SQL; ảnh vẫn ở Drive). Không làm trước khi cần.
