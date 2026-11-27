import unittest
from scripts.store_links import watchlist, keepa_link

class StoreLinksTests(unittest.TestCase):
    def test_watchlist(self):
        data = watchlist()
        self.assertEqual(len(data), 6)
        for category in data.values():
            self.assertEqual(category["status"], "manual_only")
            self.assertEqual(len(category["links"]), 7)
            self.assertTrue(all(url.startswith("https://") for url in category["links"].values()))
    def test_keepa(self):
        self.assertEqual(keepa_link("B012345678"), "https://keepa.com/#!product/1-B012345678")
        with self.assertRaises(ValueError):
            keepa_link("invalid")
