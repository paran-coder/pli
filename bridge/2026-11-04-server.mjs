import {createConnection} from 'node:net';
import {openCapCutDraft} from './2026-11-05-capcut-open.mjs';
import {execFile} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectSetup} from './2026-11-05-setup.mjs';
import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { SnapshotStore, validateProject, routeAI } from './2026-11-04-core.mjs';
import { cliStatus, generatePlan, generateChannelInsight, generateTrackImage } from './2026-11-04-cli.mjs';
import {collectChannel,previewChannel,searchChannels,verifyYouTubeKey} from './2026-11-04-youtube.mjs';
import { MCPClient, musicTools, validateToolArgs } from './2026-11-04-mcp.mjs';
import {createCapCutProject} from './2026-11-05-capcut.mjs';
import { probe, renderPlaylist, detectSilence } from './2026-11-04-media.mjs';
import { completeYuEGeneration, unpackMCP, assertWorkspacePath } from './2026-11-04-music.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const publicDir=resolve(here,'../public');
const defaultData=resolve(here,'../../2026-11-04-PlayL-work-v0.1.0/2026-11-04-runtime-v0.1.0');
const workspaceRoot=resolve(here,'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.ogg':'audio/ogg','.mp4':'video/mp4','.zip':'application/zip'};
const safeError=e=>String(e.message||e).replace(/(Bearer\s+)[^\s"']+/gi,'$1[hidden]').slice(0,2000);
const validId=id=>/^[a-zA-Z0-9_-]{1,90}$/.test(id);
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};

async function body(req,max=2*1024*1024){let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('요청이 너무 큽니다.');text+=chunk;}try{return JSON.parse(text||'{}');}catch{throw new Error('Invalid JSON');}}

async function checkMediaSignature(path,kind){
  const file=await open(path,'r'),head=Buffer.alloc(16);
  try{await file.read(head,0,16,0);}finally{await file.close();}
  const tag=head.toString('ascii'),audio=tag.startsWith('ID3')||(head[0]===255&&(head[1]&224)===224)||tag.startsWith('fLaC')||tag.startsWith('OggS')||(['RIFF','RF64'].includes(tag.slice(0,4))&&tag.slice(8,12)==='WAVE')||tag.slice(4,8)==='ftyp';
  const image=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(head[0]===255&&head[1]===216&&head[2]===255)||(tag.startsWith('RIFF')&&tag.slice(8,12)==='WEBP');
  if(!(kind==='audio'?audio:image))throw new Error('파일의 실제 형식을 확인하세요. 재생목록이나 문서는 가져올 수 없습니다.');
}

function approveWebOrigin(origin){
  if(process.platform!=='win32')return Promise.resolve(false);
  const script=join(here,'..','2026-11-05-PlayL-approve-web-v0.8.0.ps1');
  return new Promise(resolve=>execFile('pwsh.exe',['-NoProfile','-WindowStyle','Hidden','-File',script,'-Origin',origin],{timeout:65000,windowsHide:true},error=>resolve(!error)));
}

export async function createBridge({dataDir=defaultData,port=43119,token=randomBytes(32).toString('base64url'),youtubeFetch=fetch,planGenerator=generatePlan,channelGenerator=generateChannelInsight,imageGenerator=generateTrackImage,approveOrigin=approveWebOrigin,webOrigin=process.env.PLAYL_WEB_ORIGIN}={}) {
  await mkdir(dataDir,{recursive:true});
  const stores=Object.fromEntries(['projects','assets','jobs','settings','connections'].map(k=>[k,new SnapshotStore(join(dataDir,k))]));
  const projects=new Map(await stores.projects.all()),assets=new Map(await stores.assets.all()),jobs=new Map(await stores.jobs.all());
  let settings=(await stores.settings.get('settings'))||{allowedOrigins:[]};
  let sunoSecret=(await stores.connections.get('suno'))||{token:''};
  let youtubeVerifiedAt=(await stores.connections.get('youtube'))?.verifiedAt||null;
  let youtubeKey=(await stores.connections.get('youtube'))?.apiKey||process.env.YOUTUBE_API_KEY||'';
  const mcp=new Map(),controllers=new Map(),pendingOAuth=new Map(),projectWrites=new Map();let processing=false,yueMaxSeconds=null;
  async function serializeProject(id,task){
    const previous=projectWrites.get(id)||Promise.resolve();
    const pending=previous.catch(()=>{}).then(task);projectWrites.set(id,pending);
    try{return await pending;}finally{if(projectWrites.get(id)===pending)projectWrites.delete(id);}
  }
  async function markYoutubeVerified(key){
    return serializeProject('youtube-connection',async()=>{
      if(key!==youtubeKey)throw new Error('요청 중 API 키가 바뀌었습니다. 새 키로 다시 확인하세요.');
      youtubeVerifiedAt=new Date().toISOString();await stores.connections.save('youtube',{apiKey:key,verifiedAt:youtubeVerifiedAt});return youtubeVerifiedAt;
    });
  }
  for(const job of jobs.values())if(['queued','running'].includes(job.status)){job.status='interrupted';job.message='브릿지가 종료되었습니다. 외부 작업 상태를 확인한 후 새로 실행하세요.';await stores.jobs.save(job.id,job);}
  const endpoint=engine=>engine==='yue2'?'http://127.0.0.1:8791/mcp':'https://api.suno.com/mcp';
  const client=engine=>{if(!mcp.has(engine))mcp.set(engine,new MCPClient(endpoint(engine),{token:engine==='suno'?sunoSecret.token||'':''}));return mcp.get(engine);};
  async function setYuEWindow(show){
    const script=join(here,'..','2026-11-05-PlayL-yue2-window-v0.8.0.ps1');
    return new Promise(resolve=>execFile('pwsh.exe',['-NoProfile','-NonInteractive','-File',script,...(show?['-Show']:[])],{windowsHide:true,timeout:10000},error=>resolve(!error)));
  }
  async function connectYuE2(){
    const available=await new Promise(resolve=>{
      const socket=createConnection({host:'127.0.0.1',port:8791});
      socket.setTimeout(800);
      const done=value=>{socket.destroy();resolve(value);};
      socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.once('timeout',()=>done(false));
    });
    if(available)return;
    const script=join(here,'..','2026-11-04-YuE2-workspace-start-v0.1.0.ps1');
    await new Promise((ok,fail)=>execFile('pwsh.exe',['-NoProfile','-NonInteractive','-File',script],{windowsHide:true,timeout:15000},(error,stdout,stderr)=>error?fail(new Error(stderr.trim()||'프로젝트용 YuE2를 실행할 수 없습니다.')):ok()));
    mcp.delete('yue2');
    for(let attempt=0;attempt<50;attempt++){
      try{await client('yue2').tools();return;}catch(error){if(error.cause?.code!=='ECONNREFUSED')throw error;}
      await delay(500);
    }
    throw new Error('YuE2 연결 준비 시간이 초과되었습니다. 잠시 뒤 다시 시도하세요.');
  }
  const saveJob=async job=>{job.updatedAt=new Date().toISOString();await stores.jobs.save(job.id,job);};
  const assetFor=id=>{if(!validId(id))throw new Error('Invalid asset ID');const a=assets.get(id);if(!a)throw new Error('파일을 찾을 수 없습니다.');return a;};
  const addAsset=async a=>{a.id=randomUUID();assets.set(a.id,a);await stores.assets.save(a.id,a);return a;};
  const publicAsset=a=>{const {path,...safe}=a;return safe;};
  const publicJob=job=>({...job,result:job.result?.path?{...job.result,path:undefined}:job.result});

  async function pump(){
    if(processing)return;processing=true;
    try{while(true){
      const job=[...jobs.values()].find(j=>j.status==='queued');if(!job)break;
      const controller=new AbortController();controllers.set(job.id,controller);job.status='running';await saveJob(job);
      try{
        if(job.kind==='plan'){
          const p=job.input.project;
          job.result=await routeAI(p.settings?.order||['codex','claude'],provider=>planGenerator(provider,p,{cwd:join(dataDir,'cli-work'),signal:controller.signal}),{fallback:p.settings?.fallback!==false});
        }else if(job.kind==='channel-insight'){
          const p=job.input.project;
          job.result=await routeAI(p.settings?.order||['codex','claude'],provider=>channelGenerator(provider,p,{cwd:join(dataDir,'cli-work'),signal:controller.signal}),{fallback:p.settings?.fallback!==false});
          job.result.sourceSnapshotId=p.referenceAnalysis.snapshotId;
        }else if(job.kind==='silence')job.result=await detectSilence(assetFor(job.input.audioId).path,{signal:controller.signal});
        else if(job.kind==='render'){
          const p=job.input.project;
          const list=p.tracks.filter(t=>t.audioId).map(t=>{
            if(!t.imageId)throw new Error(`「${t.title}」의 이미지를 선택하세요.`);
            const a=assetFor(t.audioId),img=assetFor(t.imageId);
            if(a.kind!=='audio'||img.kind!=='image')throw new Error('음원·이미지 파일 종류를 확인하세요.');
            return {...t,audioPath:a.path,imagePath:img.path};
          });
          const result=await renderPlaylist(list,join(dataDir,'exports',job.id),{signal:controller.signal,normalize:p.normalize!==false,onProgress:progress=>{job.progress=progress;}});
          const a=await addAsset({name:basename(result.path),kind:'video',path:result.path,duration:result.duration,size:(await stat(result.path)).size});
          job.result={assetId:a.id,timestamps:result.timestamps,duration:result.duration};
        }else if(job.kind==='capcut'){
          const p=job.input.project;
          const tracks=p.tracks.map(t=>{
            if(!t.audioId||!t.imageId)throw new Error('모든 곡에 음원과 이미지를 지정하세요.');
            const audio=assetFor(t.audioId),image=assetFor(t.imageId);
            if(audio.kind!=='audio'||image.kind!=='image')throw new Error('음원·이미지 파일 종류를 확인하세요.');
            return {...t,audioPath:audio.path,imagePath:image.path};
          });
          const result=await createCapCutProject(p,tracks,join(dataDir,'exports',job.id),{signal:controller.signal,onProgress:progress=>{job.progress=progress;}});
          const asset=await addAsset({name:basename(result.path),kind:'archive',path:result.path,size:(await stat(result.path)).size});
          job.result={assetId:asset.id,folder:result.folder,draftId:result.draftId,duration:result.duration,timestamps:result.timestamps,nativeOpenVerified:false,registration:'not-registered'};
        }else if(job.kind==='image'){
          const t=job.input.track;
          const folder=join(dataDir,'exports',job.id);await mkdir(folder,{recursive:true});
          const image=await imageGenerator(t,{cwd:folder,runtimeDir:join(dataDir,'cli-runtime'),signal:controller.signal});
          if(!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('유효한 PNG 이미지가 반환되지 않았습니다.');
          const path=join(folder,'2026-11-05-generated-image.png');
          await writeFile(path,image,{flag:'wx'});
          const asset=await addAsset({name:t.title+' · 생성 이미지.png',kind:'image',path,size:image.length});
          job.result={assetId:asset.id};
        }else if(job.kind==='music'){
          const {engine,tool,args}=job.input;
          const tools=musicTools(engine,await client(engine).tools());
          const definition=tools.find(t=>t.name===tool);
          if(!job.recoverOnly){if(!definition)throw new Error('지원하는 생성 도구를 확인할 수 없습니다. 연결 화면에서 다시 확인하세요.');validateToolArgs(definition.inputSchema,args);}
          if(engine==='yue2'){
            const models=unpackMCP(await client(engine).call('models_status',{}));
            assertWorkspacePath(await realpath(models.data_directory),workspaceRoot);
            if(!job.recoverOnly&&(!models.ready||!models.engine_ready))throw new Error('YuE2 모델·엔진이 준비되지 않았습니다.');
          }
          // Mark before submitting; never automatically repeat a possibly charged call.
          let created;
          if(job.recoverOnly){created={structuredContent:{id:job.externalId}};}
          else{job.submittedAt=new Date().toISOString();await saveJob(job);created=await client(engine).call(tool,args,{signal:controller.signal});job.result=created;}
          if(engine==='yue2'){
            const initial=unpackMCP(created);job.externalId=initial.id||initial.job_id;await saveJob(job);
            const completed=await completeYuEGeneration(client(engine),initial,{workspaceRoot,signal:controller.signal,onProgress:async state=>{job.musicStatus={status:state.status,phase:state.phase,message:state.message};await saveJob(job);}});
            const songs=[];
            for(const song of completed.songs){
              const audioPath=assertWorkspacePath(await realpath(song.audioPath),workspaceRoot);
              await checkMediaSignature(audioPath,'audio');const info=await probe(audioPath);
              let audio=[...assets.values()].find(a=>a.path===audioPath);
              if(!audio)audio=await addAsset({name:song.title+'.flac',kind:'audio',path:audioPath,duration:info.duration,size:(await stat(audioPath)).size});
              let imageId;
              if(song.coverPath){
                try{const path=assertWorkspacePath(await realpath(song.coverPath),workspaceRoot);await checkMediaSignature(path,'image');const image=await addAsset({name:song.title+'-cover.jpg',kind:'image',path,size:(await stat(path)).size});imageId=image.id;}
                catch{/* A missing optional cover does not discard a completed audio take. */}
              }
              songs.push({songId:song.songId,title:song.title,audioId:audio.id,imageId,duration:info.duration});
            }
            job.result={engine,externalId:completed.externalId,state:'completed',songs};
          }
        }else throw new Error('Unknown job');
        job.status=controller.signal.aborted?(job.kind==='music'?'unknown':'cancelled'):'complete';
      }catch(e){job.status=job.kind==='music'&&job.submittedAt?'unknown':controller.signal.aborted?'cancelled':'error';job.message=safeError(e);if(e.attempts)job.attempts=e.attempts;}
      finally{await saveJob(job);controllers.delete(job.id);}
    }}finally{processing=false;}
  }

  let server;
  const app={url:'',token,async listen(){await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});app.url=`http://127.0.0.1:${server.address().port}`;return app;},async close(){for(const c of controllers.values())c.abort();server.closeIdleConnections();await new Promise(r=>server.close(r));}};
  const pairedOrigins=new Map();
  let approvalPending=false,lastApproval=0;
  const officialOrigin=typeof webOrigin==='string'&&/^https:\/\/[^/?#]+$/.test(webOrigin)?webOrigin:null;
  function allowed(origin){return origin===app.url||origin===officialOrigin||settings.allowedOrigins.includes(origin);}
  function authorized(req){const origin=req.headers.origin;
    const originToken=origin&&origin!==app.url?pairedOrigins.get(origin):null;
    const a=Buffer.from(req.headers.authorization||'');
    return [token,originToken].filter(Boolean).some(value=>{const b=Buffer.from('Bearer '+value);return a.length===b.length&&timingSafeEqual(a,b);});}
  function signTicket(id,expires){return createHmac('sha256',token).update(`${id}:${expires}`).digest('base64url');}
  function ticketOK(u){const id=u.pathname.split('/')[3],expires=u.searchParams.get('expires'),sig=u.searchParams.get('ticket');if(!id||!expires||!sig||Number(expires)<Date.now()||Number(expires)>Date.now()+310000)return false;const a=Buffer.from(sig),b=Buffer.from(signTicket(id,expires));return a.length===b.length&&timingSafeEqual(a,b);}

  async function sendFile(req,res,path,type,download=false){
    const info=await stat(path);let start=0,end=info.size-1,status=200;
    const range=req.headers.range;
    if(range){const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}status=206;
    }
    const headers={'Content-Type':type||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
    if(download)headers['Content-Disposition']="attachment; filename*=UTF-8''"+encodeURIComponent(basename(path));
    res.writeHead(status,headers);if(req.method==='HEAD')res.end();else await pipeline(createReadStream(path,{start,end}),res);
  }

  // OAuth endpoints must remain on the actual Suno domains from server metadata.
  function sunoURL(value){const u=new URL(value);if(u.protocol!=='https:'||!(u.hostname==='suno.com'||u.hostname.endsWith('.suno.com'))||u.username||u.password)throw new Error('Suno 인증 주소를 확인할 수 없습니다.');return u.href;}
  async function remoteJSON(url,options={}){const r=await fetch(sunoURL(url),{...options,signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok)throw new Error(`Suno 인증 HTTP ${r.status}`);return r.json();}

  server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{
      if(req.headers.host!==new URL(app.url).host){json(res,403,{error:'Invalid Host'});return;}
      const origin=req.headers.origin;
      if(origin&&!allowed(origin)){json(res,403,{error:'허용되지 않은 웹앱 주소입니다. 로컬 설정에서 주소를 등록하세요.'});return;}
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','Content-Length, Content-Range');}
      if(req.method==='OPTIONS'){
        if(!origin){json(res,403,{error:'Origin required'});return;}
        res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-File-Name, X-Idempotency-Key, X-PlayL-Local','Access-Control-Allow-Private-Network':'true'});res.end();return;
      }
      const u=new URL(req.url,app.url),route=u.pathname;
      if(route==='/oauth/suno/callback'){
        const state=u.searchParams.get('state'),pending=pendingOAuth.get(state);pendingOAuth.delete(state);
        if(!pending||Date.now()-pending.created>600000||u.searchParams.get('error'))throw new Error('Suno 인증이 취소되었거나 만료되었습니다.');
        const payload=await remoteJSON(pending.metadata.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:u.searchParams.get('code')||'',redirect_uri:app.url+'/oauth/suno/callback',client_id:pending.clientId,code_verifier:pending.verifier})});
        if(!payload.access_token)throw new Error('Suno 인증 토큰을 받지 못했습니다.');
        sunoSecret={token:payload.access_token,refreshToken:payload.refresh_token||'',tokenEndpoint:pending.metadata.token_endpoint,clientId:pending.clientId,expiresAt:payload.expires_in?Date.now()+payload.expires_in*1000:null};
        await stores.connections.save('suno',sunoSecret);mcp.delete('suno');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<p>Suno 연결 정보를 저장했습니다. PlayL로 돌아가 연결 확인을 누르세요.</p>');return;
      }
      if(route==='/api/local-pair'){
        // This header forces cross-origin sites to preflight; only local same-origin may receive a token.
        if(req.headers['x-playl-local']!=='1'||(origin&&origin!==app.url)||req.headers['sec-fetch-site']!=='same-origin'){json(res,403,{error:'로컬 화면에서만 연결할 수 있습니다.'});return;}
        json(res,200,{token});return;
      }
      if(route==='/api/web-pair'&&req.method==='POST'){
        if(!origin||origin===app.url||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{error:'허용된 PlayL 웹앱에서 연결하세요.'});return;}
        const {nonce}=await body(req,2048);
        if(typeof nonce!=='string'||!/^[0-9a-f]{64}$/.test(nonce)){json(res,400,{error:'잘못된 연결 요청입니다.'});return;}
        if(approvalPending||Date.now()-lastApproval<2000){json(res,429,{error:'이전 연결 요청을 확인한 뒤 다시 시도하세요.'});return;}
        approvalPending=true;lastApproval=Date.now();
        try{
          if(!await approveOrigin(origin)){json(res,403,{error:'PC에서 연결 승인이 취소되었거나 만료되었습니다.'});return;}
          if(res.destroyed||!allowed(origin))return;
          const session=pairedOrigins.get(origin)||randomBytes(32).toString('base64url');
          pairedOrigins.set(origin,session);
          json(res,200,{token:session,nonce});return;
        }finally{approvalPending=false;}
      }
      if(route.startsWith('/api/')){
        if(!authorized(req)&&!(/^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(route)&&['GET','HEAD'].includes(req.method)&&ticketOK(u))){json(res,401,{error:'브릿지 연결 코드가 필요합니다.'});return;}
        if(route==='/api/projects'&&req.method==='GET'){json(res,200,[...projects.values()]);return;}
        if(route==='/api/youtube/config'&&req.method==='GET'){json(res,200,{configured:!!youtubeKey,...(youtubeVerifiedAt?{verifiedAt:youtubeVerifiedAt}:{})});return;}
        if(route==='/api/youtube/config'&&req.method==='POST'){
          const {apiKey}=await body(req);if(typeof apiKey!=='string'||(apiKey!==''&&!/^[a-zA-Z0-9_-]{20,200}$/.test(apiKey)))throw new Error('YouTube API 키 형식을 확인하세요.');
          await serializeProject('youtube-connection',async()=>{await stores.connections.save('youtube',{apiKey});youtubeKey=apiKey;youtubeVerifiedAt=null;});json(res,200,{configured:!!youtubeKey});return;
        }
        if(route==='/api/setup'&&req.method==='GET'){json(res,200,await inspectSetup(workspaceRoot));return;}
        if(route==='/api/youtube/check'&&req.method==='POST'){const key=youtubeKey;await verifyYouTubeKey({apiKey:key,fetchImpl:youtubeFetch});const verifiedAt=await markYoutubeVerified(key);json(res,200,{configured:true,verifiedAt});return;}
        if(route==='/api/youtube/search'&&req.method==='POST'){const input=await body(req),key=youtubeKey,result=await searchChannels(input.query,{apiKey:key,fetchImpl:youtubeFetch,pageToken:input.pageToken});await markYoutubeVerified(key);json(res,200,result);return;}
        if(route==='/api/youtube/preview'&&req.method==='POST'){
          const {channelId}=await body(req,4096);
          const videos=await previewChannel(channelId,{apiKey:youtubeKey,fetchImpl:youtubeFetch});
          json(res,200,{videos});return;
        }
        if(route==='/api/youtube/collect'&&req.method==='POST'){const input=await body(req),key=youtubeKey,result=await collectChannel(input.reference,{limit:input.limit,apiKey:key,fetchImpl:youtubeFetch});await markYoutubeVerified(key);json(res,200,result);return;}
        if(route.startsWith('/api/projects/')&&req.method==='GET'){const p=projects.get(route.split('/')[3]);json(res,p?200:404,p||{error:'프로젝트를 찾을 수 없습니다.'});return;}
        if(route==='/api/projects'&&req.method==='POST'){
          const p=validateProject(await body(req));
          const id=p.id||randomUUID();if(!validId(id))throw new Error('Invalid project ID');
          await serializeProject(id,async()=>{
            const previous=projects.get(id);
            if(previous && p.revision!==previous.revision){json(res,409,{error:'다른 화면에서 프로젝트가 변경되었습니다. 새로 불러온 뒤 저장하세요.'});return;}
            const saved={...p,id,revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString()};
            await stores.projects.save(id,saved);projects.set(id,saved);json(res,201,saved);
          });return;
        }
        if(route==='/api/assets'&&req.method==='GET'){json(res,200,[...assets.values()].map(publicAsset));return;}
        if(route==='/api/assets'&&req.method==='POST'){
          const name=decodeURIComponent(req.headers['x-file-name']||'file');
          const ext=extname(name).toLowerCase(),kind=['.mp3','.wav','.flac','.m4a','.ogg'].includes(ext)?'audio':['.png','.jpg','.jpeg','.webp'].includes(ext)?'image':null;
          if(!kind)throw new Error('지원 파일: MP3/WAV/FLAC/M4A/OGG, PNG/JPG/WebP');
          const dir=join(dataDir,'media');await mkdir(dir,{recursive:true});
          const path=join(dir,`2026-11-04-import-${randomUUID()}${ext}`);let bytes=0;
          const limit=new Transform({transform(chunk,enc,callback){bytes+=chunk.length;callback(bytes>1024*1024*1024?new Error('파일 최대 크기는 1GB입니다.'):null,chunk);}});
          await pipeline(req,limit,createWriteStream(path,{flags:'wx',mode:0o600}));
          await checkMediaSignature(path,kind);
          const info=await probe(path);if(!info.streams.some(s=>s.codec_type===(kind==='image'?'video':'audio')))throw new Error('파일의 실제 형식이 올바르지 않습니다.');
          const a=await addAsset({name:basename(name).slice(0,200),path,kind,size:bytes,duration:info.duration});json(res,201,publicAsset(a));return;
        }
        if(/^\/api\/assets\/[^/]+\/ticket$/.test(route)&&req.method==='POST'){
          const a=assetFor(route.split('/')[3]),expires=Date.now()+300000;
          json(res,200,{url:`${app.url}/api/assets/${a.id}?expires=${expires}&ticket=${signTicket(a.id,expires)}`});return;
        }
        if(route.startsWith('/api/assets/')&&['GET','HEAD'].includes(req.method)){
          const id=decodeURIComponent(route.split('/')[3]);const a=assetFor(id);await sendFile(req,res,a.path,mime[extname(a.path)],u.searchParams.has('download'));return;
        }
        if(route==='/api/settings'&&req.method==='GET'){json(res,200,{...settings,version:'0.6.1'});return;}
        if(route==='/api/settings'&&req.method==='POST'){
          if(origin&&origin!==app.url){json(res,403,{error:'웹앱 허용 주소는 로컬 화면에서만 변경할 수 있습니다.'});return;}
          if(origin&&origin!==app.url){json(res,403,{error:'웹앱 허용 주소는 로컬 브릿지 설정에서만 변경할 수 있습니다.'});return;}
          const s=await body(req);if(!Array.isArray(s.allowedOrigins)||s.allowedOrigins.length>10)throw new Error('허용 주소는 최대 10개입니다.');
          const origins=s.allowedOrigins.map(value=>{const x=new URL(value);if(x.protocol!=='https:'||x.origin!==value)throw new Error('HTTPS 웹앱의 정확한 origin을 입력하세요.');return x.origin;});
          settings={allowedOrigins:[...new Set(origins)]};await stores.settings.save('settings',settings);json(res,200,settings);return;
        }
        if(route==='/api/status'&&req.method==='GET'){json(res,200,{version:'0.8.2',cli:await cliStatus({runtimeDir:join(dataDir,'cli-runtime')}),suno:{hasCredential:!!sunoSecret.token},yue2:{endpoint:endpoint('yue2')},jobs:[...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length});return;}
        if(route==='/api/yue2/prepare'&&req.method==='POST'){
          await serializeProject('yue2-prepare',async()=>{
            const script=join(here,'..','2026-11-04-prepare-yue2-workspace-v0.2.0.ps1');
            await new Promise((ok,fail)=>execFile('pwsh.exe',['-NoProfile','-NonInteractive','-File',script],{windowsHide:true,timeout:600000},(error,_stdout,stderr)=>error?fail(new Error(stderr.trim()||'YuE2 작업 복사본을 준비할 수 없습니다.')):ok()));
          });
          json(res,200,{prepared:true});return;
        }
        if(route==='/api/yue2/show'&&req.method==='POST'){
          if(!await setYuEWindow(true))throw new Error('PlayL에서 프로젝트용 YuE2를 먼저 실행하세요.');
          await client('yue2').call('ui_open_settings',{section:'models'},{signal:AbortSignal.timeout(3500)}).catch(()=>{});
          json(res,200,{visible:true});return;
        }
        if(route==='/api/music/connect'&&req.method==='POST'){
          const {engine,probeOnly}=await body(req);if(!['suno','yue2'].includes(engine))throw new Error('Invalid engine');
          if(probeOnly===true&&engine==='suno'&&!sunoSecret.token){
            json(res,200,{connected:false,note:'Suno 로그인 후 연결을 확인하세요.'});return;
          }
          if(engine==='yue2'&&probeOnly!==true)await serializeProject('yue2-start',connectYuE2);
          const connection=probeOnly===true?new MCPClient(endpoint(engine),{token:engine==='suno'?sunoSecret.token:''}):client(engine);
          let tools;
          try{tools=await connection.tools();}
          catch(error){
            if(probeOnly!==true)throw error;
            json(res,200,{connected:false,note:engine==='yue2'?'YuE2 응답이 없습니다. 실행 및 연결을 눌러주세요.':'Suno 연결을 다시 확인하세요.'});return;
          }const generation=musicTools(engine,tools);
          const statusTool=tools.find(t=>t.name==='studio_status');
          const status=engine==='yue2'&&statusTool?await connection.call('studio_status',{}):null;
          const models=engine==='yue2'&&tools.some(t=>t.name==='models_status')?await connection.call('models_status',{}):null;
          const modelData=models?.structuredContent;
          let storageInWorkspace=null;if(modelData?.data_directory){try{assertWorkspacePath(await realpath(modelData.data_directory),workspaceRoot);storageInWorkspace=true;}catch{storageInWorkspace=false;}}
          if(engine==='yue2'&&storageInWorkspace===true&&tools.some(t=>t.name==='ui_read_page')){
            const page=await connection.call('ui_read_page',{}, {signal:AbortSignal.timeout(3500)}).catch(()=>null);
            const text=page?.content?.filter(item=>item.type==='text').map(item=>item.text).join('\n')||'';
            const range=text.match(/input range "Max duration" value=[^\n]*?range=([0-9]+)\.\.([0-9]+)/i);
            if(range)yueMaxSeconds=Number(range[2]);
          }
          const windowHidden=engine==='yue2'&&probeOnly!==true&&storageInWorkspace===true?await setYuEWindow(false):null;
          json(res,200,{connected:true,toolCount:tools.length,generationTools:generation,status,windowHidden,maxDurationSeconds:engine==='yue2'?yueMaxSeconds:null,modelReady:modelData?.ready??null,profile:modelData?.selected_profile_id??null,storageInWorkspace,note:generation.length?'':'현재 버전의 생성 도구 이름을 지원 목록과 대조해야 합니다. 생성은 비활성화됩니다.'});return;
        }
        if(route==='/api/music/suno/oauth'&&req.method==='POST'){
          const resource=await remoteJSON('https://api.suno.com/.well-known/oauth-protected-resource/mcp');
          const issuer=sunoURL(resource.authorization_servers?.[0]);
          const base=new URL(issuer),discovery=new URL('/.well-known/oauth-authorization-server'+(base.pathname==='/'?'':base.pathname),base.origin);
          let metadata;try{metadata=await remoteJSON(discovery.href);}catch{metadata=await remoteJSON(issuer.replace(/\/$/,'')+'/.well-known/oauth-authorization-server');}
          for(const key of ['registration_endpoint','authorization_endpoint','token_endpoint'])sunoURL(metadata[key]);
          const registered=await remoteJSON(metadata.registration_endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'PlayL Local Bridge',redirect_uris:[app.url+'/oauth/suno/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
          if(!registered.client_id)throw new Error('Suno OAuth 클라이언트 등록을 지원하지 않습니다.');
          const verifier=randomBytes(48).toString('base64url'),state=randomBytes(24).toString('base64url');
          const {createHash}=await import('node:crypto');const challenge=createHash('sha256').update(verifier).digest('base64url');
          pendingOAuth.set(state,{created:Date.now(),metadata,clientId:registered.client_id,verifier});
          const scopes=['api:v0','credits:spend','download','offline_access','profile:read'].filter(s=>(resource.scopes_supported||[]).includes(s));
          const auth=new URL(metadata.authorization_endpoint);Object.entries({client_id:registered.client_id,redirect_uri:app.url+'/oauth/suno/callback',response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state,resource:endpoint('suno'),scope:scopes.join(' ')}).forEach(([k,v])=>{if(v)auth.searchParams.set(k,v);});
          json(res,200,{url:auth.href});return;
        }
        if(/^\/api\/jobs\/[^/]+\/open-capcut$/.test(route)&&req.method==='POST'){
          const job=jobs.get(route.split('/')[3]);
          if(job?.kind!=='capcut'||job.status!=='complete')throw new Error('완료된 CapCut 초안을 먼저 만드세요.');
          const result=await serializeProject('capcut-registration',()=>openCapCutDraft(job.result,{dataDir}));
          json(res,200,result);return;
        }
        if(/^\/api\/jobs\/[^/]+\/history$/.test(route)&&req.method==='POST'){
          const job=jobs.get(route.split('/')[3]);
          if(!job||['queued','running'].includes(job.status))throw new Error('종료된 작업만 목록에서 삭제할 수 있습니다.');
          const {hidden}=await body(req);if(typeof hidden!=='boolean')throw new Error('잘못된 기록 상태입니다.');
          job.historyHidden=hidden;await saveJob(job);json(res,200,publicJob(job));return;
        }
        if(route==='/api/jobs'&&req.method==='GET'){json(res,200,[...jobs.values()].map(publicJob).reverse());return;}
        if(route==='/api/jobs'&&req.method==='POST'){
          const input=await body(req),key=req.headers['x-idempotency-key'];
          if(!['plan','channel-insight','silence','render','capcut','music','image'].includes(input.kind))throw new Error('Invalid job kind');
          if(!key||!/^[a-zA-Z0-9_-]{1,100}$/.test(key))throw new Error('중복 실행 방지 키가 필요합니다.');
          const existing=[...jobs.values()].find(j=>j.key===key);if(existing){json(res,200,publicJob(existing));return;}
          if(['plan','render','capcut','channel-insight'].includes(input.kind))validateProject(input.project);
          if(input.kind==='channel-insight'&&(!input.project.referenceAnalysis?.snapshotId||!input.project.referenceAnalysis?.videos?.length))throw new Error('참고 채널 데이터를 먼저 수집하세요.');
          if(input.kind==='silence')assetFor(input.audioId);
          if(['music','silence'].includes(input.kind)&&!projects.get(input.projectId)?.tracks.some(t=>t.id===input.trackId))throw new Error('현재 프로젝트의 곡을 선택하세요.');
          if(input.kind==='image'){
            const track=projects.get(input.projectId)?.tracks.find(t=>t.id===input.trackId);
            if(!track)throw new Error('현재 프로젝트의 곡을 선택하세요.');
            input.track={title:track.title,style:track.style,lyrics:track.lyrics};
          }
          if(input.kind==='music'){
            if(!['suno','yue2'].includes(input.engine)||typeof input.tool!=='string'||input.confirm!==true)throw new Error('음악 생성 엔진과 실행 확인이 필요합니다.');
            if(input.engine==='yue2'&&yueMaxSeconds&&input.args?.duration_seconds>yueMaxSeconds)throw new Error(`YuE2 최대 생성 길이는 ${yueMaxSeconds}초입니다.`);
          }
          const active=[...jobs.values()].find(j=>['queued','running'].includes(j.status)&&j.kind===input.kind&&j.projectId===(input.project?.id||input.projectId)&&(!['music','silence','image'].includes(input.kind)||j.input.trackId===input.trackId));
          if(active){json(res,409,{error:input.trackId?'이 곡의 동일 작업이 이미 진행 중입니다.':'동일 종류의 작업이 이미 진행 중입니다.'});return;}
          const job={id:randomUUID(),key,kind:input.kind,projectId:input.project?.id||input.projectId||null,input,status:'queued',createdAt:new Date().toISOString()};
          jobs.set(job.id,job);await saveJob(job);json(res,202,publicJob(job));setImmediate(()=>pump().catch(()=>{}));return;
        }
        if(/^\/api\/jobs\/[^/]+\/cancel$/.test(route)&&req.method==='POST'){
          const job=jobs.get(route.split('/')[3]);if(!job){json(res,404,{error:'작업 없음'});return;}
          if(['queued','running'].includes(job.status)){controllers.get(job.id)?.abort();job.status=job.kind==='music'&&job.submittedAt?'unknown':'cancelled';job.message=job.kind==='music'?'외부 생성은 계속될 수 있습니다. 상태 확인 전 재생성하지 마세요.':'취소했습니다.';await saveJob(job);}
          json(res,200,publicJob(job));return;
        }
        if(/^\/api\/jobs\/[^/]+\/recover$/.test(route)&&req.method==='POST'){
          const job=jobs.get(route.split('/')[3]);
          if(!job||job.kind!=='music'||job.input.engine!=='yue2'||!job.externalId)throw new Error('복구할 YuE2 작업 ID가 없습니다. Studio에서 기존 작업을 확인하세요.');
          if(controllers.has(job.id)||['queued','running','complete'].includes(job.status)){json(res,409,{error:'현재 상태에서는 복구를 시작할 수 없습니다.'});return;}
          job.status='queued';job.recoverOnly=true;job.message='기존 생성 작업을 조회합니다. 새 음악은 생성하지 않습니다.';
          await saveJob(job);json(res,202,publicJob(job));setImmediate(()=>pump().catch(()=>{}));return;
        }
        json(res,404,{error:'Unknown API'});return;
      }
      if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return;}
      const staticFiles={'/og-image.png':'og-image.png','/2026-11-05-web-analytics.js':'2026-11-05-web-analytics.js','/2026-11-05-music-structure.js':'2026-11-05-music-structure.js','/2026-11-05-title-patterns.js':'2026-11-05-title-patterns.js','/2026-11-05-experience.js':'2026-11-05-experience.js','/2026-11-05-experience.css':'2026-11-05-experience.css','/2026-11-05-PlayL-bridge-v0.6.1.zip':'2026-11-05-PlayL-bridge-v0.6.1.zip','/2026-11-05-PlayL-bridge-v0.7.0.zip':'2026-11-05-PlayL-bridge-v0.7.0.zip','/2026-11-05-PlayL-bridge-v0.7.1.zip':'2026-11-05-PlayL-bridge-v0.7.1.zip','/2026-11-05-PlayL-bridge-v0.7.2.zip':'2026-11-05-PlayL-bridge-v0.7.2.zip','/2026-11-05-PlayL-bridge-v0.7.3.zip':'2026-11-05-PlayL-bridge-v0.7.3.zip','/2026-11-05-PlayL-bridge-v0.8.0.zip':'2026-11-05-PlayL-bridge-v0.8.0.zip','/2026-11-05-PlayL-bridge-v0.8.1.zip':'2026-11-05-PlayL-bridge-v0.8.1.zip','/2026-11-05-PlayL-bridge-v0.8.2.zip':'2026-11-05-PlayL-bridge-v0.8.2.zip','/2026-11-05-guide.html':'2026-11-05-guide.html','/2026-11-05-guide.css':'2026-11-05-guide.css','/':'index.html','/index.html':'index.html','/2026-11-04-app.js':'2026-11-04-app.js','/2026-11-04-state.js':'2026-11-04-state.js','/2026-11-04-workflow.js':'2026-11-04-workflow.js','/2026-11-04-style.css':'2026-11-04-style.css','/2026-11-04-tokens.css':'2026-11-04-tokens.css'};
      const file=staticFiles[route];if(!file){json(res,404,{error:'Not found'});return;}
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com; media-src 'self' blob:; connect-src 'self' http://127.0.0.1:43119; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      await sendFile(req,res,join(publicDir,file),mime[extname(file)]);
    }catch(e){if(!res.headersSent)json(res,e.status===401?401:400,{error:safeError(e)});else res.destroy();}
  });
  return app;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const app=await createBridge();await app.listen();
  console.log(`PlayL-v0.8.2 ${app.url}`);
  console.log('로컬 화면에서 자동 연결됩니다. 종료: Ctrl+C');
  const stop=()=>app.close().then(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
