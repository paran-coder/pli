export function extractTrackList(description,videoDuration){
 const entries=[];
 for(const line of String(description||'').split(/\r?\n/)){
  const match=line.match(/^\s*(?:[-•]\s*)?[\[(]?((?:\d{1,2}:)?\d{1,3}:\d{2})[\])]?(?:\s*[-–—|]\s*|\s+)(.+?)\s*$/);
  if(!match)continue;
  const parts=match[1].split(':').map(Number);if(parts.at(-1)>59||(parts.length===3&&parts[1]>59))continue;
  const seconds=parts.reduce((n,x)=>n*60+x,0);if(videoDuration>0&&seconds>=videoDuration)continue;
  entries.push({startSeconds:seconds,title:match[2]});
 }
 const ordered=entries.every((e,i)=>!i||e.startSeconds>entries[i-1].startSeconds);
 const intervals=ordered?entries.slice(1).map((e,i)=>e.startSeconds-entries[i].startSeconds):[];
 const repeatLabel=/(?:^|\n)\s*(?:repeat\b|replay\b|loop\b|반복(?:\s|:|$)|다시\s*재생)/i.test(String(description||''));
 const normalized=entries.map(e=>e.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''));
 const repeatedSequence=normalized.length>=4&&normalized.slice(2).some((title,i)=>title&&title===normalized[0]&&normalized[i+3]===normalized[1]);
 return {entries,ordered,intervalSampleSize:intervals.length,intervalSecondsMin:intervals.length?Math.min(...intervals):null,intervalSecondsMax:intervals.length?Math.max(...intervals):null,repeatHint:repeatLabel||repeatedSequence,repeatHintKind:repeatLabel?'description-label':repeatedSequence?'repeated-title-sequence':null,limitation:'설명에 적힌 시작 시각의 간격입니다. 마지막 곡 길이·실제 오디오 반복을 확정하지 않습니다.'};
}
export function productionCheck(insight,videos=[]){
 const plan=insight?.productionPlan;
 if(!plan){
  const text=String(insight?.planningBrief||''),count=text.match(/(\d+)\s*곡/),song=text.match(/(\d+)\s*분\s*(?:(\d+)\s*초)?\s*[~～–-]\s*(\d+)\s*분\s*(?:(\d+)\s*초)?/)||text.match(/(\d{1,2}):([0-5]\d)\s*[~～–-]\s*(\d{1,2}):([0-5]\d)/),total=text.match(/(?:약\s*)?(\d+)\s*[~～–-]\s*(\d+)\s*분/);
  if(count&&song&&total){const min=Number(count[1])*(Number(song[1])*60+Number(song[2]||0)),max=Number(count[1])*(Number(song[3])*60+Number(song[4]||0));if(Number(total[1])*60>max||Number(total[2])*60<min)return {status:'conflict',issues:[`문장에 함께 언급된 ${count[1]}곡과 개별 길이의 단순 합은 ${Math.round(min/60)}~${Math.round(max/60)}분입니다. 총 ${total[1]}~${total[2]}분 제안의 반복·곡 수 구성을 다시 확인하세요.`]};}
  return {status:'missing',requiresRefresh:/\d+\s*(?:곡|분|초)|\d+:\d{2}/.test(text),issues:['이전 분석에는 구조화된 제작 길이 정보가 없습니다. 최신 자료로 다시 분석하면 곡 수·곡 길이·총길이를 검사합니다.']};
 }
 const issues=[];
 for(const [key,min,max]of [['trackCount',1,50],['trackSecondsMin',1,3600],['trackSecondsMax',1,3600],['repeats',1,10],['totalSecondsMin',1,86400],['totalSecondsMax',1,86400]])if(!Number.isInteger(plan[key])||plan[key]<min||plan[key]>max)issues.push('제작 길이 '+key+' 값이 올바르지 않습니다.');
 if(issues.length)return {status:'conflict',issues};
 if(plan.trackSecondsMin>plan.trackSecondsMax||plan.totalSecondsMin>plan.totalSecondsMax)issues.push('길이 범위의 최소/최대 순서가 올바르지 않습니다.');
 const expectedMin=plan.trackCount*plan.trackSecondsMin*plan.repeats,expectedMax=plan.trackCount*plan.trackSecondsMax*plan.repeats;
 if(plan.totalSecondsMin<expectedMin||plan.totalSecondsMax>expectedMax)issues.push(`곡 수×곡 길이×반복의 범위 ${expectedMin}~${expectedMax}초와 제안 총길이 ${plan.totalSecondsMin}~${plan.totalSecondsMax}초가 맞지 않습니다.`);
 const ids=plan.repeatEvidenceVideoIds;
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!videos.some(v=>v.id===id)))issues.push('반복 근거 영상이 수집 자료와 일치하지 않습니다.');
 if(plan.repeats>1&&(!Array.isArray(ids)||!ids.length||!ids.some(id=>{const v=videos.find(v=>v.id===id);return v?.descriptionComplete===true&&extractTrackList(v.description,v.duration).repeatHint;})))issues.push('반복 구성의 설명·트랙 목록 근거가 없습니다. 확인 전에는 1회 구성으로 제안하세요.');
 return {status:issues.length?'conflict':'valid',issues,expectedMin,expectedMax};
}
export const formatMusicSeconds=seconds=>{const m=Math.floor(seconds/60),s=seconds%60;return m+'분'+(s?' '+s+'초':'');};
