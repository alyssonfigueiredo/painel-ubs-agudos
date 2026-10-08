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
// ganho de volume na GERAÇÃO do áudio (dB). A Google aceita de -96 a +16; acima de +10
// começa a distorcer. Aumentar aqui é melhor que amplificar no navegador: o MP3 já sai
// mais alto e a TV continua tocando com <audio> puro, sem mexer no caminho do som.
const TTS_GANHO_PADRAO = 0;
const TTS_GANHO_MAX = 16;
const TTS_CACHE_SECONDS = 60 * 60 * 24 * 30;

// LIMPEZA: todo dia às 18h (horário de Brasília) apaga os chamados com mais de
// RETENCAO_DIAS dias — fica uma janela rolante de histórico, pra dar pra checar o
// funcionamento em /historico e /monitor sem esperar o dia seguinte. Agendado em
// wrangler.jsonc (triggers.crons, em UTC: 21:00). As telas abertas escutam
// child_removed e limpam a lista sozinhas. Teste manual: npx wrangler dev
// --test-scheduled e abrir http://localhost:8787/__scheduled
const DB_CHAMADAS = 'https://painel-ubs-c7992-default-rtdb.firebaseio.com/chamadas.json';
const DB_LIMPEZA = 'https://painel-ubs-c7992-default-rtdb.firebaseio.com/painel/limpeza.json';
const RETENCAO_DIAS = 3;

// cadastro de dispositivos da recepção: passa pelo Worker (em vez do navegador escrever
// direto no Firebase) só pra conseguir anotar o IP de quem pediu — o próprio JS do
// navegador não tem como saber o IP dele. Ajuda a ver se um aparelho da lista está na
// rede da UBS ou em outro lugar. NÃO distingue dois PCs diferentes NA MESMA rede: atrás
// do mesmo roteador/NAT, todos saem com o mesmo IP público pro Cloudflare — então "mesmo
// IP" prova "mesma rede", não "mesmo computador".
const DB_RECEPCAO_DISPOSITIVOS = 'https://painel-ubs-c7992-default-rtdb.firebaseio.com/painel/recepcao_dispositivos';

export default {
  async scheduled(event, env, ctx) {
    const corte = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    const consulta = DB_CHAMADAS + '?orderBy=%22ts%22&endAt=' + corte;
    const busca = await fetch(consulta);
    if (!busca.ok) throw new Error('busca de chamados antigos falhou: ' + busca.status + ' ' + (await busca.text()).slice(0, 200));
    const antigos = await busca.json(); // { chave: {...}, ... } ou null se não tiver nada pra apagar
    const chaves = antigos ? Object.keys(antigos) : [];
    if (chaves.length) {
      const remocao = {};
      chaves.forEach(k => { remocao[k] = null; }); // PATCH com null apaga só essas chaves, preserva o resto
      const res = await fetch(DB_CHAMADAS, { method: 'PATCH', body: JSON.stringify(remocao) });
      if (!res.ok) throw new Error('limpeza de chamados antigos falhou: ' + res.status + ' ' + (await res.text()).slice(0, 200));
    }
    console.log('limpeza diária: ' + chaves.length + ' chamados com mais de ' + RETENCAO_DIAS + ' dias apagados');
    // registro informativo (aparece no /monitor); se a regra não existir, só loga
    const reg = await fetch(DB_LIMPEZA, { method: 'PUT', body: JSON.stringify({ ts: Date.now(), tipo: 'automatica', origem: 'worker', apagados: chaves.length }) });
    if (!reg.ok) console.warn('não gravou painel/limpeza: ' + reg.status);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/tts') return tts(url, env, ctx);
    if (url.pathname === '/recepcao-registro' && request.method === 'POST') return registrarDispositivo(request);
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

// chamado pela recepção a cada batimento (ver anotarDispositivo no index.html). Grava
// ua + ip + ts em painel/recepcao_dispositivos/<id>; o id é escolhido pelo navegador
// (localStorage, fixo por aparelho) e só serve de chave, não é segredo nenhum.
async function registrarDispositivo(request) {
  let corpo;
  try { corpo = await request.json(); } catch (e) { return erro(400, 'corpo inválido'); }
  const id = String(corpo.id || '').slice(0, 60);
  if (!id) return erro(400, 'faltou id');
  const ua = String(corpo.ua || '').slice(0, 160);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const res = await fetch(DB_RECEPCAO_DISPOSITIVOS + '/' + encodeURIComponent(id) + '.json', {
    method: 'PUT',
    body: JSON.stringify({ ua, ip, ts: Date.now() })
  });
  if (!res.ok) return erro(502, 'falha ao gravar dispositivo: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
}

async function tts(url, env, ctx) {
  const texto = (url.searchParams.get('q') || '').trim().slice(0, TTS_MAX_CHARS);
  if (!texto) return erro(400, 'faltou q');
  // g = ganho em dB, pra testar volume sem tocar no resto (ex.: /tts?q=oi&g=6)
  const pedido = parseFloat(url.searchParams.get('g'));
  const ganho = Number.isFinite(pedido) ? Math.max(-96, Math.min(TTS_GANHO_MAX, pedido)) : TTS_GANHO_PADRAO;
  // trim: colar a chave no terminal costuma trazer quebra de linha/espaço no fim
  const chaveApi = (env.GOOGLE_TTS_KEY || '').trim();
  if (!chaveApi) return erro(503, 'GOOGLE_TTS_KEY não configurada (npx wrangler secret put GOOGLE_TTS_KEY)');

  const cache = caches.default;
  // o ganho entra na chave do cache: sem isso, pedir outro volume devolveria o antigo
  const chave = new Request('https://tts.painel-ubs.local/' + TTS_VOZ + '/g' + ganho + '/' + encodeURIComponent(texto));
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
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, volumeGainDb: ganho }
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
