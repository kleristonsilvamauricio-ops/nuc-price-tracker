#!/usr/bin/env python3
"""Best Buy Products API test collector; separate output, no production changes."""
import datetime
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

QUERIES = {
    "NUC 285H": "285H",
    "RAM 32 GB": "DDR5 SODIMM",
    "SSD 2 TB": "2TB SSD",
}

def collect(api_key=None, fetch=None):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    out = {"checked_at":now,"source":"Best Buy Products API",
           "status":"error","offers":[],"errors":[]}
    key = api_key if api_key is not None else os.environ.get("BESTBUY_API_KEY","")
    if not key:
        out["errors"].append("BESTBUY_API_KEY não configurada")
        return out
    if fetch is None:
        def fetch(url):
            with urllib.request.urlopen(url,timeout=25) as resp:
                return json.load(resp)
    for category, term in QUERIES.items():
        # Search the official catalog; only return a product when a relevant
        # exact product match is present. RAM/SSD results require manual
        # compatibility review before use in build comparisons.
        expr = "search=" + urllib.parse.quote(term)
        url = ("https://api.bestbuy.com/v1/products(" + expr +
               ")?format=json&show=sku,name,salePrice,url,onlineAvailability"
               "&pageSize=100&apiKey=" + urllib.parse.quote(key))
        try:
            data = fetch(url)
            for item in data.get("products",[]):
                title = item.get("name","")
                if category == "NUC 285H" and not (
                    "285h" in title.lower() and "nuc" in title.lower()
                ):
                    continue
                if category == "RAM 32 GB" and not (
                    "sodimm" in title.lower() or "so-dimm" in title.lower()
                ):
                    continue
                if category == "SSD 2 TB" and not (
                    "2tb" in title.lower() or "2 tb" in title.lower()
                ):
                    continue
                price = item.get("salePrice")
                if not isinstance(price,(float,int)) or price <= 0:
                    continue
                out["offers"].append({
                    "category":category,"title":title,"price_usd":price,
                    "url":item.get("url",""),"sku":item.get("sku"),
                    "seller":"Best Buy","verified_at":now,
                    "online_available":item.get("onlineAvailability"),
                    "compatibility_verified":False})
        except Exception as exc:
            out["errors"].append(category+": "+str(exc)[:150])
    out["offers"].sort(key=lambda x:x["price_usd"])
    out["status"] = ("results" if out["offers"] else
                     "partial_error" if out["errors"] and len(out["errors"])<len(QUERIES)
                     else "error" if out["errors"] else "no_results")
    return out

if __name__ == "__main__":
    result=collect()
    Path("prices-bestbuy-test.json").write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(result["status"],len(result["offers"]),"offers")
    if result["status"]=="error":
        raise SystemExit(1)
