import { resolve, relative, isAbsolute } from 'node:path';
export function assertWorkspacePath(path,root){
  if(typeof path!=='string'||!path)throw new Error('작업 폴더 내부 저장 경로가 필요합니다.');
  const target=resolve(path),rel=relative(resolve(root),target);
  if(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw new Error('현재 작업 폴더 외부에는 생성 결과를 저장할 수 없습니다.');
  return target;
}
export function unpackMCP(result){if(result.structuredContent)return result.structuredContent;const text=result.content?.find(x=>x.type==='text')?.text;try{return JSON.parse(text);}catch{throw new Error('음악 엔진의 상태 응답을 읽을 수 없습니다.');}}

export async function completeYuEGeneration(client,created,{workspaceRoot,signal,onProgress=()=>{},deadlineMs=1200000}={}){
  const id=created.id||created.job_id;if(!id)throw new Error('생성 요청 ID를 받지 못했습니다. Studio 상태를 확인하고 재요청하지 마세요.');
  const deadline=Date.now()+deadlineMs;let state;
  while(Date.now()<deadline){
    if(signal?.aborted)throw new Error('cancelled');
    state=unpackMCP(await client.call('song_job_get',{job_id:id},{signal}));await onProgress(state);
    if(['completed','complete'].includes(state.status))break;
    if(['failed','error','cancelled'].includes(state.status))throw new Error(state.message||'YuE2 음악 생성 실패');
    await client.call('studio_wait',{job_id:id,seconds:20},{signal});
  }
  if(!['completed','complete'].includes(state?.status))throw new Error('음악 생성 대기 시간이 지났습니다. Studio에서 기존 작업을 확인하세요.');
  if(!state.songs?.length)throw new Error('완료 상태이지만 생성 음원이 없습니다.');
  const songs=[];
  for(const song of state.songs){
    const files=unpackMCP(await client.call('library_song_files',{song_id:song.id},{signal}));
    songs.push({songId:song.id,title:song.title||'새 음악',audioPath:assertWorkspacePath(files.audio,workspaceRoot),coverPath:files.cover?assertWorkspacePath(files.cover,workspaceRoot):null});
  }
  return {engine:'yue2',externalId:id,state:'completed',songs};
}
