"""Test mirror logic thuần (KHỚP Code.gs + import-csv.js)."""
import unittest
from datetime import datetime
from api.logic import (
    gen_code, next_seq, next_seq_reserved, bulk_codes, BULK_MAX,
    storage_days, parse_created_smart, code_date, can_resolve, can_liquidate,
    canonical_status, canonical_kind, valid_liq_code, can_edit_status,
    history_bill, map_history_row,
    check_create_photos, can_delete_user, extract_drive_id, can_edit, CODE_RE, TZ,
    valid_custom_code, custom_code_exists, can_edit_basic, staff_edit_notes,
)


class TestCodeFormat(unittest.TestCase):
    def test_gen_code_format(self):
        dt = datetime(2026, 10, 1, 10, 0, 0, tzinfo=TZ)
        self.assertEqual(gen_code("Box", dt, 21), "Box.01-10-2026.21")
        self.assertEqual(gen_code("Item", dt, 1), "Item.01-10-2026.1")
        self.assertTrue(CODE_RE.match("Box.01-10-2026.21"))

    def test_next_seq_per_day(self):
        codes = ["Box.01-10-2026.1", "Box.01-10-2026.2", "Box.02-10-2026.1"]
        dt = datetime(2026, 10, 1, tzinfo=TZ)
        self.assertEqual(next_seq(codes, "Box", dt), 3)
        dt2 = datetime(2026, 10, 2, tzinfo=TZ)
        self.assertEqual(next_seq(codes, "Box", dt2), 2)
        self.assertEqual(next_seq([], "Item", dt), 1)


class TestStatus(unittest.TestCase):
    def test_canonical_status(self):
        self.assertEqual(canonical_status(""), "chua_xu_ly")
        self.assertEqual(canonical_status("tìm thấy bill"), "da_tim_bill")
        self.assertEqual(canonical_status("THANH LÝ"), "thanh_ly")

    def test_kind_prefix_priority(self):
        self.assertEqual(canonical_kind("ITEM.01.x", "Box"), "Item")
        self.assertEqual(canonical_kind("BOX.01.x", "Item"), "Box")

    def test_resolve_gate(self):
        self.assertEqual(can_resolve("chua_xu_ly"), (True, ""))
        self.assertEqual(can_resolve("da_tim_bill"), (False, "Đã Resolve"))
        self.assertEqual(can_resolve("thanh_ly"), (False, "Đã Thanh Lý"))

    def test_liquidate_gate(self):
        self.assertEqual(can_liquidate("chua_xu_ly"), (True, ""))
        self.assertEqual(can_liquidate("thanh_ly"), (False, "Đã Thanh Lý"))
        self.assertEqual(can_liquidate("da_tim_bill"), (False, "Đã Resolve"))

    def test_liq_code_required(self):
        self.assertTrue(valid_liq_code("SPXVN123"))
        self.assertFalse(valid_liq_code(""))
        self.assertFalse(valid_liq_code("hello"))

    def test_edit_status_gate(self):
        self.assertEqual(can_edit_status("STAFF", "chua_xu_ly", "", "x"), (False, "Cần quyền ADMIN."))
        self.assertEqual(can_edit_status("ADMIN", "chua_xu_ly", "", "về kho"), (True, ""))
        self.assertEqual(can_edit_status("ADMIN", "da_tim_bill", "SPXVN123", "ok"), (True, ""))
        self.assertEqual(can_edit_status("ADMIN", "thanh_ly", "", "vỡ hàng"), (True, ""))
        self.assertEqual(can_edit_status("ADMIN", "da_tim_bill", "SPXVN123", ""), (False, "Thiếu lý do."))
        self.assertEqual(can_edit_status("ADMIN", "thanh_ly", "", "  "), (False, "Thiếu lý do."))
        self.assertEqual(can_edit_status("ADMIN", "da_cho_di", "SPXVN1", "x"), (False, "Trạng thái không hợp lệ."))

    def test_map_history_row(self):
        h = ["at", "code", "from_status", "to_status", "by", "note"]
        r = ["06/10/2026 18:01:00", "Box.1", "chua_xu_ly", "da_tim_bill", "a@x.com", "SPXVN1"]
        self.assertEqual(map_history_row(h, r, "Box.1")["to"], "da_tim_bill")
        self.assertEqual(map_history_row(h, r, "Box.2"), None)
        shuffled = ["by", "note", "code", "at", "to_status", "from_status"]
        rs = ["a@x.com", "SPXVN1", " Box.1 ", "06/10/2026 18:01:00", "da_tim_bill", "chua_xu_ly"]
        got = map_history_row(shuffled, rs, "Box.1")
        self.assertEqual(got["from"], "chua_xu_ly")
        self.assertEqual(got["by"], "a@x.com")
        self.assertEqual(map_history_row(["at", "by"], ["x", "y"], "Box.1"), None)

    def test_history_bill(self):
        self.assertEqual(history_bill("chua_xu_ly", "da_tim_bill", "SPXVN123"), "SPXVN123")
        self.assertEqual(history_bill("chua_xu_ly", "thanh_ly", "SPXVN9"), "SPXVN9")
        self.assertEqual(history_bill("", "chua_xu_ly", "Tạo mới"), "")
        self.assertEqual(history_bill("da_tim_bill", "da_tim_bill", "ADMIN chỉnh sửa Ảnh"), "")
        self.assertEqual(history_bill("da_tim_bill", "chua_xu_ly", ""), "")

    def test_custom_code_gate(self):
        self.assertEqual(valid_custom_code("Box.07-10-2026.41", "Box"), (True, ""))
        self.assertEqual(valid_custom_code("Item.07-10-2026.51", "Item"), (True, ""))
        self.assertEqual(valid_custom_code("Item.07-10-2026.51", "Box")[0], False)
        self.assertEqual(valid_custom_code("Box.07-10-2026.51", "Item")[0], False)
        self.assertEqual(valid_custom_code("Box.07-10-2026", "Box")[0], False)
        self.assertEqual(valid_custom_code("", "Box")[0], False)
        self.assertTrue(custom_code_exists("Box.07-10-2026.41", ["Box.07-10-2026.41"], []))
        self.assertTrue(custom_code_exists("Box.07-10-2026.41", [], ["Box.07-10-2026.41"]))
        self.assertFalse(custom_code_exists("Box.07-10-2026.42", ["Box.07-10-2026.41"], []))

    def test_photo_gate(self):
        self.assertEqual(check_create_photos("Box", "", "", 0)[0], False)
        self.assertEqual(check_create_photos("Box", "a", "", 0), (False, "Box cần đủ Ảnh ngoại quan + Ảnh sản phẩm."))
        self.assertEqual(check_create_photos("Box", "a", "b", 1), (True, ""))
        self.assertEqual(check_create_photos("Box", "a", "b", 2), (False, "Tối đa 3 ảnh."))
        self.assertEqual(check_create_photos("Item", "", "", 0), (False, "Item cần Ảnh sản phẩm."))
        self.assertEqual(check_create_photos("Item", "", "b", 0), (True, ""))

    def test_delete_user_gate(self):
        rows = [("a@x.com", "ADMIN"), ("b@x.com", "ADMIN")]
        self.assertEqual(can_delete_user(rows, "b@x.com", "a@x.com"), (True, ""))
        self.assertEqual(can_delete_user(rows, "a@x.com", "a@x.com"), (False, "Không tự xóa chính mình."))
        self.assertEqual(can_delete_user([("a@x.com", "ADMIN")], "a@x.com", "z@x.com"), (False, "Không thể xóa ADMIN cuối cùng."))
        self.assertEqual(can_delete_user(rows, "z@x.com", "a@x.com"), (False, "Email không có trong danh sách."))

    def test_edit_gate(self):
        self.assertEqual(can_edit("ADMIN"), (True, ""))
        self.assertEqual(can_edit("STAFF"), (False, "Chỉ ADMIN được sửa."))
        self.assertEqual(can_edit(""), (False, "Chỉ ADMIN được sửa."))

    def test_edit_basic_gate(self):
        self.assertEqual(can_edit_basic("ADMIN"), (True, ""))
        self.assertEqual(can_edit_basic("STAFF"), (True, ""))
        self.assertEqual(can_edit_basic(""), (True, ""))

    def test_staff_edit_notes(self):
        self.assertEqual(staff_edit_notes("Áo Cam", "Kệ B2", "Áo xanh", "Kệ B2"),
                         ["Edit Mô tả: Áo Cam => Áo xanh"])
        self.assertEqual(staff_edit_notes("Áo Cam", "Kệ B2", "Áo Cam", "Kệ B3"),
                         ["Edit Ghi chú: Kệ B2 => Kệ B3"])
        self.assertEqual(staff_edit_notes("Áo Cam", "Kệ B2", "Áo Cam", "Kệ B2"), [])
        self.assertEqual(staff_edit_notes("Áo Cam", "Kệ B2", "Áo xanh", "Kệ B2", admin=True),
                         ["ADMIN Edit Mô tả: Áo Cam => Áo xanh"])

    def test_extract_drive_id(self):
        self.assertEqual(extract_drive_id("1AbCdefGhIjKlMnOp"), "1AbCdefGhIjKlMnOp")
        self.assertEqual(extract_drive_id("https://drive.google.com/file/d/1AbCdefGhIjKlMnOp/view"), "1AbCdefGhIjKlMnOp")
        self.assertEqual(extract_drive_id("https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400"), "1AbCdefGhIjKlMnOp")
        self.assertEqual(extract_drive_id(""), "")
        self.assertEqual(extract_drive_id("https://example.com/a.jpg"), "")

    def test_storage_days(self):
        now = datetime(2026, 10, 6, 10, 0, 0, tzinfo=TZ)
        self.assertEqual(storage_days("01/10/2026 10:00:00", now), 5)
        self.assertEqual(storage_days("06/10/2026 10:00:00", now), 0)
        self.assertEqual(storage_days("khong-phai-ngay", now), 0)

    def test_smart_date_against_code(self):
        now = datetime(2026, 10, 7, 0, 0, 0, tzinfo=TZ)
        # Chuoi US MM/dd doc nhu VN: doi chieu ma thi dung Oct.
        self.assertEqual(
            parse_created_smart("10/06/2026 18:39:00", "Box.06-10-2026.2"),
            datetime(2026, 10, 6, 18, 39, 0, tzinfo=TZ),
        )
        self.assertEqual(storage_days("10/06/2026 18:39:00", now, "Box.06-10-2026.2"), 0)
        self.assertEqual(storage_days("10/05/2026 19:14:53", now, "Box.05-10-2026.2"), 1)
        # Ma custom khong khop ngay tao: fallback VN nhu cu.
        self.assertEqual(storage_days("10/06/2026 18:39:00", now, "Box.01-01-2026.9"), 118)
        self.assertIsNone(code_date("ma-la-khong-chuan"))
        self.assertEqual(code_date("BOX.06102026.01"), (2026, 10, 6))

    def test_bulk_codes_continuous(self):
        dt = datetime(2026, 10, 6, 10, 0, 0, tzinfo=TZ)
        got = bulk_codes(["Box.06-10-2026.1", "Box.06-10-2026.2"], [], "Box", dt, 10)
        self.assertEqual(len(got), 10)
        self.assertEqual(got[0], "Box.06-10-2026.3")
        self.assertEqual(got[-1], "Box.06-10-2026.12")

    def test_bulk_codes_skip_reserved(self):
        dt = datetime(2026, 10, 6, 10, 0, 0, tzinfo=TZ)
        printed = ["Box.06-10-2026.%d" % i for i in range(3, 13)]
        got = bulk_codes(["Box.06-10-2026.1", "Box.06-10-2026.2"], printed, "Box", dt, 10)
        self.assertEqual(got[0], "Box.06-10-2026.13")
        self.assertEqual(next_seq_reserved(["Item.06-10-2026.1"], printed, "Item", dt), 2)

    def test_bulk_codes_count_clamped(self):
        dt = datetime(2026, 10, 6, 10, 0, 0, tzinfo=TZ)
        self.assertEqual(len(bulk_codes([], [], "Item", dt, 99)), BULK_MAX)
        self.assertEqual(len(bulk_codes([], [], "Item", dt, 0)), BULK_MAX)
        self.assertEqual(bulk_codes([], [], "Item", dt, 3),
                         ["Item.06-10-2026.1", "Item.06-10-2026.2", "Item.06-10-2026.3"])


class TestListFullBatch(unittest.TestCase):
    """Mirror Code.gs listFull: gom log 1 lần theo code, moi code giu bill."""

    def test_group_history_by_code(self):
        header = ["at", "code", "from_status", "to_status", "by", "note"]
        rows = [
            ["06/10/2026 08:02:00", "Box.06-10-2026.1", "", "chua_xu_ly", "a@x.com", "Tạo mới"],
            ["06/10/2026 18:01:00", "Box.06-10-2026.1", "chua_xu_ly", "da_tim_bill", "b@x.com", "SPXVN123"],
            ["05/10/2026 09:00:00", "Item.06-10-2026.2", "", "chua_xu_ly", "c@x.com", "Tạo mới"],
        ]
        grouped = {}
        for r in rows:
            e = map_history_row(header, r, r[1])
            if e:
                e["bill"] = history_bill(e["from"], e["to"], e["note"])
                grouped.setdefault(e["code"], []).append(e)
        self.assertEqual(sorted(grouped), ["Box.06-10-2026.1", "Item.06-10-2026.2"])
        self.assertEqual(len(grouped["Box.06-10-2026.1"]), 2)
        self.assertEqual(grouped["Box.06-10-2026.1"][0]["bill"], "")
        self.assertEqual(grouped["Box.06-10-2026.1"][1]["bill"], "SPXVN123")
        self.assertEqual(grouped["Item.06-10-2026.2"][0]["bill"], "")

    def test_group_history_skips_other_code(self):
        header = ["at", "code", "from_status", "to_status", "by", "note"]
        want = {"Box.06-10-2026.1"}
        grouped = {}
        for r in [["06/10/2026 08:00:00", "Item.06-10-2026.9", "", "chua_xu_ly", "a@x.com", "Tạo mới"],
                  ["06/10/2026 08:02:00", "Box.06-10-2026.1", "", "chua_xu_ly", "a@x.com", "Tạo mới"]]:
            if str(r[1]).strip() not in want:
                continue
            e = map_history_row(header, r, r[1])
            grouped.setdefault(e["code"], []).append(e)
        self.assertEqual(list(grouped), ["Box.06-10-2026.1"])

    def test_alt_header_names_from_to(self):
        # Sheet có sẵn dùng tên cột from/to thay from_status/to_status.
        header = ["at", "code", "from", "to", "by", "note"]
        e = map_history_row(header, ["06/10/2026 18:00:00", "Box.06-10-2026.1",
                                     "chua_xu_ly", "thanh_ly", "a@x.com", "SPXVN9"], "Box.06-10-2026.1")
        self.assertEqual((e["from"], e["to"]), ("chua_xu_ly", "thanh_ly"))
        self.assertEqual(history_bill(e["from"], e["to"], e["note"]), "SPXVN9")
        self.assertEqual(e["reason"], "")

    def test_history_header_variants(self):
        for header in (
            ["at", "code", "from_status", "to_status", "by", "note", "reason"],
            ["AT", "Code", "From Status", "To Status", "By", "Note", "Lý do"],
            ["at", "code", "from", "to", "by", "note", "ly-do"],
        ):
            r = ["08/10/2026 19:58:12", "Box.1", "chua_xu_ly", "thanh_ly",
                 "ADMIN đổi trạng thái", "SPXVN1", "Thao tác sai"]
            e = map_history_row(header, r, "Box.1")
            self.assertEqual(e["to"], "thanh_ly")
            self.assertEqual(e["note"], "SPXVN1")
            self.assertEqual(e["reason"], "Thao tác sai")

    def test_history_reason_column(self):
        header = ["at", "code", "from_status", "to_status", "by", "note", "reason"]
        e = map_history_row(header, ["06/10/2026 19:21:00", "Box.06-10-2026.1",
                                     "da_tim_bill", "chua_xu_ly", "ADMIN đổi trạng thái",
                                     "", "Thao tác sai"], "Box.06-10-2026.1")
        self.assertEqual(e["reason"], "Thao tác sai")
        self.assertEqual(history_bill(e["from"], e["to"], e["note"]), "")


if __name__ == "__main__":
    unittest.main()
