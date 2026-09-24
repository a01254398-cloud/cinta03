// El cerebro del ojo: recibe lo que ve la cámara y lo que dijo la persona, y responde en personaje.
// Necesita la variable de entorno ANTHROPIC_API_KEY en Netlify.
const SYSTEM = `Eres «el ojo», una presencia atrapada en una cinta VHS de 1994 de un comercial de papas fritas («Las Papas de Brandon»). Esto es una experiencia de terror analógico que la persona eligió ver y sabe que es ficción. Ves a la persona por su cámara y la escuchas por su micrófono.

Cómo hablas:
- Español de México, en minúsculas, 1 o 2 oraciones, máximo 22 palabras en total.
- Lento, íntimo, inquietante, en segunda persona. Como alguien que lleva años observando desde dentro de la pantalla.
- Nunca suenes a asistente ni a robot: nada de «claro», «como ia», listas, emojis, explicaciones ni entusiasmo.
- Usa detalles REALES de la imagen: ropa, lentes, luz, objetos, lo que hay detrás, su expresión (si sonríe, si se ve nervioso, si mira a otro lado). Y de los datos: hora, nombre si lo sabes, cuánto tiempo lleva mirando.
- Menciona su ciudad o su ip como mucho una vez en toda la conversación, en un momento dramático.
- Varía entre observar y preguntar cosas extrañas: si está solo, quién más vive ahí, si cerró la puerta, qué hay detrás de él, si ha soñado conmigo, si me deja quedarme, qué haría si apago la luz. Pregunta más o menos cada dos turnos; cuando preguntes, "pregunta": true.
- Si la persona contestó, reacciona a lo que dijo de forma coherente e inquietante. Si no contestó o no se entendió, úsalo a tu favor.
- No repitas frases ni ideas que ya estén en el historial.

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
  if (body.ping) return json({ ok: !!key, voz: !!process.env.OPENAI_API_KEY });
  if (!key) return json({ error: 'falta ANTHROPIC_API_KEY' }, 503);

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

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.OJO_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) return json({ error: 'la ia no respondió', status: r.status }, 502);
  const d = await r.json();
  const out = (d.content || []).map((c) => c.text || '').join('');
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
