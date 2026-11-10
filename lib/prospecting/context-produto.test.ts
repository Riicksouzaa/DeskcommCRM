import { describe, expect, it } from "vitest";

import { prospectingConversationContext } from "@/lib/prospecting/context";
import { ACHADOS } from "@/lib/prospecting/produto/achados-da-empresa";

const ORG = "10000000-0000-4000-8000-000000000001";
const CONV = "10000000-0000-4000-8000-000000000002";

const base = {
  agent_id: ORG,
  channel_session_id: ORG,
  pipeline_id: ORG,
  stage_id: ORG,
  qualified_stage_id: "10000000-0000-4000-8000-000000000008",
  instruction: "Oferta definida pelo operador",
  qualification: "Necessidade confirmada pela pessoa",
  legal_basis_ref: "LIA-exemplo",
};
const snapshot = {
  product_id: "10000000-0000-4000-8000-000000000009",
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  solucoes: { "sem-site": "o cardápio vira uma página própria" },
  prova: "Teste grátis por 7 dias.",
  link_demo: "https://manero.exemplo.com.br/demo",
  proibicoes: ["garantimos", "100%"],
};

function db(config: unknown, msg2SentAt: Date | null = null) {
  return {
    query: async () => ({
      rows: [{ config, exit_offered_at: null, msg2_sent_at: msg2SentAt }],
    }),
  } as never;
}

describe("prospectingConversationContext com produto cadastrado", () => {
  const comProduto = {
    ...base,
    exit_offer: "every_message",
    product_id: snapshot.product_id,
    product_snapshot: snapshot,
  };

  it("o agente recebe o produto: nome, resumo, prova, link e proibições, e a regra da Msg 2", async () => {
    const texto = await prospectingConversationContext(db(comProduto), ORG, CONV);
    expect(texto).toContain('vende o produto "Manero"');
    expect(texto).toContain("Cardápio digital para restaurantes.");
    expect(texto).toContain("Teste grátis por 7 dias.");
    expect(texto).toContain("https://manero.exemplo.com.br/demo");
    expect(texto).toContain("Nunca escreva estes termos: garantimos, 100%.");
    expect(texto).toMatch(/EXATAMENTE como está, sem reescrever/);
    expect(texto).toMatch(/NÃO envie a Mensagem 2/);
  });

  it("nada de dado de terceiro na instrução de system: nem achado nem nome do negócio abordado", async () => {
    const texto = await prospectingConversationContext(db(comProduto), ORG, CONV);
    for (const { vimos_curto } of Object.values(ACHADOS)) expect(texto).not.toContain(vimos_curto);
    // A solução do produto também não: a Msg 2 inteira vai como DADO no sufixo por-lead.
    expect(texto).not.toContain("o cardápio vira uma página própria");
    expect(texto).not.toContain("<<<MENSAGEM_2");
  });

  it("as ofertas antigas não valem: a linha 'O que esta campanha vende' some", async () => {
    const texto = await prospectingConversationContext(
      db({ ...comProduto, ofertas: ["automacao_crm", "site"] }),
      ORG,
      CONV,
    );
    expect(texto).not.toContain("O que esta campanha vende, em ordem");
  });

  it("Msg 2 que já saiu: o agente é mandado a NÃO reenviar a apresentação", async () => {
    const texto = await prospectingConversationContext(db(comProduto, new Date()), ORG, CONV);
    expect(texto).toMatch(/JÁ foi enviada: não a reenvie/);
    expect(texto).not.toMatch(/EXATAMENTE como está/);
  });

  it("campanha SEM produto: o contexto de hoje, sem uma palavra do produto (regressão)", async () => {
    const texto = await prospectingConversationContext(
      db({ ...base, ofertas: ["automacao_crm"], exit_offer: "first_message" }),
      ORG,
      CONV,
    );
    expect(texto).toContain("O que esta campanha vende, em ordem: Automação do atendimento (CRM).");
    expect(texto).not.toContain("Mensagem 2");
    expect(texto).not.toContain("produto");
  });
});
