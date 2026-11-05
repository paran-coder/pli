import {extractTrackList,productionCheck} from '../public/2026-11-05-music-structure.js';
import {titlePatternSummary} from '../public/2026-11-05-title-patterns.js';
import {randomUUID} from 'node:crypto';

export function parseChannelRef(input){
  let value=String(input||'').trim();
  if(/^https?:\/\//i.test(value)){
    const u=new URL(value);if(!['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname))throw new Error('유튜브 채널 주소를 입력하세요.');
    let parts;try{parts=u.pathname.split('/').filter(Boolean).map(decodeURIComponent);}catch{throw new Error('유튜브 채널 주소의 문자 인코딩을 확인하세요.');}
    if(parts[0]==='channel')value=parts[1]||'';
    else if(parts[0]?.startsWith('@'))value=parts[0];
    else if(parts[0]==='user'&&parts[1])return {forUsername:parts[1]};
    else throw new Error('유튜브 /@핸들 또는 /channel/채널ID 주소를 입력하세요.');
  }
  if(/^UC[\w-]{22}$/.test(value))return {id:value};
  if(/^@[^\s/?#]{1,100}$/.test(value))return {forHandle:value.slice(1)};
  throw new Error('유튜브 채널 URL, @핸들 또는 채널 ID를 입력하세요.');
}
const numeric=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const average=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const median=a=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const isBroadcast=v=>['live','upcoming'].includes(v.broadcast);
const titleWords=videos=>{
  const stop=new Set(['the','and','for','with','you','playlist','music','플레이리스트','음악','to','vol','volume']);
  const counts=new Map();
  for(const v of videos)for(const word of new Set(String(v.title||'').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]))if(!stop.has(word))counts.set(word,(counts.get(word)||0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12).map(([word,count])=>({word,count}));
};
export function channelStatistics(videos){
  const eligible=videos.filter(v=>!isBroadcast(v));
  const group=items=>{const views=items.map(v=>numeric(v.views)).filter(n=>n!==null);return {count:items.length,viewSampleSize:views.length,averageViews:average(views),medianViews:median(views)};};
  const long=eligible.filter(v=>numeric(v.duration)>=600),short=eligible.filter(v=>numeric(v.duration)>0&&numeric(v.duration)<=180),medium=eligible.filter(v=>numeric(v.duration)>180&&numeric(v.duration)<600),unknown=eligible.filter(v=>!numeric(v.duration));
  const durations=eligible.map(v=>numeric(v.duration)).filter(v=>v>0);
  const dates=eligible.map(v=>Date.parse(v.publishedAt)).filter(Number.isFinite).sort((a,b)=>b-a),intervals=dates.slice(1).map((v,i)=>(dates[i]-v)/86400000);
  const hours=Array.from({length:24},(_,hour)=>({hour,count:0}));
  for(const time of dates){const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date(time)));if(hours[hour])hours[hour].count++;}
  return {videoSampleSize:videos.length,...group(eligible),averageDuration:average(durations),averageUploadDays:average(intervals),uploadHours:hours,timeZone:'Asia/Seoul',growthTrend:null,titlePatterns:titlePatternSummary(eligible),keywords:titleWords(eligible),longKeywords:titleWords(long),groups:{long:group(long),short:group(short),medium:group(medium),unknown:group(unknown),broadcast:group(videos.filter(isBroadcast))},topLongVideos:long.filter(v=>numeric(v.views)!==null).sort((a,b)=>b.views-a.views).slice(0,5).map(v=>({id:v.id,title:v.title,views:v.views,duration:v.duration,publishedAt:v.publishedAt})),sampleStart:dates.length?new Date(dates.at(-1)).toISOString():null,sampleEnd:dates.length?new Date(dates[0]).toISOString():null};
}
function safeThumbnail(snippet){
  const raw=snippet?.thumbnails?.medium?.url||snippet?.thumbnails?.default?.url||'';
  try{const u=new URL(raw);return u.protocol==='https:'&&['i.ytimg.com','yt3.ggpht.com','yt3.googleusercontent.com'].includes(u.hostname)?u.href:'';}catch{return '';}
}
function duration(value){const m=String(value||'').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);return m?Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0):null;}
async function youtube(path,params,{apiKey,fetchImpl=fetch}={}){
  if(!apiKey)throw Object.assign(new Error('YouTube API 키가 없습니다. 연결과 설정에서 입력하세요.'),{code:'YOUTUBE_KEY_REQUIRED'});
  const u=new URL('https://www.googleapis.com/youtube/v3/'+path);for(const [k,v]of Object.entries({...params,key:apiKey}))u.searchParams.set(k,String(v));
  let response;try{response=await fetchImpl(u.href,{signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Object.assign(new Error('YouTube에 연결하지 못했습니다. 네트워크를 확인하세요.'),{code:'YOUTUBE_NETWORK'});}
  let data;try{data=await response.json();}catch{throw new Error('YouTube 응답을 읽을 수 없습니다.');}
  if(!response.ok){
    const reasons=(data.error?.errors||[]).map(e=>e.reason);
    if(reasons.some(r=>/quota|dailyLimit/i.test(r)))throw Object.assign(new Error('YouTube API 할당량에 도달했습니다. 기존 분석은 보존됩니다.'),{code:'YOUTUBE_QUOTA'});
    throw Object.assign(new Error(response.status===400||response.status===403?'YouTube API 키와 Data API 사용 설정을 확인하세요.':`YouTube 요청에 실패했습니다 (HTTP ${response.status}).`),{code:'YOUTUBE_API_ERROR'});
  }
  return data;
}
export async function searchChannels(query,{pageToken,...options}={}){
  if(typeof query!=='string'||!query.trim()||query.length>100)throw new Error('검색어를 1~100자로 입력하세요.');
  if(pageToken!==undefined&&(typeof pageToken!=='string'||pageToken.length>512))throw new Error('검색 페이지가 올바르지 않습니다.');
  const data=await youtube('search',{part:'snippet',type:'channel',q:query.trim(),maxResults:20,...(pageToken?{pageToken}:{})},options);
  const hits=(data.items||[]).filter(item=>item.id?.channelId);
  const ids=[...new Set(hits.map(item=>item.id.channelId))];
  let metadata=new Map();
  if(ids.length){
    const details=await youtube('channels',{part:'snippet,statistics',id:ids.join(',')},options).catch(()=>null);
    metadata=new Map((details?.items||[]).map(item=>[item.id,item]));
  }
  const channels=hits.map(hit=>{
    const id=hit.id.channelId,detail=metadata.get(id);
    const snippet=detail?.snippet||hit.snippet,stats=detail?.statistics;
    const subscribersHidden=stats?.hiddenSubscriberCount===true;
    return {
      id,title:String(snippet?.title||''),description:String(snippet?.description||'').slice(0,600),
      thumbnail:safeThumbnail(snippet),url:'https://www.youtube.com/channel/'+encodeURIComponent(id),
      subscribers:subscribersHidden?null:numeric(stats?.subscriberCount),subscribersHidden,
      publicVideoCount:numeric(stats?.videoCount),totalViews:numeric(stats?.viewCount)
    };
  });
  return {channels,nextPageToken:data.nextPageToken||null};
}
export async function previewChannel(channelId,options){
  if(typeof channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))throw new Error('채널 ID를 확인하세요.');
  const channel=await youtube('channels',{part:'contentDetails',id:channelId},options);
  const uploads=channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads)return [];
  const ids=new Set();
  const videos=new Map();
  let pageToken;
  // Skip unavailable uploads without loading an entire channel for a preview.
  for(let page=0;page<3&&videos.size<3;page++){
    const listing=await youtube('playlistItems',{part:'contentDetails',playlistId:uploads,maxResults:5,...(pageToken?{pageToken}:{})},options);
    const batch=[];
    for(const row of listing.items||[]){
      const id=row.contentDetails?.videoId;
      if(id&&!ids.has(id)){ids.add(id);batch.push(id);}
    }
    if(batch.length){
      const data=await youtube('videos',{part:'snippet,statistics,status',id:batch.join(',')},options);
      for(const item of data.items||[]){
        if(!ids.has(item.id)||item.status?.privacyStatus!=='public')continue;
        videos.set(item.id,{id:item.id,title:String(item.snippet?.title||'').slice(0,300),publishedAt:item.snippet?.publishedAt||null,views:numeric(item.statistics?.viewCount)});
      }
    }
    if(!listing.nextPageToken||listing.nextPageToken===pageToken)break;
    pageToken=listing.nextPageToken;
  }
  return [...videos.values()].sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,3);
}
export async function collectChannel(reference,{limit=20,...options}={}){
  if(![10,20,50].includes(Number(limit)))throw new Error('분석 범위는 최근 10·20·50개 중에서 선택하세요.');
  const channelData=await youtube('channels',{part:'snippet,statistics,contentDetails',...parseChannelRef(reference)},options);
  const item=channelData.items?.[0];if(!item)throw new Error('공개 채널을 찾을 수 없습니다. 주소를 확인하세요.');
  const playlist=item.contentDetails?.relatedPlaylists?.uploads;
  const ids=[],seenPages=new Set();let nextPage='',pages=0,exhausted=!playlist;
  while(playlist&&ids.length<Number(limit)&&pages<5){
    const list=await youtube('playlistItems',{part:'contentDetails',playlistId:playlist,maxResults:Number(limit)-ids.length,...(nextPage?{pageToken:nextPage}:{})},options);pages++;
    for(const entry of list.items||[]){const id=entry.contentDetails?.videoId;if(id&&!ids.includes(id)&&ids.length<Number(limit))ids.push(id);}
    nextPage=list.nextPageToken||'';if(!nextPage){exhausted=true;break;}if(seenPages.has(nextPage))break;seenPages.add(nextPage);
  }
  const data=ids.length?await youtube('videos',{part:'snippet,statistics,contentDetails',id:ids.join(',')},options):{items:[]};
  const videos=(data.items||[]).filter(v=>ids.includes(v.id)).map(v=>({id:v.id,url:'https://www.youtube.com/watch?v='+v.id,title:String(v.snippet?.title||'').slice(0,300),description:String(v.snippet?.description||''),descriptionComplete:true,trackList:extractTrackList(v.snippet?.description,duration(v.contentDetails?.duration)),publishedAt:v.snippet?.publishedAt||null,views:numeric(v.statistics?.viewCount),likes:numeric(v.statistics?.likeCount),comments:numeric(v.statistics?.commentCount),broadcast:v.snippet?.liveBroadcastContent||'none',duration:duration(v.contentDetails?.duration),thumbnail:safeThumbnail(v.snippet)})).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
  return {snapshotId:randomUUID(),collectedAt:new Date().toISOString(),source:'YouTube Data API',reference:String(reference).trim(),requestedLimit:Number(limit),sample:{listedCount:ids.length,returnedCount:videos.length,pages,exhausted,pageLimitReached:!exhausted&&ids.length<Number(limit)},partial:videos.length<ids.length,unavailableCount:ids.length-videos.length,channel:{id:item.id,title:String(item.snippet?.title||''),description:String(item.snippet?.description||'').slice(0,1000),url:'https://www.youtube.com/channel/'+item.id,thumbnail:safeThumbnail(item.snippet),subscribers:item.statistics?.hiddenSubscriberCount?null:numeric(item.statistics?.subscriberCount),totalViews:numeric(item.statistics?.viewCount),publicVideoCount:numeric(item.statistics?.videoCount)},videos,statistics:channelStatistics(videos)};
}
export function parseChannelInsight(raw,videoIds,{videos=[],requireProductionPlan=false}={}){
  let p=raw;
  if(typeof p==='string'){try{p=JSON.parse(p.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new Error('AI 분석 JSON을 읽을 수 없습니다.');}}
  for(const k of ['summary','genre','mood','planningBrief'])if(typeof p?.[k]!=='string'||!p[k].trim()||p[k].length>10000)throw new Error(`AI 분석 ${k} 형식이 올바르지 않습니다.`);
  for(const k of ['keywords','titlePatterns','visualNotes'])if(!Array.isArray(p[k])||p[k].length>30||p[k].some(v=>typeof v!=='string'||v.length>1000))throw new Error(`AI 분석 ${k} 형식이 올바르지 않습니다.`);
  if(!Array.isArray(p.evidence)||!p.evidence.length||p.evidence.length>30)throw new Error('AI 분석에 영상 근거가 필요합니다.');
  for(const e of p.evidence)if(typeof e.claim!=='string'||!e.claim.trim()||e.claim.length>2000||!Array.isArray(e.videoIds)||!e.videoIds.length||e.videoIds.some(id=>!videoIds.includes(id)))throw new Error('AI 분석 근거가 수집된 영상과 일치하지 않습니다.');
  const check=productionCheck(p,videos);
  if((requireProductionPlan&&!p.productionPlan)||check.status==='conflict')throw new Error('제작 구성 검증 실패: '+check.issues.join(' '));
  if(requireProductionPlan&&/\d+\s*(?:곡|분|초)|\d+:\d{2}/.test(p.planningBrief))throw new Error('제작 구성의 수치는 productionPlan에만 작성해야 합니다. 기획 설명에 중복된 수치를 넣지 마세요.');
  const result=Object.fromEntries(['summary','genre','mood','keywords','titlePatterns','visualNotes','planningBrief','evidence'].map(k=>[k,p[k]]));
  if(p.productionPlan)result.productionPlan=p.productionPlan;
  return result;
}
export function planningReference(project){
  const ref=project.referenceAnalysis,plan=project.referencePlan;
  if(!ref?.snapshotId||plan?.sourceSnapshotId!==ref.snapshotId||(productionCheck(plan,ref.videos).status==='conflict'||productionCheck(plan,ref.videos).requiresRefresh))return null;
  return {channelTitle:ref.channel?.title,channelUrl:ref.channel?.url,collectedAt:ref.collectedAt,metadataOnly:true,productionPlan:plan.productionPlan,brief:plan.planningBrief,genre:plan.genre,mood:plan.mood,keywords:plan.keywords,titlePatterns:plan.titlePatterns,evidence:plan.evidence,limitations:'공개 메타데이터 기반 추정. 실제 오디오·이미지 분석 아님.'};
}

export async function verifyYouTubeKey(options){const data=await youtube('channels',{part:'id',forHandle:'YouTube'},options);if(!data.items?.length)throw new Error('YouTube 확인 응답이 비어 있습니다.');return true;}
