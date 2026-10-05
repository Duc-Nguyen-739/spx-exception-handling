"""Smoke test khung ban đầu."""
import unittest


class TestSmoke(unittest.TestCase):
    def test_khung(self):
        self.assertEqual(1 + 1, 2)


if __name__ == "__main__":
    unittest.main()
