const Auth={
  token:()=>localStorage.getItem('rv_token'),
  user:()=>JSON.parse(localStorage.getItem('rv_user')||'null'),
  set(d){localStorage.setItem('rv_token',d.token);localStorage.setItem('rv_user',JSON.stringify(d.user))},
  clear(){localStorage.removeItem('rv_token');localStorage.removeItem('rv_user')},
  async api(path,body){
    const r=await fetch(location.origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(Auth.token()?{Authorization:'Bearer '+Auth.token()}:{})},body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.message||'Something went wrong');
    return d;
  }
};
