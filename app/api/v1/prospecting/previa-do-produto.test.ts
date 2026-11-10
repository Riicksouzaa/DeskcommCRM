/**
 * `prever_abordagem` com PRODUTO (PX-05, item "prévia"): a tela mostra a Msg 1 e a Msg 2 do
 * candidato, montadas pela MESMA função do envio (`montarRoteiroDoCandidato`), sem IA e sem
 * gravar prévia. Em rascunho o operador já escolheu o produto, mas o retrato só nasce na
 * ativação: o servidor o monta na hora, do produto DESTA organização (a da sessão).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({ pool: vi.fn(), generate: vi.fn() }));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: deps.pool }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/prospecting/store", () => ({
  activateCampaign: vi.fn(),
  configureCredential: vi.fn(),
  createSearch: vi.fn(),
  validateConfig: vi.fn(),
  withProspectingLock: vi.fn(),
}));
vi.mock("@/lib/agent-engine/agent/abordagem-de-formulario", () => ({
  gerarAbordagemDeFormulario: deps.generate,
}));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({ llmEdgeConfigFromEnv: () => ({}) }));
vi.mock("@/lib/env", () => ({ env: {} }));

import { POST } from "./route";
import { requireRole } from "@/lib/auth/require-role";

const ORG = "99999999-9999-4999-8999-999999999999";
const CAMPANHA = "22222222-2222-4222-8222-222222222222";
const CANDIDATO = "33333333-3333-4333-8333-333333333333";
const AGENTE = "55555555-5555-4555-8555-555555555555";
const PRODUTO = "66666666-6666-4666-8666-666666666666";
const CONFIG = {
  agent_id: AGENTE,
  channel_session_id: "66666666-6666-4666-8666-666666666667",
  pipeline_id: "77777777-7777-4777-8777-777777777777",
  stage_id: "88888888-8888-4888-8888-888888888888",
  qualified_stage_id: "99999999-9999-4999-8999-999999999998",
  instruction: "Apresente o produto com educação.",
  qualification: "Tem interesse em conhecer.",
  daily_limit: 10,
  interval_minutes: 15,
  legal_basis_ref: "legítimo interesse, registro 1",
};
const RETRATO = {
  product_id: PRODUTO,
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
  prova: null,
  link_demo: null,
  proibicoes: [],
};
const produtoVivo = {
  id: PRODUTO,
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
  prova: null,
  link_demo: null,
  proibicoes: [],
  assina: "Dani",
  updated_at: new Date("2026-11-10T10:00:00.000Z"),
};
const SITE_OK = {
  ver: 1,
  classe: "site-ok",
  problemas: [],
  checklist: { tem: [], falta: [] },
  final_url: null,
  http_status: 200,
  tempo_ms: 1,
  conteudo_resumo: null,
  pagespeed: null,
  verificado_em: "2026-10-10T12:00:00.000Z",
  provisorio: false,
  tentativas: 0,
};

function candidato(config: unknown, data: Record<string, unknown> = {}) {
  return {
    id: CANDIDATO,
    data: { key: "k", name: "Padaria Central", website: null, emails: [], socials: [], ...data },
    status: "queued",
    contact_id: null,
    config,
    search: { niche: "padaria" },
  };
}

function poolCom(opcoes: { config: unknown; produtos?: unknown[]; data?: Record<string, unknown> }) {
  const chamadas: { sql: string; params: unknown[] }[] = [];
  deps.pool.mockReturnValue({
    query: async (sql: string, params: unknown[] = []) => {
      chamadas.push({ sql, params });
      if (sql.includes("from prospecting_candidates pc"))
        return { rows: [candidato(opcoes.config, opcoes.data)] };
      if (sql.includes("from public.prospecting_products")) return { rows: opcoes.produtos ?? [] };
      if (sql.includes("from public.organizations") || sql.includes("from organizations"))
        return { rows: [{ locale: "pt-BR" }] };
      return { rows: [] };
    },
  });
  return chamadas;
}

function previa(extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/v1/prospecting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "prever_abordagem",
      id: CAMPANHA,
      candidate_id: CANDIDATO,
      ...extra,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u-1", idioma: "pt" },
    org: { orgId: ORG },
  } as never);
  deps.generate.mockResolvedValue({ ok: true, texto: "Texto da IA" });
});

describe("prever_abordagem com produto", () => {
  it("rascunho com product_id: devolve Msg 1 e Msg 2, sem IA e sem gravar prévia", async () => {
    const chamadas = poolCom({ config: CONFIG, produtos: [produtoVivo] });
    const res = await POST(previa({ product_id: PRODUTO }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(deps.generate).not.toHaveBeenCalled();
    expect(data.mensagem).toContain("Aqui é Dani, da Manero.");
    expect(data.mensagem_2).toContain("o cardápio vira uma página própria, com foto e preço");
    expect(data.salva).toBe(false);
    expect(chamadas.some((c) => c.sql.includes("jsonb_build_object('previa'"))).toBe(false);
    // O produto é lido com a organização da SESSÃO, nunca do corpo.
    const q = chamadas.find((c) => c.sql.includes("from public.prospecting_products"))!;
    expect(q.params).toEqual([ORG, PRODUTO]);
  });

  it("produto de outra organização / arquivado: a mesma recusa, e nada é gravado", async () => {
    const chamadas = poolCom({ config: CONFIG, produtos: [] });
    const res = await POST(previa({ product_id: PRODUTO }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/produto cadastrado e ativo desta organização/);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(chamadas.some((c) => c.sql.includes("jsonb_build_object('previa'"))).toBe(false);
  });

  it("campanha ativa: vale o retrato dela e um product_id do corpo é ignorado", async () => {
    const chamadas = poolCom({
      config: { ...CONFIG, exit_offer: "every_message", product_id: PRODUTO, product_snapshot: RETRATO },
      produtos: [{ ...produtoVivo, nome: "Outro" }],
    });
    const res = await POST(previa({ product_id: "66666666-6666-4666-8666-666666666699" }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.mensagem).toContain("da Manero.");
    expect(chamadas.some((c) => c.sql.includes("from public.prospecting_products"))).toBe(false);
  });

  it("empresa sem achado com solução: 422 com o motivo", async () => {
    poolCom({
      config: {
        ...CONFIG,
        exit_offer: "every_message",
        product_id: PRODUTO,
        product_snapshot: { ...RETRATO, solucoes: { lento: "abre rápido" } },
      },
    });
    const res = await POST(previa());
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/^Sem achado para o produto:/);
  });

  it("texto que seria barrado: 422 com o motivo", async () => {
    poolCom({
      config: {
        ...CONFIG,
        exit_offer: "every_message",
        product_id: PRODUTO,
        product_snapshot: { ...RETRATO, proibicoes: ["clientes"] },
      },
    });
    const res = await POST(previa());
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/clientes/);
  });

  it("sem produto: a IA escreve, como sempre (regressão)", async () => {
    poolCom({ config: CONFIG, data: { website: "https://vitta.test/", site: SITE_OK } });
    const res = await POST(previa());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.mensagem).toBe("Texto da IA");
    expect(data).not.toHaveProperty("mensagem_2");
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });
});
