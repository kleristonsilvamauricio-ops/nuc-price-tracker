import importlib.util
import unittest

spec=importlib.util.spec_from_file_location("bestbuy","scripts/collect_bestbuy_test.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BestBuyTests(unittest.TestCase):
    def test_missing_key(self):
        result=module.collect(api_key="")
        self.assertEqual(result["status"],"error")
        self.assertEqual(result["offers"],[])
    def test_exact_cpu_filter(self):
        def fake_fetch(url):
            return {"products":[
                {"name":"ASUS NUC 15 Pro Plus Core Ultra 9 285H","salePrice":900.0,
                 "url":"https://www.bestbuy.com/site/test","sku":123},
                {"name":"Other desktop computer","salePrice":100.0,"sku":456}
            ]}
        result=module.collect(api_key="TEST",fetch=fake_fetch)
        nuc=[x for x in result["offers"] if x["category"]=="NUC 285H"]
        self.assertEqual(len(nuc),1)
        self.assertEqual(nuc[0]["price_usd"],900.0)
        self.assertFalse(nuc[0]["compatibility_verified"])
    def test_network_error(self):
        def broken(url):
            raise OSError("blocked")
        result=module.collect(api_key="TEST",fetch=broken)
        self.assertEqual(result["status"],"error")
        self.assertEqual(len(result["errors"]),3)

if __name__=="__main__":
    unittest.main()
