# supabase/fork — o schema que é só deste fork

O produto (`melgarafael/DeskcommCRM`) é dono de `supabase/baseline.sql` e de
`supabase/migrations/`. **O fork nunca edita esses dois.** Tudo que o fork cria no banco
mora aqui. Foi assim que o merge da `main` do produto deixou de conflitar em SQL: o
`baseline.sql` e a pasta `migrations/` ficam idênticos aos deles, byte a byte.

Conferir a regra a qualquer momento (o esperado é vazio):

```bash
git diff upstream/main -- supabase/baseline.sql supabase/migrations
```

## O que mora aqui

| Arquivo | Para quê |
|---|---|
| `migrations/<timestamp>_F<NNN>_<slug>.sql` | Uma migration do fork. Numeração **F001, F002…**, faixa que o produto nunca aloca (o dele é `NNNN` de 4 dígitos). Linha `-- manifest:` no cabeçalho, como lá. |
| `baseline-fork.sql` | O apêndice idempotente, aplicado **depois** do `baseline.sql` do produto. Um bloco rotulado `-- ---- <coisa> (migration F00N) ----` por migration. |

## Como se aplica

Sempre **dois arquivos, nesta ordem**: `supabase/baseline.sql` do produto e depois
`supabase/fork/baseline-fork.sql`.

- **Testes de banco:** `scripts/test-db.sh` aplica o apêndice do fork logo depois do baseline
  (install e update). `pnpm test:db` já o inclui.
- **Produção (Dokploy):** o compose `update-db` aplica o baseline do `APP_TAG`. Passa a ter um
  **segundo passo** que aplica `supabase/fork/baseline-fork.sql` do mesmo SHA. Sem ele, as
  tabelas do fork não existem no banco.
- **Ambiente fresco para prova pela tela** (`scripts/local-supabase.sh` e afins): aplicar o
  apêndice do fork depois do baseline, à mão, até esses scripts o conhecerem.

## Regras para uma mudança de schema do fork

1. Migration em `supabase/fork/migrations/` com número `F` seguinte, **e** o bloco espelho em
   `baseline-fork.sql`. As duas andam juntas, como no produto.
2. Idempotente (`create … if not exists`, `create or replace`, `add column if not exists`),
   porque a produção reaplica o arquivo a cada atualização.
3. Só depende de objetos estáveis do produto (`organizations`, `fn_user_org_ids()`, o RBAC).
   Nunca altere nem recrie objeto do produto: se precisa mexer num, isso é um PR para eles.
4. Função nova em `public` revoga `EXECUTE` de `public` **e** de `anon` (doutrina de migrations,
   item 9 do `CLAUDE.md`).
5. Tabela nova de organização leva `organization_id` + RLS `tenant_isolation_<tabela>_all` e,
   se for de escrita por usuário, passa pelo `fn_aplicar_travas_de_suporte()` no fim do bloco.
6. Quando o produto passar a ter a mesma tabela, o `if not exists` torna o apêndice inócuo;
   então remova o bloco daqui no mesmo PR que traz a versão deles.

## Limites conhecidos

- Os arquivos de TypeScript compartilhados (`lib/audit/actions.ts`, `lib/i18n/dicionario.ts`,
  `lib/navigation/catalogo.ts`, `lib/database.types.ts`) continuam podendo conflitar no merge.
  Os conflitos são aditivos e pequenos; resolvem-se somando os dois lados.
- A Supabase CLI (`db push`) não enxerga esta pasta. A produção não usa a CLI.
- O que for genérico o bastante para qualquer nicho deve ir ao produto por PR: aí sai daqui.
