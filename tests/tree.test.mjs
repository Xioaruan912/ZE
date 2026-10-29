import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildTree } from '../static/tree.mjs';
test('nests folders by parent key and keeps same-named folders distinct', () => {
 const tree=buildTree([{key:'A',name:'Crypto',parentCollection:null},{key:'B',name:'2026',parentCollection:'A'},{key:'C',name:'2026',parentCollection:null}]);
 assert.equal(tree.find(x=>x.key==='A').children[0].key,'B');
 assert.equal(tree.find(x=>x.key==='C').children.length,0);
});
