const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx={};
vm.createContext(ctx);
if(fs.existsSync(__dirname+'/reading-columns.js')) vm.runInContext(fs.readFileSync(__dirname+'/reading-columns.js','utf8'),ctx);
const display=(tags,key)=>ctx.ReadingColumns?.display(tags,key)??{order:'',position:''};
const tags=['阅读顺序-01保密寻址-10-综合-DualSystem2009','阅读顺序-02访问控制-10-进阶-DualSystem2009','阅读顺序-03谓词匹配-04-基础-DualSystem2009','阅读顺序-90证明工具-10-核心-DualSystem2009'];
test('same paper follows the selected collection instead of the first tag',()=>{
 assert.equal(display(tags,'J74UBEJE').order,'04');
 assert.equal(display(tags,'J74UBEJE').position,'基础 · 双系统与谓词编码工具');
 assert.equal(display(tags,'K57JIGUF').order,'10');
 assert.equal(display(tags,'K57JIGUF').position,'核心 · 标准模型与双系统');
});
test('unrelated or unclassified collections stay blank rather than show wrong branch',()=>{
 assert.equal(display(tags,'L6AU695F').order,'');
 assert.equal(display(tags,'3EZHHFKC').order,'');
 assert.equal(display(['阅读状态-原基础暂未读'],'BJED65AU').position,'');
});
test('separates parallel branches and reference material',()=>{
 assert.equal(display(['阅读顺序-04匿名凭证-06-核心-ShortGroupSignatures2004'],'L6AU695F').position,'核心 · 群签名分支');
 assert.equal(display(['阅读顺序-02访问控制-07-进阶-NonMonotoneABE2007'],'BJED65AU').position,'进阶 · 策略与授权方平行扩展');
 assert.equal(display(['阅读顺序-90证明工具-18-参考-GraduateAppliedCryptography'],'K57JIGUF').position,'参考 · 按需查阅教材');
});
test('reads current tags and ignores malformed route tags',()=>{
 assert.equal(display(['阅读顺序-02访问控制-bad'],'BJED65AU').order,'');
 const changed=['阅读顺序-02访问控制-03-奠基-KPABE2006'];
 assert.equal(display(changed,'BJED65AU').order,'03');
 changed[0]='阅读顺序-02访问控制-04-核心-KPABE2006';
 assert.equal(display(changed,'BJED65AU').order,'04');
});
test('rendered cells retain the column class used for sizing',async()=>{
 const columns=[];
 await ctx.ReadingColumns.start({
  ItemTreeManager:{registerColumn:options=>{columns.push(options);return options.dataKey;}},
  Prefs:{get:()=>undefined},
  getMainWindows:()=>[]
 });
 const doc={createElement:()=>({}),defaultView:{}};
 const cell=columns.find(column=>column.dataKey==='order').renderCell(0,'03',{className:'column-reading-order'},false,doc);
 assert.ok(cell.className.split(' ').includes('column-reading-order'));
 assert.equal(cell.textContent,'03');
});
