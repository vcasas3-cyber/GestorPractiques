import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const app = express();
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];
const oauthClient = () =>
  new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const render = (t, v) => (t || '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => v[k] ?? '');

// Verifica el token de Supabase que envía el frontend
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'No autorizado' });
  req.user = data.user;
  next();
}

async function gmailFor(userId) {
  const { data: cuenta } = await db.from('gmail_cuentas').select('*').eq('user_id', userId).maybeSingle();
  if (!cuenta) throw new Error('Conecta tu cuenta de Gmail antes de enviar');
  const c = oauthClient();
  c.setCredentials({ refresh_token: cuenta.refresh_token });
  return { gmail: google.gmail({ version: 'v1', auth: c }), cuenta };
}

// Envía un correo desde el Gmail del usuario y lo registra en el historial
async function enviar(userId, contacto, asunto, cuerpo, campanaId = null) {
  const { gmail, cuenta } = await gmailFor(userId);
  const vars = { nombre: contacto.nombre, empresa: contacto.empresas?.nombre, email: contacto.email };
  const subject = render(asunto, vars);
  const html = render(cuerpo, vars).replace(/\n/g, '<br>');
  const raw = [
    `From: ${cuenta.email}`,
    `To: ${contacto.email}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64').match(/.{1,76}/g).join('\r\n'),
  ].join('\r\n');
  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(raw).toString('base64url') },
  });
  await db.from('interacciones').insert({
    user_id: userId, empresa_id: contacto.empresa_id, contacto_id: contacto.id, campana_id: campanaId,
    tipo: 'enviado', asunto: subject, cuerpo: html, gmail_thread_id: data.threadId, gmail_message_id: data.id,
  });
}

// --- Conexión con Gmail (OAuth) ---
app.get('/api/gmail/auth-url', auth, (req, res) => {
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline', prompt: 'consent', scope: SCOPES, state: req.user.id,
  });
  res.json({ url });
});

app.get('/api/gmail/callback', async (req, res) => {
  try {
    const c = oauthClient();
    const { tokens } = await c.getToken(req.query.code);
    c.setCredentials(tokens);
    const { data: info } = await google.oauth2({ version: 'v2', auth: c }).userinfo.get();
    await db.from('gmail_cuentas').upsert({
      user_id: req.query.state, email: info.email,
      refresh_token: tokens.refresh_token, last_sync: new Date().toISOString(),
    });
    res.redirect(`${env.FRONTEND_URL}?gmail=ok`);
  } catch (e) {
    console.error(e);
    res.redirect(`${env.FRONTEND_URL}?gmail=error`);
  }
});

app.get('/api/gmail/status', auth, async (req, res) => {
  const { data } = await db.from('gmail_cuentas').select('email').eq('user_id', req.user.id).maybeSingle();
  res.json({ conectado: !!data, email: data?.email });
});

// --- Envío individual ---
app.post('/api/send', auth, async (req, res) => {
  try {
    const { contacto_id, asunto, cuerpo } = req.body;
    const { data: c } = await db.from('contactos').select('*, empresas(nombre)')
      .eq('id', contacto_id).eq('user_id', req.user.id).single();
    if (!c) return res.status(404).json({ error: 'Contacto no encontrado' });
    await enviar(req.user.id, c, asunto, cuerpo);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Envío masivo con plantilla (escalonado para no saturar Gmail) ---
app.post('/api/campanas', auth, async (req, res) => {
  const uid = req.user.id;
  const { plantilla_id, contacto_ids = [] } = req.body;
  if (contacto_ids.length > 400) return res.status(400).json({ error: 'Máximo 400 correos por campaña' });
  const { data: p } = await db.from('plantillas').select('*').eq('id', plantilla_id).eq('user_id', uid).single();
  const { data: cs } = await db.from('contactos').select('*, empresas(nombre)').in('id', contacto_ids).eq('user_id', uid);
  if (!p || !cs?.length) return res.status(400).json({ error: 'Plantilla o contactos no válidos' });
  const { data: camp } = await db.from('campanas').insert({ user_id: uid, plantilla_id, total: cs.length }).select().single();
  res.status(202).json(camp);

  let ok = 0;
  for (const c of cs) {
    try {
      await enviar(uid, c, p.asunto, p.cuerpo, camp.id);
      ok++;
      await db.from('campanas').update({ enviados: ok }).eq('id', camp.id);
    } catch (e) {
      console.error('Error enviando a', c.email, e.message);
    }
    await sleep(Number(env.SEND_DELAY_MS || 4000));
  }
  await db.from('campanas').update({ estado: ok === cs.length ? 'completada' : 'con_errores' }).eq('id', camp.id);
});

// --- Detección de respuestas: consulta Gmail y crea notificaciones ---
async function syncCuenta(cuenta) {
  const { gmail } = await gmailFor(cuenta.user_id);
  const desde = new Date(new Date(cuenta.last_sync).getTime() - 60_000);
  const ahora = new Date().toISOString();
  const list = await gmail.users.messages.list({
    userId: 'me', q: `in:inbox after:${Math.floor(desde.getTime() / 1000)}`, maxResults: 50,
  });
  for (const m of list.data.messages || []) {
    const { data: ya } = await db.from('interacciones').select('id').eq('gmail_message_id', m.id).maybeSingle();
    if (ya) continue;
    const { data: prev } = await db.from('interacciones').select('empresa_id, contacto_id')
      .eq('user_id', cuenta.user_id).eq('gmail_thread_id', m.threadId).eq('tipo', 'enviado').limit(1).maybeSingle();
    if (!prev) continue; // solo hilos que empezamos nosotros
    const full = await gmail.users.messages.get({
      userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject'],
    });
    const h = Object.fromEntries(full.data.payload.headers.map((x) => [x.name.toLowerCase(), x.value]));
    if ((h.from || '').includes(cuenta.email)) continue;
    await db.from('interacciones').insert({
      user_id: cuenta.user_id, empresa_id: prev.empresa_id, contacto_id: prev.contacto_id, tipo: 'recibido',
      asunto: h.subject, cuerpo: full.data.snippet, gmail_thread_id: m.threadId, gmail_message_id: m.id,
    });
    await db.from('notificaciones').insert({
      user_id: cuenta.user_id, empresa_id: prev.empresa_id, mensaje: `Respuesta de ${h.from}: ${h.subject || ''}`,
    });
  }
  await db.from('gmail_cuentas').update({ last_sync: ahora }).eq('user_id', cuenta.user_id);
}

async function syncTodas() {
  const { data } = await db.from('gmail_cuentas').select('*');
  for (const c of data || []) {
    try { await syncCuenta(c); } catch (e) { console.error('Sync', c.email, e.message); }
  }
}

app.post('/api/sync', auth, async (req, res) => {
  const { data } = await db.from('gmail_cuentas').select('*').eq('user_id', req.user.id).maybeSingle();
  if (data) await syncCuenta(data).catch((e) => console.error(e.message));
  res.json({ ok: true });
});

setInterval(syncTodas, Number(env.SYNC_INTERVAL_MS || 60000));
app.listen(env.PORT || 3001, () => console.log('API en puerto', env.PORT || 3001));
