import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A MSG 1 DO PRODUTO NO ENVIO (PX-04 / PX-05), medida pelo `sendNextCandidate` real.
 *
 * O que se prova:
 *  - campanha com retrato de produto: a IA NÃO é chamada, e o que sai pelo canal é, byte a byte,
 *    o texto de `montarRoteiroDoCandidato` (a mesma função da prévia da tela — prova em par);
 *  - sai em UMA bolha mesmo com o estilo de bolhas ligado (o rodapé não pode morar numa bolha
 *    posterior);
 *  - achado sem solução nunca sai: a empresa vai a "Não abordado" sem tentativa nem cota;
 *  - auditoria pendente: a empresa espera, a campanha NÃO é concluída;
 *  - texto barrado (proibição) NÃO sai, não queima cota, falha o candidato com o motivo,
 *    abre UM aviso na Central e audita — falha do candidato, a fila segue (sem pausar);
 *  - campanha SEM produto: a IA escreve, como sempre (regressão).
 */
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  send: vi.fn(),
  audit: vi.fn(),
  guard: vi.fn(),
  continuation: vi.fn(),
  boundary: vi.fn(),
  preflight: vi.fn(),
  authorize: vi.fn(),
  knobs: vi.fn(),
  recordSend: vi.fn(),
}));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: mocks.send }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/agent-engine/agent/abordagem-de-formulario", () => ({
  gerarAbordagemDeFormulario: mocks.generate,
}));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({ llmEdgeConfigFromEnv: () => ({}) }));
vi.mock("@/lib/atendimento/origem", () => ({
  assertServiceBoundarySupabase: mocks.boundary,
  beginServiceAtOrigin: vi.fn(),
}));
vi.mock("@/lib/atendimento/fronteira", () => ({ parseServiceBoundary: (x: unknown) => x }));
vi.mock("@/lib/ai/elegibilidade/autorizacao", () => ({ autorizarContatoParaIA: mocks.authorize }));
vi.mock("@/lib/ai/elegibilidade/consulta-pre-go-live", () => ({
  decidirPreGoLiveDoCanalViaSupabase: mocks.preflight,
}));
vi.mock("@/lib/prospecting/guard", () => ({
  assertProspectingDelivery: mocks.guard,
  assertProspectingContinuation: mocks.continuation,
}));
vi.mock("@/lib/agent-engine/pacing/store", () => ({
  loadChannelKnobs: mocks.knobs,
  loadPacingState: vi.fn().mockResolvedValue({ sentToday: 0 }),
  recordSend: mocks.recordSend,
}));
vi.mock("@/lib/agent-engine/pacing/engine", () => ({
  janelaDeEnvioAberta: () => true,
  janelaDeProspeccaoAberta: () => true,
  decidePacing: () => ({ allow: true, waitMs: 0 }),
  proximaAberturaDaJanela: () => new Date(Date.now() + 3600000),
  proximaAberturaDaProspeccao: () => new Date(Date.now() + 3600000),
  warmupCapFor: (_idade: number, degraus: Array<{ minAgeDays: number; cap: number | null }>) => {
    let cap: number | null = degraus[0]?.cap ?? null;
    for (const d of degraus) if (_idade >= d.minAgeDays) cap = d.cap;
    return cap;
  },
}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/prospecting/store", () => ({
  withProspectingLock: vi.fn(),
  synchronizeSearch: vi.fn(),
  validateConfig: vi.fn().mockResolvedValue(undefined),
  prepararCandidatoNoEnvio: vi.fn(),
}));
vi.mock("@/lib/prospecting/preparo", () => ({ prepararCandidatos: vi.fn() }));

import { sendNextCandidate } from "@/lib/prospecting/worker";
import { montarRoteiroDoCandidato } from "@/lib/prospecting/produto/roteiro-do-candidato";
import type { ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";
import { rodapeDeSaida } from "@/lib/prospecting/rodape-de-saida";
import type { Campaign } from "@/lib/prospecting/store";

const id = "10000000-0000-4000-8000-000000000001";
const snapshot = (parcial: Partial<ProdutoSnapshot> = {}): ProdutoSnapshot => ({
  product_id: "10000000-0000-4000-8000-000000000009",
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
  prova: null,
  link_demo: "https://manero.exemplo.com.br/demo",
  proibicoes: [],
  ...parcial,
});
const campanha = (extra: Record<string, unknown> = {}) =>
  ({
    id,
    organization_id: id,
    name: "Campanha de teste",
    next_send_at: new Date(0),
    config: {
      agent_id: id,
      channel_session_id: id,
      pipeline_id: id,
      stage_id: id,
      qualified_stage_id: "10000000-0000-4000-8000-000000000002",
      instruction: "Oferta definida pelo operador",
      qualification: "Necessidade confirmada pela pessoa",
      daily_limit: 10,
      interval_minutes: 15,
      legal_basis_ref: "LIA-example",
      exit_offer: "every_message",
      product_id: "10000000-0000-4000-8000-000000000009",
      product_snapshot: snapshot(),
      ...extra,
    },
  }) as unknown as Campaign;

const candidato = (parcial: Record<string, unknown> = {}) => ({
  id: "candidate",
  contact_id: id,
  conversation_id: id,
  message_id: "stable-message",
  phone: "+5511999990000",
  service_boundary: { conversation_id: id },
  status: "queued",
  data: { name: "Padaria Central", website: null, socials: [], emails: [] },
  ...parcial,
});

function database(
  candidatos: Record<string, unknown>[],
  opcoes: { agente?: Record<string, unknown> } = {},
) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("select daily_message_limit")) return { rows: [{ daily_message_limit: 50 }] };
      if (sql.includes("count(*) filter"))
        return { rows: [{ campaign: 0, total: 0, retry_at: null, last_attempt: null }] };
      if (
        sql.startsWith("select * from prospecting_candidates") ||
        sql.startsWith("select * from public.prospecting_candidates")
      )
        return { rows: candidatos };
      if (sql.startsWith("select locale from organizations")) return { rows: [{ locale: "pt-BR" }] };
      if (/^select (a\.)?published_version_id/.test(sql))
        return {
          rows: [opcoes.agente ?? { published_version_id: id, operation_revision: 1 }],
        };
      if (sql.includes("insert into agent_inbox_items")) return { rows: [{ id: "aviso" }] };
      return { rows: [] };
    }),
  };
}
const sqlsComEfeito = (db: ReturnType<typeof database>) => db.calls.map((c) => c.sql);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.knobs.mockResolvedValue({ knobs: {} });
  mocks.preflight.mockResolvedValue({ permite: true });
  mocks.guard.mockResolvedValue(undefined);
  mocks.continuation.mockResolvedValue(undefined);
  mocks.boundary.mockResolvedValue(undefined);
  mocks.authorize.mockResolvedValue({ ok: true });
  mocks.send.mockResolvedValue({ status: "sent" });
  mocks.generate.mockResolvedValue({ ok: true, texto: "Texto escrito pela IA." });
});

function msgEsperada(data: Record<string, unknown>, snap = snapshot()) {
  const r = montarRoteiroDoCandidato({
    data: data as never,
    snapshot: snap,
    locale: "pt-BR",
    agoraIso: new Date().toISOString(),
  });
  if (r.estado !== "pronto") throw new Error("fixture inválida");
  return r;
}

describe("campanha COM produto: a Msg 1 é montada pelo sistema", () => {
  it("a IA NÃO é chamada e o corpo enviado é o texto montado, igual à prévia da tela", async () => {
    const c = candidato();
    const db = database([c]);
    await sendNextCandidate({} as never, db as never, {} as never, campanha());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const enviado = (mocks.send.mock.calls[0]?.[2] as { body: string }).body;
    expect(enviado).toBe(msgEsperada(c.data).msg1);
    expect(enviado).toContain("Aqui é Dani, da Manero.");
    expect(enviado.endsWith(rodapeDeSaida("pt-BR"))).toBe(true);
    // O rodapé aparece UMA vez (o `comSaida` do worker é idempotente sobre o texto montado).
    expect(enviado.split(rodapeDeSaida("pt-BR"))).toHaveLength(2);
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({
      internalMessageId: "stable-message",
      prospectingDelivery: { candidateId: "candidate" },
    });
  });

  it("com o estilo de bolhas LIGADO a Msg 1 continua em UMA mensagem, com o rodapé inteiro", async () => {
    const db = database([candidato()], {
      agente: { published_version_id: id, operation_revision: 1, split_messages: true, split_max_chars: 40 },
    });
    await sendNextCandidate({} as never, db as never, {} as never, campanha(), async () => {});
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((mocks.send.mock.calls[0]?.[2] as { body: string }).body).toContain(rodapeDeSaida("pt-BR"));
  });

  it("o modo every_message não reserva nem conta: 'exit_offered_at' fica intocado", async () => {
    const db = database([candidato()]);
    await sendNextCandidate({} as never, db as never, {} as never, campanha());
    const update = db.calls.find((c) => c.sql.includes("update prospecting_candidates set status=$3"))!;
    expect(update.sql).toContain("and false then now()"); // ehPrimeira = false
  });

  it("achado SEM solução nunca sai: a empresa vai a 'Não abordado', sem tentativa nem cota", async () => {
    const db = database([candidato()]);
    await sendNextCandidate(
      {} as never,
      db as never,
      {} as never,
      campanha({ product_snapshot: snapshot({ solucoes: { lento: "abre rápido" } }) }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordSend).not.toHaveBeenCalled();
    const pulo = db.calls.find(
      (c) => c.sql.includes("status='skipped'") && c.sql.includes("prospecting_candidates"),
    )!;
    expect(String(pulo.params[2])).toMatch(/^Sem achado para o produto:/);
    expect(sqlsComEfeito(db).some((s) => s.includes("attempted_at=now()"))).toBe(false);
  });

  it("auditoria pendente: a empresa espera e a campanha NÃO é dada como concluída", async () => {
    const db = database([candidato({ data: { name: "X", website: "https://x.com.br", socials: [], emails: [] } })]);
    await sendNextCandidate({} as never, db as never, {} as never, campanha());
    expect(mocks.send).not.toHaveBeenCalled();
    expect(sqlsComEfeito(db).some((s) => s.includes("status='completed'"))).toBe(false);
    expect(sqlsComEfeito(db).some((s) => s.includes("status='skipped'"))).toBe(false);
  });

  it("sem ninguém na fila: a campanha é concluída, como sempre", async () => {
    const db = database([]);
    await sendNextCandidate({} as never, db as never, {} as never, campanha());
    expect(sqlsComEfeito(db).some((s) => s.includes("status='completed'"))).toBe(true);
  });
});

describe("texto barrado antes do envio (PR-07 / §6.2)", () => {
  const barrada = () => campanha({ product_snapshot: snapshot({ proibicoes: ["clientes"] }) });

  it("NÃO sai, NÃO queima cota, falha o candidato com o motivo e audita (sem o texto)", async () => {
    const db = database([candidato()]);
    await sendNextCandidate({} as never, db as never, {} as never, barrada());
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordSend).not.toHaveBeenCalled();
    expect(sqlsComEfeito(db).some((s) => s.includes("attempted_at=now()"))).toBe(false);
    const falha = db.calls.find((c) => c.sql.includes("status='failed'") && c.sql.includes("set status"))!;
    expect(String(falha.params[2])).toMatch(/^Mensagem barrada antes do envio:.*clientes/);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prospecting.message_blocked",
        resourceId: "candidate",
        metadata: expect.objectContaining({ campaign_id: id }),
      }),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("Padaria Central");
  });

  it("abre UM aviso na Central, deduplicado por título (defeito de produto não vira um por empresa)", async () => {
    const db = database([candidato()]);
    await sendNextCandidate({} as never, db as never, {} as never, barrada());
    const aviso = db.calls.filter((c) => c.sql.includes("insert into agent_inbox_items"));
    expect(aviso).toHaveLength(1);
    expect(aviso[0]!.params).toContain("other");
    expect(String(aviso[0]!.params.join("|"))).toContain("Campanha de teste");
    expect(aviso[0]!.sql).toContain("not exists");
    // Dedupe por título, sem ref: é o índice único do banco (0539) que fecha a corrida.
    expect(aviso[0]!.params.slice(-2)).toEqual([false, true]);
  });

  it("é falha DESTA empresa: a campanha não pausa nem lança, e a fila segue", async () => {
    const db = database([candidato()]);
    await expect(
      sendNextCandidate({} as never, db as never, {} as never, barrada()),
    ).resolves.toBeUndefined();
    expect(sqlsComEfeito(db).some((s) => s.includes("status='paused'"))).toBe(false);
  });

  it("emoji no resumo do produto também barra", async () => {
    const db = database([candidato()]);
    await sendNextCandidate(
      {} as never,
      db as never,
      {} as never,
      campanha({ product_snapshot: snapshot({ resumo: "Cardápio digital 🍕." }) }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
    const falha = db.calls.find((c) => c.sql.includes("status='failed'") && c.sql.includes("set status"))!;
    expect(String(falha.params[2])).toContain("emoji");
  });
});

describe("campanha SEM produto: a IA escreve, como sempre (regressão)", () => {
  it("chama a IA, envia o texto dela com a saída e não consulta o roteiro", async () => {
    const semProduto = campanha({
      exit_offer: "first_message",
      product_id: undefined,
      product_snapshot: undefined,
    });
    const db = database([candidato()]);
    await sendNextCandidate({} as never, db as never, {} as never, semProduto);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((mocks.send.mock.calls[0]?.[2] as { body: string }).body).toBe(
      `Texto escrito pela IA.\n\n${rodapeDeSaida("pt-BR")}`,
    );
    expect(sqlsComEfeito(db).some((s) => s.includes("public.prospecting_candidates"))).toBe(false);
  });
});
