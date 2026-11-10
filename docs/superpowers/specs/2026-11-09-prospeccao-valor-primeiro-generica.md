# Prospecção com valor primeiro (funcionalidade genérica do CRM)

> **Status:** proposta de desenho. **Nada foi construído, configurado ou enviado.** 09/11/2026.
> **Substitui** `2026-11-09-prospeccao-manero-proposta.md` (histórico). O racional e a pesquisa de
> livros estão no `…-RASCUNHO.md`; o mapa do código, na §24 dele.
> **Regra deste documento:** nenhuma regra mora no código com nome de cliente. A Manero é a
> **primeira configuração** (Apêndice A), não o produto.

---

## 0. O que mudou nesta versão

| Antes | Agora |
|---|---|
| Desenho para a Manero | **Funcionalidade genérica** do CRM: qualquer organização configura a sua oferta, o seu nicho e o seu relatório |
| Planilha e PDF montados à mão na Fase 0 | **Tudo no CRM**: o relatório é gerado pela IA **durante o atendimento**; marcos, funil e painel ficam no CRM |
| "Posso criar seu cardápio agora" (cadastro assistido) | **O cliente cria sozinho** pelo link. A mensagem e o PDF levam ao link de ação; nunca prometem fazer por ele |
| Imagem de exemplo no PDF | **Link para um exemplo real** escolhido pela organização (na Manero, `manero.app/bibi`) |
| Reunião só para rede/franquia | **Reunião de apresentação** sempre que a pessoa estiver em dúvida, agendada pelo próprio agente |

Continuam valendo: saída desde a 1ª mensagem, 2 envios no máximo a quem não responde, janela de
horário, sem emoji, só achado verificado, freio do número, medição pela literatura (Blount, Ross,
Keenan).

## 1. Como o GoHighLevel faz, e o que copiamos

Fontes: guias de terceiros e espelhos da central de ajuda do HighLevel (lista no fim). **Não
testei o produto**; trate como descrição, não como contrato.

| No GoHighLevel | O que faz | No Deskcomm |
|---|---|---|
| **Prospecting** | Busca empresas por local e nicho e gera, para cada uma, um **relatório de auditoria de marketing** (site, SEO, Perfil da Empresa no Google, reputação, listagens) | **Já existe em parte:** busca no Maps + auditoria de site. Falta o relatório |
| **Report Builder** | Monta o relatório com **a marca e a voz da agência**, com seções e layout configuráveis e prévia ao vivo; compartilha **por link ou PDF** | **Novo:** modelo de relatório por organização, com a marca dela (§3.3) |
| **Trigger Links** | Link rastreado: o clique do contato **registra o evento** e pode iniciar fluxo, pôr etiqueta ou **mover etapa**; há estatística de clique | **Novo:** links rastreados (§3.6) |
| **Conversation AI** | Bot que qualifica, **confere a agenda e marca o horário** na conversa, e dispara um fluxo quando a meta é atingida | **Já existe:** agente com ferramentas de agenda (`crm_find_and_book_appointment`, `crm_book_appointment`…) e passagem para humano |
| **Workflows / Opportunities** | Sequências com espera e condição; funil de oportunidades | **Já existe:** motor de follow-up (espera, sem resposta, casar resposta, coleta, mover etapa) e funis |
| **Snapshots** | Pacote de configuração copiado entre contas (conhecimento meu, **não verificado** nesta pesquisa) | **Novo como dado:** modelos de nicho (§3.2) que uma organização importa e ajusta |

A diferença que nos favorece: o GoHighLevel entrega o relatório e para. Aqui o relatório é **parte
de uma conversa** no WhatsApp, com um agente que responde dúvidas, marca reunião e mede cada passo.

## 2. Princípio de produto

- **O núcleo traz o mecanismo; a organização traz o conteúdo.** Detectores, relatório, roteiro,
  links rastreados e medição são do CRM. Oferta, textos, achados escolhidos, links, persona e preços
  são da organização.
- **Teste de vazamento:** nenhum nome de cliente, domínio de cliente ou regra de nicho fixa no
  código. O que é de nicho vem como **modelo de dados** importável.
- **Destino (doutrina de extensões):** é **núcleo**: se nenhuma organização ativar, a operação comum
  continua inteira, e o mecanismo serve a qualquer nicho que prospecte. Os modelos de nicho são dado,
  não código.

## 3. Conceitos (o que a organização configura)

### 3.1 Oferta
O que se vende na campanha. Campos:
- **Nome e descrição curta** (uma frase do que resolve);
- **Para quem** (nichos do Maps aceitos);
- **Link de ação** (cadastro, compra ou contratação);
- **Link de exemplo** (demonstração ou caso real);
- **Tipo de agendamento** para a reunião de apresentação (usa os "Tipos de agendamento" que já existem);
- **Base de conhecimento** com planos, preços e regras (já existe; preço nunca vai para o código).

### 3.2 Catálogo de achados (por nicho)
Lista de achados que a campanha pode citar. Cada achado tem:

| Campo | Exemplo |
|---|---|
| Código | `sem_cardapio_proprio` |
| **Detector** (escolhido de uma lista fechada que o sistema sabe medir) | `link_principal_e_rede_social` |
| O que vimos (texto da organização, com variáveis) | "No Google, o link de vocês leva para o Instagram." |
| O que isso causa | "Quem quer ver o preço precisa mandar mensagem e esperar." |
| Como resolver (a solução DA oferta) | "Um cardápio com link próprio, com preço e foto." |
| Peso | 3 |

**Detectores genéricos do sistema** (os que existem e os novos):

| Detector | Mede | Existe? |
|---|---|---|
| `sem_site` | Maps sem site | sim |
| `link_principal_e_rede_social` | "Site" é Instagram/Facebook/Linktree… | sim (agregador) |
| `site_fora_do_ar`, `site_inseguro`, `nao_mobile`, `lento`, `construtor_pronto` | Auditoria de site | sim |
| `sem_whatsapp_no_site`, `sem_mapa`, `sem_fotos` | Checklist da auditoria | sim |
| `conteudo_comercial_nao_legivel` | Cardápio, catálogo ou tabela de preços em imagem/PDF ou ausente | **novo** |
| `depende_de_marketplace` | Link para marketplace (lista configurável: iFood, Mercado Livre, Doctoralia…) | **novo** |
| `usa_concorrente` | Domínio de concorrente (lista configurável pela organização) | **parcial** (Goomer já é reconhecido como construtor) |
| `muitas_avaliacoes_sem_canal` | Nº de avaliações no Maps acima de um limite **e** sem canal próprio | **novo** (dado já existe) |
| `nota_baixa` | Nota no Maps abaixo de um limite | **novo** (dado já existe) |

**Modelos de nicho:** o produto traz catálogos prontos como dado (restaurante primeiro; depois
clínica, salão, imobiliária…), que a organização importa e ajusta. É o equivalente ao "snapshot".

Regras do sistema (iguais para todos): só cita o que foi **medido e é definitivo**; elegível com
**2+ achados**; ordem por peso; o relatório usa de 3 a 5; o detector `usa_concorrente` pode
**excluir** a empresa da campanha (escolha da organização).

### 3.3 Modelo do relatório
- **Estrutura fixa do sistema:** capa (nome da empresa, título, data, marca da organização) →
  achados (O que vimos / O que isso causa / Como resolver) → o caminho (link de ação, link de
  exemplo, convite para reunião) → rodapé de transparência (fonte pública dos dados, data, como
  sair).
- **Marca da organização:** cor, nome e logotipo vêm da marca já configurada (o mesmo resolvedor
  que serve e-mail e saídas sem tela).
- **Textos da organização:** título, abertura, frases dos achados, texto do caminho.
- **A IA redige, o sistema monta.** No atendimento, a IA escolhe e ajusta as frases a partir **só**
  dos achados verificados e dos textos da organização; o layout, os links e o rodapé são do sistema.
  Assim o relatório não inventa dado nem promessa e sai igual em estrutura para todos.
- **Proibições configuráveis** (lista por organização, checada antes de gerar): na Manero, "pedido
  no app", "iFood", "comissão", "tempo real", "eu crio".
- **Sem emoji** como opção de estilo da organização, com trava no envio (ver §3.5).

### 3.4 Roteiro (sequência)
Montado sobre o motor de follow-up, com estes parâmetros por campanha:
- **Msg 1:** texto fixo com variáveis (`{empresa}`, `{n_achados}`, `{achado_principal}`), sem a IA
  reescrever;
- **Palavra de saída** (padrão do idioma; a organização pode trocar por outra do vocabulário de
  saída, ex.: SAIR) e em que mensagem ela vai;
- **Lembrete** único, com prazo (padrão 3 dias úteis) e texto com `{achado_secundario}`;
- **Retomada** depois do relatório (padrão 1, em 2 dias úteis);
- **Teto:** 2 envios a quem nunca respondeu; nada depois do silêncio final;
- **Janela** de horário e dias (já existe por conexão).

### 3.5 Agente de prospecção
Persona configurável (nome, tom, estilo). Ferramentas:

| Ferramenta | Existe? |
|---|---|
| **Gerar e enviar o relatório** (`prospeccao_enviar_relatorio`) | **novo** |
| Enviar link rastreado de ação e de exemplo | **novo** (vem com §3.6) |
| Marcar reunião (`crm_find_and_book_appointment` e afins) | sim |
| Passar para humano (`request_human_handoff`) | sim |
| Mover etapa, atualizar negócio | sim |

**Estilo "sem emoji":** opção do agente; o envio remove emoji do texto antes de sair (o código já
faz isso para a resposta em áudio, `textoFalavel`).

### 3.6 Links rastreados (novo, genérico)
- Todo link de ação e de exemplo que sai na conversa ou no relatório vira um **link próprio por
  contato**, no domínio da instalação (ex.: `https://<crm>/r/<token>`).
- O clique **grava o marco** (`clicou_acao`, `clicou_exemplo`), pode **mover etapa** e redireciona
  para o destino com `ref=<token>` acrescentado.
- **Privacidade:** o token é opaco; nunca nome, telefone ou documento na URL.
- **Medição do PDF:** abrir um PDF não é mensurável; **clicar nos links dele é**. Por isso todo link
  do PDF é rastreado.

### 3.7 Conversão de volta (novo, genérico)
- Uma rota da API (`/api/v1/…`, bearer `dsk_`) onde o **sistema do cliente** informa o que aconteceu
  com quem chegou pelo link: `{ ref, evento: cadastro | teste | compra | cancelamento, valor_cents?, moeda? }`.
- O CRM acha o contato pelo `ref`, grava o marco, move a etapa configurada para aquele evento e
  audita. Idempotente por `Idempotency-Key`.
- **A conferir:** a tela **Conversões** (`/app/settings/conversoes`) já "marca a origem de quem
  chega pelo site". Pode ser o lugar certo para isto, ou um vizinho.
- Na Manero: o cadastro já carrega o `ref` (vindo do link) e o serviço de cobrança, que já trata
  teste e assinatura ativa, chama esta rota. É código **da Manero como cliente da API**, não regra
  da Manero dentro do CRM.

### 3.8 Medição no CRM
- **Marcos por contato** (vocabulário fechado, igual para todos): `elegivel`, `variante`,
  `msg1_enviada`, `lembrete_enviado`, `respondeu`, `aceitou_relatorio`, `relatorio_enviado`,
  `clicou_exemplo`, `clicou_acao`, `cadastro`, `teste`, `compra`, `reuniao_marcada`,
  `reuniao_realizada`, `pediu_humano`, `objecao:<tipo>`, `saiu`, `silencio_final`.
- **Onde aparecem:** na linha do tempo do negócio (atividades que já existem) e no **painel da
  campanha** em Prospecção: funil degrau a degrau, coorte por semana de envio (7/30/60 dias),
  comparação de variantes, resposta por achado, objeções, custo por cadastro e por compra, saúde do
  número.
- **Freio do número:** pausa e avisa com 3+ "saída" nas últimas 30 enviadas, 3 falhas seguidas ou
  sessão restrita (valores por campanha, estes de partida).
- **A/B:** sorteio por empresa dentro da campanha; primeira comparação: Msg 1 com × sem o achado
  principal.

## 4. Fluxo revisado

```
D0  Msg 1 (texto fixo + saída)
     ├─ aceita ("SIM") ──► agente gera o relatório e envia: PDF + texto curto
     │                     com link de ação e link de exemplo (rastreados)
     ├─ saída ───────────► bloqueado; fim
     ├─ outra resposta ──► agente conversa
     └─ silêncio
D3  Lembrete único ──► silêncio ──► FIM (2 envios)

Depois do relatório:
     ├─ clica no link de ação ──► cria a conta sozinho ──► sistema do cliente avisa "cadastro"
     │                                                  ──► depois "teste" e "compra"
     ├─ clica no exemplo ───────► agente pergunta o que achou (uma vez)
     ├─ dúvida ─────────────────► agente responde pela base de conhecimento
     ├─ dúvida que persiste,
     │  ou pediu para entender ─► agente propõe REUNIÃO de apresentação e marca na agenda
     ├─ caso difícil ───────────► passa para humano (08h-18h)
     └─ silêncio ───────────────► 1 retomada (D+2) ──► silêncio ──► FIM
```

## 5. Relatório e mensagens, exemplo preenchido (Manero, Apêndice A)

**Página "o caminho" do relatório (o que mudou):**
> **Crie seu cardápio grátis, sem cartão:** {link de ação}
> Você mesmo cadastra seus itens e preços pelo painel, e o cliente vê sempre a versão certa.
>
> **Veja um cardápio de exemplo:** {link de exemplo}
>
> **Ficou com dúvida?** Responda a mensagem e marcamos uma apresentação de 15 minutos.

Nada de "eu crio", "vou montar" ou "faço por você".

**Msg 2 (após o "SIM")**
> Segue em anexo a análise da **{Restaurante}**, feita pela Manero.
>
> Resumo: **1)** {achado 1} **2)** {achado 2} **3)** {achado 3}
>
> Para ver como fica na prática, aqui está um cardápio de exemplo: {link de exemplo}
>
> Se quiser começar, você cria o seu grátis, sem cartão, por aqui: {link de ação}

**Quando há dúvida** (o agente decide)
> Se preferir, marco uma apresentação rápida, de 15 minutos, para te mostrar tudo e tirar as
> dúvidas. Qual horário fica melhor para você: {dois horários livres}?

**Retomada (D+2, uma vez)**
> Oi! Conseguiu olhar a análise? Se quiser, posso marcar uma apresentação rápida para te mostrar
> como funciona.

Msg 1 e lembrete seguem os da proposta anterior, sem emoji.

## 6. Arquitetura (alto nível; nada disto foi escrito)

| Peça | Onde | Doutrina que pesa |
|---|---|---|
| Oferta, catálogo de achados, modelo de relatório, roteiro | Configuração da campanha / organização (jsonb validado por Zod ou tabelas novas, a decidir na spec) | DIRC; `jsonb` com schema central (anti-pattern 6) |
| Detectores novos | Ao lado da auditoria de site (`lib/prospecting/site-*.ts`) | Só citável o que é medido e definitivo |
| Relatório | Gerador com `@react-pdf/renderer` (já usado), Storage, URL assinada | Marca pelo resolvedor que nunca lança; retenção; LGPD apaga o arquivo |
| Ferramenta do agente | Runtime do agente | Escopo de escrita, auditoria, organização vinda da conversa, nunca do modelo |
| Mídia enviada pelo agente | Envio comum | Throttle e janela; mídia no Storage antes do WAHA |
| Links rastreados | Tabela nova + rota pública de redirecionamento | RLS, token opaco, rate limit, sem PII na URL, anonimização |
| Conversão de volta | Rota nova em `/api/v1` com bearer | Auth dual, `public-paths`, `Idempotency-Key`, auditoria, suporte temporário |
| Marcos e painel | Atividades existentes + agregação | Evento com consumidor; tela com porta na navegação (já existe) |
| Tudo que toca schema | migration + apêndice no `baseline.sql` + `-- manifest:` | Doutrina de migrations |

## 7. Fatias de construção (quando você autorizar)

| Fatia | Conteúdo | Tam. | Por quê nesta ordem |
|---|---|---|---|
| **G1, oferta + links rastreados + conversão de volta** | Base de toda medição de resultado | M–G | Sem isto, cadastro e compra ficam invisíveis |
| **G2, roteiro** | Msg 1 fixa, saída configurável, lembrete e retomada pelo fluxo, provar os 3 riscos da §24.2 do rascunho | M | Tira a IA de reescrever a abertura |
| **G3, relatório no atendimento** | Modelo, geração, ferramenta do agente, envio de documento, proibições, sem emoji | M–G | O "valor primeiro" depende disto |
| **G4, catálogo de achados + detectores + modelo "restaurante"** | Detectores novos e o primeiro modelo de nicho | M | O relatório precisa de achados de nicho |
| **G5, painel, marcos, freio, A/B** | Leitura no CRM | G | Fecha a medição pela literatura |
| **G6, nome do dono** | Depois do parecer jurídico | M–G | Muda decisão de LGPD |

**A Fase 0 (≈50 empresas) só começa depois de G1 a G4 e da parte mínima de G5** (marcos e funil),
porque agora não há etapa manual.

## 8. Riscos
1. A IA no relatório: mesmo com estrutura fixa, o texto pode exagerar. Defesa: frases vêm do
   catálogo da organização, a IA só ajusta; lista de proibições checada antes de enviar.
2. Duas vozes no mesmo "SIM" (agente e fluxo) e o lembrete contar no teto do número: provar na G2.
3. Conversão de volta depende do **sistema do cliente** integrar a API; sem isso, o funil termina
   no clique.
4. O exemplo escolhido precisa parecer exemplo: ver a decisão 2 da §9.
5. WhatsApp não oficial: risco de banimento continua; freio, ritmo e janela são a defesa.

## 9. Decisões (respondidas pelo Ricardo em 09/11/2026)

| # | Tema | Escolha | O que muda no desenho |
|---|---|---|---|
| 1 | Cadastro assistido | **A**: desligado nesta funcionalidade | O cliente cria sozinho pelo link de ação rastreado |
| 2 | Exemplo `/bibi` | **C**: usar como está | Risco aceito: a página parece um restaurante real de Aparecida de Goiânia |
| 3 | Formato do relatório | **C**: **só versão web**, sem PDF | O relatório vira **página pública por link rastreado** (abrir é medido). A §3.3 vale para a página; `@react-pdf` sai do desenho |
| 4 | Modelos de nicho | **B**: cada organização monta o seu | O produto não traz catálogo pronto; traz os detectores e a tela para montar |
| 5 | Conversão de volta | **B**: **o CRM consulta o sistema do cliente** | Em vez de rota que o cliente chama, um **conector de consulta** por organização (§3.7 revisada na spec da G1) |
| 6 | Primeira fatia | **A**: G1 | Spec em `2026-11-09-spec-g1-links-rastreados-e-conversao.md` |

### (histórico) As opções como foram apresentadas

1. **Cadastro assistido (a integração Manero que já existe):**
   - **A. Desligar nesta funcionalidade; o cliente cria pelo link rastreado e a conversão volta pela API genérica (recomendada).** É o que você descreveu e serve a qualquer cliente.
   - B. Manter como opção por organização (quem quiser, ativa).
   - C. Manter como caminho principal da Manero.
2. **O exemplo `manero.app/bibi`:** abri a página e ela mostra **"Feijuca do Zé", em Aparecida de Goiânia**, com endereço e horário, sem dizer que é demonstração. Aparecida é uma das cidades do teste.
   - **A. Manter o link, mas a página passar a dizer "cardápio de demonstração" (recomendada).** Evita que um dono da cidade ache que é um concorrente real ou desconfie.
   - B. Criar um exemplo de pizzaria/hamburgueria fictícia, mais próximo do público.
   - C. Usar como está.
3. **Formato do relatório:**
   - **A. PDF com todos os links rastreados (recomendada).** Mede o que importa (clique), sem obra extra.
   - B. PDF e também uma versão web rastreada (mede a abertura).
   - C. Só versão web (link), sem PDF.
4. **Modelos de nicho:**
   - **A. O produto traz modelos prontos como dado, e cada organização importa e ajusta (recomendada).** É o "snapshot" do GoHighLevel.
   - B. Cada organização monta o seu do zero.
   - C. Modelos como extensão do catálogo de extensões.
5. **Conversão de volta:**
   - **A. Rota genérica na API, chamada pelo sistema do cliente (recomendada).**
   - B. Webhook que o CRM consulta no sistema do cliente.
   - C. Um código (script) no site do cliente que avisa o CRM quando alguém se cadastra.
6. **Primeira fatia a especificar:**
   - **A. G1 (links rastreados + conversão de volta) (recomendada).** É a base de medição de tudo e não depende do relatório.
   - B. G3 (relatório no atendimento), o coração do "valor primeiro".
   - C. G2 (roteiro).

---

## Apêndice A. A Manero como primeira configuração

| Item | Valor |
|---|---|
| Oferta | "Cardápio digital para restaurantes, com link e QR" |
| Nichos | Pizzaria, hamburgueria (Goiânia e Aparecida de Goiânia) |
| Link de ação | `https://admin.manero.app/signup` (rastreado) |
| Link de exemplo | `https://manero.app/bibi` (rastreado; ver decisão 2) |
| Reunião | Tipo de agendamento "Apresentação Manero", 15 min, 08h-18h |
| Base de conhecimento | Planos e regras da Manero: Vitrine grátis sem cartão (10 itens); Essencial R$ 69/mês, 7 dias de teste com cartão; Profissional R$ 129/mês |
| Persona | Dani, assistente virtual da Manero; sem emoji |
| Proibições | pedido/pagamento no app, iFood, comissão, "tempo real", "eu crio/monto por você" |
| Catálogo | Modelo "restaurante" (§3.2), com `usa_concorrente` excluindo quem já usa outro cardápio digital |
| Conversão de volta | A Manero chama a API com `ref` no cadastro, no início do teste e na assinatura |

## Fontes sobre o GoHighLevel
- [HighLevel: Prospecting Tool, Fully Customizable Prospect Report Builder](https://help.gohighlevel.com/support/solutions/articles/155000005558-prospecting-tool-fully-customizable-prospect-report-builder)
- [HighLevel changelog: novo Report Builder](https://ideas.gohighlevel.com/changelog/new-prospecting-report-builder-is-live-built-to-match-your-brand-your-voice)
- [KB-015: GHL Prospecting Tool](https://symphonycore-docs.pages.dev/team-training/platform-training/kb-015-ghl-prospecting-tool)
- [GoHighLevel Prospecting (SupplyGem)](https://supplygem.com/gohighlevel-prospecting/)
- [GoHighLevel PDF prospecting setup (Consultevo)](https://consultevo.com/gohighlevel-pdf-prospecting-setup/)
- [GoHighLevel Trigger Links (SupplyGem)](https://supplygem.com/gohighlevel-trigger-links/)
- [Trigger link clicked workflow (Consultevo)](https://consultevo.com/gohighlevel-trigger-link-clicked-workflow/)
- [Conversation AI appointment booking (Growthable)](https://growthable.io/gohighlevel-tutorials/ai-conversational-appointment-booking-workflow-and-setup-in-gohighlevel/)
