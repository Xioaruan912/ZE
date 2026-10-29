import test from 'node:test';
import assert from 'node:assert/strict';
import {filterLibraryItems,collectionTrail} from '../static/library-sidebar.mjs';
test('library search matches authors, years and tags as well as paper titles',()=>{
 const papers=[{key:'PAPER001',title:'Fuzzy Identity-Based Encryption',creators:[{last:'Sahai'}],date:'2005',tags:['基础']}];
 for(const q of ['fuzzy','SAHAI','2005','基础'])assert.equal(filterLibraryItems(papers,q).length,1);
 assert.equal(filterLibraryItems(papers,'absent').length,0);
});
test('same-named nested collections retain an unambiguous path',()=>{
 const collections=[{key:'ROOT0001',name:'备选论文库'},{key:'CRYPTO01',name:'CRYPTO',parentCollection:'ROOT0001'},{key:'YEAR0001',name:'2026',parentCollection:'CRYPTO01'},{key:'EURO0001',name:'EUROCRYPT',parentCollection:'ROOT0001'},{key:'YEAR0002',name:'2026',parentCollection:'EURO0001'}];
 assert.deepEqual(collectionTrail(collections,'YEAR0001'),['我的文库','备选论文库','CRYPTO','2026']);
 assert.deepEqual(collectionTrail(collections,'YEAR0002'),['我的文库','备选论文库','EUROCRYPT','2026']);
});
test('a malformed collection cycle cannot hang the sidebar',()=>{
 assert.deepEqual(collectionTrail([{key:'LOOP0001',name:'循环',parentCollection:'LOOP0001'}],'LOOP0001'),['我的文库','循环']);
});
