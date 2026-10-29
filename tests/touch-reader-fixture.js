window.addEventListener('DOMContentLoaded',()=>{
 document.querySelector('#run-touch-fixture').onclick=async()=>{
  const output=document.querySelector('#touch-fixture-result'),results=[],$=s=>document.querySelector(s),pause=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async(predicate,label)=>{for(let i=0;i<100;i++){if(predicate())return;await pause(50)}throw Error(label)};
  const assert=(condition,label)=>{if(!condition)throw Error(label);results.push('PASS '+label);output.textContent=results.join('\n')};
  try{
   await wait(()=>$('.item')&&!$('.item').disabled,'library ready');
   if($('#menu').getAttribute('aria-expanded')!=='true')$('#menu').click();
   $('.item').click();await wait(()=>$('.pdf-page[data-ready="yes"] .textLayer span'),'paper ready');await pause(450);
   assert($('.toolbar').getBoundingClientRect().height<=110,'reading toolbar uses at most two rows');
   assert($('#document').scrollWidth<=$('#document').clientWidth+1,'fit-width reading does not add an unnecessary horizontal scroll');
   assert(document.documentElement.hasAttribute('data-ze-touch-ui'),'touch-only UI activates for this device');
   assert(!$('#touch-tools').hidden&&$('#touch-tools').scrollWidth>=$('#touch-tools').clientWidth&&(!matchMedia('(max-width:760px)').matches||$('#touch-tools').scrollWidth>$('#touch-tools').clientWidth),'secondary tools stay in one row and scroll on narrow screens');
   const controls=[...document.querySelectorAll('.toolbar button,.toolbar input,.toolbar select')].filter(b=>b.getBoundingClientRect().height>0);
   assert(controls.every(b=>b.getBoundingClientRect().width>=43.5&&b.getBoundingClientRect().height>=43.5),'reading controls provide 44px touch targets');
   assert(parseFloat(getComputedStyle($('#page')).fontSize)>=16,'page input avoids small-font focus zoom');
   $('#menu').click();await wait(()=>!$('#touch-backdrop').hidden,'library backdrop');
   assert($('.workspace').inert,'a drawer prevents accidental selection in the paper behind it');
   assert(parseFloat(getComputedStyle($('#search')).fontSize)>=16&&$('#close-touch-library').getBoundingClientRect().height>=44,'library search and close are comfortable for touch');
   $('#search').focus();$('#touch-backdrop').click();await pause(40);
   assert($('#menu').getAttribute('aria-expanded')==='false'&&!$('.workspace').inert&&document.activeElement!==$('#search'),'outside tap closes the drawer and dismisses its editor focus');
   $('#menu').click();$('#show-notes').click();await wait(()=>!$('#panel').hidden,'notes drawer opens');
   assert(!$('#library').classList.contains('open')&&!$('#touch-backdrop').hidden,'only one side drawer can be open');
   $('.managed-note .note-actions button').click();await wait(()=>!$('#selection-actions').hidden,'annotation opens');await pause(400);
   assert([...document.querySelectorAll('#annotation-actions button,#annotation-tag-presets button')].every(b=>b.getBoundingClientRect().height>=43.5),'annotation actions and tag presets have large hit areas');
   assert(parseFloat(getComputedStyle($('#annotation-tag-input')).fontSize)>=16,'iPad tag editor avoids focus zoom');
   const beforeWidth=$('.pdf-page[data-page="1"]').getBoundingClientRect().width;
   const nativeViewport=Object.getOwnPropertyDescriptor(window,'visualViewport');
   const keyboard=Object.assign(new EventTarget(),{width:innerWidth,height:Math.min(310,innerHeight*.55),offsetTop:0,offsetLeft:0});
   try{
    Object.defineProperty(window,'visualViewport',{configurable:true,value:keyboard});window.dispatchEvent(new Event('resize'));await pause(250);
    assert(Math.abs($('.pdf-page[data-page="1"]').getBoundingClientRect().width-beforeWidth)<.5,'soft keyboard viewport does not shrink or reflow the PDF');
    $('#show-notes').click();await pause(100);
    assert($('#panel').getBoundingClientRect().bottom<=keyboard.height+1,'notes drawer stays above the simulated keyboard '+JSON.stringify({bottom:$('#panel').getBoundingClientRect().bottom,expected:keyboard.height,variable:document.documentElement.style.getPropertyValue('--ze-touch-view-bottom'),touch:document.documentElement.hasAttribute('data-ze-touch-ui'),cssBottom:getComputedStyle($('#panel')).bottom}));$('#notes-page').focus();await pause(80);$('#notes-query').focus();await pause(100);const focused=$('#notes-query').getBoundingClientRect();assert(focused.top>=$('#panel .panel-title').getBoundingClientRect().bottom-1&&focused.bottom<=keyboard.height+1,'focused notes search stays below the sticky heading and above the keyboard');$('#close-panel').click();
   }finally{Object.defineProperty(window,'visualViewport',nativeViewport);window.dispatchEvent(new Event('resize'));await pause(200)}
   $('#title').click();if(!$('#panel').hidden)$('#close-panel').click();
   const span=$('.pdf-page[data-ready="yes"] .textLayer span'),box=span.getBoundingClientRect(),x=box.left+3,y=(box.top+box.bottom)/2;
   getSelection().removeAllRanges();const finger=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:50,clientX:x,clientY:y});span.dispatchEvent(finger);span.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:50}));
   assert(!finger.defaultPrevented&&!$('#document').classList.contains('custom-selecting'),'a normal finger gesture remains available for scrolling');
   span.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'pen',pointerId:51,clientX:x,clientY:y}));span.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerType:'pen',pointerId:51,clientX:Math.min(x+90,box.right-2),clientY:y}));span.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'pen',pointerId:51,clientX:Math.min(x+90,box.right-2),clientY:y}));
   await wait(()=>!$('#selection-actions').hidden,'pen selection popup');assert(getSelection().toString().trim().length>0,'Pencil-style drag selects text and opens automatic translation');
   if($('#touch-select').getAttribute('aria-pressed')!=='true')$('#touch-select').click();
   assert(getComputedStyle($('.textLayer')).touchAction==='pinch-zoom','finger-selection mode preserves two-finger pinch zoom');
   span.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:52,clientX:x,clientY:y}));const pinch=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperties(pinch,{touches:{value:[{},{}]},changedTouches:{value:[{},{}]}});span.dispatchEvent(pinch);
   assert(!$('#document').classList.contains('custom-selecting')&&!getSelection().toString(),'a second finger cancels selection instead of marking a paragraph');span.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:52}));$('#touch-select').click();
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));assert(document.documentElement.hasAttribute('data-ze-touch-ui')&&$('#touch-tools'),'returning from Safari page cache retains touch controls');
   output.dataset.result='pass';
  }catch(error){output.textContent=results.join('\n')+'\nFAIL '+error.message;output.dataset.result='fail';console.error(error)}
 };
});
