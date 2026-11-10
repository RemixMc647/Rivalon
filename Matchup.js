const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATS=['strength','speed','durability','intelligence','flight','endurance'];
const MSGS=['Searching for character artwork…','Searching for powers and feats…','Reading up on weaknesses…','Simulating the fight…','Judging the winner…'];
const dl=document.createElement('datalist');dl.id='chars';dl.innerHTML=CHARACTERS.map(c=>`<option value="${esc(c)}">`).join('');document.body.append(dl);
let busy=false;

// Keep recently found artwork in this browser so repeat matchups appear faster.
const IMAGE_CACHE_KEY='rivalon_character_images_v1';
let imageCache={};
try{imageCache=JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY)||'{}')}catch(e){imageCache={}}

function placeholder(name,message='Finding character artwork…'){
  const box=document.createElement('div');
  box.className='orb';
  box.textContent=(name[0]||'?').toUpperCase();
  box.setAttribute('aria-label',message);
  return box;
}

function renderFighter(el,name,image,message='No matching character image was found'){
  el.replaceChildren();
  if(image&&image.imageUrl){
    const img=document.createElement('img');
    img.src=image.imageUrl;
    img.alt=name;
    img.loading='eager';
    img.referrerPolicy='no-referrer';
    img.decoding='async';
    img.style.cssText='display:block;width:100%;height:230px;max-width:100%;object-fit:contain;object-position:center;background:rgba(5,7,18,.35);border-radius:14px;margin:0 auto 12px';
    img.onerror=()=>{img.remove();el.prepend(placeholder(name,'Character image unavailable'))};
    el.appendChild(img);
  }else{
    el.appendChild(placeholder(name,message));
    const hint=document.createElement('small');
    hint.textContent=message;
    hint.style.cssText='display:block;margin:0 auto 12px;font-size:11px;color:#b6b8c4;font-weight:400';
    el.appendChild(hint);
  }
  const label=document.createElement('div');
  label.textContent=name;
  label.style.cssText='font-size:20px;font-weight:700;line-height:1.25;overflow-wrap:anywhere';
  el.appendChild(label);
  if(image&&image.source){
    const source=document.createElement('small');
    source.textContent='Image: '+image.source;
    source.style.cssText='display:block;margin-top:6px;font-size:11px;color:#b6b8c4;font-weight:400';
    el.appendChild(source);
  }
}

async function loadCharacterImage(name){
  const key=name.toLowerCase().trim();
  const saved=imageCache[key];
  if(saved&&saved.imageUrl&&Date.now()-saved.savedAt<30*24*60*60*1000)return saved;
  try{
    const r=await fetch('/api/character-image?name='+encodeURIComponent(name),{headers:{Accept:'application/json'}});
    if(!r.ok)return null;
    const data=await r.json();
    if(!data.imageUrl)return null;
    imageCache[key]={...data,savedAt:Date.now()};
    try{localStorage.setItem(IMAGE_CACHE_KEY,JSON.stringify(imageCache))}catch(e){}
    return data;
  }catch(e){console.warn('Character image lookup failed for '+name,e);return null}
}

async function start(){
  if(busy)return;
  const a=$('char1').value.trim(),b=$('char2').value.trim(),err=$('error');err.textContent='';
  if(!a||!b)return err.textContent='Enter both characters first.';
  if(a.toLowerCase()===b.toLowerCase())return err.textContent='Pick two different characters.';
  busy=true;$('startBtn').disabled=true;$('result').hidden=true;
  const arena=$('arena');arena.hidden=false;arena.classList.remove('done');
  $('fa').className='fighter left';$('fb').className='fighter right';
  renderFighter($('fa'),a,null,'Searching for character image…');renderFighter($('fb'),b,null,'Searching for character image…');
  void arena.offsetWidth;
  let i=0;$('status').textContent=MSGS[0];
  const t=setInterval(()=>$('status').textContent=MSGS[++i%MSGS.length],1800);
  history.replaceState(null,'','?a='+encodeURIComponent(a)+'&b='+encodeURIComponent(b));
  try{
    const imageA=loadCharacterImage(a).then(image=>{renderFighter($('fa'),a,image);return image});
    const imageB=loadCharacterImage(b).then(image=>{renderFighter($('fb'),b,image);return image});
    const imagesReady=Promise.all([imageA,imageB]);
    const [d]=await Promise.all([Auth.api('/api/matchup',{a,b}),Promise.race([imagesReady,sleep(10000)])]);
    show(d,a,b);
  }
  catch(e){arena.hidden=true;err.textContent=e.message||'Could not complete this matchup. Please try again.'}
  finally{clearInterval(t);busy=false;$('startBtn').disabled=false}
}

function show(d,a0,b0){
  const A=d.a?.name||a0,B=d.b?.name||b0,w=d.winner==='a'?A:d.winner==='b'?B:null;
  $('arena').classList.add('done');$('status').textContent='';
  if(w){$('fa').classList.toggle('win',d.winner==='a');$('fb').classList.toggle('win',d.winner==='b');$('fa').classList.toggle('lose',d.winner==='b');$('fb').classList.toggle('lose',d.winner==='a')}
  const sa=d.stats?.a||{},sb=d.stats?.b||{},nm=x=>x==='a'?A:x==='b'?B:'Nobody';
  const rows=STATS.map(k=>`<div class="stat"><div class="track l"><i data-w="${+sa[k]||0}"></i></div><span>${k}</span><div class="track"><i data-w="${+sb[k]||0}"></i></div></div>`).join('');
  $('result').innerHTML=`<div class="banner">${w?'👑 '+esc(w)+' wins':'🤝 It’s a draw'}</div>
  <p class="summary">${esc(d.summary||'The matchup has been analysed.')}</p><div class="stats">${rows}</div>
  <h3>${w?'Why '+esc(w)+' won':'Why it ended in a draw'}</h3>
  <ol class="reasons">${(d.reasons||[]).map((r,i)=>`<li style="animation-delay:${i*.35+.6}s">${esc(r)}</li>`).join('')}</ol>
  <h3>Other ways it could go</h3>
  <div class="scen">${(d.scenarios||[]).map(s=>`<div class="sc"><b>${esc(s.title)}</b><em>${esc(nm(s.winner))} wins</em><p>${esc(s.detail)}</p></div>`).join('')}</div>
  ${d.weaknesses?`<h3>Weaknesses</h3><p><b>${esc(A)}:</b> ${esc(d.weaknesses.a||'Not specified')}<br><b>${esc(B)}:</b> ${esc(d.weaknesses.b||'Not specified')}</p>`:''}
  <div class="actions"><button id="swap">🔁 Swap sides</button><button id="share">🔗 Copy share link</button></div>`;
  $('result').hidden=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll('#result i').forEach(i=>i.style.width=i.dataset.w+'%')));
  $('swap').onclick=()=>{[$('char1').value,$('char2').value]=[$('char2').value,$('char1').value];start()};
  $('share').onclick=async e=>{try{await navigator.clipboard.writeText(location.href);e.target.textContent='✅ Copied!'}catch{e.target.textContent='Copy the address bar'}};
  let h=[];try{h=JSON.parse(localStorage.getItem('rv_history')||'[]')}catch(e){}
  h=h.filter(x=>!(x.a===A&&x.b===B));h.unshift({a:A,b:B,w});
  try{localStorage.setItem('rv_history',JSON.stringify(h.slice(0,8)))}catch(e){}
  $('result').scrollIntoView({behavior:'smooth',block:'start'});
}

$('startBtn').onclick=start;
[$('char1'),$('char2')].forEach(i=>i.addEventListener('keydown',e=>e.key==='Enter'&&start()));
const q=new URLSearchParams(location.search);
if(q.get('a')&&q.get('b')){$('char1').value=q.get('a');$('char2').value=q.get('b');start()}
