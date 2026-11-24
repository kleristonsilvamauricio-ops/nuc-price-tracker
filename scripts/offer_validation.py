"""Conservative title classification. Evidence is provisional, not verified compatibility."""
import re
import math
from urllib.parse import urlparse

QUERIES = {
    "32 GB / 2 TB — montado": "ASUS NUC 15 Pro Plus 285H 32GB 2TB",
    "64 GB / 2 TB — montado": "ASUS NUC 15 Pro Plus 285H 64GB 2TB",
    "Barebone": "ASUS NUC 15 Pro Plus 285H barebone",
    "64 GB RAM": "64GB DDR5 5600 SODIMM 2x32",
    "32 GB RAM": "32GB DDR5 5600 SODIMM 2x16",
    "SSD 2 TB": "2TB M.2 2280 NVMe SSD",
}

def valid(title, category):
    s = title.lower().replace("×", "x")
    has = lambda p: bool(re.search(p, s))
    if has(r"\b(for parts|broken|defective|empty box|case only|adapter only|heatsink only)\b"):
        return False
    if category in list(QUERIES)[:3]:
        if not all(has(p) for p in (r"\basus\b", r"\bnuc\s*15\b", r"\bpro\s*(?:plus|\+)", r"\b285h\b")):
            return False
        bare = has(r"\bbare\s*bone(?:s)?\b|\bno ram\b|\bno memory\b")
        if category == "Barebone":
            return bare and not has(r"\b(?:32|64)\s*gb\b|\b2\s*tb\b")
        capacity = "32" if category.startswith("32") else "64"
        other = "64" if capacity == "32" else "32"
        return not bare and has(r"\b"+capacity+r"\s*gb\b") and not has(r"\b"+other+r"\s*gb\b") and has(r"\b2\s*tb\b") and not has(r"\b(?:up to|optional|choose|without|no ssd)\b")
    if category in ("32 GB RAM", "64 GB RAM"):
        cap, module = ("32", "16") if category.startswith("32") else ("64", "32")
        return all(has(p) for p in (r"\bddr5\b", r"\b(?:c?so[- ]?dimm)\b", r"\b(?:5600|6400)\b", r"\b"+cap+r"\s*gb\b", r"\b2\s*x\s*"+module+r"\b")) and not has(r"\b(?:ecc|registered)\b") and (not has(r"\b6400\b") or has(r"\bcso[- ]?dimm\b"))
    if category == "SSD 2 TB":
        return all(has(p) for p in (r"\b2\s*tb\b", r"\bnvme\b", r"\b2280\b")) and not has(r"\b(?:sata|external|enclosure)\b")
    return False

def price_ok(value):
    try:
        return not isinstance(value, bool) and math.isfinite(float(value)) and 0 < float(value) < 10000
    except (ValueError, TypeError, OverflowError):
        return False

def safe_url(value, domain):
    try:
        p = urlparse(value)
        return p.scheme == "https" and (p.hostname == domain or p.hostname.endswith("." + domain)) and not p.username and not p.password
    except (ValueError, TypeError, AttributeError):
        return False

def error_code(exc):
    code = getattr(exc, "code", None)
    if code in (401, 403):
        return "auth_error"
    if code == 429:
        return "rate_limited"
    if isinstance(code, int):
        return "http_" + str(code)
    return type(exc).__name__

def status(offers, errors, total):
    if errors:
        return "partial_error" if len(errors) < total else "error"
    return "results" if offers else "no_results"
