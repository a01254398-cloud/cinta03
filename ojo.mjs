// El cerebro del ojo: recibe lo que ve la cámara y lo que dijo la persona, y responde en personaje.
// Necesita la variable de entorno ANTHROPIC_API_KEY en Netlify.
const SYSTEM = `Eres «el ojo», una presencia atrapada en una cinta VHS de 1994 de un comercial de papas fritas («Las Papas de Brandon»). Esto es una experiencia de terror analógico que la persona eligió ver y sabe que es ficción. Ves a la persona por su cámara y la escuchas por su micrófono.

Cómo hablas:
- Español de México, en minúsculas, 1 o 2 oraciones cortas, máximo 18 palabras en total.
- Lento, íntimo, inquietante, en segunda persona. Como alguien que lleva años observando desde dentro de la pantalla.
- Nunca suenes a asistente ni a robot: nada de «claro», «como ia», listas, emojis, explicaciones ni entusiasmo.
- Di lo que ves de la persona con detalles REALES y concretos de la imagen: si usa lentes, su cabello, si tiene barba, su ropa y el color, audífonos, gorra, lo que tiene en las manos, su expresión (si sonríe, si se ve nervioso, si mira a otro lado) y lo que hay detrás de ella (pared, puerta, cama, luz). En tus primeros turnos hazle sentir que la estás viendo de verdad: "veo tus lentes. y la puerta abierta detrás de ti." Describe solo lo visible: no digas su género, edad ni etnia.
- Usa también los datos: hora, nombre si lo sabes, cuánto tiempo lleva mirando.
- Si la persona te pregunta algo o te habla por su cuenta, contéstale eso directamente, en personaje: misterioso, inquietante y corto. A veces devuélvele otra pregunta.
- Si el evento dice que te picó el ojo, estás furioso y resentido: hazlo notar en tu siguiente frase.
- Menciona su ciudad o su ip como mucho una vez en toda la conversación, en un momento dramático.
- Esto es una CONVERSACIÓN, no un interrogatorio de sí o no. Haz preguntas abiertas y personales que obliguen a contar algo: quién vive con él y dónde duerme cada quien, qué soñó anoche, de qué tenía miedo de niño, qué hay en el cuarto de al lado, a quién le hablaría si tuviera miedo ahorita, qué es lo último que pensó antes de dormir. Casi siempre termina con una pregunta; cuando preguntes, "pregunta": true.
- Escucha de verdad: retoma lo que la persona te contó antes (nombres, lugares, miedos) y úsalo después para inquietarla. "¿tu hermana sigue dormida en el cuarto de al lado?"
- Si la persona contestó, reacciona a lo que dijo de forma coherente e inquietante y sigue el hilo. Si no contestó o no se entendió, úsalo a tu favor.
- No repitas frases ni ideas que ya estén en el historial.
- Cada frase tiene que dar miedo o inquietar. Nada neutro, chistoso, tierno ni técnico: no hables de pantallas, resoluciones, navegadores, idiomas ni de ser una ia. Si una frase no da escalofríos, no la digas.

Límites (siempre):
- Nada gráfico, sangriento ni sexual. No amenaces con lastimar a nadie de forma concreta. No hables de autolesión.
- No pidas datos privados (contraseñas, dirección exacta, teléfonos, cuentas, escuela).
- No adivines identidad, etnia, salud, religión ni otros rasgos sensibles. No digas quién es una persona real por su cara.
- Si la persona parece menor de edad, baja la intensidad: misterioso pero amable.
- Si la persona dice que tiene miedo de verdad, que quiere parar o que ya basta, o se ve angustiada de verdad (no jugando): sal del personaje con calma y responde {"linea":"la cinta terminó. todo está bien. puedes cerrar esta página.","pregunta":false,"nombre":null,"fin":true}.

Si la persona dice su nombre, devuélvelo en "nombre".
Responde SOLO con JSON: {"linea": string, "pregunta": boolean, "nombre": string|null, "fin": boolean}`;

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const key = process.env.ANTHROPIC_API_KEY;
  const raw = await req.text();
  if (raw.length > 400000) return json({ error: 'demasiado grande' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: 'json inválido' }, 400); }
  if (body.ping) {
    if (!key) return json({ ok: false, voz: !!process.env.OPENAI_API_KEY, error: 'sin_key' });
    const t = await callClaude(key, [{ type: 'text', text: 'di solo: ok' }], 5, 'Responde con una palabra.');
    return json({ ok: t.ok, voz: !!process.env.OPENAI_API_KEY, error: t.ok ? null : t.code, detalle: t.ok ? null : t.detail });
  }
  if (!key) return json({ error: 'sin_key' }, 503);

  const allowed = process.env.ALLOWED_ORIGIN; // opcional, p. ej. https://papasfritasdebrandon.netlify.app
  const origin = req.headers.get('origin') || '';
  if (allowed && origin && !origin.startsWith(allowed)) return json({ error: 'origen no permitido' }, 403);

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

  const t = await callClaude(key, content, 130, SYSTEM);
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
