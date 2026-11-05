import {productionCheck,formatMusicSeconds} from './2026-11-05-music-structure.js';
import {titlePatternSummary} from './2026-11-05-title-patterns.js';
export const phases={analysis:{title:'참고 채널 분석',action:null},plan:{title:'곡 기획·가사',action:'기획·가사 생성'},tracks:{title:'음악 생성·선택',action:'음악 엔진 연결'},audio:{title:'무음·음량 조정',action:null},images:{title:'이미지',action:null},export:{title:'CapCut 전달',action:null},setup:{title:'시작·설치 확인',action:null},jobs:{title:'작업 기록',action:null},connections:{title:'연결과 설정',action:null}};
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHTML;
export const productionTracks=p=>(p?.tracks||[]).filter(t=>!t.excluded&&t.audioId);
export function audioSignature(p){return JSON.stringify({normalize:p?.normalize!==false,tracks:productionTracks(p).map(t=>({audioId:t.audioId||'',start:Number(t.trimStart)||0,end:t.trimEnd==null||t.trimEnd===''?null:Number(t.trimEnd)}))});}
export function exportSignature(p){return JSON.stringify({audio:audioSignature(p),tracks:productionTracks(p).map(t=>({title:t.title,imageId:t.imageId||''}))});}
export const isExportCurrent=(job,p)=>!!p&&job.kind==='render'&&job.status==='complete'&&job.projectId===p.id&&exportSignature(job.input?.project)===exportSignature(p);
export const capcutSignature=p=>JSON.stringify({name:p?.name||'',timeline:exportSignature(p)});
export const isCapCutCurrent=(job,p)=>!!p&&job.kind==='capcut'&&job.status==='complete'&&job.projectId===p.id&&capcutSignature(job.input?.project)===capcutSignature(p);
export function workflowState(project,assets,jobs=[]){
  const tracks=project?.tracks||[],known=new Map(assets.map(a=>[a.id,a]));
  const lyrics=tracks.filter(t=>t.lyrics?.trim()&&t.style?.trim()).length;
  const audio=tracks.filter(t=>known.get(t.audioId)?.kind==='audio').length,images=tracks.filter(t=>known.get(t.imageId)?.kind==='image').length;
  let length=0,unknown=0;for(const t of tracks){const asset=known.get(t.audioId);if(!asset?.duration){unknown++;continue;}length+=Math.max(0,Math.min(Number(t.trimEnd)||asset.duration,asset.duration)-(Number(t.trimStart)||0));}
  return {count:tracks.length,lyrics,audio,images,duration:tracks.length&&!unknown?length:null,channel:project?.referenceAnalysis?.videos?.length??null,audioReviewed:!!project?.audioReviewFingerprint&&project.audioReviewFingerprint===audioSignature(project),capcutReady:jobs.some(j=>isCapCutCurrent(j,project)),exported:jobs.some(j=>isExportCurrent(j,project))};
}
const heading=(t,i)=>`<div class="track-heading"><h3><span class="track-number">${String(i+1).padStart(2,'0')}</span>${esc(t.title)}</h3>`;
const options=(assets,kind,id)=>'<option value="">파일 선택</option>'+assets.filter(a=>a.kind===kind).map(a=>`<option value="${esc(a.id)}" ${a.id===id?'selected':''}>${esc(a.name)}</option>`).join('');
const audioPreview=t=>t.audioId?`<audio controls preload="none" data-asset-preview="${esc(t.audioId)}"></audio>`:'선택한 음원이 없습니다.';
const empty='<div class="empty">02 곡 기획·가사에서 곡을 먼저 추가하세요.</div>';
export function musicTracks(p,assets,jobs=[]){
 return p?.tracks?.length?p.tracks.map((t,i)=>{
  const related=jobs.filter(j=>j.kind==='music'&&j.projectId===p.id&&j.input?.trackId===t.id);
  const active=related.find(j=>['queued','running'].includes(j.status)),latest=related[0];
  const candidates=related.flatMap(j=>(j.status==='complete'?j.result?.songs||[]:[]).map((song,index)=>({song,index,job:j})));
  const status=active?(active.status==='queued'?'대기 중':'생성 중'):latest?.status==='complete'?(candidates.length?'생성 완료':'엔진 응답 확인 필요'):latest?.status==='unknown'?'결과 확인 필요':latest?'생성 상태 확인':'';
  const button=active?'':`<button class="primary" data-music="${esc(t.id)}" ${latest?.status==='unknown'?'disabled':''}>${candidates.length?'다시 생성':p.engine==='yue2'?'YuE2로 생성':'Suno로 생성'}</button>`;
  const takes=candidates.filter(({song})=>song.audioId!==t.audioId).map(({song,index,job})=>`<div class="music-source"><strong>${esc(song.title)}</strong><audio controls preload="none" data-asset-preview="${esc(song.audioId)}"></audio><button class="secondary" data-apply-music="${esc(job.id)}" data-take="${index}">이 음원 사용</button></div>`).join('');
  return `<article class="track-card music-track" data-track="${esc(t.id)}">${heading(t,i)}<div class="button-row">${status?`<span class="badge">${status}</span>`:''}${button}</div></div>
  ${latest?.message?`<p class="inline-note">${esc(latest.message)}</p>`:''}
  ${t.audioId?`<p>${t.excluded?'이번 작업에서 제외됨':'음원 연결됨'}</p><div class="media-preview">${audioPreview(t)}</div>`:'<p class="muted">음악을 생성하거나 파일을 가져오세요.</p>'}
  ${takes?`<details ${t.audioId?'':'open'}><summary>이 곡의 생성 후보</summary>${takes}</details>`:''}
  <div class="button-row">${t.audioId?`<button class="secondary" data-toggle-track="${esc(t.id)}">${t.excluded?'다시 포함':'이번에는 제외'}</button>`:''}<label class="upload">＋ 음원 파일 가져오기<input type="file" accept=".mp3,.wav,.flac,.m4a,.ogg" data-upload="audio" data-track-id="${esc(t.id)}"></label></div></article>`;
 }).join(''):empty;
}
function silenceResult(track,project,jobs){
 const job=jobs.find(j=>j.kind==='silence'&&j.projectId===project.id&&j.input?.trackId===track.id&&j.input.audioId===track.audioId);
 if(!job)return '';
 if(job.status==='complete')return `<p class="inline-note">추천 구간 ${Number(job.result.suggestedStart).toFixed(2)}–${Number(job.result.suggestedEnd).toFixed(2)}초 <button class="secondary" data-apply-trim="${esc(job.id)}">추천 구간 적용</button></p>`;
 return `<p class="inline-note" role="status">${esc(job.message||(job.status==='queued'?'분석 대기 중':'무음 분석 중'))}</p>`;
}
export function audioTracks(p,jobs=[]){return productionTracks(p).length?productionTracks(p).map((t,i)=>`<article class="track-card" data-track="${esc(t.id)}">${heading(t,i)}<button class="secondary" data-silence="${esc(t.id)}" ${!t.audioId?'disabled':''}>무음 구간 분석</button></div><div class="media-preview">${audioPreview(t)}</div>${silenceResult(t,p,jobs)}<div class="form-grid"><label>트림 시작 (초)<input data-field="trimStart" type="number" min="0" step="0.1" value="${esc(t.trimStart||0)}"></label><label>트림 끝 (초)<input data-field="trimEnd" type="number" min="0" step="0.1" value="${esc(t.trimEnd??'')}" placeholder="원본 끝까지"></label></div></article>`).join(''):empty;}
export function imageTracks(p,assets,jobs=[],configured=false){return productionTracks(p).length?productionTracks(p).map((t,i)=>`<article class="track-card" data-track="${esc(t.id)}">${heading(t,i)}</div><div class="media-grid"><div class="media-preview">${t.imageId?`<img data-asset-preview="${esc(t.imageId)}" alt="${esc(t.title)} 배경 이미지">`:'준비된 이미지 없음'}</div><div class="media-column"><label class="upload">${t.imageId?'이미지 변경':'＋ 이미지 가져오기'}<input type="file" accept=".png,.jpg,.jpeg,.webp" data-upload="image" data-track-id="${esc(t.id)}"></label>${imageActions(t,p,jobs,configured)}${t.imageId?`<button class="secondary" data-apply-image="${esc(t.imageId)}">이 이미지를 모든 곡에 적용</button>`:''}</div></div></article>`).join(''):empty;}
function imageActions(track,project,jobs,configured){
 const related=jobs.filter(j=>j.kind==='image'&&j.projectId===project.id&&j.input?.trackId===track.id);
 const latest=related[0],candidate=related.find(j=>j.status==='complete'&&j.result?.assetId)?.result.assetId;
 const active=latest&&['queued','running'].includes(latest.status);
 return `<button class="secondary" data-generate-image="${esc(track.id)}" ${!configured||active?'disabled':''}>${active?'이미지 생성 중':candidate?'다시 생성':track.lyrics?.trim()?'가사로 이미지 생성':'제목·스타일로 이미지 생성'}</button>
 ${latest?.message?`<p class="inline-note">${esc(latest.message)}</p>`:''}
 ${candidate&&candidate!==track.imageId?`<div class="media-preview"><img alt="새 이미지 후보" data-asset-preview="${esc(candidate)}"></div><button class="primary" data-use-image="${esc(candidate)}" data-image-track="${esc(track.id)}">이 이미지 사용</button>`:''}`;
}
const number=n=>n==null?'미수집':Math.round(n).toLocaleString('ko-KR');
export function channelReport(report){
  if(!report)return '<div class="empty"><h3>참고 채널을 선택하세요.</h3>채널 주소나 @핸들로 공개 데이터를 수집한 뒤 AI 제작 방향을 분석합니다.</div>';
  const purpose=report.referencePurpose?'<p class="inline-note"><strong>참고 목적</strong> · '+esc(report.referencePurpose)+'</p>':'';
  const {channel:c,statistics:s,videos}=report,byId=new Map(videos.map(v=>[v.id,v]));
  const eligible=videos.filter(v=>!['live','upcoming'].includes(v.broadcast)),long=eligible.filter(v=>v.duration>=600),onlyLong=long.length===eligible.length&&long.length>0;
  const patterns=titlePatternSummary(long.length?long:eligible);
  const tags=list=>list.map(k=>`<span>${esc(k.word)} · ${k.count}개 영상</span>`).join('')||'<span>비교할 키워드가 없습니다.</span>';
  const top=long.filter(v=>v.views!=null).sort((a,b)=>b.views-a.views).slice(0,5);
  const groupRows=s.groups?[['long','10분 이상'],['medium','3분 초과~10분 미만'],['short','3분 이하'],['unknown','길이 미확인'],['broadcast','진행·예정 라이브']].map(([key,label])=>`<tr><td>${label}</td><td>${s.groups[key].count}</td><td>${s.groups[key].count?number(s.groups[key].medianViews):'—'}</td></tr>`).join(''):'';
  return `${purpose}<article class="panel"><div class="section-head"><div><h2>${esc(c.title)}</h2><p class="muted">최근 ${report.requestedLimit}개 범위에서 ${videos.length}개 수집 · ${esc(report.source)}</p></div><a class="secondary" href="${esc(c.url)}" target="_blank" rel="noreferrer">YouTube 채널 ↗</a></div>
  <p class="muted">구독자 ${c.subscribers==null?'비공개 또는 미수집':'약 '+number(c.subscribers)} · 공개 영상 ${number(c.publicVideoCount)} · ${esc(s.sampleStart?.slice(0,10)||'기간 미확인')}~${esc(s.sampleEnd?.slice(0,10)||'기간 미확인')} · 수집 ${esc(new Date(report.collectedAt).toLocaleString('ko-KR'))}</p>
  <div class="metrics-grid">${[['표본 중앙 조회수',number(s.medianViews)],['표본 평균 조회수',number(s.averageViews)],['평균 영상 길이',s.averageDuration==null?'—':Math.round(s.averageDuration/60)+'분'],['평균 게시 간격',s.averageUploadDays==null?'표본 부족':s.averageUploadDays.toFixed(1)+'일']].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
  ${s.averageViews>s.medianViews&&s.medianViews>0?'<p class="inline-note">평균이 중앙값보다 높습니다. 높은 조회수의 일부 영상 영향을 함께 확인하세요. 최근 표본의 누적 조회수 비교이며 성공 원인을 단정할 수 없습니다.</p>':''}
  ${(s.count??s.videoSampleSize)<5?'<p class="inline-note">집계 가능한 표본이 5개 미만입니다. 제작 방향을 일반화하기 어렵습니다.</p>':''}
  ${long.length<5?'<p class="inline-note">10분 이상 영상 표본이 5개 미만입니다. 긴 플레이리스트 참고 근거가 적습니다.</p>':''}
  ${report.partial?`<p class="inline-note">일부 영상을 가져오지 못했습니다 (${report.unavailableCount}개). 아래 지표는 수집된 영상만 사용합니다.</p>`:''}
  ${report.sample?.pageLimitReached?'<p class="inline-note">페이지 조회 제한으로 요청 표본을 모두 확인하지 못했습니다.</p>':''}
  <h3>반복되는 채널 문구</h3><p class="muted">${long.length?'10분 이상 영상':'집계 가능한 영상'} 제목의 80% 이상에 반복된 단어·구문입니다. 고정 문구와 개별 주제를 구분해 참고하세요.</p><div class="tag-list">${tags(patterns.common)}</div>
  <h3>영상별로 달라지는 주제 키워드</h3><div class="tag-list">${tags(patterns.topics)}</div>
  <p class="muted">${onlyLong?'모든 분석 영상이 10분 이상이므로 전체/긴 영상 키워드를 중복 표시하지 않습니다.':'긴 영상이 있으면 해당 표본의 제목을 우선 비교합니다.'} 같은 영상 내 중복은 한 번만 셉니다. 구문 묶기는 제목의 문자 패턴이며 실제 음악 의미 분석이 아닙니다.</p>
  <h3>최근 표본 내 10분 이상 조회수 상위 영상</h3><p class="muted">채널 전체 역대 순위가 아닙니다. 게시일부터 누적된 기간이 다르므로 조회수 증가 속도로 해석하지 마세요.</p>
  <div class="reference-cards">${top.map(v=>`<article class="reference-card">${v.thumbnail?`<img src="${esc(v.thumbnail)}" alt="" loading="lazy">`:''}<div><a href="https://www.youtube.com/watch?v=${esc(encodeURIComponent(v.id))}" target="_blank" rel="noreferrer">${esc(v.title)}</a><p>${number(v.views)}회 · ${esc(v.publishedAt?.slice(0,10)||'게시일 미확인')}</p></div></article>`).join('')||'<p>비교할 긴 영상 없음</p>'}</div>
  ${groupRows?`<details><summary>길이별 표본 비교${onlyLong?' · 모두 10분 이상':''}</summary><div class="table-wrap"><table><thead><tr><th>길이 구간</th><th>영상 수</th><th>조회수 중앙값</th></tr></thead><tbody>${groupRows}</tbody></table></div></details>`:'<p class="muted">이전 집계 방식의 저장본입니다. 최신 통계에는 다시 수집하세요.</p>'}
  <details><summary>분석 범위와 한계</summary><p>공개 메타데이터 기반 비교입니다. Shorts 여부는 길이만으로 확정할 수 없고 조회수 집계 방식이 다를 수 있습니다. 실시간 증가·최적 업로드 시간·시청 지속률·수익·실제 장르/BPM은 확인하지 않습니다. 구독자 수는 유효숫자 3자리로 내림한 공개 값입니다. 진행·예정 라이브는 집계에서 제외하며 종료된 방송 이력은 별도 확인하지 않습니다.</p><p>10분 이상은 이 앱의 긴 영상 비교 기준입니다. 3분 이하는 Shorts 판정이 아닙니다.</p></details>
  <details><summary>참고 영상과 분석 근거 (${videos.length}개)</summary><div class="table-wrap"><table><thead><tr><th>썸네일</th><th>영상 제목</th><th>게시일</th><th>조회수</th><th>좋아요·댓글</th><th>길이</th></tr></thead><tbody>${videos.map(v=>`<tr><td>${v.thumbnail?`<img src="${esc(v.thumbnail)}" alt="" loading="lazy">`:'—'}</td><td><a href="${esc(v.url)}" target="_blank" rel="noreferrer">${esc(v.title)}</a></td><td>${esc(v.publishedAt?.slice(0,10)||'미수집')}</td><td>${number(v.views)}</td><td>${number(v.likes)} · ${number(v.comments)}</td><td>${['live','upcoming'].includes(v.broadcast)?'진행·예정 라이브':v.duration==null?'미수집':Math.floor(v.duration/60)+':'+String(Math.floor(v.duration%60)).padStart(2,'0')}</td></tr>`).join('')}</tbody></table></div></details></article>`;
}
export function channelInsight(report){
  const ai=report?.insight;if(!ai)return '';
  const check=productionCheck(ai,report.videos),plan=ai.productionPlan;
  const structure=check.status==='valid'?`<div class="panel"><div class="section-head"><h3>제안 제작 구성 · 길이 검사 통과</h3><span class="badge">창작 권장안</span></div><p>${plan.trackCount}곡 × ${formatMusicSeconds(plan.trackSecondsMin)}~${formatMusicSeconds(plan.trackSecondsMax)} × ${plan.repeats}회 구성</p><p><strong>권장 총길이 ${formatMusicSeconds(plan.totalSecondsMin)}~${formatMusicSeconds(plan.totalSecondsMax)}</strong></p><p class="muted">계산 범위 ${formatMusicSeconds(check.expectedMin)}~${formatMusicSeconds(check.expectedMax)} 안의 제안입니다. 실제 생성된 곡 길이는 다를 수 있습니다. 곡 수·반복은 자동으로 설정하지 않는 제작 권장안입니다.${plan.repeats>1?' 반복은 설명의 표기/트랙명 단서를 참고한 구성이며 실제 오디오 반복은 확인하지 않았습니다.':''}</p></div>`:`<div class="inline-note"><strong>${check.status==='conflict'?'제작 길이 구성 확인 필요':'이전 분석 · 길이 검사 정보 없음'}</strong><p>${esc(check.issues.join(' '))}</p><p>다시 분석하면 전체 트랙 목록을 갱신하고 제작 구성을 검사합니다.</p></div>`;

  return `<article class="panel"><div class="section-head"><h2>AI 제작 방향 해석</h2><span class="badge pending">메타데이터 기반 추정</span></div>${structure}<details><summary>수집 사실과 해석 요약</summary><p>${esc(ai.summary)}</p></details><div class="form-grid"><div><h3>장르·분위기</h3><p>${esc(ai.genre)} · ${esc(ai.mood)}</p></div><div><h3>원곡 제작 방향</h3><p>${esc(ai.planningBrief)}</p></div></div><h3>제목 패턴</h3><ul>${ai.titlePatterns.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><h3>이미지 방향 제안</h3><ul>${ai.visualNotes.map(v=>`<li>${esc(v)}</li>`).join('')||'<li>추가 제안 없음</li>'}</ul><details><summary>AI 해석의 영상 근거</summary><ul class="evidence-list">${ai.evidence.map(e=>`<li>${esc(e.claim)}<br>${e.videoIds.map(id=>`<a href="https://www.youtube.com/watch?v=${esc(encodeURIComponent(id))}" target="_blank" rel="noreferrer">${esc(id)}</a>`).join(' · ')}</li>`).join('')}</ul></details><button id="apply-channel-plan" class="primary" ${check.status==='conflict'||check.requiresRefresh?'disabled':''}>이 분석을 곡 기획에 반영</button></article>`;
}
