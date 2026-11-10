# Spec: produto cadastrado e roteiro "achado primeiro, solução depois"

> **Status:** proposta para aprovação do Ricardo. Nada aqui foi implementado.
> **Escrita em 10/11/2026**, a partir da decisão do Ricardo de que a campanha abre com um achado
> crítico e a segunda mensagem já apresenta o produto como solução.
> **Régua:** código lido na árvore da `development` deste clone (`lib/prospecting/schema.ts`,
> `estrategia-site.ts`, `config-padrao.ts`, `rodape-de-saida.ts`, `saida-configuravel.ts`, tela
> `app/app/prospecting/_client.tsx`). A `development` está atrás da `main` do produto: **quem for
> codar aplica a regra 1 da higiene de branches antes**. O que não foi aberto está na §10.
> **Destino:** **núcleo**, opt-in por campanha. Teste da doutrina de extensões: "se nenhuma
> organização ativar isto, a operação comum continua inteira?" — sim, campanha sem produto segue
> exatamente como hoje. **Nenhum nome de cliente no código**; a Manero aparece só como exemplo.
> **Relação com outras specs:** complementa `2026-11-09-prospeccao-crm-historias.md` (PR-02, PR-03,
> PR-06). Onde divergem, esta spec diz qual história muda (§2).

---

## 1. O que o Ricardo decidiu

1. **Mensagem 1** diz que a empresa foi analisada, que há o que melhorar, **cita um achado crítico**
   e pergunta se a pessoa quer saber o restante.
2. **Mensagem 2** (só se a pessoa disser que sim) **apresenta o produto como solução**: aponta os
   defeitos e diz como o produto ajuda a resolver cada um.
3. **Toda mensagem oferece a saída** ("pode parar a qualquer momento").
4. O produto vendido precisa ser **cadastrado no sistema**, para a campanha ser focada na venda dele.

Hoje o item 4 não existe: a campanha só escolhe entre `site`, `automacao_crm` e `automacao_n8n`
(`OFERTAS_DA_CAMPANHA`, `schema.ts:18`), e o texto de abordagem sai da situação do site, não do
produto.

## 2. O que já existe e o que esta spec muda

| Peça | Hoje | Spec de 09/11 | Esta spec |
|---|---|---|---|
| O que a campanha vende | enum fixo de 3 ofertas | PR-03: bloco "Oferta" dentro da campanha | **Produto cadastrado e reutilizável** pela organização; a campanha aponta para ele |
| Msg 1 | texto da IA a partir do site | PR-06: fixo, com `{n_achados}`, sem revelar achado | Fixo, **com o achado crítico** |
| Msg 2 | não existe roteiro | análise publicada em página do parceiro | **Texto montado pelo sistema**, com defeitos + solução do produto |
| Página da análise no parceiro | n/a | PR-01, PR-04, PR-05 no caminho crítico | **Sai do caminho crítico**; vira opcional (§9) |
| Saída | `first_message` ou `second_message` | palavra configurável (PR-06) | Novo modo **`every_message`** |
| Catálogo de achados | n/a | PR-02 | Mantido; ganha a ligação **achado → solução do produto** |

A página da análise no parceiro continua desenhada, mas deixa de ser pré-requisito da venda: a Msg 2
já entrega os achados no próprio WhatsApp. Isso encurta o caminho até a primeira campanha de ensaio.

## 3. O produto cadastrado

### 3.1 O que é

Um registro por organização que diz **o que a campanha vende**, em palavras da organização. Não é
um catálogo de e-commerce: é o que a abordagem precisa para falar do produto sem inventar.

Campos (todos texto livre com limite, validados por Zod central):

| Campo | Limite | Para quê |
|---|---|---|
| `nome` | 80 | "Manero" |
| `categoria` | 80 | "cardápio digital para restaurantes". Rótulo livre, **não** enum |
| `resumo` | 300 | uma frase do que é, para a Msg 2 e para o agente |
| `solucoes` | até 12 linhas | **achado → como o produto resolve** (§3.2) |
| `prova` | 300 | demonstração, teste grátis ou preço, **só o que a organização escreve** |
| `link_demo` | URL https | exemplo para a pessoa ver funcionando |
| `proibicoes` | até 20 termos | o que a abordagem e o agente nunca podem dizer ("garantimos", "100%") |

### 3.2 Achado → solução

É o coração da spec. Cada linha liga um **código de achado** do catálogo (PR-02) a uma frase de como
o produto resolve aquele defeito.

```
conteudo_comercial_nao_legivel: o cardápio vira página própria, com foto e preço, que abre rápido
depende_de_marketplace: o pedido chega direto no seu WhatsApp, sem comissão de aplicativo
link_principal_e_rede_social: um endereço único com o cardápio, para colocar na bio e no Google
```

Regra: **achado sem solução cadastrada não entra na Msg 2** como defeito a resolver. A mensagem não
aponta problema que o produto não resolve, porque isso vira diagnóstico sem oferta e esvazia o gancho.

### 3.3 Onde mora

Decisão proposta: **tabela própria por organização** (`prospecting_products`), e não jsonb de
`organizations.settings`. Motivo: o produto é lido por campanhas, por prévia e pelo agente, e precisa
de leitura central e isolamento por tenant (anti-pattern 6, jsonb lock-in).

- `organization_id uuid not null references organizations(id) on delete cascade`, RLS
  `tenant_isolation_prospecting_products_all` com `fn_user_org_ids()`.
- Escrita só para `admin` e `manager` (a decidir em D3), com `requireSupportWrite(` e auditoria.
- A campanha guarda **`product_id`** na `config` e, ao **ativar**, um **retrato** (snapshot) dos
  campos usados. Editar o produto depois **não muda campanha em andamento**: a mensagem que sai tem
  que ser a que o operador aprovou.
- Migration versionada + apêndice idempotente no `baseline.sql` + linha `-- manifest:` (doutrina de
  migrations).

### 3.4 Compatibilidade

Campanha sem `product_id` segue com `ofertas` e com o comportamento de hoje, inclusive o ângulo por
classe de site. Com `product_id`, `ofertas` é ignorado para o texto da abordagem (continua valendo para
a ordenação da fila até a história PX-06). Nenhuma campanha existente muda.

## 4. O roteiro

### 4.1 Escolha do achado crítico

O catálogo (PR-02) dá **peso** a cada achado. O **crítico** é o citável de maior peso que tenha
solução cadastrada. Empate: o de ordem mais antiga no catálogo, para o resultado ser reproduzível.

**Elegibilidade:** a empresa só entra na fila da campanha se tiver **1 achado citável com solução**.
(A spec de 09/11 pedia 2; com a Msg 1 citando um achado, 1 basta, e a Msg 2 lista os que houver.
Ver D2.) Empresa inelegível aparece na tela com o motivo.

**Só é citável o que foi medido e é definitivo** (`citavelNoArgumento`, regra do #3723). Site "não
medido" nunca vira achado.

### 4.2 Mensagem 1 (texto fixo com variáveis, sem a IA reescrever)

```
Olá, {contato}. Aqui é {assina}, da {produto}.
Analisamos a presença digital da {empresa} e vimos pontos que podem estar custando clientes.
Um deles: {achado_critico_curto}.
Quer que eu mostre os outros e como resolver?
Para não receber mais mensagens, responda {palavra_de_saida}.
```

- `{achado_critico_curto}`: frase do catálogo "o que vimos", até 140 caracteres.
- A frase "analisamos" só é verdadeira se a auditoria rodou e o achado é real. A trava de elegibilidade
  da §4.1 é o que a sustenta.
- Sem emoji (PR-07).

### 4.3 Mensagem 2 (texto montado pelo sistema, só após "sim")

```
Combinado. O que vimos na {empresa}:
1. {vimos_1}. {como_resolve_1}
2. {vimos_2}. {como_resolve_2}
{resumo_do_produto}
Veja como fica: {link_demo}
{prova}
Quer que eu te explique como começar?
Para não receber mais mensagens, responda {palavra_de_saida}.
```

- Até **3 achados** com solução, em ordem de peso. Mais que isso vira lista, e lista no WhatsApp perde
  leitura.
- `{como_resolve_n}` vem de `solucoes` do produto, **sem reescrita da IA**: texto da organização,
  auditável. O agente só conduz a conversa depois.
- Falta `link_demo` ou `prova`: a linha some, a mensagem não inventa.

### 4.4 Saída em toda mensagem

Hoje `exit_offer` aceita `first_message` e `second_message` (`schema.ts:83`). Acrescenta-se
**`every_message`**: o rodapé de saída acompanha todo envio automático da campanha. Como
`rodape-de-saida.ts` já grava a palavra a partir de `PALAVRAS_DE_OPT_OUT`, a promessa continua
**verificada contra o detector** (se a palavra sair do detector, o módulo deixa de prometer).

A resposta de saída continua a regra única de `lib/opt-out/deteccao.ts`: bloqueia, e o agente nunca
é quem decide. Ponto a conferir no código: a contagem atômica por `automatic_sends`
(`saida-configuravel.ts`) só trata `second_message`; o modo novo precisa do mesmo cuidado de
reserva e de desfazer em envio falhado.

### 4.5 Depois da Msg 2

- Interesse: o agente da campanha assume (já existe), com o produto na instrução (§5).
- "Não tenho interesse": encerra, sem insistir. Objeção: o agente responde pela lista de objeções do
  produto, se houver.
- Silêncio: **um lembrete** e fim (PR-06). Quem nunca respondeu recebe no máximo 2 envios.

## 5. O que o agente recebe

O bloco de estratégia hoje é só o ângulo do site (`blocoDeEstrategiaParaAgente`). Com produto, o
agente passa a receber: nome, categoria, resumo, as soluções dos achados **daquela empresa**, a prova
e as **proibições**. Regra herdada: nada de texto de terceiro (nome do negócio, trecho do site) na
instrução de `system`; isso fica nos dados.

## 6. Regras de honestidade (valem como teste)

1. **Só dado medido.** Achado não citável não aparece em mensagem nenhuma.
2. **Só promessa cadastrada.** O produto não promete nada que a organização não escreveu.
   Proibições são checadas no texto montado **antes** do envio; texto barrado não sai e abre aviso
   na Central.
3. **A mensagem nunca finge ser pessoa específica** que não é. O campo `assina` é o nome da voz da
   campanha (ex.: "Dani"), cadastrado pela organização.
4. **Saída em todas as mensagens**, e a palavra vem do detector.
5. **LGPD:** a campanha segue a base de legítimo interesse já documentada; o achado vem de dado
   público do próprio negócio.

## 7. Histórias

### PX-01 · Cadastro do produto
Tela em Prospecção (ou Configurações) para criar, editar e arquivar produtos; tabela
`prospecting_products`; rotas `/api/v1/prospecting/products` com `ok()`/`fail()`, Zod,
`Idempotency-Key` na criação, auditoria, `requireSupportWrite(`.
**Aceite:** criar pela tela; editar; arquivar; produto de outra organização nunca aparece.
**Prova:** invariante RLS com 2 organizações (`pnpm test:db`), unidade das validações, E2E pela tela.

### PX-02 · Achado → solução
Campo `solucoes` do produto, com a lista de códigos vinda do catálogo (PR-02). Sem catálogo ainda,
usa os detectores que a auditoria já mede.
**Aceite:** linha com código inexistente é recusada; achado sem solução não entra na Msg 2.

### PX-03 · Produto na campanha
Seletor "Produto" no bloco da campanha; `product_id` na `config`; **snapshot** na ativação;
`ofertas` preservado para campanha antiga.
**Aceite:** campanha ativada guarda o retrato; editar o produto não altera a campanha ativa.

### PX-04 · Achado crítico e elegibilidade
Escolha determinística do crítico (§4.1), elegibilidade e motivo de inelegibilidade na tela de
seleção.
**Aceite:** empresa com 1 achado com solução é elegível; sem achado, aparece com o motivo.

### PX-05 · Roteiro Msg 1 e Msg 2
Texto montado com variáveis (§4.2, §4.3), validado contra proibições e emoji; envio da Msg 2
disparado pelo "sim" do cliente.
**Aceite (prova em par, DoD 12):** em ensaio com números do time, a Msg 1 sai **igual** ao texto
configurado e a Msg 2 traz só achados com solução; o mesmo texto pela tela do agente e pela ferramenta
chamada direto, concordando.

### PX-06 · Saída `every_message`
Novo valor do enum, contagem e reserva atômicas, desfazer em falha.
**Aceite:** a Msg 1, a Msg 2 e o lembrete levam o rodapé; "SAIR" bloqueia; envio falhado não consome
a reserva.

### PX-07 · Fila pelo produto
Ordenação da fila usa os pesos dos achados do catálogo, e não os pesos de `ofertas`.
Só depois de PX-04.

## 8. Provas obrigatórias

- **Unidade:** montagem das mensagens, proibições, corte de caracteres, achado sem solução.
- **Invariante `test:db`:** RLS de `prospecting_products` com 2 organizações; migration em
  `install` e `update`.
- **E2E pela tela (DoD 12):** banco fresco estilo VPS, sem envs opcionais: cadastrar produto, criar
  campanha, ver elegíveis, ativar, ver a Msg 1 e a Msg 2 na prévia.
- **Receiver real** se houver webhook (`product` não faz HTTP; a spec de parceiro é à parte).
- **Cerca:** teste que reprova campanha com produto cuja Msg 2 cite achado sem solução.
- Fragmento em `.changes/` como `capacidade_nova`. Doc em `docs/features/prospeccao-nativa.md`.

## 9. O que fica de fora

- Página da análise no sistema do parceiro, rastreio de clique e conversão (PR-01, PR-04, PR-05 da
  spec de 09/11): continuam válidas e viram a **fase 2**, depois que a Msg 2 provar taxa de resposta.
- Mais de um produto por campanha. v1 é um.
- Preço e plano dentro do produto como dado estruturado: v1 usa o texto `prova`.
- Nome do dono do negócio (PR-10).

## 10.0 Conferido no código em 10/11/2026 (após trazer a `main`, merge `09768f5`)

1. **Msg 1 hoje é escrita pela IA**, não é texto fixo: `worker.ts` chama `gerarAbordagemDeFormulario`
   (linha ~361) e só depois fatia em bolhas e cola o rodapé (`comSaida`, linha ~437). O template fixo
   da §4 é um **caminho novo** no worker, escolhido quando a campanha tem produto: monta o texto,
   fatia e envia pelo mesmo trilho (guardas, ledger, `recordSend`), sem chamar o modelo.
2. **`exit_offer` não tem CHECK no banco** (é `config` jsonb): `every_message` entra só no Zod
   (`schema.ts:94`), sem migration para este ponto. A tabela do produto continua pedindo migration.
3. **A contagem atual não serve ao `every_message`.** `SQL_CONTAR_ENVIO_AUTOMATICO` só casa
   `second_message`, e a reserva (`exit_offered_at` + amarração à mensagem) existe para oferecer a
   saída **uma vez**. Em `every_message` não há o que reservar: o rodapé entra sempre. Desenho: em
   `enviarComSaidaConfiguravel`, ler o modo da campanha e, se for `every_message`, aplicar `comSaida`
   direto, sem contar nem amarrar; a Msg 1 do worker passa a tratar `every_message` como
   `first_message` (linha 437). `context.ts` já ignora esse modo. Cobertura de teste: o gatilho de
   `fn_prospeccao_saida_volta_com_a_mensagem` não é acionado, e isso precisa ficar provado.
4. **Não existe detector de "sim" que dispare resposta.** O Jev (`lib/ai/decisao/pedidos.ts`) só
   observa e nunca responde (cerca em `jev-nunca-cala-bloqueia-nem-responde.test.ts`). A resposta
   do prospect cai no turno normal do agente (`inbound-turn.ts`), com o contexto montado por
   `prospectingConversationContext` (`context.ts`). Logo a Msg 2 por sistema (D1 = A) precisa de uma
   das saídas abaixo — **decisão D4**.
5. **Apify/campos de cardápio:** `provider.ts` não mapeia link de cardápio, de pedido, horário nem
   fotos para o prospect; falta a busca real para saber o que o ator devolve (ver item 3 abaixo).

## 10. Não conferido (abrir antes de codar)

1. `lib/agent-engine/agent/abordagem-de-formulario.ts` e `lib/prospecting/worker.ts`: onde a Msg 1
   é montada hoje (`gerarAbordagemDeFormulario`) e como o texto fixo entra sem a IA reescrever.
2. Como o agente detecta o "sim" e dispara a Msg 2, sem responder duas vezes ao mesmo texto (risco
   já apontado em PR-06).
3. Se o Apify devolve link de cardápio, link de pedido, horário e fotos; sem isso os detectores novos
   de PR-02 ficam limitados ao que o HTML do site mostra. **Uma busca real responde.**
4. A contagem atômica de `exit_offer` (`saida-configuravel.ts`) para o modo `every_message`.
5. O tamanho real do catálogo de achados hoje (PR-02 ainda não existe no código).

## 11. Decisões do Ricardo (10/11/2026)

**Decididas: D1 = A (Msg 2 montada pelo sistema), D2 = A (1 achado com solução), D3 = A (`admin` e
`manager`), D4 = A (Msg 2 entregue ao agente pronta, enviada literal, com conferência do corpo
enviado e aviso na Central se divergir).** As alternativas ficam abaixo como registro.

**D1. Msg 2 montada pelo sistema ou escrita pela IA?**
- **A (recomendada):** montada pelo sistema com as frases da organização. Auditável, sem
  promessa inventada. Menos natural.
- B: a IA reescreve respeitando as proibições. Mais natural, mais difícil de provar.
- C: sistema monta a base e a IA só ajusta o tom, com validação de saída.

**D2. Quantos achados para a empresa entrar?**
- **A (recomendada):** 1 achado com solução. A Msg 1 cita um, e a Msg 2 lista os que houver.
- B: 2, como na spec de 09/11. Menos empresas, mensagem mais forte.
- C: 1 para a Msg 1, mas a Msg 2 só sai se houver 2.

**D4. Como a Msg 2 do sistema chega ao prospect (descoberta de 10/11, ver §10.0 item 4)?** **Decidida: A.**
- **A (escolhida):** o contexto da conversa (`context.ts`) entrega ao agente a Msg 2 já pronta e a
  ordem de enviá-la **literal** quando a pessoa aceitar; depois do turno, uma conferência compara o
  corpo enviado com a Msg 2 e, se divergir, registra aviso na Central. Reaproveita o trilho do
  agente (pausa, handoff, opt-out, ledger) e não cria detector novo. Aceita que o "sim" seja lido
  pelo modelo.
- B: detector determinístico de "sim" (regra, no estilo de `lib/opt-out/deteccao.ts`) que dispara o
  envio fixo sem passar pelo modelo. Mais previsível, mas "sim" curto vira falso positivo ("sim, mas
  quanto custa?") e o trilho de envio fora do turno é novo.
- C: A, com B só para a resposta de uma palavra ("sim", "quero", "pode").

**D3. Quem cadastra o produto?**
- **A (recomendada):** `admin` e `manager`.
- B: só `admin`.
- C: qualquer `agent`.
