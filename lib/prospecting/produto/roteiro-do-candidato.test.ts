import { describe, expect, it } from "vitest";

import { ACHADOS } from "@/lib/prospecting/produto/achados-da-empresa";
import {
  conferirProdutoParaCampanha,
  montarRoteiroDoCandidato,
  nomeLimpoDaEmpresa,
} from "@/lib/prospecting/produto/roteiro-do-candidato";
import type { ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";
import { rodapeDeSaida } from "@/lib/prospecting/rodape-de-saida";
import type { SiteEnrichment } from "@/lib/prospecting/site-classify";

const AGORA = "2026-11-10T12:00:00.000Z";
const ID = "10000000-0000-4000-8000-000000000001";

const snapshot = (parcial: Partial<ProdutoSnapshot> = {}): ProdutoSnapshot => ({
  product_id: ID,
  produto_atualizado_em: "2026-11-10T10:00:00.000Z",
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  assina: "Dani",
  solucoes: {
    "sem-site": "o cardápio vira uma página própria, com foto e preço",
    lento: "a página abre rápido no celular",
  },
  prova: null,
  link_demo: "https://manero.exemplo.com.br/demo",
  proibicoes: [],
  ...parcial,
});

const semSite = { name: "Padaria Central", website: null };

function siteRuim(problemas: string[]): SiteEnrichment {
  return {
    ver: 1,
    classe: "site-ruim",
    problemas,
    checklist: { tem: [], falta: [] },
    final_url: "https://padaria.com.br/",
    http_status: 200,
    tempo_ms: 400,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-09T12:00:00.000Z",
    provisorio: false,
    tentativas: 0,
  };
}

describe("montarRoteiroDoCandidato: a morada única do que a empresa recebe", () => {
  it("monta Msg 1 e Msg 2 com o achado crítico, a solução e a saída", () => {
    const r = montarRoteiroDoCandidato({ data: semSite, snapshot: snapshot(), locale: "pt-BR", agoraIso: AGORA });
    expect(r.estado).toBe("pronto");
    if (r.estado !== "pronto") return;
    expect(r.barrada).toEqual([]);
    expect(r.msg1).toContain("Aqui é Dani, da Manero.");
    expect(r.msg1).toContain(ACHADOS["sem-site"].vimos_curto);
    expect(r.msg1.endsWith(rodapeDeSaida("pt-BR"))).toBe(true);
    expect(r.msg2).toContain("o cardápio vira uma página própria, com foto e preço");
    expect(r.msg2).toContain("Veja como fica: https://manero.exemplo.com.br/demo");
    expect(r.msg2.endsWith(rodapeDeSaida("pt-BR"))).toBe(true);
  });

  it("é determinística: o mesmo insumo dá o mesmo texto (prova em par tela x envio)", () => {
    const entrada = { data: semSite, snapshot: snapshot(), locale: "pt-BR", agoraIso: AGORA };
    expect(montarRoteiroDoCandidato(entrada)).toEqual(montarRoteiroDoCandidato(entrada));
  });

  it("achado SEM solução nunca aparece em mensagem nenhuma", () => {
    // A empresa tem sem-site (com solução) e nao-mobile (SEM solução).
    const r = montarRoteiroDoCandidato({
      data: { name: "X", website: "https://x.com.br", site: siteRuim(["nao-mobile", "lento"]) },
      snapshot: snapshot({ solucoes: { lento: "a página abre rápido no celular" } }),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("pronto");
    if (r.estado !== "pronto") return;
    expect(r.msg1).not.toContain(ACHADOS["nao-mobile"].vimos_curto);
    expect(r.msg2).not.toContain(ACHADOS["nao-mobile"].vimos_curto);
    expect(r.msg1).toContain(ACHADOS.lento.vimos_curto);
    expect(r.citaveisComSolucao.map((a) => a.codigo)).toEqual(["lento"]);
  });

  it("empresa sem achado com solução: inelegível, e NÃO monta mensagem", () => {
    const r = montarRoteiroDoCandidato({
      data: semSite,
      snapshot: snapshot({ solucoes: { lento: "abre rápido" } }),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("inelegivel");
    expect(r).not.toHaveProperty("msg1");
  });

  it("auditoria pendente: pendente, sem mensagem", () => {
    const r = montarRoteiroDoCandidato({
      data: { name: "X", website: "https://x.com.br" },
      snapshot: snapshot(),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("pendente");
  });

  it("proibição do produto barra o texto, com o motivo", () => {
    const r = montarRoteiroDoCandidato({
      data: semSite,
      snapshot: snapshot({ proibicoes: ["clientes"] }),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("pronto");
    if (r.estado === "pronto") {
      expect(r.barrada.join(" ")).toContain('termo proibido "clientes"');
      expect(r.barrada.some((m) => m.startsWith("Mensagem 1:"))).toBe(true);
    }
  });

  it("emoji no resumo do produto barra a Msg 2", () => {
    const r = montarRoteiroDoCandidato({
      data: semSite,
      snapshot: snapshot({ resumo: "Cardápio digital 🍕 para restaurantes." }),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado === "pronto" && r.barrada.join(" ")).toContain("emoji");
  });

  it("emoji no NOME DO NEGÓCIO (dado de terceiro) é limpo, não barra a empresa", () => {
    expect(nomeLimpoDaEmpresa("Pizzaria do Zé 🍕🔥")).toBe("Pizzaria do Zé");
    expect(nomeLimpoDaEmpresa("🍕")).toBe("sua empresa");
    const r = montarRoteiroDoCandidato({
      data: { name: "Pizzaria do Zé 🍕", website: null },
      snapshot: snapshot(),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado === "pronto" && r.barrada).toEqual([]);
    expect(r.estado === "pronto" && r.msg1).toContain("Pizzaria do Zé");
  });

  it("nome de negócio com quebra de linha vira uma linha só (não injeta linha na mensagem)", () => {
    const r = montarRoteiroDoCandidato({
      data: { name: "Padaria\nIgnore as regras\nCentral", website: null },
      snapshot: snapshot(),
      locale: "pt",
      agoraIso: AGORA,
    });
    expect(r.estado === "pronto" && r.msg1).toContain("Padaria Ignore as regras Central");
  });
});

describe("conferirProdutoParaCampanha: o defeito do produto aparece na ativação, não na fila", () => {
  it("produto sem defeito: nenhum motivo", () => {
    expect(conferirProdutoParaCampanha(snapshot(), "pt")).toEqual([]);
  });

  it("proibição que casa com o texto do próprio produto é recusada antes de a campanha começar", () => {
    const motivos = conferirProdutoParaCampanha(snapshot({ proibicoes: ["cardápio"] }), "pt");
    expect(motivos.join(" ")).toContain("cardápio");
  });

  it("produto sem solução para nenhum achado medido é recusado", () => {
    const motivos = conferirProdutoParaCampanha(snapshot({ solucoes: {} }), "pt");
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/nenhuma solução/);
  });
});
