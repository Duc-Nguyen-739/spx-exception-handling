"""Pure logic mirror cho WebApp (.gs) — test offline, không gọi Sheet/Drive.

KHỚP create: Code.gs CREATE_SLOTS + check tối thiểu 1 / tối đa 3 ảnh.

KHỚP server: Code.gs (GEN_CODE_FMT, STATUS_LABEL, canResolve/canLiquidate)
KHỚP import: scripts/import-csv.js (STATUS_RULES, canonicalKind).
"""
import re
from datetime import datetime, timezone, timedelta

TZ = timezone(timedelta(hours=7))  # Asia/Ho_Chi_Minh, không dùng GMT+7 lẻ (luật 11)

STATUS_RULES = [
    (re.compile(r"tieu huy|da vut|hu hong.*(vut|huy)|chay nuoc.*tieu"), "tieu_huy"),
    (re.compile(r"tim thay bill|tim duoc.*bill|da tim.*bill"), "da_tim_bill"),
    (re.compile(r"thanh l|thanhblys|thanhys"), "thanh_ly"),
    (re.compile(r"cho di|giao.*theo|da cho di|di theo|spxvn[0-9a-z]+|luan chuyen|done|bu hang|hold tai"), "da_cho_di"),
]

STATUS_LABEL = {
    "chua_xu_ly": "Lưu kho",
    "da_tim_bill": "Resolve",
    "da_cho_di": "Đã cho đi",
    "thanh_ly": "Thanh Lý",
    "tieu_huy": "Tiêu hủy",
}

CODE_RE = re.compile(r"^(Box|Item)\.(\d{2})-(\d{2})-(\d{4})\.(\d+)$")
CODE_RE_ANY = re.compile(r"^(BOX|ITEM|TTC|Box|Item)\.", re.IGNORECASE)


def _strip(s):
    import unicodedata
    s = (s or "").replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


def canonical_status(raw):
    t = _strip(raw).strip()
    if not t:
        return "chua_xu_ly"
    for rx, st in STATUS_RULES:
        if rx.search(t):
            return st
    return "chua_xu_ly"


def canonical_kind(code, raw_kind=""):
    c = (code or "").strip().upper()
    if c.startswith("BOX") or c.startswith("TTC"):
        return "Box"
    if c.startswith("ITEM"):
        return "Item"
    return "Box" if (raw_kind or "").strip().lower() == "box" else "Item"


def date_part(dt=None):
    dt = dt or datetime.now(TZ)
    return dt.strftime("%d-%m-%Y")


def gen_code(kind, dt=None, seq=1):
    prefix = "Box" if kind == "Box" else "Item"
    return f"{prefix}.{date_part(dt)}.{seq}"


def next_seq(existing_codes, kind, dt=None):
    prefix = f"{'Box' if kind == 'Box' else 'Item'}.{date_part(dt)}."
    best = 0
    for c in existing_codes or []:
        if c.startswith(prefix):
            try:
                n = int(c.rsplit(".", 1)[1])
                best = max(best, n)
            except ValueError:
                pass
    return best + 1


def parse_created_at(s):
    # Giữ text gốc dd/mm/yyyy hh:mm:ss (docs/db-schema.md).
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=TZ)
        except (ValueError, TypeError):
            pass
    return None


def storage_days(created_at_str, now=None):
    created = parse_created_at(created_at_str)
    if not created:
        return 0
    now = now or datetime.now(TZ)
    delta = now - created
    return max(0, int(delta.total_seconds() // 86400))


def can_resolve(status):
    # Chỉ hàng lưu kho được Resolve; còn lại báo đúng trạng thái.
    if status == "chua_xu_ly":
        return (True, "")
    if status == "da_tim_bill":
        return (False, "Đã Resolve")
    if status == "thanh_ly":
        return (False, "Đã Thanh Lý")
    return (False, STATUS_LABEL.get(status, "Không cho phép"))


def can_liquidate(status):
    if status == "chua_xu_ly":
        return (True, "")
    if status == "thanh_ly":
        return (False, "Đã Thanh Lý")
    if status == "da_tim_bill":
        return (False, 'Đã Resolve')
    return (False, STATUS_LABEL.get(status, "Không cho phép"))


def extract_drive_id(s):
    # KHỚP Code.gs driveIdFromUrl_: nhận file ID trần hoặc link Drive (?id= / /d/).
    import re as _re
    s = (s or "").strip()
    if _re.match(r"^[A-Za-z0-9_-]{10,}$", s):
        return s
    m = _re.search(r"[?&]id=([A-Za-z0-9_-]{10,})", s)
    if m:
        return m.group(1)
    m = _re.search(r"/d/([A-Za-z0-9_-]{10,})", s)
    return m.group(1) if m else ""


def valid_liq_code(s):
    return bool(re.search(r"SPXVN[0-9A-Z]+", (s or "").upper()))


def check_create_photos(kind, outer, product, n_extras=0):
    # KHỚP Code.gs create_: Box cần đủ 2 ảnh, Item cần 1 ảnh sản phẩm, tổng <= 3.
    if kind == "Box":
        if not (outer and product):
            return (False, "Box cần đủ Ảnh ngoại quan + Ảnh sản phẩm.")
    elif not product:
        return (False, "Item cần Ảnh sản phẩm.")
    total = (1 if outer else 0) + (1 if product else 0) + (n_extras or 0)
    if total > 3:
        return (False, "Tối đa 3 ảnh.")
    return (True, "")


def can_delete_user(user_rows, target_email, me_email):
    # KHỚP Code.gs deleteUser: không tự xóa, không xóa ADMIN cuối.
    target = (target_email or "").strip().lower()
    me = (me_email or "").strip().lower()
    if target == me:
        return (False, "Không tự xóa chính mình.")
    admins = sum(1 for _, r in (user_rows or []) if r == "ADMIN")
    found = next(((e, r) for e, r in (user_rows or []) if e.strip().lower() == target), None)
    if not found:
        return (False, "Email không có trong danh sách.")
    if found[1] == "ADMIN" and admins <= 1:
        return (False, "Không thể xóa ADMIN cuối cùng.")
    return (True, "")


def can_edit(role):
    # Sua task (mo ta/anh): chi ADMIN, ke ca don da xong. STAFF khong co UI sua.
    if role == "ADMIN":
        return (True, "")
    return (False, "Chỉ ADMIN được sửa.")


EDIT_STATUS_OK = ("chua_xu_ly", "da_tim_bill", "thanh_ly")


def can_edit_status(role, to_status, bill=""):
    # KHỚP Code.gs adminEditItem: chỉ ADMIN đổi trạng thái trong Edit;
    # sang Resolve/Thanh Lý bắt buộc có mã bill.
    if role != "ADMIN":
        return (False, "Cần quyền ADMIN.")
    if to_status not in EDIT_STATUS_OK:
        return (False, "Trạng thái không hợp lệ.")
    if to_status in ("da_tim_bill", "thanh_ly") and not (bill or "").strip():
        return (False, "Thiếu mã bill.")
    return (True, "")


def history_bill(from_st, to_st, note):
    # KHỚP Code.gs billOf_: chỉ mốc chuyển sang Resolve/Thanh Lý mới có dòng bill.
    if from_st != to_st and to_st in ("da_tim_bill", "thanh_ly"):
        return note or ""
    return ""
