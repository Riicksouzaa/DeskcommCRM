---
impacto: capacidade_nova
secao: adicionado
titulo: Escreva as mensagens da prospecção direto no produto, sem depender de código
---

Na tela **Produtos da prospecção** há agora os campos **Mensagem 1** e **Mensagem 2**.
Você escreve o que a campanha diz, com marcadores entre chaves que o sistema troca por
empresa: `{empresa}`, `{assina}`, `{produto}`, `{resumo}`, `{link_demo}`, `{prova}`,
`{achado}` e `{solucao}`. Um texto que não usa `{achado}` nem `{solucao}` serve a qualquer
empresa, mesmo sem site ou com o site barrando a nossa medição, e abre a conversa
apresentando direto o produto, com o link de um exemplo. Deixando os campos vazios, vale o
texto padrão que cita um achado do site, como antes. O aviso para parar de receber é sempre
acrescentado pelo sistema, termo proibido e emoji continuam barrando o envio, e a ativação
da campanha confere o texto (marcador inexistente, link que falta) antes de começar.
Mudar o que a campanha diz passa a ser editar o produto. A atualização aplica duas colunas
novas no banco sozinha; não é preciso mexer em nada na VPS.
