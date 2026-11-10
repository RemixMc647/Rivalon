if(!Auth.token())location.href='./Login.html';
const $=id=>document.getElementById(id),u=Auth.user()||{};
const KEY='rv_avatar_'+(u.username||'');
const saved=localStorage.getItem(KEY);if(saved)$('profilePicture').src=saved;
$('welcomeText').textContent='Email Address: '+(u.email||'');
$('UserName').textContent='Username: '+(u.username||'');
Auth.api('/api/me').then(d=>{$('MemberSince').textContent='Member since: '+new Date(d.createdAt).toLocaleDateString()}).catch(()=>{Auth.clear();location.href='./Login.html'});
function pick(){
  const f=$('profilePictureInput').files?.[0];if(!f)return;
  if(f.size>1.5e6)return alert('Please choose an image under 1.5 MB');
  const r=new FileReader();r.onload=()=>{$('profilePicture').src=r.result;try{localStorage.setItem(KEY,r.result)}catch{alert('Image too large to save')}};r.readAsDataURL(f);
}
$('profilePictureInput').addEventListener('change',pick);$('profileSaveBtn').addEventListener('click',pick);
$('logoutBtn').addEventListener('click',()=>Auth.clear());
