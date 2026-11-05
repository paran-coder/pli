const stop=new Set(['the','and','for','with','you','your','to','of','in','on','a','an','it','is','that','this','from','at','as','by','vol','volume','playlist','music','플레이리스트','음악']);
const compounds=['laid back','groove pop','feel good','indie pop','lo fi','chill hop'];
export function titlePatternSummary(videos){
 const counts=new Map();
 for(const video of videos){
  let title=String(video.title||'').toLowerCase().replace(/[-_]/g,' ');
  for(const phrase of compounds)title=title.replaceAll(phrase,phrase.replaceAll(' ','~'));
  const words=new Set((title.match(/[\p{L}\p{N}~]{2,}/gu)||[]).map(w=>w.replaceAll('~',' ')).filter(w=>!stop.has(w)&&!/^\d+$/.test(w)));
  for(const word of words)counts.set(word,(counts.get(word)||0)+1);
 }
 const entries=[...counts].map(([word,count])=>({word,count})).sort((a,b)=>b.count-a.count||a.word.localeCompare(b.word));
 const common=entries.filter(e=>videos.length>=2&&e.count>=Math.ceil(videos.length*.8));
 return {sampleSize:videos.length,common:common.slice(0,12),topics:entries.filter(e=>!common.some(c=>c.word===e.word)).slice(0,12)};
}
