import { beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O PRODUTO NA ATIVAÇÃO DA CAMPANHA (PX-03 / PX-04), medido pelo comportamento de
 * `activateCampaign` contra um cliente `pg` falso — a mesma técnica de
 * `prospeccao-ativacao-respeita-a-selecao.test.ts`.
 *
 * O que se prova:
 *  - o retrato (`product_snapshot`) nasce NO SERVIDOR, do produto VIVO da MESMA organização;
 *  - o que o corpo mandar em `product_snapshot` é descartado (nunca confiar no corpo);
 *  - produto de outra organização / arquivado / inexistente: a MESMA recusa, e nada é gravado;
 *  - a saída vira `every_message` (o operador não escolhe);
 *  - editar o produto depois NÃO muda o retrato de uma ativação já gravada;
 *  - empresa sem achado com solução NÃO entra na fila, com o motivo em `error`;
 *  - campanha SEM produto: o comportamento de sempre, intacto.
 */

const createContact = vi.fn();
const createLead = vi.fn();
const beginService = vi.fn();
vi.mock("@/app/api/v1/contacts/_handler", () => ({
  createContactHandler: (...a: unknown[]) => createContact(...a),
}));
vi.mock("@/app/api/v1/leads/_handler", () => ({
  createLeadHandler: (...a: unknown[]) => createLead(...a),
}));
vi.mock("@/lib/atendimento/origem", () => ({
  beginServiceAtOrigin: (...a: unknown[]) => beginService(...a),
}));
vi.mock("@/lib/agent-engine/agent/router-config", () => ({
  loadActiveRouter: async () => null,
}));
vi.mock("@/lib/agent-engine/agent/agent-config", () => ({
  loadPublishedAgentConfig: async () => ({ agentId: AGENT }),
}));

const ORG = "00000000-0000-4000-8000-000000000001";
const CAMP = "00000000-0000-4000-8000-000000000002";
const AGENT = "00000000-0000-4000-8000-000000000003";
const CHANNEL = "00000000-0000-4000-8000-000000000004";
const PIPE = "00000000-0000-4000-8000-000000000005";
const STAGE_A = "00000000-0000-4000-8000-000000000006";
const STAGE_B = "00000000-0000-4000-8000-000000000007";
const PRODUTO = "00000000-0000-4000-8000-000000000009";

const configBase = {
  agent_id: AGENT,
  channel_session_id: CHANNEL,
  pipeline_id: PIPE,
  stage_id: STAGE_A,
  qualified_stage_id: STAGE_B,
  instruction: "Apresente o serviço com calma.",
  qualification: "Tem interesse e orçamento.",
  daily_limit: 10,
  interval_minutes: 15,
  legal_basis_ref: "legítimo interesse",
  ofertas: ["site" as const],
  exit_offer: "first_message" as const,
  funnel_entry: "on_send" as const,
};

const produtoVivo = (parcial: Record<string, unknown> = {}) => ({
  id: PRODUTO,
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
  prova: null,
  link_demo: null,
  proibicoes: [],
  assina: "Dani",
  updated_at: new Date("2026-11-10T10:00:00.000Z"),
  ...parcial,
});

const { activateCampaign } = await import("@/lib/prospecting/store");
const { ProspectingError } = await import("@/lib/prospecting/provider");
const { campaignConfigSchema } = await import("@/lib/prospecting/schema");
const { PREFIXO_SEM_ACHADO } = await import("@/lib/prospecting/produto/achados-da-empresa");

type Linha = Record<string, unknown>;
interface Cenario {
  candidatos?: Linha[];
  configDaCampanha?: unknown;
  /** Linhas que `prospecting_products` devolve para a consulta (vazio = produto não é desta org / arquivado). */
  produtos?: Linha[];
  agenteNome?: string | null;
}
function fakePool(c: Cenario = {}) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const responder = (sql: string): Linha[] => {
    if (sql.includes("pg_try_advisory_lock")) return [{ locked: true }];
    if (sql.includes("from ai_agents a join ai_agent_versions"))
      return [{ tool_ids: ["crm_move_lead_stage"], pipeline_ids: [PIPE] }];
    if (sql.includes("from channel_sessions")) return [{ provider: "waha", status: "WORKING" }];
    if (sql.includes("from crm_stages")) return [{ id: STAGE_A }, { id: STAGE_B }];
    if (sql.startsWith("select * from prospecting_campaigns"))
      return [
        {
          id: CAMP,
          name: "C",
          status: "draft",
          search_status: "succeeded",
          config: c.configDaCampanha ?? null,
        },
      ];
    if (sql.includes("from public.prospecting_products")) return c.produtos ?? [];
    if (sql.includes("from public.ai_agents")) return [{ name: c.agenteNome ?? null }];
    if (sql.includes("from public.organizations")) return [{ locale: "pt-BR" }];
    if (sql.startsWith("select * from prospecting_candidates")) return c.candidatos ?? [];
    if (sql.startsWith("select id from contacts where organization_id=$1 and phone_number")) return [];
    if (sql.includes("contact_phones")) return [];
    return [];
  };
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      sqls.push({ sql, params });
      return { rows: responder(sql) };
    },
    release: () => {},
  };
  const configsGravadas = () =>
    sqls
      .filter((s) => s.sql.startsWith("update prospecting_campaigns set config=$3"))
      .map((s) => s.params[2] as Record<string, unknown>);
  return { pool: { connect: async () => client } as unknown as pg.Pool, sqls, configsGravadas };
}

const candidato = (id: string, data: Record<string, unknown>) => ({
  id,
  campaign_id: CAMP,
  status: "new",
  selected: true,
  phone: "+5511999990001",
  contact_id: null,
  lead_id: null,
  data: { key: `place-${id}`, name: `Empresa ${id}`, ...data },
});

const comProduto = { ...configBase, product_id: PRODUTO };

beforeEach(() => {
  createContact.mockReset();
  createLead.mockReset();
  beginService.mockReset();
});

describe("ativar com produto: o retrato nasce no servidor", () => {
  it("grava o retrato do produto VIVO da mesma organização e força a saída em toda mensagem", async () => {
    const { pool, configsGravadas } = fakePool({ produtos: [produtoVivo()] });
    const r = await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, comProduto);
    expect(r).toMatchObject({ started: true, product_id: PRODUTO, sem_achado: 0 });
    const gravada = campaignConfigSchema.parse(configsGravadas().at(-1));
    expect(gravada.exit_offer).toBe("every_message");
    expect(gravada.product_id).toBe(PRODUTO);
    expect(gravada.product_snapshot).toMatchObject({
      product_id: PRODUTO,
      nome: "Manero",
      assina: "Dani",
      produto_atualizado_em: "2026-11-10T10:00:00.000Z",
      solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
    });
  });

  it("a consulta do produto filtra a organização da SESSÃO e só o produto vivo", async () => {
    const { pool, sqls } = fakePool({ produtos: [produtoVivo()] });
    await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, comProduto);
    const q = sqls.find((s) => s.sql.includes("from public.prospecting_products"))!;
    expect(q.sql).toContain("organization_id=$1");
    expect(q.sql).toContain("archived_at is null");
    expect(q.params).toEqual([ORG, PRODUTO]);
  });

  it("produto de outra organização, arquivado ou inexistente: a MESMA recusa, e nada é gravado", async () => {
    const { pool, configsGravadas, sqls } = fakePool({ produtos: [] });
    await expect(
      activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, comProduto),
    ).rejects.toThrow(ProspectingError);
    await expect(
      activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, comProduto),
    ).rejects.toThrow(/produto cadastrado e ativo desta organização/);
    expect(configsGravadas()).toHaveLength(0);
    expect(sqls.some((s) => s.sql.includes("status='running'") && s.sql.startsWith("update"))).toBe(false);
  });

  it("o retrato mandado pelo corpo é DESCARTADO: vale o do servidor", async () => {
    const { pool, configsGravadas } = fakePool({ produtos: [produtoVivo()] });
    const forjado = {
      ...comProduto,
      product_snapshot: {
        product_id: PRODUTO,
        produto_atualizado_em: "2020-01-01T00:00:00.000Z",
        nome: "FORJADO",
        resumo: "texto forjado",
        assina: "Hacker",
        solucoes: { "sem-site": "promessa forjada" },
        prova: null,
        link_demo: null,
        proibicoes: [],
      },
    };
    await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, forjado);
    const gravada = campaignConfigSchema.parse(configsGravadas().at(-1));
    expect(gravada.product_snapshot?.nome).toBe("Manero");
    expect(JSON.stringify(gravada)).not.toContain("forjad");
  });

  it("sem 'Assina' no produto, assina o nome do agente; sem nenhum dos dois, recusa", async () => {
    const a = fakePool({ produtos: [produtoVivo({ assina: null })], agenteNome: "Bia" });
    await activateCampaign(a.pool, {} as SupabaseClient, ORG, CAMP, comProduto);
    expect(campaignConfigSchema.parse(a.configsGravadas().at(-1)).product_snapshot?.assina).toBe("Bia");

    const b = fakePool({ produtos: [produtoVivo({ assina: null })], agenteNome: null });
    await expect(
      activateCampaign(b.pool, {} as SupabaseClient, ORG, CAMP, comProduto),
    ).rejects.toThrow(/Assina/);
  });

  it("produto cujo texto montado seria barrado é recusado na ativação, com o motivo", async () => {
    const { pool, configsGravadas } = fakePool({ produtos: [produtoVivo({ proibicoes: ["cardápio"] })] });
    await expect(
      activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, comProduto),
    ).rejects.toThrow(/seria barrado.*cardápio/);
    expect(configsGravadas()).toHaveLength(0);
  });
});

describe("editar o produto depois NÃO altera a campanha", () => {
  it("retomar a MESMA ativação mantém o retrato antigo, mesmo com o produto editado", async () => {
    // 1ª tentativa: grava o retrato com o produto como estava.
    const primeira = fakePool({ produtos: [produtoVivo()] });
    await activateCampaign(primeira.pool, {} as SupabaseClient, ORG, CAMP, comProduto);
    const salva = primeira.configsGravadas().at(-1)!;

    // O operador edita o produto no meio da preparação…
    const editado = produtoVivo({
      nome: "Manero Pro",
      solucoes: { "sem-site": "promessa NOVA" },
      updated_at: new Date("2026-11-10T11:00:00.000Z"),
    });
    // …e a campanha é retomada com a mesma configuração (config já salva no banco).
    const segunda = fakePool({ produtos: [editado], configDaCampanha: salva });
    await activateCampaign(segunda.pool, {} as SupabaseClient, ORG, CAMP, comProduto);
    const final = campaignConfigSchema.parse(segunda.configsGravadas().at(-1));
    expect(final.product_snapshot?.nome).toBe("Manero");
    expect(final.product_snapshot?.solucoes["sem-site"]).not.toContain("NOVA");
    // E nem consultou o produto vivo: o retrato salvo vale.
    expect(segunda.sqls.some((s) => s.sql.includes("from public.prospecting_products"))).toBe(false);
  });

  it("o worker e o contexto só leem o retrato da campanha: ele não tem ligação com a tabela viva", () => {
    // O retrato é um objeto dentro de `config` (jsonb): arquivar/editar o produto não toca a campanha.
    const r = campaignConfigSchema.parse({
      ...comProduto,
      exit_offer: "every_message",
      product_snapshot: {
        product_id: PRODUTO,
        produto_atualizado_em: "2026-11-10T10:00:00.000Z",
        nome: "Manero",
        resumo: "r",
        assina: "Dani",
        solucoes: { codigo_futuro_desconhecido: "ainda abre" },
        prova: null,
        link_demo: null,
        proibicoes: [],
      },
    });
    // Código que o catálogo de hoje não conhece NÃO derruba o parse de uma campanha ativa.
    expect(r.product_snapshot?.solucoes).toHaveProperty("codigo_futuro_desconhecido");
  });
});

describe("a fila só leva quem tem achado citável COM solução (D2 = A)", () => {
  const siteRuim = (problemas: string[]) => ({
    ver: 1,
    classe: "site-ruim",
    problemas,
    checklist: { tem: [], falta: [] },
    final_url: "https://x.com.br/",
    http_status: 200,
    tempo_ms: 300,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-09T12:00:00.000Z",
    provisorio: false,
    tentativas: 0,
  });

  it("elegível entra na fila; inelegível vai a 'Não abordado' com o motivo, sem contato nem conversa", async () => {
    const { pool, sqls } = fakePool({
      produtos: [produtoVivo()],
      candidatos: [
        candidato("sem-site", { website: null }), // tem solução cadastrada
        candidato("lento", { website: "https://x.com.br", site: siteRuim(["lento"]) }), // achado sem solução
        candidato("pendente", { website: "https://y.com.br" }), // auditoria pendente: entra, é reavaliada no envio
      ],
    });
    const r = await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, {
      ...comProduto,
      funnel_entry: "on_send",
    });
    expect(r).toMatchObject({ sem_achado: 1 });
    const upd = (id: string) =>
      sqls.find((s) => s.sql.startsWith("update prospecting_candidates") && s.params[1] === id);
    expect(upd("sem-site")!.sql).toContain("status='queued'");
    expect(upd("pendente")!.sql).toContain("status='queued'");
    expect(upd("lento")!.sql).toContain("status='skipped'");
    expect(String(upd("lento")!.params[2]).startsWith(PREFIXO_SEM_ACHADO)).toBe(true);
    expect(createContact).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
  });

  it("em on_start o inelegível também não ganha contato, negócio nem conversa", async () => {
    const { pool } = fakePool({
      produtos: [produtoVivo()],
      candidatos: [candidato("lento", { website: "https://x.com.br", site: siteRuim(["lento"]) })],
    });
    await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, {
      ...comProduto,
      funnel_entry: "on_start",
    });
    expect(createContact).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
    expect(beginService).not.toHaveBeenCalled();
  });
});

describe("campanha SEM produto: o comportamento de hoje, intacto (regressão)", () => {
  it("não consulta produto, não força a saída e não grava retrato", async () => {
    const { pool, sqls, configsGravadas } = fakePool({
      candidatos: [candidato("a", { website: null })],
    });
    const r = await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, configBase);
    expect(r).toEqual({ started: true });
    expect(sqls.some((s) => s.sql.includes("prospecting_products"))).toBe(false);
    const gravada = campaignConfigSchema.parse(configsGravadas().at(-1));
    expect(gravada.exit_offer).toBe("first_message");
    expect(gravada).not.toHaveProperty("product_id");
    expect(gravada).not.toHaveProperty("product_snapshot");
    // O candidato sem site NÃO é avaliado contra produto nenhum: entra na fila como sempre.
    const upd = sqls.find((s) => s.sql.startsWith("update prospecting_candidates") && s.params[1] === "a")!;
    expect(upd.sql).toContain("status='queued'");
  });

  it("um retrato forjado em campanha SEM product_id também é descartado", async () => {
    const { pool, configsGravadas } = fakePool();
    await activateCampaign(pool, {} as SupabaseClient, ORG, CAMP, {
      ...configBase,
      product_snapshot: {
        product_id: PRODUTO,
        produto_atualizado_em: "2020-01-01T00:00:00.000Z",
        nome: "FORJADO",
        resumo: "x",
        assina: "x",
        solucoes: {},
        prova: null,
        link_demo: null,
        proibicoes: [],
      },
    });
    expect(configsGravadas().at(-1)).not.toHaveProperty("product_snapshot");
  });
});
