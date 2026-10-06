# Painel de chamada — UBS Francisca de Oliveira Silva

Site: `https://painel-ubs.soaperando.com.br`

## Endereços

| Tela | Endereço |
|---|---|
| Escolha de sala | `/` |
| TV da recepção | `/recepcao` |
| Consultórios | `/01` `/02` `/03` `/04` |
| Outras salas | `/odontologia` `/nutricao` `/enfermagem` `/triagem` `/vacina` `/medicacao` |
| Monitor (só leitura, para acompanhar de fora sem mexer na TV) | `/monitor` |
| Histórico do dia, com filtro por sala (só leitura) | `/historico` |

Abrir o endereço da sala já entra nela sem clicar. F5 mantém a sala; uma aba nova cai na escolha.

## TV da recepção (checklist de instalação)

1. Chrome com página inicial `https://painel-ubs.soaperando.com.br/recepcao`.
2. Ao abrir, clicar uma vez em "Clique aqui para ativar o som" (o Chrome exige um clique
   para liberar áudio). Depois disso a TV fala sozinha o dia inteiro.
3. Para nem precisar do clique (TV liga e já fala), criar o atalho do Chrome com:
   `--autoplay-policy=no-user-gesture-required --kiosk https://painel-ubs.soaperando.com.br/recepcao`
4. Desativar suspensão/protetor de tela do PC da TV.
5. Volume do PC e da TV no máximo; o painel não controla volume.
6. Só UMA tela de recepção por vez. Uma segunda mostra aviso e só assume se alguém clicar.

Botões do rodapé (para quem opera): Silenciar voz · Limpar chamados · Trocar tela / sala.
Tecla `D` na TV mostra/esconde o diagnóstico; no console, `painelLog()` lista o histórico.

## Consultórios

Digitar o nome, Enter ou "Chamar". A TV anuncia 2x. Pode chamar mesmo com a TV
anunciando o paciente de outra sala: os chamados entram numa fila e são anunciados em
sequência (a TV mostra "N na fila"). A própria sala fica travada do envio até a TV
terminar de anunciar o chamado dela: o botão mostra "Na fila..." e depois
"Anunciando...". Na prática são poucos segundos: solta assim que a TV termina o
anúncio. Se nenhuma TV estiver ativa, solta em 5s; se a TV estiver aberta mas parar de
responder, em 25s.
Mesma sala aberta em dois PCs: a segunda fica bloqueada até alguém clicar
"Assumir nesta tela".

## Histórico do dia

`/historico` lista tudo que foi chamado hoje, do mais recente para o mais antigo, com
hora, nome e sala. Os chips filtram por sala e mostram quantos chamados cada uma teve;
"Copiar lista" copia o que está filtrado em ordem cronológica. Só leitura: não grava
nada, não entra na trava de papel e não interfere na TV. O monitor tem um botão que leva
até lá e o histórico tem um de volta.

A lista mostra só hoje (filtra por data), mas o banco guarda os últimos 3 dias de
chamados — dá pra checar o funcionamento sem esperar virar o dia. A limpeza
automática das 18h apaga só o que passou de 3 dias; "Limpar chamados" apaga tudo
na hora, nas duas situações.

## Diagnóstico de som à distância

O `/monitor` mostra um card "Áudio da TV" com o que aconteceu na última fala: se saiu pela
voz Google (Orus) ou caiu na voz do navegador, o nível medido do áudio (pico e média),
a duração e o erro, quando houver. Nenhum nome de paciente vai para esse relatório.

Os botões "Testar som" tocam uma frase curta na recepção e devolvem o nível medido, com
ganho de 0, 6 ou 10 dB. Servem para decidir o volume sem ninguém mexer na TV. Se o pico
medido estiver perto de 0 dB, o áudio já vai no máximo e o volume baixo é do equipamento
(mixer por aplicativo do Windows, modo de som da TV, saída HDMI).

O card mostra também o navegador da TV e se o som está liberado nela, e tem um botão
"Recarregar a TV", útil se a tela travar. Recarregar não conserta o som barrado: depois
dela pode ser preciso um clique na TV.

Para mudar o volume de vez, a rota `/tts` aceita `&g=<dB>` (até 16) e a TV usa a constante
`GANHO_VOZ_DB` no index.html.

### Quando o relatório diz "voz do navegador" com play() barrado

`NotAllowedError` significa que o navegador da TV recusou tocar o áudio. A voz da Google
chegou, mas não pôde ser reproduzida, e a TV caiu na voz do navegador, que é mais baixa.
A TV usa um único elemento de áudio, liberado no primeiro clique, e se ele for barrado usa
o áudio de fundo, que já está tocando. Se as duas tentativas falharem, o aviso "Clique
aqui para ativar o som" volta a aparecer na TV.

Resolve com um clique na tela da TV, ou liberando Som (e Reprodução automática, no Edge)
nas permissões do site, no cadeado ao lado do endereço.

## Tema de outubro (Outubro Rosa)

Durante todo o mês de outubro o painel troca as cores para a campanha (fundo rosa claro,
cards brancos, detalhes em rosa) e mostra uma faixa "OUTUBRO ROSA · Faça o autoexame.
Procure a UBS." no topo da TV, dos consultórios e da tela de escolha de sala. Em 1 de
novembro volta ao tema normal sozinho, sem deploy: quem decide é a data da própria tela
(`aplicarTemaSazonal`, chamada junto do relógio).

São só cores e a faixa; nenhuma regra de chamada, fila, voz ou limpeza muda. Para trocar
a frase, editar `.fc-s` no index.html (os três blocos `faixa-campanha`). O monitor e o
histórico também ficam claros no mês, mas sem a faixa.

## Privacidade

Os chamados ficam guardados no banco por até 3 dias (RETENCAO_DIAS em
src/worker.js): todo dia às 18h (horário de Brasília) o que passou desse prazo é
apagado, e "Limpar chamados" em qualquer tela apaga tudo na hora. Nome de
paciente não fica guardado além desse prazo.

## Deploy

```
git checkout main && git pull
npm run deploy
```

Gera a versão automaticamente e as telas abertas recarregam sozinhas. Chave da voz
Google (Orus) fica no Cloudflare: `npx wrangler secret put GOOGLE_TTS_KEY`. Se a voz Google
falhar (cota, chave), a TV usa a voz do navegador.
