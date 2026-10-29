// Persist the latest edit before networking. Only its own acknowledgement can
// remove it; an acknowledgement for an earlier revision leaves newer typing.
const PREFIX='paper-reader:draft:v1:';
export function createAnnotationWriter({create,update,remove,review,storage,onSaved,onDraft}){
 let chain=Promise.resolve();const memory=new Map(),sessions=new Map(),tokens=new Map();
 function editIdentity(session){const ids=[session.target?.id,...(session.target?.aliases||[])].filter(Boolean);for(const id of ids){const key='paper-reader:editor:v1:'+session.key+':'+id;const token=tokens.get(key)||storage?.getItem(key);if(token)return token}return globalThis.crypto?.randomUUID?.()||session.draftId}
 function rememberIdentity(session,target,token){if(!target?.id)return;const key='paper-reader:editor:v1:'+session.key+':'+target.id;tokens.set(key,token);try{storage?.setItem(key,token)}catch{}}
 function records(){
  if(storage)for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX)){try{const r=JSON.parse(storage.getItem(key));if(r?.id&&r.key&&r.edit)memory.set(r.id,r)}catch{}}}
  if(storage)for(const id of memory.keys())if(!storage.getItem(PREFIX+id))memory.delete(id);
  return [...memory.values()];
 }
 function put(r){if(storage)storage.setItem(PREFIX+r.id,JSON.stringify(r));memory.set(r.id,r)}
 function drop(id){if(storage)storage.removeItem(PREFIX+id);memory.delete(id)}
 function stage(session,edit){
  records();session.draftId||=(session.target?.id&&!session.target.id.startsWith('b:')?'edit:'+session.key+':'+session.target.id:(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
  session.editToken||=editIdentity(session);rememberIdentity(session,session.target,session.editToken);
  const old=memory.get(session.draftId),r={...old,id:session.draftId,key:session.key,page:session.page,text:session.text,position:session.position,target:session.target||old?.target||null,edit:{...edit,type:edit.type||session.type||'highlight',base:session.base??edit.base??old?.edit?.base,pdf_revision:session.pdfRevision??edit.pdf_revision??old?.edit?.pdf_revision,edit_token:session.editToken,resolve:session.resolve===true},version:(old?.version||0)+1,drawingUntil:session.drawing?Date.now()+5000:0,updated:Date.now()};
  put(r);sessions.set(r.id,session);onDraft?.(r);return r;
 }
 function enqueue(session,r){
  const snapshot=structuredClone(r);
  const task=chain.then(async()=>{
   const latest=memory.get(r.id);let target=session.target||latest?.target||snapshot.target;
   const edit=snapshot.edit;
   if(snapshot.deleted&&!target&&!snapshot.attempted){if(memory.get(r.id)?.version===snapshot.version)drop(r.id);return null}
   let created=false;if(!target){
    if(latest)put({...latest,attempted:true});
    const result=await create({key:r.key,page:r.page,text:r.text,position:r.position,...edit,client_id:r.id});
    target={id:result.id,text:r.text,position:r.position};session.target=target;
    created=true;
   }
   if(edit.pdf_review)await review({key:r.key,id:target.id,revision:edit.pdf_revision});
   if(!snapshot.deleted&&(!created||snapshot.attempted))await update({key:r.key,id:target.id,...edit});
   if(snapshot.deleted)await remove({key:r.key,id:target.id,base:edit.base,pdf_revision:edit.pdf_revision});
   else{session.type=edit.type;Object.assign(target,{comment:edit.comment,color:edit.color,type:edit.type,pending:true,base:edit.base,pdfRevision:edit.pdf_revision});if(edit.tags)target.tags=edit.tags}
   records();const remaining=memory.get(r.id);
   rememberIdentity(session,target,edit.edit_token);
   if(remaining?.version===snapshot.version)drop(r.id);else if(remaining)put({...remaining,target});
   onSaved?.(session,target,{...edit,deleted:!!snapshot.deleted});return target;
  });
  chain=task.catch(()=>{});return task;
 }
 return {
  stage,
  save(session,edit){try{return enqueue(session,stage(session,edit))}catch(e){return Promise.reject(e)}},
  remove(session){try{const r=stage(session,{comment:session.target?.comment||'',color:session.target?.color||'#ffd400',type:session.type,tags:session.tags});r.deleted=true;put(r);return enqueue(session,r)}catch(e){return Promise.reject(e)}},
  drafts(key){return records().filter(r=>!key||r.key===key).map(r=>({id:r.target?.id||'b:'+r.id,draftId:r.id,text:r.text,position:r.position,...r.edit,pdfRevision:r.edit.pdf_revision,pending:true,browserDraft:true,deleted:!!r.deleted,updated:r.updated}))},
  reviewPdf(id,revision){records();const r=memory.get(id);if(!r)throw Error('找不到浏览器草稿');const session=sessions.get(id);if(session)session.pdfRevision=revision;put({...r,edit:{...r.edit,pdf_revision:revision,pdf_review:true},version:r.version+1})},
  async retry(){
   await chain;const failures=[];
   for(const r of records()){if(sessions.get(r.id)?.drawing||(r.drawingUntil>Date.now()&&r.drawingUntil-Date.now()<10000))continue;const session=sessions.get(r.id)||{key:r.key,page:r.page,text:r.text,position:r.position,target:r.target,draftId:r.id,type:r.edit.type,base:r.edit.base,pdfRevision:r.edit.pdf_revision,editToken:r.edit.edit_token};try{await enqueue(session,r)}catch(e){failures.push(e)}}
   if(failures.length)throw failures[0];
  },
  flush(){return chain},
  export(){return records()},
 };
}
