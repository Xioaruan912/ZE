import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './ze-reader-fixtures.mjs';
import {Node,windowDOM,settle} from './ze-reader-ui-fixtures.mjs';
function setup(tags){
 const env=windowDOM(),box=new Node('tags-box'),body=new Node();body.className='body';box.append(body);env.root.append(box);
 const rows=tags.map(tag=>{const row=new Node();row.setAttribute('tagName',tag);body.append(row);return row;});
 const api=load(['tag-visibility.js']).ZETagVisibility,controller=api.attach({win:env.win});return {...env,box,body,rows,controller};
}
test('tag display hides only internal route/status tags and can reveal them without editing data',async()=>{
 const env=setup(['ABE','阅读顺序-02访问控制-03-奠基-KPABE','阅读状态-已读','阅读定位-02访问控制-核心','阅读顺序方法论']);
 assert.equal(env.rows[0].hasAttribute('data-ze-internal-hidden'),false);assert.equal(env.rows[4].hasAttribute('data-ze-internal-hidden'),false);
 for(const row of env.rows.slice(1,4))assert.equal(row.getAttribute('data-ze-internal-hidden'),'true');
 const toggle=env.body.querySelector('button');assert.match(toggle.textContent,/3/);await toggle.fire('click');
 for(const row of env.rows)assert.equal(row.hasAttribute('data-ze-internal-hidden'),false);
 await toggle.fire('click');assert.equal(env.rows[1].getAttribute('data-ze-internal-hidden'),'true');
 env.controller.dispose();assert.equal(env.body.querySelector('button'),null);assert.equal(env.root.querySelector('style'),null);
 for(const row of env.rows)assert.equal(row.hasAttribute('data-ze-internal-hidden'),false);
 assert.equal(env.rows[1].getAttribute('tagName'),'阅读顺序-02访问控制-03-奠基-KPABE');
});
test('new or renamed tags update and an actively edited tag remains visible until focus leaves',async()=>{
 const env=setup(['ABE']),row=new Node(),editor=new Node('input');row.setAttribute('tagName','阅读状态-已读');row.append(editor);env.body.append(row);env.doc.activeElement=editor;
 env.observers[0].trigger();await settle();assert.equal(row.hasAttribute('data-ze-internal-hidden'),false);
 env.doc.activeElement=null;await env.doc.fire('focusout');await settle();assert.equal(row.getAttribute('data-ze-internal-hidden'),'true');
 row.setAttribute('tagName','主题');env.observers[0].trigger();await settle();assert.equal(row.hasAttribute('data-ze-internal-hidden'),false);
 env.controller.dispose();env.observers[0].trigger();await settle();assert.equal(env.body.querySelector('button'),null);
});
test('revealing internal tags is scoped to its own tags section and disposing restores both sections',async()=>{
 const env=setup(['阅读状态-已读']),box2=new Node('tags-box'),body2=new Node(),row2=new Node();body2.className='body';row2.setAttribute('tagName','阅读状态-已读');body2.append(row2);box2.append(body2);env.root.append(box2);
 env.observers[0].trigger();await settle();await env.body.querySelector('button').fire('click');
 assert.equal(env.rows[0].hasAttribute('data-ze-internal-hidden'),false);assert.equal(row2.getAttribute('data-ze-internal-hidden'),'true');
 env.controller.dispose();assert.equal(row2.hasAttribute('data-ze-internal-hidden'),false);assert.equal(env.observers[0].disconnected,true);
});
