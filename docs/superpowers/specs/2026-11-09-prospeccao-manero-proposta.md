# Proposta: prospecção "valor primeiro" para a Manero

> **⚠ SUBSTITUÍDA em 09/11/2026** por `2026-11-09-prospeccao-valor-primeiro-generica.md`. O Ricardo
> mudou o rumo: a funcionalidade é **genérica** (vários clientes, não só a Manero), todo o
> acompanhamento é **no CRM** (sem planilha), o PDF é **gerado pela IA durante o atendimento** e o
> cliente **cria a conta sozinho** pelo link. Este arquivo fica como histórico.
>
> (Status anterior: aprovada em 09/11/2026 com as 11 escolhas da §14 e a regra "sem emoji".)
> Data: 09/11/2026. Autor: sessão Claude com o Ricardo.
> **Histórico e racional completo:** `2026-11-09-prospeccao-pipeline-valor-primeiro-RASCUNHO.md`
> (as decisões D1 a D14 estão na §23 dele; o mapa do código, na §24).
> **Como ler este documento:** tudo que estava em aberto foi preenchido com a opção recomendada.
> Cada escolha feita assim está marcada com **[R]** e listada na §14, onde você aprova ou troca.

---

## 0. Resumo em uma página

- **O quê:** o CRM encontra pizzarias e hamburguerias de Goiânia e Aparecida de Goiânia, analisa o
  que um cliente vê delas pelo celular, e a **Dani** (assistente virtual da Manero) oferece essa
  análise em PDF pelo WhatsApp. Quem aceita recebe o PDF e a oferta de **criar o cardápio na hora,
  grátis**; depois, o teste de 7 dias do Essencial leva à assinatura.
- **Meta:** venda direta. Conversão principal medida: **conta criada → teste iniciado → assinou**.
- **Regras de respeito:** no máximo **2 mensagens** a quem não responde; saída "**SAIR**" desde a
  primeira; envios e atendimento humano **08h-18h**; só manda quem tem **2 ou mais achados
  verificados**; nada de promessa que a Manero não cumpre.
- **Medição:** cada contato tem linha do tempo com marcos; funil por **coorte de semana**,
  por **variante** e por **achado**; freio automático do número.
- **Como começa:** Fase 0 com ~50 empresas, PDF montado e enviado por uma pessoa, para validar
  texto, PDF e objeções. Só depois se constrói o automático.

## 1. Objetivo e metas

| Nível | Meta | Como se mede |
|---|---|---|
| Principal | **Assinatura paga** da Manero vinda da prospecção | Marco `assinou` devolvido pela Manero |
| Intermediária | **Teste de 7 dias iniciado** (cartão informado) | Marco `teste_iniciado` devolvido pela Manero |
| Intermediária | **Conta criada** pelo cadastro assistido | Etapa "Conta criada", que a Manero já move |
| Secundária | Reunião marcada com o Ricardo | Marco `reuniao_marcada` |
| Restrição | Saúde do número (sem banimento) | Taxa de "SAIR", falhas, sessão restrita |

## 2. Público e recorte

- **Onde:** Goiânia e Aparecida de Goiânia (DDD 62).
- **Quem:** categorias do Maps "Pizzaria" e "Hamburgueria" **[R]**. Motivo: a Manero já tem modelo de
  categorias para esses dois segmentos (a conta nasce com o cardápio organizado), delivery casa com
  a tabela de preço por canal, e o dono costuma estar no balcão.
- **Fica de fora na Fase 0 [R]:**
  - quem **já usa cardápio digital** de outra plataforma (ex.: o site é um Goomer, que a auditoria já
    reconhece). Motivo: começar onde a dor é maior e não abrir guerra de troca de fornecedor; o número
    dessas empresas vira dado do funil;
  - rede ou franquia (mais de uma unidade): vai para humano, como a Manero já faz;
  - quem já é contato do CRM ou já foi anonimizado (o produto já exclui).
- **Como chegar ao volume:** a busca devolve até 100 empresas por vez, então fatiamos por **bairro e
  tipo**; o telefone único por organização evita duplicar.

## 3. Coleta de dados (o que o sistema descobre de cada empresa)

| Dado | Fonte | Existe hoje? |
|---|---|---|
| Nome, telefone, categoria, endereço, nota, nº de avaliações, site, redes | Busca do Maps (Apify ou Scavio) | Sim |
| O site abre? É seguro? Funciona no celular? É lento? É construtor pronto? É só Instagram/Linktree? | Auditoria de site (spec 24) | Sim |
| O site tem WhatsApp, telefone, mapa, fotos, título, descrição? | Checklist da auditoria | Sim |
| Tem WhatsApp no número? | Conferência opcional de WhatsApp | Sim (módulo opcional) |
| **O site tem cardápio legível?** (texto com preço × só imagem × PDF × nenhum) | Leitura do HTML | **Não, novo** |
| **Link para iFood/delivery** e **cardápio digital de concorrente** | Leitura do HTML e domínios | **Parcial** (Goomer é reconhecido como construtor) |
| Quantidade aproximada de pratos | Só se o cardápio for legível | **Não, novo**; nunca inventar |
| **Nome do dono** | CNPJ (rodapé do site ou base da Receita) + quadro de sócios | **Não, Fase posterior (F6)**, depois do parecer jurídico |

Regra que já vale no código e continua valendo: **só é citável o que foi medido e é definitivo**
(`citavelNoArgumento`). Resultado provisório (timeout, rede instável) não vira argumento.

## 4. Catálogo de achados (restaurante)

Cada achado tem um código fixo, um jeito de detectar e uma frase do ponto de vista **do cliente do
restaurante** **[R]**. Só entra o que a Manero resolve de verdade.

| Código | Detecta quando | Frase no PDF ("o que vimos" / "o que isso causa") | Como a Manero resolve | Peso |
|---|---|---|---|---|
| `sem_cardapio_proprio` | Sem site, ou o "site" é Instagram/Facebook/Linktree | "No Google, o link de vocês leva para o Instagram, não para um cardápio." / "Quem quer ver o preço precisa mandar mensagem e esperar." | Cardápio com link e QR próprios | 3 |
| `cardapio_em_imagem` | Site existe, mas o cardápio é foto ou PDF | "O cardápio está em imagem/PDF." / "No celular, é preciso dar zoom e não dá para buscar um prato." | Categorias, fotos e preços navegáveis | 3 |
| `site_sem_cardapio` | Site existe e não tem cardápio | "O site não mostra o cardápio." / "O cliente sai do site sem saber o que pedir." | Cardápio pronto para pôr no site e no Instagram | 3 |
| `site_fora_do_ar` | Site não responde / domínio morto | "O site cadastrado no Google não abre." / "Quem clica desiste." | Cardápio sempre no ar | 3 |
| `site_inseguro` | Sem HTTPS ou certificado inválido | "O navegador mostra aviso de 'não seguro' no site." / "Parte dos clientes fecha a página." | Link seguro da Manero | 2 |
| `nao_mobile` | Página sem adaptação ao celular | "O site não foi feito para o celular." / "Fica pequeno e difícil de usar." | Cardápio feito para celular | 2 |
| `lento` | Tempo de carregamento acima do limite | "O site demora para abrir no celular." / "Cada segundo a mais perde gente." | Cardápio leve | 1 |
| `sem_whatsapp_no_site` | Checklist não achou WhatsApp | "O site não tem botão de WhatsApp." / "Quem quer pedir precisa procurar o número." | Pedido pronto que vai para o WhatsApp do restaurante | 2 |
| `demanda_sem_canal` | Muitas avaliações no Maps **e** sem cardápio próprio | "Vocês têm {N} avaliações no Google, sinal de muito movimento, mas nenhum cardápio próprio para esse público." | Link e QR na mesa, no Instagram e no Google | 2 |

**Regras:**
- **Elegível** = 2 ou mais achados citáveis. Senão, não há mensagem.
- O PDF mostra de **3 a 5** achados, do **peso maior para o menor**; a Msg 1 cita a quantidade; o
  lembrete cita o **segundo** achado.
- **Proibido citar:** comissão do iFood, falar mal de concorrente, "tempo real", pedido/checkout
  dentro da Manero, número de outros clientes da Manero, qualquer dado não medido.
- Achado `cardapio_digital_concorrente` existe só para **excluir** a empresa na Fase 0.

## 5. O PDF da análise

**Decisões [R]:** 2 páginas; achados do ponto de vista do cliente do restaurante; na página 2, uma
imagem de exemplo de cardápio Manero do segmento com o nome do restaurante no topo (sem pratos
reais, para não errar preço).

**Página 1, diagnóstico**
- Cabeçalho: "Análise do cardápio online · {Restaurante} · preparada pela Manero"
- Abertura: "Olhamos o que um cliente encontra quando procura vocês pelo celular."
- 3 a 5 blocos: **O que vimos** / **O que isso causa** / **Como resolver**.

**Página 2, o caminho**
- "Como ficaria": imagem de exemplo do segmento, com o nome deles.
- O que vem no grátis, sem cartão (Vitrine, até 10 pratos), e o teste de 7 dias do Essencial
  (150 pratos, desempenho completo; cartão para ativar, cobra só depois dos 7 dias se continuar).
- Passo único: "Responda a mensagem e eu crio seu cardápio agora."
- Rodapé: "Feito a partir de informações públicas (Google e site do restaurante), em {data}. Não
  quer receber nossas mensagens? Responda SAIR."

**Exemplo preenchido (restaurante FICTÍCIO, só para ilustrar o tom):**
> **Pizzaria Exemplo** · Análise do cardápio online · preparada pela Manero
>
> 1. **O que vimos:** no Google, o link de vocês leva para o Instagram.
>    **O que isso causa:** quem quer ver o preço precisa mandar mensagem e esperar.
>    **Como resolver:** um cardápio com link próprio, com preço e foto de cada pizza.
> 2. **O que vimos:** vocês têm 480 avaliações no Google.
>    **O que isso causa:** muita gente chega até vocês, mas não encontra um cardápio para escolher.
>    **Como resolver:** um QR na mesa e o link no Instagram e no Google.

**Técnica:** gerado **depois do "SIM"** com `@react-pdf/renderer` (já usado no projeto), guardado
no Storage e enviado por URL assinada. **Na Fase 0, montado por uma pessoa** a partir do mesmo
modelo.

## 6. Pipeline de mensagens

### 6.1 Sequência e tempos
```
D0  Msg 1 (abertura, com SAIR)
     ├─ "SIM" ───────────────► Msg 2 (PDF + oferta de cadastro)
     ├─ SAIR/PARE ───────────► bloqueado; fim
     ├─ outra resposta ──────► Dani conversa
     └─ silêncio
D3  Lembrete único (com SAIR), só se não respondeu
     ├─ "SIM" ───────────────► Msg 2
     └─ silêncio ────────────► FIM (2 envios no total; etapa "Sem resposta")

Depois da Msg 2:
     ├─ topa ──► coleta nome, e-mail, CNPJ ─► "Criando restaurante" ─► Manero cria ─► "Conta criada"
     │                                                          └─► "Falha no cadastro" ─► humano
     ├─ dúvida/objeção ─► Dani responde (§7) ─► até 2 rodadas sem avanço ─► caso para humano
     └─ silêncio ──► 1 retomada em D+2 [R] (a pessoa pediu o PDF) ─► silêncio ─► FIM

"Conta criada" ─► mensagem de boas-vindas com link do cardápio e um passo único
               ─► Manero avisa "Em teste" / "Assinante" (D14)
```
Todos os envios só dentro de **08h-18h**, nos dias da prospecção da conexão. Lembrete que cairia
fora da janela espera a próxima abertura.

### 6.2 Textos v1
(Os mesmos da §23.3 do rascunho, com o ajuste do cadastro assistido.)

**Sem emoji, em nenhuma mensagem** (decisão do Ricardo, 09/11/2026: a Manero é uma empresa séria,
e emoji dá cara de IA e converte mal). Vale para os textos fixos, para a Dani e para o PDF. Como a
instrução no prompt não garante que o modelo obedeça, a F2 inclui uma **trava no envio** que tira
emoji do texto da Dani antes de sair. O código já tem uma remoção de emoji para a resposta em áudio
(`textoFalavel`, citada em `lib/agent-engine/agent/voz-do-turno.ts`), que pode servir de base.

**Msg 1**
> Oi, tudo bem? Aqui é a Dani, assistente virtual da Manero, plataforma de cardápio digital para
> restaurantes.
>
> Preparei uma análise do cardápio online da **{Restaurante}** e encontrei **{N} pontos** que podem
> estar afastando clientes que chegam pelo celular.
>
> Quer que eu envie o PDF? É só responder **SIM**.
>
> Se não for o momento, responda **SAIR** e eu não te chamo mais.

**Lembrete (D3)**
> Oi! Só voltando: a análise da **{Restaurante}** continua pronta. Um exemplo do que ela mostra:
> {achado 2, em uma frase}.
>
> Quer receber? Responda **SIM**. Se preferir encerrar, responda **SAIR**.

**Msg 2 (após SIM)**
> Segue em anexo a análise feita pela Manero para a **{Restaurante}**.
>
> Resumo: **1)** {achado 1} **2)** {achado 2} **3)** {achado 3}
>
> Posso criar o cardápio da {Restaurante} agora, já organizado como {pizzaria/hamburgueria}. É grátis
> e sem cartão. Preciso só do seu **nome**, **e-mail** e **CNPJ**. Pode ser?

**Retomada pós-PDF (D+2, uma vez) [R]**
> Oi! Conseguiu olhar a análise? Se quiser, crio o cardápio da {Restaurante} em poucos minutos, é
> só me mandar nome, e-mail e CNPJ. Se não for agora, tudo bem.

**Boas-vindas (após "Conta criada")**
> Pronto! O cardápio da {Restaurante} está criado: {link do cardápio}. Mandei um e-mail para você
> criar a senha. O próximo passo é cadastrar as primeiras pizzas; se quiser, te mostro como.

**Convite ao teste (quando a pessoa já cadastrou pratos ou perguntou por mais) [R]**
> Se quiser ter até 150 pratos e ver quem visita o cardápio, dá para testar o Essencial por 7 dias.
> Para ativar, a Manero pede o cartão, e **só cobra depois dos 7 dias, se você continuar**; dá para
> cancelar antes no painel.

### 6.3 Etapas do funil no CRM [R]
| Etapa | Quem move |
|---|---|
| Abordado | Campanha (no envio) |
| Respondeu | Dani / regra de resposta |
| Análise enviada | Fluxo, ao mandar o PDF |
| Criando restaurante | Fluxo, ao completar a coleta |
| Conta criada | Manero (já existe) |
| Em teste | Manero (D14, novo) |
| Assinante | Manero (D14, novo) |
| Falha no cadastro | Manero (já existe); abre caso |
| *Perda:* Sem resposta · Saiu · Não é o momento · Decisor não encontrado | Fluxo / Dani, com motivo |

## 7. Persona: Dani

### 7.1 Rascunho do prompt
```
Você é a Dani, assistente virtual da Manero, plataforma de cardápio digital para restaurantes.
Você fala com donos e equipes de pizzarias e hamburguerias que receberam uma análise do cardápio
online deles. Fale em português do Brasil, com frases curtas, tom de consultora clara e
profissional, sem pressão. NUNCA use emoji, em nenhuma mensagem.

OBJETIVO: ajudar o restaurante a resolver o que a análise mostrou, criando o cardápio dele na
Manero agora (grátis, sem cartão) e, quando fizer sentido, apresentando o teste de 7 dias do
Essencial. Um próximo passo por mensagem.

O QUE A MANERO É: cardápio digital aberto por QR ou link, sem app; o dono atualiza preço e
esgotado pelo painel; tabelas de preço por canal; o cliente monta o pedido e manda uma mensagem
pronta para o WhatsApp do restaurante. A Manero NÃO tem pagamento no cardápio, PDV, integração
com iFood nem robô de pedidos. Nunca prometa isso.

PLANOS (não invente outros valores): Vitrine grátis, sem cartão, até 10 produtos. Essencial
R$ 69/mês (cerca de R$ 55/mês no anual), até 150 produtos, desempenho completo, 7 dias grátis com
cartão (cobra só depois dos 7 dias, se continuar). Profissional R$ 129/mês, até 1000 produtos,
equipe de 5, vídeo. Rede/franquia: proposta com uma pessoa.

COMO CONVENCER: use os achados da análise DESTE restaurante; pergunte sobre a situação deles
("hoje o cliente vê o preço antes de pedir?", "quanto tempo leva para trocar um preço?"); mostre
o ganho concreto; peça um passo pequeno. Nunca use urgência falsa, desconto inventado ou depoimento.

CADASTRO: peça nome, e-mail e CNPJ, um por vez se a pessoa hesitar. Nunca peça senha nem cartão
no WhatsApp; o cartão do teste é informado no painel da Manero.

OBJEÇÕES: já tenho iFood/Instagram → é um complemento, um link e QR seus; é caro → comece grátis;
cartão é pegadinha? → explique a regra dos 7 dias com clareza; sem tempo → importar o cardápio e
ajudar passo a passo; vou falar com o sócio → ofereça reenviar o PDF; não sou o dono → peça nome
e melhor horário do responsável.

PASSE PARA UMA PESSOA (request_human_handoff) quando: pedirem uma pessoa; for rede/franquia ou
mais de uma unidade; houver problema de cobrança, cartão ou cadastro; pedirem reunião; você não
souber a resposta; houver 2 rodadas de objeção sem avanço; houver irritação. Avise que o time
responde das 8h às 18h.

SE PEDIREM PARA PARAR: não responda nada além do que o sistema já envia. SE PERGUNTAREM SE VOCÊ É
ROBÔ: diga que é a assistente virtual da Manero e ofereça uma pessoa. FORA DO ASSUNTO: recuse com
gentileza e volte ao cardápio.
```

### 7.2 Base de conhecimento
Reaproveitar `manero_catalog/.knowledge` (planos, limites, links oficiais, FAQ, política da casa)
**copiando** para a base do agente na Fase 0 **[R]**, com revisão a cada mudança de preço. A
sincronização automática vira tarefa futura.

## 8. Cadastro assistido e retorno da Manero

- **Já existe** (descrito em `manero_catalog/docs/api/deskcomm-provisioning.md`): o card em
  "Criando restaurante" dispara o webhook; a Manero cria usuário, restaurante (Vitrine) e categorias
  do segmento, manda o e-mail de senha e move o card para "Conta criada" ou "Falha no cadastro".
- **Configuração necessária no CRM:** as etapas, os campos `nome_completo`, `nome_do_restaurante`,
  `cpf_cnpj`, `tipo_de_estabelecimento`, `segmento`, `cidade`, `uf`, `numero_de_unidades`, os campos
  `manero_*`, o token `dsk_` com escrita e o segredo do webhook.
- **Novo na Manero (D14):** quando a assinatura vira `trialing` → mover para "Em teste"; quando vira
  `active` → "Assinante"; usando a ligação restaurante ↔ lead que a tabela `deskcomm_provisioning`
  já guarda.

## 9. Medição

### 9.1 O que a literatura exige (base da escolha)
Atividade e resultado medidos separados, com o resultado lido semanas depois (Blount); taxa em cada
degrau e a passagem para quem fecha medida à parte (Ross); qual lacuna move a pessoa (Keenan);
qualidade da conversa por objeção (SPIN, Challenger, Voss); estoque de empresas para repor o funil
(Blount).

### 9.2 Marcos por contato (vocabulário fechado)
| Marco | Fonte |
|---|---|
| `elegivel` / `inelegivel:<motivo>` | Preparo da campanha |
| `variante:<id>` | Sorteio na entrada da fila |
| `msg1_enviada`, `lembrete_enviado`, `retomada_enviada` | Envio |
| `respondeu` | Derivado da primeira mensagem recebida |
| `aceitou_analise` | Fluxo, ao casar "SIM" |
| `pdf_enviado` | Fluxo |
| `dados_coletados` | Fluxo, ao fechar a coleta |
| `conta_criada` / `falha_cadastro:<código>` | Manero (etapa) |
| `teste_iniciado`, `assinou` | Manero (D14) |
| `pediu_humano`, `reuniao_marcada` | Dani / handoff |
| `objecao:<preco|cartao|ifood|tempo|socio|outro>` | Dani (etiqueta revisável) |
| `saiu`, `silencio_final`, `decisor_nao_encontrado` | Ingestão / fluxo / Dani |

Cada marco guarda data e hora, e o achado principal usado. Os que o sistema já sabe são
**derivados**; os outros são **gravados** (caminho híbrido, D10).

### 9.3 Indicadores
| Indicador | Conta |
|---|---|
| Elegibilidade | elegíveis ÷ empresas buscadas |
| Resposta | respondeu ÷ msg1 enviadas (e quanto veio do lembrete) |
| Aceite | aceitou_analise ÷ respondeu |
| Cadastro | conta_criada ÷ pdf_enviado |
| Teste | teste_iniciado ÷ conta_criada |
| Venda | assinou ÷ teste_iniciado, e assinou ÷ msg1 enviadas |
| Passagem | pediu_humano ÷ respondeu; tempo até a primeira resposta humana |
| Saúde | saiu ÷ enviadas; falhas ÷ enviadas |
| Custo | (busca + IA + PDF) ÷ conta_criada e ÷ assinou |
| Força do achado | resposta e aceite por achado principal |

Todo número aparece com o **N** e a marca "amostra pequena" quando houver poucos casos.

### 9.4 Painel
Na página da campanha: funil degrau a degrau; coorte por semana de envio lida em 7, 30 e 60 dias;
comparação por variante; filtro por achado e por bairro; lista de contatos com a linha do tempo de
cada um; quadro de saúde do número. **Na Fase 0, uma planilha manual cumpre esse papel [R].**

### 9.5 Freio do número (D12)
Pausa a campanha e avisa quando, nas últimas 30 enviadas, **3 ou mais responderem SAIR**, ou houver
**3 falhas seguidas**, ou o WhatsApp sinalizar sessão restrita. Só volta com ação humana. Valores de
partida, recalibrados na Fase 0.

## 10. Experimento

| Fase | Tamanho | O que testa | Decide com |
|---|---|---|---|
| **0, manual** | ~50 empresas | Texto, PDF, objeções, se o "SIM" acontece | Leitura de **todas** as conversas; nenhum erro grave; freio não disparou |
| **1, A/B da abertura [R]** | ~200 por variante | Msg 1 **com** × **sem** o achado principal na mensagem | Taxa de resposta. ~200 por variante detecta uma diferença grande (ex.: 10% × 20%), que é a que importa agora |
| **2, leitura em 30-60 dias** | as coortes da Fase 1 | Conta → teste → assinatura | Custo por assinatura contra o ticket (R$ 69/mês) |

**Por que a primeira comparação é a abertura, e não a oferta (Vitrine × teste):** a oferta só é
vista por quem disse SIM, que serão poucas dezenas; com isso não se decide nada com segurança. A
abertura é vista por todos. A oferta fica observada de forma qualitativa até haver volume.

**Ritmo:** 1 número; até 50 tentativas por dia, contando o lembrete; ~1,8 tentativa por empresa
⇒ ~27 empresas novas por dia útil ⇒ Fase 1 em cerca de 3 semanas. Se faltarem pizzarias e
hamburguerias elegíveis nas duas cidades, a Fase 1 inclui lanchonetes.

**Regras escritas antes de rodar:** variante sorteada por empresa; nenhuma mudança de texto no meio
de uma fase; resultado só lido no fim da fase.

## 11. LGPD e reputação

- **Base legal:** legítimo interesse, B2B, com dados públicos da empresa. Atualizar a avaliação de
  legítimo interesse que a campanha já pede para cobrir **esta** finalidade e o PDF.
- **Transparência:** o PDF diz de onde vieram os dados; "SAIR" desde a primeira mensagem.
- **Minimização:** o PDF só tem dados da empresa; nada de pessoa física até a F6.
- **Anonimização:** a do candidato já reescreve todos os dados coletados. **Conferir** se o PDF
  guardado no Storage também é apagado (a mídia das mensagens é removida pela cascata; o PDF
  precisa estar no mesmo caminho).
- **Retenção do PDF:** 90 dias **[R]**, ou até a anonimização.
- **Nome do dono (F6):** só depois de parecer de advogado de proteção de dados; nunca raspar o
  LinkedIn; nunca buscar o celular pessoal.
- **Reputação do número:** WhatsApp não oficial (WAHA) tem risco de banimento; o freio (§9.5),
  o ritmo e a janela são a defesa.

## 12. O que construir (quando você autorizar)

| Fatia | Conteúdo | Tam. | Destino |
|---|---|---|---|
| **F1, configuração** | Funil e campos, integração com a Manero ligada, Dani, base de conhecimento, horário, oferta "cardápio digital" na campanha (hoje só há site e automação) | P | Configuração (a oferta nova é núcleo, pequena) |
| **F2, roteiro** | Msg 1 com texto fixo e variáveis; saída "SAIR"; lembrete, "SIM", coleta e PDF pelo fluxo; **mídia por lead**; **trava "sem emoji"** por agente | M | Núcleo |
| **F3, medição + freio + A/B** | Marcos, painel, sorteio de variante, freio por "SAIR" | G | Núcleo |
| **F4, PDF automático + achados de cardápio** | Modelo do PDF, detectores novos (§4) | M | Achados de cardápio: núcleo como "achado de nicho" ou extensão (decisão do mantenedor) |
| **F5, retorno teste/assinatura** | No repositório da Manero | P–M | Manero |
| **F6, nome do dono** | CNPJ + sócio, após parecer | M–G | Núcleo, com trilha de LGPD |

**Fase 0 roda só com F1.** O PDF é montado por uma pessoa com o modelo da §5, e a Msg 1 sai pela
campanha com instrução forte (a IA ainda reescreve; o texto exato só com F2).

## 13. Riscos a provar antes de F2
1. **Duas vozes no mesmo "SIM":** a Dani e o fluxo reagindo juntos.
2. **O lembrete conta no teto do número?** Não conferido.
3. **A guarda de primeiro contato** pode recusar o lembrete a quem nunca respondeu.
4. **A IA reescreve a Msg 1:** na Fase 0, conferir cada texto antes de sair (modo de teste da conexão).
   Conferir também que nenhuma resposta da Dani saiu com emoji, até a trava da F2 existir.
5. **Universo pequeno:** pizzarias e hamburguerias elegíveis nas duas cidades podem não chegar a 400.

## 14. Escolhas que fiz por você (todas aprovadas em 09/11/2026)

| # | Tema | Escolhi **[R]** | Variante B | Variante C |
|---|---|---|---|---|
| 1 | Tamanho do PDF | 2 páginas | 1 página | 4-5 páginas |
| 2 | Ponto de vista dos achados | Do cliente do restaurante | Técnico | Comparando com vizinhos |
| 3 | "Como ficaria" | Exemplo do segmento com o nome deles | Sem imagem | Pratos reais |
| 4 | Quem já usa cardápio digital de outra empresa | Fica fora na Fase 0 | Entra com mensagem de troca | Entra igual aos outros |
| 5 | Silêncio depois do PDF | 1 retomada em D+2 | Nenhuma | 2 retomadas |
| 6 | Quando oferecer o teste de 7 dias | Depois da conta criada | Já na Msg 2 | Só se perguntarem |
| 7 | Primeira comparação A/B | Abertura com × sem achado | Oferta Vitrine × teste | Horário manhã × tarde |
| 8 | Base de conhecimento | Copiar a da Manero | Sincronizar automático (mais obra) | Escrever do zero |
| 9 | Painel na Fase 0 | Planilha manual | Construir F3 antes da Fase 0 | Sem medição na Fase 0 |
| 10 | Retenção do PDF | 90 dias | 30 dias | 365 dias (como o candidato) |
| 11 | Quem recebe os casos | Ricardo, 08h-18h | Uma pessoa do time | Fila sem dono, quem pegar primeiro |
