import {productionCheck} from './2026-11-05-music-structure.js';
import {latestTask,taskActive,taskPanel,setupPanel} from './2026-11-05-experience.js';
import { acceptSaveResult,isCurrentResponse,canApplyProjectLoad } from './2026-11-04-state.js';
import {productionTracks,phases,workflowState,audioSignature,isExportCurrent,isCapCutCurrent,musicTracks,audioTracks,imageTracks,channelReport,channelInsight} from './2026-11-04-workflow.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
let base=sessionStorage.getItem('playl-base')||'http://127.0.0.1:43119';
let token=sessionStorage.getItem('playl-token')||'',connected=false,project=null,projects=[],assets=[],jobs=[],dirty=false,currentTab='analysis',engineState={},engineErrors={},engineChecking={};
const tickets=new Map(),appliedJobs=new Set();let noticeTimer,polling=false,actionLock=false;
let editVersion=0;const saves=new Map();
let statusSnapshot=null,youtubeConfigured=false,referenceBusy=false,searchProject=null,channelPage=null;
let youtubeKeyGeneration=0,projectLoadGeneration=0;
let youtubeVerifiedAt=null,editingYoutubeKey=false,setupInfo=null,pendingSubmission=null,referenceViewKey='';
let imageConfigured=false;
const renderedSlots=new Map();
function setHTML(id,html){if(renderedSlots.get(id)!==html){$(id).innerHTML=html;renderedSlots.set(id,html);}}
const statusLabels={queued:'대기',running:'실행 중',complete:'완료',error:'오류',unknown:'결과 확인 필요',cancelled:'취소',interrupted:'중단됨'};
const kindLabels={image:'배경 이미지 생성','channel-insight':'참고 채널 AI 분석',plan:'기획·가사',render:'MP4 직접 출력',capcut:'CapCut 프로젝트 생성',music:'음악 생성 요청',silence:'무음 분석'};
const duration=n=>{n=Math.max(0,Math.floor(n||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};

function notify(message,error=false){const el=$('#notice');clearTimeout(noticeTimer);el.textContent=message;el.classList.toggle('error',error);el.hidden=false;noticeTimer=setTimeout(()=>el.hidden=true,error?14000:6500);}
function markDirty(){dirty=true;editVersion++;$('#save-state').textContent='저장하지 않은 변경 사항';}
function setConnected(value){connected=value;if(!value){engineState={};imageConfigured=false;renderMusicEngine();renderProduction();}$('#bridge-dot').classList.toggle('online',value);$('#bridge-label').textContent=value?'로컬 브릿지 연결됨':'브릿지 연결 필요';const button=$('#connect-bridge');button.textContent=value?'연결됨':'브릿지 연결';button.disabled=value;}
function tab(name){
  name=name==='overview'?'analysis':name;if(!phases[name])return;currentTab=name;
  $$('.view').forEach(el=>el.hidden=el.id!=='view-'+name);
  $$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);if(b.dataset.tab===name)b.setAttribute('aria-current',Object.keys(phases).indexOf(name)<6?'step':'page');else b.removeAttribute('aria-current');});
  $('#step-title').textContent=phases[name].title;
  if(!['jobs','connections','setup'].includes(name))renderProject();if(name==='setup')renderSetup();if(name==='jobs')renderJobs();renderSummary();window.scrollTo({top:0,behavior:'instant'});
}

async function api(path,{method='GET',data,headers={},raw,timeout=35000}={}){
  const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{}),...headers},body:raw|| (data?JSON.stringify(data):undefined),signal:AbortSignal.timeout(timeout)});
  let value;try{value=await r.json();}catch{throw new Error('브릿지 응답을 읽을 수 없습니다.');}
  if(!r.ok)throw new Error(value.error||`HTTP ${r.status}`);return value;
}
async function assetURL(id){if(tickets.has(id)&&tickets.get(id).expires>Date.now())return tickets.get(id).url;const value=await api(`/api/assets/${id}/ticket`,{method:'POST',data:{}});tickets.set(id,{url:value.url,expires:Date.now()+240000});return value.url;}
async function attachMedia(){
  for(const el of $$('[data-asset-preview]:not([data-preview-loading])')){
    el.dataset.previewLoading='1';
    const id=el.dataset.assetPreview;
    try{
      const url=await assetURL(id);if(!el.isConnected)continue;
      let lastRefresh=0,wantsPlay=false;
      if(el.tagName==='AUDIO'){
        el.addEventListener('play',()=>{wantsPlay=true;});
        el.addEventListener('pause',()=>{if(!el.error)wantsPlay=false;});
      }
      el.addEventListener('error',async()=>{
        if(Date.now()-lastRefresh<10000)return;lastRefresh=Date.now();
        const position=el.currentTime||0,resume=wantsPlay;
        try{
          tickets.delete(id);const fresh=await assetURL(id);if(!el.isConnected)return;
          if(el.tagName==='AUDIO')el.addEventListener('loadedmetadata',()=>{el.currentTime=position;if(resume)el.play().catch(()=>notify('재생 버튼을 다시 눌러주세요.'));},{once:true});
          el.src=fresh;if(el.tagName==='AUDIO')el.load();
        }catch{notify('미디어 연결을 갱신하지 못했습니다. 브릿지 상태를 확인하세요.',true);}
      });
      el.src=url;
    }catch{delete el.dataset.previewLoading;if(el.isConnected)el.title='미리듣기 연결 실패';}
  }
}

async function connectFromWeb(manual=false){
  if(manual||location.origin===base){await connect({restore:true});return;}
  const button=$('#connect-bridge');
  button.disabled=true;button.textContent='PC 승인 대기 중…';
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  try{
    location.href='playl-bridge:connect';
    let response;
    for(let attempt=0;attempt<8;attempt++){
      try{
        response=await fetch(base+'/api/web-pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce}),signal:AbortSignal.timeout(70000)});
        break;
      }catch(error){
        if(error.name==='TimeoutError')throw new Error('PC의 승인 창을 확인한 뒤 다시 연결하세요.');
        if(attempt===7)throw new Error('브릿지 연결 앱을 설치하고 다시 연결하세요. 브라우저의 로컬 네트워크 접근도 허용되어 있어야 합니다.');
        await new Promise(resolve=>setTimeout(resolve,700));
      }
    }
    const result=await response.json();
    if(!response.ok||result.nonce!==nonce||!result.token)throw new Error(result.error||'브릿지 승인을 확인할 수 없습니다.');
    token=result.token;$('#bridge-token').value=token;
    await connect({restore:true});
  }finally{button.disabled=connected;button.textContent=connected?'연결됨':'브릿지 연결';}
}
async function connect({restore=false}={}){
  const initialEditVersion=editVersion,initialLoadGeneration=projectLoadGeneration;
  const candidate=$('#bridge-url').value.trim().replace(/\/$/,'');
  if(candidate!=='http://127.0.0.1:43119')throw new Error('현재 버전의 브릿지 주소는 http://127.0.0.1:43119 입니다.');
  base=candidate;token=$('#bridge-token').value.trim()||token;
  if(location.origin===base){
    const r=await fetch(base+'/api/local-pair',{headers:{'X-PlayL-Local':'1'}});if(r.ok)token=(await r.json()).token;
  }
  if(!token)throw new Error('로컬 브릿지를 실행한 뒤 연결 코드를 입력하세요.');
  await api('/api/settings');setConnected(true);
  sessionStorage.setItem('playl-base',base);sessionStorage.setItem('playl-token',token);$('#bridge-token').value=token;
  [projects,assets,jobs]=await Promise.all([api('/api/projects'),api('/api/assets'),api('/api/jobs')]);
  if(restore&&!dirty&&initialEditVersion===editVersion&&initialLoadGeneration===projectLoadGeneration){
    const last=lastProjectId();
    if(projects.some(item=>item.id===last))await loadProject(last).catch(()=>{});
  }
  renderProjects();renderJobs();renderProject();
  const settings=await api('/api/settings');$('#origins-list').textContent=settings.allowedOrigins.length?'허용된 웹앱: '+settings.allowedOrigins.join(', '):'등록된 외부 웹앱 없음';
  const keyGeneration=youtubeKeyGeneration,yt=await api('/api/youtube/config');if(isCurrentResponse(keyGeneration,youtubeKeyGeneration)){youtubeConfigured=yt.configured;youtubeVerifiedAt=yt.verifiedAt||null;}renderReference();renderSummary();
  await refreshStatus();await refreshSetup();
}
async function refreshStatus(){
  $('#cli-status').innerHTML='<div class="panel muted">설치·로그인 상태를 확인하고 있습니다…</div>';
  const s=await api('/api/status',{timeout:60000});statusSnapshot=s;imageConfigured=s.cli.codex.authenticated===true;renderProduction();renderSummary();if(currentTab==='images')attachMedia();
  $('#cli-status').innerHTML=['codex','claude'].map((name,i)=>{const c=s.cli[name];return `<article class="panel status-card"><span class="status-icon">${i?'C':'G'}</span><div><h3>${i?'Claude CLI':'GPT · Codex CLI'}</h3><p class="muted">${esc(c.message)}</p><span class="badge">${!c.installed?'미설치':c.authenticated?'로그인 확인':'로그인 필요'}</span></div></article>`;}).join('');
}
function lastProjectId(){
  try{return localStorage.getItem('playl-last-project');}catch{return null;}
}
function rememberProject(id){
  try{localStorage.setItem('playl-last-project',id);}catch{}
}
async function loadProject(id){
  const request={generation:++projectLoadGeneration,editVersion};
  const loaded=await api('/api/projects/'+encodeURIComponent(id));
  if(!canApplyProjectLoad(request,{generation:projectLoadGeneration,editVersion}))return;
  project=loaded;editVersion++;dirty=false;
  project.settings??={order:['codex','claude'],fallback:true,models:{}};
  project.tracks.forEach(t=>t.id??=uid());
  rememberProject(project.id);
  renderProjects();renderProject();renderJobs();
  checkEngine(project.engine||'suno',{probeOnly:true}).catch(()=>{});
}
function renderProjects(){const select=$('#project-select');select.innerHTML='<option value="">저장한 작업 불러오기</option>'+projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');select.value=projects.some(p=>p.id===project?.id)?project.id:'';}
function requireProject(){if(!project)project=createDraft();return project;}
function createDraft(){
  return {id:uid(),name:'이름 없는 플레이리스트',genre:'어쿠스틱 팝',mood:'따뜻하고 차분한',language:'한국어',count:5,brief:'',engine:'suno',normalize:true,referenceLimit:20,tracks:[],settings:{order:['codex','claude'],fallback:true,models:{codex:'',claude:''}}};
}
function newProject(){
  if(dirty&&!confirm('저장하지 않은 변경 사항이 있습니다. 새 작업을 시작할까요?'))return;
  project=createDraft();dirty=false;editVersion++;
  renderProjects();renderProject();tab('analysis');$('#project-settings').open=false;$('#reference-input').focus();notify('채널 주소를 입력하거나 바로 곡을 기획하세요.');
}
async function saveProject(source=requireProject()){
  if(saves.has(source.id))throw new Error('이 프로젝트를 저장하고 있습니다. 완료 후 다시 실행하세요.');
  const request={projectId:source.id,editVersion},snapshot=structuredClone(source);
  const pending=api('/api/projects',{method:'POST',data:snapshot});saves.set(source.id,pending);
  try{
    const saved=await pending;
    const reconciled=acceptSaveResult({project,editVersion,dirty},request,saved);project=reconciled.project;dirty=reconciled.dirty;
    projects=projects.filter(p=>p.id!==saved.id);projects.push(saved);
    if(project?.id===saved.id)rememberProject(saved.id);
    renderProjects();
    // Never rebuild active inputs after an older save response: keep focus and in-progress text.
    $('#save-state').textContent=dirty?'저장하지 않은 변경 사항':'저장됨 · revision '+project.revision;
    notify(dirty?'저장 요청 당시 내용은 보존했습니다. 이후 변경 사항도 저장해 주세요.':'프로젝트를 새 스냅샷으로 저장했습니다.');return saved;
  }finally{saves.delete(source.id);}
}
const assetOptions=(kind,current)=>`<option value="">파일 선택</option>`+assets.filter(a=>a.kind===kind).map(a=>`<option value="${esc(a.id)}" ${a.id===current?'selected':''}>${esc(a.name)}${a.duration?' · '+duration(a.duration):''}</option>`).join('');
const trackTitle=(t,i)=>`<span class="track-number">곡 ${String(i+1).padStart(2,'0')}</span>${esc(t.title||'제목 없는 곡')}`;

function renderProject(){
  linkGeneratedMedia();
  if(currentTab==='audio')setHTML('#audio-tracks',audioTracks(project,jobs));
  $('#save-project').disabled=!project;
  $('#top-title').textContent=project?.name||'채널을 분석하고 플레이리스트를 만드세요';
  $('#project-badge').textContent=project?`${project.tracks.length}곡 · ${project.engine==='yue2'?'YuE2':'Suno'}`:'프로젝트 없음';
  $('#save-state').textContent=dirty?'저장하지 않은 변경 사항':project?.revision?'저장됨 · revision '+project.revision:'임시 작업 · 필요할 때 저장';
  $$('[data-project]').forEach(el=>{el.disabled=!project;el.value=project?.[el.dataset.project]??(el.id==='project-count'?5:el.id==='channel-limit'?(project?.referenceAnalysis?.requestedLimit||20):'');});
  const tracks=project?.tracks||[];
  $('#provider-order').innerHTML=(project?.settings?.order||['codex','claude']).map((p,i)=>`<div class="provider-pill"><small>0${i+1}</small><strong>${p==='codex'?'GPT · Codex':'Claude'}</strong><small>${i?'다음 제공자':'우선 사용'}</small></div>`).join('');
  $('#auto-fallback').checked=project?.settings?.fallback!==false;$('#normalize').checked=project?.normalize!==false;
  $('#model-codex').value=project?.settings?.models?.codex||'';$('#model-claude').value=project?.settings?.models?.claude||'';
  $('#plan-count').textContent=tracks.length;
  $('#plan-tracks').innerHTML=tracks.length?tracks.map((t,i)=>`<article class="track-card plan-track" data-track="${esc(t.id)}"><div class="track-heading"><h3>${trackTitle(t,i)}</h3><button class="icon-button" data-remove="${esc(t.id)}" aria-label="${esc(t.title)} 곡 제외">곡 제외</button></div><label>곡 제목<input data-field="title" value="${esc(t.title)}" maxlength="200"></label><div class="form-grid"><label>음악 스타일<textarea data-field="style" rows="8">${esc(t.style)}</textarea></label><label>가사<textarea data-field="lyrics" rows="8">${esc(t.lyrics)}</textarea></label></div></article>`).join(''):'<div class="empty">아직 곡이 없습니다.<br>AI로 초안을 생성하거나 직접 곡을 추가하세요.</div>';
  renderMusicEngine();
  $('#plan-next').disabled=!tracks.length;$('#plan-ready').textContent=tracks.length?`${tracks.length}곡 · 편집 내용은 다음 단계에서도 유지됩니다.`:'곡을 추가하면 다음 단계로 이동할 수 있습니다.';
  renderProduction();

  if(['tracks','audio','images'].includes(currentTab))attachMedia();renderReference();renderTasks();renderSummary();
}

function pendingMusicTracks(){
  return (project?.tracks||[]).filter(t=>!t.excluded&&!t.audioId&&!jobs.some(j=>j.projectId===project.id&&j.kind==='music'&&j.input?.trackId===t.id&&(['queued','running','unknown','interrupted'].includes(j.status)||j.status==='complete'&&j.result?.songs?.length)));
}
function renderProduction(){
  const selected=productionTracks(project);
  $('#make-capcut').disabled=taskActive(latestTask(jobs,project,'capcut'))||!selected.length||selected.some(t=>!t.imageId);
  setHTML('#export-tracks',productionTracks(project).length?productionTracks(project).map((t,i)=>`<div class="order-row"><span class="track-number">${String(i+1).padStart(2,'0')}</span><div class="row-main"><strong>${esc(t.title)}</strong><small>${t.audioId?'음원 선택됨':'음원 필요'} · ${t.imageId?'이미지 선택됨':'이미지 필요'}</small></div><button class="icon-button" data-move="${esc(t.id)}" data-direction="-1" aria-label="${esc(t.title)} 위로" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-move="${esc(t.id)}" data-direction="1" aria-label="${esc(t.title)} 아래로" ${i===productionTracks(project).length-1?'disabled':''}>↓</button></div>`).join(''):'<div class="empty">아직 출력할 곡이 없습니다.</div>');
  $('#music-next').disabled=!selected.length;
  $('#music-next').textContent=selected.length?`${selected.length}곡으로 계속 →`:'다음: 무음·음량 조정 →';
  $('#music-ready').textContent=`포함 ${selected.length} / ${project?.tracks.length||0}곡`;
  const batch=pendingMusicTracks().length;
  $('#batch-music').disabled=!batch||actionLock;
  $('#batch-music').textContent=`음원 없는 곡 일괄 생성 (${batch}곡)`;
  $('#image-provider-note').textContent=imageConfigured?'가사·제목·스타일을 참고해 Codex CLI로 새 이미지 후보를 만듭니다.':'YuE2 커버가 있으면 자동으로 표시합니다. 이미지 생성은 Codex CLI 로그인 상태를 확인한 뒤 사용할 수 있습니다.';
  $('#music-credit').hidden=project?.engine!=='suno';
  setHTML('#media-tracks',musicTracks(project,assets,jobs));
  if(currentTab!=='audio')setHTML('#audio-tracks',audioTracks(project,jobs));
  else{
    const existing=$('#audio-tracks');
    const template=document.createElement('template');template.innerHTML=audioTracks(project,jobs);
    if(!existing.querySelector('[data-track]'))setHTML('#audio-tracks',template.innerHTML);
    else for(const card of template.content.querySelectorAll('[data-track]')){
      const live=[...existing.querySelectorAll('[data-track]')].find(el=>el.dataset.track===card.dataset.track);
      const next=card.querySelector('.inline-note'),old=live?.querySelector('.inline-note');
      if(old?.outerHTML===next?.outerHTML)continue;
      if(old)old.remove();
      if(next)live?.querySelector('.media-preview')?.after(next);
    }
  }
  setHTML('#image-tracks',imageTracks(project,assets,jobs,imageConfigured));
  const cli=$('#check-image-cli');cli.textContent=imageConfigured?'연결됨':'Codex CLI 연결 확인';cli.disabled=imageConfigured;
  $('#audio-next').disabled=!selected.length;
  $('#images-next').disabled=!selected.length||selected.some(t=>!assets.some(a=>a.id===t.imageId&&a.kind==='image'));
}
function linkGeneratedMedia(){
  if(!project)return;
  const assetExists=(id,kind)=>assets.some(a=>a.id===id&&a.kind===kind);
  for(const track of project.tracks){
    const takes=jobs.filter(j=>j.projectId===project.id&&j.kind==='music'&&j.input?.trackId===track.id&&j.status==='complete').flatMap(j=>j.result?.songs||[]).filter(s=>assetExists(s.audioId,'audio'));
    if(!track.audioId&&!track.excluded&&takes.length===1){track.audioId=takes[0].audioId;track.trimStart=0;track.trimEnd=null;markDirty();}
    const cover=takes.find(s=>s.audioId===track.audioId)?.imageId;
    if(track.coverAudioId&&track.coverAudioId!==track.audioId){delete track.coverAudioId;delete track.imageId;markDirty();}
    if(!track.imageId&&cover&&assetExists(cover,'image')){track.imageId=cover;track.coverAudioId=track.audioId;markDirty();}
  }
}
function engineReady(engine){
  const state=engineState[engine];
  return !!state?.generationTools?.length&&(engine!=='yue2'||state.modelReady===true&&state.storageInWorkspace===true);
}
function renderMusicEngine(){
  const selected=project?.engine||'suno';
  const stateText=e=>{const s=engineState[e];return engineChecking[e]?'연결 확인 중…':engineErrors[e]?engineErrors[e]:!s?.connected?'연결 확인 전':!s.generationTools?.length?'연결됨 · 생성 도구 없음':e==='yue2'&&s.modelReady===false?'연결됨 · 모델 준비 필요':e==='yue2'&&s.storageInWorkspace!==true?'다른 Studio가 연결되어 있습니다. 해당 Studio를 종료한 뒤 다시 시도하세요.':'연결 확인 · 생성 도구 준비';};
  if($('#music-options').dataset.engine!==selected){$('#music-length').value='';$('#music-format').value='';$('#music-options').dataset.engine=selected;}
  const options=engineState[selected]?.generationTools?.[0]?.inputSchema?.properties||{};
  $('#music-options').hidden=!options.duration_seconds&&!options.output_format?.enum?.length;
  $('#music-length-label').hidden=!options.duration_seconds;
  const length=$('#music-length');
  const max=options.duration_seconds?.maximum||(selected==='yue2'?engineState.yue2?.maxDurationSeconds:null);
  if(max){length.max=max;length.placeholder=`최대 ${max}초 (기본값)`;}
  else{length.removeAttribute('max');length.placeholder='엔진 기본값';}
  $('#music-length-note').textContent=max?`최대 ${Math.floor(max/60)}분 ${max%60}초 · 비워두면 이 상한을 사용합니다.`:'';
  $('#music-format-label').hidden=!options.output_format?.enum?.length;
  const format=$('#music-format'),previous=format.value;
  format.innerHTML='<option value="">엔진 기본값</option>'+(options.output_format?.enum||[]).map(v=>`<option>${esc(v)}</option>`).join('');
  format.value=(options.output_format?.enum||[]).includes(previous)?previous:'';
  const alternate=selected==='suno'?'yue2':'suno';
  $('#music-engine-panel').innerHTML=`<div class="section-head"><div><h3>음악 생성 엔진</h3><p class="muted">사용할 엔진을 선택한 뒤 연결을 확인하세요.</p></div><span class="badge">선택: ${selected==='yue2'?'YuE2 Studio':'Suno'}</span></div><div class="engine-choices">${['suno','yue2'].map(e=>`<article class="engine-choice ${selected===e?'selected':''}"><button class="${selected===e?'primary':'secondary'}" data-select-engine="${e}" aria-pressed="${selected===e}">${e==='yue2'?'YuE2 Studio · 로컬':'Suno · 클라우드'}</button><p>${esc(engineReady(e)?(e==='yue2'?'이 PC에서 음악 생성':'Suno에서 음악 생성'):stateText(e))}</p><button class="secondary" data-check-engine="${e}" ${engineChecking[e]||engineReady(e)?'disabled':''}>${engineChecking[e]?'확인 중…':engineReady(e)?'연결됨':e==='yue2'?'실행 및 연결':'연결 확인'}</button></article>`).join('')}</div>${!engineState[selected]?.connected&&engineState[alternate]?.connected?`<div class="inline-note">${alternate==='yue2'?'YuE2 Studio':'Suno'} 연결이 확인되어 있습니다. <button class="secondary" data-select-engine="${alternate}">${alternate==='yue2'?'YuE2':'Suno'}로 전환</button></div>`:''}`;
}

async function submitJob(input,batch=null){
  if(actionLock)throw new Error('요청을 처리하고 있습니다.');
  actionLock=true;pendingSubmission={kind:input.kind,projectId:input.project?.id||project?.id};renderTasks();
  try{
    const source=requireProject();
    const saved=dirty||!source.revision?await saveProject(source):structuredClone(source);
    if(input.project){input.project=structuredClone(saved);if(['capcut','render'].includes(input.kind))input.project.tracks=productionTracks(input.project);}
    const requests=batch||[input];
    const results=[];
    for(const request of requests){
      if(project?.id!==saved.id)break;
      const result=await api('/api/jobs',{method:'POST',headers:{'X-Idempotency-Key':uid()},data:{...request,projectId:saved.id},timeout:20000});
      results.push(result);jobs=[result,...jobs.filter(job=>job.id!==result.id)];renderProduction();
    }
    notify(`${results.length}개 작업을 대기열에 추가했습니다.`);
    return results[0];

  }finally{actionLock=false;pendingSubmission=null;await poll();renderProduction();renderTasks();renderReference();renderSummary();}
}
function renderJobs(){
  $('#job-count').textContent=jobs.filter(j=>!j.historyHidden).length;
  const visible=jobs.filter(j=>!!j.historyHidden===$('#show-hidden-jobs').checked);
  setHTML('#job-list',visible.length?visible.map(renderJob).join(''):'<div class="empty">표시할 작업 기록이 없습니다.</div>');
  const capcut=jobs.find(j=>isCapCutCurrent(j,project));
  const capcutTask=latestTask(jobs,project,'capcut');
  $('#capcut-progress').innerHTML=outputProgress(capcutTask);
  $('#mp4-progress').innerHTML=outputProgress(latestTask(jobs,project,'render'));
  $('#capcut-result').hidden=!capcut;
  $('#make-capcut').disabled=taskActive(capcutTask)||!productionTracks(project).length||productionTracks(project).some(t=>!t.imageId);
  if(capcut)setHTML('#capcut-result',`<h2>CapCut 초안 파일이 준비되었습니다.</h2><div class="button-row"><button class="primary" data-open-capcut="${esc(capcut.id)}">CapCut에서 열기</button></div><p class="muted">CapCut이 열리면 프로젝트 목록에서 새 초안을 선택하세요.</p><button class="secondary" data-download="${esc(capcut.result.assetId)}">CapCut 프로젝트 ZIP 저장</button><h3>PC의 초안 폴더</h3><pre>${esc(capcut.result.folder)}</pre><p class="muted">미디어 경로가 이 폴더를 참조합니다. 폴더를 보존하세요. ZIP은 다른 PC에서 경로 재연결이 필요할 수 있습니다.</p><h3>유튜브 타임스탬프</h3><pre>${esc(capcut.result.timestamps.join('\n'))}</pre>`);
  const rendered=jobs.find(j=>isExportCurrent(j,project));
  $('#export-result').hidden=!rendered;
  $('#render-video').textContent=rendered?'다시 만들기':'MP4 직접 만들기';
  if(rendered)setHTML('#export-result',`<h2>플레이리스트가 준비되었습니다.</h2><p class="muted">${duration(rendered.result.duration)} · 원본 파일 보존</p><button class="secondary" data-download="${esc(rendered.result.assetId)}">MP4 저장</button><h3>유튜브 타임스탬프</h3><pre>${esc(rendered.result.timestamps.join('\n'))}</pre>`);
  renderTasks();renderReference();
}
function outputProgress(job){
  if(!job||job.status==='complete')return '';
  return `<p class="inline-note" role="status">${esc(statusLabels[job.status]||job.status)}${job.progress?` · ${job.progress.current}/${job.progress.total}곡`:''} ${esc(job.message||'')}</p>`;
}
function renderJob(j){
  const buttons=[];
  if(['queued','running'].includes(j.status))buttons.push(`<button class="secondary" data-cancel="${esc(j.id)}">${j.kind==='music'?'생성 추적 중단':'작업 취소'}</button>`);
  if(j.kind==='music'&&j.input?.engine==='yue2'&&j.externalId&&['unknown','interrupted','cancelled','error'].includes(j.status))buttons.push(`<button class="primary" data-recover="${esc(j.id)}">기존 생성 결과 확인·복구</button>`);
  if(j.kind==='channel-insight'&&j.status==='complete')buttons.push('<button class="secondary" data-apply-insight="'+esc(j.id)+'">분석 결과를 프로젝트에 적용</button>');
  if(j.kind==='plan'&&j.status==='complete')buttons.push(`<button class="primary" data-apply-plan="${esc(j.id)}">초안을 현재 프로젝트에 추가</button>`);
  if(j.kind==='music'&&j.status==='complete'&&j.result?.songs)j.result.songs.forEach((s,i)=>buttons.push(`<button class="primary" data-apply-music="${esc(j.id)}" data-take="${i}">${esc(s.title)} · 이 음원 선택</button>`));
  if(j.kind==='capcut'&&j.status==='complete')buttons.push(`<button class="secondary" data-download="${esc(j.result.assetId)}">CapCut 초안 ZIP 저장</button>`);
  if(j.kind==='render'&&j.status==='complete')buttons.push(`<button class="primary" data-download="${esc(j.result.assetId)}">MP4 저장</button>`);
  if(j.kind==='silence'&&j.status==='complete')buttons.push(`<button class="secondary" data-apply-trim="${esc(j.id)}">추천 트림 적용</button>`);
  const progress=j.progress?` · ${j.progress.current}/${j.progress.total}곡 처리`:j.musicStatus&&j.status==='running'?' · 음악 엔진에서 생성 중':'';
  return `<article class="job-row"><details><summary><strong>${esc(kindLabels[j.kind]||j.kind)}</strong><span class="job-state ${esc(j.status)}">${esc(statusLabels[j.status]||j.status)}</span><time>${esc(new Date(j.createdAt).toLocaleString('ko-KR'))}${progress}</time></summary><div class="job-detail">${j.message?`<p>${esc(j.message)}</p>`:''}<div class="button-row">${buttons.join('')}</div>${j.result?`<pre>${esc(JSON.stringify(j.result,null,2))}</pre>`:''}</div></details>${taskActive(j)?'':`<button class="secondary" data-history="${esc(j.id)}" data-hidden="${!j.historyHidden}">${j.historyHidden?'복원':'기록 삭제'}</button>`}</article>`;

}
async function poll(){
  if(!connected||polling)return;polling=true;
  try{jobs=await api('/api/jobs');assets=await api('/api/assets');linkGeneratedMedia();renderProduction();renderJobs();renderSummary();if(['tracks','audio','images'].includes(currentTab))attachMedia();}
  catch(e){setConnected(false);renderSummary();notify('브릿지 연결이 끊어졌습니다. PC의 실행 상태를 확인하세요.',true);}
  finally{polling=false;}
}
async function checkEngine(engine,{probeOnly=false}={}){
  if(!connected||engineChecking[engine])return;
  engineChecking[engine]=true;delete engineErrors[engine];renderMusicEngine();
  const text=$('#'+engine+'-status');text.textContent='MCP 연결과 사용 가능한 도구 확인 중…';
  try{
    const state=await api('/api/music/connect',{method:'POST',data:{engine,probeOnly},timeout:probeOnly?10000:45000});
    if(!state.connected){
      delete engineState[engine];engineErrors[engine]=state.note;text.textContent=state.note;
      return;
    }
    engineState[engine]=state;
    text.textContent=`연결 확인 · 생성 도구 ${state.generationTools.length}개${state.modelReady!==null?' · 모델 '+(state.modelReady?'준비 완료':'준비 필요'):''}${state.storageInWorkspace!==null?' · '+(state.storageInWorkspace?'프로젝트 내부 저장':'저장 위치 확인 필요'):''}`;
    if(!probeOnly)notify(engine==='yue2'?(state.windowHidden===false?'YuE2에 연결했습니다. Studio 창 숨김을 확인하지 못했습니다.':'YuE2 연결과 모델·저장 경로를 확인했습니다.'):'Suno에 연결했습니다.');
  }catch(e){
    delete engineState[engine];engineErrors[engine]=probeOnly?'자동 확인에 실패했습니다. 아래 버튼으로 다시 확인하세요.':e.message;
    text.textContent=engineErrors[engine];if(!probeOnly)throw e;
  }finally{engineChecking[engine]=false;renderMusicEngine();renderSummary();if(currentTab==='setup')renderSetup();}

}
async function requestMusic(tracks){
  const p=requireProject(),engine=p.engine,state=engineState[engine];
  if(!tracks.length)return;
  if(!state?.generationTools?.length)throw new Error('이 화면 위에서 음악 엔진을 먼저 연결하세요.');
  if(engine==='yue2'&&(state.modelReady!==true||state.storageInWorkspace!==true))throw new Error('프로젝트용 YuE2의 모델과 저장 위치를 확인하세요.');
  const definition=state.generationTools[0],schema=definition.inputSchema;
  const inputs=tracks.map(track=>{
    const length=$('#music-length');
    if(schema.properties?.duration_seconds&&length.value&&!length.checkValidity())throw new Error('곡 길이를 올바른 초 단위로 입력하세요.');
    const args={},values={title:track.title,lyrics:track.lyrics,style:track.style,styles:track.style,
      duration_seconds:length.value?Number(length.value):length.max?Number(length.max):undefined,output_format:$('#music-format').value||undefined};
    for(const [key,field] of Object.entries(schema.properties||{})){
      const value=values[key]??field.default;
      if(value!==undefined&&value!=='')args[key]=value;
    }
    for(const key of schema.required||[])if(args[key]===undefined)throw new Error(`${track.title} · 필수 생성 입력을 확인하세요 (${key}).`);
    return {kind:'music',engine,tool:definition.name,args,confirm:true,trackId:track.id};
  });
  await submitJob(inputs[0],inputs);
}
async function handleAction(event){
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.tab){tab(b.dataset.tab);return;}
  const id=b.id;
  if(id==='edit-youtube-key'){editingYoutubeKey=true;renderReference();$('#youtube-key').focus();return;}
  if(id==='cancel-youtube-key'){editingYoutubeKey=false;$('#youtube-key').value='';renderReference();return;}
  if(id==='check-youtube-key'){const keyGeneration=youtubeKeyGeneration;b.disabled=true;b.textContent='확인 중…';try{const r=await api('/api/youtube/check',{method:'POST',data:{}});if(!isCurrentResponse(keyGeneration,youtubeKeyGeneration))return;youtubeVerifiedAt=r.verifiedAt;renderReference();notify('YouTube API 연결을 확인했습니다.');}finally{renderReference();}return;}
  if(b.hasAttribute('data-prepare-yue2')){
    b.disabled=true;b.textContent='프로젝트용 복사본 준비 중…';
    try{await api('/api/yue2/prepare',{method:'POST',data:{},timeout:600000});await refreshSetup();}
    finally{b.disabled=false;b.textContent='프로젝트용 YuE2 준비';}
    return;
  }
  if(b.hasAttribute('data-show-yue2')){await api('/api/yue2/show',{method:'POST',data:{}});return;}
  if(id==='refresh-setup'){await refreshSetup();await refreshStatus();renderSetup();return;}
  if(id==='setup-connect'){await connectFromWeb();return;}
  if(id==='save-youtube-key'){const value=$('#youtube-key').value.trim();if(!value)throw new Error('새 API 키를 입력하세요.');const keyGeneration=++youtubeKeyGeneration;const result=await api('/api/youtube/config',{method:'POST',data:{apiKey:value}});if(!isCurrentResponse(keyGeneration,youtubeKeyGeneration))return;$('#youtube-key').value='';youtubeConfigured=result.configured;youtubeVerifiedAt=null;editingYoutubeKey=false;renderReference();notify('키를 등록했습니다. 실제 연결 확인으로 점검할 수 있습니다.');return;}
  if(id==='search-channels'||id==='more-channels'){await referenceTask('search',{more:id==='more-channels'});return;}
  if(id==='collect-channel'){await referenceTask('collect',{purpose:$('#reference-purpose').value.trim()});return;}
  if(b.dataset.previewChannel){await toggleChannelPreview(b);return;}
  if(b.dataset.useChannel){
    const purpose=b.closest('.channel-card')?.querySelector('[data-channel-purpose]')?.value.trim()||'';
    requireProject().referenceInput='https://www.youtube.com/channel/'+b.dataset.useChannel;
    $('#reference-input').value=project.referenceInput;markDirty();
    await referenceTask('collect',{purpose});return;
  }
  if(id==='analyze-channel-ai'){const p=requireProject();if(!p.referenceAnalysis?.videos?.length)throw new Error('참고 채널 데이터를 먼저 수집하세요.');if(p.referenceAnalysis.videos.some(v=>v.descriptionComplete!==true)){$('#reference-input').value=p.referenceAnalysis.reference||p.referenceInput;$('#channel-limit').value=p.referenceAnalysis.requestedLimit||20;notify('설명·트랙 목록을 전체 자료로 갱신한 뒤 분석합니다.');await referenceTask('collect');if(project?.id!==p.id)return;}await submitJob({kind:'channel-insight',project:structuredClone(requireProject())});return;}
  if(b.dataset.applyInsight){const p=requireProject(),j=jobs.find(j=>j.id===b.dataset.applyInsight);if(j.projectId!==p.id||j.result.sourceSnapshotId!==p.referenceAnalysis?.snapshotId)throw new Error('다른 채널 수집본의 분석입니다. 해당 프로젝트를 열거나 다시 분석하세요.');p.referenceAnalysis.insight=j.result.result;markDirty();tab('analysis');return;}
  if(id==='apply-channel-plan'){const p=requireProject(),r=p.referenceAnalysis,j=latestTask(jobs.filter(j=>j.status==='complete'),p,'channel-insight');if(j?.status==='complete')r.insight=j.result.result;if(!r?.insight)throw new Error('AI 분석을 먼저 완료하세요.');if(['conflict'].includes(productionCheck(r.insight,r.videos).status)||productionCheck(r.insight,r.videos).requiresRefresh)throw new Error('제작 길이 구성이 맞지 않습니다. 다시 분석한 뒤 반영하세요.');p.referencePlan={...r.insight,sourceSnapshotId:r.snapshotId};markDirty();tab('plan');notify('채널 분석을 원곡 기획의 참고 입력으로 연결했습니다. 직접 지정한 설정과 기존 곡은 보존합니다.');return;}
  if(id==='new-project'){newProject();return;}
  if(id==='connect-bridge'||id==='manual-bridge'){await connectFromWeb(id==='manual-bridge');return;}
  if(id==='show-code'){if(location.origin!==base)throw new Error('코드는 로컬 화면에서만 확인할 수 있습니다.');$('#bridge-token').type=$('#bridge-token').type==='password'?'text':'password';return;}
  if(id==='save-project'){await saveProject();return;}
  if(id==='refresh-status'){await refreshStatus();return;}
  if(id==='save-origin'){const origin=$('#allowed-origin').value.trim();const s=await api('/api/settings');const result=await api('/api/settings',{method:'POST',data:{allowedOrigins:[...s.allowedOrigins,origin]}});$('#origins-list').textContent='허용된 웹앱: '+result.allowedOrigins.join(', ');notify('웹앱 주소를 등록했습니다.');return;}
  if(b.dataset.selectEngine){requireProject().engine=b.dataset.selectEngine;markDirty();renderProject();notify('생성 엔진을 변경했습니다. 음악은 생성 버튼을 눌러 요청하세요.');return;}
  if(b.dataset.checkEngine){await checkEngine(b.dataset.checkEngine);return;}
  if(id==='suno-login'){
    const popup=window.open('about:blank','playl-suno');
    try{const r=await api('/api/music/suno/oauth',{method:'POST',data:{},timeout:150000});if(popup)popup.location.href=r.url;else notify('로그인 창이 차단되었습니다. 팝업을 허용하고 다시 실행하세요.',true);}catch(e){popup?.close();throw e;}return;
  }
  if(id==='swap-order'){const p=requireProject();p.settings.order.reverse();markDirty();renderProject();return;}
  if(id==='save-models'){const p=requireProject();p.settings.models={codex:$('#model-codex').value.trim(),claude:$('#model-claude').value.trim()};markDirty();notify('모델 설정을 적용했습니다. 프로젝트를 저장하세요.');return;}
  if(id==='add-track'){const p=requireProject();p.tracks.push({id:uid(),title:`Track ${p.tracks.length+1}`,lyrics:'',style:'',trimStart:0});markDirty();renderProject();return;}
  if(id==='generate-plan'){const p=requireProject();await submitJob({kind:'plan',project:structuredClone(p)});return;}
  if(id==='make-capcut'){const p=requireProject(),tracks=productionTracks(p);if(!tracks.length||tracks.some(t=>!t.imageId))throw new Error('모든 곡에 음원과 이미지를 지정하세요.');await submitJob({kind:'capcut',project:structuredClone(p)});return;}
  if(id==='render-video'){const p=requireProject(),tracks=productionTracks(p);if(!tracks.length||tracks.some(t=>!t.imageId))throw new Error('모든 곡에 음원과 이미지를 지정하세요.');await submitJob({kind:'render',project:structuredClone(p)});return;}
  if(b.dataset.remove){const p=requireProject();if(!confirm('이 곡을 프로젝트에서 제외할까요? 원본 파일과 이전 저장본은 보존됩니다.'))return;p.tracks=p.tracks.filter(t=>t.id!==b.dataset.remove);markDirty();renderProject();return;}
  if(b.dataset.move){
    const p=requireProject(),included=productionTracks(p),i=included.findIndex(t=>t.id===b.dataset.move),other=included[i+Number(b.dataset.direction)];
    if(i<0||!other)return;
    const from=p.tracks.indexOf(included[i]),to=p.tracks.indexOf(other);
    [p.tracks[from],p.tracks[to]]=[p.tracks[to],p.tracks[from]];markDirty();renderProject();return;
  }
  if(id==='check-image-cli'){b.disabled=true;b.textContent='확인 중…';try{await refreshStatus();}finally{renderProduction();}return;}
  if(b.dataset.generateImage){await submitJob({kind:'image',trackId:b.dataset.generateImage});return;}
  if(b.dataset.useImage){
    const track=project?.tracks.find(t=>t.id===b.dataset.imageTrack);
    if(track){track.imageId=b.dataset.useImage;delete track.coverAudioId;markDirty();renderProject();}
    return;
  }
  if(b.dataset.applyImage){productionTracks(requireProject()).forEach(t=>{t.imageId=b.dataset.applyImage;delete t.coverAudioId;});markDirty();renderProject();return;}
  if(b.dataset.silence){const p=requireProject(),t=p.tracks.find(t=>t.id===b.dataset.silence);if(!t?.audioId)return;await submitJob({kind:'silence',audioId:t.audioId,trackId:t.id});return;}
  if(id==='batch-music'){await requestMusic(pendingMusicTracks());return;}
  if(b.dataset.music){await requestMusic(requireProject().tracks.filter(t=>t.id===b.dataset.music));return;}
  if(b.dataset.toggleTrack){const t=requireProject().tracks.find(t=>t.id===b.dataset.toggleTrack);if(t){t.excluded=!t.excluded;markDirty();renderProject();}return;}
  if(b.dataset.history){
    const hidden=b.dataset.hidden==='true';
    if(hidden&&!confirm('이 항목을 작업 기록 목록에서 삭제할까요? 숨긴 기록에서 복원할 수 있습니다.'))return;
    await api(`/api/jobs/${b.dataset.history}/history`,{method:'POST',data:{hidden}});await poll();return;
  }
  if(b.dataset.openCapcut){
    if(!jobs.some(job=>job.id===b.dataset.openCapcut&&isCapCutCurrent(job,project)))throw new Error('현재 구성으로 CapCut 초안을 다시 만드세요.');
    if(b.disabled)return;b.disabled=true;
    try{const r=await api(`/api/jobs/${b.dataset.openCapcut}/open-capcut`,{method:'POST',data:{},timeout:45000});notify(`CapCut 프로젝트 목록에서 ‘${r.name}’을 열어주세요.`);}
    finally{b.disabled=false;}
    return;
  }
  if(id==='audio-next'){if(!productionTracks(project).length)return;project.audioReviewFingerprint=audioSignature(project);markDirty();tab('images');return;}
  if(b.dataset.cancel){await api(`/api/jobs/${b.dataset.cancel}/cancel`,{method:'POST',data:{}});await poll();return;}
  if(b.dataset.recover){await api(`/api/jobs/${b.dataset.recover}/recover`,{method:'POST',data:{}});notify('기존 음악 작업을 확인합니다. 새 생성 요청은 보내지 않습니다.');await poll();return;}
  if(b.dataset.applyPlan){
    const p=requireProject(),j=jobs.find(j=>j.id===b.dataset.applyPlan);
    if(j.projectId!==p.id&&!confirm('다른 프로젝트의 초안입니다. 현재 프로젝트에 추가할까요?'))return;
    if((appliedJobs.has(j.id)||p.appliedPlanJobs?.includes(j.id))&&!confirm('이미 추가한 초안입니다. 다시 추가할까요?'))return;
    if(p.tracks.length+j.result.result.tracks.length>50)throw new Error('프로젝트는 최대 50곡입니다.');
    p.tracks.push(...j.result.result.tracks.map(t=>({...t,id:uid(),trimStart:0})));appliedJobs.add(j.id);p.appliedPlanJobs=[...new Set([...(p.appliedPlanJobs||[]),j.id])];markDirty();tab('plan');return;
  }
  if(b.dataset.applyMusic){
    const p=requireProject(),j=jobs.find(j=>j.id===b.dataset.applyMusic);
    if(j.projectId!==p.id)throw new Error('음악을 요청한 프로젝트를 먼저 여세요.');
    const t=p.tracks.find(t=>t.id===j.input.trackId),take=j.result.songs[Number(b.dataset.take)];
    if(!t||!take)throw new Error('원래 곡이나 생성 결과를 찾을 수 없습니다.');
    if(t.audioId&&t.audioId!==take.audioId&&!confirm('이 곡의 선택 음원을 바꿀까요? 기존 파일과 저장본은 보존됩니다.'))return;
    t.audioId=take.audioId;t.trimStart=0;t.trimEnd=null;markDirty();tab('tracks');notify('생성 음원을 선택했습니다. 미리 들어본 뒤 저장하세요.');return;
  }
  if(b.dataset.applyTrim){
    const p=requireProject(),j=jobs.find(j=>j.id===b.dataset.applyTrim);if(j.projectId!==p.id)throw new Error('해당 작업의 프로젝트를 먼저 여세요.');const t=p.tracks.find(t=>t.id===j.input.trackId);if(!t||t.audioId!==j.input.audioId)throw new Error('분석 이후 음원이 변경되었습니다. 다시 분석하세요.');t.trimStart=Number(j.result.suggestedStart.toFixed(2));t.trimEnd=Number(j.result.suggestedEnd.toFixed(2));markDirty();tab('audio');notify('추천 구간을 적용했습니다. 실제 소리를 확인한 뒤 출력하세요.');return;
  }
  if(b.dataset.download){const url=await assetURL(b.dataset.download);const a=document.createElement('a');a.href=url+'&download=1';a.rel='noreferrer';a.click();return;}
}

document.addEventListener('click',event=>{handleAction(event).catch(e=>notify(e.message,true));});
document.addEventListener('input',event=>{
  const el=event.target;if(!project)return;
  if(el.id==='reference-input'&&project.referenceAnalysis?.referencePurpose&&$('#reference-purpose').value===project.referenceAnalysis.referencePurpose&&el.value.trim()!==project.referenceAnalysis.reference){
    $('#reference-purpose').value='';
  }
  if(el.dataset.project){project[el.dataset.project]=el.type==='number'?Number(el.value):el.value;markDirty();$('#top-title').textContent=project.name;}
  if(el.dataset.project||el.dataset.field)renderSummary();
  if(el.dataset.project==='engine')renderProject();
  if(el.dataset.field){const track=project.tracks.find(t=>t.id===el.closest('[data-track]')?.dataset.track);if(!track)return;track[el.dataset.field]=el.type==='number'?(el.value===''?null:Number(el.value)):el.value;markDirty();}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  try{
    if(el.id==='show-hidden-jobs'){renderJobs();return;}
    if(el.id==='project-select'){
      ++projectLoadGeneration;
      if(dirty&&!confirm('저장하지 않은 변경 사항이 있습니다. 다른 프로젝트로 이동할까요?')){renderProjects();return;}
      if(!el.value){renderProjects();return;}
      try{await loadProject(el.value);}finally{renderProjects();}
      return;
    }
    if(el.id==='auto-fallback'){requireProject().settings.fallback=el.checked;markDirty();}
    if(el.id==='normalize'){requireProject().normalize=el.checked;markDirty();renderSummary();}
    if(el.dataset.upload){
      const file=el.files?.[0];if(!file)return;const p=requireProject(),track=p.tracks.find(t=>t.id===el.dataset.trackId);el.disabled=true;
      notify('파일을 PC 작업 폴더로 가져오고 있습니다.');
      const a=await api('/api/assets',{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'},raw:file,timeout:600000});
      assets.push(a);track[el.dataset.upload==='audio'?'audioId':'imageId']=a.id;if(el.dataset.upload==='audio'){track.trimStart=0;track.trimEnd=null;}else delete track.coverAudioId;markDirty();renderProject();notify('원본을 변경하지 않고 파일을 가져왔습니다.');
    }
    if(el.tagName==='SELECT'&&el.dataset.field){const t=project?.tracks.find(t=>t.id===el.closest('[data-track]')?.dataset.track);if(t){t[el.dataset.field]=el.value;if(el.dataset.field==='audioId'){t.trimStart=0;t.trimEnd=null;}markDirty();renderProject();}}
  }catch(e){notify(e.message,true);if(el.dataset.upload)el.disabled=false;}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
$('#bridge-url').value=base;$('#bridge-token').value=token;
project=createDraft();
renderProject();renderJobs();tab('analysis');
connect({restore:true}).catch(e=>{setConnected(false);renderSummary();$('#cli-status').innerHTML='<div class="panel muted">브릿지를 연결하면 설치·로그인 상태를 확인할 수 있습니다.</div>';renderSetup();if(currentTab==='analysis'&&!dirty)tab('setup');notify('시작·설치 확인에서 필요한 도구를 준비하세요.',true);});
setInterval(()=>{if(!document.hidden)poll();},2500);

function renderSummary(){
  const s=workflowState(project,assets,jobs),engine=project?.engine==='yue2'?'YuE2':'Suno',state=engineState[project?.engine];
  const aiState=statusSnapshot?['codex','claude'].map(k=>(k==='codex'?'GPT':'Claude')+' '+(statusSnapshot.cli[k]?.authenticated?'로그인':'확인 필요')).join(' · '):'AI 상태 확인 전';
  let fields=[['참고 채널',s.channel===null?'미수집':s.channel+'개 수집'],['가사·스타일',s.lyrics+' / '+s.count],['확정 음원',s.audio+' / '+s.count],['준비 이미지',s.images+' / '+s.count],['예상 총 길이',s.duration==null?'미확인':duration(Math.round(s.duration))],['음악 엔진',project?engine+' · '+(connected&&state?.connected?'연결 확인':'확인 전'):'미선택',aiState]];
  if(currentTab==='analysis'){
    const r=project?.referenceAnalysis,j=latestTask(jobs,project,'channel-insight');
    fields=[['참고 채널',r?.channel?.title||'채널을 선택하세요'],['수집 표본',r?r.videos.length+'개':'미수집'],['표본 중앙 조회수',r?.statistics?.medianViews==null?'—':Math.round(r.statistics.medianViews).toLocaleString('ko-KR')],['평균 영상 길이',r?.statistics?.averageDuration==null?'—':Math.round(r.statistics.averageDuration/60)+'분'],['AI 해석',taskActive(j)?'진행 중':j?.status==='complete'||r?.insight?'완료':'분석 전'],['기획 연결',project?.referencePlan?.sourceSnapshotId===r?.snapshotId&&r?'반영됨':'반영 전']];
  }
  $('#workspace-summary').hidden=['connections','setup','jobs'].includes(currentTab);
  $('#workspace-summary').innerHTML=fields.map(([label,value,detail])=>'<div class="summary-item"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</div>').join('');
  const states={analysis:s.channel===null?'미수집':'수집됨',plan:s.count&&s.lyrics===s.count?'준비':s.lyrics+'/'+s.count,tracks:s.audio+'/'+s.count,audio:s.audioReviewed?'확인':'미확인',images:s.images+'/'+s.count,export:s.capcutReady?'초안 준비':'미준비'};
  $$('[data-step-state]').forEach(el=>el.textContent=states[el.dataset.stepState]);
}
function renderReference(){
  const check=$('#check-youtube-key');check.textContent=youtubeVerifiedAt?'연결됨':'연결 확인';check.disabled=!!youtubeVerifiedAt;
  $('#youtube-key-form').hidden=youtubeConfigured&&!editingYoutubeKey;$('#youtube-key-card').hidden=!youtubeConfigured||editingYoutubeKey;$('#cancel-youtube-key').hidden=!youtubeConfigured;
  $('#youtube-key-description').textContent=youtubeVerifiedAt?'YouTube API 요청 성공을 확인했습니다. 최근 확인: '+new Date(youtubeVerifiedAt).toLocaleString('ko-KR'):'키 등록이 완료되었습니다. 키를 다시 입력할 필요가 없습니다. 실제 연결 확인을 눌러 점검하세요.';
  setHTML('#channel-report',channelReport(project?.referenceAnalysis));
  const channelJob=latestTask(jobs,project,'channel-insight');
  const hasChannelResult=!!project?.referenceAnalysis?.insight||!!latestTask(jobs.filter(j=>j.status==='complete'),project,'channel-insight');
  $('#analysis-action-title').textContent=hasChannelResult?'AI 제작 방향 분석':'다음: AI로 제작 방향 분석';
  $('#analyze-channel-ai').textContent=taskActive(channelJob)?'AI 분석 중…':hasChannelResult?'다시 분석':'AI로 제작 방향 분석';
  $('#analyze-channel-ai').classList.toggle('primary',!hasChannelResult);$('#analyze-channel-ai').classList.toggle('secondary',hasChannelResult);
  const displayedChannelJob=latestTask(jobs.filter(j=>j.status==='complete'),project,'channel-insight');
  setHTML('#channel-insight',channelInsight(displayedChannelJob?{...project.referenceAnalysis,insight:displayedChannelJob.result.result}:project?.referenceAnalysis));
  const viewKey=project?.id+':'+(project?.referenceAnalysis?.snapshotId||'new');if(referenceViewKey!==viewKey){$('#reference-purpose').value=project?.referenceAnalysis?.referencePurpose||'';$('#channel-entry').open=!project?.referenceAnalysis;referenceViewKey=viewKey;}
  $('#reference-input').disabled=referenceBusy;$('#reference-purpose').disabled=referenceBusy;$('#channel-limit').disabled=referenceBusy;$('#channel-query').disabled=referenceBusy;
  $('#collect-channel').disabled=!project||referenceBusy;$('#search-channels').disabled=referenceBusy;
  $('#analyze-channel-ai').closest('.analysis-next').hidden=!project?.referenceAnalysis;
  $('#analyze-channel-ai').disabled=referenceBusy||!project?.referenceAnalysis?.videos?.length||taskActive(latestTask(jobs,project,'channel-insight'))||(pendingSubmission?.kind==='channel-insight'&&pendingSubmission.projectId===project?.id);
  if(searchProject!==project?.id){setHTML('#channel-search-results','');channelPage=null;searchProject=project?.id;}
  const r=project?.referenceAnalysis,p=project?.referencePlan;
  const purposeNote=r?.referencePurpose?'<p class="muted">참고 목적 · '+esc(r.referencePurpose)+'</p>':'';
  $('#reference-plan-context').innerHTML=p?.sourceSnapshotId===r?.snapshotId&&p?'<div class="panel"><h2>연결된 참고 채널 분석</h2><p>'+esc(r.channel.title)+'</p>'+purposeNote+'<p>'+esc(p.planningBrief)+'</p>'+(p.productionPlan?'<p class="muted">분석 제안 '+esc(p.productionPlan.trackCount)+'곡 · 현재 기획 '+esc(project.count)+'곡. 곡 수는 기획 설정을 우선하며 반복은 자동 적용하지 않습니다.</p>':'')+'<p class="muted">메타데이터 기반 추정을 참고합니다. 직접 지정한 제작 설정과 기존 곡은 보존합니다.</p></div>':'<div class="inline-note">참고 채널 분석이 기획 입력에 연결되지 않았습니다. 01 단계에서 분석을 반영하거나 직접 기획할 수 있습니다.'+purposeNote+'</div>';
}
function searchChannelCard(channel){
  const count=(value,unit)=>value==null?'정보 없음':Number(value).toLocaleString('ko-KR')+unit;
  const metrics=[
    ['구독자',channel.subscribersHidden?'비공개':count(channel.subscribers,'명')],
    ['공개 영상',count(channel.publicVideoCount,'개')],
    ['누적 조회수',count(channel.totalViews,'회')]
  ];
  return `<article class="channel-card" tabindex="-1" aria-label="${esc(channel.title)}">
    ${channel.thumbnail?`<img src="${esc(channel.thumbnail)}" alt="" loading="lazy">`:''}
    <div class="channel-copy">
      <h3>${esc(channel.title)}</h3>
      ${channel.description?`<details class="channel-intro"><summary>채널 소개</summary><p class="muted">${esc(channel.description)}</p></details>`:''}
      <dl class="channel-search-metrics">${metrics.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    </div>
    <div class="channel-search-actions">
      <button class="secondary" data-preview-channel="${esc(channel.id)}" aria-expanded="false" aria-controls="preview-${esc(channel.id)}">최근 영상 보기</button>
      <a class="secondary" href="https://www.youtube.com/channel/${esc(encodeURIComponent(channel.id))}" target="_blank" rel="noopener noreferrer">채널 열기 ↗</a>
      <button class="secondary" data-use-channel="${esc(channel.id)}">이 채널 수집</button>
    </div>
    <div class="channel-preview" id="preview-${esc(channel.id)}" hidden>
      <div data-preview-results role="status"></div>
      <label>참고 목적 (선택)<input data-channel-purpose maxlength="200" placeholder="예: 아침 재즈 영상 제목 구성 참고"></label>
    </div>
  </article>`;
}
function channelEvidence(videos,query){
  const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ko-KR');
  const titles=videos.map(video=>normalize(video.title));
  const terms=[...new Set(normalize(query).match(/[\p{L}\p{N}]{2,}/gu)||[])].slice(0,5);
  const matches=terms.map(term=>({term,count:titles.filter(title=>title.includes(term)).length})).filter(item=>item.count);
  return matches.length?matches.map(({term,count})=>`‘${term}’ ${videos.length}개 중 ${count}개`).join(' · '):'최근 영상 제목에 검색어와 겹치는 표현이 없습니다.';
}
async function toggleChannelPreview(button){
  const card=button.closest('.channel-card'),panel=card.querySelector('.channel-preview');
  panel.hidden=!panel.hidden;
  button.setAttribute('aria-expanded',String(!panel.hidden));
  button.textContent=panel.hidden?'최근 영상 보기':'최근 영상 접기';
  if(panel.hidden||panel.dataset.loaded||panel.dataset.loading)return;
  const output=panel.querySelector('[data-preview-results]');
  const query=channelPage?.query||'';
  panel.dataset.loading='1';output.textContent='최근 공개 영상을 확인하는 중…';
  try{
    const {videos}=await api('/api/youtube/preview',{method:'POST',data:{channelId:button.dataset.previewChannel},timeout:85000});
    panel.dataset.loaded='1';
    output.innerHTML=videos.length?`<p><strong>검색어와 영상 제목의 일치</strong> · ${esc(channelEvidence(videos,query))}</p>
      <ul class="channel-preview-list">${videos.map(v=>{
        const date=v.publishedAt&&Number.isFinite(Date.parse(v.publishedAt))?new Date(v.publishedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'날짜 정보 없음';
        const views=v.views==null?'조회수 정보 없음':Number(v.views).toLocaleString('ko-KR')+'회';
        return `<li><a href="https://www.youtube.com/watch?v=${esc(encodeURIComponent(v.id))}" target="_blank" rel="noopener noreferrer">${esc(v.title)}</a><small>${esc(date)} · ${esc(views)}</small></li>`;
      }).join('')}</ul>`:'<p>표시할 최근 공개 영상이 없습니다.</p>';
  }catch(error){output.textContent=error.message+' 접었다 다시 펼쳐 재시도할 수 있습니다.';}
  finally{delete panel.dataset.loading;}
}
async function referenceTask(kind,{more=false,purpose}={}){
  const p=requireProject();if(referenceBusy)throw new Error('채널 요청을 처리 중입니다.');
  if(!youtubeConfigured){tab('connections');$('#youtube-key').focus();throw new Error('YouTube API 키를 먼저 설정하세요.');}
  const projectId=p.id;referenceBusy=true;renderReference();renderSummary();notify(kind==='search'?'공개 채널을 검색하고 있습니다.':'채널과 최근 공개 영상 데이터를 수집하고 있습니다.');
  try{
    if(kind==='search'){
      const query=$('#channel-query').value.trim();
      if(more&&(!channelPage?.nextPageToken||channelPage.query!==query))throw new Error('검색어가 바뀌었습니다. 채널 검색을 다시 눌러주세요.');
      const previous=more?channelPage.channels:[];
      const result=await api('/api/youtube/search',{method:'POST',data:{query,...(more?{pageToken:channelPage.nextPageToken}:{})},timeout:45000});
      if(project?.id!==projectId)return;
      const seen=new Set(previous.map(c=>c.id));
      const added=result.channels.filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;});
      const channels=[...previous,...added];
      const nextPageToken=result.nextPageToken===channelPage?.nextPageToken&&more?null:result.nextPageToken;
      channelPage={query,channels,nextPageToken};
      const container=$('#channel-search-results');
      if(!more){
        renderedSlots.delete('#channel-search-results');
        container.innerHTML='<p class="muted" data-search-count role="status"></p><div data-search-list></div><div class="channel-more" data-search-more></div>';
      }
      const list=container.querySelector('[data-search-list]');
      const firstNewIndex=list.children.length;
      list.insertAdjacentHTML('beforeend',added.map(searchChannelCard).join(''));
      container.querySelector('[data-search-count]').textContent=channels.length?`채널 ${channels.length}개`:'검색 결과가 없습니다.';
      const moreRow=container.querySelector('[data-search-more]');
      moreRow.hidden=!nextPageToken;
      moreRow.innerHTML=nextPageToken?'<button class="secondary" id="more-channels"><span aria-hidden="true">▼</span>채널 더 보기</button>':'';
      if(more&&currentTab==='analysis'){
        const first=list.children[firstNewIndex];
        if(first){first.focus({preventScroll:true});first.scrollIntoView({block:'start',behavior:'instant'});}
        else moreRow.querySelector('button')?.focus({preventScroll:true});
      }

    }else{
      const report=await api('/api/youtube/collect',{method:'POST',data:{reference:$('#reference-input').value.trim(),limit:Number($('#channel-limit').value)},timeout:150000});
      if(project?.id!==projectId){notify('프로젝트가 바뀌어 수집 결과를 적용하지 않았습니다.');return;}
      const previous=project.referenceAnalysis;
      if(purpose!==undefined)report.referencePurpose=purpose.slice(0,200);
      else if(previous?.channel?.id===report.channel?.id&&previous.referencePurpose)report.referencePurpose=previous.referencePurpose;
      project.referenceAnalysis=report;project.referenceInput=report.reference;project.referenceLimit=report.requestedLimit;delete project.referencePlan;markDirty();renderProject();notify('공개 영상 '+report.videos.length+'개를 수집했습니다. AI 제작 방향 분석으로 이어갈 수 있습니다.');
    }
    const keyGeneration=youtubeKeyGeneration,config=await api('/api/youtube/config');if(isCurrentResponse(keyGeneration,youtubeKeyGeneration))youtubeVerifiedAt=config.verifiedAt||null;
  }finally{referenceBusy=false;renderReference();renderSummary();}
}

function renderTasks(){
  for(const [kind,id] of [['channel-insight','#analysis-task'],['plan','#plan-task']]){
    const j=latestTask(jobs,project,kind),submitting=pendingSubmission?.kind===kind&&pendingSubmission.projectId===project?.id;
    const previous=kind==='plan'?latestTask(jobs.filter(j=>j.status==='complete'),project,kind):null;
    const prior=previous&&previous.id!==j?.id?'<h3>이전 완료 초안</h3>'+taskPanel(previous,project,kind):'';
    setHTML(id,taskPanel(j,project,kind,{submitting})+prior);
    if(kind==='plan'){$('#generate-plan').disabled=submitting||taskActive(j);$('#generate-plan').textContent=submitting||taskActive(j)?'기획·가사 생성 중…':'기획·가사 생성';}
  }
}
function renderSetup(){const button=$('#setup-connect');button.textContent=connected?'연결됨':'브릿지 연결';button.disabled=connected;$('#setup-bridge-state').textContent=connected?'이 PC의 설치 상태와 사양을 확인합니다.':'브릿지를 설치한 뒤 연결하세요.';$('#download-bridge').hidden=connected;$('#download-node').hidden=!!setupInfo?.tools?.node;setHTML('#setup-results',setupPanel(setupInfo,statusSnapshot,engineState.yue2));}
async function refreshSetup(){
  if(!connected){setupInfo=null;renderSetup();return;}
  setHTML('#setup-results','<p role="status">설치 상태와 PC 사양을 확인하고 있습니다…</p>');
  try{setupInfo=await api('/api/setup',{timeout:30000});renderSetup();}catch(e){setHTML('#setup-results','<p class="inline-note">'+esc(e.message)+'</p>');}
}
