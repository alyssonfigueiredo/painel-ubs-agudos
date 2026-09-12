// Worker na frente dos assets estáticos de ./public. Só uma rota é tratada aqui:
// /tts?q=TEXTO — busca o MP3 no endpoint do Google Tradutor DO LADO DO SERVIDOR e
// devolve como áudio da nossa própria origem. Chamar o Google direto do navegador
// falha: com Referer de outra página ele responde erro (corpo não-áudio) e o <audio>
// da recepção dispara NotSupportedError no play(). Pelo Worker não há Referer de
// navegador nem problema de origem. Todo o resto cai nos assets (env.ASSETS).

const TTS_UPSTREAM = 'https://translate.google.com/translate_tts';
const TTS_LANG = 'pt-BR';
const TTS_MAX_CHARS = 200; // limite do endpoint por requisição
const TTS_CACHE_SECONDS = 60 * 60 * 24 * 7;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/tts') return tts(url, ctx);
    return env.ASSETS.fetch(request);
  }
};

async function tts(url, ctx) {
  const texto = (url.searchParams.get('q') || '').trim().slice(0, TTS_MAX_CHARS);
  if (!texto) return new Response('faltou q', { status: 400 });

  // mesma frase → mesmo MP3: cacheia na borda pra não bater no Google a cada "Repetir"
  const cache = caches.default;
  const chave = new Request('https://tts.painel-ubs.local/' + TTS_LANG + '/' + encodeURIComponent(texto));
  const emCache = await cache.match(chave);
  if (emCache) return emCache;

  const upstream = TTS_UPSTREAM + '?ie=UTF-8&client=tw-ob&tl=' + TTS_LANG + '&q=' + encodeURIComponent(texto);
  let res;
  try {
    res = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': 'audio/mpeg,*/*'
      }
    });
  } catch (e) {
    return new Response('falha ao contatar o TTS: ' + e.message, { status: 502 });
  }
  const tipo = res.headers.get('content-type') || '';
  if (!res.ok || !tipo.startsWith('audio/')) {
    return new Response('TTS respondeu ' + res.status + ' ' + tipo, { status: 502 });
  }

  const corpo = await res.arrayBuffer();
  const resposta = new Response(corpo, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(corpo.byteLength),
      'Cache-Control': 'public, max-age=' + TTS_CACHE_SECONDS
    }
  });
  ctx.waitUntil(cache.put(chave, resposta.clone()));
  return resposta;
}
