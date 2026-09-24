// La voz del ojo: convierte el texto en una voz grave y susurrada.
// Opcional: necesita OPENAI_API_KEY. Sin ella, la página usa la voz del navegador.
export default async (req) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return new Response('falta OPENAI_API_KEY', { status: 503 });
  if (req.method !== 'POST') return new Response('usa POST', { status: 405 });
  let b; try { b = await req.json(); } catch { return new Response('json inválido', { status: 400 }); }
  const texto = String(b.texto || '').slice(0, 300);
  if (!texto) return new Response('texto vacío', { status: 400 });
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.VOZ_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.VOZ_VOICE || 'onyx',
      input: texto,
      instructions: 'Habla en español de México. Voz grave, lenta, casi susurrada, íntima e inquietante, como una grabación VHS vieja encontrada. Pausas largas entre frases. Nada de entusiasmo.',
      response_format: 'mp3'
    })
  });
  if (!r.ok) return new Response('la voz no respondió', { status: 502 });
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
};
