const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATS=['strength','speed','durability','intelligence','flight','endurance'];
const MSGS=['Searching the web for powers and feats…','Reading up on weaknesses…','Simulating the fight…','Judging the winner…'];
const dl=document.createElement('datalist');dl.id='chars';dl.innerHTML=CHARACTERS.map(c=>`<option value="${c}">`).join('');document.body.append(dl);
const card=n=>`<div class="orb">${esc((n[0]||'?').toUpperCase())}</div>${esc(n)}`;
let busy=false;

async function start(){
  if(busy)return;
  const a=$('char1').value.trim(),b=$('char2').value.trim(),err=$('error');err.textContent='';
  if(!a||!b)return err.textContent='Enter both characters first.';
  if(a.toLowerCase()===b.toLowerCase())return err.textContent='Pick two different characters.';
  busy=true;$('startBtn').disabled=true;$('result').hidden=true;
  const arena=$('arena');arena.hidden=false;arena.classList.remove('done');
  $('fa').className='fighter left';$('fb').className='fighter right';void arena.offsetWidth;
  $('fa').innerHTML=card(a);$('fb').innerHTML=card(b);
  let i=0;$('status').textContent=MSGS[0];
  const t=setInterval(()=>$('status').textContent=MSGS[++i%MSGS.length],1800);
  history.replaceState(null,'','?a='+encodeURIComponent(a)+'&b='+encodeURIComponent(b));
  try{const [d]=await Promise.all([Auth.api('/api/matchup',{a,b}),sleep(3000)]);show(d,a,b)}
  catch(e){arena.hidden=true;err.textContent=e.message}
  finally{clearInterval(t);busy=false;$('startBtn').disabled=false}
}

function show(d,a0,b0){
  const A=d.a?.name||a0,B=d.b?.name||b0,w=d.winner==='a'?A:d.winner==='b'?B:null;
  $('arena').classList.add('done');$('status').textContent='';
  if(w){$(d.winner==='a'?'fa':'fb').classList.add('win');$(d.winner==='a'?'fb':'fa').classList.add('lose')}
  const sa=d.stats?.a||{},sb=d.stats?.b||{},nm=x=>x==='a'?A:x==='b'?B:'Nobody';
  const rows=STATS.map(k=>`<div class="stat"><div class="track l"><i data-w="${+sa[k]||0}"></i></div><span>${k}</span><div class="track"><i data-w="${+sb[k]||0}"></i></div></div>`).join('');
  $('result').innerHTML=`<div class="banner">${w?'👑 '+esc(w)+' wins':'🤝 It’s a draw'}</div>
  <p class="summary">${esc(d.summary)}</p><div class="stats">${rows}</div>
  <h3>${w?'Why '+esc(w)+' won':'Why it ended in a draw'}</h3>
  <ol class="reasons">${(d.reasons||[]).map((r,i)=>`<li style="animation-delay:${i*.35+.6}s">${esc(r)}</li>`).join('')}</ol>
  <h3>Other ways it could go</h3>
  <div class="scen">${(d.scenarios||[]).map(s=>`<div class="sc"><b>${esc(s.title)}</b><em>${esc(nm(s.winner))} wins</em><p>${esc(s.detail)}</p></div>`).join('')}</div>
  ${d.weaknesses?`<h3>Weaknesses</h3><p><b>${esc(A)}:</b> ${esc(d.weaknesses.a)}<br><b>${esc(B)}:</b> ${esc(d.weaknesses.b)}</p>`:''}
  <div class="actions"><button id="swap">🔁 Swap sides</button><button id="share">🔗 Copy share link</button></div>`;
  $('result').hidden=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll('#result i').forEach(i=>i.style.width=i.dataset.w+'%')));
  $('swap').onclick=()=>{[$('char1').value,$('char2').value]=[$('char2').value,$('char1').value];start()};
  $('share').onclick=async e=>{try{await navigator.clipboard.writeText(location.href);e.target.textContent='✅ Copied!'}catch{e.target.textContent='Copy the address bar'}};
  const h=JSON.parse(localStorage.getItem('rv_history')||'[]').filter(x=>!(x.a===A&&x.b===B));
  h.unshift({a:A,b:B,w});localStorage.setItem('rv_history',JSON.stringify(h.slice(0,8)));
  $('result').scrollIntoView({behavior:'smooth',block:'start'});
}

$('startBtn').onclick=start;
[$('char1'),$('char2')].forEach(i=>i.addEventListener('keydown',e=>e.key==='Enter'&&start()));
const q=new URLSearchParams(location.search);
if(q.get('a')&&q.get('b')){$('char1').value=q.get('a');$('char2').value=q.get('b');start()}
