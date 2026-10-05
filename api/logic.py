"""Pure logic mirror cho WebApp (.gs) — test offline, không gọi Sheet/Drive.

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


def valid_liq_code(s):
    return bool(re.search(r"SPXVN[0-9A-Z]+", (s or "").upper()))
