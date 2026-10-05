# spx-exception-handling

GAS WebApp xử lý ngoại lệ (khung ban đầu).

Workflows giống repo `spx-diem-danh`:
- `.github/workflows/deploy.yml` — push `main` → `clasp push` + tạo version + redeploy production `/exec` (cần secrets `GAS_SCRIPT_ID`, `CLASPRC_JSON`).
- `.github/workflows/test.yml` — CI gate: `npm test` + Python `unittest` + `build:local` + `test:chrome`.

## Setup sau khi tạo repo

1. Vào repo Settings → Secrets and variables → Actions → New repository secret:
   - `GAS_SCRIPT_ID` = ID Apps Script project (đã set sẵn khi tạo repo).
   - `CLASPRC_JSON` = nội dung `~/.clasprc.json` (copy từ máy đã `clasp login`, hoặc từ repo cũ).
2. Push lên `main` → kiểm tra tab Actions (Deploy + Test chạy).
3. Mở Apps Script project → Deploy → kiểm tra `/exec` đã lên version mới.
