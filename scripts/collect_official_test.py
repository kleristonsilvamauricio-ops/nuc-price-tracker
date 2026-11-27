#!/usr/bin/env python3
"""Experimental official eBay Browse API collector. Does not alter production prices.json.
Requires EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as GitHub Actions secrets.
"""
import base64, datetime, json, os, urllib.parse, urllib.request
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.offer_validation import QUERIES, valid, price_ok, safe_url, error_code, status


def request_json(url, headers, data=None):
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)

def token():
    client = os.environ.get("EBAY_CLIENT_ID", "")
    secret = os.environ.get("EBAY_CLIENT_SECRET", "")
    if not client or not secret:
        raise RuntimeError("Credenciais oficiais do eBay não configuradas")
    auth = base64.b64encode(f"{client}:{secret}".encode()).decode()
    return request_json(
        "https://api.ebay.com/identity/v1/oauth2/token",
        {"Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded"},
        urllib.parse.urlencode({"grant_type":"client_credentials",
          "scope":"https://api.ebay.com/oauth/api_scope"}).encode()
    )["access_token"]

def collect():
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = {"checked_at": now, "status":"unavailable",
              "source":"eBay Browse API (official, experimental)",
              "offers":[], "errors":[]}
    try:
        access = token()
    except Exception as exc:
        result["errors"].append("Autenticação: " + error_code(exc))
        result["status"] = "error"
        return result
    headers = {"Authorization":"Bearer " + access,
               "X-EBAY-C-MARKETPLACE-ID":"EBAY_US", "Accept":"application/json"}
    for category, query in QUERIES.items():
        try:
            url = "https://api.ebay.com/buy/browse/v1/item_summary/search?" + urllib.parse.urlencode(
                {"q":query,"limit":30,"filter":"buyingOptions:{FIXED_PRICE}"})
            data = request_json(url, headers)
            for item in data.get("itemSummaries", []):
                price = item.get("price", {})
                title = item.get("title", "")
                if price.get("currency") != "USD" or not valid(title,category):
                    continue
                if not price_ok(price.get("value")) or not safe_url(item.get("itemWebUrl"), "ebay.com") or item.get("conditionId") != "1000" or not item.get("seller", {}).get("username"):
                    continue
                amount = float(price["value"])
                if not 20 < amount < 10000:
                    continue
                result["offers"].append({
                    "category":category,"title":title[:180],
                    "price_usd":amount,"url":item.get("itemWebUrl",""),
                    "seller":item.get("seller",{}).get("username","eBay seller"),
                    "verified_at":now, "item_id":item.get("itemId"), "compatibility_verified":False, "availability_verified":False})
        except Exception as exc:
            result["errors"].append(category + ": " + error_code(exc))
    result["offers"] = sorted(result["offers"], key=lambda x: (x["category"], x["price_usd"]))
    result["offers"] = [o for cat in QUERIES for o in [x for x in result["offers"] if x["category"] == cat][:15]]
    result["status"] = status(result["offers"], result["errors"], len(QUERIES))
    return result

if __name__ == "__main__":
    output = collect()
    Path("prices-test.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n")
    print(output["status"],len(output["offers"]),"offers;",len(output["errors"]),"errors")
    if output["status"] not in ("results", "no_results"):
        raise SystemExit(1)
