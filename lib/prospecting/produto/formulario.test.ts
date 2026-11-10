import { describe, expect, it } from "vitest";

import {
  corpoDoProduto,
  FORMULARIO_VAZIO,
  formularioDoProduto,
  mensagemDeErroDoProduto,
  termosDeProibicao,
} from "./formulario";
import { produtoCriarSchema, type ProdutoDaProspeccao } from "./schema";

describe("formulário do produto", () => {
  it("linhas de solução vazias não são enviadas e códigos fora do catálogo somem", () => {
    const corpo = corpoDoProduto({
      ...FORMULARIO_VAZIO,
      nome: " Site novo ",
      categoria: "Sites",
      resumo: "Fazemos sites",
      solucoes: { "sem-site": " Criamos o seu ", lento: "   ", "inventado": "x" },
    });
    expect(corpo.solucoes).toEqual({ "sem-site": "Criamos o seu" });
    expect(corpo.nome).toBe("Site novo");
    expect(corpo.assina).toBeNull();
    expect(produtoCriarSchema.safeParse(corpo).success).toBe(true);
  });

  it("proibições aceitam linha, vírgula e ponto e vírgula", () => {
    expect(termosDeProibicao("grátis\n garantido, 100%;;")).toEqual(["grátis", "garantido", "100%"]);
  });

  it("ida e volta preserva o produto", () => {
    const p: ProdutoDaProspeccao = {
      id: "i", nome: "N", categoria: "C", resumo: "R", solucoes: { lento: "Aceleramos" },
      prova: "Teste grátis", link_demo: "https://x.com.br/demo", proibicoes: ["a", "b"],
      assina: "Equipe", mensagem_1: "Oi {empresa}", mensagem_2: null,
      archived_at: null, created_at: "", updated_at: "",
    };
    const c = corpoDoProduto(formularioDoProduto(p));
    expect(c).toMatchObject({
      nome: "N", solucoes: { lento: "Aceleramos" }, prova: "Teste grátis",
      link_demo: "https://x.com.br/demo", proibicoes: ["a", "b"], assina: "Equipe",
      mensagem_1: "Oi {empresa}", mensagem_2: null,
    });
  });

  it("erros da API viram frase humana", () => {
    expect(mensagemDeErroDoProduto(409, undefined)).toMatch(/Já existe um produto/);
    expect(mensagemDeErroDoProduto(422, { link_demo: ["x"], nome: ["y"] })).toBe(
      "Confira estes campos: Link da demonstração, Nome.",
    );
    expect(mensagemDeErroDoProduto(500, undefined)).toMatch(/Tente de novo/);
  });
});
