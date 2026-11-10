-- manifest: Produto cadastrado da prospecção (prospecting_products): o que a campanha vende, com o mapa achado -> solução, por organização, com RLS.
-- ============================================================================
-- 9313 — PRODUTO CADASTRADO DA PROSPECÇÃO
--
-- Um registro por organização que diz O QUE a campanha vende, em palavras da
-- organização (spec 2026-11-10-prospeccao-produto-da-campanha-design.md §3).
-- Tabela própria e não jsonb de `organizations.settings`: o produto é lido por
-- campanhas, prévia e agente (anti-pattern 6, jsonb lock-in).
--
-- `solucoes` é jsonb de forma FIXA (objeto código-do-achado -> frase). Os
-- códigos válidos vivem no TypeScript (lib/prospecting/produto/schema.ts), não
-- em CHECK: o vocabulário da auditoria cresce e um CHECK quebraria o update.sh
-- de um clone com linha de vocabulário antigo (doutrina de vocabulário aberto).
--
-- Escrita: manager+ (a regra mora no WITH CHECK). Não há DELETE para o papel
-- authenticated: produto sai por `archived_at`, nunca por apagamento.
-- ============================================================================

create table if not exists public.prospecting_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  nome text not null,
  categoria text not null,
  resumo text not null,
  solucoes jsonb not null default '{}'::jsonb,
  prova text,
  link_demo text,
  proibicoes text[] not null default '{}',
  assina text,

  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prospecting_products_nome_check
    check (char_length(btrim(nome)) between 1 and 80),
  constraint prospecting_products_categoria_check
    check (char_length(btrim(categoria)) between 1 and 80),
  constraint prospecting_products_resumo_check
    check (char_length(btrim(resumo)) between 1 and 300),
  constraint prospecting_products_prova_check
    check (prova is null or char_length(prova) <= 300),
  constraint prospecting_products_assina_check
    check (assina is null or char_length(assina) <= 80),
  constraint prospecting_products_link_demo_check
    check (link_demo is null or (link_demo ~ '^https://[^[:space:]]+$' and char_length(link_demo) <= 500)),
  constraint prospecting_products_solucoes_check
    check (jsonb_typeof(solucoes) = 'object'),
  constraint prospecting_products_proibicoes_check
    check (cardinality(proibicoes) <= 20)
);

-- Par (organização, id) para FKs compostas futuras (campanha -> produto).
create unique index if not exists prospecting_products_org_id_key
  on public.prospecting_products (organization_id, id);

-- Um nome vivo por organização (arquivado libera o nome).
create unique index if not exists prospecting_products_nome_vivo_key
  on public.prospecting_products (organization_id, lower(btrim(nome)))
  where archived_at is null;

create index if not exists prospecting_products_org_idx
  on public.prospecting_products (organization_id, created_at desc);

alter table public.prospecting_products enable row level security;

drop policy if exists tenant_isolation_prospecting_products_all on public.prospecting_products;
create policy tenant_isolation_prospecting_products_all
  on public.prospecting_products
  using (organization_id in (select public.fn_user_org_ids()))
  with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'manager')
  );

revoke all on public.prospecting_products from public, anon;
grant select, insert, update on public.prospecting_products to authenticated;
revoke delete, truncate on public.prospecting_products from authenticated;
grant all on public.prospecting_products to service_role;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

drop trigger if exists trg_prospecting_products_updated_at on public.prospecting_products;
create trigger trg_prospecting_products_updated_at
  before update on public.prospecting_products
  for each row execute function public.fn_set_updated_at();

comment on table public.prospecting_products is
  'Produto que a campanha de prospecção vende: nome, resumo, mapa achado->solução e proibições. Arquivado por archived_at, nunca apagado.';
comment on column public.prospecting_products.solucoes is
  'Objeto {codigo_do_achado: frase de como o produto resolve}. Códigos validados no TypeScript (lib/prospecting/produto/schema.ts).';

notify pgrst, 'reload schema';
