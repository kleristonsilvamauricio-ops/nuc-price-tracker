import unittest
from scripts.offer_validation import valid, price_ok, safe_url, status, error_code

class ValidationTests(unittest.TestCase):
    def test_categories(self):
        base = "ASUS NUC 15 Pro+ 285H "
        self.assertTrue(valid(base+"32GB 2TB", "32 GB / 2 TB — montado"))
        self.assertTrue(valid(base+"64GB 2TB", "64 GB / 2 TB — montado"))
        self.assertTrue(valid(base+"barebone", "Barebone"))
        self.assertFalse(valid(base+"barebone", "64 GB / 2 TB — montado"))
        self.assertFalse(valid(base+"64GB 2TB", "32 GB / 2 TB — montado"))
        self.assertFalse(valid(base+"up to 64GB 2TB", "64 GB / 2 TB — montado"))
        self.assertTrue(valid("64GB DDR5 5600 SODIMM 2x32", "64 GB RAM"))
        self.assertTrue(valid("32GB DDR5 5600 SODIMM 2x16", "32 GB RAM"))
        self.assertFalse(valid("64GB DDR4 2x32 SODIMM", "64 GB RAM"))
        self.assertFalse(valid("32GB DDR5 5600 DIMM 2x16", "32 GB RAM"))
        self.assertTrue(valid("2TB NVMe M.2 2280 SSD", "SSD 2 TB"))
        self.assertFalse(valid("2TB SATA M.2 2280 SSD", "SSD 2 TB"))

    def test_safety(self):
        for value in (None, True, "nan", "inf", -1, "bad"):
            self.assertFalse(price_ok(value))
        self.assertTrue(safe_url("https://www.ebay.com/itm/123", "ebay.com"))
        self.assertFalse(safe_url("https://ebay.com.example.com", "ebay.com"))
        self.assertEqual(status([1], ["error"], 6), "partial_error")
        self.assertEqual(error_code(ValueError("SECRET")), "ValueError")
