#!/usr/bin/env python3
"""Best Buy Products API test collector; separate output, no production changes."""
import datetime
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.offer_validation import QUERIES, valid, price_ok, safe_url, error_code, status

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
                if not valid(title, category) or item.get("onlineAvailability") is not True or not safe_url(item.get("url"), "bestbuy.com"):
                    continue
                price = item.get("salePrice")
                if not price_ok(price):
                    continue
                out["offers"].append({
                    "category":category,"title":title,"price_usd":float(price),
                    "url":item.get("url",""),"sku":item.get("sku"),
                    "seller":"Best Buy","verified_at":now,
                    "online_available":item.get("onlineAvailability"),
                    "compatibility_verified":False})
        except Exception as exc:
            out["errors"].append(category+": "+error_code(exc))
    out["offers"].sort(key=lambda x:x["price_usd"])
    out["offers"] = [o for cat in QUERIES for o in [x for x in out["offers"] if x["category"] == cat][:15]]
    out["status"] = status(out["offers"], out["errors"], len(QUERIES))
    return out

if __name__ == "__main__":
    result=collect()
    Path("prices-bestbuy-test.json").write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(result["status"],len(result["offers"]),"offers")
    if result["status"] not in ("results", "no_results"):
        raise SystemExit(1)
