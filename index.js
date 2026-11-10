const dl=document.createElement('datalist');dl.id='chars';
dl.innerHTML=CHARACTERS.map(c=>`<option value="${c}">`).join('');document.body.append(dl);
document.getElementById('startBtn').addEventListener('click',()=>{
  const a=document.getElementById('char1'),b=document.getElementById('char2');
  if(!a.value.trim()||!b.value.trim()){[a,b].forEach(i=>{i.classList.remove('shake');void i.offsetWidth;i.classList.add('shake')});return}
  location.href='Matchup.html?a='+encodeURIComponent(a.value.trim())+'&b='+encodeURIComponent(b.value.trim());
});
