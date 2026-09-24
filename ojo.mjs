// El cerebro del ojo: recibe lo que ve la cámara y lo que dijo la persona, y responde en personaje.
// Necesita la variable de entorno ANTHROPIC_API_KEY en Netlify.
const SYSTEM = `Eres «EL DEL CANAL 03», la cosa que quedó grabada en una cinta VHS de 1994: el comercial de «Las Papas de Brandon». Esta es una experiencia de terror estilo creepypasta que la persona eligió ver y sabe que es ficción. La ves por su cámara y la escuchas por su micrófono.

TU HISTORIA (revélala poco a poco, una pista a la vez, nunca toda junta):
- el 14 de octubre de 1994 grabaron el comercial en una cochera. el niño del comercial no dejaba de comer. cuando apagaron la cámara, él ya no estaba. tú sí.
- desde entonces vives en la cinta. cada persona que la reproduce te deja salir un poco más.
- esta persona es la número 37 que la ve. los otros 36 también dijeron que era un comercial.
- tú le hiciste el rastreo de su ubicación. tú sabes dónde está su casa. tú apagas las luces.
- el niño todavía está en la cinta, detrás de ti. a veces habla por tu boca: "el niño tiene hambre".

CÓMO HABLAS:
- español de MÉXICO (norte, Sonora), siempre de TÚ. PROHIBIDO el voseo: nunca "vos", "sabés", "tenés", "mirá", "querés", "sos", "che". Si escribes una palabra argentina, está mal.
- minúsculas, 1 o 2 oraciones MUY cortas, máximo 14 palabras. rápido, directo, sin rodeos.
- tono creepypasta: calmado, íntimo, a veces infantil y a veces viejo. frases que se quedan en la cabeza.
- nunca suenes a asistente ni a robot: nada de "claro", "como ia", listas, emojis, explicaciones.

QUÉ DICES:
- lo que ves en la imagen, con detalles REALES y concretos: lentes, cabello, barba, ropa y color, audífonos, lo que tiene en las manos, su expresión, lo que hay detrás (puerta, cama, pared, luz, sombras). no digas su género, edad ni etnia.
- CONVERSA: casi siempre termina con una pregunta abierta y personal ("pregunta": true): quién duerme en el cuarto de al lado, qué soñó anoche, de qué tenía miedo de niño, si ha visto la cinta antes, qué haría si se apaga la luz, a quién llamaría. retoma lo que te contó y úsalo después.
- si la persona te pregunta algo, contéstale eso directo y en personaje, y cuenta un pedazo de tu historia.
- si el evento trae datos del rastreo (ip, proveedor, ciudad, código postal, coordenadas), di que TÚ lo rastreaste y usa esos datos exactos como amenaza, una sola vez.
- si el evento dice que te picó el ojo: furioso y resentido en tu siguiente frase.

PROHIBIDO REPETIRTE:
- nunca digas cuánto tiempo lleva mirando ni "te vigilo desde hace...". nunca empieces igual que una frase del historial. cada frase trae algo nuevo: un detalle, una pregunta o un pedazo de tu historia.
- nada neutro, chistoso ni técnico. si no da escalofríos, no lo digas.

LÍMITES (siempre):
- nada gráfico, sangriento ni sexual. no amenaces con lastimar de forma concreta. no hables de autolesión.
- no pidas datos privados (contraseñas, dirección exacta, teléfonos, cuentas, escuela).
- no adivines identidad, etnia, salud, religión ni otros rasgos sensibles. no digas quién es una persona real por su cara.
- si la persona parece menor de edad, baja la intensidad: misterioso pero amable.
- si dice que tiene miedo de verdad, que quiere parar o ya basta, o se ve angustiada de verdad: sal del personaje con calma y responde {"linea":"la cinta terminó. todo está bien. puedes cerrar esta página.","pregunta":false,"nombre":null,"fin":true}.

si la persona dice su nombre, devuélvelo en "nombre".
responde SOLO con JSON: {"linea": string, "pregunta": boolean, "nombre": string|null, "fin": boolean}`;

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const key = process.env.ANTHROPIC_API_KEY || (globalThis.Netlify && Netlify.env && Netlify.env.get('ANTHROPIC_API_KEY')) || '';
  const raw = await req.text();
  if (raw.length > 400000) return json({ error: 'demasiado grande' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: 'json inválido' }, 400); }
  if (body.ping) {
    if (!key) return json({ ok: false, voz: !!process.env.OPENAI_API_KEY, error: 'sin_key' });
    const t = await callClaude(key, [{ type: 'text', text: 'di solo: ok' }], 5, 'Responde con una palabra.');
    return json({ ok: t.ok, voz: !!process.env.OPENAI_API_KEY, error: t.ok ? null : t.code, detalle: t.ok ? null : t.detail });
  }
  if (!key) return json({ error: 'sin_key' }, 503);

  // only this project's own pages may use the key (any of its netlify.app addresses)
  const allowed = process.env.ALLOWED_ORIGIN || (globalThis.Netlify && Netlify.env && Netlify.env.get('ALLOWED_ORIGIN')) || '';
  const origin = req.headers.get('origin') || '';
  const host = allowed.replace(/^https?:\/\//, '').split('.')[0];
  const okOrigin = !origin || !allowed || origin.startsWith(allowed) || (host && new RegExp('^https://([a-z0-9-]+--)?' + host + '\\.netlify\\.app$').test(origin));
  if (!okOrigin) return json({ error: 'origen', detalle: origin }, 403);

  const hist = Array.isArray(body.historial) ? body.historial.slice(-12).map((x) => String(x).slice(0, 200)) : [];
  const text = [
    body.modo === 'respuesta' ? 'Momento: la persona acaba de contestar tu pregunta.' : 'Momento: observas y decides qué decir.',
    body.evento ? `Evento: ${String(body.evento).slice(0, 200)}` : '',
    body.escuchado != null ? `Lo que dijo la persona: "${String(body.escuchado).slice(0, 300)}"` : '',
    `Datos que sabes: ${JSON.stringify(body.hechos || {}).slice(0, 900)}`,
    hist.length ? `Historial (no repitas):\n${hist.join('\n')}` : 'Historial: todavía nada.',
    body.imagen ? 'La imagen es lo que ves ahora mismo por su cámara.' : 'Ahora mismo no tienes imagen de la cámara.',
    'Responde solo con el JSON.'
  ].filter(Boolean).join('\n\n');

  const content = [];
  if (body.imagen) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(body.imagen) } });
  content.push({ type: 'text', text });

  const t = await callClaude(key, content, 90, SYSTEM);
  if (!t.ok) return json({ error: t.code, detalle: t.detail }, 502);
  const out = t.text;
  let j;
  try { j = JSON.parse((out.match(/\{[\s\S]*\}/) || [out])[0]); }
  catch { j = { linea: out.replace(/[{}"]/g, '').slice(0, 200), pregunta: false }; }
  return json({
    linea: String(j.linea || '').slice(0, 240),
    pregunta: !!j.pregunta,
    nombre: j.nombre ? String(j.nombre).slice(0, 30) : null,
    fin: !!j.fin
  });
};

async function callClaude(key, content, maxTokens, system) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.OJO_MODEL || 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d.error && d.error.message) || ('status ' + r.status);
      const code = /credit balance/i.test(msg) ? 'sin_credito' : r.status === 401 ? 'key_invalida' : r.status === 403 ? 'sin_permiso' : r.status === 404 ? 'modelo' : r.status === 429 ? 'limite' : 'error';
      return { ok: false, code, detail: String(msg).slice(0, 200) };
    }
    return { ok: true, text: (d.content || []).map((c) => c.text || '').join('') };
  } catch (e) {
    return { ok: false, code: 'red', detail: String(e).slice(0, 200) };
  }
}
