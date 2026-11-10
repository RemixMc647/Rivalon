document.getElementById('loginform').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
  try{
    Auth.set(await Auth.api('/api/login',{email:document.getElementById('email').value.trim(),password:document.getElementById('password').value}));
    location.href='./index.html';
  }catch(err){alert(err.message)}finally{btn.disabled=false}
});
