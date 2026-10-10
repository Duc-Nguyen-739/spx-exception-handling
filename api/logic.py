"""Pure logic mirror cho WebApp (.gs) — test offline, không gọi Sheet/Drive.

KHỚP create: Code.gs CREATE_SLOTS + check tối thiểu 1 / tối đa 3 ảnh.

KHỚP server: Code.gs (GEN_CODE_FMT, STATUS_LABEL, canResolve/canLiquidate)
KHỚP import: scripts/import-csv.js (STATUS_RULES, canonicalKind).
"""
import re
import unicodedata
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

def valid_custom_code(code, kind):
    # KHỚP Code.gs create_: mã Sửa/Ok trong Create phải đúng định dạng đầy đủ
    # và prefix khớp loại form (Box form chỉ Box.).
    c = (code or "").strip()
    if not CODE_RE.match(c):
        return (False, "Mã sửa chưa đúng định dạng Box./Item. (ngày-tháng-năm.số).")
    want = "Box" if kind == "Box" else "Item"
    if not c.startswith(want + "."):
        return (False, "Mã sửa phải bắt đầu bằng " + want + ".")
    return (True, "")


def custom_code_exists(code, existing_codes, printed_codes):
    # KHỚP Code.gs create_: mã custom không được trùng Items hay PrintedCodes.
    c = (code or "").strip()
    return c in (existing_codes or []) or c in (printed_codes or [])


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


def _max_seq(codes, prefix):
    best = 0
    for c in codes or []:
        if c.startswith(prefix):
            try:
                best = max(best, int(c.rsplit(".", 1)[1]))
            except ValueError:
                pass
    return best


def next_seq(existing_codes, kind, dt=None):
    prefix = f"{'Box' if kind == 'Box' else 'Item'}.{date_part(dt)}."
    return _max_seq(existing_codes, prefix) + 1


BULK_MAX = 10


def next_seq_reserved(existing_codes, printed_codes, kind, dt=None):
    # KHỚP Code.gs nextSeqBothCodes_: seq tính trên cả Items + tab PrintedCodes
    # (mã bulk đã giữ chỗ thì Create sau nhảy qua, không cấp lại).
    prefix = f"{'Box' if kind == 'Box' else 'Item'}.{date_part(dt)}."
    return max(_max_seq(existing_codes, prefix), _max_seq(printed_codes, prefix)) + 1


def bulk_codes(existing_codes, printed_codes, kind, dt=None, count=10):
    # KHỚP Code.gs previewBulkCodes: sinh dãy liên tục, count chặn 1..BULK_MAX.
    try:
        n = int(count or 10)
    except (ValueError, TypeError):
        n = 10
    n = max(1, min(n, BULK_MAX))
    start = next_seq_reserved(existing_codes, printed_codes, kind, dt)
    return [gen_code("Box" if kind == "Box" else "Item", dt, start + i) for i in range(n)]


def parse_created_at(s):
    # Giữ text gốc dd/mm/yyyy hh:mm:ss (docs/db-schema.md).
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=TZ)
        except (ValueError, TypeError):
            pass
    return None


def code_date(code):
    # KHỚP Code.gs codeDate_: ngày tạo nằm trong mã Box./Item. (sheet locale US
    # đảo ngày/tháng khi parse lại — dùng mã để chọn cách đọc đúng).
    m = re.match(r"^(?:Box|Item)\.(\d{2})-(\d{2})-(\d{4})\.", str(code or ""))
    if m:
        return (int(m.group(3)), int(m.group(2)), int(m.group(1)))
    o = re.match(r"^(?:BOX|ITEM|TTC)\.(\d{2})(\d{2})(\d{4})\.", str(code or ""), re.IGNORECASE)
    if o:
        return (int(o.group(3)), int(o.group(2)), int(o.group(1)))
    return None


def _valid_ymd(y, m, d):
    try:
        datetime(y, m, d)
        return 1 <= m <= 12 and 1 <= d <= 31
    except ValueError:
        return False


def parse_created_smart(s, code=None):
    # KHỚP Code.gs parseCreatedSmart_: đọc VN dd/mm, thử đảo US mm/dd khi
    # ngày/tháng đều <= 12; đối chiếu ngày trong mã, fallback VN như cũ.
    m = re.match(
        r"(\d{2})/(\d{2})/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?",
        str(s or ""),
    )
    if not m:
        return None
    y, a, b = int(m.group(3)), int(m.group(1)), int(m.group(2))
    hh, mi, ss = int(m.group(4) or 0), int(m.group(5) or 0), int(m.group(6) or 0)
    vn = datetime(y, b, a, hh, mi, ss, tzinfo=TZ) if _valid_ymd(y, b, a) else None
    us = datetime(y, a, b, hh, mi, ss, tzinfo=TZ) if _valid_ymd(y, a, b) else None
    cd = code_date(code)
    if cd:
        if vn and (vn.year, vn.month, vn.day) == cd:
            return vn
        if us and (us.year, us.month, us.day) == cd:
            return us
    return vn or us


def storage_days(created_at_str, now=None, code=None):
    created = parse_created_smart(created_at_str, code)
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
    # Sua full task (anh/trang thai): chi ADMIN, ke ca don da xong.
    if role == "ADMIN":
        return (True, "")
    return (False, "Chỉ ADMIN được sửa.")


def can_edit_basic(role):
    # Sua co ban (mo ta/ghi chu): moi email deu duoc nut Edit.
    return (True, "")


def staff_edit_notes(old_desc, old_note, new_desc, new_note, admin=False):
    # KHỚP Code.gs editItem/adminEditItem: moi truong doi sinh 1 moc
    # "Edit Mô tả: cu => moi" (STAFF) / "ADMIN Edit ..." (ADMIN thay email).
    prefix = "ADMIN Edit" if admin else "Edit"
    notes = []
    if new_desc is not None and (new_desc or "").strip() != (old_desc or ""):
        notes.append(f"{prefix} Mô tả: {old_desc or ''} => {(new_desc or '').strip()}")
    if new_note is not None and (new_note or "").strip() != (old_note or ""):
        notes.append(f"{prefix} Ghi chú: {old_note or ''} => {(new_note or '').strip()}")
    return notes


EDIT_STATUS_OK = ("chua_xu_ly", "da_tim_bill", "thanh_ly")


def can_edit_status(role, to_status, bill="", reason=""):
    # KHỚP Code.gs adminEditItem: chỉ ADMIN đổi trạng thái trong Edit;
    # mã bill KHÔNG bắt buộc (để trống thì ẩn dòng bill), lý do BẮT BUỘC.
    if role != "ADMIN":
        return (False, "Cần quyền ADMIN.")
    if to_status not in EDIT_STATUS_OK:
        return (False, "Trạng thái không hợp lệ.")
    if to_status and not (reason or "").strip():
        return (False, "Thiếu lý do.")
    return (True, "")


def _norm_head(h):
    # KHỚP Code.gs normHead_: bỏ dấu/cách/gạch trước khi so khớp header.
    s = str(h or "").replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def map_history_row(header, row, want_code):
    # KHỚP Code.gs historyFor_: map cột theo tên header (chống lệch thứ tự
    # cột ở sheet có sẵn), so khớp code sau trim.
    names = [_norm_head(h) for h in (header or [])]

    def col(*cands):
        for n in cands:
            if n in names:
                return names.index(n)
        return -1

    i_code = col("code")
    if i_code < 0 or i_code >= len(row or []):
        return None
    if str(row[i_code] or "").strip() != str(want_code or "").strip():
        return None

    def cell(*cands):
        i = col(*cands)
        if 0 <= i < len(row):
            return "" if row[i] is None else str(row[i])
        return ""

    i_at = col("at")
    return {
        "at": row[i_at] if 0 <= i_at < len(row) else "",
        "code": str(want_code or "").strip(),
        "from": cell("fromstatus", "from"),
        "to": cell("tostatus", "to"),
        "by": cell("by"),
        "note": cell("note"),
        "reason": cell("reason", "lydo"),
    }


def history_bill(from_st, to_st, note):
    # KHỚP Code.gs billOf_: chỉ mốc chuyển sang Resolve/Thanh Lý mới có dòng bill.
    if from_st != to_st and to_st in ("da_tim_bill", "thanh_ly"):
        return note or ""
    return ""


BACKLOG_KEYS = ["shipment_id", "status_desc", "station_name", "next_station_name",
    "pickup_station_name", "created_time", "lh_trip_number", "trip_number_arrived",
    "inbound_time", "last_touch_at", "last_touch_by", "product_name", "seller_sort_code",
    "return_sort_code", "buyer_sort_code", "aging_leadtime", "cogs"]
BACKLOG_DEFAULT = ["shipment_id", "status_desc", "pickup_station_name", "created_time",
    "last_touch_at", "product_name", "return_sort_code", "buyer_sort_code",
    "aging_leadtime", "cogs"]


def map_backlog_row(keys, values):
    # KHỚP Code.gs listBacklog: map vị trí theo key chuẩn, bỏ dòng trống.
    if not keys or not values:
        return None
    o = {}
    has = False
    for i, k in enumerate(BACKLOG_KEYS):
        v = "" if i >= len(values) or values[i] is None else str(values[i])
        o[k] = v
        if v:
            has = True
    return o if has else None


def fmt_cogs(v):
    # KHỚP client blFmtCogs: nhóm nghìn để dễ đọc.
    d = re.sub(r"[^0-9]", "", str(v if v is not None else ""))
    if not d:
        return str(v if v is not None else "")
    return "{:,}".format(int(d))
