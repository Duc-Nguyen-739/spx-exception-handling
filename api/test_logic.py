"""Test mirror logic thuần (KHỚP Code.gs + import-csv.js)."""
import unittest
from datetime import datetime
from api.logic import (
    gen_code, next_seq, storage_days, can_resolve, can_liquidate,
    canonical_status, canonical_kind, valid_liq_code, can_admin_edit, check_photos, CODE_RE, TZ,
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

    def test_admin_gate(self):
        self.assertEqual(can_admin_edit("da_tim_bill", "STAFF"), (False, "Cần quyền ADMIN."))
        self.assertEqual(can_admin_edit("thanh_ly", "STAFF"), (False, "Cần quyền ADMIN."))
        self.assertEqual(can_admin_edit("chua_xu_ly", "ADMIN"), (False, "Đơn đang Lưu kho, không cần mở lại."))
        self.assertEqual(can_admin_edit("da_tim_bill", "ADMIN"), (True, ""))
        self.assertEqual(can_admin_edit("thanh_ly", "ADMIN"), (True, ""))

    def test_photo_gate(self):
        self.assertEqual(check_photos(0), (False, "Cần ít nhất 1 ảnh mới Confirm được."))
        self.assertEqual(check_photos(4), (False, "Tối đa 3 ảnh."))
        self.assertEqual(check_photos(1), (True, ""))
        self.assertEqual(check_photos(3), (True, ""))

    def test_storage_days(self):
        now = datetime(2026, 10, 6, 10, 0, 0, tzinfo=TZ)
        self.assertEqual(storage_days("01/10/2026 10:00:00", now), 5)
        self.assertEqual(storage_days("06/10/2026 10:00:00", now), 0)
        self.assertEqual(storage_days("khong-phai-ngay", now), 0)


if __name__ == "__main__":
    unittest.main()
