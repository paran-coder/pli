export function validateToolArgs(schema,args) {
  if(!args||Array.isArray(args)||typeof args!=='object')throw new Error('MCP arguments must be an object');
  function visit(s,value,key){
    const types=Array.isArray(s.type)?s.type:[s.type];
    const valid=types.some(type=>!type||(type==='integer'?Number.isInteger(value):type==='array'?Array.isArray(value):type==='null'?value===null:type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):typeof value===type));
    if(!valid)throw new Error(`Invalid MCP field: ${key}`);
    if(s.enum&&!s.enum.includes(value))throw new Error(`Invalid MCP enum: ${key}`);
    if(typeof value==='number'&&(!Number.isFinite(value)||(s.minimum!==undefined&&value<s.minimum)||(s.maximum!==undefined&&value>s.maximum)))throw new Error(`Invalid MCP range: ${key}`);
    if(typeof value==='string'&&((s.maxLength!==undefined&&value.length>s.maxLength)||(s.minLength!==undefined&&value.length<s.minLength)))throw new Error(`Invalid MCP length: ${key}`);
    if(Array.isArray(value)&&s.items)value.forEach((v,i)=>visit(s.items,v,`${key}[${i}]`));
    if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
      for(const required of s.required||[])if(value[required]===undefined)throw new Error(`MCP required field: ${key}.${required}`);
      for(const [field,v] of Object.entries(value)){
        const child=s.properties?.[field];
        if(child)visit(child,v,`${key}.${field}`);
        else if(typeof s.additionalProperties==='object')visit(s.additionalProperties,v,`${key}.${field}`);
        else if(s.additionalProperties===false||s.properties)throw new Error(`Unknown MCP field: ${key}.${field}`);
      }
    }
  }
  visit(schema,args,'arguments');
  return args;
}

export class MCPClient {
  constructor(url,{token='',fetchImpl=fetch}={}){this.url=url;this.token=token;this.fetch=fetchImpl;this.id=0;this.session='';this.ready=false;this.protocol='2025-03-26';}
  async rpc(method,params={},notification=false,{signal,timeout=20000}={}) {
    const id=++this.id;
    const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':this.protocol};
    if(this.token)headers.Authorization='Bearer '+this.token;
    if(this.session)headers['Mcp-Session-Id']=this.session;
    const controller=AbortSignal.timeout(timeout);
    const response=await this.fetch(this.url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,params}),signal:signal?AbortSignal.any([signal,controller]):controller,redirect:'error'});
    if(!response.ok)throw Object.assign(new Error(response.status===401?'MCP 인증이 필요합니다.':`MCP HTTP ${response.status}`),{status:response.status});
    if(response.headers.get('Mcp-Session-Id'))this.session=response.headers.get('Mcp-Session-Id');
    if(notification){await response.body?.cancel();return null;}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0;
    try {
      const sse=response.headers.get('content-type')?.includes('text/event-stream');
      while(true){
        const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>5*1024*1024)throw new Error('MCP response too large');
        buffer+=decoder.decode(chunk.value,{stream:true});
        if(sse){buffer=buffer.replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){
          const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
          const raw=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
          if(!raw)continue;const message=JSON.parse(raw);if(message.id===id){if(message.error)throw new Error(message.error.message);return message.result;}
        }}
      }
      if(sse)throw new Error('MCP stream closed without a result');
      const message=JSON.parse(buffer);if(message.error)throw new Error(message.error.message);return message.result;
    }finally{await reader.cancel().catch(()=>{});}
  }
  async initialize(){if(this.ready)return;const r=await this.rpc('initialize',{protocolVersion:this.protocol,capabilities:{},clientInfo:{name:'PlayL',version:'0.4.0'}});this.protocol=r.protocolVersion||this.protocol;await this.rpc('notifications/initialized',{},true);this.ready=true;}
  async tools(){await this.initialize();let cursor;const tools=[];do{const r=await this.rpc('tools/list',cursor?{cursor}:{});tools.push(...(r.tools||[]));cursor=r.nextCursor;if(tools.length>1000)throw new Error('MCP tool limit');}while(cursor);return tools;}
  async call(name,args,{signal}={}){await this.initialize();const r=await this.rpc('tools/call',{name,arguments:args},false,{signal,timeout:300000});if(r.isError)throw new Error((r.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')||'MCP tool failed');return r;}
}

// Only generation tools are exposed to the music action. All other MCP tools stay inaccessible.
export function musicTools(engine,tools) {
  const names=engine==='suno'?['audio-create','audio_create','suno_audio_create']:['song_create','create_song','generate_song','generate','music_generate','create'];
  return tools.filter(t=>names.includes(t.name)&&t.inputSchema?.type==='object');
}
