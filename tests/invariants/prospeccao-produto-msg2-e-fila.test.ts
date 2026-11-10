import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  criarFixtureDeOfertas,
  limparFixtureDeOfertas,
  type FixtureDeOfertas,
} from "../support/prospeccao-ofertas-fixture";
import { prospectingConversationContext } from "@/lib/prospecting/context";
import {
  conferirMsg2DoTurno,
  msg2PendenteDoTurno,
} from "@/lib/prospecting/produto/msg2";
import {
  proximoDaFilaDoProduto,
  registrarMensagemBarrada,
} from "@/lib/prospecting/produto/fila";
import type { ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";

// A trilha de auditoria não é o objeto desta prova (a fixture não cria o ambiente do cliente admin).
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Prova no banco real (`pnpm test:db`) do ESTADO e da FILA do roteiro "achado primeiro":
 *
 *  - `msg2_sent_at` / `msg2_literal` existem no baseline (install E update) e a marca é ATÔMICA:
 *    a Msg 2 não é marcada nem entregue ao agente duas vezes;
 *  - duas organizações: a Msg 2, a marca e a fila de uma NUNCA alcançam a outra;
 *  - a fila do produto pula quem não tem achado com solução (persistindo o motivo) e deixa
 *    na fila quem espera a auditoria;
 *  - o aviso de texto barrado é UM por campanha enquanto aberto (índice único por título, 0539).
 */
if (!process.env.TEST_DB_CONTAINER) throw new Error("Esta prova exige o Postgres efêmero de test:db.");
const pool = new pg.Pool({
  host: "127.0.0.1",
  port: Number(process.env.TEST_DB_PORT ?? 54329),
  user: "postgres",
  password: "postgres",
  database: "postgres",
  max: 2,
  statement_timeout: 5000,
});

const orgs = [randomUUID(), randomUUID()];
let a: FixtureDeOfertas;
let b: FixtureDeOfertas;

const snapshot = (): ProdutoSnapshot => ({
  product_id: randomUUID(),
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  // O candidato da fixture é um agregador (Linktree): é o achado que o produto resolve.
  solucoes: { agregador: "o cardápio vira uma página própria, com foto e preço" },
  prova: null,
  link_demo: "https://manero.exemplo.com.br/demo",
  proibicoes: [],
});

async function ligarProduto(f: FixtureDeOfertas, snap: ProdutoSnapshot) {
  await pool.query(
    "update prospecting_campaigns set config = config || jsonb_build_object('exit_offer','every_message','product_id',$3::text,'product_snapshot',$4::jsonb) where organization_id=$1 and id=$2",
    [f.org, f.campaign, snap.product_id, JSON.stringify(snap)],
  );
}

async function msg2Estado(f: FixtureDeOfertas) {
  const { rows } = await pool.query<{ msg2_sent_at: Date | null; msg2_literal: boolean | null }>(
    "select msg2_sent_at, msg2_literal from prospecting_candidates where organization_id=$1 and id=$2",
    [f.org, f.candidate],
  );
  return rows[0]!;
}

beforeAll(async () => {
  for (const org of orgs)
    await pool.query(
      "insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Msg2 QA','Msg2 QA')",
      [org, `msg2-qa-${org}`],
    );
  a = await criarFixtureDeOfertas(pool, orgs[0]!);
  b = await criarFixtureDeOfertas(pool, orgs[1]!);
  await ligarProduto(a, snapshot());
  await ligarProduto(b, snapshot());
});

afterAll(async () => {
  try {
    for (const f of [a, b]) {
      if (!f) continue;
      await pool.query("delete from agent_inbox_items where organization_id=$1", [f.org]);
      await pool.query(
        "delete from prospecting_candidates where organization_id=$1 and campaign_id=$2 and id<>$3",
        [f.org, f.campaign, f.candidate],
      );
      await limparFixtureDeOfertas(pool, f);
    }
    for (const org of orgs) await pool.query("delete from organizations where id=$1", [org]);
  } finally {
    await pool.end();
  }
});

describe("a Msg 2 pendente no banco real", () => {
  it("as colunas de estado existem e nascem nulas (candidato novo = Msg 2 pendente)", async () => {
    expect(await msg2Estado(a)).toEqual({ msg2_sent_at: null, msg2_literal: null });
  });

  it("a Msg 2 chega ao agente como DADO e o system não leva nem o nome do negócio nem o achado", async () => {
    const m = await msg2PendenteDoTurno(pool, a.org, a.conversation);
    expect(m).not.toBeNull();
    expect(m!.esperada).toContain("o cardápio vira uma página própria, com foto e preço");
    expect(m!.bloco).toContain(a.nome);
    const system = await prospectingConversationContext(pool, a.org, a.conversation);
    expect(system).not.toContain(a.nome);
    expect(system).not.toContain("o cardápio vira uma página própria");
    expect(system).toContain('vende o produto "Manero"');
  });

  it("outra organização não alcança a Msg 2 desta conversa nem a marca", async () => {
    expect(await msg2PendenteDoTurno(pool, b.org, a.conversation)).toBeNull();
    const m = (await msg2PendenteDoTurno(pool, a.org, a.conversation))!;
    // Marca tentada com a organização errada (a mesma SQL da conferência): 0 linhas.
    const r = await conferirMsg2DoTurno(pool, {
      org: b.org,
      conversationId: a.conversation,
      msg2: m,
      corposConfirmados: [m.esperada],
    });
    expect(r).toBe("literal"); // a conferência é do texto…
    expect(await msg2Estado(a)).toEqual({ msg2_sent_at: null, msg2_literal: null }); // …mas nada foi marcado em A
  });

  it("recusa da pessoa não marca nada: a Msg 2 segue pendente", async () => {
    const m = (await msg2PendenteDoTurno(pool, a.org, a.conversation))!;
    const r = await conferirMsg2DoTurno(pool, {
      org: a.org,
      conversationId: a.conversation,
      msg2: m,
      corposConfirmados: ["Tudo bem, obrigado pelo retorno!"],
    });
    expect(r).toBe("nao_foi_a_msg2");
    expect((await msg2Estado(a)).msg2_sent_at).toBeNull();
  });

  it("literal: marca UMA vez (atômico), some do próximo turno e o system manda NÃO reenviar", async () => {
    const m = (await msg2PendenteDoTurno(pool, a.org, a.conversation))!;
    const [r1, r2] = await Promise.all([
      conferirMsg2DoTurno(pool, { org: a.org, conversationId: a.conversation, msg2: m, corposConfirmados: [m.esperada] }),
      conferirMsg2DoTurno(pool, { org: a.org, conversationId: a.conversation, msg2: m, corposConfirmados: [m.esperada] }),
    ]);
    expect([r1, r2]).toEqual(["literal", "literal"]);
    const estado = await msg2Estado(a);
    expect(estado.msg2_sent_at).not.toBeNull();
    expect(estado.msg2_literal).toBe(true);
    // Não é entregue de novo, e o agente é instruído a não repetir a apresentação.
    expect(await msg2PendenteDoTurno(pool, a.org, a.conversation)).toBeNull();
    expect(await prospectingConversationContext(pool, a.org, a.conversation)).toMatch(/JÁ foi enviada/);
  });

  it("reescrita: marca literal=false e abre UM aviso na Central, com a conversa", async () => {
    const m = (await msg2PendenteDoTurno(pool, b.org, b.conversation))!;
    const r = await conferirMsg2DoTurno(pool, {
      org: b.org,
      conversationId: b.conversation,
      msg2: m,
      corposConfirmados: [`Combinado. O que vimos na ${b.nome}: falta uma página. Veja https://manero.exemplo.com.br/demo`],
    });
    expect(r).toBe("reescrita");
    expect(await msg2Estado(b)).toMatchObject({ msg2_literal: false });
    const { rows } = await pool.query(
      "select kind, ref_kind, ref_id from agent_inbox_items where organization_id=$1 and title like 'Prospecção: o agente reescreveu%'",
      [b.org],
    );
    expect(rows).toEqual([{ kind: "other", ref_kind: "conversation", ref_id: b.conversation }]);
    // E nada vazou para a outra organização.
    const { rowCount } = await pool.query(
      "select 1 from agent_inbox_items where organization_id=$1 and title like 'Prospecção:%'",
      [a.org],
    );
    expect(rowCount).toBe(0);
  });
});

describe("a fila do produto no banco real", () => {
  const semAchadoComSolucao = {
    ver: 1,
    classe: "site-ruim",
    problemas: ["lento"],
    checklist: { tem: [], falta: [] },
    final_url: "https://x.example.test/",
    http_status: 200,
    tempo_ms: 100,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-09T12:00:00.000Z",
    provisorio: false,
    tentativas: 0,
  };

  async function enfileirar(f: FixtureDeOfertas, nome: string, data: Record<string, unknown>) {
    const id = randomUUID();
    await pool.query(
      "insert into prospecting_candidates(id,organization_id,campaign_id,place_id,data,status) values($1,$2,$3,$4,$5::jsonb,'queued')",
      [id, f.org, f.campaign, `qa-${id}`, JSON.stringify({ key: `qa-${id}`, name: nome, ...data })],
    );
    return id;
  }

  it("pula quem não tem achado com solução (persistindo o motivo), mantém quem espera a auditoria e entrega o elegível", async () => {
    const inelegivel = await enfileirar(a, "Sem achado", { website: "https://x.example.test", site: semAchadoComSolucao });
    const pendente = await enfileirar(a, "Pendente", { website: "https://y.example.test" });
    const elegivel = await enfileirar(a, "Elegível", {
      website: "https://links.example.test/x",
      site: { ...semAchadoComSolucao, classe: "agregador", problemas: [] },
    });
    const r = await proximoDaFilaDoProduto(pool, a.org, a.campaign, snapshot(), new Date().toISOString());
    expect(r.candidato?.id).toBe(elegivel);
    expect(r.haPendentes).toBe(true);
    expect(r.puladas).toBe(1);
    const { rows } = await pool.query<{ id: string; status: string; error: string | null }>(
      "select id, status, error from prospecting_candidates where organization_id=$1 and id = any($2::uuid[]) order by id",
      [a.org, [inelegivel, pendente, elegivel]],
    );
    const por = Object.fromEntries(rows.map((x) => [x.id, x]));
    expect(por[inelegivel]).toMatchObject({ status: "skipped" });
    expect(por[inelegivel]!.error).toMatch(/^Sem achado para o produto:/);
    expect(por[pendente]).toMatchObject({ status: "queued", error: null });
    expect(por[elegivel]).toMatchObject({ status: "queued" });
  });

  it("outra organização nunca vê nem pula a fila desta", async () => {
    const intruso = await proximoDaFilaDoProduto(pool, b.org, a.campaign, snapshot(), new Date().toISOString());
    expect(intruso).toMatchObject({ candidato: null, haPendentes: false, puladas: 0 });
  });
});

describe("o aviso de texto barrado", () => {
  it("é UM por campanha enquanto aberto (o índice único por título fecha a corrida), e cada candidato falha com o motivo", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of ids)
      await pool.query(
        "insert into prospecting_candidates(id,organization_id,campaign_id,place_id,data,status) values($1,$2,$3,$4,'{\"name\":\"x\"}'::jsonb,'queued')",
        [id, b.org, b.campaign, `qa-${id}`],
      );
    // Em corrida: os três avisos tentam abrir ao mesmo tempo.
    await Promise.all(
      ids.map((id) =>
        registrarMensagemBarrada(pool, {
          org: b.org,
          campaignId: b.campaign,
          campaignName: "Campanha QA",
          candidateId: id,
          conversationId: null,
          motivos: ["Mensagem 1: O texto contém o termo proibido \"clientes\"."],
        }),
      ),
    );
    const { rows } = await pool.query(
      "select count(*)::int as n from agent_inbox_items where organization_id=$1 and kind='other' and status='open' and title like 'Prospecção: mensagem barrada%'",
      [b.org],
    );
    expect(rows[0]!.n).toBe(1);
    const { rows: cand } = await pool.query(
      "select status, error from prospecting_candidates where organization_id=$1 and id = any($2::uuid[])",
      [b.org, ids],
    );
    expect(cand).toHaveLength(3);
    for (const c of cand) {
      expect(c.status).toBe("failed");
      expect(c.error).toMatch(/^Mensagem barrada antes do envio:/);
    }
  });
});
