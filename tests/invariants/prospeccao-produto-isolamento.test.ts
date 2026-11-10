import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

// Prova da F001 (prospecting_products): isolamento entre 2 organizações e a
// regra de escrita (manager+). Identificadores só desta fixture.
const ORG_A = "c0913000-0000-4000-8000-000000000001";
const ORG_B = "c0913000-0000-4000-8000-000000000002";
const MANAGER_A = "c0913000-1111-4000-8000-000000000001";
const MANAGER_B = "c0913000-1111-4000-8000-000000000002";
const AGENT_A = "c0913000-1111-4000-8000-000000000003";
const VIEWER_A = "c0913000-1111-4000-8000-000000000004";
const PROD_A = "c0913000-2222-4000-8000-000000000001";
const PROD_B = "c0913000-2222-4000-8000-000000000002";

beforeAll(() => {
  sql(`
    insert into auth.users(id,email) values
      ('${MANAGER_A}','produto-gestor-a@invariant.test'),
      ('${MANAGER_B}','produto-gestor-b@invariant.test'),
      ('${AGENT_A}','produto-atendente-a@invariant.test'),
      ('${VIEWER_A}','produto-leitor-a@invariant.test');
    insert into organizations(id,slug,legal_name,display_name) values
      ('${ORG_A}','produto-9313-a','Produto sintético A','Produto A'),
      ('${ORG_B}','produto-9313-b','Produto sintético B','Produto B');
    insert into user_organizations(user_id,organization_id,role,accepted_at) values
      ('${MANAGER_A}','${ORG_A}','manager',now()),
      ('${MANAGER_B}','${ORG_B}','manager',now()),
      ('${AGENT_A}','${ORG_A}','agent',now()),
      ('${VIEWER_A}','${ORG_A}','viewer',now());
    insert into prospecting_products(id,organization_id,nome,categoria,resumo) values
      ('${PROD_A}','${ORG_A}','Produto A','categoria A','resumo A'),
      ('${PROD_B}','${ORG_B}','Produto B','categoria B','resumo B');
  `);
});

describe("prospecting_products: isolamento por organização", () => {
  it.each([
    [MANAGER_A, ORG_A, ORG_B],
    [MANAGER_B, ORG_B, ORG_A],
    [AGENT_A, ORG_A, ORG_B],
    [VIEWER_A, ORG_A, ORG_B],
  ])("membro %s lê o produto da própria organização e nenhum do outro tenant", (user, propria, outra) => {
    expect(countAs(user, `select count(*) from prospecting_products where organization_id='${propria}'`)).toBe(1);
    expect(countAs(user, `select count(*) from prospecting_products where organization_id='${outra}'`)).toBe(0);
    expect(countAs(user, `select count(*) from prospecting_products`)).toBe(1);
  });

  it("só manager+ da própria organização altera", () => {
    const atualizar = `update prospecting_products set resumo='novo' where id='${PROD_A}'`;
    expect(writeCountAs(AGENT_A, atualizar)).toBe(0);
    expect(writeCountAs(VIEWER_A, atualizar)).toBe(0);
    expect(writeCountAs(MANAGER_B, atualizar)).toBe(0);
    expect(writeCountAs(MANAGER_A, atualizar)).toBe(1);
  });

  it("manager não grava produto em nome de outra organização", () => {
    const inserirNaB = `insert into prospecting_products(organization_id,nome,categoria,resumo) values ('${ORG_B}','Invasor','c','r')`;
    expect(writeCountAs(MANAGER_A, inserirNaB)).toBe(0);
    expect(countAs(MANAGER_B, `select count(*) from prospecting_products where nome='Invasor'`)).toBe(0);
  });

  it("agent não cria produto na própria organização", () => {
    const inserir = `insert into prospecting_products(organization_id,nome,categoria,resumo) values ('${ORG_A}','Do agent','c','r')`;
    expect(writeCountAs(AGENT_A, inserir)).toBe(0);
  });

  it("authenticated não apaga: produto sai por archived_at", () => {
    let negado = false;
    try {
      writeCountAs(MANAGER_A, `delete from prospecting_products where id='${PROD_A}'`);
    } catch (err) {
      negado = String((err as { stderr?: string }).stderr ?? err).includes("permission denied");
    }
    expect(negado).toBe(true);
  });

  it("o CHECK recusa link http e solucoes que não é objeto", () => {
    const recusa = (valores: string, restricao: string) =>
      sql(`do $t$ declare nome text; begin
        insert into prospecting_products(organization_id,nome,categoria,resumo,${valores.split("|")[0]})
        values ('${ORG_A}','Check ${restricao}','c','r',${valores.split("|")[1]});
        raise exception 'aceitou';
      exception when check_violation then
        get stacked diagnostics nome = constraint_name;
        if nome <> 'prospecting_products_${restricao}_check' then raise; end if;
      end $t$; select 'recusado';`)
        .split("\n")
        .at(-1);
    expect(recusa("link_demo|'http://x.com'", "link_demo")).toBe("recusado");
    expect(recusa("solucoes|'[]'::jsonb", "solucoes")).toBe("recusado");
  });

  it("nome vivo é único por organização; arquivado libera o nome", () => {
    const out = sql(`do $t$ begin
        insert into prospecting_products(organization_id,nome,categoria,resumo) values ('${ORG_A}','  PRODUTO a ','c','r');
        raise exception 'aceitou nome repetido';
      exception when unique_violation then null;
      end $t$;
      update prospecting_products set archived_at=now() where id='${PROD_A}';
      insert into prospecting_products(organization_id,nome,categoria,resumo) values ('${ORG_A}','Produto A','c','r');
      select 'ok';`);
    expect(out.split("\n").at(-1)).toBe("ok");
  });
});
