import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
const root=process.cwd();
const args=process.argv.slice(2);
const port=Number(args.includes('--port')?args[args.indexOf('--port')+1]:(process.env.PORT||3000));
const host=args.includes('--host')?args[args.indexOf('--host')+1]:'0.0.0.0';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
  try {
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path.endsWith('/'))path+='index.html';
    if(!/^\/(?:index\.html|sw\.js|compare\.js|manifest\.webmanifest|icon\.svg|prices\.json|src\/|assets\/|data\/|legacy\/|qa-artifacts\/)/.test(path))throw Error('not found');
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root+'/'))throw Error('not found');
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(port,host,()=>console.log('Price Tracker preview ready'));
