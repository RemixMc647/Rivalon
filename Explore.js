const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(a,b)=>`Matchup.html?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
const duel=(a,b,i,w)=>`<a class="duel" style="animation-delay:${i*.08}s" href="${link(a,b)}"><b>${esc(a)}</b><span>VS</span><b>${esc(b)}</b>${w?`<small>👑 ${esc(w)}</small>`:''}</a>`;
document.getElementById('featured').innerHTML=FEATURED.map(([a,b],i)=>duel(a,b,i)).join('');
const h=JSON.parse(localStorage.getItem('rv_history')||'[]');
document.getElementById('recent').innerHTML=h.length?h.map((x,i)=>duel(x.a,x.b,i,x.w)).join(''):'<p>No matchups yet. Start one!</p>';
document.getElementById('random').onclick=()=>{const c=[...CHARACTERS].sort(()=>Math.random()-.5);location.href=link(c[0],c[1])};
