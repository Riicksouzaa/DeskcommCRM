# Spec G1: links rastreados por contato e consulta de conversão

> **⚠ SUBSTITUÍDA em 09/11/2026** por `2026-11-09-prospeccao-crm-historias.md`: o endereço do CRM
> não pode aparecer para o cliente final, então a página da análise e o rastreio de cliques passam a
> morar no sistema do parceiro, e o CRM publica e consulta pela API dele. Fica como histórico.
>
> (Status anterior: aprovada em 09/11/2026 com as 7 decisões da §8 na opção A.)
> **Fatia G1** da proposta `2026-11-09-prospeccao-valor-primeiro-generica.md` (decisão 6 = A).
> **Régua:** código lido na `origin/main` do produto em `4d5305a8d` (09/11/2026). A `development`
> deste clone está 56 commits atrás; antes de codar, aplicar a regra 1 da higiene de branches.
> **Destino:** **núcleo**. Nenhuma regra de cliente; a Manero aparece só como exemplo.

---

## 1. Por que existe

Na prospecção "valor primeiro", o cliente cria a conta sozinho pelo link (decisão 1 = A). Sem esta
fatia, o CRM sabe que mandou o link e **não sabe mais nada**: nem se a pessoa clicou, nem se ela
se cadastrou, testou ou comprou. A venda direta, que é a meta, fica invisível, e nenhuma
comparação da literatura (taxa por degrau, coorte, achado) chega até o resultado.

O GoHighLevel resolve a primeira metade com **Trigger Links** (link rastreado por contato que
registra o clique e pode mover etapa). A segunda metade aqui é uma **consulta** que o CRM faz ao
sistema do cliente (decisão 5 = B).

## 2. Escopo

**Entra:**
1. **Oferta da campanha** com link de ação, link de exemplo e o nome do parâmetro de atribuição.
2. **Links rastreados por contato**: geração, redirecionamento, registro do clique, filtro de robô
   de prévia, opção de mover etapa no clique.
3. **Conector de consulta de conversão** por organização: o CRM pergunta ao sistema do cliente o que
   aconteceu com cada `ref` e registra cadastro, teste, compra e cancelamento.
4. **Ferramenta do agente** que devolve os links rastreados da conversa, para a Dani (ou qualquer
   agente de prospecção) mandar.
5. **Visibilidade mínima**: linha do tempo do negócio e contadores no resumo da campanha.

**Fica para depois:** relatório web (G3, que vai reusar a infraestrutura de token desta fatia),
roteiro com texto fixo (G2), painel completo com coortes e A/B (G5).

## 3. O que já existe e será reaproveitado (medido)

| Peça | Onde | Como serve |
|---|---|---|
| Link público rastreável **de anúncio** | `app/api/v1/rastreio/[id]/route.ts`, tabela `ad_tracking_links`, `lib/plataformas-de-anuncio/rastreio/` | **Padrão a copiar**, não a tabela: ele é por campanha de anúncio e leva ao WhatsApp (entrada). O nosso é **por contato** e leva para fora (saída). Copiar: org resolvida só pela linha, `no-store`, `no-referrer`, rate limit por id+IP, página neutra quando o link não existe |
| Caminho público com âncora | `lib/auth/public-paths.ts` | Uma linha nova, ancorada, para a rota do link |
| Rate limit | `checkRateLimit` (`lib/ai/dispatcher/rate-limit.ts`) | Clique e consulta |
| Anti-SSRF de saída | `assertSafeOutboundUrl` (`lib/automation/outbound-url.ts`) + `assertDestinoResolvidoSeguro` (`outbound-ip.ts`) | Validar a URL do conector e o destino dos links |
| Assinatura de requisição de saída | Esquema `X-Webhook-Signature: t=,v1=` de `lib/automation/actions/call-webhook.ts` e `docs/integracao/webhooks-de-saida.md` | O conector assina a consulta do mesmo jeito; o cliente reaproveita o verificador que já escreveu |
| Cifra de segredo | `fn_encrypt_oauth` / `fn_decrypt_oauth` (`lib/webhooks/secrets.ts`) | Segredo do conector |
| Cron | `docker/scheduler/entrypoint.sh` + `scripts/dev-crons.ts` | Rodada de consulta |
| Linha do tempo | `crm_lead_activities` (vocabulário aberto, constante compartilhada) | Clique e conversão aparecem no negócio |
| Mover etapa | o mesmo escritor do board/automação (`moveLeadHandler`) | Etapa por evento |
| Anonimização do candidato | `0370` reescreve o `data` do candidato | Estender para os links e conversões do contato |

## 4. Desenho

### 4.1 Oferta (na configuração da campanha)
Novo bloco validado por Zod em `prospecting_campaigns.config` (`campaignConfigSchema`):

```ts
oferta: {
  nome: string;                 // "Cardápio digital Manero"
  link_acao: string;            // https, validado anti-SSRF
  link_exemplo?: string;        // https
  parametro_ref: string;        // padrão "ref"; nome da query que o sistema do cliente lê
  ao_clicar_acao?: { mover_para_etapa_id: uuid } // opcional, desligado por padrão
}
```
Campanha gravada antes da chave segue igual (bloco opcional, `.optional()`; sem ele, nada de link).

### 4.2 Links rastreados
**Tabela nova, genérica** (o nome não diz "prospecção" porque follow-up e campanha em massa vão
querer o mesmo): `tracked_links`.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid | interno |
| `organization_id` | uuid not null → organizations, cascade | RLS `tenant_isolation_tracked_links_all` |
| `token` | text not null, **unique global** | o que vai na URL; 16 caracteres base62 aleatórios (~95 bits) |
| `ref` | text not null | o que vai para o sistema do cliente; **um por contato por origem**, compartilhado pelos links de ação e exemplo |
| `purpose` | text + check (`acao`, `exemplo`) | `relatorio` entra na G3 |
| `origin_kind` | text + check (`prospecting_campaign`) | polimórfico **padronizado** (anti-pattern 8) |
| `origin_id` | uuid not null | id da campanha |
| `contact_id`, `lead_id`, `conversation_id` | uuid, `on delete set null` | |
| `destination_url` | text not null | cópia do link da oferta no momento da geração |
| `first_clicked_at`, `last_clicked_at` | timestamptz | |
| `click_count` | int default 0 | |
| `disabled_at` | timestamptz | anonimização e "desligar" |
| `created_at` | timestamptz | |

Únicos: `(organization_id, origin_kind, origin_id, contact_id, purpose)` e `(organization_id, ref, purpose)`.

**Sem tabela de cliques.** Contadores bastam para a G1 (doutrina DIRC: não duplicar o que não tem
uso), e não se guarda IP nem navegador de ninguém.

**Geração:** uma função `linksDoContato(org, origem, contato)` cria (ou devolve, idempotente) os
dois links. Chamada pela ferramenta do agente (§4.4) e, na G2, pelas variáveis do roteiro.

**Rota pública:** `GET /r/<token>` (16 caracteres base62), com a linha
`/^\/r\/[0-9A-Za-z]{16}$/` em `public-paths.ts`.
1. Valida o formato; rate limit por token+IP (30/min, como o rastreio de anúncio).
2. Busca a linha pelo `token` com o cliente admin; a organização vem **só da linha**.
3. Inexistente ou desligado → página neutra, sem dizer por quê.
4. **Filtro de robô de prévia** (ver §6, risco 1): se o `User-Agent` for de prévia de link
   (`WhatsApp`, `facebookexternalhit`, `Facebot` e afins) **não conta** o clique.
5. Conta o clique: atualiza `first/last_clicked_at` e `click_count` numa única instrução.
6. No **primeiro** clique: grava atividade no negócio (`TIPO_LINK_CLICADO`), emite o evento
   `tracked_link.clicked` (consumidores: a linha do tempo e, se configurado, o mover de etapa).
7. Redireciona (302) para `destination_url` com `?<parametro_ref>=<ref>` acrescentado, com
   `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.

Falha ao gravar o clique **não** impede o redirecionamento (a pessoa chega ao destino; perde-se o
dado, e isso vai para o log), como já faz o rastreio de anúncio.

### 4.3 Conector de consulta de conversão (por organização)

**Configuração** (tabela nova `conversion_connectors`, uma por organização na G1):

| Campo | Nota |
|---|---|
| `url` | https; anti-SSRF na gravação **e** a cada chamada (DNS pode mudar) |
| `secret_encrypted` | cifrado por `fn_encrypt_oauth`; nunca volta ao navegador |
| `event_stage_map` | jsonb validado: `{ cadastro?: etapa_id, teste?: etapa_id, compra?: etapa_id, cancelamento?: etapa_id }` por funil |
| `enabled` | |
| `last_success_at`, `last_error_at`, `last_error`, `consecutive_failures` | saúde, visível na tela |

**Contrato (CRM → sistema do cliente):**
```
POST <url>
Content-Type: application/json
X-Webhook-Signature: t=<ts>,v1=<hex>        (mesmo esquema dos webhooks de saída)
X-Webhook-Delivery: <uuid>

{ "type": "conversion.query", "refs": ["<ref>", ...]   // até 100
, "since": "2026-11-01T00:00:00Z" }
```
Resposta esperada (validada por Zod; o que não passar é descartado e registrado):
```json
{ "results": [
  { "ref": "<ref>",
    "events": [
      { "type": "cadastro|teste|compra|cancelamento",
        "external_id": "id do evento no sistema do cliente",
        "occurred_at": "ISO-8601 UTC",
        "value_cents": 6900, "currency": "BRL" } ] } ] }
```
`ref` desconhecido é ignorado; evento repetido é ignorado pelo único
`(organization_id, ref, type, external_id)`.

**Quais `ref` entram na consulta:** os que tiveram **clique no link de ação** nos últimos 60 dias e
ainda não têm `compra` nem `cancelamento`. (Sem clique não há como haver cadastro com `ref`.)

**Rodada:** cron novo `/api/v1/cron/conversion-query`, **a cada hora**, organização por organização,
lotes de 100, timeout de 10 s por chamada, até 5 lotes por organização por rodada.
- **Audita só quando houve efeito** (a regra do `cron-audita-so-quando-ha-efeito`).
- **Falha:** incrementa `consecutive_failures`; na 3ª seguida abre aviso na Central para o
  administrador ("O sistema de conversões não respondeu desde …") — laço de retorno, para o
  conector não morrer calado.

**Efeito de cada evento novo** (tabela nova `tracked_conversions`):
`organization_id, ref, contact_id, lead_id, origin_kind, origin_id, type, external_id, occurred_at,
value_cents, currency, recorded_at`. Depois: atividade no negócio (`TIPO_CONVERSAO_REGISTRADA`),
evento `conversion.recorded`, mover para a etapa mapeada (se houver) pelo escritor de etapa de
sempre, com ator de sistema e auditoria.

**Botão "Testar conexão"** na tela: manda `refs: []` e mostra status, tempo e se a resposta passou
no Zod. Prova pela tela que o cliente integrou certo.

**O que o sistema do cliente precisa fazer** (na Manero, código da Manero, fora deste repo):
ler o parâmetro `ref` na página de cadastro e guardar com a conta; e expor o endpoint acima,
verificando a assinatura, respondendo os eventos daquela `ref`.

### 4.4 Ferramenta do agente
`prospeccao_links` (sem argumentos que escolham contato ou organização): devolve
`{ link_acao, link_exemplo? }` rastreados **desta conversa**. Contato, organização e campanha vêm
da linha da conversa/candidato, nunca do modelo. Só existe para agente que atende conversa de
campanha com oferta configurada. O agente cola os links no texto; a trava de "sem emoji" e as
demais guardas de envio continuam valendo.

### 4.5 Visibilidade (mínima, nesta fatia)
- **Linha do tempo do negócio:** "Clicou no link de ação (dd/mm hh:mm)", "Cadastro registrado pelo
  sistema de conversões", "Compra registrada · R$ 69,00".
- **Resumo da campanha** em Prospecção: clicaram no exemplo · clicaram no link de ação · cadastros
  · testes · compras · valor, cada um com o N.
- **Tela do conector:** URL, segredo (só "definido"), mapa evento → etapa, saúde, testar conexão.

## 5. Schema e doutrina

- Três tabelas novas: `tracked_links`, `conversion_connectors`, `tracked_conversions`. Todas com
  `organization_id … on delete cascade`, RLS `tenant_isolation_<tabela>_all` via
  `fn_user_org_ids()`, **zero grant** a `anon` e `authenticated` para escrita (acesso pelo servidor),
  `revoke … from public, anon` em toda função nova.
- **Migration versionada** com `-- manifest:` + **apêndice idempotente no `baseline.sql`**; número
  pelo `pnpm checar:colisao-de-migration`.
- **LGPD:** a anonimização do contato desliga os links (`disabled_at`), apaga `contact_id/lead_id`
  e mantém só contagens; o export do titular inclui cliques e conversões; retenção de 365 dias,
  como o candidato.
- **Rotas:** a rota `/r/<token>` é pública e só lê/conta; a configuração do conector é
  `/api/v1/...` com `requireRole('admin')`, `requireSupportWrite(` antes do efeito, Zod, `ok()`/`fail()`,
  auditoria. O cron segue o padrão `/api/v1/cron/` com segredo interno.
- **Env nova:** nenhuma (tudo configurado por organização, pela tela).

## 6. Riscos e como a spec trata

1. **Prévia de link do WhatsApp conta clique falso.** O WhatsApp pode buscar a URL para montar a
   prévia, no envio ou no recebimento. Defesa: filtro por `User-Agent` de prévia. **A medir** no
   ensaio: enviar um link para um número de teste e ver o que chega na rota.
2. **Cliente sem endpoint:** sem o conector, o funil para no clique. Isso é aceito; a tela mostra
   "conversões não configuradas".
3. **Consulta lenta ou fora do ar:** timeout, lote limitado, aviso após 3 falhas.
4. **Ref vazado:** o `ref` só identifica o contato para o sistema do cliente; não abre nada no CRM.
   O `token` da URL só redireciona. Nenhum dos dois carrega dado pessoal.
5. **Destino trocado depois do envio:** o link guarda a cópia do destino; mudar a oferta não
   redireciona links antigos para um lugar novo sem querer.

## 7. Provas (Definition of Done)

- **Unidade:** formato e unicidade do token; filtro de prévia; Zod do contrato (aceita, recusa,
  ignora `ref` desconhecido); mapa evento → etapa; idempotência por `external_id`.
- **Invariantes (`pnpm test:db`):** isolamento entre 2 organizações nas três tabelas; anonimização
  desliga links; função nova sem `EXECUTE` para `anon`.
- **E2E pela tela** em banco fresco do `baseline.sql`: configurar oferta e conector; o agente manda
  o link; abrir o link no navegador; ver o clique na linha do tempo; **receiver HTTP real** fazendo o
  papel do sistema do cliente responder um `cadastro`; ver a etapa mudar. Evidência em
  `evidence/g1-links-rastreados/`.
- **Sistema vivo:** entrada (oferta, clique, resposta do cliente) e saída (redirecionamento,
  atividade, etapa); log; tela; porta (Prospecção e a tela do conector); anti-morte (aviso na
  Central); laço de retorno (falha do conector vira aviso e saúde visível); mapa em
  `docs/architecture/`.
- **Fragmento** em `.changes/` com efeito `capacidade_nova`.

## 8. Decisões (todas aprovadas na opção A em 09/11/2026)

1. **Formato do link na mensagem:**
   - **A. `https://<seu-crm>/r/<16 caracteres>` (recomendada).** Curto o bastante para WhatsApp, no
     domínio da instalação, sem serviço externo.
   - B. Reaproveitar o formato do rastreio de anúncio (`/api/v1/rastreio/<uuid>`): mais longo e com
     cara de técnico.
   - C. Domínio curto próprio por organização: mais bonito, exige DNS e certificado por cliente.
2. **Onde mora a oferta:**
   - **A. Na campanha (recomendada).** Cada campanha diz o que vende; nada novo na organização.
   - B. Catálogo de ofertas da organização, escolhido na campanha: reuso, mais tela.
   - C. As duas (catálogo com sobrescrita na campanha).
3. **Frequência da consulta de conversão:**
   - **A. A cada hora (recomendada).** Venda de assinatura não precisa de minuto; carga baixa no cliente.
   - B. A cada 15 minutos.
   - C. Uma vez por dia.
4. **Quais contatos consultar:**
   - **A. Só quem clicou no link de ação, nos últimos 60 dias, sem compra (recomendada).**
   - B. Todos os contatos da campanha.
   - C. Só os últimos 7 dias.
5. **Robô de prévia do WhatsApp:**
   - **A. Ignorar por `User-Agent` e medir no ensaio (recomendada).**
   - B. Mandar a mensagem sem prévia de link (se o WAHA permitir), além do filtro.
   - C. Aceitar o ruído.
6. **Clique no link de ação move etapa?**
   - **A. Opcional por campanha, desligado por padrão (recomendada).**
   - B. Sempre move para uma etapa fixa "Clicou".
   - C. Nunca; só a conversão move.
7. **Onde configurar o conector:**
   - **A. Configurações › Conversões (recomendada).** A tela já existe para "devolver vendas e marcar
     a origem"; é o lugar que um administrador procura.
   - B. Dentro de Prospecção.
   - C. Uma tela nova em Integrações.
