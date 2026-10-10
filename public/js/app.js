(()=>{
"use strict";

const interests=['Новости','Бизнес','Технологии','Авто','Кино и сериалы','Спорт','Финансы','Локальное','Путешествия','Наука','Стиль жизни','Парфюмерия','Политика','Игры','Криптовалюты','Мир'];
const imgFallback={
'Новости':'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80',
'Бизнес':'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80',
'Технологии':'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
'Авто':'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
'Кино и сериалы':'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80',
'Спорт':'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80',
'Финансы':'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=1200&q=80',
'Локальное':'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1200&q=80',
'Путешествия':'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
'Наука':'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80',
'Стиль жизни':'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=80',
'Парфюмерия':'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=80',
'Политика':'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1200&q=80',
'Игры':'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
'Криптовалюты':'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=1200&q=80',
'Мир':'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80'
};
const S={profile:null,news:[],searchItems:[],saved:new Set(),savedItems:[],screen:'home',activeCat:'Для тебя',minutes:5,digest:[],ob:{step:0,interests:[]},tg:null,feedIndex:0,cardDir:1};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const {isRussianEvent,localizedTitle,localizedSummary,russianRatio}=window.PULSENormalizer;
const {imgFor,prefetch,safeImage,imageUrl,bindImageErrors}=window.PULSEImages;
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function api(path,opt={}){
  opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};
  if(S.tg?.initData)opt.headers['X-Telegram-Init-Data']=S.tg.initData;
  return fetch(path,opt).then(async r=>{
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(d.error||`HTTP ${r.status}`),{status:r.status,data:d});
    return d;
  });
}
function tgInit(){
  try{
    const t=window.Telegram?.WebApp;
    if(t){t.ready();t.expand();S.tg=t;}
  }catch{}
}
function toast(msg){
  const x=$('#toast');x.textContent=msg;x.classList.add('show');
  clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.remove('show'),1800);
}
const PROFILE_STORE_KEY='pulse_profile_v3';
function profileSnapshot(p){return {name:p?.name||'',country:p?.country||'',city:p?.city||'',profession:p?.profession||'',interests:p?.interests||[],priorities:p?.priorities||[],otherGeographies:p?.otherGeographies||[],defaultMinutes:p?.defaultMinutes||5,onboardingDone:!!p?.onboardingDone,profileVersion:Number(p?.profileVersion||0)};}
function localProfileRead(){try{return JSON.parse(localStorage.getItem(PROFILE_STORE_KEY)||'null')}catch{return null}}
function localProfileWrite(p){try{localStorage.setItem(PROFILE_STORE_KEY,JSON.stringify(profileSnapshot(p)))}catch{}}
function cloudGet(key){
  return new Promise(resolve=>{
    const c=S.tg?.CloudStorage;
    if(!c?.getItem){resolve(null);return}
    try{c.getItem(key,(err,val)=>resolve(err?null:val||null))}catch{resolve(null)}
  });
}
function cloudSet(key,val){
  return new Promise(resolve=>{
    const c=S.tg?.CloudStorage;
    if(!c?.setItem){resolve(false);return}
    try{c.setItem(key,val,err=>resolve(!err))}catch{resolve(false)}
  });
}
async function saveProfileSnapshot(p){
  const snap=profileSnapshot(p);localProfileWrite(snap);
  await cloudSet(PROFILE_STORE_KEY,JSON.stringify(snap));
}
async function restoreProfileSnapshot(serverProfile){
  let snap=localProfileRead();
  if(!snap){
    const raw=await cloudGet(PROFILE_STORE_KEY);
    try{snap=raw?JSON.parse(raw):null}catch{snap=null}
  }
  const validSnap=snap?.profileVersion===3&&snap?.onboardingDone&&Array.isArray(snap.interests)&&snap.interests.length>0;
  const validServer=serverProfile?.profileVersion===3&&serverProfile?.onboardingDone&&Array.isArray(serverProfile.interests)&&serverProfile.interests.length>0;
  if(validServer)return serverProfile;
  if(!validSnap)return serverProfile;
  try{
    const r=await api('/api/profile',{method:'PUT',body:JSON.stringify({...snap,onboardingDone:true,profileVersion:3})});
    return r.profile;
  }catch{return {...serverProfile,...snap,profileVersion:3}}
}
function topic(e){return e.topics?.[0]||'Новости'}
function timeAgo(d){
  const m=Math.max(0,Math.floor((Date.now()-new Date(d))/60000));
  if(m<1)return'сейчас';if(m<60)return`${m} мин`;
  const h=Math.floor(m/60);if(h<24)return`${h} ч`;return`${Math.floor(h/24)} д`;
}
function initials(p){return(p?.name||'P').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}

function show(id){
  S.screen=id;
  $$('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
  if(id==='saved')loadSaved();
  if(id==='profile')renderProfile();
  if(id==='digest')renderDigest();
  nav();
}
function renderCats(){
  const selected=[...new Set((S.profile?.interests||[]).filter(x=>interests.includes(x)))];
  const cats=['Для тебя',...selected];
  if(S.activeCat!=='Для тебя'&&!selected.includes(S.activeCat))S.activeCat='Для тебя';
  $('#cats').innerHTML=cats.map(x=>`<button type="button" class="pill ${S.activeCat===x?'active':''}" data-cat="${esc(x)}">${esc(x)}</button>`).join('');
  $$('#cats .pill').forEach(x=>x.onclick=async()=>{
    S.activeCat=x.dataset.cat;S.feedIndex=0;renderCats();
    if(S.activeCat==='Для тебя'){loadNews(false);return}
    $('#feed').innerHTML='<div class="loading">Ищем свежие события…</div>';
    try{
      const r=await api('/api/news?minutes='+S.minutes+'&category='+encodeURIComponent(S.activeCat));
      S.news=(r.items||[]).filter(e=>e.topics?.includes(S.activeCat)||e.topics?.[0]===S.activeCat);S.profile=r.profile||S.profile;S.saved=new Set(S.news.filter(x=>x.saved).map(x=>x.id));renderHome();
    }catch{renderHome()}
  });
}

function filterNews(){
  if(S.activeCat==='Для тебя')return S.news;
  return S.news.filter(e=>e.topics?.includes(S.activeCat)||topic(e)===S.activeCat);
}


function card(e,extraClass='current-card'){
  const liked=e.liked?'liked':'',saved=e.saved?'saved':'';
  const duration=e.duration||Math.max(18,Math.min(55,Math.round(localizedSummary(e).length/28)));
  const title=localizedTitle(e),summary=localizedSummary(e);
  const sourceCount=e.sourceCount||1;
  const sourceText=`${e.source||'Источник'}${sourceCount>1?` · ещё ${sourceCount-1}`:''}`;
  const bullets=[];
  if(e.why)bullets.push(e.why);
  if(e.articles?.length>1)bullets.push(`Событие подтверждают ${e.articles.length} сообщения`);
  return `<article class="card ${esc(extraClass)} card-enter-${S.cardDir>0?'next':'prev'}" data-id="${esc(e.id)}">
    ${safeImage(e)?`<img class="cardimg" src="${safeImage(e)}" alt="">`:`<div class="cardimg missing-image"><span>${esc(e.source||'Источник')}</span></div>`}
    <div class="cardtop"><span class="tag">${esc(topic(e))}</span><span class="time">${duration} сек</span></div>
    <div class="cardbody">
      <div class="sources">${esc(sourceText)} · ${esc(timeAgo(e.published))}</div>
      <h1>${esc(title)}</h1>
      <p>${esc(summary)}</p>
      ${bullets.length?`<ul class="bullets">${bullets.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
    </div>
    <div class="actions">
      <button type="button" class="action ${liked}" data-action="like" aria-label="Нравится"><svg viewBox="0 0 24 24" fill="${e.liked?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8"><path d="M20.8 8.7c0 5-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/></svg><span>${e.likes||0}</span></button>
      <button type="button" class="action ${saved}" data-action="save" aria-label="Сохранить"><svg viewBox="0 0 24 24" fill="${e.saved?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.7L6 21V4.8Z"/></svg><span>${e.saved?'Сохранено':'Сохранить'}</span></button>
      <button type="button" class="action" data-action="share" aria-label="Поделиться"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg><span>Поделиться</span></button>
      <button type="button" class="action" data-action="more" aria-label="Ещё"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>
    </div>
  </article>`;
}
function renderHome(){
  let list=filterNews().filter(isRussianEvent);
  if(S.feedIndex>=list.length)S.feedIndex=0;
  if(!list.length){
    $('#feed').innerHTML=`<div class="loading">Пока нет событий по выбранным интересам.<button type="button" class="btn retry" id="retryNews">Обновить</button></div>`;
    $('#retryNews')?.addEventListener('click',()=>loadNews(true));
    return;
  }
  const current=list[S.feedIndex];
  const next=list[S.feedIndex+1];
  $('#feed').innerHTML=`<div class="card-stack">${next?card(next,'stack-back'):''}${card(current,'current-card')}</div>`;
  prefetch(list);bindCards();bindImageErrors();
}
function moveCard(dir){
  const list=filterNews().filter(isRussianEvent);if(!list.length)return;
  const next=Math.max(0,Math.min(list.length-1,S.feedIndex+dir));
  if(next===S.feedIndex){const c=$('#feed .current-card');if(c){c.classList.remove('card-spring');void c.offsetWidth;c.classList.add('card-spring');c.style.transform='';c.style.opacity='1';}return;}
  S.cardDir=dir;S.feedIndex=next;renderHome();
}
function bindCards(){
  const c=$('#feed .current-card');if(!c)return;
  let startY=0,startX=0,lastY=0,tracking=false,moved=false,actionTouched=false,pid=null;
  const reset=()=>{c.classList.add('card-spring');c.style.transform='';c.style.opacity='1';setTimeout(()=>c.classList.remove('card-spring'),300)};
  c.addEventListener('pointerdown',e=>{
    if(e.button!==undefined&&e.button!==0)return;
    if(e.target.closest('[data-action]')){actionTouched=true;return;}
    pid=e.pointerId;startY=e.clientY;startX=e.clientX;lastY=e.clientY;tracking=true;moved=false;c.classList.add('dragging');c.setPointerCapture?.(pid);e.preventDefault();
  });
  c.addEventListener('pointermove',e=>{
    if(!tracking||e.pointerId!==pid)return;
    const dy=e.clientY-startY,dx=e.clientX-startX;
    if(Math.abs(dx)>Math.abs(dy)*1.15&&Math.abs(dx)>12){tracking=false;c.releasePointerCapture?.(pid);reset();return;}
    lastY=e.clientY;if(Math.abs(dy)>8)moved=true;
    const limited=Math.max(-Math.max(220,c.clientHeight*.55),Math.min(Math.max(220,c.clientHeight*.55),dy));
    const rot=limited/(Math.max(320,c.clientHeight))*3;
    const scale=1-Math.min(.045,Math.abs(limited)/9000);
    c.style.transform=`translate3d(0,${limited}px,0) rotate(${rot}deg) scale(${scale})`;
    c.style.opacity=String(1-Math.min(.28,Math.abs(limited)/700));
  });
  const finish=(e)=>{
    if(actionTouched){
      const action=e.target?.closest?.('[data-action]')?.dataset.action;
      if(action)handleAction(c.dataset.id,action,e);actionTouched=false;return;
    }
    if(!tracking)return;tracking=false;c.classList.remove('dragging');
    const dy=e.clientY-startY,threshold=Math.max(82,c.clientHeight*.16);
    c.releasePointerCapture?.(pid);
    if(Math.abs(dy)>=threshold&&Math.abs(dy)>Math.abs(e.clientX-startX)){
      const dir=dy<0?1:-1;
      if((dir>0&&S.feedIndex<filterNews().filter(isRussianEvent).length-1)||(dir<0&&S.feedIndex>0)){
        c.classList.add(dir>0?'swipe-out-up':'swipe-out-down');
        c.style.transform=`translate3d(0,${dir>0?-125:125}%,0) rotate(${dir>0?-4:4}deg)`;
        c.style.opacity='.05';
        setTimeout(()=>moveCard(dir),260);
      }else reset();
    }else reset();
    setTimeout(()=>{moved=false},80);
  };
  c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',e=>{tracking=false;c.classList.remove('dragging');reset()});
  let touchStartY=0,touchStartX=0,touchTracking=false;
  c.addEventListener('touchstart',e=>{if(e.target.closest('[data-action]'))return;const t=e.touches[0];touchStartY=t.clientY;touchStartX=t.clientX;touchTracking=true;c.classList.add('dragging');},{passive:true});
  c.addEventListener('touchmove',e=>{if(!touchTracking)return;const t=e.touches[0],dy=t.clientY-touchStartY,dx=t.clientX-touchStartX;if(Math.abs(dy)<Math.abs(dx)*1.15)return;e.preventDefault();const limited=Math.max(-Math.max(220,c.clientHeight*.55),Math.min(Math.max(220,c.clientHeight*.55),dy));const rot=limited/(Math.max(320,c.clientHeight))*3;c.style.transform=`translate3d(0,${limited}px,0) rotate(${rot}deg) scale(${1-Math.min(.045,Math.abs(limited)/9000)})`;c.style.opacity=String(1-Math.min(.28,Math.abs(limited)/700));},{passive:false});
  c.addEventListener('touchend',e=>{if(!touchTracking)return;touchTracking=false;c.classList.remove('dragging');const dy=e.changedTouches[0].clientY-touchStartY,dx=e.changedTouches[0].clientX-touchStartX,threshold=Math.max(82,c.clientHeight*.16);if(Math.abs(dy)>=threshold&&Math.abs(dy)>Math.abs(dx)){const dir=dy<0?1:-1;const list=filterNews().filter(isRussianEvent);if((dir>0&&S.feedIndex<list.length-1)||(dir<0&&S.feedIndex>0)){c.classList.add(dir>0?'swipe-out-up':'swipe-out-down');c.style.transform=`translate3d(0,${dir>0?-125:125}%,0) rotate(${dir>0?-4:4}deg)`;c.style.opacity='.05';setTimeout(()=>moveCard(dir),260);return;}}reset();},{passive:true});
  c.addEventListener('click',e=>{if(e.target.closest('[data-action]'))return;if(moved)return;openEvent(c.dataset.id)});
}

async function handleAction(id,action,ev){
  ev?.stopPropagation();
  const e=S.news.find(x=>x.id===id)||S.digest.find(x=>x.id===id);if(!e)return;
  if(action==='like'){
    try{const r=await api('/api/like/'+encodeURIComponent(id),{method:'POST'});e.liked=r.liked;e.likes=r.likes;renderHome()}catch{toast('Не удалось поставить реакцию')}
  }else if(action==='save'){
    try{const r=await api('/api/saved/'+encodeURIComponent(id),{method:'POST'});S.saved=new Set(r.saved||[]);e.saved=S.saved.has(id);toast(e.saved?'Сохранено':'Удалено из сохранённого');renderHome()}catch{toast('Не удалось сохранить')}
  }else if(action==='share'){
    try{
      const r=await api('/api/share/'+encodeURIComponent(id));
      const url=r.url;
      const tg=S.tg;
      if(tg?.openTelegramLink && url.startsWith('https://t.me/')) tg.openTelegramLink(url);
      else if(navigator.share) await navigator.share({title:localizedTitle(e),url});
      else if(navigator.clipboard){await navigator.clipboard.writeText(url);toast('Telegram-ссылка скопирована')}
      else toast('Ссылка готова для Telegram');
    }catch{toast('Не удалось создать ссылку на карточку')}
    api('/api/activity',{method:'POST',body:JSON.stringify({type:'shared',eventId:id})}).catch(()=>{});
  }else if(action==='more')openDetail(e,true);
}
async function loadNews(forceRefresh=false){
  $('#feed').innerHTML='<div class="loading">Загружаем свежие события…</div>';
  try{
    if(forceRefresh) await api('/api/refresh',{method:'POST'});
    const r=await api('/api/news?minutes='+S.minutes);
    S.news=r.items||[];S.profile=r.profile||S.profile;
    S.saved=new Set(S.news.filter(x=>x.saved).map(x=>x.id));
    renderHome();
  }catch(e){
    $('#feed').innerHTML=`<div class="loading">Не удалось загрузить события.<br><small>${e.status===401?'Открой PULSE из Telegram.':'Проверь соединение и попробуй ещё раз.'}</small><button type="button" class="btn retry" id="retryNews">Повторить</button></div>`;
    $('#retryNews')?.addEventListener('click',()=>loadNews(true));
  }
}
function openEvent(id){
  const e=[...S.news,...S.digest,...S.searchItems,...S.savedItems].find(x=>x.id===id);if(!e)return;
  api('/api/activity',{method:'POST',body:JSON.stringify({type:'opened',eventId:id})}).catch(()=>{});
  openDetail(e,false);
}

function openDetail(e){
  $('#detailBody').dataset.event=e.id;
  const image=imageUrl(imgFor(e));
  const sourceRows=(e.articles||[]).map(a=>`<div class="sourceitem"><div class="source-dot">${esc((a.source||'?').slice(0,1))}</div><div><b>${esc(a.source||'Источник')}</b><small>${esc(a.title||'Материал по событию')}</small></div><a href="${esc(a.link||'#')}" target="_blank" rel="noopener">Открыть ↗</a></div>`).join('');
  $('#detailBody').innerHTML=`${image?`<div class="detailhero" style="background-image:url('${esc(image)}')" data-direct="${esc(e.image||'')}"></div>`:''}
  <div class="detailcontent">
    <div class="sources"><span class="tag">${esc(topic(e))}</span><span>${esc(timeAgo(e.published))}</span><span>${e.sourceCount||1} ${e.sourceCount===1?'источник':'источника'}</span></div>
    <h1>${esc(localizedTitle(e))}</h1>
    <h3>Что произошло</h3><p>${esc(localizedSummary(e))}</p>
    <h3>Почему это важно</h3><p>${esc(e.why||'Здесь PULSE объясняет практический смысл события на основе доступных материалов источников.')}</p>
    <h3>Что известно из источников</h3>
    ${sourceRows||'<p>Источник доступен по оригинальной ссылке.</p>'}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px">
      <button type="button" class="btn ${e.saved?'primary':''}" id="detailSave">${e.saved?'Сохранено':'Сохранить'}</button>
      <button type="button" class="btn" id="detailCopy">Копировать ссылку</button>
    </div>
  </div>`;
  $('#detail').classList.add('open');
  $('#detailSave').onclick=()=>handleAction(e.id,'save');
  $('#detailCopy').onclick=async()=>{
    const r=await api('/api/share/'+encodeURIComponent(e.id)); const u=r.url;
    try{await navigator.clipboard.writeText(u);toast('Telegram-ссылка скопирована');api('/api/activity',{method:'POST',body:JSON.stringify({type:'copied',eventId:e.id})}).catch(()=>{})}
    catch{toast('Ссылка готова для Telegram')}
  };
}

async function loadSaved(){
  try{const r=await api('/api/saved');S.savedItems=r.items||[];S.saved=new Set(r.saved||[]);renderSaved()}
  catch{$('#savedList').innerHTML='<div class="empty">Не удалось загрузить сохранённое.</div>'}
}
function renderSaved(items=S.savedItems){
  $('#savedList').innerHTML=items.length?items.map(e=>`<article class="savedcard" data-id="${esc(e.id)}"><div class="thumb" style="background-image:url('${safeImage(e)}')"></div><div><small>${esc(topic(e))} · ${esc(timeAgo(e.published))}</small><h3>${esc(e.title)}</h3><small>${esc(e.source||'Источник')}</small></div></article>`).join(''):'<div class="empty">Здесь появятся сохранённые события.</div>';
  $$('#savedList .savedcard').forEach(x=>x.onclick=()=>openEvent(x.dataset.id));
}
function renderProfile(){
  const p=S.profile||{},ints=p.interests||[];
  $('#profileContent').innerHTML=`<div class="profilehead"><div class="avatar">${esc(initials(p))}</div><div><h2>${esc(p.name||'Твой PULSE')}</h2><p>Твой персональный дайджест</p></div></div>
  <div class="stats"><div class="stat"><b>${S.saved.size}</b><span>сохранено</span></div><div class="stat"><b>—</b><span>открыто</span></div><div class="stat"><b>—</b><span>поделился</span></div></div>
  <div class="panel"><div class="paneltitle">Мои интересы <button type="button" class="btn" style="float:right;min-height:27px;padding:0 8px;font-size:9px" id="editInterests">Изменить</button></div><div class="interests">${ints.map(x=>`<span class="interest on">${esc(x)}</span>`).join('')||'<span style="color:#858b9a;font-size:11px">Пока не выбраны</span>'}</div></div>
  <div class="panel"><div class="paneltitle">Профиль</div>
    <div class="field"><label>Имя</label><input id="pf-name" value="${esc(p.name||'')}" placeholder="Как к тебе обращаться"></div>
    <div class="field"><label>Страна</label><input id="pf-country" value="${esc(p.country||'')}" placeholder="Страна"></div>
    <div class="field"><label>Город</label><input id="pf-city" value="${esc(p.city||'')}" placeholder="Город"></div>
    <button type="button" class="btn primary full" id="saveProfile">Сохранить</button>
  </div>
  <div class="panel"><div class="paneltitle">Дайджест по умолчанию</div><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:12px">${p.defaultMinutes||5} минут</span><button type="button" class="btn" style="min-height:34px;font-size:10px" id="changeMinutes">Изменить</button></div></div>`;
  $('#saveProfile').onclick=saveProfile;
  $('#changeMinutes').onclick=()=>openDigestChoices();
  $('#editInterests').onclick=()=>startInterestEdit();
}
async function saveProfile(){
  const body={name:$('#pf-name').value.trim(),country:$('#pf-country').value.trim(),city:$('#pf-city').value.trim()};
  try{const r=await api('/api/profile',{method:'PUT',body:JSON.stringify(body)});S.profile=r.profile;await saveProfileSnapshot(S.profile);toast('Профиль сохранён');await loadNews();renderProfile()}
  catch{toast('Не удалось сохранить')}
}
function startInterestEdit(){
  S.ob.step=1;S.ob.interests=[...(S.profile?.interests||[])];renderOnboard(true);$('#onboard').classList.add('show');
}
function renderOnboard(profileMode=false){
  const step=S.ob.step,visual=$('#obvisual'),body=$('#obbody');
  visual.innerHTML=step===0?`<div class="obbrand"><div class="biglogo">PULSE</div><p>Весь интернет.<br>За несколько минут.</p></div><div class="earth"></div>`:`<div class="obbrand" style="margin-top:48px"><div class="biglogo">PULSE</div></div>`;
  if(step===0){
    body.innerHTML=`<div class="dots"><span class="dot on"></span><span class="dot"></span><span class="dot"></span></div><h1>Весь интернет.<br>За несколько минут.</h1><p>Короткие карточки.\nТолько то, что действительно важно.\nПерсонально под тебя.</p><div class="obfooter"><button type="button" class="btn primary" style="width:100%" id="obStart">Начать →</button></div>`;
  }else if(step===1){
    body.innerHTML=`<div class="dots"><span class="dot"></span><span class="dot on"></span><span class="dot"></span></div><h1>Что тебе интересно?</h1><p>Выбери несколько тем, чтобы лента была твоей.</p><div class="obgrid">${interests.map(x=>`<button type="button" class="obinterest ${S.ob.interests.includes(x)?'on':''}" data-interest="${esc(x)}" style="background-image:url('${esc(imgFallback[x])}')"><span>${esc(x)}</span><i class="check">✓</i></button>`).join('')}</div><div class="obfooter"><button type="button" class="btn" id="obBack">Назад</button><button type="button" class="btn primary" id="obNext">Продолжить (${S.ob.interests.length})</button></div>`;
  }else{
    body.innerHTML=`<div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot on"></span></div><h1>Сколько у тебя есть времени?</h1><p>Мы подготовим персональный дайджест ровно на это время.</p><div id="obChoices">${[1,3,5,10].map(n=>`<button type="button" class="choice ${S.minutes===n?'on':''}" data-min="${n}"><span><b>${n} ${n===1?'минута':'минут'}</b><small>${n===1?'2–4 карточки':n===3?'6–8 карточек':n===5?'10–12 карточек':'15–20 карточек'}</small></span><span class="mark">${S.minutes===n?'✓':''}</span></button>`).join('')}</div><div class="obfooter"><button type="button" class="btn" id="obBack">Назад</button><button type="button" class="btn primary" id="obFinish">${profileMode?'Сохранить':'Начать →'}</button></div>`;
  }
  $('#obStart')?.addEventListener('click',()=>{S.ob.step=1;renderOnboard(profileMode)});
  $('#obBack')?.addEventListener('click',()=>{S.ob.step=Math.max(0,S.ob.step-1);renderOnboard(profileMode)});
  $('#obNext')?.addEventListener('click',()=>{if(!S.ob.interests.length){toast('Выбери хотя бы одну тему');return}S.ob.step=2;renderOnboard(profileMode)});
  $$('#obChoices .choice').forEach(x=>x.onclick=()=>{S.minutes=Number(x.dataset.min);renderOnboard(profileMode)});
  $('#obFinish')?.addEventListener('click',()=>profileMode?saveOnboardEdits():finishOnboarding());
  $$('#obbody .obinterest').forEach(x=>x.onclick=()=>{const v=x.dataset.interest;S.ob.interests=S.ob.interests.includes(v)?S.ob.interests.filter(a=>a!==v):[...S.ob.interests,v];renderOnboard(profileMode)});
}
async function finishOnboarding(){
  if(!S.ob.interests.length){toast('Выбери хотя бы одну тему');S.ob.step=1;renderOnboard();return}
  try{
    const r=await api('/api/profile',{method:'PUT',body:JSON.stringify({interests:S.ob.interests,defaultMinutes:S.minutes,onboardingDone:true,profileVersion:3})});
    S.profile=r.profile;
    await saveProfileSnapshot(S.profile);
    await api('/api/session',{method:'POST',body:JSON.stringify({minutes:S.minutes})});
    $('#onboard').classList.remove('show');renderCats();await loadNews();show('home');toast('PULSE готов');
  }catch{toast('Не удалось сохранить профиль')}
}
async function saveOnboardEdits(){
  try{
    const r=await api('/api/profile',{method:'PUT',body:JSON.stringify({interests:S.ob.interests,defaultMinutes:S.minutes})});
    S.profile=r.profile;
    await saveProfileSnapshot(S.profile);
    await api('/api/session',{method:'POST',body:JSON.stringify({minutes:S.minutes})});
    $('#onboard').classList.remove('show');renderCats();renderProfile();await loadNews();toast('Изменения сохранены');
  }catch{toast('Не удалось сохранить изменения')}
}
function openDigestChoices(){
  S.ob.step=2;S.ob.interests=[...(S.profile?.interests||[])];renderOnboard(true);$('#onboard').classList.add('show');
}
async function renderDigest(){
  const mins=[1,3,5,10];
  $('#digestMinutes').innerHTML=mins.map(n=>`<button type="button" class="pill ${S.minutes===n?'active':''}" data-min="${n}">${n} мин</button>`).join('');
  $$('#digestMinutes .pill').forEach(x=>x.onclick=()=>{S.minutes=Number(x.dataset.min);renderDigest()});
  $('#digestTitle').textContent=`Твои ${S.minutes} ${S.minutes===1?'минута':'минут'}`;
  $('#timeline').innerHTML='<div class="empty">Собираю персональный дайджест…</div>';
  try{
    const r=await api('/api/digest?minutes='+S.minutes);
    S.digest=r.items||[];
    $('#timeline').innerHTML=S.digest.length?S.digest.map(e=>{
      const title=localizedTitle(e);
      const src=e.source||'Источник';
      return `<button type="button" class="timelineitem" data-id="${esc(e.id)}">
        <div class="timelineleft"><div class="timepoint">${safeImage(e)?`<img class="time-image" src="${safeImage(e)}" data-direct="${esc(e.image||'')}" alt="">`:`<span class="timefallback">${esc((src||'П').slice(0,1))}</span>`}</div></div>
        <div class="timelinecopy"><h3>${esc(topic(e))}</h3><p class="timeline-title">${esc(title)}</p><p class="timeline-meta">${esc(src)} · ${e.duration||25} сек</p></div>
      </button>`;
    }).join(''):'<div class="empty">Пока не удалось собрать дайджест.</div>';
    $$('#timeline .timelineitem').forEach(x=>x.onclick=()=>openEvent(x.dataset.id));bindImageErrors();
  }catch{$('#timeline').innerHTML='<div class="empty">Дайджест временно недоступен.</div>'}
}
function startDigest(){
  const first=S.digest[0];
  if(first){openEvent(first.id)}else{toast('Сначала выбери время и дождись загрузки дайджеста')}
}

let searchTimer=null;
$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch()});
$('#searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);const q=$('#searchInput').value.trim();if(q.length>=2)searchTimer=setTimeout(doSearch,500);});
async function doSearch(){
  const q=$('#searchInput').value.trim();if(!q)return;
  $('#searchResults').innerHTML='<div class="empty">Ищу новости по всему интернету…</div>';
  try{
    const r=await api('/api/search?q='+encodeURIComponent(q)),items=(r.items||[]).filter(isRussianEvent);S.searchItems=items;
    $('#searchResults').innerHTML=items.length?items.map(e=>`<article class="result" data-id="${esc(e.id)}">
      <div class="resultimg">${safeImage(e)?`<img src="${safeImage(e)}" alt="">`:`<div class="missing-image"><span>${esc(e.source||'Источник')}</span></div>`}</div>
      <div><small>${esc(topic(e))} · ${esc(timeAgo(e.published))} · ${e.sourceCount||1} ${e.sourceCount===1?'источник':'источника'}</small>
      <h3>${esc(localizedTitle(e))}</h3><p>${esc(localizedSummary(e))}</p><span class="result-open">Открыть новость →</span></div>
    </article>`).join(''):'<div class="empty">По этому запросу новостей не найдено.</div>';
    $$('#searchResults .result').forEach(x=>{x.onclick=()=>openEvent(x.dataset.id)});bindImageErrors();
  }catch{$('#searchResults').innerHTML='<div class="empty">Поиск временно недоступен.</div>'}
}

$('#detailBack').onclick=()=>$('#detail').classList.remove('open');
$('#detailMore').onclick=()=>{const id=$('#detailBody').dataset.event;const e=[...S.news,...S.digest].find(x=>x.id===id);if(e)hideEvent(e)};
function hideEvent(e){
  if(!confirm('Не показывать похожие материалы?'))return;
  api('/api/hide/'+encodeURIComponent(e.id),{method:'POST'}).then(()=>{$('#detail').classList.remove('open');S.news=S.news.filter(x=>x.id!==e.id);renderHome();toast('Понял. Буду показывать меньше такого')}).catch(()=>toast('Не удалось изменить подборку'));
}
$('#savedRefresh').onclick=loadSaved;
$('#startDigest').onclick=startDigest;

tgInit();

async function openSharedEventFromLink(){
  try{
    const t=S.tg;
    const start=t?.initDataUnsafe?.start_param||'';
    const fromUrl=new URLSearchParams(location.search).get('event')||'';
    const id=start.startsWith('event_')?start.slice(6):fromUrl;
    if(!id)return false;
    const r=await api('/api/event/'+encodeURIComponent(id));
    if(r.item){openDetail(r.item,false);return true;}
  }catch{}
  return false;
}
setInterval(()=>{if(document.visibilityState==='visible'&&S.screen==='home')loadNews(false).catch(()=>{})},60000);

renderCats();
nav();
renderOnboard();

(async()=>{
  try{
    const r=await api('/api/profile');
    S.profile=await restoreProfileSnapshot(r.profile);S.minutes=S.profile.defaultMinutes||5;
    if(S.profile.profileVersion===3&&S.profile.onboardingDone&&S.profile.interests?.length){
      await saveProfileSnapshot(S.profile);
      $('#onboard').classList.remove('show');
      renderCats();
      await loadNews();
      await openSharedEventFromLink();
    }else{
      S.profile={...S.profile,profileVersion:0,onboardingDone:false,interests:[]};
      S.ob.step=0;S.ob.interests=[];S.minutes=5;localStorage.removeItem(PROFILE_STORE_KEY);renderCats();renderOnboard();$('#onboard').classList.add('show');
    }
  }catch(e){
    if(e.status===401)toast('Открой PULSE через Telegram');
    else toast('Не удалось подключиться к PULSE');
  }
})();
})();

