# Prospecção com valor primeiro: o que será desenvolvido no CRM

> **Status:** documentação de desenvolvimento, base para o orquestrador. 09/11/2026.
> **Substitui** a spec G1 de links rastreados (`2026-11-09-spec-g1-links-rastreados-e-conversao.md`)
> e atualiza a proposta genérica (`2026-11-09-prospeccao-valor-primeiro-generica.md`).
> **Régua:** código lido na `origin/main` do produto em `4d5305a8d`. Este clone (`development`) está
> 56 commits atrás: **quem for codar aplica a regra 1 da higiene de branches antes de tudo**.
> **Escopo:** só o CRM. O lado do parceiro (quem hospeda a página da análise) está descrito apenas
> como **contrato** (§3); a implementação dele é documento do parceiro, não deste repositório.
> **Destino:** núcleo. **Nenhum nome de cliente no código.**

---

## 1. A decisão que mudou o desenho

**O endereço do CRM nunca aparece para o cliente final.** A página da análise, os botões e o
rastreio de abertura e clique moram no **sistema do parceiro** (a organização que vende; ex.: um
SaaS de cardápio digital). O CRM:

1. gera a análise **durante o atendimento**, com IA, a partir de achados verificados;
2. **publica** a análise no sistema do parceiro pela API dele;
3. recebe de volta o **link público** da página e o agente o envia ao cliente pelo WhatsApp;
4. **consulta** o sistema do parceiro, de hora em hora, para saber o que aconteceu (abriu, clicou,
   cadastrou, testou, comprou) e registra tudo no negócio.

Saem do desenho: links rastreados no domínio do CRM (`/r/<token>`), página do relatório no CRM,
PDF. Ficam: busca, auditoria, roteiro, agente, medição e freio, todos no CRM.

## 2. Fluxo de ponta a ponta

```
CRM                                         SISTEMA DO PARCEIRO          CLIENTE FINAL
───                                         ───────────────────          ─────────────
Busca + auditoria + achados (2+)
Msg 1 (texto fixo, saída) ─────────────────────────────────────────────► WhatsApp
                                                                         "SIM"
Agente gera a análise (IA restrita)
Valida (proibições, sem emoji, só achado verificado)
POST /reports ──────────────────────────► cria a página, devolve URL
Agente envia a URL ────────────────────────────────────────────────────► abre a página
                                          registra abertura, cliques,
                                          cadastro, teste, compra
Cron horário: POST /reports/events:query ► devolve eventos
Marcos na linha do tempo, etapa movida,
painel da campanha
Dúvida → agente marca reunião (agenda do CRM) ou passa para humano
Anonimização LGPD → DELETE /reports/{id} ► página sai do ar
```

## 3. Contrato com o parceiro (v1)

Este é o **único** acoplamento entre os dois sistemas. O CRM é cliente; o parceiro é servidor.

### 3.1 Autenticação
Toda chamada do CRM leva:
- `X-Webhook-Delivery: <uuid>` (único por chamada; idempotência e anti-repetição);
- `X-Webhook-Signature: t=<unix>,v1=<hex>` com
  `v1 = HMAC-SHA256(segredo, "<t>.<X-Webhook-Delivery>.<corpo cru>")`;
- janela de **300 s** pelo `t` assinado; comparação em tempo constante.

É **o mesmo esquema** dos webhooks de saída do CRM (`lib/automation/actions/call-webhook.ts`,
`docs/integracao/webhooks-de-saida.md`), então o parceiro reusa o verificador que já tenha.
O segredo é gerado por organização, mostrado uma vez e guardado cifrado (`fn_encrypt_oauth`).

### 3.2 `GET {base}/health`
Resposta `200 {"ok": true, "contract_version": 1}`. Usado pelo botão "Testar conexão".

### 3.3 `POST {base}/reports` (publicar uma análise)
Corpo:
```json
{
  "contract_version": 1,
  "report_ref": "uuid gerado pelo CRM (idempotência)",
  "locale": "pt-BR",
  "generated_at": "2026-11-10T13:00:00Z",
  "campaign": { "id": "uuid", "name": "Pizzarias Goiânia nov/26" },
  "company": {
    "name": "Pizzaria X",
    "segment": "pizzaria",
    "city": "Goiânia",
    "state": "GO",
    "google_maps_url": "https://maps.google.com/...",
    "website": "https://...",
    "rating": 4.6,
    "reviews_count": 480
  },
  "texts": { "headline": "Análise do cardápio online", "intro": "Olhamos o que um cliente encontra..." },
  "findings": [
    { "code": "sem_cardapio_proprio", "weight": 3,
      "what_we_saw": "No Google, o link de vocês leva para o Instagram.",
      "what_it_causes": "Quem quer ver o preço precisa mandar mensagem e esperar.",
      "how_to_fix": "Um cardápio com link próprio, com preço e foto." }
  ],
  "seller_contact": { "whatsapp_e164": "+5562..." }
}
```
- `findings`: de 2 a 5, já em ordem; textos sem emoji, sem HTML (o parceiro escapa tudo).
- **Só dado da empresa.** Nenhum dado pessoal de quem atende o WhatsApp.
- `seller_contact.whatsapp_e164` é o número **da conexão que está prospectando**, para o botão
  "tirar dúvida" da página voltar à mesma conversa.
- O parceiro decide o visual, os botões de ação (cadastro, exemplo) e o domínio.

Resposta `201` (ou `200` se `report_ref` já existe, com o mesmo conteúdo):
```json
{ "report_id": "id do parceiro", "url": "https://parceiro.example/analise/<token>", "expires_at": null }
```
Erros: `400` corpo inválido, `401` assinatura, `409` `report_ref` reusado com conteúdo diferente,
`422` regra do parceiro (ex.: segmento não atendido), `5xx` falha. O CRM só repete em `5xx`/timeout.

### 3.4 `POST {base}/reports/events:query` (consultar eventos)
Corpo: `{ "report_ids": ["...", ...], "since": "ISO-8601" }` (até 100 ids).
Resposta:
```json
{ "results": [
  { "report_id": "...",
    "events": [
      { "event_id": "único no parceiro", "type": "report_opened",
        "occurred_at": "ISO-8601 UTC" },
      { "event_id": "...", "type": "purchase", "occurred_at": "...",
        "value_cents": 6900, "currency": "BRL" } ] } ] }
```
Tipos v1 (vocabulário fechado): `report_opened`, `example_clicked`, `action_clicked`,
`whatsapp_clicked`, `signup`, `trial_started`, `purchase`, `cancellation`.
Id desconhecido é ignorado; evento repetido é ignorado pelo `event_id`.
O filtro de robô (prévia de link do WhatsApp) é **responsabilidade do parceiro**, que vê a requisição.

### 3.5 `DELETE {base}/reports/{report_id}` (revogar)
`204`. A página passa a mostrar "conteúdo indisponível". Chamado na anonimização LGPD e quando o
operador revoga.

### 3.6 Esclarecimentos do contrato v1 (respostas às perguntas da Manero, 09/11/2026)
Valem como parte do contrato. Perguntas no documento da Manero:
`manero_catalog/docs/superpowers/specs/2026-11-09-deskcomm-prospecting-report-design.md`.

| # | Pergunta | Resposta do CRM |
|---|---|---|
| Q1 | Reenvio reusa delivery e corpo? | **Sim.** O CRM guarda o corpo cru da publicação e, ao repetir (5xx, timeout ou 429), reenvia **os mesmos bytes**, incluindo `generated_at`, com o **mesmo** `X-Webhook-Delivery`. Só a assinatura (`t`) é nova |
| Q2 | Assinatura sem corpo (GET /health, DELETE) | `v1 = HMAC(segredo, "<t>.<delivery>.")`, isto é, corpo vazio |
| Q3 | `409 REPORT_REVOKED` | Serve. O CRM trata como **terminal** (não repete) e marca a análise como revogada |
| Q4 | 429 com `Retry-After` | **Repetível**, respeitando o `Retry-After` (teto de 3 tentativas por rodada) |
| Q5 | Palavra de saída na página | Acrescentado `seller_contact.opt_out_word` (string, ex.: "SAIR"), vindo da campanha (PR-06). A página usa essa palavra |
| Q6 | O CRM barra proibições e emoji? | **Sim**, antes de publicar (PR-04, passo 3). O 422 da Manero para emoji/HTML é defesa extra e bem-vinda |
| Q7 | Como o CRM escolhe o `since`? | Marca d'água por conector: o `recorded_at` mais recente já recebido, **menos 10 minutos** de sobreposição; duplicatas caem pelo `event_id`. Filtrar por `recorded_at` do lado da Manero está certo |
| Q8 | Corte de 500 eventos por relatório | Aceito |
| Q9 | Distinguir "dúvida" de "apresentação" | **Sim.** `whatsapp_clicked` sai do vocabulário e entram `question_clicked` e `meeting_clicked` |
| Q10 | Conta do provisionamento gera `signup`? | **Não se aplica:** o cadastro assistido está desligado nesta funcionalidade; o dono cria a conta pelo link |
| Q11 | Parar de consultar depois de `purchase` perde o `cancellation` | **Corrigido:** o CRM consulta cada análise por até **120 dias** depois da publicação, com ou sem `purchase`; para antes só com `cancellation` ou revogação (PR-05) |
| Q12 | DELETE de id desconhecido/revogado | `204` idempotente está certo |

**Campo acrescentado:** cada evento devolvido em `events:query` leva também `recorded_at` (quando
o parceiro gravou o evento), além de `occurred_at`. É sobre `recorded_at` que o CRM calcula a marca
d'água (Q7). Campo a mais, compatível com a v1; conferir na primeira integração.

Vocabulário de eventos v1, depois dos esclarecimentos: `report_opened`, `example_clicked`,
`action_clicked`, `question_clicked`, `meeting_clicked`, `signup`, `trial_started`, `purchase`,
`cancellation`.

## 4. Histórias do CRM

Cada história: o quê, regras, critérios de aceite, dependências, onde mexe (provável, a conferir) e
a prova. Doutrina transversal na §5.

### PR-01 · Conector de parceiro por organização
**O quê:** o administrador cadastra o sistema do parceiro: URL base (https), segredo gerado pelo CRM
(mostrado uma vez), ativo/inativo; vê a saúde (último sucesso, último erro, falhas seguidas) e um
botão **Testar conexão** (`GET /health` assinado).
**Regras:** anti-SSRF na gravação e em toda chamada (`assertSafeOutboundUrl` +
`assertDestinoResolvidoSeguro`); só `admin`; segredo nunca volta ao navegador; um conector por
organização na v1.
**Aceite:** salvar, testar com sucesso contra um receptor real, ver erro legível com URL errada,
segredo errado e timeout; auditoria de criar/alterar/girar segredo.
**Depende de:** nada. **Mexe em:** tabela nova `partner_connectors`; rotas `/api/v1/…`; tela em
**Configurações › Conversões** (`/app/settings/conversoes`), seção nova.
**Prova:** unidade (assinatura idêntica à dos webhooks de saída, com o vetor de referência do doc),
invariante RLS 2 organizações, E2E pela tela com receptor HTTP real.

### PR-02 · Catálogo de achados da organização e detectores novos
**O quê:** cada organização monta o seu catálogo (decisão: sem modelos prontos): código, detector
(escolhido de uma lista fechada), as três frases (o que vimos / o que causa / como resolver, com
variáveis `{empresa}`, `{avaliacoes}`, `{nota}`), peso, e se o detector **exclui** a empresa.
**Detectores** (lista fechada no código): os que a auditoria já mede (`sem_site`,
`link_principal_e_rede_social`, `site_fora_do_ar`, `site_inseguro`, `nao_mobile`, `lento`,
`construtor_pronto`, `sem_whatsapp_no_site`, `sem_mapa`, `sem_fotos`) e os novos:
`conteudo_comercial_nao_legivel` (cardápio, catálogo ou tabela de preços em imagem/PDF ou ausente),
`depende_de_marketplace` (domínios configuráveis), `usa_concorrente` (domínios configuráveis),
`muitas_avaliacoes_sem_canal` (limite configurável), `nota_baixa` (limite configurável).
**Regras:** só citável o que é **medido e definitivo** (`citavelNoArgumento`); elegível com 2+
achados citáveis; a tela de seleção da campanha mostra os achados de cada empresa e quem é inelegível
e por quê.
**Aceite:** montar catálogo pela tela; rodar auditoria numa busca real e ver os achados por empresa;
empresa com 1 achado aparece como inelegível com motivo.
**Depende de:** nada. **Mexe em:** `lib/prospecting/site-classify.ts`, `leitura-do-html.ts`,
`estrategia-site.ts`; armazenamento do catálogo (a decidir na implementação: tabela própria ou
`organizations.settings` com Zod central, anti-pattern 6); tela em Prospecção.
**Prova:** unidade por detector com HTML real gravado como fixture; E2E da seleção.

### PR-03 · Oferta da campanha
**O quê:** na campanha, bloco **Oferta**: nome, descrição curta, conector (PR-01), textos da análise
(título, abertura), **proibições** (lista de termos que a análise e o agente não podem usar), **mapa
de evento → etapa** (`signup` → "Conta criada", `trial_started` → "Em teste", `purchase` → "Assinante"…)
e o tipo de agendamento para reunião de apresentação.
**Regras:** bloco opcional; campanha antiga segue igual; trocar a oferta depois de iniciada só com a
campanha pausada e auditado (como `adjust_pace`).
**Aceite:** configurar pela tela; campanha sem conector não oferece análise.
**Depende de:** PR-01. **Mexe em:** `campaignConfigSchema` (`lib/prospecting/schema.ts`), tela da campanha.

### PR-04 · Gerar e publicar a análise no atendimento
**O quê:** ferramenta do agente `prospeccao_publicar_analise` (sem argumentos que escolham empresa,
contato ou organização: tudo vem da conversa e do candidato). Ela:
1. junta os achados citáveis do candidato e as frases do catálogo;
2. pede à IA para **ajustar** as frases ao caso (sem inventar dado), com saída estruturada;
3. **valida**: 2 a 5 achados, só códigos do candidato, nenhuma proibição, nenhum emoji, tamanho;
4. publica (`POST /reports`, idempotente por `report_ref`);
5. grava o registro e devolve ao agente a **URL** para enviar.
**Regras:** uma análise por candidato por campanha (repetir devolve a mesma URL); falha do parceiro
vira resposta honesta do agente ("vou te mandar em instantes") e um aviso na Central, nunca um link
quebrado; custo de IA registrado como os demais.
**Aceite:** no teste do agente e numa conversa real de ensaio, "SIM" gera a análise, o parceiro de
teste recebe o corpo do §3.3 e a URL chega no WhatsApp; proibição no texto da IA é barrada.
**Depende de:** PR-01, PR-02, PR-03. **Mexe em:** runtime de ferramentas do agente
(`lib/ai/runtime/tools.ts`, `lib/mcp/tools/`), tabela nova `prospecting_reports`.
**Prova:** **prova em par** (DoD 12): a tela pelo agente e a ferramenta chamada direto, com o mesmo
texto cru, concordando.

### PR-05 · Consulta de eventos do parceiro
**O quê:** cron `/api/v1/cron/partner-report-events` **de hora em hora**: por organização com
conector ativo, consulta os relatórios com até **120 dias** de publicados, sem `cancellation` e não
revogados (ver §3.6, Q11), em lotes de 100, timeout 10 s, até 5 lotes por rodada; `since` pela marca
d'água do conector menos 10 minutos (Q7); 429 repetível com `Retry-After` (Q4).
**Efeitos por evento novo:** grava em `prospecting_report_events` (único por `event_id`), atividade
na linha do tempo do negócio (constante compartilhada, nunca string solta), evento
`prospecting.report_event`, e move a etapa pelo mapa da oferta com ator de sistema e auditoria.
**Regras:** audita **só quando houve efeito** (cerca `cron-audita-so-quando-ha-efeito`); 3 falhas
seguidas abrem aviso na Central; resposta fora do contrato é descartada e registrada; registrar no
`docker/scheduler/entrypoint.sh` e em `scripts/dev-crons.ts`.
**Aceite:** receptor real devolve `report_opened` e `signup`; a linha do tempo mostra os dois; a
etapa muda; repetir a rodada não duplica.
**Depende de:** PR-01 (e dados de PR-04).

### PR-06 · Roteiro da campanha
**O quê:** Msg 1 com **texto fixo e variáveis** (`{empresa}`, `{n_achados}`, `{achado_principal}`)
sem a IA reescrever; **palavra de saída configurável** (do vocabulário de `lib/opt-out/deteccao.ts`,
ex.: SAIR) e texto do rodapé configurável; **lembrete único** (padrão 3 dias úteis) com
`{achado_secundario}`; **retomada** única depois da análise (padrão 2 dias úteis); **teto de 2 envios**
a quem nunca respondeu; nada depois do silêncio final. Sobre o motor de follow-up que já existe.
**Riscos a provar primeiro** (mapa técnico §24.2 do rascunho): o agente e o fluxo respondendo ao
mesmo "SIM"; o lembrete contar no teto diário do número; a guarda de primeiro contato barrar o lembrete.
**Aceite:** em ensaio com números do time, Msg 1 sai **igual** ao texto configurado; lembrete sai no
prazo e só para quem não respondeu; terceira mensagem nunca sai; "SAIR" bloqueia.
**Depende de:** nada (PR-02 para as variáveis de achado). **Mexe em:** `lib/prospecting/worker.ts`,
`rodape-de-saida.ts`, `lib/followup/`.

### PR-07 · Estilo do agente: "sem emoji" e reunião de apresentação
**O quê:** opção do agente **sem emoji** com **trava no envio** (o texto perde emoji antes de sair;
base: a limpeza que a resposta em áudio já faz em `textoFalavel`); a reunião usa as ferramentas de
agenda que já existem (`crm_find_and_book_appointment`…) no tipo de agendamento da oferta.
**Aceite:** com a opção ligada, um texto do modelo com emoji sai sem; o agente de teste marca uma
reunião num horário livre e ela aparece na agenda.
**Depende de:** nada (PR-03 para o tipo de agendamento).

### PR-08 · Medição: marcos, painel da campanha, freio e A/B
**O quê:**
- **Marcos** (vocabulário fechado): `elegivel`, `variante`, `msg1_enviada`, `lembrete_enviado`,
  `respondeu`, `aceitou_analise`, `analise_publicada`, `analise_enviada`, os 8 eventos do parceiro,
  `reuniao_marcada`, `pediu_humano`, `objecao:<tipo>`, `saiu`, `silencio_final`. Derivados quando o
  sistema já sabe; gravados quando só o roteiro, o agente ou o parceiro sabem.
- **Painel da campanha** em Prospecção: funil degrau a degrau com N; coorte por semana de envio lida em
  7/30/60 dias; comparação de variantes; taxa por achado principal; objeções; custo (busca + IA) por
  cadastro e por compra; saúde do número.
- **Freio do número:** pausa e avisa com 3+ saídas nas últimas 30 enviadas, 3 falhas seguidas ou
  sessão restrita (limites por campanha).
- **A/B:** sorteio por empresa ao entrar na fila, registrado; primeira variável: Msg 1 com × sem o
  achado principal.
**Aceite:** numa campanha de ensaio, cada passo aparece no painel e na linha do tempo; o freio pausa
quando provocado.
**Depende de:** PR-05, PR-06.

### PR-09 · LGPD e retenção
**O quê:** a anonimização do contato **revoga** a análise no parceiro (`DELETE`), apaga o retrato do
corpo enviado e desvincula eventos; o export do titular inclui análise enviada e eventos; retenção de
365 dias como o candidato; a avaliação de legítimo interesse da campanha passa a citar a publicação
em sistema de terceiro.
**Depende de:** PR-04, PR-05.

### Fora desta rodada
- **PR-10 · Nome do dono** pelo CNPJ (depois de parecer jurídico).
- Vários conectores por organização; contrato v2.

## 5. Doutrina transversal (vale para toda história)

- **Higiene de branches:** começar com `git fetch origin && git merge origin/main`; nunca
  `reset --hard`; um branch por história ou por onda.
- **Migrations:** toda tabela nova com `organization_id … on delete cascade`, RLS
  `tenant_isolation_<tabela>_all` via `fn_user_org_ids()`, zero escrita para `anon`/`authenticated`,
  `revoke execute … from public, anon` em função nova; arquivo versionado com `-- manifest:` **e**
  apêndice idempotente no `baseline.sql`; número por `pnpm checar:colisao-de-migration`.
  **Histórias que mexem em schema rodam uma de cada vez** (PR-01, PR-02 se for tabela, PR-04, PR-05,
  PR-08), para não colidir número.
- **API:** `ok()`/`fail()`, Zod em todo input externo, `requireRole`, `requireSupportWrite(` antes do
  efeito, auditoria de toda mutação, rate limit.
- **Admin client** só com `organization_id` filtrado, vindo de fonte confiável; ferramenta do agente
  tira organização, contato e campanha **da linha**, nunca do modelo.
- **Trigger Postgres nunca faz HTTP:** toda chamada ao parceiro sai de worker/cron/rota.
- **Sem `console.log`;** logger estruturado; nada de dado pessoal em log.
- **Marca:** nada de nome de cliente no código (vigiado por `tests/unit/branding.test.ts`).
- **Testes:** `pnpm test:unit` sem caminho (rodapé + exit code são a autoridade), `pnpm test:db` em
  toda mudança de schema/RLS, E2E pela tela em banco fresco do `baseline.sql`, receptor HTTP real
  para o parceiro; evidência em `evidence/<entrega>/`.
- **Sistema vivo e porta:** cada peça com entrada, saída, log, tela, porta na navegação, anti-morte e
  laço de retorno; mapa em `docs/architecture/`.
- **Fragmento** em `.changes/` (`capacidade_nova`) por PR que muda comportamento visível.

## 6. Ordem e paralelismo (para o orquestrador)

| Onda | Histórias | Observação |
|---|---|---|
| 1 | **PR-01** (schema), **PR-06**, **PR-07** | PR-06 e PR-07 não mexem em schema; podem correr junto com a PR-01 |
| 2 | **PR-02**, **PR-03** | PR-02 só entra em schema depois da PR-01 fechar o número da migration |
| 3 | **PR-04** (schema), depois **PR-05** (schema) | Precisam do conector e da oferta |
| 4 | **PR-08** (schema), **PR-09** | Medição fecha o laço; LGPD por último porque toca tudo |

**Dois agentes nunca mexem no mesmo arquivo ao mesmo tempo.** Arquivos de alto atrito:
`lib/prospecting/schema.ts`, `lib/prospecting/worker.ts`, `supabase/baseline.sql`.

## 7. Glossário
- **Parceiro:** a organização que vende e hospeda a página da análise (o sistema dela fala o
  contrato da §3).
- **Análise:** o conteúdo gerado pelo CRM (achados + textos), publicado no parceiro.
- **Achado citável:** medido e definitivo pela auditoria.
- **Marco:** um degrau do funil registrado por contato.
