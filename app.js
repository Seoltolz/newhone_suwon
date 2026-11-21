let PHOTOS=[];
let PH={};
const IMG={}; // photo id -> object/signed URL
const SNAP=0.05, AREA_REG=75;
let rooms={}, pins={}, meta={h1:2.6,h2:2.6,slab:0.2,lotW:12,lotD:13};
let view="1", sel=null, selPhoto=null, pinStage=null, phFilter="all";
const st=document.getElementById('status');
const svg=document.getElementById('plan');
const NS="http://www.w3.org/2000/svg";
const r2=v=>Math.round(v*100)/100, snap=v=>Math.round(v/SNAP)*SNAP;
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- writes (store.js가 로컬/공유 저장을 처리) ---------- */
function save(col,id,patch,mode="update"){ if(mode==="set")Store.put(col,id,patch); else Store.patch(col,id,patch); }
function remove(col,id){ Store.del(col,id); }

/* ---------- plan geometry ---------- */
function floorRooms(f){return Object.entries(rooms).filter(([,r])=>String(r.floor)===f).map(([id,r])=>({id,...r}));}
function extent(){
  let maxX=meta.lotW||12,maxY=meta.lotD||13;
  Object.values(rooms).forEach(r=>{maxX=Math.max(maxX,r.x+r.w+1);maxY=Math.max(maxY,r.y+r.d+1);});
  return {minX:-1.5,minY:-2.5,maxX:maxX+1,maxY:maxY+1};
}
let vb=null;
function toSvgPt(ev){const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,y:-q.y};}
// plan coords: x to the right (정면 기준 왼쪽→오른쪽), y from front (도로, 0) to back. SVG y is flipped so the street is at the bottom.
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
function renderPlan(){
  if(view==="3d")return;
  const ex=extent(); svg.innerHTML="";
  svg.setAttribute("viewBox",`${ex.minX} ${-ex.maxY} ${ex.maxX-ex.minX} ${ex.maxY-ex.minY}`);
  const g=el("g",{},svg);
  for(let x=Math.ceil(ex.minX);x<=ex.maxX;x++)el("line",{x1:x,y1:-ex.maxY,x2:x,y2:-ex.minY,stroke:x%5?cssv('--grid'):cssv('--grid2'),"stroke-width":x%5?0.02:0.04},g);
  for(let y=Math.ceil(ex.minY);y<=ex.maxY;y++)el("line",{x1:ex.minX,y1:-y,x2:ex.maxX,y2:-y,stroke:y%5?cssv('--grid'):cssv('--grid2'),"stroke-width":y%5?0.02:0.04},g);
  // street marker + lot outline
  el("rect",{x:0,y:-(meta.lotD||13),width:meta.lotW||12,height:meta.lotD||13,fill:"none",stroke:cssv('--ext'),"stroke-width":0.05,"stroke-dasharray":"0.3 0.15"},g);
  const t=el("text",{x:(meta.lotW||12)/2,y:1.4,"text-anchor":"middle","font-size":0.45,fill:cssv('--muted'),"font-family":"IBM Plex Sans KR, sans-serif"},g);t.textContent="▼ 도로 (정면) · 대지 경계는 가정값";
  const other=view==="1"?"2":"1";
  floorRooms(other).forEach(r=>el("rect",{x:r.x,y:-(r.y+r.d),width:r.w,height:r.d,fill:"none",stroke:cssv('--muted'),"stroke-width":0.03,"stroke-dasharray":"0.1 0.1",opacity:.5},g));
  const fc=view==="1"?cssv('--f1'):cssv('--f2'), ff=view==="1"?cssv('--f1-fill'):cssv('--f2-fill');
  floorRooms(view).forEach(r=>{
    const grp=el("g",{"data-room":r.id,style:"cursor:move"},g);
    const m=r.meas||{};
    el("rect",{x:r.x,y:-(r.y+r.d),width:r.w,height:r.d,fill:ff,stroke:"none"},grp);
    // four edges: solid green if that dimension is measured
    const edges=[[r.x,r.y,r.x+r.w,r.y,m.w],[r.x,r.y+r.d,r.x+r.w,r.y+r.d,m.w],[r.x,r.y,r.x,r.y+r.d,m.d],[r.x+r.w,r.y,r.x+r.w,r.y+r.d,m.d]];
    edges.forEach(([a,b,c,d,ms])=>el("line",{x1:a,y1:-b,x2:c,y2:-d,stroke:ms?cssv('--meas'):fc,"stroke-width":ms?0.09:0.05,"stroke-dasharray":ms?"":"0.18 0.1"},grp));
    if(sel===r.id)el("rect",{x:r.x,y:-(r.y+r.d),width:r.w,height:r.d,fill:"none",stroke:cssv('--sel'),"stroke-width":0.08},grp);
    const fs=Math.max(0.22,Math.min(0.38,r.w/7));
    const lab=el("text",{x:r.x+r.w/2,y:-(r.y+r.d/2)-fs*0.2,"text-anchor":"middle","font-size":fs,"font-weight":700,fill:cssv('--fg'),"font-family":"IBM Plex Sans KR, sans-serif","pointer-events":"none"},grp);lab.textContent=r.name||"방";
    const dim=el("text",{x:r.x+r.w/2,y:-(r.y+r.d/2)+fs*1.0,"text-anchor":"middle","font-size":fs*0.75,fill:cssv('--muted'),"font-family":"IBM Plex Mono, monospace","pointer-events":"none"},grp);dim.textContent=`${r.w.toFixed(2)}×${r.d.toFixed(2)} · ${(r.w*r.d).toFixed(1)}㎡`;
    if(sel===r.id){
      [["e",r.x+r.w,r.y+r.d/2],["w",r.x,r.y+r.d/2],["n",r.x+r.w/2,r.y+r.d],["s",r.x+r.w/2,r.y]].forEach(([h,x,y])=>
        el("circle",{cx:x,cy:-y,r:0.16,fill:cssv('--sel'),stroke:cssv('--surface'),"stroke-width":0.04,"data-h":h,style:`cursor:${h==="e"||h==="w"?"ew":"ns"}-resize`},grp));
    }
  });
  // pins
  Object.entries(pins).forEach(([id,p])=>{
    const show=p.floor===view||(p.floor==="ext"&&view==="1");
    if(!show)return;
    const col=p.floor==="ext"?cssv('--ext'):fc;
    const pg=el("g",{"data-pin":id,style:"cursor:pointer"},g);
    const a=(p.a||0)*Math.PI/180, L=0.9;
    // a: 0 = 뒤쪽(+y)을 봄, 시계방향
    const tx=p.x+Math.sin(a)*L, ty=p.y+Math.cos(a)*L;
    el("path",{d:`M${p.x} ${-p.y} L${p.x+Math.sin(a-0.4)*L} ${-(p.y+Math.cos(a-0.4)*L)} A ${L} ${L} 0 0 1 ${p.x+Math.sin(a+0.4)*L} ${-(p.y+Math.cos(a+0.4)*L)} Z`,fill:col,opacity:.22},pg);
    el("line",{x1:p.x,y1:-p.y,x2:tx,y2:-ty,stroke:col,"stroke-width":0.05},pg);
    el("circle",{cx:p.x,cy:-p.y,r:0.2,fill:col,stroke:cssv('--surface'),"stroke-width":0.04},pg);
    const tt=el("text",{x:p.x,y:-p.y+0.08,"text-anchor":"middle","font-size":0.17,"font-weight":700,fill:"#fff","font-family":"IBM Plex Mono, monospace","pointer-events":"none"},pg);tt.textContent=id.slice(1);
  });
  if(pinStage){
    const p=pinStage;
    el("circle",{cx:p.x,cy:-p.y,r:0.22,fill:"none",stroke:cssv('--sel'),"stroke-width":0.06},g);
    if(p.tx!=null)el("line",{x1:p.x,y1:-p.y,x2:p.tx,y2:-p.ty,stroke:cssv('--sel'),"stroke-width":0.06},g);
  }
}

/* ---------- plan interaction ---------- */
let drag=null;
svg.addEventListener('pointerdown',ev=>{
  const pt=toSvgPt(ev);
  if(selPhoto){
    if(!pinStage){pinStage={x:snap(pt.x),y:snap(pt.y)};renderPlan();return;}
    const a=Math.round(Math.atan2(pt.x-pinStage.x,pt.y-pinStage.y)*180/Math.PI);
    const floor=PH[selPhoto].zone==="외부"?"ext":view;
    const rm=floorRooms(view).find(r=>pinStage.x>=r.x&&pinStage.x<=r.x+r.w&&pinStage.y>=r.y&&pinStage.y<=r.y+r.d);
    const doc={floor,x:pinStage.x,y:pinStage.y,a,room:rm?rm.id:""};
    pins[selPhoto]=doc; save("pins",selPhoto,doc,"set");
    pinStage=null; const next=selPhoto; selPhoto=null; renderAll(); showPhInfo(next); return;
  }
  const h=ev.target.closest('[data-h]'), rg=ev.target.closest('[data-room]'), pg=ev.target.closest('[data-pin]');
  if(pg){openPhoto(pg.dataset.pin);return;}
  if(h&&sel){drag={mode:h.dataset.h,id:sel,start:pt,orig:{...rooms[sel]}};svg.setPointerCapture(ev.pointerId);return;}
  if(rg){sel=rg.dataset.room;drag={mode:"move",id:sel,start:pt,orig:{...rooms[sel]}};svg.setPointerCapture(ev.pointerId);renderAll();return;}
  sel=null;renderAll();
});
svg.addEventListener('pointermove',ev=>{
  const pt=toSvgPt(ev);
  if(pinStage){pinStage.tx=pt.x;pinStage.ty=pt.y;renderPlan();return;}
  if(!drag)return;
  const dx=pt.x-drag.start.x, dy=pt.y-drag.start.y, o=drag.orig, r=rooms[drag.id];
  if(drag.mode==="move"){r.x=snap(o.x+dx);r.y=snap(o.y+dy);}
  else if(drag.mode==="e"){r.w=Math.max(0.5,snap(o.w+dx));}
  else if(drag.mode==="w"){const nx=snap(o.x+dx);r.w=Math.max(0.5,r2(o.x+o.w-nx));r.x=r2(o.x+o.w-r.w);}
  else if(drag.mode==="n"){r.d=Math.max(0.5,snap(o.d+dy));}
  else if(drag.mode==="s"){const ny=snap(o.y+dy);r.d=Math.max(0.5,r2(o.y+o.d-ny));r.y=r2(o.y+o.d-r.d);}
  r.x=r2(r.x);r.y=r2(r.y);r.w=r2(r.w);r.d=r2(r.d);
  renderPlan();
});
svg.addEventListener('pointerup',()=>{
  if(!drag)return; const rid=drag.id, r=rooms[rid], o=drag.orig; drag=null;
  if(r.x!==o.x||r.y!==o.y||r.w!==o.w||r.d!==o.d){
    const patch={x:r.x,y:r.y,w:r.w,d:r.d};
    if(r.w!==o.w&&r.meas&&r.meas.w){patch.meas={...r.meas,w:false};r.meas=patch.meas;}
    if(r.d!==o.d&&r.meas&&r.meas.d){patch.meas={...(patch.meas||r.meas),d:false};r.meas=patch.meas;}
    save("rooms",rid,patch);
  }
  renderAll();
});
document.addEventListener('keydown',e=>{if(e.key==="Escape"){pinStage=null;selPhoto=null;renderAll();}});

/* ---------- inspector ---------- */
function renderInspector(){
  const box=document.getElementById('insp');
  const r=sel&&rooms[sel];
  if(!r){box.innerHTML='<p class="empty-note">평면에서 방을 누르면 여기서 이름과 치수를 고칠 수 있어요.</p>';return;}
  const m=r.meas||{}, est=r.est||{};
  const photosIn=Object.entries(pins).filter(([,p])=>p.room===sel).map(([id])=>id);
  box.innerHTML=`
  <div class="grid2"><label class="f">이름<input type="text" id="i-name" value="${esc(r.name)}"></label>
  <label class="f">층<select id="i-floor"><option value="1"${r.floor=="1"?" selected":""}>1층</option><option value="2"${r.floor=="2"?" selected":""}>2층</option></select></label></div>
  <div class="grid4" style="margin-top:8px">
    <label class="f">X (왼→오)<input type="number" step="0.05" id="i-x" value="${r.x}"></label>
    <label class="f">Y (앞→뒤)<input type="number" step="0.05" id="i-y" value="${r.y}"></label>
    <label class="f">가로 m ${m.w?'<span class="tag m">실측</span>':'<span class="tag e">추정</span>'}<input type="number" step="0.05" id="i-w" value="${r.w}"></label>
    <label class="f">세로 m ${m.d?'<span class="tag m">실측</span>':'<span class="tag e">추정</span>'}<input type="number" step="0.05" id="i-d" value="${r.d}"></label>
  </div>
  <label class="f" style="margin-top:8px">메모<textarea id="i-note" rows="2">${esc(r.note)}</textarea></label>
  <div class="meas-box">
    <div style="font-size:.85rem;font-weight:600;margin-bottom:6px">실측값 넣기 <span class="muted" style="font-weight:400">처음 추정: ${est.w??"-"} × ${est.d??"-"} m</span></div>
    <div class="grid2"><label class="f">실측 가로 m<input type="number" step="0.01" id="m-w" placeholder="${r.w}"></label><label class="f">실측 세로 m<input type="number" step="0.01" id="m-d" placeholder="${r.d}"></label></div>
    <label class="chk" style="margin-top:6px"><input type="checkbox" id="m-push" checked> 오른쪽·뒤쪽에 붙은 방도 같이 밀기</label>
    <div class="row" style="margin-top:8px"><button class="btn primary" type="button" id="m-apply">실측 적용</button><button class="btn" type="button" id="i-del">방 삭제</button></div>
  </div>
  <p class="muted" style="font-size:.8rem;margin:8px 0 0">이 방에 꽂힌 사진: ${photosIn.length?photosIn.join(", "):"없음"}</p>`;
  const upd=(k,v)=>{rooms[sel][k]=v;save("rooms",sel,{[k]:v});renderAll(true);};
  box.querySelector('#i-name').addEventListener('change',e=>upd("name",e.target.value));
  box.querySelector('#i-floor').addEventListener('change',e=>upd("floor",e.target.value));
  box.querySelector('#i-note').addEventListener('change',e=>upd("note",e.target.value));
  ["x","y","w","d"].forEach(k=>box.querySelector('#i-'+k).addEventListener('change',e=>{const v=r2(parseFloat(e.target.value));if(!isNaN(v))upd(k,v);}));
  box.querySelector('#m-apply').addEventListener('click',()=>{
    const mw=parseFloat(box.querySelector('#m-w').value), md=parseFloat(box.querySelector('#m-d').value);
    applyMeasure(sel,isNaN(mw)?null:r2(mw),isNaN(md)?null:r2(md),box.querySelector('#m-push').checked);
  });
  box.querySelector('#i-del').addEventListener('click',e=>{
    if(e.target.dataset.c!=="1"){e.target.dataset.c="1";e.target.textContent="한 번 더 누르면 삭제";return;}
    const id=sel;delete rooms[id];sel=null;remove("rooms",id);renderAll();
  });
}
// 실측 반영: 방 크기를 실측값으로 바꾸고, 같은 층에서 이 방의 오른쪽(뒤쪽) 변 이후에 시작하는 방들을 차이만큼 같이 이동
function applyMeasure(id,mw,md,push){
  const r=rooms[id]; if(!r)return; const meas={...(r.meas||{})};
  const moves={};
  if(mw!=null){const dw=r2(mw-r.w), edge=r.x+r.w;
    if(push&&dw)Object.entries(rooms).forEach(([k,o])=>{if(k!==id&&String(o.floor)===String(r.floor)&&o.x>=edge-0.01){o.x=r2(o.x+dw);moves[k]={...(moves[k]||{}),x:o.x};}});
    if(push&&dw)Object.entries(pins).forEach(([k,p])=>{if(p.floor===String(r.floor)&&p.x>=edge-0.01){p.x=r2(p.x+dw);save("pins",k,{x:p.x});}});
    r.w=mw;meas.w=true;}
  if(md!=null){const dd=r2(md-r.d), edge=r.y+r.d;
    if(push&&dd)Object.entries(rooms).forEach(([k,o])=>{if(k!==id&&String(o.floor)===String(r.floor)&&o.y>=edge-0.01){o.y=r2(o.y+dd);moves[k]={...(moves[k]||{}),y:o.y};}});
    if(push&&dd)Object.entries(pins).forEach(([k,p])=>{if(p.floor===String(r.floor)&&p.y>=edge-0.01){p.y=r2(p.y+dd);save("pins",k,{y:p.y});}});
    r.d=md;meas.d=true;}
  r.meas=meas; save("rooms",id,{w:r.w,d:r.d,meas});
  Object.entries(moves).forEach(([k,p])=>save("rooms",k,p));
  st.textContent=Object.keys(moves).length?`실측 반영, 방 ${Object.keys(moves).length}개 같이 이동`:"실측 반영";
  renderAll();
}
document.getElementById('addRoom').addEventListener('click',()=>{
  const f=view==="3d"?"1":view; const id="r"+Date.now().toString(36);
  const doc={floor:f,name:"새 방",x:1,y:1,w:3,d:3,est:{w:3,d:3},meas:{},note:""};
  rooms[id]=doc; sel=id; save("rooms",id,doc,"set"); if(view==="3d")setView(f); renderAll();
});

/* ---------- lists ---------- */
function renderList(){
  const tb=document.getElementById('roomList');
  const all=Object.entries(rooms).sort((a,b)=>String(a[1].floor).localeCompare(String(b[1].floor))||a[1].y-b[1].y||a[1].x-b[1].x);
  tb.innerHTML=all.length?all.map(([id,r])=>{const m=r.meas||{};const s=m.w&&m.d?'<span class="tag m">실측</span>':(m.w||m.d)?'<span class="tag m">일부</span>':'<span class="tag e">추정</span>';
    return `<tr data-id="${id}" class="${sel===id?'sel':''}"><td>${r.floor}층</td><td>${esc(r.name)}</td><td>${r.w.toFixed(2)}</td><td>${r.d.toFixed(2)}</td><td>${(r.w*r.d).toFixed(1)}</td><td>${s}</td></tr>`}).join("")
    :'<tr><td colspan="6" class="empty-note">아직 방이 없어요. 평면도를 받으면 채워 넣을게요. 직접 "+ 방 추가"로 그려도 돼요.</td></tr>';
}
document.getElementById('roomList').addEventListener('click',e=>{const tr=e.target.closest('tr[data-id]');if(!tr)return;sel=tr.dataset.id;setView(String(rooms[sel].floor));});
function renderSummary(){
  const out=[];
  ["1","2"].forEach(f=>{const rs=floorRooms(f);const a=rs.reduce((s,r)=>s+r.w*r.d,0);
    let bx=0,by=0;rs.forEach(r=>{bx=Math.max(bx,r.x+r.w);by=Math.max(by,r.y+r.d);});
    const mx=rs.length?Math.min(...rs.map(r=>r.x)):0,my=rs.length?Math.min(...rs.map(r=>r.y)):0;
    const mc=rs.filter(r=>r.meas&&r.meas.w&&r.meas.d).length;
    out.push(`<span>${f}층 방 면적 합</span><b>${a.toFixed(1)}㎡ <span class="muted">/ 대장 ${AREA_REG}㎡ (${a?((a/AREA_REG)*100).toFixed(0):0}%)</span></b>`);
    out.push(`<span>${f}층 외곽</span><b>${rs.length?(bx-mx).toFixed(2)+" × "+(by-my).toFixed(2)+" m":"-"}</b>`);
    out.push(`<span>${f}층 실측 완료</span><b>${mc} / ${rs.length}개 방</b>`);
  });
  const placed=Object.keys(pins).length;
  out.push(`<span>사진 핀</span><b>${placed} / ${PHOTOS.length}장</b>`);
  document.getElementById('summary').innerHTML=out.join("");
  document.getElementById('phCount').textContent=`${placed}/${PHOTOS.length}장 배치`;
}
function renderStrip(){
  const s=document.getElementById('strip');
  s.innerHTML=PHOTOS.filter(p=>phFilter==="all"||(phFilter==="un"?!pins[p.id]:p.zone===phFilter)).map(p=>{
    const z=p.zone==="1층"?"f1":p.zone==="2층"?"f2":"ext";
    return `<button type="button" class="ph ${z}${IMG[p.id]?'':' nofile'}${pins[p.id]?' placed':''}" data-id="${p.id}" aria-pressed="${selPhoto===p.id}" title="${esc(p.loc)}">${IMG[p.id]?`<img loading="lazy" src="${IMG[p.id]}" alt="${p.id} ${esc(p.loc)}">`:''}<span>${p.id}</span></button>`}).join("");
}
let lastClick={id:null,t:0};
document.getElementById('strip').addEventListener('click',e=>{
  const b=e.target.closest('.ph');if(!b)return;const id=b.dataset.id;const now=Date.now();
  if(lastClick.id===id&&now-lastClick.t<400){openPhoto(id);lastClick={id:null,t:0};return;}
  lastClick={id,t:now};
  selPhoto=selPhoto===id?null:id;pinStage=null;
  const z=PH[id].zone; if(selPhoto&&(z==="1층"||z==="2층")&&view!==(z==="1층"?"1":"2"))setView(z==="1층"?"1":"2");
  else if(selPhoto&&z==="외부"&&view==="3d")setView("1");
  renderStrip();showPhInfo(id);
});
function showPhInfo(id){
  const p=PH[id],pin=pins[id],box=document.getElementById('phInfo');
  if(!p){box.textContent="";return;}
  const rm=pin&&pin.room&&rooms[pin.room]?rooms[pin.room].name:"";
  box.innerHTML=`<b>${id}</b> · ${esc(p.zone)} · ${esc(p.loc)}${p.memo?' · <span style="color:var(--brick)">'+esc(p.memo)+'</span>':''}<br>`+
    (selPhoto===id?`<span style="color:var(--sel)">평면에서 찍은 위치를 누르고, 바라보는 쪽을 한 번 더 누르세요. (Esc 취소)</span>`:
     pin?`배치됨${rm?' · '+esc(rm):''} · 방향 ${pin.a}° <button class="btn" type="button" id="unpin" style="padding:2px 8px;font-size:.8rem">핀 빼기</button>`:'아직 안 꽂음');
  const u=document.getElementById('unpin'); if(u)u.addEventListener('click',()=>{delete pins[id];remove("pins",id);renderAll();showPhInfo(id);});
}
document.querySelectorAll('[data-pf]').forEach(b=>b.addEventListener('click',()=>{phFilter=b.dataset.pf;document.querySelectorAll('[data-pf]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderStrip();}));
function openPhoto(id){const p=PH[id];if(!p)return;if(!IMG[id]){showPhInfo(id);st.textContent="이 사진 파일이 아직 없어요. '사진 파일 선택'으로 불러와 주세요.";return;}document.getElementById('lbimg').src=IMG[id];
  document.getElementById('lbcap').textContent=`${id} · ${p.zone} · ${p.loc}${p.memo?' · '+p.memo:''}`;document.getElementById('lb').showModal();}
document.getElementById('lb').addEventListener('click',e=>e.currentTarget.close());

/* ---------- 3D ---------- */
let T=null;
function init3d(){
  if(T||!window.THREE)return; const host=document.getElementById('three');
  const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio));
  host.appendChild(renderer.domElement);
  const scene=new THREE.Scene(); const cam=new THREE.PerspectiveCamera(45,1,0.1,500);
  cam.position.set(18,16,-14);
  const ctl=new THREE.OrbitControls(cam,renderer.domElement); ctl.target.set(5,2,6);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a7f72,0.9)); const dl=new THREE.DirectionalLight(0xffffff,0.6); dl.position.set(10,20,-8); scene.add(dl);
  const group=new THREE.Group(); scene.add(group);
  const ray=new THREE.Raycaster(), mouse=new THREE.Vector2();
  renderer.domElement.addEventListener('click',ev=>{const rc=renderer.domElement.getBoundingClientRect();mouse.x=((ev.clientX-rc.left)/rc.width)*2-1;mouse.y=-((ev.clientY-rc.top)/rc.height)*2+1;
    ray.setFromCamera(mouse,cam);const hit=ray.intersectObjects(group.children,true).find(h=>h.object.userData.pin);if(hit)openPhoto(hit.object.userData.pin);});
  T={renderer,scene,cam,ctl,group,host};
  const loop=()=>{if(view==="3d"){ctl.update();renderer.render(scene,cam);}requestAnimationFrame(loop);};loop();
  new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);cam.aspect=w/h;cam.updateProjectionMatrix();}).observe(host);
}
function build3d(){
  if(!T)return; const {group,scene}=T; while(group.children.length){const c=group.children.pop();c.geometry&&c.geometry.dispose();}
  scene.background=new THREE.Color(cssv('--surface')||"#ffffff");
  const z0={"1":0,"2":meta.h1+meta.slab}, H={"1":meta.h1,"2":meta.h2};
  // 3D axes: x = plan x, z = plan y (뒤쪽), y = up
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(meta.lotW||12,meta.lotD||13),new THREE.MeshLambertMaterial({color:0xb9c39a,transparent:true,opacity:.35,side:THREE.DoubleSide}));
  ground.rotation.x=-Math.PI/2;ground.position.set((meta.lotW||12)/2,-0.01,(meta.lotD||13)/2);group.add(ground);
  Object.values(rooms).forEach(r=>{
    const f=String(r.floor),base=z0[f],h=H[f],col=new THREE.Color(cssv(f==="1"?'--f1':'--f2'));
    const slab=new THREE.Mesh(new THREE.BoxGeometry(r.w,0.06,r.d),new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.55}));
    slab.position.set(r.x+r.w/2,base,r.y+r.d/2);group.add(slab);
    const box=new THREE.Mesh(new THREE.BoxGeometry(r.w,h,r.d),new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.08,depthWrite:false}));
    box.position.set(r.x+r.w/2,base+h/2,r.y+r.d/2);group.add(box);
    const m=r.meas||{};
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w,h,r.d)),new THREE.LineBasicMaterial({color:(m.w&&m.d)?new THREE.Color(cssv('--meas')):col}));
    edges.position.copy(box.position);group.add(edges);
    const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle=cssv('--fg')||"#222";x.font="bold 30px sans-serif";x.textAlign="center";x.fillText(r.name||"",128,42);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));sp.scale.set(2,0.5,1);sp.position.set(r.x+r.w/2,base+0.4,r.y+r.d/2);group.add(sp);
  });
  Object.entries(pins).forEach(([id,p])=>{
    const base=p.floor==="ext"?0:z0[p.floor]; const col=new THREE.Color(cssv(p.floor==="ext"?'--ext':p.floor==="1"?'--f1':'--f2'));
    const cone=new THREE.Mesh(new THREE.ConeGeometry(0.18,0.5,12),new THREE.MeshLambertMaterial({color:col}));
    const a=(p.a||0)*Math.PI/180; cone.position.set(p.x,base+1.5,p.y);
    cone.lookAt(p.x+Math.sin(a),base+1.5,p.y+Math.cos(a)); cone.rotateX(Math.PI/2); cone.userData.pin=id; group.add(cone);
    const s=new THREE.Mesh(new THREE.SphereGeometry(0.14,10,10),new THREE.MeshLambertMaterial({color:col}));s.position.set(p.x,base+1.5,p.y);s.userData.pin=id;group.add(s);
  });
}
function setView(v){
  view=v; document.querySelectorAll('[data-v]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));
  const is3=v==="3d"; svg.toggleAttribute('hidden',is3); document.getElementById('three').hidden=!is3;
  document.getElementById('hint').textContent=is3?"끌어서 돌리고, 휠이나 두 손가락으로 확대해요. 원뿔(사진 핀)을 누르면 사진이 열려요.":"방을 끌어서 옮기고, 선택한 방의 노란 점을 끌어서 크기를 바꿔요. 아래 사진을 고른 뒤 평면을 누르면 핀이 꽂히고, 한 번 더 누르면 바라보는 방향이 정해져요.";
  if(is3){init3d();build3d();}
  renderAll();
}
document.querySelectorAll('[data-v]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.v)));
function renderAll(skipInsp){renderPlan();if(!skipInsp)renderInspector();renderList();renderSummary();renderStrip();if(view==="3d")build3d();}
renderAll();


/* ---------- data ---------- */
Store.status=t=>{st.textContent=t;};
function applyState(s){
  rooms=s.rooms||{}; pins=s.pins||{}; meta={h1:2.6,h2:2.6,slab:0.2,lotW:12,lotD:13,...(s.meta||{})};
  if(sel&&!rooms[sel])sel=null;
}
const editingNow=()=>drag||pinStage||(document.activeElement&&document.getElementById('insp').contains(document.activeElement));
Store.onChange(s=>{
  if(drag){const keep=rooms[drag.id];applyState(s);rooms[drag.id]=keep;}else applyState(s);
  renderAll(!!editingNow());
});
// 사진 파일 매칭: 원본 파일명(확장자 제외)이 같으면 같은 사진으로 봐요.
const stem=n=>n.replace(/\.[^.]+$/,"").toUpperCase();
document.getElementById('photoFiles').addEventListener('change',async e=>{
  const files=[...e.target.files]; if(!files.length)return;
  const byStem=Object.fromEntries(PHOTOS.map(p=>[stem(p.file),p]));
  let n=0,up=0;
  for(const f of files){
    const p=byStem[stem(f.name)]; if(!p)continue;
    if(IMG[p.id]&&IMG[p.id].startsWith("blob:"))URL.revokeObjectURL(IMG[p.id]);
    IMG[p.id]=URL.createObjectURL(f); n++;
    if(Store.mode==="shared"){st.textContent=`사진 올리는 중… ${up}/${n}`; if(await Store.uploadPhoto(f,p.file))up++;}
  }
  st.textContent=n?(Store.mode==="shared"?`사진 ${n}장 연결, ${up}장 공유 저장소에 올림`:`사진 ${n}장 연결 (이 브라우저에서만 보여요)`):"목록에 있는 사진과 이름이 맞는 파일이 없어요";
  e.target.value=""; renderStrip();
});
document.getElementById('exportJson').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(Store.get(),null,2)],{type:"application/json"});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`floorplan_${Store.project}_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
document.getElementById('importJson').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{const s=JSON.parse(await f.text()); if(!s.rooms)throw 0; await Store.replaceAll(s); st.textContent="데이터를 불러왔어요";}
  catch(err){st.textContent="이 파일은 평면 데이터 형식이 아니에요";}
  e.target.value="";
});
(async()=>{
  try{ PHOTOS=await (await fetch("seed/photos.json",{cache:"no-store"})).json(); PH=Object.fromEntries(PHOTOS.map(p=>[p.id,p])); }
  catch(e){ PHOTOS=[]; PH={}; }
  const {mode}=await Store.init();
  const badge=document.getElementById('mode');
  badge.textContent=mode==="shared"?`공유 중 · ${Store.project}`:"로컬 (이 브라우저에만 저장)";
  badge.classList.toggle('shared',mode==="shared");
  if(st.textContent==="불러오는 중…")st.textContent="불러옴";
  setView("1");
  if(mode==="shared"){
    const urls=await Store.photoUrls(PHOTOS.map(p=>p.file));
    PHOTOS.forEach(p=>{ if(urls[p.file])IMG[p.id]=urls[p.file]; });
    renderStrip();
  }
})();
