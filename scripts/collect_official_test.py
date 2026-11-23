#!/usr/bin/env python3
"""Experimental official eBay Browse API collector. Does not alter production prices.json.
Requires EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as GitHub Actions secrets.
"""
import base64, datetime, json, os, urllib.parse, urllib.request
from pathlib import Path

QUERIES = {
    "32 GB / 2 TB — montado": "ASUS NUC 15 Pro Plus 285H 32GB 2TB",
    "64 GB / 2 TB — montado": "ASUS NUC 15 Pro Plus 285H 64GB 2TB",
    "Barebone": "ASUS NUC 15 Pro Plus 285H barebone",
    "64 GB RAM": "64GB DDR5 5600 SODIMM 2x32",
    "32 GB RAM": "32GB DDR5 5600 SODIMM 2x16",
    "SSD 2 TB": "2TB M.2 2280 NVMe SSD",
}

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

def valid(title, category):
    low = title.lower()
    if category in ("Barebone", "32 GB / 2 TB — montado", "64 GB / 2 TB — montado"):
        return "285h" in low and "nuc" in low
    return True

def collect():
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = {"checked_at": now, "status":"unavailable",
              "source":"eBay Browse API (official, experimental)",
              "offers":[], "errors":[]}
    try:
        access = token()
    except Exception as exc:
        result["errors"].append("Autenticação: " + str(exc))
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
                amount = float(price.get("value",0))
                if not 20 < amount < 10000:
                    continue
                result["offers"].append({
                    "category":category,"title":title[:180],
                    "price_usd":amount,"url":item.get("itemWebUrl",""),
                    "seller":item.get("seller",{}).get("username","eBay seller"),
                    "verified_at":now})
        except Exception as exc:
            result["errors"].append(category + ": " + str(exc)[:160])
    result["offers"].sort(key=lambda x:x["price_usd"])
    result["offers"] = result["offers"][:80]
    result["status"] = "results" if result["offers"] else (
        "error" if result["errors"] else "no_results")
    return result

if __name__ == "__main__":
    output = collect()
    Path("prices-test.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n")
    print(output["status"],len(output["offers"]),"offers;",len(output["errors"]),"errors")
    if output["status"] == "error":
        raise SystemExit(1)
