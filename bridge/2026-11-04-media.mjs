import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executable, runProcess } from './2026-11-04-cli.mjs';
import { timestamps } from './2026-11-04-core.mjs';

export async function probe(path,{signal}={}) {
  const {stdout}=await runProcess(await executable('ffprobe'),['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',path],{signal,timeout:30000});
  const data=JSON.parse(stdout);return {duration:Number(data.format?.duration)||0,streams:data.streams||[]};
}

export async function detectSilence(path,{signal}={}) {
  const {stderr}=await runProcess(await executable('ffmpeg'),['-hide_banner','-i',path,'-vn','-af','silencedetect=noise=-45dB:d=0.4','-f','null','-'],{signal,timeout:600000});
  const silences=[];let start;
  for(const line of stderr.split('\n')){
    const a=line.match(/silence_start: ([\d.]+)/);if(a)start=Number(a[1]);
    const b=line.match(/silence_end: ([\d.]+)/);if(b&&start!==undefined){silences.push({start,end:Number(b[1])});start=undefined;}
  }
  const {duration}=await probe(path,{signal});
  if(start!==undefined)silences.push({start,end:duration});
  return {duration,silences,suggestedStart:silences[0]?.start===0?Math.max(0,silences[0].end-0.15):0,suggestedEnd:silences.at(-1)?.end>=duration-0.1?Math.min(duration,silences.at(-1).start+0.3):duration};
}

export function trimSettings(track,duration) {
  const start=Number(track.trimStart||0),end=track.trimEnd==null||track.trimEnd===''?duration:Number(track.trimEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+0.05||end<=start+0.1)throw new Error('트림 구간이 올바르지 않습니다.');
  return {start,length:Math.min(duration,end)-start};
}

export async function renderPlaylist(tracks,dir,{signal,width=1920,height=1080,onProgress=()=>{},normalize=true}={}) {
  if(!tracks.length||tracks.length>50)throw new Error('출력할 곡을 1–50개 선택하세요.');
  await mkdir(dir,{recursive:true});
  const ffmpeg=await executable('ffmpeg'),rendered=[],segments=[];
  for(let i=0;i<tracks.length;i++){
    if(signal?.aborted)throw new Error('cancelled');
    const t=tracks[i],info=await probe(t.audioPath,{signal}),{start,length}=trimSettings(t,info.duration);
    const segment=join(dir,`2026-11-04-segment-${i+1}-${randomUUID()}.mp4`);
    const filters=[...(normalize?['loudnorm=I=-16:TP=-1.5:LRA=11']:[]),'aresample=48000',`afade=t=in:d=${Math.min(.3,length/4)}`,`afade=t=out:st=${Math.max(0,length-Math.min(.6,length/3))}:d=${Math.min(.6,length/3)}`];
    await runProcess(ffmpeg,['-hide_banner','-loglevel','error','-loop','1','-framerate','24','-i',t.imagePath,'-ss',String(start),'-i',t.audioPath,'-t',String(length),'-map','0:v:0','-map','1:a:0','-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`,'-af',filters.join(','),'-c:v','libx264','-preset','veryfast','-tune','stillimage','-threads','4','-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-movflags','+faststart','-n',segment],{signal,timeout:7200000,maxBytes:1024*1024});
    segments.push(segment);rendered.push({title:t.title,duration:(await probe(segment,{signal})).duration});onProgress({current:i+1,total:tracks.length});
  }
  const list=join(dir,`2026-11-04-concat-${randomUUID()}.txt`);
  await writeFile(list,segments.map(s=>`file '${s.replace(/\\/g,'/').replace(/'/g,"'\\''")}'`).join('\n'),{flag:'wx'});
  const path=join(dir,`2026-11-04-PlayL-v0.4.0-${randomUUID()}.mp4`);
  await runProcess(ffmpeg,['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart','-n',path],{signal,timeout:7200000});
  const lines=timestamps(rendered);
  await writeFile(path.replace(/\.mp4$/,'.txt'),lines.join('\n'),{flag:'wx'});
  return {path,timestamps:lines,duration:rendered.reduce((n,t)=>n+t.duration,0)};
}
