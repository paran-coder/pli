import {mkdir,open,stat,writeFile,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,basename,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {probe,trimSettings} from './2026-11-04-media.mjs';
import {executable,runProcess} from './2026-11-04-cli.mjs';
import {timestamps} from './2026-11-04-core.mjs';
const uid=()=>randomUUID().toUpperCase(),pathFor=p=>resolve(p).replaceAll('\\','/');
const emptyMaterials='flowers videos tail_leaders audios images texts effects stickers canvases transitions audio_effects audio_fades beats material_animations placeholders placeholder_infos speeds common_mask chromas text_templates realtime_denoises audio_pannings audio_pitch_shifts video_trackings hsl drafts color_curves hsl_curves primary_color_wheels log_color_wheels video_effects ai_text_effects ai_generate_holders audio_balances handwrites manual_deformations manual_beautys plugin_effects sound_channel_mappings green_screens shapes material_colors digital_humans digital_human_model_dressing smart_crops ai_translates audio_track_indexes loudnesses vocal_beautifys vocal_separations smart_relights time_marks multi_language_refs video_shadows video_strokes video_radius';
function segment(materialId,start,length,visual,index){return {id:uid(),material_id:materialId,source_timerange:{start:0,duration:length},target_timerange:{start,duration:length},render_timerange:{start:0,duration:0},speed:1,volume:visual?0:1,last_nonzero_volume:1,clip:visual?{scale:{x:1,y:1},rotation:0,rotation3d:[],transform:{x:0,y:0},flip:{vertical:false,horizontal:false},alpha:1}:null,uniform_scale:visual?{on:true,value:1}:null,extra_material_refs:[],keyframe_refs:[],common_keyframes:[],render_index:0,track_render_index:index,track_attribute:0,visible:true,group_id:'',desc:'',state:0,is_loop:false,is_tone_modify:false,reverse:false,intensifies_audio:false,cartoon:false,enable_lut:visual,enable_adjust:visual,enable_hsl:false,enable_color_curves:true,enable_hsl_curves:true,enable_color_wheels:true,enable_video_mask:true,source:'segmentsourcenormal',is_placeholder:false,template_id:'',template_scene:'default',raw_segment_id:'',caption_info:null,lyric_keyframes:null,hdr_settings:null,responsive_layout:{enable:false,target_follow:'',size_layout:0,horizontal_pos_layout:0,vertical_pos_layout:0}};}
export function buildCapCutDraft(tracks,{name='PlayL 플레이리스트',folder,id=uid(),now=Date.now()}={}){
 if(!tracks.length||tracks.length>50)throw new Error('CapCut에 전달할 곡을 1–50개 선택하세요.');
 const materials=Object.fromEntries(emptyMaterials.split(' ').map(k=>[k,[]])),video=[],audio=[],registrations=[];let cursor=0;
 for(const t of tracks){
  if(!t.audioPath||!t.imagePath||!Number.isFinite(t.duration)||t.duration<=0)throw new Error('모든 곡의 음원·이미지와 유효한 길이가 필요합니다.');
  const length=Math.round(t.duration*1e6);if(length<100000)throw new Error('곡 길이가 너무 짧습니다.');
  const a=uid(),v=uid(),audioPath=pathFor(t.audioPath),imagePath=pathFor(t.imagePath);
  materials.audios.push({id:a,type:'extract_music',name:t.title,path:audioPath,duration:length,local_material_id:a,unique_id:'',music_id:'',resource_id:'',source_platform:0,check_flag:1,wave_points:[]});
  materials.videos.push({id:v,type:'photo',material_name:basename(t.imagePath),path:imagePath,media_path:imagePath,duration:length,width:1920,height:1080,has_audio:false,local_material_id:v,local_id:'',unique_id:'',material_id:'',source:0,source_platform:0,check_flag:62978047,crop:{upper_left_x:0,upper_left_y:0,upper_right_x:1,upper_right_y:0,lower_left_x:0,lower_left_y:1,lower_right_x:1,lower_right_y:1},crop_ratio:'free',crop_scale:1,audio_fade:null,extra_type_option:0,picture_from:'none',reverse_path:'',video_algorithm:{algorithms:[],path:'',time_range:null}});
  video.push(segment(v,cursor,length,true,0));audio.push(segment(a,cursor,length,false,1));
  for(const [materialId,file,type]of [[a,audioPath,'audio'],[v,imagePath,'photo']])registrations.push({id:materialId,file_Path:file,extra_info:basename(file),metetype:type,type:0,duration:length,width:type==='photo'?1920:0,height:type==='photo'?1080:0,create_time:Math.floor(now/1000),import_time:Math.floor(now/1000),import_time_ms:now*1000,item_source:1,roughcut_time_range:{start:0,duration:length},sub_time_range:{start:-1,duration:-1},md5:'',ai_group_type:'',enter_from:0,material_color_tag:''});
  cursor+=length;
 }
 const platform={os:'windows',os_version:'',app_id:359289,app_version:'9.6.0',app_source:'cc',device_id:'',hard_disk_id:'',mac_address:''};
 const draft={id,version:360000,new_version:'189.0.0',name,duration:cursor,create_time:Math.floor(now/1000),update_time:Math.floor(now/1000),fps:30,is_drop_frame_timecode:false,color_space:0,canvas_config:{ratio:'16:9',width:1920,height:1080,background:null},config:{video_mute:false,record_audio_last_index:1,extract_audio_last_index:1,original_sound_last_index:1,maintrack_adsorb:true,material_save_mode:0,attachment_info:[],subtitle_taskinfo:[],lyrics_taskinfo:[],system_font_list:[],multi_language_mode:'none',multi_language_main:'none',multi_language_current:'none',multi_language_list:[]},tracks:[{id:uid(),type:'video',segments:video,flag:0,attribute:0,name:'PlayL 배경 이미지',is_default_name:false},{id:uid(),type:'audio',segments:audio,flag:0,attribute:0,name:'PlayL 음악',is_default_name:false}],materials,keyframes:Object.fromEntries('videos audios texts stickers filters adjusts handwrites effects'.split(' ').map(k=>[k,[]])),keyframe_graph_list:[],group_container:null,platform,last_modified_platform:{...platform},mutable_config:null,cover:null,retouch_cover:null,extra_info:null,relationships:[],mixed_track_mode_on:false,render_index_track_mode_on:false,free_render_index_mode_on:false,static_cover_image_path:'',source:'default',time_marks:null,path:pathFor(folder),lyrics_effects:[],uneven_animation_template_info:{},draft_type:'video',smart_ads_info:{},function_assistant_info:{}};
 const meta={draft_id:id,draft_name:name,draft_fold_path:pathFor(folder),draft_root_path:pathFor(resolve(folder,'..')),draft_cover:'',draft_materials:[{type:0,value:registrations},...[1,2,3,6,7,8].map(type=>({type,value:[]}))],draft_materials_copied_info:[],draft_segment_extra_info:[],draft_timeline_materials_size_:0,tm_duration:cursor,tm_draft_create:now*1000,tm_draft_modified:now*1000,tm_draft_removed:0,draft_is_invisible:false,draft_need_rename_folder:false,draft_new_version:'',cloud_draft_sync:false,cloud_draft_cover:false,draft_is_cloud_temp_draft:false,draft_type:'',draft_is_from_deeplink:'false',draft_deeplink_url:'',tm_draft_cloud_entry_id:-1,tm_draft_cloud_parent_entry_id:-1,tm_draft_cloud_space_id:-1,tm_draft_cloud_user_id:-1};
 return {draft,meta};
}
// Streaming ZIP32 (stored entries): large media never needs to fit in memory.
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export async function zipCapCutFolder(folder,output,{signal}={}){
 const files=[];async function visit(dir,prefix=''){for(const f of await readdir(dir,{withFileTypes:true})){const rel=prefix+f.name;if(f.isDirectory())await visit(join(dir,f.name),rel+'/');else if(f.isFile())files.push({path:join(dir,f.name),name:basename(folder)+'/'+rel});}}await visit(folder);
 const out=await open(output,'wx');let offset=0;const central=[];
 const write=async b=>{let used=0;while(used<b.length){const {bytesWritten}=await out.write(b,used,b.length-used);if(!bytesWritten)throw new Error('ZIP 저장 실패');used+=bytesWritten;offset+=bytesWritten;}if(offset>0xffffffff)throw new Error('현재 ZIP은 4GB 미만만 지원합니다. 초안 폴더를 직접 사용하세요.');};
 try{
  for(const file of files){if(signal?.aborted)throw new Error('cancelled');const info=await stat(file.path);if(info.size>0xffffffff)throw new Error('단일 미디어가 ZIP32 제한을 초과합니다.');const name=Buffer.from(file.name),start=offset;let crc=0xffffffff;
   const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x808,6);h.writeUInt16LE(33,12);h.writeUInt16LE(name.length,26);await write(h);await write(name);
   for await(const b of createReadStream(file.path)){if(signal?.aborted)throw new Error('cancelled');for(const x of b)crc=crcTable[(crc^x)&255]^(crc>>>8);await write(b);}crc=(crc^0xffffffff)>>>0;
   const tail=Buffer.alloc(16);tail.writeUInt32LE(0x08074b50);tail.writeUInt32LE(crc,4);tail.writeUInt32LE(info.size,8);tail.writeUInt32LE(info.size,12);await write(tail);
   const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x808,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(info.size,20);c.writeUInt32LE(info.size,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(start,42);central.push(c,name);
  }
  const start=offset;for(const b of central)await write(b);const size=offset-start,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(start,16);await write(end);
 }finally{await out.close();}
}
export async function createCapCutProject(project,tracks,dir,{signal,onProgress=()=>{}}={}){
 if(tracks.length!==project.tracks.length||!tracks.length)throw new Error('모든 곡의 음원·이미지를 먼저 선택하세요.');
 const id=uid(),folder=join(dir,'2026-11-05-PlayL-v0.5.1-'+id);await mkdir(join(folder,'Resources'),{recursive:true});
 const ffmpeg=await executable('ffmpeg'),prepared=[];
 for(let i=0;i<tracks.length;i++){
  const t=tracks[i],info=await probe(t.audioPath,{signal}),trim=trimSettings(t,info.duration),audioPath=join(folder,'Resources',`2026-11-05-audio-${i+1}.wav`),imagePath=join(folder,'Resources',`2026-11-05-image-${i+1}.png`);
  const af=[...(project.normalize!==false?['loudnorm=I=-16:TP=-1.5:LRA=11']:[]),'aresample=48000',`afade=t=in:d=${Math.min(.3,trim.length/4)}`,`afade=t=out:st=${Math.max(0,trim.length-Math.min(.6,trim.length/3))}:d=${Math.min(.6,trim.length/3)}`];
  await runProcess(ffmpeg,['-v','error','-ss',String(trim.start),'-i',t.audioPath,'-t',String(trim.length),'-vn','-af',af.join(','),'-c:a','pcm_s16le','-ar','48000','-ac','2','-n',audioPath],{signal,timeout:7200000});
  await runProcess(ffmpeg,['-v','error','-i',t.imagePath,'-frames:v','1','-vf','scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1','-threads','2','-n',imagePath],{signal,timeout:60000});
  prepared.push({title:t.title,audioPath,imagePath,duration:(await probe(audioPath,{signal})).duration,sourceTrim:trim});onProgress({current:i+1,total:tracks.length});
 }
 const {draft,meta}=buildCapCutDraft(prepared,{name:project.name,folder,id});
 for(const [name,data]of [['draft_content.json',draft],['draft_meta_info.json',meta],['draft_virtual_store.json',{draft_materials:[],draft_virtual_store:[{type:0,value:[]}]}]])await writeFile(join(folder,name),JSON.stringify(data),{flag:'wx'});
 const lines=timestamps(prepared);await writeFile(join(folder,'2026-11-05-timestamps.txt'),lines.join('\n'),{flag:'wx'});
 await writeFile(join(folder,'2026-11-05-PlayL-manifest.json'),JSON.stringify({version:'0.5.1',sourceProjectId:project.id,tracks:prepared.map(t=>({title:t.title,duration:t.duration,sourceTrim:t.sourceTrim})),normalized:project.normalize!==false,fadeApplied:true,capcutSchema:'Windows 9.6.0 / 189.0.0',nativeOpenVerified:false},null,2),{flag:'wx'});
 await writeFile(join(folder,'2026-11-05-CapCut-handoff.txt'),'PlayL-v0.5.1 CapCut 초안\n이미지와 음악을 분리된 타임라인으로 구성했습니다. 음원의 트림·음량 통일·페이드는 WAV에 반영했습니다. 원본은 변경하지 않았습니다.\n기본 형식은 Windows CapCut 9.6에서 샘플 열기·재생을 확인했습니다. 이 생성물 자체의 열기 검증은 별도이며 자동 등록은 하지 않습니다.\n등록 시 이 폴더를 CapCut 로컬 초안 위치에 새 이름으로 복사하고 CapCut에서 열어 확인하세요. 현재 작업 폴더의 Resources를 삭제하면 연결된 미디어를 찾을 수 없습니다. 다른 PC로 이동하려면 미디어 경로를 다시 연결해야 합니다.\n',{flag:'wx'});
 const path=join(dir,'2026-11-05-PlayL-CapCut-v0.5.1-'+id+'.zip');await zipCapCutFolder(folder,path,{signal});
 return {path,folder,draftId:id,duration:draft.duration/1e6,timestamps:lines,nativeOpenVerified:false};
}
