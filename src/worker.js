// Worker na frente dos assets estáticos de ./public. Só uma rota é tratada aqui:
// /tts?q=TEXTO — gera o MP3 na Google Cloud Text-to-Speech (voz masculina Chirp 3 HD
// "Orus") DO LADO DO SERVIDOR, com a chave guardada como secret (GOOGLE_TTS_KEY), e
// devolve como áudio da nossa própria origem. Cota grátis: 1 milhão de caracteres/mês;
// mesma frase é servida do cache da borda sem gastar de novo. Se a chave faltar, a cota
// estourar ou a API falhar, responde 5xx e a recepção cai na voz do navegador.
// Todo o resto cai nos assets (env.ASSETS).

const TTS_API = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';
const TTS_LANG = 'pt-BR';
const TTS_VOZ = 'pt-BR-Chirp3-HD-Orus';
const TTS_MAX_CHARS = 200;
const TTS_CACHE_SECONDS = 60 * 60 * 24 * 30;

// LIMPEZA: todo dia às 18h (horário de Brasília) apaga TODOS os chamados do banco —
// nome de paciente não fica guardado além do dia. Agendado em wrangler.jsonc
// (triggers.crons, em UTC: 21:00). As telas abertas escutam child_removed e limpam
// a lista sozinhas. Teste manual: npx wrangler dev --test-scheduled e abrir
// http://localhost:8787/__scheduled
const DB_CHAMADAS = 'https://painel-ubs-c7992-default-rtdb.firebaseio.com/chamadas.json';

export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(DB_CHAMADAS, { method: 'DELETE' });
    if (!res.ok) throw new Error('limpeza de chamadas falhou: ' + res.status + ' ' + (await res.text()).slice(0, 200));
    console.log('limpeza diária: chamadas/ apagado');
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/tts') return tts(url, env, ctx);
    // versao.js muda a cada deploy: se o navegador guardasse uma cópia velha, a tela
    // recarregaria e continuaria se achando desatualizada
    if (url.pathname === '/versao.js') {
      const res = await env.ASSETS.fetch(request);
      const semCache = new Response(res.body, res);
      semCache.headers.set('Cache-Control', 'no-store');
      return semCache;
    }
    return env.ASSETS.fetch(request);
  }
};

function erro(status, msg) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function tts(url, env, ctx) {
  const texto = (url.searchParams.get('q') || '').trim().slice(0, TTS_MAX_CHARS);
  if (!texto) return erro(400, 'faltou q');
  // trim: colar a chave no terminal costuma trazer quebra de linha/espaço no fim
  const chaveApi = (env.GOOGLE_TTS_KEY || '').trim();
  if (!chaveApi) return erro(503, 'GOOGLE_TTS_KEY não configurada (npx wrangler secret put GOOGLE_TTS_KEY)');

  const cache = caches.default;
  const chave = new Request('https://tts.painel-ubs.local/' + TTS_VOZ + '/' + encodeURIComponent(texto));
  const emCache = await cache.match(chave);
  if (emCache) return emCache;

  let res;
  try {
    res = await fetch(TTS_API + '?key=' + encodeURIComponent(chaveApi), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: texto },
        voice: { languageCode: TTS_LANG, name: TTS_VOZ },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 }
      })
    });
  } catch (e) {
    return erro(502, 'falha ao contatar a Google TTS: ' + e.message);
  }
  if (!res.ok) {
    const corpo = await res.text();
    // 429 = cota do mês estourada; 403 = API desativada/faturamento off; 400 = chave inválida
    return erro(502, 'Google TTS ' + res.status + ' (chave com ' + chaveApi.length + ' caracteres, começa com ' + chaveApi.slice(0, 4) + '): ' + corpo.slice(0, 300));
  }
  const json = await res.json();
  if (!json.audioContent) return erro(502, 'Google TTS sem audioContent');
  const bin = atob(json.audioContent);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const resposta = new Response(bytes, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=' + TTS_CACHE_SECONDS
    }
  });
  ctx.waitUntil(cache.put(chave, resposta.clone()));
  return resposta;
}
