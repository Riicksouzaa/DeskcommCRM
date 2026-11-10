import { describe, expect, it } from "vitest";

import {
  CODIGOS_DE_ACHADO,
  codigoDeAchadoDoProblema,
  ehCodigoDeAchado,
  LIMITES_DO_PRODUTO,
  produtoAtualizarSchema,
  produtoCriarSchema,
} from "@/lib/prospecting/produto/schema";

const base = {
  nome: "Manero",
  categoria: "cardápio digital para restaurantes",
  resumo: "Cardápio em página própria, com foto e preço.",
};

describe("produto da prospecção: schema", () => {
  it("aceita o mínimo e preenche solucoes/proibicoes vazias", () => {
    const r = produtoCriarSchema.parse(base);
    expect(r.solucoes).toEqual({});
    expect(r.proibicoes).toEqual([]);
    expect(r.prova).toBeNull();
    expect(r.link_demo).toBeNull();
  });

  it("recusa campo desconhecido (organization_id nunca vem do corpo)", () => {
    expect(produtoCriarSchema.safeParse({ ...base, organization_id: "x" }).success).toBe(false);
  });

  it.each([
    ["nome", { nome: "x".repeat(81) }],
    ["categoria", { categoria: "x".repeat(81) }],
    ["resumo", { resumo: "x".repeat(301) }],
    ["prova", { prova: "x".repeat(301) }],
    ["nome vazio", { nome: "   " }],
  ])("recusa limite estourado: %s", (_n, extra) => {
    expect(produtoCriarSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });

  it("link_demo só aceita https", () => {
    expect(produtoCriarSchema.safeParse({ ...base, link_demo: "https://demo.exemplo.com.br/x" }).success).toBe(true);
    expect(produtoCriarSchema.safeParse({ ...base, link_demo: "http://demo.exemplo.com.br" }).success).toBe(false);
    expect(produtoCriarSchema.safeParse({ ...base, link_demo: "javascript:alert(1)" }).success).toBe(false);
    expect(produtoCriarSchema.safeParse({ ...base, link_demo: "demo.exemplo.com.br" }).success).toBe(false);
    expect(produtoCriarSchema.parse({ ...base, link_demo: "  " }).link_demo).toBeNull();
  });

  it("solucoes aceita códigos reais e recusa código inexistente", () => {
    expect(produtoCriarSchema.safeParse({ ...base, solucoes: { "sem-https": "cadeado incluso" } }).success).toBe(true);
    const r = produtoCriarSchema.safeParse({ ...base, solucoes: { conteudo_inventado: "x" } });
    expect(r.success).toBe(false);
  });

  it("solucoes aceita o catálogo INTEIRO (o teto nunca pode ficar abaixo do número de códigos) e recusa frase vazia", () => {
    const todas = Object.fromEntries(CODIGOS_DE_ACHADO.map((c) => [c, "ok"]));
    expect(Object.keys(todas).length).toBeLessThanOrEqual(LIMITES_DO_PRODUTO.maxSolucoes);
    expect(produtoCriarSchema.safeParse({ ...base, solucoes: todas }).success).toBe(true);
    expect(produtoCriarSchema.safeParse({ ...base, solucoes: { lento: " " } }).success).toBe(false);
  });

  it("proibicoes: até 20, sem repetir (caixa ignorada)", () => {
    const vinte_e_um = Array.from({ length: 21 }, (_, i) => `termo${i}`);
    expect(produtoCriarSchema.safeParse({ ...base, proibicoes: vinte_e_um }).success).toBe(false);
    expect(produtoCriarSchema.parse({ ...base, proibicoes: ["Garantimos", "garantimos", "100%"] }).proibicoes).toEqual([
      "Garantimos",
      "100%",
    ]);
  });

  it("atualizar exige ao menos um campo e aceita parcial", () => {
    expect(produtoAtualizarSchema.safeParse({}).success).toBe(false);
    expect(produtoAtualizarSchema.safeParse({ resumo: "novo" }).success).toBe(true);
    expect(produtoAtualizarSchema.safeParse({ solucoes: { x: "y" } }).success).toBe(false);
  });
});

describe("vocabulário de achados", () => {
  it("só tem o que é citável: nada de nao-medido, site-ok, site-ruim ou falta-*", () => {
    for (const proibido of ["nao-medido", "site-ok", "site-ruim", "falta-whatsapp"])
      expect(ehCodigoDeAchado(proibido)).toBe(false);
    expect(new Set(CODIGOS_DE_ACHADO).size).toBe(CODIGOS_DE_ACHADO.length);
  });

  it("traduz o código cru da auditoria para o do catálogo", () => {
    expect(codigoDeAchadoDoProblema("http-404")).toBe("erro-http");
    expect(codigoDeAchadoDoProblema("construtor-Wix")).toBe("construtor-pronto");
    expect(codigoDeAchadoDoProblema("sem-atualizacao-desde-2019")).toBe("sem-atualizacao");
    expect(codigoDeAchadoDoProblema("nao-mobile")).toBe("nao-mobile");
    expect(codigoDeAchadoDoProblema("sem-site")).toBe("sem-site");
    expect(codigoDeAchadoDoProblema("falta-tel")).toBeNull();
    expect(codigoDeAchadoDoProblema("medicao-instavel")).toBeNull();
  });
});
