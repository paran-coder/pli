export function acceptSaveResult(state,request,saved){
  if(state.project?.id!==request.projectId)return state;
  if(state.editVersion!==request.editVersion)return {...state,project:{...state.project,revision:saved.revision},dirty:true};
  return {...state,project:saved,dirty:false};
}

export const isCurrentResponse=(requestGeneration,currentGeneration)=>requestGeneration===currentGeneration;
export const canApplyProjectLoad=(request,current)=>request.generation===current.generation&&request.editVersion===current.editVersion;
