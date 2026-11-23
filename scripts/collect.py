#!/usr/bin/env python3
"""Experimental public listing collector; never invent prices."""
import json,re,datetime,urllib.request,urllib.parse,html
from html.parser import HTMLParser
from pathlib import Path
QUERIES=[
 ("32 GB / 2 TB — montado","ASUS NUC 15 Pro Plus 285H 32GB 2TB"),
 ("64 GB / 2 TB — montado","ASUS NUC 15 Pro Plus 285H 64GB 2TB"),
 ("Barebone","ASUS NUC 15 Pro Plus 285H barebone"),
 ("64 GB RAM","64GB DDR5 5600 SODIMM 2x32"),
 ("32 GB RAM","32GB DDR5 5600 SODIMM 2x16"),
 ("SSD 2 TB","2TB M.2 2280 NVMe SSD")]
class Items(HTMLParser):
 def __init__(self): super().__init__();self.items=[];self.cur=None;self.capture=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);cl=a.get('class','')
  if tag=='li' and 's-item' in cl.split(): self.cur={'title':'','price':None,'url':None}
  if self.cur is None:return
  if tag=='a' and 's-item__link' in cl and not self.cur['url']:self.cur['url']=a.get('href','').split('?')[0]
  if tag in ('span','div','h3'):
   if 's-item__price' in cl:self.capture='price'
   elif 's-item__title' in cl:self.capture='title'
 def handle_data(self,data):
  if self.cur is not None and self.capture:self.cur[self.capture]=(self.cur.get(self.capture) or '')+data
 def handle_endtag(self,tag):
  if tag in ('span','div','h3'):self.capture=None
  if tag=='li' and self.cur is not None:self.items.append(self.cur);self.cur=None
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
out={'checked_at':now,'status':'unavailable','source':'eBay US public listings (experimental)','offers':[],'errors':[]}
for category,q in QUERIES:
 try:
  url='https://www.ebay.com/sch/i.html?_nkw='+urllib.parse.quote(q)+'&_sop=15&LH_BIN=1'
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; NUCPriceTracker/1.0)','Accept-Language':'en-US,en;q=0.9'})
  with urllib.request.urlopen(req,timeout=18) as resp:body=resp.read(2000000).decode('utf-8','replace')
  parser=Items();parser.feed(body)
  for item in parser.items:
   title=html.unescape(item.get('title') or '')
   if not item.get('url') or not item.get('price') or '285h' not in title.lower() and category not in ('64 GB RAM','32 GB RAM','SSD 2 TB'):continue
   price_text=item['price']
   if ' to ' in price_text or ' a ' in price_text:continue
   m=re.search(r'(?:US\s*\$|\$)\s*([\d,]+\.\d{2})',price_text)
   if not m:continue
   price=float(m.group(1).replace(',',''))
   if not 20<price<10000:continue
   out['offers'].append({'category':category,'title':title[:180],'price_usd':price,'url':item['url'],'seller':'eBay marketplace','verified_at':now})
 except Exception as e:out['errors'].append(category+': '+str(e)[:160])
out['status']='results' if out['offers'] else 'unavailable'
out['offers']=sorted(out['offers'],key=lambda x:x['price_usd'])[:80]
Path('prices.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(out['status'],len(out['offers']),'offers')
