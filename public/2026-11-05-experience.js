import {escapeHTML} from './2026-11-04-workflow.js';
const esc=escapeHTML;
export function latestTask(jobs,project,kind){
 if(!project)return null;
 return jobs.filter(j=>j.projectId===project.id&&j.kind===kind&&(kind!=='channel-insight'||(j.result?.sourceSnapshotId||j.input?.project?.referenceAnalysis?.snapshotId)===project.referenceAnalysis?.snapshotId)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;
}
export const taskActive=j=>!!j&&['queued','running'].includes(j.status);
export function planContext(p){return JSON.stringify([p?.genre,p?.mood,p?.language,p?.count,p?.brief,p?.referencePlan||null]);}
export function taskPanel(job,project,kind,{submitting=false}={}){
 if(submitting)return '<div class="inline-note" role="status">요청을 보내고 있습니다. 이 화면에서 기다려주세요.</div>';
 if(!job&&kind==='channel-insight'&&project?.referenceAnalysis?.insight)return '<p class="inline-note">저장된 AI 분석입니다. 아래 결과를 검토하거나 다시 분석할 수 있습니다.</p>';
 if(!job)return '<p class="muted">'+(kind==='plan'?'생성한 초안을 이 화면에서 검토한 뒤 기존 곡에 추가할 수 있습니다.':'채널을 수집한 뒤 AI 분석을 실행하세요. 결과가 이 화면에 표시됩니다.')+'</p>';
 const title=kind==='plan'?'기획·가사':'채널 제작 방향';
 if(taskActive(job))return `<div class="inline-note" role="status"><strong>${title} ${job.status==='queued'?'대기 중':'분석·생성 중'}</strong><p>다른 화면으로 이동할 필요가 없습니다. 완료되면 여기에 결과가 표시됩니다.</p><button class="secondary" data-cancel="${esc(job.id)}">작업 취소</button></div>`;
 if(job.status!=='complete')return `<div class="inline-note" role="status"><strong>${title} ${esc({error:'실패',cancelled:'취소됨',interrupted:'중단됨'}[job.status]||'확인 필요')}</strong><p>${esc(job.message||'연결 상태를 확인한 뒤 다시 실행하세요.')}</p><p class="muted">기존 결과와 작성한 곡은 유지됩니다. 자세한 기록은 작업 기록에서 확인할 수 있습니다.</p></div>`;
 if(kind!=='plan')return '<p class="inline-note" role="status">AI 분석 완료 · 아래에서 결과와 근거를 확인하고 곡 기획에 반영하세요.</p>';
 const tracks=job.result?.result?.tracks;
 if(!Array.isArray(tracks))return '<p class="inline-note">결과 형식을 확인할 수 없습니다. 작업 기록을 확인하세요.</p>';
 const applied=project.appliedPlanJobs?.includes(job.id);
 if(applied)return `<p class="inline-note" role="status">${tracks.length}곡을 현재 곡에 추가했습니다.</p>`;
 return `<article class="panel"><div class="section-head"><h2>생성된 초안 · ${tracks.length}곡</h2><span class="badge">${applied?'추가됨':'검토 대기'}</span></div>${planContext(project)!==planContext(job.input?.project)?'<p class="inline-note">생성 요청 이후 기획 설정이 바뀌었습니다. 이 초안은 요청 당시 설정을 기준으로 작성됐습니다.</p>':''}${tracks.map((t,i)=>`<details><summary>${i+1}. ${esc(t.title)}</summary><h3>음악 스타일</h3><p>${esc(t.style)}</p><h3>가사</h3><pre>${esc(t.lyrics)}</pre></details>`).join('')}<button class="secondary" data-apply-plan="${esc(job.id)}" ${applied?'disabled':''}>${applied?'현재 곡에 추가했습니다':'검토한 초안을 현재 곡에 추가'}</button><p class="muted">기존 곡과 가사는 자동 교체하지 않습니다.</p></article>`;
}
export const setupLinks={node:'https://nodejs.org/en/download',ffmpeg:'https://ffmpeg.org/download.html',codex:'https://developers.openai.com/codex/cli',claude:'https://code.claude.com/docs/en/setup',yue2:'https://github.com/timoncool/YuE2-Studio/releases',capcut:'https://www.capcut.com/tools/desktop-video-editor'};
export function setupPanel(info,status,yueConnection){
 const keys=[['ffmpeg','FFmpeg','음원 처리·CapCut 미디어 준비'],['ffprobe','FFprobe','음원 길이 확인'],['codex','GPT · Codex CLI','기획 AI'],['claude','Claude CLI','선택 · 두 번째 기획 AI'],['yue2','YuE2 Studio','선택 · 로컬 음악 생성'],['capcut','CapCut','최종 편집']];
 if(!info)return '<p class="inline-note">로컬 브릿지가 연결되면 설치 여부와 PC 사양을 확인할 수 있습니다. 브라우저만으로 설치 상태를 확인하지 않습니다.</p>';
 return `<p class="muted">확인된 PC: OS 인식 RAM 약 ${esc(info.ramGB)} GB · ${esc(info.gpus?.map(g=>g.name+' / '+g.vramGB+' GB VRAM').join(', ')||'GPU 확인 불가')}</p><div class="setup-grid">${keys.map(([key,title,reason])=>{const installed=info.tools[key];const yue=info.yue2;
  const yueAction=key!=='yue2'?'':yue?.projectCopy?
    `<button class="secondary" data-check-engine="yue2" ${yueConnection?.modelReady===true&&yueConnection?.storageInWorkspace===true?'disabled':''}>${yueConnection?.modelReady===true&&yueConnection?.storageInWorkspace===true?'연결됨':'실행 및 연결'}</button>${yueConnection?.modelReady===false?'<p>모델이 아직 준비되지 않았습니다. Studio의 모델 설정에서 권장 구성을 다운로드하세요.</p><button class="secondary" data-show-yue2>Studio 모델 설정 열기</button>':''}`:
    yue?.installed?'<p>기존 설치를 찾았습니다. 프로젝트용 복사본을 준비합니다.</p><button class="secondary" data-prepare-yue2>프로젝트용 YuE2 준비</button>':'';
  const cli=['codex','claude'].includes(key)?status?.cli?.[key]:null;return `<article class="setup-item"><h3>${title}</h3><span class="badge">${installed?'설치 확인':'미설치 또는 위치 확인 필요'}${cli?(cli.authenticated?' · 로그인 확인':' · 로그인 필요'):''}</span><p class="muted">${reason}</p>${installed?'<p>이미 설치된 도구를 사용합니다.</p>'+yueAction:`<a class="secondary" href="${setupLinks[key==='ffprobe'?'ffmpeg':key]}" target="_blank" rel="noopener noreferrer">${key==='yue2'?'YuE2 Studio 다운로드 ↗':'공식 다운로드·설치 안내 ↗'}</a>`}</article>`;}).join('')}</div><div class="inline-note"><strong>YuE2 구성 안내</strong><p>${esc(info.yueRecommendation)}</p><p>Studio 앱 버전과 모델 구성은 다릅니다. 설치 후 Studio가 안내하는 GPU·드라이버·모델 준비 상태를 확인하고, 연결 확인으로 다시 점검하세요.</p><a href="https://github.com/timoncool/YuE2-Studio" target="_blank" rel="noopener noreferrer">개발자 사양·모델 안내 ↗</a></div>`;
}
