/**
 * `gerarPreviaDoCandidato` no ramo do PRODUTO: sem IA, o texto é o da `montarRoteiroDoCandidato`
 * (a mesma função do worker), e o motivo de não sair é dito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/agent-engine/agent/abordagem-de-formulario", () => ({
  gerarAbordagemDeFormulario: mocks.generate,
}));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({ llmEdgeConfigFromEnv: () => ({}) }));
vi.mock("@/lib/env", () => ({ env: {} }));

import { gerarPreviaDoCandidato } from "./previa-gerar";
import { montarRoteiroDoCandidato } from "./produto/roteiro-do-candidato";
import type { ProdutoSnapshot } from "./produto/snapshot";
import type { Prospect } from "./schema";

const ORG = "99999999-9999-4999-8999-999999999999";
const AGENTE = "55555555-5555-4555-8555-555555555555";
const CONFIG = {
  agent_id: AGENTE,
  channel_session_id: "66666666-6666-4666-8666-666666666666",
  pipeline_id: "77777777-7777-4777-8777-777777777777",
  stage_id: "88888888-8888-4888-8888-888888888888",
  qualified_stage_id: "99999999-9999-4999-8999-999999999998",
  instruction: "Apresente o produto com educação.",
  qualification: "Tem interesse em conhecer.",
  daily_limit: 10,
  interval_minutes: 15,
  legal_basis_ref: "legítimo interesse, registro 1",
};
const snapshot = (p: Partial<ProdutoSnapshot> = {}): ProdutoSnapshot => ({
  product_id: "66666666-6666-4666-8666-666666666666",
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  solucoes: { "sem-site": "o cardápio vira uma página própria" },
  prova: null,
  link_demo: null,
  proibicoes: [],
  ...p,
});
const DADOS = {
  key: "k",
  name: "Padaria Central",
  website: null,
  emails: [],
  socials: [],
  rating: null,
  reviews: 0,
} as unknown as Prospect;
const pool = {
  query: vi.fn(async (sql: string) =>
    sql.includes("from organizations") ? { rows: [{ locale: "pt-BR" }] } : { rows: [] },
  ),
} as never;
const linha = (config: unknown, data: Prospect = DADOS) => ({
  id: "33333333-3333-4333-8333-333333333333",
  data,
  status: "queued",
  contact_id: null as string | null,
  config,
  search: { niche: "padaria" } as { niche?: string } | null,
});

beforeEach(() => vi.clearAllMocks());

describe("gerarPreviaDoCandidato com produto", () => {
  it("campanha com retrato: sem IA, texto igual ao da função do worker e a Msg 2 ao lado", async () => {
    const snap = snapshot();
    const r = await gerarPreviaDoCandidato(
      pool,
      ORG,
      linha({ ...CONFIG, exit_offer: "every_message", product_id: snap.product_id, product_snapshot: snap }),
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    const esperado = montarRoteiroDoCandidato({
      data: DADOS,
      snapshot: snap,
      locale: "pt-BR",
      agoraIso: new Date().toISOString(),
    });
    if (!r.ok || esperado.estado !== "pronto") throw new Error("fixture");
    expect(r.texto).toBe(esperado.msg1);
    expect(r.mensagem2).toBe(esperado.msg2);
    expect(r.previa.texto).toBe(esperado.msg1);
    expect(r.previa.agente_id).toBe(AGENTE);
  });

  it("rascunho: o retrato de rascunho (da rota) faz o mesmo", async () => {
    const r = await gerarPreviaDoCandidato(pool, ORG, linha(CONFIG), {
      snapshotDeRascunho: snapshot(),
    });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(r.ok && r.mensagem2).toContain("o cardápio vira uma página própria");
  });

  it("empresa sem achado com solução: sem_achado, com o motivo; nada de IA", async () => {
    const r = await gerarPreviaDoCandidato(pool, ORG, linha(CONFIG), {
      snapshotDeRascunho: snapshot({ solucoes: { lento: "abre rápido" } }),
    });
    expect(r).toMatchObject({ ok: false, motivo: "sem_achado" });
    expect(!r.ok && r.detalhe).toMatch(/^Sem achado para o produto:/);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("texto barrado: texto_barrado, com o motivo", async () => {
    const r = await gerarPreviaDoCandidato(pool, ORG, linha(CONFIG), {
      snapshotDeRascunho: snapshot({ proibicoes: ["clientes"] }),
    });
    expect(r).toMatchObject({ ok: false, motivo: "texto_barrado" });
    expect(!r.ok && r.detalhe).toMatch(/clientes/);
  });

  it("auditoria pendente continua sendo auditoria_pendente", async () => {
    const r = await gerarPreviaDoCandidato(
      pool,
      ORG,
      linha(CONFIG, { ...DADOS, website: "https://x.com.br" } as Prospect),
      { snapshotDeRascunho: snapshot() },
    );
    expect(r).toMatchObject({ ok: false, motivo: "auditoria_pendente" });
  });

  it("sem produto: a IA escreve (regressão)", async () => {
    mocks.generate.mockResolvedValue({ ok: true, texto: "Olá! Vi o site de vocês." });
    const r = await gerarPreviaDoCandidato(pool, ORG, linha(CONFIG));
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(r.ok && r.texto).toBe("Olá! Vi o site de vocês.");
    expect(r.ok && r.mensagem2).toBeUndefined();
  });
});
