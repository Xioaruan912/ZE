import test from 'node:test';import assert from 'node:assert/strict';
import {createReadingTabs} from '../static/reading-tabs.mjs';
const disk=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
test('restores tab metadata, deduplicates and selects the neighbour on close',()=>{
 const storage=disk(),tabs=createReadingTabs(storage);tabs.open({key:'ABCDEFGH',title:'First',pdf:'must not persist'});tabs.open({key:'12345678',title:'Second'});tabs.open({key:'ABCDEFGH',title:'First'});
 const restored=createReadingTabs(storage);assert.equal(restored.list().length,2);assert.equal(restored.active,'ABCDEFGH');assert.equal(restored.list()[0].pdf,undefined);
 assert.equal(restored.close('ABCDEFGH'),'12345678');assert.equal(restored.close('12345678'),null);
});
