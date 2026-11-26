const CACHE='price-tracker-universal-v2.0.0';
const SHELL=['./','./index.html','./src/app.js','./src/domain.js','./src/storage.js','./src/styles.css','./manifest.webmanifest','./icon.svg','./assets/icon-192.png','./assets/icon-512.png','./data/automation-status.json','./data/exchange.json','./legacy/','./legacy/compare.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('nuc-tracker-')||k.startsWith('price-tracker-universal-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const root=new URL('./',self.location.href);
  if(!url.pathname.startsWith(root.pathname))return;
  const path=url.pathname.slice(root.pathname.length);
  if(path==='prices.json'||path.startsWith('data/'))return;
  event.respondWith((async()=>{
    const normalized=new Request(new URL(url.pathname,url.origin).href);
    try{
      const response=await fetch(event.request);
      if(response.ok&&response.type==='basic'){
        const cache=await caches.open(CACHE);await cache.put(normalized,response.clone());
      }
      return response;
    }catch{
      const cached=await caches.match(normalized);
      if(cached)return cached;
      if(event.request.mode==='navigate')return (await caches.match(new URL('./index.html',root).href))||Response.error();
      return Response.error();
    }
  })());
});
