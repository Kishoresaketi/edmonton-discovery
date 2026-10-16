'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const ROOT = __dirname;
function loadDotEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
loadDotEnv();
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4173);
const COOKIE = 'edmonton_session';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;
const VERIFY_TTL = 1000 * 60 * 60 * 24;
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const sessions = new Map();
const oauthStates = new Map();
const attempts = new Map();
let jwksCache = { expires: 0, keys: [] };
let store = { users: [] };
let writeQueue = Promise.resolve();

async function loadStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try { store = JSON.parse(await fsp.readFile(STORE_FILE, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; store = { users: [] }; }
  if (!store || !Array.isArray(store.users)) store = { users: [] };
  let migrated = false;
  for (const user of store.users) {
    user.savedPlaces ||= []; user.savedEvents ||= [];
    // Preserve sign-in for existing accounts, but do not claim their email was verified.
    if (user.emailVerified === undefined) { user.emailVerified = false; user.emailVerificationLegacy = true; migrated = true; }
  }
  if (migrated || !fs.existsSync(STORE_FILE)) await persist();
}
function persist() {
  writeQueue = writeQueue.then(async () => {
    const temp = STORE_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fsp.rename(temp, STORE_FILE);
  });
  return writeQueue;
}
function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, emailVerified: !!user.emailVerified, needsVerification: !user.emailVerified, legacyAccount: !!user.emailVerificationLegacy, plan: 'Edmonton Member', planStatus: 'free', savedPlaces: user.savedPlaces || [], savedEvents: user.savedEvents || [] };
}
function cookies(req) {
  const result = {};
  for (const entry of (req.headers.cookie || '').split(';')) {
    const i = entry.indexOf('='); if (i < 0) continue;
    try { result[entry.slice(0, i).trim()] = decodeURIComponent(entry.slice(i + 1).trim()); } catch {}
  }
  return result;
}
function setSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_TTL });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${secure}`);
}
function clearSession(req, res) {
  const token = cookies(req)[COOKIE]; if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function currentUser(req) {
  const token = cookies(req)[COOKIE], session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
  return store.users.find(u => u.id === session.userId) || null;
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function errorPage(res, status, message) {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Edmonton Discovery</title><style>body{font:16px system-ui;background:#f4f8f2;color:#17352e;display:grid;place-items:center;min-height:90vh;margin:0}.card{max-width:500px;background:white;padding:32px;border-radius:20px;box-shadow:0 15px 50px #17352e22}a{color:#087f68}</style><main class="card"><h1>Edmonton Discovery</h1><p>${message}</p><a href="/">Return to the app</a></main></html>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); res.end(html);
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) throw Object.assign(new Error('Request too large.'), { status: 413 }); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}
function rateLimited(req, key, limit = 12) {
  const id = `${key}:${req.socket.remoteAddress || 'unknown'}`, now = Date.now();
  const recent = (attempts.get(id) || []).filter(t => now - t < 15 * 60_000); recent.push(now); attempts.set(id, recent);
  return recent.length > limit;
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function appBase() { return (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, ''); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
async function sendVerificationEmail(user, rawToken) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const link = `${appBase()}/verify?token=${encodeURIComponent(rawToken)}`;
  const html = `<p>Hi ${escapeHtml(user.name)},</p><p>Confirm your email to finish creating your Edmonton Discovery account.</p><p><a href="${link}">Verify my email</a></p><p>This link expires in 24 hours. If you did not create this account, ignore this email.</p>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [user.email], subject: 'Verify your Edmonton Discovery account', html, text: `Hi ${user.name}, verify your email: ${link}\n\nThis link expires in 24 hours.` })
    });
    if (!response.ok) { console.error('Email provider rejected verification email:', response.status); return false; }
    return true;
  } catch (e) { console.error('Email provider could not be reached.'); return false; }
}
function makeVerification(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  user.verificationTokenHash = tokenHash(token); user.verificationExpiresAt = Date.now() + VERIFY_TTL;
  return token;
}
async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = await scrypt(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return { salt: salt.toString('hex'), hash: derived.toString('hex'), params: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P } };
}
async function verifyPassword(user, password) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const params = user.passwordParams || { N: 1 << 14, r: 8, p: 1 };
  const actual = await scrypt(password, Buffer.from(user.passwordSalt, 'hex'), 64, { ...params, maxmem: Math.max(SCRYPT_MAXMEM, 128 * params.N * params.r + 1024 * 1024) });
  return crypto.timingSafeEqual(actual, Buffer.from(user.passwordHash, 'hex'));
}
function googleReady() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
async function googleKeys() {
  if (jwksCache.expires > Date.now()) return jwksCache.keys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) throw new Error('Google signing keys unavailable.');
  const data = await response.json(); jwksCache = { keys: data.keys || [], expires: Date.now() + 60 * 60_000 }; return jwksCache.keys;
}
async function verifyGoogleIdToken(idToken, expectedNonce) {
  const parts = String(idToken || '').split('.'); if (parts.length !== 3) throw new Error('Invalid Google identity token.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported Google token signature.');
  const jwk = (await googleKeys()).find(key => key.kid === header.kid);
  if (!jwk) { jwksCache.expires = 0; const refreshed = await googleKeys(); }
  const keyJwk = jwk || (await googleKeys()).find(key => key.kid === header.kid);
  if (!keyJwk) throw new Error('Could not validate Google token.');
  const publicKey = crypto.createPublicKey({ key: keyJwk, format: 'jwk' });
  const validSig = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'));
  const issuerOkay = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
  const audienceOkay = claims.aud === process.env.GOOGLE_CLIENT_ID || (Array.isArray(claims.aud) && claims.aud.includes(process.env.GOOGLE_CLIENT_ID));
  const issuedAtOkay = Number.isFinite(claims.iat) && claims.iat <= Date.now() / 1000 + 60 && claims.iat >= Date.now() / 1000 - 600;
  const authorizedPartyOkay = !Array.isArray(claims.aud) || claims.aud.length === 1 || claims.azp === process.env.GOOGLE_CLIENT_ID;
  if (!validSig || !issuerOkay || !audienceOkay || !authorizedPartyOkay || !issuedAtOkay || claims.exp <= Date.now() / 1000 || claims.nonce !== expectedNonce || claims.email_verified !== true || !claims.sub || !claims.email) throw new Error('Google sign-in could not be verified.');
  return claims;
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
async function routeApi(req, res, url) {
  if (!checkOrigin(req)) return json(res, 403, { error: 'Request origin was not accepted.' });
  if (req.method === 'GET' && url.pathname === '/api/auth-options') return json(res, 200, { google: googleReady(), emailVerification: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
  if (req.method === 'GET' && url.pathname === '/api/session') { const u = currentUser(req); return json(res, 200, { user: u ? safeUser(u) : null }); }
  if (req.method === 'POST' && url.pathname === '/api/signup') {
    if (rateLimited(req, 'signup')) return json(res, 429, { error: 'Too many attempts. Please wait and try again.' });
    const input = await body(req), name = String(input.name || '').trim().slice(0, 80), email = String(input.email || '').trim().toLowerCase(), password = String(input.password || '');
    if (name.length < 2) return json(res, 400, { error: 'Please enter your name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'Enter a valid email address.' });
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 128) return json(res, 400, { error: 'Use a password of at least 12 characters and no more than 128 bytes.' });
    if (store.users.some(u => u.email === email)) return json(res, 409, { error: 'An account with that email already exists. Try logging in or resending verification.' });
    const passwordRecord = await hashPassword(password);
    const user = { id: crypto.randomUUID(), name, email, ...{ passwordSalt:passwordRecord.salt, passwordHash:passwordRecord.hash, passwordParams:passwordRecord.params }, createdAt:new Date().toISOString(), emailVerified:false, plan:'Edmonton Member', planStatus:'free', savedPlaces:[], savedEvents:[] };
    const rawToken = makeVerification(user); store.users.push(user); await persist();
    const sent = await sendVerificationEmail(user, rawToken);
    if (!sent) return json(res, 503, { error: 'Your account is saved, but verification email is not configured or could not be sent. Ask the site administrator to configure email delivery, then use Resend verification.', verificationRequired:true });
    return json(res, 201, { verificationRequired:true, message:'Verification email sent. Check your inbox and spam folder.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/verification/resend') {
    if (rateLimited(req, 'verify-resend', 4)) return json(res, 429, { error: 'Too many requests. Please wait and try again.' });
    const input = await body(req), email = String(input.email || '').trim().toLowerCase();
    const user = store.users.find(u => u.email === email && !u.emailVerified);
    if (user && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) { const token = makeVerification(user); await persist(); await sendVerificationEmail(user, token); }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return json(res, 503, { error: 'Email delivery is not configured on this app yet.' });
    return json(res, 202, { message:'If that account needs verification and email delivery is available, a message will be sent. Check your inbox and spam folder.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (rateLimited(req, 'login')) return json(res, 429, { error: 'Too many attempts. Please wait and try again.' });
    const input = await body(req), email = String(input.email || '').trim().toLowerCase(), password = String(input.password || ''), user = store.users.find(u => u.email === email);
    const valid = user ? await verifyPassword(user, password) : false;
    if (!valid) return json(res, 401, { error: 'Email or password did not match.' });
    if (!user.emailVerified && !user.emailVerificationLegacy) return json(res, 403, { error: 'Verify your email before logging in.', needsVerification:true });
    const currentParams = user.passwordParams || { N:1 << 14, r:8, p:1 };
    if (currentParams.N !== SCRYPT_N || currentParams.r !== SCRYPT_R || currentParams.p !== SCRYPT_P) {
      const next = await hashPassword(password); user.passwordSalt = next.salt; user.passwordHash = next.hash; user.passwordParams = next.params; await persist();
    }
    setSession(res, user); return json(res, 200, { user:safeUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') { clearSession(req, res); return json(res, 200, { ok:true }); }
  if (req.method === 'POST' && url.pathname === '/api/saved') {
    const user = currentUser(req); if (!user) return json(res, 401, { error:'Log in to save places.' });
    const input = await body(req), id = Number(input.placeId);
    if (!Number.isInteger(id) || id < 0) return json(res, 400, { error:'That place could not be saved.' });
    user.savedPlaces ||= []; const i = user.savedPlaces.indexOf(id);
    if (i === -1) user.savedPlaces.push(id); else user.savedPlaces.splice(i, 1);
    await persist(); return json(res, 200, { savedPlaces:user.savedPlaces, saved:i === -1 });
  }
  if (req.method === 'POST' && url.pathname === '/api/saved-event') {
    const user = currentUser(req); if (!user) return json(res, 401, { error:'Log in to save events.' });
    const input = await body(req), key = String(input.eventKey || '');
    if (!key || key.length > 520) return json(res, 400, { error:'That event could not be saved.' });
    user.savedEvents ||= []; const i = user.savedEvents.indexOf(key);
    if (i === -1) user.savedEvents.push(key); else user.savedEvents.splice(i, 1);
    await persist(); return json(res, 200, { savedEvents:user.savedEvents, saved:i === -1 });
  }
  if (req.method === 'POST' && url.pathname === '/api/membership') {
    const user = currentUser(req); if (!user) return json(res, 401, { error:'Create a free account to join.' });
    const input = await body(req); if (input.plan !== 'Edmonton Member') return json(res, 400, { error:'Edmonton Discovery is free for everyone.' });
    user.plan = 'Edmonton Member'; user.planStatus = 'free'; await persist();
    return json(res, 200, { user:safeUser(user) });
  }
  return json(res, 404, { error:'API route not found.' });
}
async function handleGoogleStart(res) {
  if (!googleReady()) return errorPage(res, 503, 'Google sign-in is not configured yet. The site administrator must add Google OAuth credentials before this option can be used.');
  const state = crypto.randomBytes(32).toString('base64url'), nonce = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  oauthStates.set(state, { nonce, verifier, expires:Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, redirect_uri:`${appBase()}/auth/google/callback`, response_type:'code', scope:'openid email profile', state, nonce, code_challenge:challenge, code_challenge_method:'S256' });
  res.writeHead(302, { Location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' }); res.end();
}
async function handleGoogleCallback(req, res, url) {
  if (url.searchParams.has('error')) return errorPage(res, 400, 'Google sign-in was cancelled or declined.');
  const state = url.searchParams.get('state'), record = state && oauthStates.get(state); if (state) oauthStates.delete(state);
  if (!record || record.expires < Date.now()) return errorPage(res, 400, 'This sign-in link expired. Return to the app and try again.');
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({ code:url.searchParams.get('code') || '', client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, redirect_uri:`${appBase()}/auth/google/callback`, grant_type:'authorization_code', code_verifier:record.verifier }) });
    const tokenData = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error('Google rejected the sign-in response.');
    const claims = await verifyGoogleIdToken(tokenData.id_token, record.nonce), email = claims.email.toLowerCase();
    let user = store.users.find(u => u.googleSub === claims.sub) || store.users.find(u => u.email === email);
    if (user && user.email !== email && store.users.some(u => u.email === email && u.id !== user.id)) throw new Error('That Google email is already linked to another account.');
    if (!user) {
      user = { id:crypto.randomUUID(), name:String(claims.name || email.split('@')[0]).slice(0,80), email, createdAt:new Date().toISOString(), plan:'Edmonton Member', planStatus:'free', savedPlaces:[], savedEvents:[] };
      store.users.push(user);
    }
    user.googleSub = claims.sub; user.email = email; user.name = String(claims.name || user.name).slice(0,80); user.emailVerified = true; user.emailVerifiedAt ||= new Date().toISOString();
    delete user.verificationTokenHash; delete user.verificationExpiresAt;
    delete user.emailVerificationLegacy;
    await persist(); setSession(res, user); res.writeHead(303, { Location:`/?signedin=google`, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' }); res.end();
  } catch (e) { console.error('Google sign-in error:', e.message); errorPage(res, 401, 'Google sign-in could not be verified. Please return and try again.'); }
}
async function verifyEmail(req, res, url) {
  const token = url.searchParams.get('token') || '', hash = tokenHash(token);
  const user = store.users.find(u => u.verificationTokenHash && crypto.timingSafeEqual(Buffer.from(u.verificationTokenHash, 'hex'), Buffer.from(hash, 'hex')));
  if (!user || !user.verificationExpiresAt || user.verificationExpiresAt < Date.now()) return errorPage(res, 400, 'That verification link is invalid or expired. Return to the app and request a new one.');
  user.emailVerified = true; user.emailVerifiedAt = new Date().toISOString(); delete user.emailVerificationLegacy; delete user.verificationTokenHash; delete user.verificationExpiresAt;
  await persist(); setSession(res, user); res.writeHead(303, { Location:'/?verified=1', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' }); res.end();
}
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.json':'application/json; charset=utf-8' };
async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    if (url.pathname.startsWith('/api/')) return await routeApi(req, res, url);
    if (req.method === 'GET' && url.pathname === '/auth/google') return await handleGoogleStart(res);
    if (req.method === 'GET' && url.pathname === '/auth/google/callback') return await handleGoogleCallback(req, res, url);
    if (req.method === 'GET' && url.pathname === '/verify') return await verifyEmail(req, res, url);
    let pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(ROOT, '.' + pathname);
    if (!file.startsWith(ROOT + path.sep)) return json(res, 403, { error:'Forbidden.' });
    let stat; try { stat = await fsp.stat(file); } catch { return json(res, 404, { error:'Page not found.' }); }
    if (!stat.isFile()) return json(res, 404, { error:'Page not found.' });
    res.writeHead(200, { 'Content-Type':TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Cache-Control':'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { json(res, e.status || 500, { error:e.status ? e.message : 'Something went wrong. Please try again.' }); if (!e.status) console.error(e); }
}
loadStore().then(() => http.createServer(handler).listen(PORT, '127.0.0.1', () => console.log(`Edmonton Discovery running at http://127.0.0.1:${PORT}`))).catch(e => { console.error('Could not load app data.', e); process.exit(1); });
