import { describe, expect, it } from "vitest";

import {
  ACHADOS,
  achadosDaEmpresa,
  avaliarCandidatoParaProduto,
  PREFIXO_SEM_ACHADO,
} from "@/lib/prospecting/produto/achados-da-empresa";
import { CODIGOS_DE_ACHADO } from "@/lib/prospecting/produto/schema";
import { contemEmoji, LIMITE_VIMOS_CURTO, type ProdutoDoRoteiro } from "@/lib/prospecting/produto/roteiro";
import type { SiteEnrichment } from "@/lib/prospecting/site-classify";

const AGORA = "2026-11-10T12:00:00.000Z";

function site(parcial: Partial<SiteEnrichment>): SiteEnrichment {
  return {
    ver: 1,
    classe: "site-ruim",
    problemas: [],
    checklist: { tem: [], falta: [] },
    final_url: "https://exemplo.com.br/",
    http_status: 200,
    tempo_ms: 300,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-09T12:00:00.000Z",
    provisorio: false,
    tentativas: 0,
    ...parcial,
  };
}

const produto = (solucoes: Record<string, string>): ProdutoDoRoteiro => ({
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  solucoes,
  prova: null,
  link_demo: null,
  proibicoes: [],
});

describe("a tabela de achados", () => {
  it("cobre TODO código do catálogo, e só ele", () => {
    expect(Object.keys(ACHADOS).sort()).toEqual([...CODIGOS_DE_ACHADO].sort());
  });

  it("cada frase tem até 140 caracteres, em português, sem emoji e sem quebra de linha", () => {
    for (const [codigo, { vimos_curto, peso }] of Object.entries(ACHADOS)) {
      expect(vimos_curto.length, codigo).toBeLessThanOrEqual(LIMITE_VIMOS_CURTO);
      expect(vimos_curto.length, codigo).toBeGreaterThan(10);
      expect(contemEmoji(vimos_curto), codigo).toBe(false);
      expect(vimos_curto, codigo).not.toMatch(/\n/);
      expect(Number.isInteger(peso), codigo).toBe(true);
    }
  });

  it("os pesos são todos distintos: o crítico nunca depende de desempate por acaso", () => {
    const pesos = Object.values(ACHADOS).map((a) => a.peso);
    expect(new Set(pesos).size).toBe(pesos.length);
  });
});

describe("achadosDaEmpresa: só o medido e definitivo", () => {
  it("empresa sem site próprio: o achado é sem-site (derivado, sem rede)", () => {
    const r = achadosDaEmpresa({ website: null }, AGORA);
    expect(r).toMatchObject({ estado: "medido", citavel: true });
    expect(r.estado === "medido" && r.achados.map((a) => a.codigo)).toEqual(["sem-site"]);
  });

  it("site na web sem veredito: pendente (nada é dito antes de medir)", () => {
    expect(achadosDaEmpresa({ website: "https://exemplo.com.br" }, AGORA)).toEqual({
      estado: "pendente",
    });
  });

  it("veredito provisório com tentativa por vir: pendente", () => {
    const r = achadosDaEmpresa(
      { website: "https://x.com.br", site: site({ provisorio: true, tentativas: 1, classe: "nao-medido" }) },
      AGORA,
    );
    expect(r).toEqual({ estado: "pendente" });
  });

  it("não medido definitivo: nenhum achado, nunca", () => {
    const r = achadosDaEmpresa(
      { website: "https://x.com.br", site: site({ classe: "nao-medido", problemas: ["medicao-bloqueada"] }) },
      AGORA,
    );
    expect(r).toMatchObject({ estado: "medido", citavel: false, achados: [] });
  });

  it("falta-* é melhoria, nunca achado", () => {
    const r = achadosDaEmpresa(
      {
        website: "https://x.com.br",
        site: site({ classe: "site-ruim", problemas: ["falta-whatsapp", "falta-mapa", "nao-mobile"] }),
      },
      AGORA,
    );
    expect(r.estado === "medido" && r.achados.map((a) => a.codigo)).toEqual(["nao-mobile"]);
  });

  it("site-ok sem defeito: nenhum achado", () => {
    const r = achadosDaEmpresa({ website: "https://x.com.br", site: site({ classe: "site-ok" }) }, AGORA);
    expect(r.estado === "medido" && r.achados).toEqual([]);
  });

  it("traduz as famílias dinâmicas (http-404, construtor-Wix, sem-atualizacao-desde-2019)", () => {
    const r = achadosDaEmpresa(
      {
        website: "https://x.com.br",
        site: site({ problemas: ["http-404", "construtor-Wix", "sem-atualizacao-desde-2019"] }),
      },
      AGORA,
    );
    expect(r.estado === "medido" && r.achados.map((a) => a.codigo)).toEqual([
      "sem-atualizacao",
      "erro-http",
      "construtor-pronto",
    ]);
  });

  it("dns-morto substitui fora-do-ar: não se diz a mesma coisa duas vezes", () => {
    const r = achadosDaEmpresa(
      { website: "https://x.com.br", site: site({ classe: "fora-do-ar", problemas: ["dns-morto"] }) },
      AGORA,
    );
    expect(r.estado === "medido" && r.achados.map((a) => a.codigo)).toEqual(["dns-morto"]);
  });

  it("a ordem de saída é a do catálogo: mesma auditoria, mesma mensagem", () => {
    const a = achadosDaEmpresa(
      { website: "https://x.com.br", site: site({ problemas: ["lento", "nao-mobile", "sem-https"] }) },
      AGORA,
    );
    const b = achadosDaEmpresa(
      { website: "https://x.com.br", site: site({ problemas: ["sem-https", "lento", "nao-mobile"] }) },
      AGORA,
    );
    expect(a).toEqual(b);
  });
});

describe("avaliarCandidatoParaProduto (D2 = A: 1 achado com solução basta)", () => {
  it("elegível com 1 achado que tem solução; o crítico é o de maior peso", () => {
    const v = avaliarCandidatoParaProduto(
      { website: "https://x.com.br", site: site({ problemas: ["lento", "nao-mobile"] }) },
      produto({ lento: "o cardápio abre rápido", "nao-mobile": "a página é feita para o celular" }),
      AGORA,
    );
    expect(v.estado).toBe("elegivel");
    if (v.estado === "elegivel") expect(v.critico.codigo).toBe("nao-mobile");
  });

  it("achado citável SEM solução: inelegível, com o motivo escrito", () => {
    const v = avaliarCandidatoParaProduto({ website: null }, produto({ lento: "abre rápido" }), AGORA);
    expect(v.estado).toBe("inelegivel");
    if (v.estado === "inelegivel") {
      expect(v.motivo.startsWith(PREFIXO_SEM_ACHADO)).toBe(true);
      expect(v.motivo).toMatch(/nenhum tem solução/);
    }
  });

  it("auditoria inconclusiva: inelegível, não pendente", () => {
    const v = avaliarCandidatoParaProduto(
      { website: "https://x.com.br", site: site({ classe: "nao-medido", problemas: [] }) },
      produto({ lento: "abre rápido" }),
      AGORA,
    );
    expect(v).toMatchObject({ estado: "inelegivel" });
  });

  it("pendente não é inelegível: a empresa espera a auditoria", () => {
    const v = avaliarCandidatoParaProduto(
      { website: "https://x.com.br" },
      produto({ lento: "abre rápido" }),
      AGORA,
    );
    expect(v.estado).toBe("pendente");
  });
});
