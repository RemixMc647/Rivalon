require('dotenv').config();
const express=require('express'),path=require('path'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
const {MongoClient,ObjectId}=require('mongodb');
const {MONGODB_URI,JWT_SECRET,GROQ_API_KEY}=process.env;
const MODEL=process.env.GROQ_MODEL||'groq/compound'; // built-in web search; check the name in your Groq console
const app=express();app.use(express.json({limit:'50kb'}));
app.use(express.static(path.join(__dirname,'public'))); // only /public is exposed, never server.js or .env

let db;
MongoClient.connect(MONGODB_URI).then(c=>{db=c.db('rivalon');
  db.collection('users').createIndex({email:1},{unique:true});db.collection('users').createIndex({username:1},{unique:true});
  console.log('MongoDB connected')}).catch(e=>console.error('MongoDB error:',e.message));

const sign=u=>jwt.sign({id:String(u._id)},JWT_SECRET,{expiresIn:'7d'});
const clean=s=>String(s||'').replace(/[^\p{L}\p{N} .'\-&]/gu,'').trim().slice(0,60);
const auth=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').slice(7),JWT_SECRET);next()}catch{res.status(401).json({message:'Please log in'})}};

app.post('/api/signup',async(req,res)=>{
  const username=String(req.body.username||'').trim().toLowerCase(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  if(!/^[a-z0-9_]{3,20}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return res.status(400).json({message:'Invalid signup details'});
  try{
    const r=await db.collection('users').insertOne({username,email,passwordHash:await bcrypt.hash(password,12),createdAt:new Date()});
    res.json({token:sign({_id:r.insertedId}),user:{username,email}});
  }catch(e){res.status(e.code===11000?409:500).json({message:e.code===11000?'An account with that username or email already exists':'Signup failed'})}
});
app.post('/api/login',async(req,res)=>{
  const u=await db.collection('users').findOne({email:String(req.body.email||'').trim().toLowerCase()});
  if(!u||!await bcrypt.compare(String(req.body.password||''),u.passwordHash))return res.status(401).json({message:'Wrong email or password'});
  res.json({token:sign(u),user:{username:u.username,email:u.email}});
});
app.get('/api/me',auth,async(req,res)=>{
  const u=await db.collection('users').findOne({_id:new ObjectId(req.user.id)});
  u?res.json({username:u.username,email:u.email,createdAt:u.createdAt}):res.status(404).json({message:'Not found'});
});

const hits=new Map();
const limited=ip=>{const n=Date.now(),a=(hits.get(ip)||[]).filter(t=>n-t<6e5);a.push(n);hits.set(ip,a);return a.length>10};

app.post('/api/matchup',async(req,res)=>{
  const a=clean(req.body.a),b=clean(req.body.b);
  if(!a||!b||a.toLowerCase()===b.toLowerCase())return res.status(400).json({message:'Pick two different characters'});
  if(limited(req.ip))return res.status(429).json({message:'Too many matchups. Try again in a few minutes.'});
  const key=a.toLowerCase()+'|'+b.toLowerCase();
  try{
    const hit=await db.collection('matchups').findOne({key});
    if(hit)return res.json(hit.result);
    const prompt=`Use web search to research "${a}" and "${b}": powers, abilities, gear, feats and weaknesses. Then judge a fair fight at their canon peak. Reply with ONLY valid JSON, no markdown:
{"a":{"name":""},"b":{"name":""},"stats":{"a":{"strength":0,"speed":0,"durability":0,"intelligence":0,"flight":0,"endurance":0},"b":{"strength":0,"speed":0,"durability":0,"intelligence":0,"flight":0,"endurance":0}},"winner":"a|b|draw","summary":"2 sentences","reasons":["4 specific reasons the winner won"],"scenarios":[{"title":"","winner":"a|b","detail":""},{"title":"","winner":"a|b","detail":""},{"title":"","winner":"a|b","detail":""}],"weaknesses":{"a":"","b":""}}
Stats are 0-100. Character "a" is ${a}, character "b" is ${b}.`;
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+GROQ_API_KEY},body:JSON.stringify({model:MODEL,messages:[{role:'user',content:prompt}]})});
    if(!r.ok)throw new Error('Groq '+r.status);
    const text=(await r.json()).choices?.[0]?.message?.content||'';
    const result=JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    if(!['a','b','draw'].includes(result.winner))result.winner='draw';
    db.collection('matchups').insertOne({key,result,createdAt:new Date()}).catch(()=>{});
    res.json(result);
  }catch(e){console.error('matchup error:',e.message);res.status(502).json({message:'Could not analyze this matchup right now. Please try again.'})}
});

app.listen(process.env.PORT||3000,()=>console.log('Rivalon running on http://localhost:'+(process.env.PORT||3000)));
