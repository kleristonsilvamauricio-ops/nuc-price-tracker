"""Manual search fallback: links only; never claims current prices."""
from urllib.parse import urlencode, quote
from scripts.offer_validation import QUERIES

def links(query):
    return {
        "Amazon US": "https://www.amazon.com/s?" + urlencode({"k": query}),
        "B&H": "https://www.bhphotovideo.com/c/search?" + urlencode({"Ntt": query, "N": 0}),
        "Newegg": "https://www.newegg.com/p/pl?" + urlencode({"d": query}),
        "ASUS": "https://www.asus.com/us/searchresult?" + urlencode({"searchType": "products", "searchKey": query}),
        "Micro Center": "https://www.microcenter.com/search/search_results.aspx?" + urlencode({"Ntt": query}),
        "Best Buy": "https://www.bestbuy.com/site/searchpage.jsp?" + urlencode({"st": query}),
        "eBay": "https://www.ebay.com/sch/i.html?" + urlencode({"_nkw": query}),
    }

def watchlist():
    return {category: {"status": "manual_only", "links": links(query)}
            for category, query in QUERIES.items()}

def keepa_link(asin):
    import re
    if not re.fullmatch(r"[A-Z0-9]{10}", asin):
        raise ValueError("Invalid ASIN")
    return "https://keepa.com/#!product/1-" + asin
