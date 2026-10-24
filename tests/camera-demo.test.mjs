import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {classifyGesture, GestureStroke} from '../hand-gestures.mjs';

function hand(extended = []) {
  const points = Array.from({length:21}, () => ({x:.5,y:.8}));
  points[0] = {x:.5,y:.95};
  for (const [i, tip] of [8,12,16,20].entries()) {
    const x = .35 + i * .1;
    points[tip-3] = {x,y:.7};
    points[tip-2] = {x,y:.5};
    points[tip-1] = {x,y:.4};
    points[tip] = {x,y:extended.includes(tip) ? .25 : .75};
  }
  return points;
}
test('one raised index draws, one pinky erases, other gestures pause', () => {
  assert.equal(classifyGesture(hand([8])).mode,'draw');
  assert.equal(classifyGesture(hand([20])).mode,'erase');
  for (const fingers of [[],[8,20],[8,12,16,20],[12],[8,12]]) {
    assert.equal(classifyGesture(hand(fingers)).mode,'pause');
  }
  assert.equal(classifyGesture(undefined).mode,'missing');
  assert.equal(classifyGesture([{x:NaN,y:0}]).mode,'missing');
  const mirrored = hand([8]).map(p=>({x:1-p.x,y:p.y}));
  assert.equal(classifyGesture(mirrored).mode,'draw');
  const rotated = hand([20]).map(p=>({x:1-p.y,y:p.x}));
  assert.equal(classifyGesture(rotated).mode,'erase');
});
test('strokes settle, mirror the finger, and break across lost tracking', () => {
  const s = new GestureStroke();
  const draw = {mode:'draw',tip:{x:.25,y:.4}};
  assert.equal(s.update(draw,10,640,480),null);
  assert.equal(s.update(draw,60,640,480),null);
  const point = s.update(draw,110,640,480);
  assert.deepEqual(point.to,{x:480,y:192});
  s.update({mode:'missing',tip:null},160,640,480);
  assert.equal(s.update(draw,210,640,480),null);
  s.update(draw,260,640,480);
  const fresh = s.update(draw,310,640,480);
  assert.deepEqual(fresh.from,fresh.to);
  const jump = s.update({mode:'draw',tip:{x:.9,y:.9}},360,640,480);
  assert.deepEqual(jump.from,jump.to);
  assert.equal(s.update(draw,1000,640,480),null);
  assert.equal(s.update({mode:'erase',tip:{x:.25,y:.4}},1050,640,480),null);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const flush = async()=>{for(let i=0;i<18;i++) await Promise.resolve();};
function harness({pendingCamera, pendingModel, denied=false}={}) {
  const listeners = {};
  const context = new Proxy({}, {get:(o,k)=>o[k] ?? (()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  function element() {
    return {textContent:'',disabled:false,open:false,width:640,height:480,dataset:{},style:{},listeners:{},classList:{add(){},remove(){}},
      addEventListener(k,f){this.listeners[k]=f;}, getContext:()=>context, focus(){},
      showModal(){this.open=true;}, close(){this.open=false;this.listeners.close?.();},
      play:async()=>{},pause(){},videoWidth:640,videoHeight:480};
  }
  const ids=['camera-demo','open-camera-demo','close-camera-demo','start-camera','stop-camera','clear-camera','camera-status','camera-stage','hand-video','hand-ink','hand-overlay','gesture-badge'];
  const elements=Object.fromEntries(ids.map(id=>['#'+id,element()]));
  elements['#stop-camera'].disabled=true;
  let cameraCalls=0,stops=0,closes=0;
  const track={stop(){stops++;},addEventListener(){}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const model={close(){closes++;},detectForVideo:()=>({landmarks:[]})};
  const doc={hidden:false,body:element(),querySelector:s=>elements[s],createElement:element,addEventListener:(k,f)=>listeners[k]=f};
  const source=readFileSync(new URL('../camera-demo.js',import.meta.url),'utf8')
    .replace("import {classifyGesture, GestureStroke} from './hand-gestures.mjs';",'')
    .replace('await import(`${CDN}/vision_bundle.mjs`)','await loadVision()');
  vm.runInNewContext(source,{
    document:doc,window:{isSecureContext:true,addEventListener:(k,f)=>listeners[k]=f},
    navigator:{mediaDevices:{getUserMedia:async options=>{
      cameraCalls++;assert.equal(options.audio,false);
      if(denied) throw Object.assign(new Error(),{name:'NotAllowedError'});
      return pendingCamera ? pendingCamera.promise : stream;
    }}},
    classifyGesture,GestureStroke,requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    loadVision:async()=>({FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async()=>pendingModel ? pendingModel.promise : model}})
  });
  return {elements,doc,stream,model,listeners,counts:()=>({cameraCalls,stops,closes}),
    open:()=>elements['#open-camera-demo'].listeners.click(),
    start:()=>elements['#start-camera'].listeners.click(),
    close:()=>elements['#close-camera-demo'].listeners.click()};
}
test('opening prepares the model without accessing the camera; close stops tracks',async()=>{
  const h=harness();h.open();await flush();
  assert.equal(h.counts().cameraCalls,0);
  assert.equal(h.elements['#start-camera'].disabled,false);
  await h.start();assert.equal(h.counts().cameraCalls,1);
  assert.equal(h.elements['#stop-camera'].disabled,false);
  h.close();assert.equal(h.counts().stops,1);assert.equal(h.counts().closes,1);
  assert.equal(h.elements['#hand-video'].srcObject,null);
});
test('closing during a permission prompt stops a camera that resolves later',async()=>{
  const pendingCamera=deferred();const h=harness({pendingCamera});h.open();await flush();
  const start=h.start();h.close();pendingCamera.resolve(h.stream);await start;
  assert.equal(h.counts().stops,1);assert.equal(h.elements['#hand-video'].srcObject,null);
});
test('closing during model loading disposes the late detector',async()=>{
  const pendingModel=deferred();const h=harness({pendingModel});h.open();await flush();
  h.close();pendingModel.resolve(h.model);await flush();
  assert.equal(h.counts().closes,1);assert.equal(h.counts().cameraCalls,0);
});
test('leaving the tab releases the webcam',async()=>{
  const h=harness();h.open();await flush();await h.start();
  h.doc.hidden=true;h.listeners.visibilitychange();
  assert.equal(h.counts().stops,1);assert.equal(h.elements['#stop-camera'].disabled,true);
});
test('permission denial explains the problem and allows retry',async()=>{
  const h=harness({denied:true});h.open();await flush();await h.start();
  assert.match(h.elements['#camera-status'].textContent,/permission was denied/);
  assert.equal(h.elements['#start-camera'].disabled,false);
  assert.equal(h.elements['#stop-camera'].disabled,true);
});
