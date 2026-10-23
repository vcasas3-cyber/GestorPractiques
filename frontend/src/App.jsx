import { useEffect, useState } from 'react';
import { supabase, api } from './lib';

function useTable(table) {
  const [rows, setRows] = useState([]);
  const load = async () => {
    const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  return [rows, load];
}

function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const go = (fn) => async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth[fn](f);
    setErr(error ? error.message : fn === 'signUp' ? 'Revisa tu correo para confirmar la cuenta' : '');
  };
  return (
    <section className="login">
      <h2>Gestor de prácticas</h2>
      <form onSubmit={go('signInWithPassword')}>
        <input type="email" placeholder="Correo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input type="password" placeholder="Contraseña" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        <button className="primary">Entrar</button>
        <button type="button" className="link" onClick={go('signUp')}>Crear cuenta</button>
      </form>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function Empresas() {
  const [empresas, load] = useTable('empresas');
  const [sel, setSel] = useState(null);
  const [f, setF] = useState({ nombre: '', sector: '', ciudad: '' });
  const add = async (e) => {
    e.preventDefault();
    await supabase.from('empresas').insert(f);
    setF({ nombre: '', sector: '', ciudad: '' });
    load();
  };
  if (sel) return <Detalle empresa={sel} volver={() => setSel(null)} />;
  return (
    <section>
      <h2>Empresas</h2>
      <form onSubmit={add}>
        <input placeholder="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        <input placeholder="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} />
        <input placeholder="Ciudad" value={f.ciudad} onChange={(e) => setF({ ...f, ciudad: e.target.value })} />
        <button className="primary">Añadir empresa</button>
      </form>
      {empresas.length === 0 && <p className="muted">Aún no hay empresas. Añade la primera arriba.</p>}
      <ul>
        {empresas.map((e) => (
          <li key={e.id}>
            <button className="link" onClick={() => setSel(e)}>{e.nombre}</button>{' '}
            <span className="muted">{[e.sector, e.ciudad].filter(Boolean).join(', ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detalle({ empresa, volver }) {
  const [contactos, setContactos] = useState([]);
  const [hist, setHist] = useState([]);
  const [c, setC] = useState({ nombre: '', email: '', cargo: '' });
  const [m, setM] = useState({ contacto_id: '', asunto: '', cuerpo: '' });
  const [msg, setMsg] = useState('');
  const load = async () => {
    const a = await supabase.from('contactos').select('*').eq('empresa_id', empresa.id);
    const b = await supabase.from('interacciones').select('*').eq('empresa_id', empresa.id).order('created_at', { ascending: false });
    setContactos(a.data || []);
    setHist(b.data || []);
  };
  useEffect(() => { load(); }, []);
  const addContacto = async (e) => {
    e.preventDefault();
    await supabase.from('contactos').insert({ ...c, empresa_id: empresa.id });
    setC({ nombre: '', email: '', cargo: '' });
    load();
  };
  const enviar = async (e) => {
    e.preventDefault();
    setMsg('Enviando…');
    try {
      await api('/api/send', 'POST', m);
      setMsg('Correo enviado');
      setM({ ...m, asunto: '', cuerpo: '' });
      load();
    } catch (er) { setMsg(er.message); }
  };
  return (
    <>
      <section>
        <button className="link" onClick={volver}>Volver a empresas</button>
        <h2>{empresa.nombre}</h2>
        <h3>Contactos</h3>
        <form onSubmit={addContacto}>
          <input placeholder="Nombre" value={c.nombre} onChange={(e) => setC({ ...c, nombre: e.target.value })} required />
          <input type="email" placeholder="Correo" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} required />
          <input placeholder="Cargo" value={c.cargo} onChange={(e) => setC({ ...c, cargo: e.target.value })} />
          <button className="primary">Añadir contacto</button>
        </form>
        <ul>{contactos.map((x) => <li key={x.id}>{x.nombre} <span className="muted">{x.email} {x.cargo}</span></li>)}</ul>
      </section>
      <section>
        <h3>Enviar correo</h3>
        <form onSubmit={enviar}>
          <select value={m.contacto_id} onChange={(e) => setM({ ...m, contacto_id: e.target.value })} required>
            <option value="">Elige contacto</option>
            {contactos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
          <input placeholder="Asunto" value={m.asunto} onChange={(e) => setM({ ...m, asunto: e.target.value })} required style={{ flex: 1 }} />
          <textarea placeholder="Mensaje (puedes usar {{nombre}} y {{empresa}})" value={m.cuerpo} onChange={(e) => setM({ ...m, cuerpo: e.target.value })} required />
          <button className="primary">Enviar desde Gmail</button>
          <span className="muted">{msg}</span>
        </form>
      </section>
      <section>
        <h3>Historial de contacto</h3>
        {hist.length === 0 && <p className="muted">Aún no hay correos con esta empresa.</p>}
        <ul>
          {hist.map((h) => (
            <li key={h.id}>
              <span className={`tag ${h.tipo}`}>{h.tipo}</span> {h.asunto}{' '}
              <span className="muted">{new Date(h.created_at).toLocaleString('es-ES')}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Plantillas() {
  const [rows, load] = useTable('plantillas');
  const [f, setF] = useState({ nombre: '', asunto: '', cuerpo: '' });
  const add = async (e) => {
    e.preventDefault();
    await supabase.from('plantillas').insert(f);
    setF({ nombre: '', asunto: '', cuerpo: '' });
    load();
  };
  return (
    <section>
      <h2>Plantillas</h2>
      <p className="muted">Variables disponibles: {'{{nombre}}'}, {'{{empresa}}'}, {'{{email}}'}.</p>
      <form onSubmit={add}>
        <input placeholder="Nombre de la plantilla" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        <input placeholder="Asunto" value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} required style={{ flex: 1 }} />
        <textarea placeholder="Cuerpo del correo" value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} required />
        <button className="primary">Guardar plantilla</button>
      </form>
      <ul>{rows.map((p) => <li key={p.id}>{p.nombre} <span className="muted">{p.asunto}</span></li>)}</ul>
    </section>
  );
}

function Masivo() {
  const [plantillas] = useTable('plantillas');
  const [campanas, loadC] = useTable('campanas');
  const [contactos, setContactos] = useState([]);
  const [p, setP] = useState('');
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('contactos').select('id,nombre,email,empresas(nombre)').order('nombre').then(({ data }) => setContactos(data || []));
    const t = setInterval(loadC, 5000);
    return () => clearInterval(t);
  }, []);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const enviar = async () => {
    if (!confirm(`Se enviarán ${sel.size} correos desde tu Gmail. ¿Continuar?`)) return;
    try {
      await api('/api/campanas', 'POST', { plantilla_id: p, contacto_ids: [...sel] });
      setMsg('Envío en curso; los correos salen escalonados.');
      setSel(new Set());
      loadC();
    } catch (e) { setMsg(e.message); }
  };
  return (
    <>
      <section>
        <h2>Envío masivo</h2>
        <select value={p} onChange={(e) => setP(e.target.value)}>
          <option value="">Elige plantilla</option>
          {plantillas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
        <ul>
          {contactos.map((c) => (
            <li key={c.id}>
              <label><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /> {c.nombre}{' '}
                <span className="muted">{c.empresas?.nombre} · {c.email}</span></label>
            </li>
          ))}
        </ul>
        <button className="primary" disabled={!p || sel.size === 0} onClick={enviar}>Enviar a {sel.size} contactos</button>{' '}
        <span className="muted">{msg}</span>
      </section>
      <section>
        <h3>Campañas</h3>
        <ul>{campanas.map((c) => <li key={c.id}>{new Date(c.created_at).toLocaleString('es-ES')}: {c.enviados}/{c.total} <span className="tag">{c.estado}</span></li>)}</ul>
      </section>
    </>
  );
}

function Main() {
  const [tab, setTab] = useState('empresas');
  const [gmail, setGmail] = useState(null);
  const [notis, setNotis] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api('/api/gmail/status').then(setGmail).catch(() => setGmail({ conectado: false }));
    supabase.from('notificaciones').select('*').eq('leida', false).order('created_at', { ascending: false }).then(({ data }) => setNotis(data || []));
    const ch = supabase.channel('notis').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, (p) => {
      setNotis((n) => [p.new, ...n]);
      if ('Notification' in window && Notification.permission === 'granted') new Notification(p.new.mensaje);
    }).subscribe();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    return () => supabase.removeChannel(ch);
  }, []);
  const conectar = async () => { const { url } = await api('/api/gmail/auth-url'); window.location = url; };
  const leer = async () => {
    await supabase.from('notificaciones').update({ leida: true }).eq('leida', false);
    setNotis([]);
    setOpen(false);
  };
  const tabs = { empresas: <Empresas />, plantillas: <Plantillas />, masivo: <Masivo /> };
  return (
    <>
      <header>
        <h1>Gestor de prácticas</h1>
        <nav>
          {[['empresas', 'Empresas'], ['plantillas', 'Plantillas'], ['masivo', 'Envío masivo']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        {gmail && (gmail.conectado
          ? <span className="muted">{gmail.email}</span>
          : <button className="ghost" onClick={conectar}>Conectar Gmail</button>)}
        <div className="bell">
          <button className="ghost" onClick={() => setOpen(!open)}>Respuestas{notis.length > 0 && <b>{notis.length}</b>}</button>
          {open && (
            <div className="panel">
              {notis.length === 0 ? <p className="muted">No hay respuestas nuevas.</p> : (
                <>
                  <ul>{notis.map((n) => <li key={n.id}>{n.mensaje}</li>)}</ul>
                  <button className="link" onClick={leer}>Marcar como leídas</button>
                </>
              )}
            </div>
          )}
        </div>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      <main>{tabs[tab]}</main>
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: s } = supabase.auth.onAuthStateChange((_, x) => setSession(x));
    return () => s.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  return session ? <Main /> : <Login />;
}
