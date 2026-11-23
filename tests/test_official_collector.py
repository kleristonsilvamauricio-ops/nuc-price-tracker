import importlib.util
import os
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("collector", "scripts/collect_official_test.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTests(unittest.TestCase):
    def test_query_categories(self):
        self.assertEqual(len(collector.QUERIES), 6)
    def test_reject_wrong_nuc_processor(self):
        self.assertFalse(collector.valid("ASUS NUC Core Ultra 7", "Barebone"))
        self.assertTrue(collector.valid("ASUS NUC 15 Pro Plus 285H", "Barebone"))
    def test_missing_credentials_fails_explicitly(self):
        with patch.dict(os.environ, {"EBAY_CLIENT_ID": "", "EBAY_CLIENT_SECRET": ""}):
            result = collector.collect()
        self.assertEqual(result["status"], "error") if result["status"] == "error" else self.fail("Missing credentials must report error")
        self.assertEqual(result["offers"], [])
        self.assertTrue(result["errors"])

if __name__ == "__main__":
    unittest.main()
