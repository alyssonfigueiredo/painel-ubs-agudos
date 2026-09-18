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

## Diagnóstico de som à distância

O `/monitor` mostra um card "Áudio da TV" com o que aconteceu na última fala: se saiu pela
voz Google (Orus) ou caiu na voz do navegador, o nível medido do áudio (pico e média),
a duração e o erro, quando houver. Nenhum nome de paciente vai para esse relatório.

Os botões "Testar som" tocam uma frase curta na recepção e devolvem o nível medido, com
ganho de 0, 6 ou 10 dB. Servem para decidir o volume sem ninguém mexer na TV. Se o pico
medido estiver perto de 0 dB, o áudio já vai no máximo e o volume baixo é do equipamento
(mixer por aplicativo do Windows, modo de som da TV, saída HDMI).

Para mudar o volume de vez, a rota `/tts` aceita `&g=<dB>` (até 16) e a TV usa a constante
`GANHO_VOZ_DB` no index.html.

## Privacidade

Os chamados são apagados do banco todo dia às 18h (horário de Brasília) e por
"Limpar chamados" em qualquer tela. Nada fica guardado além do dia.

## Deploy

```
git checkout main && git pull
npm run deploy
```

Gera a versão automaticamente e as telas abertas recarregam sozinhas. Chave da voz
Google (Orus) fica no Cloudflare: `npx wrangler secret put GOOGLE_TTS_KEY`. Se a voz Google
falhar (cota, chave), a TV usa a voz do navegador.
