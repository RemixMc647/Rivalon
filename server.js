require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const { MONGODB_URI, JWT_SECRET, GROQ_API_KEY } = process.env;
const MODEL = (!process.env.GROQ_MODEL || process.env.GROQ_MODEL === 'groq/compound' || process.env.GROQ_MODEL === 'groq/compound-mini')
  ? 'openai/gpt-oss-120b'
  : process.env.GROQ_MODEL; // fallback avoids retired Compound model IDs

const app = express();
app.use(express.json({ limit: '50kb' }));


/* ------------------------------------------------------------------
   STATIC FILES (served from the root directory)
   The block list below keeps your server code and config private.
------------------------------------------------------------------ */

const BLOCKED_FILES = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/render.yaml'
];

app.use((req, res, next) => {
  let p;

  try {
    p = decodeURIComponent(req.path).toLowerCase();
  } catch {
    return res.status(400).send('Bad request');
  }

  if (
    BLOCKED_FILES.includes(p) ||
    p.startsWith('/node_modules') ||
    p.startsWith('/.') ||
    p.includes('/.')
  ) {
    return res.status(404).send('Not found');
  }

  next();
});

app.use(express.static(__dirname, { dotfiles: 'ignore' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


/* ------------------------------------------------------------------
   DATABASE
------------------------------------------------------------------ */

let db;

MongoClient.connect(MONGODB_URI)
  .then(c => {
    db = c.db('rivalon');

    db.collection('users').createIndex({ email: 1 }, { unique: true });
    db.collection('users').createIndex({ username: 1 }, { unique: true });

    console.log('MongoDB connected');
  })
  .catch(e => console.error('MongoDB error:', e.message));


/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */

const sign = u => jwt.sign({ id: String(u._id) }, JWT_SECRET, { expiresIn: '7d' });

const clean = s =>
  String(s || '')
    .replace(/[^\p{L}\p{N} .'\-&]/gu, '')
    .trim()
    .slice(0, 60);

const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Please log in' });
  }
};


/* ------------------------------------------------------------------
   AUTH ROUTES
------------------------------------------------------------------ */

app.post('/api/signup', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (
    !/^[a-z0-9_]{3,20}$/.test(username) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 8
  ) {
    return res.status(400).json({ message: 'Invalid signup details' });
  }

  try {
    const r = await db.collection('users').insertOne({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date()
    });

    res.json({
      token: sign({ _id: r.insertedId }),
      user: { username, email }
    });
  } catch (e) {
    res.status(e.code === 11000 ? 409 : 500).json({
      message: e.code === 11000
        ? 'An account with that username or email already exists'
        : 'Signup failed'
    });
  }
});

app.post('/api/login', async (req, res) => {
  const u = await db.collection('users').findOne({
    email: String(req.body.email || '').trim().toLowerCase()
  });

  if (!u || !await bcrypt.compare(String(req.body.password || ''), u.passwordHash)) {
    return res.status(401).json({ message: 'Wrong email or password' });
  }

  res.json({
    token: sign(u),
    user: { username: u.username, email: u.email }
  });
});

app.get('/api/me', auth, async (req, res) => {
  const u = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });

  u
    ? res.json({ username: u.username, email: u.email, createdAt: u.createdAt })
    : res.status(404).json({ message: 'Not found' });
});


/* ------------------------------------------------------------------
   CHARACTER ARTWORK
   Uses Wikipedia's public page-image API so the browser can display
   a real image for each character without exposing API credentials.
------------------------------------------------------------------ */

const imageCache = new Map();

app.get('/api/character-image', async (req, res) => {
  const name = clean(req.query.name);
  if (!name) return res.status(400).json({ message: 'Enter a character name' });

  const cacheKey = name.toLowerCase();
  if (imageCache.has(cacheKey)) return res.json(imageCache.get(cacheKey));

  try {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: name,
      gsrlimit: '5',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '700',
      format: 'json',
      origin: '*'
    }).toString();

    const response = await fetch(url, {
      headers: { 'User-Agent': 'RivalonMatchup/1.0 (character image lookup)' },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error('Image lookup unavailable');

    const data = await response.json();
    const pages = Object.values(data.query?.pages || {});
    const best = pages.find(page => page.thumbnail?.source) || null;
    const result = best
      ? { image: best.thumbnail.source, title: best.title }
      : { image: null, title: name };

    imageCache.set(cacheKey, result);
    if (imageCache.size > 300) imageCache.delete(imageCache.keys().next().value);
    res.set('Cache-Control', 'public, max-age=86400').json(result);
  } catch (error) {
    console.error('Character image lookup:', error.message);
    res.json({ image: null, title: name });
  }
});


/* ------------------------------------------------------------------
   RATE LIMIT (10 matchups per 10 minutes per IP)
------------------------------------------------------------------ */

const hits = new Map();

const limited = ip => {
  const n = Date.now();
  const a = (hits.get(ip) || []).filter(t => n - t < 6e5);

  a.push(n);
  hits.set(ip, a);

  return a.length > 10;
};


/* ------------------------------------------------------------------
   MATCHUP ROUTE
------------------------------------------------------------------ */

app.post('/api/matchup', async (req, res) => {
  const a = clean(req.body.a);
  const b = clean(req.body.b);

  if (!a || !b || a.toLowerCase() === b.toLowerCase()) {
    return res.status(400).json({ message: 'Pick two different characters' });
  }

  if (limited(req.ip)) {
    return res.status(429).json({ message: 'Too many matchups. Try again in a few minutes.' });
  }

  const key = a.toLowerCase() + '|' + b.toLowerCase();

  try {
    const hit = await db.collection('matchups').findOne({ key });

    if (hit) return res.json(hit.result);

    const prompt = `Research "${a}" and "${b}" using web search. Compare their established powers, abilities, equipment, notable feats and weaknesses, then judge a fair fictional matchup using their strongest well-established versions. Reply with ONLY valid JSON, no markdown:
{"a":{"name":""},"b":{"name":""},"stats":{"a":{"strength":0,"speed":0,"durability":0,"intelligence":0,"flight":0,"endurance":0},"b":{"strength":0,"speed":0,"durability":0,"intelligence":0,"flight":0,"endurance":0}},"winner":"a|b|draw","summary":"2 sentences","reasons":["4 specific reasons the winner won"],"scenarios":[{"title":"","winner":"a|b","detail":""},{"title":"","winner":"a|b","detail":""},{"title":"","winner":"a|b","detail":""}],"weaknesses":{"a":"","b":""}}
Stats are 0-100. Character "a" is ${a}, character "b" is ${b}.`;

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are Rivalon Matchup Analyst. Be fair, specific, and factual. Return one valid JSON object only, matching the requested structure. Keep every stat between 0 and 100.' },
          { role: 'user', content: prompt }
        ],
        tools: [{ type: 'browser_search' }],
        tool_choice: 'auto',
        temperature: 0.2,
        max_completion_tokens: 3000
      })
    });

    if (!r.ok) throw new Error('Groq ' + r.status);

    const payload = await r.json();
    const text = payload.choices?.[0]?.message?.content || '';
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) throw new Error('The matchup model returned no JSON result');
    const result = JSON.parse(jsonText);

    if (!result.a || !result.b || !result.stats) {
      throw new Error('The matchup model returned an incomplete result');
    }
    result.summary = String(result.summary || 'The matchup has been analyzed.');
    result.reasons = Array.isArray(result.reasons) ? result.reasons : [];
    result.scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
    result.stats.a = result.stats.a || {};
    result.stats.b = result.stats.b || {};
    for (const side of ['a', 'b']) {
      for (const stat of ['strength', 'speed', 'durability', 'intelligence', 'flight', 'endurance']) {
        result.stats[side][stat] = Math.max(0, Math.min(100, Number(result.stats[side][stat]) || 0));
      }
    }
    result.weaknesses = result.weaknesses || {};

    if (!['a', 'b', 'draw'].includes(result.winner)) result.winner = 'draw';

    db.collection('matchups')
      .insertOne({ key, result, createdAt: new Date() })
      .catch(() => {});

    res.json(result);
  } catch (e) {
    console.error('matchup error:', e.message);

    res.status(502).json({
      message: 'Could not analyze this matchup right now. Please try again.'
    });
  }
});


/* ------------------------------------------------------------------
   START
------------------------------------------------------------------ */

app.listen(process.env.PORT || 3000, () =>
  console.log('Rivalon running on http://localhost:' + (process.env.PORT || 3000))
);
