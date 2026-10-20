// Zero-dependency local development web server. Run: npm run dev
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=process.cwd();
const port=Number(process.env.PORT||5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
  let name;
  try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end('Bad request');return}
  const pathname=name==='/'?'/index.html':name;
  const file=resolve(root,'.'+pathname);
  if(file!==root && !file.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Method not allowed');return}
  try{
    const info=await stat(file);if(!info.isFile())throw Error('Not a file');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found')}
}).listen(port,'0.0.0.0',()=>console.log(`\nTRACE EXPERT CITY is running at http://localhost:${port}\nPress Ctrl+C to stop.\n`));
