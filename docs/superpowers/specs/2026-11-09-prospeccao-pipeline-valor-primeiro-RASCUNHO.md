# Pipeline de prospecção "valor primeiro" — rascunho para conversa

> **Status: rascunho de conversa, não é spec.** Nada aqui virou decisão nem código.
> Escrito em 09/11/2026 a partir da ideia do Ricardo. As seções "Medido no repo" foram
> conferidas nos docs; "Não conferido" diz o que ainda falta abrir no código antes de decidir.

---

## 1. A ideia (nas palavras do Ricardo)

**Mensagem 1 — oferta de valor, sem pedir nada:**

> Olá, {cliente}.
> Meu nome é Ricardo e fiz uma análise completa da sua empresa {Nome Empresa} com base em presença digital.
> Tem interesse em receber a análise que fiz?

**Mensagem 2 — só se a pessoa disser sim:**

> Bacana, segue análise, {Análise}.
> Tenho uma oportunidade de melhorar alguns pontos que encontrei sobre sua empresa, mas antes de
> prosseguir: você é responsável pela empresa?

Em uma frase: **dar primeiro, pedir depois.** A pessoa só recebe pedido (falar com o responsável)
depois de já ter recebido algo útil.

## 2. Desenho em etapas (pipeline)

```
Busca / planilha ──► Análise da presença digital ──► Msg 1 (permissão)
                                                        │
                                       ┌────────────────┼─────────────────┐
                                    sem resposta     "sim"             "não"/PARAR
                                       │                │                 │
                                  (hoje: nada)     Msg 2: análise     encerra, bloqueia
                                                   + "é o responsável?"
                                                        │
                                          ┌─────────────┴─────────────┐
                                      "sou eu"                   "não sou"
                                          │                           │
                                  agente qualifica            pedir o contato do
                                  → etapa "qualificados"      responsável (gatekeeper)
                                          │
                                       humano assume
```

Cada seta é uma decisão de produto. Os pontos de atenção estão na seção 5.

## 3. O que o produto já tem (medido nos docs)

| Peça da ideia | Situação hoje | Fonte |
|---|---|---|
| Lista de empresas com telefone | **Existe** (Apify/Scavio/planilha) | `docs/features/prospeccao-nativa.md` |
| "Análise de presença digital" | **Existe em parte**: auditoria de site (agregador, sem HTTPS, SSL inválido, fora do ar, não-mobile, lento, construtor pronto), checklist do que tem/falta (WhatsApp, telefone, e-mail, redes, mapa, título…), nota PageSpeed opcional. Fica em `prospecting_candidates.data.site` | `docs/specs/24-spec-enriquecimento-site-prospeccao.md` |
| Estratégia e prompt por situação do site | Existe: a abordagem fria já recebe o contexto do site | spec 24, §1.3 |
| Msg 1 gerada por IA com dados da empresa | Existe: `gerarAbordagemDeFormulario` | spec 24, §1.3 |
| Saída "responda PARAR" na 1ª ou 2ª mensagem | Existe, configurável por campanha | `2026-10-19-prospeccao-saida-depois-da-resposta-design.md` |
| Resposta da pessoa vai para o agente | Existe: atendimento normal no Inbox | `prospeccao-nativa.md` |
| Qualificar e mover de etapa | Existe: `crm_move_lead_stage`, critérios do operador | `prospeccao-nativa.md` |
| Um número, uma campanha, 50/dia, 5 min | Existe | `prospeccao-nativa.md` |

## 4. O que a ideia exige e o produto NÃO tem (a conferir no código)

1. **Entregar a análise como conteúdo** na Msg 2. Hoje a auditoria é um painel interno para o
   operador e um contexto para a IA, **não um artefato enviável**. Formatos possíveis:
   texto curto no próprio chat / página com link / PDF. Cada um tem custo e efeito diferente
   (texto cabe no WhatsApp; link leva a pessoa para fora; PDF parece "trabalho feito" mas é pesado).
   A spec 24 diz "sem PDF" de propósito, então isso seria uma decisão nova.
2. **A análise cobre "presença digital", e a auditoria hoje cobre o site.** Instagram, Google Meu
   Negócio (nota, avaliações, fotos, horário), reputação e anúncios não estão no raio-X. A spec 24
   exclui "Instagram não-oficial". O que entra na "análise completa"?
3. **Roteiro de duas etapas com ramificação.** Hoje a campanha manda a 1ª abordagem e passa a
   conversa ao agente. A Msg 2 fixa ("segue análise + é o responsável?") seria um passo
   determinístico do funil, ou uma instrução para o agente?
4. **Sequência para quem não respondeu.** O doc diz literalmente: "Não há … sequência de insistência".
5. **Tratar "não sou o responsável".** Quem atende o WhatsApp de uma empresa de Maps costuma ser
   atendente. A conversa precisa de um caminho para pedir o contato de quem decide.

*Não conferido:* o código de `worker.ts` / `abordagem-de-formulario.ts` e se a Msg 1 pode ser
um modelo fixo com variáveis em vez de texto livre da IA. Abrir antes de desenhar.

## 5. Tensões e perguntas para decidir juntos

### 5.1 "Fiz uma análise" é verdade?
A mensagem assina "Meu nome é Ricardo e **fiz** uma análise completa". Se a análise é automática
(auditoria + IA), a frase é uma afirmação sobre trabalho humano. Isso (a) pode ser um problema de
honestidade com o destinatário e de reputação do número, e (b) "completa" promete mais do que um
raio-X de site entrega. Opções: manter pessoal e fazer o Ricardo realmente revisar (não escala),
ou reescrever sem fingir ("analisei a presença digital da {empresa}", sem "completa" e sem implicar
trabalho manual). O agente prospecta em nome de quem? Do operador? Isso precisa estar claro
também para a LGPD (quem é o controlador, de onde veio o dado).

### 5.2 A Msg 1 é "só cumprimento" ou já é comercial?
A spec da saída do PARAR trata a 1ª mensagem como abertura não comercial quando a saída é atrasada
para a 2ª. A Msg 1 desta ideia **já oferece algo**. Se a saída ("responda PARAR") só aparecer na
2ª mensagem, a 1ª passa a ser oferta sem saída. A decisão do mantenedor (doc 170) segura isso por
instrução ao modelo, não por trava. Consequência prática: nesta ideia, o modo seguro é manter
a saída **na 1ª mensagem**, e isso pesa na naturalidade do texto. Vale testar as duas.

### 5.3 O gancho funciona nos livros?
- **Fanatical Prospecting (Blount):** o objetivo da primeira mensagem é conseguir a conversa, não
  vender. "Tem interesse em receber?" é um pedido pequeno e fácil de dizer sim. Bate com a ideia.
- **Gap Selling/Prospecting (Keenan):** a análise é, no fundo, um *mapa da distância* entre onde a
  empresa está e onde deveria estar. É o melhor encaixe, **desde que a análise mostre uma lacuna
  que a pessoa reconheça e que custe algo a ela** (não "sem HTTPS", e sim "quem busca você no
  Google e entra pelo celular não consegue chamar no WhatsApp").
- **Challenger (Dixon/Adamson):** a análise é o "insight que a pessoa não tinha". Se for genérica,
  perde o efeito. Vale mais *um* achado forte do que um relatório inteiro.
- **Predictable Revenue (Ross):** a meta da prospecção é transferir para quem fecha. A pergunta
  "você é o responsável?" faz exatamente esse papel de qualificação, mas **pedi-la só depois** da
  entrega é correto do ponto de vista de reciprocidade.
- **Voss (Never Split the Difference):** "Tem interesse em receber?" é pergunta fechada de sim/não.
  Pergunta calibrada ("como…?", "o que…?") costuma gerar mais abertura, mas com desconhecido no
  WhatsApp o sim/não é mais barato de responder. Aberto para testar.

*(Livros lidos só por resumos de terceiros, sem acesso ao texto.)*

### 5.4 O entregável pode virar o ponto fraco
Entregar a análise dá à pessoa **tudo o que ela queria** sem precisar responder a mais nada.
Perguntas: a análise entrega o *diagnóstico* e guarda a *solução* para a conversa? Quanto da
solução pode estar nela sem esvaziar a oferta? E quanto de 'defeito' apontado em empresa alheia,
por mensagem fria, soa agressivo ("seu site está ruim")?

### 5.5 Quem é o "responsável"?
A Msg 2 só pergunta se é o responsável depois de entregar. Se a resposta for "não", o que o agente
faz? Pede o contato? Pede para repassar a análise? Isso precisa de roteiro próprio, e o produto
hoje não distingue "falei com o dono" de "falei com a recepção".

### 5.6 Silêncio
Sem resposta na Msg 1, hoje não acontece nada. Dados de vendors (e-mail frio, não WhatsApp)
sugerem que 3–5 toques é o ponto doce e que passar de 4 aumenta reclamação. Em WhatsApp não
oficial o custo de insistir é banimento do número. Qual é o máximo aceitável aqui? 1 lembrete
após N dias? Zero?

### 5.7 Escala e custo
Cada análise custa: fetch do site, eventualmente PageSpeed, tokens de IA para redigir. Quanto custa
por empresa, e quanto se perde quando 70–90% não respondem? Medir antes de prometer escala.

### 5.8 Como medir
Proposta de funil mínimo para a campanha mostrar (hoje só há enviadas e qualificadas):

`enviadas → responderam → pediram a análise → receberam → confirmaram que são o responsável → qualificadas`

Cada degrau com taxa. É o que diz se o "valor primeiro" funciona melhor que a abordagem direta.

## 6. Como testar sem se enganar

- Rodar **duas campanhas A/B em números diferentes** (o produto permite uma ativa por número):
  abordagem atual × "valor primeiro". Mesma lista, mesmo nicho, mesmo período.
- Antes de qualquer escala, validar o texto em poucos envios reais e **ler as respostas**.
- Medido pela tela, como a doutrina de QA do repo pede (DoD 12), e com o par agente + ferramenta
  se o caminho passa pela IA (DoD 12, `prova-em-par.md`).

## 7. Destino da mudança (doutrina de extensões)

Se virar código: pergunta-raiz *"se nenhuma organização ativar isto, a operação comum continua
inteira?"* — sim, é um modo de abordagem da prospecção, então tende a **núcleo** (como a saída
do PARAR), mas a decisão é do mantenedor. Entregar a análise como artefato pode ser candidato a
**módulo/extensão** se exigir tabela ou tela própria (ADR-0002).

## 8. Decisões do Ricardo (09/11/2026)

| # | Decisão | Consequência a desenhar |
|---|---|---|
| 1 | Análise feita **pelo sistema** | Texto não pode dizer "fiz à mão"; usar "preparei uma análise" |
| 2 | Entregue em **PDF bem formatado, gerado pelo agente** | Ferramenta nova de gerar PDF; sobe no Storage e vai por URL ao WAHA; decidir retenção. Sugestão: o sistema monta o PDF de dados estruturados e o agente só redige os textos |
| 3 | A análise **parte do que a Manero resolve**, não de "presença digital" genérica | Catálogo de sinais detectáveis ↔ problema ↔ solução da Manero (§8.1) |
| 4 | Msg 1 **tem saída**, mas **didática**, não "responda PARAR" | Frase tem de ensinar uma resposta que `lib/opt-out/deteccao.ts` reconhece como saída (§8.2) |
| 5 | **No máximo 2 mensagens** para quem não responde | Definir se são 2 lembretes depois da Msg 1 ou 2 no total (§8.3) |
| 6 | Meta: **reunião de apresentação marcada; venda direta se possível, e a venda direta é a prioridade** | Muda a Msg 2 e o papel do agente (§8.4) |
| 7 | Nicho: **negócios onde a Manero pode oferecer seus serviços** | Primeiro precisamos saber o que a Manero é (§8.1) |

### 8.1 O que é a Manero (INFERÊNCIA, a confirmar)
O servidor MCP `manero` expõe: restaurantes (organizações), cardápio em categorias, produtos,
tabelas de preço, grupos de opções, imagens e vídeos de produto, equipe e convites. Pelas
descrições das ferramentas, a Manero parece ser uma **plataforma de cardápio digital para
restaurantes**. Não li nenhum dado de cliente. **Confirmar:** é isso? Só restaurante, ou também
lanchonete, padaria, bar, delivery? Tem pedido/pagamento/entrega, ou só cardápio?

Se for isso, o catálogo de sinais **hipotético** (a validar), usando só o que a busca do Maps já
traz (categoria, nota, nº de avaliações, site, telefone, endereço) mais o que a auditoria de site
mede:

| Sinal detectável | Lacuna | O que a Manero resolveria |
|---|---|---|
| Sem site / site é Instagram, Linktree, Wix | Cliente não vê o cardápio fora das redes | Cardápio próprio em link único |
| Site existe mas sem cardápio, ou cardápio em foto/PDF pesado | Difícil de ler no celular | Cardápio navegável por categoria |
| Site lento, sem HTTPS, não-mobile | Quem abre pelo celular desiste | Página rápida e mobile |
| Sem botão de WhatsApp/pedido | Pedido depende de o cliente descobrir o número | Pedido/contato direto |
| Muita avaliação, mas só no Maps | Demanda existe e não é capturada por canal próprio | Canal próprio de pedido |
| Produtos sem foto (visível no Maps) | Foto vende prato | Fotos e vídeo por produto |

Regra proposta: **só entra na análise o que a Manero de fato resolve.** Sinal sem solução não
aparece no PDF.

### 8.2 A saída didática e o detector
O que bloqueia a pessoa é a regra de `lib/opt-out/deteccao.ts`: palavra **isolada**, ou verbo de
cessação com objeto de comunicação ("parar de me mandar", "sair da lista"). Logo, a frase didática
precisa terminar numa resposta que a regra aceite. Candidatas para testar contra o corpus de
`tests/unit/opt-out-deteccao.test.ts`:
- "Se não quiser receber minhas mensagens, é só me dizer **'pare de me mandar'**." (verbo + objeto, ensina a frase exata)
- "Se preferir não receber mais, responda **SAIR**." (palavra isolada; só muda a palavra)
Ponto de atenção: **"não" isolado não serve**, porque também é resposta legítima a "tem interesse
em receber a análise?". A saída é texto determinístico do código (`rodape-de-saida.ts`), por
idioma; mudar exige mudança de código com teste.

### 8.3 Duas mensagens para quem não responde
Duas leituras possíveis (decidir): **(a)** Msg 1 + até 2 lembretes = 3 envios; **(b)** 2 envios no
total = Msg 1 + 1 lembrete. A spec da saída atual supõe que a saída vai na 1ª mensagem ou na 2ª;
lembrete a quem nunca respondeu precisa de espaçamento (sugestão: dias, não horas) e de conteúdo
novo (ex.: um achado diferente da análise), não repetição. O produto hoje **não tem** esse
follow-up para prospecção; o follow-up automático existente é por etapa do funil.

### 8.4 Venda direta como prioridade
Pedir "você é o responsável?" **antes** de oferecer o produto atrasa a venda. Em restaurante
pequeno, quem atende o WhatsApp muitas vezes é o dono. Alternativa a avaliar: a Msg 2 entrega o
PDF e já faz **uma** proposta concreta (teste/preço/link), e a pergunta do responsável vira
condicional ("se não for você quem decide, me indica com quem falo?"). Perguntas: existe plano
com preço público e link de contratação? Existe teste grátis? A venda pode ser fechada pelo
próprio agente (link de checkout) ou só marca reunião?

## 9. Perguntas abertas (restantes)

1. A Manero é mesmo cardápio digital para restaurantes? Qual o escopo e o preço público?
2. Qual é a oferta da Msg 2: reunião, teste grátis, link de contratação?
3. Lembretes: opção (a) ou (b) da §8.3, e com quantos dias de intervalo?
4. Qual frase de saída testamos primeiro (§8.2)?
5. Quem é o remetente do PDF e da conversa: "Ricardo", a Manero, ou o nome da empresa?
6. Como medir: o funil da §5.8 serve, trocando "qualificadas" por "reunião marcada" e "venda"?
7. Primeiro experimento: uma cidade, um tipo de restaurante, 50 envios em um número?

> **Atualização (09/11, tarde):** as perguntas 1, 2 e 5 foram respondidas e a 1 foi **confirmada**
> pelo código (`C:\codenome\manero_catalog`) e pelo site manero.app. As seções 10 a 14 abaixo
> substituem a §8.1 (que era inferência).

---

## 10. O que a Manero é (confirmado no código e no site)

**Cardápio digital para restaurantes, bares, lanchonetes, pizzarias, cafés, docerias.** O cliente
final abre por QR ou link, sem app. O dono cadastra e atualiza pelo painel (`admin.manero.app`).
Tabelas de preço por canal (salão, delivery, balcão), opcionais, destaques, desempenho do cardápio,
equipe, PDF do cardápio. Pedido por WhatsApp = o **cliente** monta e manda uma mensagem pronta ao
WhatsApp **do restaurante**; a Manero não tem chatbot nem checkout.

| Plano | Preço | Limites |
|---|---|---|
| Vitrine | grátis, sem cartão | 10 produtos, 1 pessoa |
| Essencial | R$ 69/mês (≈R$ 55 no anual) | 150 produtos, desempenho completo |
| Profissional | R$ 129/mês (≈R$ 103 no anual) | 1000 produtos, 5 pessoas, vídeo |
| Enterprise/Rede | sob consulta | várias lojas, domínio próprio, API |

**A "venda direta" na Manero é autosserviço:** o dono cria a conta em `admin.manero.app/signup` e
assina dentro do painel. Não existe checkout que o agente do Deskcomm possa fechar. Logo, a
**conversão primária da nossa pipeline é "criou a conta"** (é a mesma que a Manero otimiza nos
anúncios), e a venda acontece depois, quando o limite de 10 produtos do Vitrine aperta. Reunião
com o Ricardo entra como caminho secundário e para rede/franquia.

### Regras que a Manero já impõe à própria comunicação (vale para o PDF e para as mensagens)
Fonte: `PRODUCT.md`, `.knowledge/00-politica-da-casa.md`, `ads/manero-campaign-brief.md`.
- **Não prometer:** pedidos/checkout dentro da Manero, PDV, integração com iFood, bot de WhatsApp,
  "sem comissão", "tempo real".
- **Tom:** consultor claro, frase curta, sem hype e sem pressão ("desbloqueie", "assine agora").
- **Vocabulário:** restaurante (não organização), painel (não dashboard), "quem visita e o que mais
  abre" (não analytics).
- **Nunca inventar** preço, prazo ou função; **nunca pedir** senha ou cartão no WhatsApp.
- Rede/franquia, cobrança e contrato vão para humano: Ricardo, `ricardo@manero.app`, WhatsApp
  +55 (62) 99862-1200.

### ✅ RESOLVIDO (Ricardo, 09/11): vale o teste de **7 dias do Essencial, com cartão já no cadastro do teste**. Ver §16.
### (histórico) Inconsistência que existia antes de qualquer mensagem citar teste grátis
Três fontes da própria Manero dizem coisas diferentes:
- manero.app: **não há teste com prazo**; o Vitrine grátis faz esse papel.
- `.knowledge` (base do Manu): **7 dias grátis do Essencial**, com cartão.
- `ads/manero-campaign-brief.md`: **14 dias do Profissional**.

Até o Ricardo dizer qual vale, **as mensagens só falam em "comece grátis, sem cartão" (Vitrine)**.

## 11. A análise (PDF assinado pela Manero)

**Princípio:** só entra no PDF o sinal que a Manero resolve, na linguagem da Manero.

Insumos que o Deskcomm já tem por empresa (Maps + auditoria de site da spec 24): categoria, nota,
nº de avaliações, site, redes, classe do site (agregador, sem site, fora do ar, SSL inválido,
não-mobile, lento, construtor pronto, ok) e o checklist do que o site tem ou não tem.

| Sinal (medido) | O que o PDF diz ao dono | Solução Manero (verdadeira) |
|---|---|---|
| Sem site, ou o "site" é Instagram/Linktree/Wix | "Quem procura vocês no Google não encontra o cardápio em um lugar só" | Cardápio no ar com link e QR próprios |
| Site fora do ar, SSL inválido, sem HTTPS | "O site de vocês não abre / mostra aviso de segurança no celular" | Cardápio que abre rápido no celular |
| Site não-mobile ou lento | "Quem abre pelo celular espera ou desiste" | Cardápio feito para celular |
| Site sem cardápio legível (a **nova** checagem, §14) | "O cardápio está em foto ou PDF difícil de ler" | Categorias, fotos e preços navegáveis |
| Sem botão de WhatsApp no site | "Quem quer pedir não encontra como" | Pedido pelo WhatsApp (mensagem pronta; **sem** prometer automação) |
| Muitas avaliações no Maps e nenhum canal próprio | "Vocês têm demanda; falta um cantinho seu" | Link e QR na mesa, no Instagram e no Maps |

**Estrutura do PDF (2 páginas):** capa com nome do restaurante e "Análise do cardápio online,
preparada pela Manero" → 3 a 5 achados (sinal → o que significa para quem visita → como a Manero
resolve) → um passo único ("Comece grátis, sem cartão: link") → rodapé de transparência: *"Feito
a partir de informações públicas (Google Maps e site). Não quer mais receber nossas mensagens?
Responda SAIR."* Sem texto de venda agressivo, sem preço de concorrente, sem print de terceiros.

**Gerar quando:** os sinais são calculados no preparo (já existem). O **PDF só é gerado depois do
"SIM"**: custo por quem pediu, não por toda a lista.

## 12. Pipeline de mensagens (proposta)

**Voz:** "Manero", não "Ricardo". A Manero assina o PDF e fala em primeira pessoa como **assistente
da Manero**; se perguntarem "é robô?", responde que é assistente virtual e oferece o humano. (O
Manu, do suporte, tem escopo fechado em suporte; sugiro **outra persona** para a prospecção, a
definir.)

### Mensagem 1 — abertura (dia 0, só se o número é válido e dentro da janela)
> Oi, tudo bem? Aqui é da Manero, plataforma de cardápio digital para restaurantes.
>
> Preparei uma análise do cardápio online do **{Restaurante}** e encontrei **{N} pontos** que
> podem estar afastando clientes que chegam pelo celular.
>
> Quer que eu envie o PDF? É só responder **SIM**.
>
> Se não for o momento, responda **SAIR** e eu não te chamo mais.

Variante B para testar: acrescentar uma linha com o achado principal ("O principal: o cardápio de
vocês hoje está só no Instagram."). Mais credibilidade; menos curiosidade.

*Por que "SAIR":* está no vocabulário de saída da regra (`sair`, `parar`, `pare`, `cancelar`,
`remover`, `stop`), então bloqueia sozinha, e ensina a palavra na própria frase. **Não** usar "não"
como saída, porque "não" também é resposta a "quer que eu envie?" (§8.2).

### Lembrete — 1 só (dia 3, só quem **não** respondeu)
> Oi! Só voltando: a análise do **{Restaurante}** continua pronta. Um exemplo do que ela mostra:
> {achado_secundario}.
>
> Quer receber? Responda **SIM**. Se preferir encerrar, responda **SAIR**.

Conteúdo novo (outro achado), nunca repetição. Depois dele, **silêncio**: nada mais é enviado.
Interpretei "no máximo 2 mensagens para não respostas" como **2 envios no total** (Msg 1 +
lembrete). Se você quis 2 lembretes, o total é 3; me avise.

### Mensagem 2 — após "SIM": entrega + um único próximo passo
> Aqui está, feita pela Manero para o **{Restaurante}**: 📎 {PDF}
>
> Resumo: **1)** {achado 1} **2)** {achado 2} **3)** {achado 3}
>
> Dá para resolver isso com um cardápio no celular, com QR e link, que você mesmo atualiza.
> Começa grátis, sem cartão: {link_de_cadastro}

Um CTA só (princípio do produto: "one primary CTA per decision"). O link de cadastro leva um
**código opaco da campanha** (não telefone, nome ou CNPJ na URL) para medir quem criou conta.

### Depois da Msg 2 — o agente conversa (ramificações)
| Resposta | O agente faz |
|---|---|
| Criou conta / "como começo?" | Passo a passo com links oficiais (painel, produto novo, importar, QR) |
| "Quanto custa?" | Tabela de planos da Manero, só valores reais; Vitrine primeiro; sem inventar teste |
| "Passei do limite de 10" | Essencial R$ 69 / Profissional R$ 129; dono assina em **Assinatura** |
| "Quem cuida é o dono / não sou eu" | Pede nome e melhor horário, oferece reencaminhar o PDF; marca "decisor não encontrado" |
| "Já uso iFood / cardápio em PDF" | Posiciona como **complemento** (cardápio próprio para link e QR); sem atacar concorrente, sem falar de comissão |
| "Quero falar com alguém", rede/franquia, contrato, cobrança | Passa para o Ricardo (resumo em 3 linhas, como a política da Manero manda) |
| Pergunta fora do escopo | Recusa curta e volta ao tema |
| "SAIR", "PARE" etc. | Bloqueio pela ingestão; sem nova mensagem |
| Sem resposta à Msg 2 | **Decisão pendente:** 1 cutucada em 2 dias, ou silêncio? (a regra dos "2 envios" vale para quem não respondeu à abertura; quem pediu o PDF já está engajado) |

**Reunião** entra como segunda opção, só se a pessoa não quiser autosserviço: "Prefere que eu
agende 15 minutos com o Ricardo?" Não aparece na Msg 2.

## 13. Funil e medição

```
elegíveis → Msg 1 enviada → respondeu → disse SIM → PDF entregue → clicou/cadastrou (conta criada)
                                                                    → assinou plano pago
                                                      → pediu reunião / foi para o humano
          → SAIR / bloqueado        → silêncio (lembrete enviado)
```

Taxas a olhar primeiro: resposta à Msg 1, "SIM" sobre respostas, conta criada sobre PDF entregue,
conta paga sobre conta criada, SAIR sobre enviadas (termômetro de reputação do número).
**Gargalo provável da venda:** o Vitrine é grátis e a venda só ocorre se o restaurante passar de 10
produtos. O PDF pode já dizer isso com honestidade ("seu cardápio tem cerca de X pratos; no grátis
cabem 10"), o que prepara o upgrade sem pressão.

## 14. O que muda no Deskcomm (mapa de trabalho, NÃO conferido no código)

| Peça | Situação |
|---|---|
| Roteiro fixo Msg 1 → lembrete → entrega, com ramificação por resposta | Novo (hoje: 1 abordagem e depois agente livre) |
| Lembrete único para quem não respondeu | Novo (o doc diz que não há sequência) |
| Saída "SAIR" em vez do rodapé PARAR, na 1ª mensagem e no lembrete | Mudança em `rodape-de-saida.ts`, como modo da campanha, com teste |
| Catálogo de sinais ↔ achados (por nicho: restaurante primeiro) | Novo; extensão da auditoria de site |
| **Nova checagem:** o site tem cardápio legível? (texto vs. foto/PDF), botão de WhatsApp, link de iFood | Novo; a spec 24 não cobre cardápio |
| Gerar o PDF (template Manero, de dados estruturados; agente redige os textos) | Novo; decisão contra a "sem PDF" da spec 24 |
| Guardar o PDF e mandar por URL ao WAHA | Storage `whatsapp-media` + URL assinada; retenção a definir |
| Persona e prompt do agente (base de conhecimento da Manero) | Novo; reaproveitar `.knowledge` da Manero, respeitando as regras da §10 |
| Código opaco no link de cadastro e retorno "conta criada" | Exige mudança **também na Manero** (atribuição) |
| Segmentação: só restaurante/bar/lanchonete/pizzaria/café | Filtro de categoria na busca |

**Destino (doutrina de extensões):** a pipeline "Manero" é uma jornada de nicho. Pergunta-raiz: se
ninguém ativar, a operação comum continua inteira? Sim, então o conjunto **tende a ser extensão ou
módulo**, e só os pontos genéricos (modo de saída, lembrete, geração de arquivo) iriam ao núcleo.
Decisão do mantenedor; extensão hoje não tem código nem tela, então pode empurrar para núcleo.

## 15. Perguntas abertas depois desta rodada

1. **Teste grátis:** qual das três versões vale (nenhum / 7 dias Essencial / 14 dias Profissional)?
2. Quem fala: persona nova "da Manero", ou o Manu? Nome e tom.
3. Lembrete: total de **2 envios** (como interpretei) ou Msg 1 + 2 lembretes?
4. Quem pediu o PDF e silenciou: 1 cutucada ou silêncio?
5. O link de cadastro pode carregar um código de campanha e a Manero devolve "conta criada"?
6. Posso usar a base `.knowledge` da Manero como conhecimento do agente?
7. Primeiro recorte: cidade e tipo de estabelecimento para os 50 envios do teste.

---

## 16. Decisões da rodada 3 (Ricardo, 09/11/2026)

| # | Decisão | Efeito no desenho |
|---|---|---|
| 1 | Teste = **7 dias do Essencial, cartão obrigatório no início** | Duas portas de entrada com atrito diferente (abaixo) |
| 2 | **2 envios no total** para quem não responde (abertura + 1 lembrete) | Fechado. O lembrete é o último contato |
| 3 | **Persona nova**, persuasiva, que dialoga nas dúvidas e **abre caso para humano** quando preciso | §17. A ferramenta de caso já existe (`request_human_handoff`) |
| 4 | **Medir todo contato**; o CRM deve seguir a literatura de prospecção; aceita-se desenvolver funcionalidade nova | §18 e §19 |
| 5 | Teste em **Goiânia e Aparecida de Goiânia** | §20 |

### Duas portas de entrada na Msg 2 (viram variante A/B)
| Variante | Convite | Atrito | Risco |
|---|---|---|---|
| **A, Vitrine** | "Comece grátis, sem cartão" | baixo | muita conta que nunca passa de 10 produtos |
| **B, Essencial 7 dias** | "Teste 7 dias do Essencial; o cartão é pedido para ativar e só cobra depois dos 7 dias, se você continuar" | alto | quem desconfia de cartão some; **o "medo de pegadinha" é o público**, então a mensagem precisa dizer a regra com todas as letras |

Como a venda direta é a prioridade, B é a hipótese forte e A é o controle seguro. É a primeira
coisa que o teste deve decidir. **Confirmar com a Manero** se o botão "Testar 7 dias grátis" está
habilitado para todo cadastro novo (a base de conhecimento diz "quando habilitado").

## 17. Persona de prospecção

**Papel:** consultor de cardápio da Manero que chegou com um trabalho feito (o PDF), conversa como
gente, tira dúvida com paciência e fecha com **um** próximo passo por vez.

**Persuasivo sem pressão.** A Manero tem regra de casa contra tom de cobrança ("desbloqueie",
"assine agora"), e o público desconfia de pegadinha. Persuadir aqui = clareza, prova concreta e
esforço mínimo, não urgência. Técnicas permitidas e de onde vêm:

| Técnica | Como aparece | Literatura |
|---|---|---|
| Reciprocidade | O PDF vem antes de qualquer pedido | "dar primeiro" da ideia original |
| Lacuna concreta | O achado é do restaurante dele, com dado dele ("cardápio só no Instagram") | Gap Selling/Prospecting (Keenan) |
| Insight novo | Mostra algo que ele não tinha visto | Challenger (Dixon e Adamson) |
| Perguntas de diagnóstico | "Hoje o cliente vê o preço antes de pedir pelo WhatsApp?" "Quanto tempo leva para trocar um preço?" | SPIN (Rackham): situação, problema, implicação, ganho |
| Pergunta calibrada para objeção | "O que faria isso valer a pena para vocês?" | Voss |
| Pedido pequeno e claro | Um passo, com a regra do cartão dita sem rodeio | Blount: o objetivo do contato é o próximo passo, não a venda inteira |

**Proibido (guardrails):** urgência ou escassez falsa; depoimento ou número de cliente inventado (o
`PRODUCT.md` da Manero proíbe); prometer pedido/checkout/iFood/"sem comissão"/"tempo real"; inventar
preço, prazo ou função; pedir senha ou cartão no WhatsApp (o cartão vai no checkout da Manero);
insistir depois de "não" ou "SAIR". Se perguntarem se é robô: **é assistente virtual da Manero** e
oferece uma pessoa.

**Objeções previstas e resposta-base** (para o prompt e para o teste pela tela):

| Objeção | Resposta-base |
|---|---|
| "Já tenho cardápio no iFood/Instagram" | Complemento: um link e QR **seus**; sem falar mal de terceiros |
| "É caro" | Vitrine grátis; Essencial R$ 69; 7 dias para testar; cancela quando quiser |
| "Cartão? Isso é pegadinha" | Explicar a regra: cartão para ativar, cobrança só após os 7 dias, aviso e cancelamento no painel |
| "Não tenho tempo" | Importar o cardápio atual e conferir a prévia; oferece ajuda passo a passo |
| "Vou ver com meu sócio" | Reenviar o PDF para o sócio; combinar quando voltar |
| "Meu cardápio muda todo dia" | É exatamente o caso de atualizar preço e esgotado pelo painel |
| "Não sou o dono" | Pede nome/horário do responsável; marca "decisor não encontrado" |

**Abrir caso para humano** (`request_human_handoff`, que já grava a passagem, silencia o agente e cria
item na Central): pediu pessoa; rede/franquia/contrato; cobrança ou cartão com problema; pediu
reunião; pergunta que o agente não sabe responder; duas rodadas de objeção sem avanço; frustração
ou reclamação. O resumo de 3 linhas segue a regra da Manero (restaurante, intenção, o que já foi
dito). **Quem recebe o caso** (Ricardo? outro?) e **em que horário** precisa ser definido.

**Base de conhecimento:** reaproveitar `manero_catalog/.knowledge` (planos, limites, links, FAQ,
política da casa). Pergunta aberta: copiar para o Deskcomm ou sincronizar? Copiar envelhece; a
Manero muda preço e regra de teste, como já aconteceu.

## 18. Medir todo contato: o que a literatura pede

Princípio: **medir cada contato como evento, não só o total da campanha.** Quase tudo que a
literatura pede é calculável a partir de eventos por empresa, e hoje o CRM só guarda o estado do
envio.

### 18.1 O que o CRM sabe hoje (lido no schema)
`prospecting_candidates.status` só tem `new | queued | sending | sent | skipped | failed`, com
`attempted_at`, `error` e os vínculos `contact_id/lead_id/conversation_id`. A campanha conta
**qualificados** pela mudança de etapa do negócio. Respostas, mensagens e etapas existem em
`messages`, `conversations` e `crm_leads`, mas **a prospecção não registra**: a variante, o achado
usado, "pediu o PDF", "PDF entregue", "link enviado", "conta criada", "assinou", "pediu humano" ou
"SAIR" como marcos da campanha. *Não conferido:* se alguma tela já cruza essas tabelas.

### 18.2 Princípios da literatura e o que cada um exige do CRM
| Princípio | Fonte | Exigência concreta |
|---|---|---|
| **Atividade e resultado são medidos separados**, e o resultado atrasa | Blount: regra dos 30 dias | Visão por **coorte de semana de envio**, lida em 7/30/60 dias; nunca só o total |
| **Funil com taxa por degrau**, para achar onde quebra | Ross: Predictable Revenue | Taxa degrau a degrau, por coorte e variante |
| **Separar quem prospecta de quem fecha**, medir a passagem | Ross | Taxa de passagem para humano, tempo até a resposta humana, aceite |
| **Qual lacuna move a pessoa** | Keenan | Taxa de resposta/aceite **por tipo de achado** usado na mensagem |
| **Qualidade da conversa**, não só desfecho | SPIN, Challenger, Voss | Etiqueta de objeção (preço, cartão, iFood, tempo, sócio) e de desfecho em cada conversa |
| **Reposição do funil** | Blount: Lei da Reposição | Quantas empresas elegíveis restam por cidade/segmento; "estoque" de lista |
| **Saúde do canal como restrição** | doutrina anti-banimento do repo | SAIR, falha de envio e bloqueio por número; regra de parada |

### 18.3 Degraus do funil (cada um com data e hora)
```
lista (Maps) -> elegível (>=2 achados verificáveis, WhatsApp existe)
  -> Msg 1 enviada -> entregue -> respondeu (qualquer coisa)
      -> aceitou (SIM) -> PDF enviado -> engajou (respondeu ao PDF)
          -> cadastro iniciado -> teste/conta criada -> cartão informado -> assinou (pago) -> manteve após 30 dias
          -> pediu humano -> reunião marcada -> reunião feita
  -> lembrete enviado -> respondeu ao lembrete
  -> SAIR / bloqueado    -> silêncio final (sem resposta nos 2 envios)
```
Os degraus de "cadastro/conta/cartão/assinou/manteve" **acontecem na Manero**, não no Deskcomm.
Sem atribuição, o funil acaba em "enviou o link", e a venda direta (a prioridade) fica **invisível**.
Opções de atribuição, da mais simples para a mais completa:
1. **Código opaco no link** (uma chave por empresa, sem nome/telefone/CNPJ na URL) + a Manero
   devolve o evento "conta criada/assinou" por webhook ou consulta.
2. Pergunta direta na conversa ("já criou sua conta?") + conferência manual. Fraca, serve de rede.
3. Cruzar por e-mail/telefone cadastrado. Depende de a Manero expor e da base legal; evitar.

### 18.4 Indicadores e regras de parada (hipóteses a calibrar, nada medido ainda)
- **Resposta à Msg 1**, **aceite sobre respostas**, **PDF engajado**, **conta criada sobre PDF**,
  **pago sobre conta**, **custo por conta criada e por pago** (busca + IA + PDF + envio).
- **Qualidade do canal:** SAIR/enviadas, falha/enviadas, número banido. **Regra de parada
  definida ANTES do teste** (pausar o número se SAIR passar de um limiar combinado ou se houver
  falhas seguidas). O limiar é decisão sua; não encontrei na literatura um número que eu possa
  afirmar para WhatsApp.
- **Latência:** tempo da Msg 1 até a resposta; tempo do pedido de humano até a primeira resposta
  humana.
- **Leitura honesta:** cada indicador mostra o **N**, e o painel diz "amostra pequena" abaixo de
  um mínimo. Em 50 envios, uma resposta a mais já muda 2 pontos percentuais.

### 18.5 Onde isso mora (opções, a decidir)
| Opção | Prós | Contras |
|---|---|---|
| **A. Tabela de eventos da prospecção** (append-only: candidato, tipo do evento, variante, achado, quando) | Medição limpa, imutável, por coorte; serve a qualquer nicho | Migration + baseline + RLS + auditoria (doutrina); escrever em todo ponto do fluxo |
| **B. Derivar de `messages`/`crm_leads`/atividades e guardar só os marcos que faltam** | Menos duplicação (doutrina DIRC: calcular quando dá) | Marcos como "aceitou SIM" dependem de interpretar texto; mais frágil |
| **C. Híbrido (recomendo avaliar):** derivar resposta e etapa; **gravar** os marcos declarados pelo roteiro e pelo agente (variante, achado, SIM, PDF enviado, link, objeção, desfecho) | Cada dado tem uma fonte | Precisa de vocabulário fechado de marcos e de uma tela para ler |

Tela: painel por campanha com o funil, a coorte por semana, a variante A/B e o filtro por achado,
mais a lista de contatos com a linha do tempo de cada um (o "medir todos os contatos"). A skill
`deskcomm-metricas` cobre as consultas agregadas sem dado pessoal.

## 19. O que o CRM precisa ganhar (lista de funcionalidades, ainda NÃO conferida no código)
1. **Eventos de prospecção** por candidato (§18.5) e a **tela de funil e coortes**.
2. **Variantes A/B** na campanha (texto da Msg 1, convite da Msg 2, horário, lembrete) com
   atribuição aleatória e registrada por empresa, para a comparação não ser viciada.
3. **Roteiro com lembrete único** e regra "2 envios no total".
4. **Etiquetas de objeção e de desfecho** na conversa, preenchidas pelo agente e revisáveis.
5. **Saída "SAIR"** como modo da campanha.
6. **Atribuição com a Manero** (código opaco + retorno de conta/assinatura).
7. **Elegibilidade pelo número de achados verificáveis** (não enviar análise vazia).
8. **Painel de saúde do número** e regra de parada.
9. **Custo por contato** (busca + IA + PDF) somado por campanha.

## 20. O teste em Goiânia e Aparecida de Goiânia

**Limites do produto que dão forma ao teste (de `prospeccao-nativa.md`):** uma campanha ativa por
número; até 50 abordagens por dia por número; mínimo 5 minutos entre envios; janela de envio
7h-22h; aquecimento de 7 a 14 dias para número novo; busca devolve até 100 empresas por execução
(Apify) ou 20 por página (Scavio). Para passar de 100, **fatiar a busca por bairro e tipo**
(pizzaria, bar, lanchonete…); o telefone único por organização evita duplicar.

**Tamanho de amostra (conta feita por mim, não vem de fonte externa):** para distinguir uma
resposta de 10% de uma de 15%, com 80% de poder e 95% de confiança, são **≈ 685 empresas por
variante**. Com 50 envios por dia por número, isso é cerca de 14 dias por variante. Com amostra
menor, o teste serve para **ler conversas e corrigir a mensagem**, não para declarar vencedor.

**Fases propostas:**
| Fase | Tamanho | Objetivo | Critério para passar |
|---|---|---|---|
| 0, qualitativa | ~50 empresas, 1 número | Ler **todas** as respostas; achar erro de texto, de PDF, de objeção | Nenhum erro grave; SAIR dentro do limite combinado |
| 1, A/B inicial | ~700 por variante | Variante A (Vitrine) x B (Essencial 7 dias); depois lembrete e horário | Regras de decisão escritas **antes** de rodar |
| 2, leitura em 30 dias | mesmas coortes | Conta criada, pago, manteve (regra dos 30 dias) | Custo por pago comparado ao ticket (R$ 69/mês) |

**Perguntas práticas do campo:**
- **Quantos números de WhatsApp temos?** A/B em paralelo exige 2 (uma campanha por número). Com 1,
  as variantes rodam em sequência e o tempo vira variável de confusão.
- **Horário (hipótese a testar):** restaurante está ocupado no almoço e no jantar. Candidato a
  testar: manhã e meio da tarde, fora do pico. Não é fato medido; é uma variável do teste.
- **Elegibilidade:** só entra quem tem >= 2 achados verificáveis; o resto fica fora e vira número
  do funil ("elegíveis / buscadas").
- **Tipos:** qual vem primeiro (pizzaria, lanchonete, bar, restaurante)? Um tipo por vez melhora a
  leitura.
- **DDD 62:** conferir janela de envio e feriados locais.

## 21. Perguntas abertas depois da rodada 3
1. **Quantos números de WhatsApp** podemos usar no teste?
2. Quem recebe os **casos** (Ricardo?) e em que horário? Tempo máximo de resposta?
3. **Limiar de parada** do número (SAIR e falhas): quanto você aceita?
4. O botão de **7 dias** está ligado para todo cadastro novo da Manero?
5. A Manero consegue **devolver** "conta criada / assinou" por código opaco?
6. **Base de conhecimento:** copiar ou sincronizar a da Manero?
7. Qual **tipo de estabelecimento** abre o teste, e o **nome e tom** da persona?
8. Caminho para a medição: **A, B ou C** (§18.5)?

---

## 22. Rodada 4 (Ricardo, 09/11/2026): decisões, descobertas e o dono do negócio

**Regra de conversa a partir daqui:** toda pergunta minha traz **uma opção recomendada e no mínimo
duas variantes**, e eu decido sozinho o que der para decidir com justificativa.

### 22.1 Fechado nesta rodada
| Tema | Decisão |
|---|---|
| Horário | Atendimento de casos humanos e envios **somente 08h-18h**. Fora disso o agente diz quando um humano responde |
| Números de WhatsApp | **1 número**, com a variante (A/B) sorteada **por empresa dentro da mesma campanha**. Assim as duas variantes enfrentam o mesmo número, a mesma semana e o mesmo horário |
| Persona | Nome **Dani** (neutro, curto, não conflita com o Manu). Tom: consultora clara, frases curtas, sem gíria forçada, sem pressão |
| Primeiro nicho | **Pizzarias e hamburguerias** de Goiânia e Aparecida |
| Medição | **Caminho C (híbrido)**, pelos motivos da §22.5 |

*Por que pizzaria e hamburgueria primeiro:* a Manero já tem modelo de categorias para os dois
(`@manero/onboarding-templates`, segmentos `pizzaria` e `hamburgueria` no contrato de provisionamento),
então a conta nasce com cardápio estruturado; o delivery casa com a tabela de preço por canal; o
dono costuma estar no balcão; e o nome do tipo aparece limpo na categoria do Maps. É hipótese de
foco, não dado medido. Alternativas que ficaram para depois: restaurantes em geral (volume maior,
mais heterogêneo) e bares/pubs (cardápio de bebidas muda muito, menos delivery).

*Consequência da amostra:* a campanha dá no máximo 50 tentativas por dia **por número**, e o
lembrete conta como tentativa. Com 1 número e duas variantes, 685 empresas por variante (§20) levam
**cerca de 4 a 5 semanas**. Por isso a Fase 0 (≈ 50 empresas) vem antes, e a decisão final só
sai depois.

### 22.2 DESCOBERTA: o retorno "conta criada" já existe, e muda a Msg 2
Em `manero_catalog/docs/api/deskcomm-provisioning.md` está **pronta** uma integração Deskcomm →
Manero. Resumo do que o documento descreve (não rodei):

1. O agente do CRM coleta os dados no WhatsApp e move o card para a etapa **"Criando restaurante"**.
2. Uma automação dispara o webhook (assinado por HMAC) para a API da Manero.
3. A Manero cria o **usuário sem senha**, o **restaurante** (dono = titular, plano **Vitrine**), as
   **categorias do segmento** e manda o e-mail "crie sua senha".
4. A Manero chama o MCP do CRM: grava `manero_status`, `manero_org_id`, `manero_slug`,
   `manero_menu_url` e move o card para **"Conta criada"** ou **"Falha no cadastro"** (com código:
   `MISSING_FIELDS`, `INVALID_TAX_ID`, `EMAIL_IN_USE`, `ENTERPRISE` se houver mais de 1 unidade…).

**O que isso resolve:** a pergunta 4 ("a Manero devolve conta criada?") está respondida: **sim, para
a criação da conta**. O funil do Deskcomm pode ter os degraus "Criando restaurante → Conta criada"
sem código novo na Manero.

**O que isso muda no desenho:** em vez de mandar um link e torcer, a Dani pode fazer **cadastro
assistido** dentro da conversa: pede nome, e-mail e CNPJ (que a Manero valida), e a conta aparece
pronta, com o cardápio já organizado pelo tipo do restaurante. Menos atrito que "crie sua conta no
site", e a atribuição é exata.

**O que continua faltando:** o documento só cobre a **criação** (sempre no plano Vitrine). O **início
do teste de 7 dias do Essencial** (que exige cartão no painel, feito pelo dono) e a **assinatura
paga** não voltam ao CRM. Sem isso, a venda direta, a prioridade, fica invisível.

| Como medir o teste e a assinatura | Opção |
|---|---|
| **A. A Manero avisa o CRM**, no mesmo mecanismo do "Conta criada" (`crm_update_lead` + mover para "Em teste" e "Assinante") | **Recomendada.** Reaproveita o canal que já existe; ambos os sistemas são seus |
| B. O Deskcomm consulta a Manero em lote (rotina diária) | Mais simples de ligar, mas atrasa e exige uma consulta nova na Manero |
| C. A Dani pergunta na conversa e um humano confere | Sem código; não escala e perde dado |

### 22.3 A regra de parada explicada (item 3 que você não entendeu)
**Ideia:** o número de WhatsApp é o seu ativo mais frágil. Se muita gente reclama ou os envios
falham, o WhatsApp pode restringir ou banir o número. Então o sistema precisa de um **freio
automático**: ele pausa a campanha sozinho e te avisa quando os sinais ruins passam de um limite.
Você decide o limite **antes** de começar, para não decidir no calor do momento.

Os sinais ruins são: pessoas respondendo **SAIR** e envios que falham.

| Opção | Gatilho de pausa | Quando faz sentido |
|---|---|---|
| **A. Conservadora (recomendada)** | Pausa e avisa se, nas **últimas 30 enviadas**, 3 ou mais pedirem SAIR (10%), **ou** 3 falhas de envio seguidas, **ou** o WhatsApp sinalizar sessão restrita/desconectada. Só volta com sua ação | Fase 0 e 1, número novo ou único |
| B. Moderada | Mesmos sinais com 15% de SAIR e 5 falhas seguidas | Depois que a mensagem estiver validada |
| C. Só alerta | Avisa, mas não pausa | Quando houver mais de um número e perder um não doer |

Os números acima são **ponto de partida meu**, não vêm da literatura. A Fase 0 serve para calibrá-los.
O produto já pausa a campanha em erro de envio; o que falta é o gatilho por SAIR e o aviso.

### 22.4 EXTRA: achar o dono de verdade
Você quer o dono real, não o telefone do Maps (concordo, geralmente é o do balcão). Isso é possível
em parte, e traz três problemas que precisam entrar no desenho antes de qualquer código.

**1) Muda uma decisão que o produto tomou de propósito.** O `prospeccao-nativa.md` diz que o
enriquecimento "não busca pessoas físicas ou decisores", e `lib/crm-b2b/enrich.ts` **remove** o
quadro de sócios da resposta da BrasilAPI ("dado pessoal sem finalidade nem caminho de
anonimização"). A finalidade agora existiria, mas o resto do pacote não: **caminho de anonimização
do dono, retenção, export do titular e a avaliação de legítimo interesse específica** (a campanha já
pede uma referência de LIA; ela teria de cobrir este tratamento). Pela doutrina de extensões e de
LGPD do repo, isso é decisão do mantenedor.

**2) O Maps não traz CNPJ.** O caminho técnico é achar o CNPJ e depois ler o quadro societário.
Fontes possíveis, **todas ainda não verificadas por mim no código**:
- CNPJ escrito no rodapé do site ou no Instagram do restaurante (a auditoria de site já lê o HTML);
- Base aberta da Receita (arquivos de estabelecimentos e sócios): nome fantasia + município + CEP +
  CNAE de alimentação para casar com o Maps. Segundo o que li, o CPF dos sócios vem **parcialmente
  mascarado**, e o nome do sócio é aberto. Peso: carregar e indexar a base inteira;
- Fornecedor pago de dados de empresa (custo por consulta; ele passa a ser operador do dado).

**3) LinkedIn.** Recomendo **não** coletar de forma automática. As fontes que li dizem que, no caso
hiQ x LinkedIn, a Justiça de primeira instância decidiu em 2022 que raspar o LinkedIn violava os
termos de uso, e o caso terminou em acordo com a obrigação de parar e apagar os dados (fonte:
resumos de escritórios; não li os autos). Além disso, um dono de pizzaria pequena provavelmente
nem tem perfil, mas isso é palpite meu. Uso **manual**, por uma pessoa, para um lead de alto valor
(rede, franquia) é outra conversa.

**O que mais importa: usar o nome do dono sem ligar para o celular dele.** O valor está em saber
*quem* procurar, não em ter o número pessoal. Dá para mandar a mensagem ao WhatsApp do
estabelecimento e pedir o dono pelo nome. Isso evita tratar o telefone pessoal de alguém que nunca
nos deu esse contato.

| Opção para o dono | O que faz | Risco |
|---|---|---|
| **A. Nome do dono pelo CNPJ, contato continua no número do estabelecimento (recomendada)** | Descobre o nome (base da Receita/CNPJ do site), grava só nome + fonte + confiança, e a Dani pergunta "Falo com o {nome}, responsável pelo {restaurante}?". Se a confiança do casamento for baixa, usa mensagem genérica | Médio: precisa da trilha de LGPD acima; erro de casamento = nome errado (mal-estar) |
| B. Procurar também o celular do dono em fontes públicas ou compradas | Mira direto na pessoa certa | **Alto:** dado pessoal de quem não nos conhece, origem difícil de justificar, risco com o WhatsApp e com a ANPD. Não recomendo |
| C. Não coletar nada externo: a Dani pergunta na conversa "com quem eu falo sobre o cardápio?" e grava a resposta | Zero risco novo | Mais lento; depende de a atendente responder |

Em qualquer opção: **o nome do dono não vai na Msg 1** a menos que o casamento tenha alta confiança
e a gente teste se soa útil ou invasivo. Nomear alguém que não nos conhece pelo cadastro da Receita
pode soar vigilância; é uma variável do teste.

*Não é parecer jurídico.* A base legal (legítimo interesse sobre dado de sócio vindo de base pública)
precisa passar por um advogado de proteção de dados antes de ligar. O texto do art. 7º, §3º da LGPD
que cito de memória (dados públicos exigem respeito à finalidade e à boa-fé) **não foi verificado**
nesta pesquisa.

### 22.5 Medição: o que a literatura exige e por que o caminho C
Pedido seu: "usar a literatura para entender o que precisamos". Resumo do que cada fonte exige e o
que isso força no CRM:

| A literatura diz | Então o CRM precisa de |
|---|---|
| (Blount) o resultado só aparece 30 dias depois da atividade | Leitura **por coorte de semana de envio**, em 7/30/60 dias |
| (Ross) cada degrau do funil tem taxa própria, e prospectar é diferente de fechar | Eventos por degrau e a **passagem para humano** medida à parte |
| (Keenan) o que move é a lacuna certa | Registrar **qual achado** foi usado e comparar a taxa por achado |
| (SPIN/Challenger/Voss) a qualidade da conversa decide | **Etiqueta de objeção e de desfecho** por conversa |
| (Blount) repor o funil | Ver o **estoque de empresas elegíveis** que restam |

Isso pede dois tipos de dado: o que o sistema **já sabe** (resposta, etapa) e o que **só o roteiro e
a Dani sabem** (variante, achado, "disse SIM", PDF enviado, objeção). Por isso o híbrido:
**derivar** o que existe e **gravar** só os marcos declarados.

| Caminho | Veredito |
|---|---|
| **C. Híbrido (escolhido)** | Cada dado tem uma fonte; vocabulário fechado de marcos; uma tela de funil e coortes |
| A. Tabela de eventos para tudo | Mais limpo, mas duplica o que `messages` e `crm_leads` já dizem (doutrina DIRC) |
| B. Só derivar | Frágil: "aceitou SIM" e "qual achado" não estão em nenhuma tabela |

### 22.6 Perguntas que restam (com opções)
1. **Dono do negócio:** A (nome pelo CNPJ, contato no número do estabelecimento) **recomendada**, B, C (§22.4).
2. **Regra de parada:** A conservadora **recomendada**, B moderada, C só alerta (§22.3).
3. **Como a Dani leva ao cadastro:**
   - **A. Cadastro assistido** (a Dani coleta nome, e-mail e CNPJ e dispara a integração que já existe) **recomendada**;
   - B. Só o link de cadastro (mais simples, atribuição fraca);
   - C. Os dois: assistido para quem aceitou, link para quem prefere sozinho.
4. **Medir teste e assinatura:** A (Manero avisa o CRM) **recomendada**, B (consulta em lote), C (conferência humana) (§22.2).

---

## 23. Decisões fechadas e mensagens v1 (Ricardo, 09/11/2026)

### 23.1 Registro de decisões
| # | Decisão | Origem |
|---|---|---|
| D1 | Análise feita **pelo sistema**, entregue em **PDF** assinado pela **Manero** | rodadas 2 e 3 |
| D2 | Análise parte do que a **Manero resolve** (cardápio digital); nicho inicial **pizzarias e hamburguerias** em **Goiânia e Aparecida** | rodadas 2 e 4 |
| D3 | Msg 1 com **saída didática "SAIR"** | rodada 3 |
| D4 | **2 envios no total** para quem não responde (abertura + 1 lembrete) | rodada 3 |
| D5 | Meta: **venda direta** (prioridade) e reunião como segunda opção | rodada 2 |
| D6 | Teste de **7 dias do Essencial, cartão no início**; a conta nasce no **Vitrine** | rodada 3 |
| D7 | Persona **Dani**, persuasiva e honesta; abre **caso para humano** quando preciso | rodadas 3 e 4 |
| D8 | **Horário 08h-18h** para envios e casos humanos | rodada 4 |
| D9 | **1 número**, variantes sorteadas por empresa na mesma campanha | rodada 4 (decidido por mim, sem objeção) |
| D10 | Medição **híbrida** (derivar o que existe, gravar os marcos) | rodada 4 |
| D11 | **Dono do negócio: opção A**, só o nome pelo CNPJ; contato segue no número do estabelecimento; baixa confiança = mensagem genérica | rodada 4 (escolha) |
| D12 | **Regra de parada conservadora**: pausa e avisa se, nas últimas 30 enviadas, 3 ou mais pedirem SAIR, ou 3 falhas seguidas, ou sessão restrita | rodada 4 (escolha) |
| D13 | **Cadastro assistido** pela integração Deskcomm→Manero que já existe | rodada 4 (escolha) |
| D14 | A Manero **avisa o CRM** quando o teste começa e quando assina (mesmo mecanismo do "Conta criada") | rodada 4 (escolha) |

### 23.2 Uma correção de desenho que as decisões D6 e D13 impõem
Antes eu tratava a variante A como "Vitrine" e a B como "Essencial 7 dias". Com o cadastro
assistido, **a conta é sempre criada no Vitrine**; o teste de 7 dias é um segundo passo, feito pelo
dono no painel (com o cartão). Então:
- A variante deixa de ser "qual plano" e passa a ser **o que a Msg 2 destaca**: **A** destaca
  "grátis e sem cartão"; **B** destaca "7 dias do Essencial (150 produtos e desempenho completo)".
- O funil ganha um degrau: `conta criada (Vitrine) → teste iniciado (cartão) → assinou`. É nele
  que a venda direta acontece, e é por isso que D14 importa.
- Quem passa de 10 produtos no Vitrine é o gatilho natural de upgrade. O PDF pode dizer quantos
  pratos o cardápio costuma ter, sem inventar número: só se o sistema leu o cardápio publicado.

### 23.3 Mensagens v1 (Dani, para validar na Fase 0)
Convenções: pt-BR, até 1 emoji por mensagem, frases curtas, sem urgência falsa, sem prometer
pedido/checkout/iFood/"sem comissão"/"tempo real". Variáveis entre chaves vêm do sistema; só envia
se houver ao menos 2 achados verificáveis.

**Msg 1, abertura**
> Oi, tudo bem? Aqui é a Dani, assistente virtual da Manero, plataforma de cardápio digital para
> restaurantes.
>
> Preparei uma análise do cardápio online do **{Restaurante}** e encontrei **{N} pontos** que
> podem estar afastando clientes que chegam pelo celular.
>
> Quer que eu envie o PDF? É só responder **SIM**.
>
> Se não for o momento, responda **SAIR** e eu não te chamo mais.

*Decidi declarar "assistente virtual" já na Msg 1 por honestidade com quem recebe. Se você quiser
testar sem a declaração, é uma variante a registrar, e eu recomendo manter.*

Variante com o dono (só com alta confiança do casamento, D11):
> Oi, tudo bem? Aqui é a Dani, assistente virtual da Manero. Falo com o **{Nome}**, responsável pelo
> **{Restaurante}**? ...(restante igual)

**Lembrete (única, só para quem não respondeu; mínimo 3 dias depois, dentro de 08h-18h)**
> Oi! Só voltando: a análise do **{Restaurante}** continua pronta. Um exemplo do que ela mostra:
> {achado_secundario}.
>
> Quer receber? Responda **SIM**. Se preferir encerrar, responda **SAIR**.

**Msg 2, após "SIM" (variante A)**
> Aqui está, feita pela Manero para o **{Restaurante}**: 📎 {PDF}
>
> Resumo: **1)** {achado 1} **2)** {achado 2} **3)** {achado 3}
>
> Posso criar o cardápio do {Restaurante} agora, já organizado como {tipo}. É grátis e sem cartão.
> Preciso só do seu **nome**, **e-mail** e **CNPJ**. Pode ser?

**Msg 2, variante B**
> (igual até o resumo) ...
>
> Posso criar o cardápio do {Restaurante} agora e, se você quiser, ativar **7 dias do plano
> Essencial** para testar tudo (150 produtos e desempenho completo). Para ativar o teste a Manero
> pede o cartão, e **só cobra depois dos 7 dias, se você continuar**; dá para cancelar antes.
> Preciso só do seu **nome**, **e-mail** e **CNPJ**. Pode ser?

**Depois do cadastro**
> Pronto! Seu cardápio está criado: {manero_menu_url}. Mandei um e-mail para você criar a senha.
> O próximo passo é {passo único: subir os primeiros pratos / ativar o teste}.

*Regras de borda:* CNPJ inválido ou e-mail já cadastrado (`EMAIL_IN_USE`) não geram erro técnico na
conversa: a Dani explica em uma frase e abre caso para humano. Mais de 1 unidade (`ENTERPRISE`) vai
direto para humano. Nunca pedir senha nem cartão no WhatsApp.

### 23.4 O que ainda precisa ser conferido no código (nada disso foi lido)
1. Como a campanha envia hoje a abertura e como encaixar o roteiro (lembrete, SIM, PDF) no
   `worker.ts` e no turno do agente.
2. Se a ação "avisar outro sistema (webhook)" e as etapas "Criando restaurante / Conta criada" já
   funcionam neste fork, e se o token `dsk_` com escopo de escrita existe.
3. Como o agente anexa **arquivo** numa mensagem de WhatsApp (mídia, bucket, URL assinada).
4. Onde caberia o campo do dono (nome, fonte, confiança) e a anonimização dele.
5. Se o doc de provisionamento ainda reflete o código da Manero (conferir `apps/api/src/routes/deskcomm-integration.ts`).

### 23.5 Próximo passo (escolha uma; a recomendada vem primeiro)
- **A. Mapa técnico conferido (recomendada):** eu leio o código dos 5 pontos acima e devolvo o que
  já funciona, o que falta e o tamanho de cada peça, antes de escrever spec. Evita especificar em
  cima de suposição.
- B. Spec formal agora, a partir deste rascunho, deixando os pontos acima marcados como "a
  conferir".
- C. Fase 0 primeiro, sem código novo: montar à mão o PDF de 3 restaurantes reais de Goiânia e
  rodar a conversa em modo de teste, para validar texto e achados antes de construir.

---

## 24. Mapa técnico conferido no código (09/11/2026)

**Régua:** li o código da `origin/main` do produto (`4d5305a8d`), não da `development`, que está
**56 commits atrás**. Na Manero, `manero_catalog` em `3cca4b77`. Li código; **não rodei nada** e
**não olhei o banco de produção**. Tamanho é estimativa minha: **P** (dias), **M** (1 a 2 semanas),
**G** (mais que isso).

### 24.1 Peça por peça
| # | Peça | O que já existe (onde) | O que falta | Tam. |
|---|---|---|---|---|
| 1 | **Msg 1 (abertura)** | Gerada pela IA do agente publicado, com instrução da campanha + estratégia da auditoria do site (`lib/prospecting/worker.ts` → `gerarAbordagemDeFormulario`). A saída é colada pelo código (`comSaida`), com a palavra por idioma ("PARAR") | **Texto fixo com variáveis** (hoje a IA reescreve a cada envio, então a Msg 1 da §23.3 não sai igual), e a saída "SAIR" como opção da campanha. A palavra `sair` **já bloqueia** (está no vocabulário de `lib/opt-out/deteccao.ts`) | P–M |
| 2 | **Lembrete, "SIM", coleta e mudança de etapa** | O motor de **follow-up** já tem: espera fixa ou "até o horário", ramo **sem resposta** (`no_reply`), **casar resposta** por texto (`match_reply`), mandar **texto fixo** com **mídia** (imagem, vídeo, áudio, documento), **coletar** campos (texto, número, data, CPF…, gravando no negócio), **mover etapa**, etiqueta, tarefa interna (`lib/followup/graph-schema.ts`) | A **mídia é uma URL fixa por nó** (`media_url` é validado como URL; não aceita variável). O PDF é diferente por restaurante, então precisa de **mídia por lead** (ex.: URL lida de um campo do negócio). Conferir: o fluxo entra quando o card cai na etapa "Abordado"; e **o agente e o fluxo não respondem os dois ao mesmo "SIM"** | M |
| 3 | **PDF da análise** | `@react-pdf/renderer` já está no projeto e já gera PDF (`lib/lgpd/atestado-renderer.tsx`, `lib/conversas/exporta-pdf.ts`) | Modelo do PDF da Manero, geração **depois do "SIM"** (job), gravação no Storage e URL assinada para o WAHA | M |
| 4 | **Achados de cardápio** | Auditoria de site: classe do site, problemas, checklist (inclui WhatsApp, telefone, redes, mapa), leitura do HTML (`site-classify.ts`, `leitura-do-html.ts`, `estrategia-site.ts`) | Detectores novos: **tem cardápio legível?** (texto × foto × PDF), **link de iFood/delivery**, cardápio só no Instagram; e o mapa achado → frase do PDF (§11) | M |
| 5 | **Cadastro assistido** | **Pronto nos dois lados.** No Deskcomm, a ação "Avisar outro sistema (webhook)" (`lib/automation/actions/call-webhook.ts`). Na Manero, a rota `apps/api/src/routes/deskcomm-integration.ts`, o consumidor e o retorno pelo MCP (`crm_update_lead` + `crm_move_lead_stage`) | **Configuração**, não código: etapas "Criando restaurante / Conta criada / Falha no cadastro", campos `nome_completo`, `nome_do_restaurante`, `cpf_cnpj`, `segmento`…, token `dsk_` com escrita, segredo. Não conferi se isso já está ligado na sua instalação | P |
| 6 | **Teste e assinatura de volta (D14)** | Na Manero: o cobrança já trata `trialing`/`active` (`apps/api/src/modules/billing/billing.service.ts`), a tabela `deskcomm_provisioning` liga restaurante ↔ `lead_id`, e o cliente MCP já sabe chamar o CRM (`deskcomm-crm.client.ts`) | Na **Manero**: quando o status mudar, achar o lead pela tabela e chamar `crm_update_lead` + mover para "Em teste" / "Assinante" | P–M |
| 7 | **Nome do dono** | O candidato guarda tudo em `prospecting_candidates.data` (jsonb). A anonimização **reescreve o `data` inteiro** (`0370`), o export do titular inclui os dados coletados e a retenção de 365 dias vale para a linha. Cliente da BrasilAPI pronto (`lib/brasil-api/client.ts`) | Achar o **CNPJ** (rodapé do site: M; base da Receita: G), ler o sócio **só para esta finalidade** (hoje `lib/crm-b2b/enrich.ts` descarta o quadro de sócios de propósito), gravar só nome + fonte + confiança, LIA e revisão jurídica, e atualizar o `prospeccao-nativa.md` | M–G |
| 8 | **Variantes A/B** | Nada | Sorteio por empresa, gravado; variante na Msg 1, na Msg 2, no horário | M |
| 9 | **Medição (eventos e tela de funil)** | Estado do envio (`new/queued/sending/sent/skipped/failed`), mensagens, conversas, etapa do negócio | Marcos gravados (variante, achado, SIM, PDF, link, objeção, desfecho), funil por coorte e por achado, linha do tempo por contato | G |
| 10 | **Regra de parada** | Erro de envio **já pausa** a campanha | Gatilho por taxa de "SAIR" e por falhas seguidas, com aviso | P–M |
| 11 | **Persona Dani + conhecimento** | Criação de agente por conversa, base de conhecimento (RAG) | Configuração: prompt, objeções da §17, base da Manero | P |
| 12 | **Caso para humano** | **Pronto:** `request_human_handoff` grava a passagem, silencia o agente e cria o item na Central (`lib/agent-engine/agent/human-handoff.ts`) | Nada; só o critério no prompt | — |
| 13 | **Horário 08h-18h** | **Pronto:** janela de disparo e dias da prospecção por conexão | Configuração | — |

### 24.2 Riscos que precisam de prova antes de construir em cima
1. **Duas vozes no mesmo "SIM":** o agente responde a toda mensagem que chega; o fluxo de
   follow-up também reage ao "SIM". Há código sobre isso (`ceder-turno-ao-retorno.ts`,
   `lib/followup/atendimento.ts`), mas não li como os dois se coordenam.
2. **O lembrete conta no teto da prospecção?** A campanha conta só as tentativas dela (50/dia por
   número). Um follow-up sai pelo envio comum; não conferi se entra na mesma conta do número.
3. **A saída na 2ª mensagem:** a spec da saída conta follow-up como mensagem automática. Com
   "SAIR" na 1ª, isso deixa de importar, mas o rodapé não pode sair duas vezes.
4. **Guarda de "primeiro contato":** o envio da campanha recusa conversa que já teve mensagem de
   saída. O fluxo é outro caminho; conferir que ele aceita mandar o lembrete a quem nunca respondeu.

### 24.3 Ordem proposta (fatias)
| Fatia | Conteúdo | Por que nesta ordem |
|---|---|---|
| **F1, configuração (sem código)** | Funil e campos da integração, persona Dani, base da Manero, horário, ligar a integração de cadastro | Permite a **Fase 0** com o PDF montado e enviado **por uma pessoa** pelo Inbox |
| **F2, roteiro** | Msg 1 com texto fixo, saída "SAIR", lembrete e "SIM" pelo fluxo, mídia por lead, e a prova dos riscos 1, 2 e 4 | É o que tira o humano do meio |
| **F3, medição mínima + regra de parada + A/B** | Marcos, funil por coorte, gatilho de "SAIR" | A literatura manda medir antes de escalar; sem isto a Fase 1 não decide nada |
| **F4, PDF automático + achados de cardápio** | Geração depois do "SIM" | Só vale automatizar o PDF depois de a Fase 0 mostrar que ele funciona |
| **F5, retorno de teste e assinatura** | Na **Manero** | Pequena e em outro repositório; pode correr em paralelo |
| **F6, nome do dono** | Depois do parecer jurídico | Muda uma decisão de produto e de LGPD |

**Destino (doutrina de extensões):** F2, F3 e a mídia por lead são **núcleo** (servem a qualquer
nicho que prospecte); o modelo de PDF, os achados de cardápio e a persona são **da Manero**
(configuração ou extensão). A extensão hoje não tem código nem tela, então os detectores de
cardápio podem ter de entrar no núcleo como "achado de nicho". Decisão do mantenedor.
