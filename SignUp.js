document.getElementById('signupform').addEventListener('submit',async e=>{
  e.preventDefault();
  const username=document.getElementById('username').value.trim(),email=document.getElementById('email').value.trim(),
        password=document.getElementById('password').value,confirm=document.getElementById('confirmPassword').value;
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))return alert('Username: 3-20 letters, numbers or _');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return alert('Please enter a valid email address');
  if(password.length<8)return alert('Password must be at least 8 characters');
  if(password!==confirm)return alert('Passwords do not match');
  const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
  try{Auth.set(await Auth.api('/api/signup',{username,email,password}));alert('Account created!');location.href='./index.html'}
  catch(err){alert(err.message)}finally{btn.disabled=false}
});
