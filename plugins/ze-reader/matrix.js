var ZEMatrix = {
 validateRules(rules){
  if(!Array.isArray(rules))throw Error('矩阵规则格式无效');
  const names=new Set();
  return rules.map(rule=>{
   if(!rule||typeof rule.name!=='string'||!rule.name.trim()||!['color','tag'].includes(rule.kind)||typeof rule.value!=='string'||!rule.value.trim())throw Error('请填写列名、匹配类型与匹配值');
   const name=rule.name.trim(),value=rule.value.trim();
   if(names.has(name))throw Error('矩阵列名不能重复');names.add(name);
   if(rule.kind==='color'&&!/^#[0-9a-f]{6}$/i.test(value))throw Error('颜色需为六位十六进制值，例如 #ffd400');
   return {name,kind:rule.kind,value:rule.kind==='color'?value.toLowerCase():value};
  });
 },
 build(snapshot,rules){
  rules=this.validateRules(rules);
  const byPaper=new Map();
  for(const record of snapshot.records){if(record.kind!=='annotation')continue;if(!byPaper.has(record.paperID))byPaper.set(record.paperID,[]);byPaper.get(record.paperID).push(record);}
  return snapshot.papers.map(paper=>({paper,cells:rules.map(rule=>(byPaper.get(paper.id)||[]).filter(record=>rule.kind==='tag'?record.tags.includes(rule.value):record.color.toLowerCase()===rule.value))}));
 },
 toMarkdown(rows,rules,sourceURL){
  rules=this.validateRules(rules);
  const escape=text=>String(text||'').replace(/\\/g,'\\\\').replace(/[|[\]*_\x60]/g,character=>'\\'+character).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,' ⏎ ');
  const cell=records=>records.length?records.map(record=>{
   const content=[record.text,record.comment?'批注：'+record.comment:''].filter(Boolean).join('；')||'['+record.annotationType+']';
   const url=sourceURL(record.source);
   if(typeof url!=='string'||!url.startsWith('zotero://'))throw Error('来源链接无效');
   const safeURL=url.replace(/[()\s|<>]/g,c=>encodeURIComponent(c));
   return escape(content)+' [原文]('+safeURL+')';
  }).join(' ／ '):'无匹配标注';
  return ['| '+['文献',...rules.map(rule=>rule.name)].map(escape).join(' | ')+' |',
   '| '+Array(rules.length+1).fill('---').join(' | ')+' |',
   ...rows.map(row=>'| '+[escape(row.paper.title),...row.cells.map(cell)].join(' | ')+' |')].join('\n');
 }
};
