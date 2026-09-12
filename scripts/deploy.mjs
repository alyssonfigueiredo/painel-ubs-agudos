// Deploy com versão automática: grava public/versao.js com o horário de agora (número
// sempre crescente) e roda o wrangler deploy. Toda tela aberta compara esse número com
// painel/versao no banco e recarrega sozinha quando vê um maior (ver vigiarVersao no
// index.html). O arquivo gerado fica fora do git (.gitignore).
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const versao = Date.now();
writeFileSync('public/versao.js', `window.VERSAO_DEPLOY = ${versao};\n`);
console.log(`versao.js gerado: VERSAO_DEPLOY = ${versao} (${new Date(versao).toLocaleString('pt-BR')})`);

// comando em string única com shell: no Windows, spawn de npx.cmd sem shell dá EINVAL
// (Node >= 18.20); string sem array de args não dispara o aviso DEP0190
const extra = process.argv.slice(2).map(a => /[\s"]/.test(a) ? JSON.stringify(a) : a).join(' ');
const r = spawnSync('npx wrangler deploy' + (extra ? ' ' + extra : ''), { stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

// Avisa as telas abertas na hora: grava a versão nova em painel/versao. Sem isso, a
// recarga só dispararia quando alguém abrisse o site do zero (a 1ª tela com a versão
// nova é quem grava) — e a TV ficava na versão velha até alguém dar F5.
const DB_URL = 'https://painel-ubs-c7992-default-rtdb.firebaseio.com/painel/versao.json';
try {
  const res = await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(versao) });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
  console.log('painel/versao gravado no Firebase: as telas abertas vão recarregar sozinhas.');
} catch (e) {
  console.warn('Deploy OK, mas não consegui gravar painel/versao no Firebase (' + e.message + '). As telas só atualizam quando alguém recarregar uma delas.');
}
