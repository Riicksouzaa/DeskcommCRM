-- manifest: Textos da Msg 1 e da Msg 2 como dado do produto da prospecção (mensagem_1, mensagem_2), com marcadores; editar o que a campanha diz deixa de exigir código.
-- ============================================================================
-- F003 — MENSAGENS DO PRODUTO DA PROSPECÇÃO COMO DADO
--
-- Duas colunas de texto, nulas por padrão. Nulas = o roteiro "achado primeiro" de
-- sempre. Preenchidas = a campanha diz o que a organização escreveu, com marcadores
-- entre chaves (`lib/prospecting/produto/modelo.ts`). O limite de tamanho e a
-- validação dos marcadores moram no Zod (o banco só guarda o texto): a coluna
-- `solucoes` do produto segue a mesma divisão.
--
-- Fork-only (supabase/fork/README.md): não toca baseline.sql nem supabase/migrations/.
-- Idempotente: pode ser reaplicada.
-- ============================================================================
alter table public.prospecting_products
  add column if not exists mensagem_1 text,
  add column if not exists mensagem_2 text;

comment on column public.prospecting_products.mensagem_1 is
  'Modelo de texto da Msg 1 da campanha, com marcadores {empresa}, {assina}, {produto}, {resumo}, {link_demo}, {prova}, {achado}, {solucao}. Nulo = roteiro achado primeiro.';
comment on column public.prospecting_products.mensagem_2 is
  'Modelo de texto da Msg 2. Nulo, com mensagem_1 preenchida, = a campanha não tem Msg 2 do sistema.';
