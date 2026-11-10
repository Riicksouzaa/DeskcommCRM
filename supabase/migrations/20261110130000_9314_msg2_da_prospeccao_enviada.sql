-- manifest: Estado da Msg 2 do roteiro "achado primeiro" (prospecting_candidates.msg2_sent_at/msg2_literal): impede reenviar a Msg 2 e registra se saiu literal ou divergente.
-- ============================================================================
-- 9314 — A MSG 2 DA PROSPECÇÃO JÁ SAIU?
--
-- Na campanha com produto cadastrado (spec 2026-11-10-prospeccao-produto-da-
-- campanha-design, D4 = A), a Msg 2 é montada pelo sistema e entregue ao agente
-- para enviar LITERAL quando a pessoa aceitar. O agente é um modelo: sem um
-- estado durável, o turno seguinte mandaria a mesma apresentação de novo
-- (risco PR-06, responder duas vezes). O estado mora em COLUNAS da linha do
-- candidato, e não numa chave de `data` (jsonb), porque a marca precisa ser
-- reivindicada de forma atômica por um UPDATE condicional
-- (`... where msg2_sent_at is null returning id`): dois turnos em corrida
-- marcam e auditam uma vez só. `data` é o retrato da descoberta da empresa
-- (nome, site, auditoria), e estado de conversa não é isso.
--
-- `msg2_sent_at`  — quando a conferência pós-turno viu a Msg 2 (ou uma versão
--                    dela) sair. Nulo = a Msg 2 está pendente.
-- `msg2_literal`  — true: o corpo enviado contém a Msg 2 montada, inteira.
--                    false: o agente apresentou o produto, mas com outras
--                    palavras (a divergência vira aviso na Central).
-- ============================================================================

alter table public.prospecting_candidates
  add column if not exists msg2_sent_at timestamptz,
  add column if not exists msg2_literal boolean;

comment on column public.prospecting_candidates.msg2_sent_at is
  'Quando a Msg 2 do roteiro (achado -> solução) saiu para esta empresa. Nulo = pendente. Só campanhas com produto cadastrado.';
comment on column public.prospecting_candidates.msg2_literal is
  'true = o corpo enviado traz a Msg 2 montada pelo sistema inteira; false = o agente a reescreveu (aviso na Central).';

notify pgrst, 'reload schema';
