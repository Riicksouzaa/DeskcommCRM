import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import {
  classificarCorpoDaMsg2,
  conferirMsg2DoTurno,
  msg2PendenteDoTurno,
  pareceTentativaDeMsg2,
} from "@/lib/prospecting/produto/msg2";
import { montarRoteiroDoCandidato } from "@/lib/prospecting/produto/roteiro-do-candidato";
import type { ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";

const ORG = "10000000-0000-4000-8000-000000000001";
const CONV = "10000000-0000-4000-8000-000000000002";
const CAND = "10000000-0000-4000-8000-000000000003";
const CAMP = "10000000-0000-4000-8000-000000000004";

const snapshot: ProdutoSnapshot = {
  product_id: "10000000-0000-4000-8000-000000000009",
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
  prova: "Teste grátis por 7 dias.",
  link_demo: "https://manero.exemplo.com.br/demo",
  proibicoes: [],
};

const config = {
  agent_id: ORG,
  channel_session_id: ORG,
  pipeline_id: ORG,
  stage_id: ORG,
  qualified_stage_id: "10000000-0000-4000-8000-000000000008",
  instruction: "Oferta definida pelo operador",
  qualification: "Necessidade confirmada pela pessoa",
  legal_basis_ref: "LIA-exemplo",
  exit_offer: "every_message",
  product_id: snapshot.product_id,
  product_snapshot: snapshot,
};

const msg2 = (() => {
  const r = montarRoteiroDoCandidato({
    data: { name: "Padaria Central", website: null },
    snapshot,
    locale: "pt",
    agoraIso: "2026-11-10T12:00:00.000Z",
  });
  if (r.estado !== "pronto") throw new Error("fixture inválida");
  return r.msg2;
})();

function dbFake(opts: { linha?: Record<string, unknown> | null; marcou?: boolean } = {}) {
  const chamadas: { sql: string; params: unknown[] }[] = [];
  return {
    chamadas,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      chamadas.push({ sql, params });
      if (sql.includes("from public.prospecting_candidates p join"))
        return {
          rows:
            opts.linha === null
              ? []
              : [
                  {
                    id: CAND,
                    campaign_id: CAMP,
                    data: { name: "Padaria Central", website: null },
                    config,
                    msg2_sent_at: null,
                    locale: "pt",
                    ...opts.linha,
                  },
                ],
        };
      if (sql.startsWith("update public.prospecting_candidates"))
        return { rows: opts.marcou === false ? [] : [{ id: CAND }] };
      if (sql.includes("insert into agent_inbox_items")) return { rows: [{ id: "aviso" }] };
      return { rows: [] };
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("msg2PendenteDoTurno: a Msg 2 que o agente recebe", () => {
  it("entrega a Msg 2 montada como DADO, entre marcas, e devolve a string de comparação", async () => {
    const r = await msg2PendenteDoTurno(dbFake() as never, ORG, CONV);
    expect(r?.esperada).toBe(msg2);
    expect(r?.bloco).toContain("DADO");
    expect(r?.bloco).toContain("<<<MENSAGEM_2\n" + msg2 + "\nMENSAGEM_2>>>");
    expect(r?.bloco).toMatch(/EXATAMENTE/);
  });

  it("a consulta filtra a organização e a conversa", async () => {
    const db = dbFake();
    await msg2PendenteDoTurno(db as never, ORG, CONV);
    expect(db.chamadas[0]!.params).toEqual([ORG, CONV]);
    expect(db.chamadas[0]!.sql).toContain("p.organization_id = $1");
  });

  it("Msg 2 que já saiu NÃO volta (não é reenviada em dobro)", async () => {
    const r = await msg2PendenteDoTurno(
      dbFake({ linha: { msg2_sent_at: new Date() } }) as never,
      ORG,
      CONV,
    );
    expect(r).toBeNull();
  });

  it("conversa que não é de campanha com produto: nada", async () => {
    expect(await msg2PendenteDoTurno(dbFake({ linha: null }) as never, ORG, CONV)).toBeNull();
    const semProduto = { ...config, product_id: undefined, product_snapshot: undefined };
    expect(
      await msg2PendenteDoTurno(dbFake({ linha: { config: semProduto } }) as never, ORG, CONV),
    ).toBeNull();
  });

  it("texto que seria barrado nunca vai ao agente como 'o que enviar'", async () => {
    const barrado = { ...config, product_snapshot: { ...snapshot, proibicoes: ["cardápio"] } };
    expect(
      await msg2PendenteDoTurno(dbFake({ linha: { config: barrado } }) as never, ORG, CONV),
    ).toBeNull();
  });

  it("nunca lança: banco fora do ar vira 'sem Msg 2' e o turno segue", async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error("banco fora")) };
    await expect(msg2PendenteDoTurno(db as never, ORG, CONV)).resolves.toBeNull();
  });
});

describe("classificar o corpo enviado", () => {
  it("literal: o corpo contém a Msg 2 inteira (com preâmbulo do agente)", () => {
    expect(classificarCorpoDaMsg2(`Claro!\n\n${msg2}`, msg2)).toBe("literal");
  });

  it("literal mesmo com espaços e quebras diferentes", () => {
    expect(classificarCorpoDaMsg2(msg2.replace(/\n/g, "  \n "), msg2)).toBe("literal");
  });

  it("reescrita: reusa a abertura, o link ou o miolo de um item sem ser literal", () => {
    expect(
      classificarCorpoDaMsg2("Combinado. O que vimos na Padaria Central: sem site. Veja a demo.", msg2),
    ).toBe("reescrita");
    expect(classificarCorpoDaMsg2("Veja aqui https://manero.exemplo.com.br/demo", msg2)).toBe("reescrita");
    expect(
      classificarCorpoDaMsg2("O cardápio vira uma página própria, com foto e preço, tá?", msg2),
    ).toBe("reescrita");
  });

  it("recusa, pergunta ou conversa solta NÃO é a Msg 2 e NÃO é divergência", () => {
    expect(classificarCorpoDaMsg2("Sem problemas, obrigado pelo retorno. Boa semana!", msg2)).toBe(
      "nao_foi_a_msg2",
    );
    expect(classificarCorpoDaMsg2("Qual o melhor horário para falarmos?", msg2)).toBe(
      "nao_foi_a_msg2",
    );
    expect(pareceTentativaDeMsg2("ok", msg2)).toBe(false);
  });
});

describe("conferirMsg2DoTurno", () => {
  const msg2Turno = async () => {
    const r = await msg2PendenteDoTurno(dbFake() as never, ORG, CONV);
    if (!r) throw new Error("fixture");
    return r;
  };

  it("literal: marca 'já saiu' (literal=true), audita e NÃO avisa a Central", async () => {
    const db = dbFake();
    const r = await conferirMsg2DoTurno(db as never, {
      org: ORG,
      conversationId: CONV,
      msg2: await msg2Turno(),
      corposConfirmados: [msg2],
    });
    expect(r).toBe("literal");
    const marca = db.chamadas.find((c) => c.sql.startsWith("update public.prospecting_candidates"))!;
    expect(marca.sql).toContain("msg2_sent_at is null");
    expect(marca.params).toEqual([ORG, CAND, true]);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prospecting.msg2_checked",
        metadata: expect.objectContaining({ literal: true }),
      }),
    );
    expect(db.chamadas.some((c) => c.sql.includes("agent_inbox_items"))).toBe(false);
  });

  it("reescrita: o envio NÃO é desfeito, marca literal=false, avisa a Central e audita", async () => {
    const db = dbFake();
    const r = await conferirMsg2DoTurno(db as never, {
      org: ORG,
      conversationId: CONV,
      msg2: await msg2Turno(),
      corposConfirmados: ["Combinado. O que vimos na Padaria: falta site. Veja https://manero.exemplo.com.br/demo"],
    });
    expect(r).toBe("reescrita");
    const marca = db.chamadas.find((c) => c.sql.startsWith("update public.prospecting_candidates"))!;
    expect(marca.params).toEqual([ORG, CAND, false]);
    const aviso = db.chamadas.find((c) => c.sql.includes("agent_inbox_items"))!;
    expect(aviso.params).toContain("other");
    expect(aviso.params).toContain("conversation");
    expect(aviso.params).toContain(CONV);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ literal: false }) }),
    );
    // A trilha nunca leva o texto da mensagem.
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("Padaria");
  });

  it("recusa da pessoa: nada é marcado, a Msg 2 segue pendente e a Central não é avisada", async () => {
    const db = dbFake();
    const r = await conferirMsg2DoTurno(db as never, {
      org: ORG,
      conversationId: CONV,
      msg2: await msg2Turno(),
      corposConfirmados: ["Tudo bem, obrigado pelo retorno!"],
    });
    expect(r).toBe("nao_foi_a_msg2");
    expect(db.chamadas).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("sem envio confirmado pelo canal não há o que conferir", async () => {
    const db = dbFake();
    const r = await conferirMsg2DoTurno(db as never, {
      org: ORG,
      conversationId: CONV,
      msg2: await msg2Turno(),
      corposConfirmados: [],
    });
    expect(r).toBe("nao_foi_a_msg2");
    expect(db.chamadas).toHaveLength(0);
  });

  it("dois turnos em corrida: só quem marca primeiro audita e avisa", async () => {
    const db = dbFake({ marcou: false });
    await conferirMsg2DoTurno(db as never, {
      org: ORG,
      conversationId: CONV,
      msg2: await msg2Turno(),
      corposConfirmados: ["Combinado. O que vimos na Padaria Central: algo diferente"],
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(db.chamadas.some((c) => c.sql.includes("agent_inbox_items"))).toBe(false);
  });

  it("nunca lança", async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error("banco fora")) };
    await expect(
      conferirMsg2DoTurno(db as never, {
        org: ORG,
        conversationId: CONV,
        msg2: await msg2Turno(),
        corposConfirmados: [msg2],
      }),
    ).resolves.toBe("nao_foi_a_msg2");
  });
});
