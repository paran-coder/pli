import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function classifyError(text) {
  const s = String(text).toLowerCase();
  if (/unauthorized|authentication|not logged|please (log|sign) ?in|login again|401/.test(s)) return 'auth';
  if (/quota.{0,30}(exceed|exhaust)|usage limit|credit.{0,30}(exhaust|insufficient)|insufficient credits|out of credits|hit your.*limit|rate_limit_error|rate limit|too many requests|\b429\b|한도.*(초과|소진)/.test(s)) return 'quota';
  if (/abort|cancel/.test(s)) return 'cancelled';
  if (/timeout|timed out|econn|network|fetch failed/.test(s)) return 'network';
  return 'unknown';
}

export async function routeAI(order, run, { fallback = true } = {}) {
  const attempts = [];
  for (const provider of order) {
    try {
      const result = await run(provider);
      attempts.push({provider,status:'complete'});
      return {provider,result,attempts};
    } catch (error) {
      const reason = classifyError(error.message);
      attempts.push({provider,status:'error',reason,message:String(error.message).slice(0,600)});
      if (reason !== 'quota' || !fallback) { error.attempts = attempts; throw error; }
    }
  }
  throw Object.assign(new Error('모든 AI 제공자의 사용량 한도에 도달했습니다. 결과를 보존하고 대기합니다.'), {code:'ALL_PROVIDERS_LIMITED',attempts});
}

export class SnapshotStore {
  constructor(dir) { this.dir = dir; }
  valid(id) { if (!/^[a-zA-Z0-9_-]{1,90}$/.test(id)) throw new Error('Invalid identifier'); }
  async save(id, value) {
    this.valid(id);
    await mkdir(this.dir,{recursive:true});
    const name = `2026-11-04-${id}-${Date.now()}-${process.hrtime.bigint()}-${randomUUID()}.json`;
    await writeFile(join(this.dir,name),JSON.stringify({id,savedAt:new Date().toISOString(),value},null,2),{flag:'wx',mode:0o600});
    return value;
  }
  async all() {
    await mkdir(this.dir,{recursive:true});
    const latest = new Map();
    const files = (await readdir(this.dir)).filter(n=>n.endsWith('.json')).sort();
    for (const file of files) {
      try { const item = JSON.parse(await readFile(join(this.dir,file),'utf8')); if(item.id && item.value) latest.set(item.id,item.value); }
      catch { /* A partial snapshot never destroys the last readable revision. */ }
    }
    return [...latest.entries()];
  }
  async get(id) { this.valid(id); return (await this.all()).find(([key])=>key===id)?.[1] ?? null; }
}

export function validateProject(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length>100) throw new Error('project name is required (1–100)');
  if (!Array.isArray(p.tracks) || p.tracks.length>50) throw new Error('tracks must contain 0–50 songs');
  if(p.count!==undefined&&(!Number.isInteger(p.count)||p.count<1||p.count>20))throw new Error('count must be 1–20');
  const order = p.settings?.order ?? ['codex','claude'];
  if (order.length!==2 || new Set(order).size!==2 || order.some(v=>!['codex','claude'].includes(v))) throw new Error('Invalid provider order');
  if (p.engine && !['suno','yue2'].includes(p.engine)) throw new Error('Invalid music engine');
  for(const t of p.tracks) {
    if(!t || typeof t.title!=='string' || t.title.length>200) throw new Error('Invalid track title');
    for(const field of ['lyrics','style']) if(t[field]!==undefined && (typeof t[field]!=='string'||t[field].length>30000)) throw new Error(`Invalid ${field}`);
    for(const field of ['audioId','imageId']) if(t[field] && !/^[a-zA-Z0-9_-]+$/.test(t[field])) throw new Error('Invalid asset ID');
  }
  return p;
}

export function parsePlan(raw) {
  let p = raw;
  if(typeof raw==='string') {
    const text=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
    try { p=JSON.parse(text); } catch { throw new Error('AI가 올바른 JSON을 반환하지 않았습니다. 결과를 검토해 주세요.'); }
  }
  if(!p || !Array.isArray(p.tracks) || p.tracks.length<1 || p.tracks.length>20) throw new Error('AI tracks must contain 1–20 songs');
  for(const t of p.tracks) for(const k of ['title','lyrics','style']) if(typeof t[k]!=='string'||!t[k].trim()||t[k].length>30000) throw new Error(`AI ${k} is required`);
  return {tracks:p.tracks.map(t=>({title:t.title.slice(0,200),lyrics:t.lyrics,style:t.style}))};
}

export function timestamps(tracks) {
  let elapsed = 0;
  return tracks.map(t=>{
    const sec=Math.floor(elapsed), h=Math.floor(sec/3600),m=Math.floor(sec/60)%60,s=sec%60;
    const line=`${h ? h+':'+String(m).padStart(2,'0') : String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${t.title}`;
    elapsed += Math.max(0,Number(t.duration)||0);
    return line;
  });
}
