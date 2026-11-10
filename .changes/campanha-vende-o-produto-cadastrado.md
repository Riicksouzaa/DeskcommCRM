---
impacto: capacidade_nova
secao: adicionado
titulo: A campanha de prospecção agora vende o produto que você cadastrou, com um achado do site de cada empresa
---

No bloco **O que esta campanha vende** há um seletor **Produto**. Escolhendo um
produto cadastrado, a primeira mensagem sai montada pelo sistema, sem IA: ela
diz que a empresa foi analisada, cita **um achado** medido no site dela e
pergunta se a pessoa quer conhecer os outros. Se ela aceitar, o agente envia a
segunda mensagem pronta, com cada achado e a solução que **você** escreveu no
produto, sem reescrever. Só entra em mensagem o achado que foi medido e para o
qual o produto tem solução cadastrada; empresa sem nenhum aparece como "Não
abordado", com o motivo. O aviso para parar de receber acompanha **toda**
mensagem. Texto que contenha um termo proibido ou emoji é barrado antes do
envio, não gasta o limite do dia e abre um aviso na Central.

Quando o endereço que o Google mostra como "site" da empresa é, na verdade, uma
plataforma de cardápio e pedidos de terceiros (Saipos, Anota AI, Brendi,
iFood e outras), a auditoria reconhece isso só pelo endereço e passa a tratar como
achado "cardápio numa plataforma de terceiros". Os defeitos da página da
plataforma não são atribuídos à empresa. Para usar o achado, escreva a frase de
solução dele no produto.

Ao iniciar a campanha, o produto é fotografado: editar ou arquivar o produto
depois não muda uma campanha em andamento. A prévia da abordagem mostra as duas
mensagens. Campanha sem produto continua exatamente como antes. A atualização
aplica uma pequena mudança no banco sozinha; não é preciso mexer em nada na VPS.
