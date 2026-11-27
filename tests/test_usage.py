import unittest

from devprod_lab.usage import core_minutes


class CoreMinutesTests(unittest.TestCase):
    def test_multiplies_active_minutes_by_machine_cores(self):
        self.assertEqual(core_minutes(2, 30), 60)

    def test_returns_zero_for_no_active_time(self):
        self.assertEqual(core_minutes(2, 0), 0)

    def test_rejects_zero_cores(self):
        with self.assertRaisesRegex(ValueError, "cores must be positive"):
            core_minutes(0, 30)

    def test_rejects_negative_active_time(self):
        with self.assertRaisesRegex(ValueError, "minutes must be nonnegative"):
            core_minutes(2, -1)
