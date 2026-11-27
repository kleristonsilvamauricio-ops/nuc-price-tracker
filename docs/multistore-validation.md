# Multi-store validation plan

Production remains unchanged. No paid subscriptions, scraping bypasses, or credentials in source control.

## Amazon US
Start with manual product links and ASIN watchlist; no automated price claim until authorized provider is validated. Investigate Creators API eligibility and Keepa terms/cost separately. Keepa links are manual references, not a live feed.

## Other sources
B&H, Newegg, ASUS Store and Micro Center: manual search links until permitted API/feed access is confirmed. eBay Browse and Best Buy Products are experimental and require production credentials and successful live tests.

## Acceptance gates
- Six categories: NUC 285H 32GB/2TB, 64GB/2TB, barebone, 32GB RAM, 64GB RAM, 2TB NVMe.
- Require evidence for exact configuration, compatibility, condition, availability, currency and seller before ranking.
- Separate no results from authentication, rate limits and partial failures.
- Never expose secrets or commit live Best Buy catalog data.
- Preserve main and prices.json; explicit approval required before merge/deploy.
