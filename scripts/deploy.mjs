// Deploy com versão automática: grava public/versao.js com o horário de agora (número
// sempre crescente) e roda o wrangler deploy. Toda tela aberta compara esse número com
// painel/versao no banco e recarrega sozinha quando vê um maior (ver vigiarVersao no
// index.html). O arquivo gerado fica fora do git (.gitignore).
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const versao = Date.now();
writeFileSync('public/versao.js', `window.VERSAO_DEPLOY = ${versao};\n`);
console.log(`versao.js gerado: VERSAO_DEPLOY = ${versao} (${new Date(versao).toLocaleString('pt-BR')})`);

const r = spawnSync('npx', ['wrangler', 'deploy', ...process.argv.slice(2)], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
