---
impacto: nada_mudou
secao: corrigido
titulo: Criar a conta pelo convite não trava mais quando o servidor de e-mail demora
---

Com o cadastro aberto **só por convite**, quem clicava em **Criar minha conta** esperava o serviço de login enviar o e-mail de confirmação. Com um servidor de e-mail lento (medido: cerca de 30 segundos para aceitar a mensagem), a tela desistia e mostrava **"Não recebemos a resposta do servidor"**. Do lado do servidor, a conta era apagada, às vezes depois de o e-mail já ter saído, e o link que chegava não funcionava mais.

Agora a conta é criada na hora e a tela responde em seguida com **"Confirme seu e-mail"**. O e-mail de confirmação sai pelo envio de e-mails do próprio CRM (**Admin › E-mail**), com o tempo que o servidor de e-mail precisar. Se o envio falhar, a conta fica de pé e o registro vai para a auditoria (`auth.signup_failed`). Basta a pessoa tentar de novo para receber um link novo, sem cair em "conta já existe". Instalação sem envio de e-mails configurado no CRM segue pelo caminho anterior.

Nada a fazer na instalação.
