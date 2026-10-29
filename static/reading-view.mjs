export function fitScale(mode,width,height,pageWidth,pageHeight,padding=12,manual=1.25){
 if(mode==='manual')return manual;
 const fitWidth=(width-2*padding)/pageWidth;
 return Math.max(.15,Math.min(4,mode==='page'?Math.min(fitWidth,(height-2*padding)/pageHeight):fitWidth));
}
export function readingAnchor(pages,root){
 const page=pages.find(p=>p.bottom>root.top+2)||pages.at(-1);if(!page)return null;
 return {page:page.page,fraction:Math.max(0,Math.min(1,(root.top-page.top)/page.height)),x:Math.max(0,Math.min(1,(root.left+root.width/2-page.left)/page.width))};
}
export function anchorScroll(anchor,page,root){return {top:page.top+page.height*anchor.fraction,left:Math.max(0,page.left+page.width*(anchor.x??.5)-root.width/2)}}
export function planResume(steps,progress){
 const all=steps.flatMap(step=>step.items.map(item=>({step,item,progress:progress[item.key]})));
 return {resume:all.filter(x=>x.progress?.updated).sort((a,b)=>b.progress.updated-a.progress.updated)[0]||null,next:all.find(x=>!x.step.done)||null};
}
export function filterAnnotations(notes,{query='',color='',type='',page='',status='',tag=''}={}){
 const q=query.trim().toLocaleLowerCase();
 return notes.filter(a=>(!tag||(a.tags||[]).includes(tag))&&(!q||[a.text,a.comment,a.webDraftComment,...(a.tags||[])].join('\n').toLocaleLowerCase().includes(q))&&(!color||a.color===color)&&(!type||(a.type===4||a.type==='ink'?'ink':a.type===5?'underline':a.type==='underline'?'underline':'highlight')===type)&&(!page||a.position?.pageIndex===Number(page)-1)&&(!status||(status==='conflict'?a.conflict:status==='browser'?a.browserDraft:status==='pending'?a.pending:!a.pending&&!a.conflict))).sort((a,b)=>(a.position?.pageIndex??0)-(b.position?.pageIndex??0));
}
export function mergeDrafts(notes,drafts){const merged=new Map(notes.map(a=>[a.id,a])),aliases=new Map(notes.flatMap(a=>(a.aliases||[]).map(id=>[id,a.id])));for(const draft of drafts){const id=aliases.get(draft.id)||draft.id;if(draft.deleted)merged.delete(id);else merged.set(id,{...merged.get(id),...draft,id})}return [...merged.values()]}
export function createMarkTool(){let mode='select';const seen=new WeakSet(),strings=new Set();return {get mode(){return mode},setMode(value){mode=['highlight','underline'].includes(value)?value:'select'},claim(session){if(mode==='select')return null;const set=typeof session==='object'?seen:strings;if(set.has(session))return null;set.add(session);return mode}}}
