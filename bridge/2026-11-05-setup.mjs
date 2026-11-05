import {totalmem,homedir} from 'node:os';
import {access,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {executable,runProcess} from './2026-11-04-cli.mjs';
export function recommendYuE(gpus,ramGB){
 const vram=Math.round(Math.max(0,...gpus.map(g=>g.vramGB)));
 if(!vram)return 'NVIDIA GPU/VRAM을 확인하지 못했습니다. 자동 구성 추천을 보류합니다. 개발자 요구 사양을 확인하거나 Suno 등 클라우드 엔진을 선택하세요.';
 const note=ramGB<16?' 시스템 RAM도 부족할 수 있으므로 메모리 여유를 먼저 확인하세요.':'';
 if(vram>=12)return '12 GB 이상 VRAM으로 Full native(BF16)를 검토할 수 있습니다. 먼저 Quality(Q8)로 시작해 여유와 안정성을 확인하는 편을 권합니다. VRAM 총량만으로 긴 곡 실행을 보장하지 않습니다.'+note;
 if(vram>=8)return '8 GB 이상 VRAM입니다. Quality(Q8) 또는 더 가벼운 구성을 Studio에서 확인하세요. 곡 길이·다른 프로그램의 GPU 사용량에 따라 달라집니다.'+note;
 return '8 GB 미만 VRAM입니다. 가벼운 양자화 구성의 실제 요구량을 Studio에서 확인해야 합니다. 자동 실행 가능 판정은 보류하며 Suno 등 클라우드 엔진도 선택할 수 있습니다.'+note;
}
export async function inspectSetup(workspaceRoot){
 const tools={node:Number(process.versions.node.split('.')[0])>=22};
 for(const name of ['ffmpeg','ffprobe','codex','claude']){try{await executable(name);tools[name]=true;}catch{tools[name]=false;}}
 const local=process.env.LOCALAPPDATA||join(homedir(),'AppData','Local');
 const exists=async p=>{try{await access(p);return true;}catch{return false;}};
 const yue2={
  projectCopy:await exists(join(workspaceRoot,'2026-11-04-PlayL-work-v0.1.0','2026-11-04-YuE2-portable-v0.1.0','YuE2-Studio.exe')),
  installed:await exists(join(local,'YuE2 Studio','YuE2-Studio.exe'))
 };
 tools.yue2=yue2.projectCopy||yue2.installed;
 tools.capcut=false;try{for(const dir of await readdir(join(local,'CapCut','Apps')))if(await exists(join(local,'CapCut','Apps',dir,'CapCut.exe'))){tools.capcut=true;break;}}catch{}
 const gpus=[];try{const {stdout}=await runProcess(await executable('nvidia-smi'),['--query-gpu=name,memory.total','--format=csv,noheader,nounits'],{timeout:10000,maxBytes:65536});for(const line of stdout.trim().split(/\r?\n/)){const parts=line.split(',');const memory=Number(parts.pop());const name=parts.join(',').trim();if(name&&memory>0)gpus.push({name,vramGB:Math.round(memory/1024*10)/10});}}catch{}
 const ramGB=Math.round(totalmem()/1024**3);return {tools,gpus,ramGB,yue2,yueRecommendation:recommendYuE(gpus,ramGB)};
}
