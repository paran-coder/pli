import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {copyFile,mkdir,readFile,realpath,rename,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertWorkspacePath} from './2026-11-04-music.mjs';

const run=promisify(execFile);
const portablePath=path=>path.replaceAll('\\','/');
const readJSON=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));

async function launch(exe){
  const child=spawn(exe,[],{cwd:dirname(exe),detached:true,stdio:'ignore'});
  await new Promise((ok,fail)=>{child.once('spawn',ok);child.once('error',fail);});
  child.unref();
}

export async function openCapCutDraft(result,{dataDir}){
  if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw new Error('Windows용 CapCut이 필요합니다.');
  const capcut=join(process.env.LOCALAPPDATA,'CapCut');
  const exe=join(capcut,'Apps','CapCut.exe');
  await stat(exe).catch(()=>{throw new Error('CapCut 설치 위치를 찾을 수 없습니다.');});
  const root=await realpath(join(capcut,'User Data','Projects','com.lveditor.draft')).catch(()=>{throw new Error('CapCut을 한 번 실행해 프로젝트 목록을 준비하세요.');});
  const index=join(root,'root_meta_info.json');
  const raw=await readFile(index,'utf8');
  const catalog=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(!Array.isArray(catalog.all_draft_store)||!Number.isInteger(catalog.draft_ids)||resolve(catalog.root_path||'').toLowerCase()!==root.toLowerCase())throw new Error('CapCut 프로젝트 목록 형식을 확인할 수 없습니다.');
  const source=assertWorkspacePath(await realpath(result.folder),await realpath(join(dataDir,'exports')));
  const [draft,meta]=await Promise.all(['draft_content.json','draft_meta_info.json'].map(name=>readJSON(join(source,name))));
  if(draft.id!==result.draftId||meta.draft_id!==draft.id||!/^[0-9A-F-]{36}$/i.test(draft.id))throw new Error('CapCut 초안 ID가 일치하지 않습니다.');
  const existing=catalog.all_draft_store.find(item=>item.draft_id===draft.id);
  if(existing){
    await stat(existing.draft_json_file);
    await launch(exe);
    return {name:existing.draft_name,alreadyRegistered:true};
  }
  const ensureClosed=async()=>{
    const {stdout}=await run('tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:8000});
    if(/"CapCut\.exe"/i.test(stdout))throw new Error('CapCut을 종료한 뒤 다시 눌러 새 초안을 등록하세요.');
  };
  await ensureClosed();
  const folder=join(root,'2026-11-05-PlayL-'+draft.id);
  const folderPath=portablePath(folder),rootPath=portablePath(root);
  const cover=draft.materials?.videos?.[0]?.path;
  if(cover)assertWorkspacePath(await realpath(cover),source);
  await mkdir(folder).catch(error=>{if(error.code!=='EEXIST')throw error;});
  if((await realpath(folder)).toLowerCase()!==folder.toLowerCase())throw new Error('CapCut 초안 경로를 확인할 수 없습니다.');
  const files=[
    ['draft_content.json',{...draft,path:folderPath}],
    ['draft_meta_info.json',{...meta,draft_fold_path:folderPath,draft_root_path:rootPath,draft_cover:cover?'draft_cover.png':''}],
    ['draft_virtual_store.json',await readJSON(join(source,'draft_virtual_store.json'))]
  ];
  for(const [name,value] of files){
    const file=join(folder,name),content=JSON.stringify(value);
    try{await writeFile(file,content,{flag:'wx'});}
    catch(error){if(error.code!=='EEXIST'||await readFile(file,'utf8')!==content)throw error;}
  }
  if(cover)await copyFile(cover,join(folder,'draft_cover.png'),1).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const now=Date.now()*1000;
  catalog.all_draft_store.unshift({
    draft_id:draft.id,draft_name:meta.draft_name,draft_fold_path:folderPath,draft_root_path:rootPath,
    draft_json_file:folderPath+'/draft_content.json',draft_cover:cover?folderPath+'/draft_cover.png':'',
    draft_timeline_materials_size:0,draft_type:'',draft_new_version:'',draft_is_invisible:false,
    cloud_draft_cover:false,cloud_draft_sync:false,streaming_edit_draft_ready:true,
    tm_draft_create:now,tm_draft_modified:now,tm_draft_removed:0,tm_duration:meta.tm_duration
  });
  catalog.draft_ids++;
  const backup=join(dataDir,'exports','2026-11-05-CapCut-index-'+randomUUID()+'.json');
  await writeFile(backup,raw,{flag:'wx'});
  await ensureClosed();
  if(await readFile(index,'utf8')!==raw)throw new Error('CapCut 프로젝트 목록이 변경되었습니다. 다시 시도하세요.');
  const temp=join(root,'2026-11-05-PlayL-index-'+randomUUID()+'.tmp');
  await writeFile(temp,JSON.stringify(catalog),{flag:'wx'});
  await rename(temp,index);
  await launch(exe);
  return {name:meta.draft_name,alreadyRegistered:false};
}
