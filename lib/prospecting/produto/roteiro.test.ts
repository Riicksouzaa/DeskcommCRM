import { describe, expect, it } from "vitest";
import { palavraDeSaida, rodapeDeSaida } from "@/lib/prospecting/rodape-de-saida";
import {
  type AchadoDaEmpresa,
  type ProdutoDoRoteiro,
  compararComEsperado,
  elegibilidade,
  escolherAchadoCritico,
  limitarSemCortarPalavra,
  montarMensagem1,
  montarMensagem2,
  validarTexto,
} from "./roteiro";

const produto: ProdutoDoRoteiro = {
  nome: "Cardapio Facil",
  resumo: "Cardápio digital com foto e preço.",
  solucoes: {
    a: "o cardápio vira página própria",
    b: "o pedido chega direto no WhatsApp",
    c: "um endereço único para a bio",
    d: "a loja abre rápido no celular",
    e: "o site ganha cadeado",
  },
  prova: "Teste grátis por 7 dias.",
  link_demo: "https://exemplo.com.br/demo",
  proibicoes: ["garantimos", "100%"],
};

const ach = (
  codigo: string,
  peso: number,
  citavel = true,
  vimos = `vimos ${codigo}`,
): AchadoDaEmpresa => ({
  codigo,
  vimos_curto: vimos,
  peso,
  citavel,
});

const ctx = (
  achados: AchadoDaEmpresa[],
  p: ProdutoDoRoteiro = produto,
  empresa = "Pizzaria Boa",
) => ({
  contato: "Maria",
  assina: "Dani",
  empresa,
  produto: p,
  achados,
});

describe("escolherAchadoCritico", () => {
  it("0 achados -> null", () => expect(escolherAchadoCritico([], produto)).toBeNull());
  it("1 achado", () => expect(escolherAchadoCritico([ach("a", 1)], produto)?.codigo).toBe("a"));
  it("maior peso vence", () => {
    expect(escolherAchadoCritico([ach("a", 1), ach("b", 9), ach("c", 5)], produto)?.codigo).toBe(
      "b",
    );
  });
  it("empate: o de menor índice na entrada", () => {
    expect(escolherAchadoCritico([ach("c", 5), ach("a", 5), ach("b", 5)], produto)?.codigo).toBe(
      "c",
    );
  });
  it("ignora o de maior peso quando não é citável ou não tem solução", () => {
    const r = escolherAchadoCritico([ach("a", 99, false), ach("zzz", 50), ach("b", 2)], produto);
    expect(r?.codigo).toBe("b");
  });
  it("nenhum utilizável -> null", () => {
    expect(escolherAchadoCritico([ach("a", 9, false), ach("zzz", 9)], produto)).toBeNull();
  });
  it("código herdado do protótipo não é solução", () => {
    expect(escolherAchadoCritico([ach("constructor", 9), ach("toString", 9)], produto)).toBeNull();
  });
});

describe("elegibilidade", () => {
  it("1 citável com solução basta (D2)", () => {
    const r = elegibilidade([ach("a", 1)], produto);
    expect(r.elegivel).toBe(true);
    if (r.elegivel) {
      expect(r.critico.codigo).toBe("a");
      expect(r.citaveisComSolucao).toHaveLength(1);
    }
  });
  it("lista os citáveis com solução em ordem de peso", () => {
    const r = elegibilidade([ach("a", 1), ach("b", 3), ach("c", 2, false)], produto);
    expect(r.elegivel && r.citaveisComSolucao.map((x) => x.codigo)).toEqual(["b", "a"]);
  });
  it("três motivos distintos e legíveis", () => {
    const semCitavel = elegibilidade([ach("a", 1, false)], produto);
    const semSolucao = elegibilidade([ach("zzz", 1)], produto);
    const semSolucoes = elegibilidade([ach("a", 1)], { ...produto, solucoes: {} });
    const motivos = [semCitavel, semSolucao, semSolucoes].map((r) => (r.elegivel ? "" : r.motivo));
    expect(motivos.every((m) => m.length > 10)).toBe(true);
    expect(new Set(motivos).size).toBe(3);
    expect(motivos[0]).toMatch(/citável/);
    expect(motivos[1]).toMatch(/solução/);
    expect(motivos[2]).toMatch(/não tem soluções/);
  });
  it("0 achados -> sem achado citável", () => {
    const r = elegibilidade([], produto);
    expect(!r.elegivel && r.motivo).toMatch(/Nenhum achado citável/);
  });
});

describe("limitarSemCortarPalavra", () => {
  it("texto curto passa intacto", () =>
    expect(limitarSemCortarPalavra("ok curto")).toBe("ok curto"));
  it("300 chars: <=140 e não corta palavra no meio", () => {
    const longo = Array.from({ length: 60 }, (_, i) => `palavra${i}`).join(" ");
    expect(longo.length).toBeGreaterThan(300);
    const r = limitarSemCortarPalavra(longo);
    expect(r.length).toBeLessThanOrEqual(140);
    expect(r.endsWith("...")).toBe(true);
    const palavras = r.slice(0, -3).split(" ");
    for (const p of palavras) expect(longo.split(" ")).toContain(p);
  });
  it("palavra única gigante é cortada seca dentro do limite", () => {
    expect(limitarSemCortarPalavra("x".repeat(300)).length).toBeLessThanOrEqual(140);
  });
});

describe("montarMensagem1", () => {
  it("segue o gabarito, cita o crítico e termina com o rodapé do detector", () => {
    const m = montarMensagem1(
      ctx([
        ach("a", 1, true, "o cardápio não abre no celular."),
        ach("b", 5, true, "depende de app"),
      ]),
    );
    expect(m).toContain("Olá, Maria. Aqui é Dani, da Cardapio Facil.");
    expect(m).toContain("Analisamos a presença digital da Pizzaria Boa");
    expect(m).toContain("Um deles: depende de app.");
    expect(m).not.toContain("o cardápio não abre");
    expect(m).toContain("Quer que eu mostre os outros e como resolver?");
    expect(m.endsWith(rodapeDeSaida())).toBe(true);
    expect(m).toContain(palavraDeSaida());
    expect(validarTexto(m, produto)).toEqual({ ok: true });
  });
  it("ponto final do achado não duplica", () => {
    const m = montarMensagem1(ctx([ach("a", 1, true, "sem cadeado.")]));
    expect(m).toContain("custando clientes: sem cadeado.\n");
    expect(m).not.toContain("sem cadeado..");
  });
  it("UM achado só: não diz 'pontos', 'um deles' nem 'os outros' (a Msg 2 não teria outro)", () => {
    const m = montarMensagem1(ctx([ach("a", 1, true, "sem cadeado")]));
    expect(m).toContain("vimos um ponto que pode estar custando clientes: sem cadeado.");
    expect(m).toContain("Quer que eu mostre como resolver?");
    expect(m).not.toMatch(/pontos|Um deles|os outros/);
    expect(validarTexto(m, produto)).toEqual({ ok: true });
  });
  it("vimos_curto de 300 chars sai com <=140", () => {
    const longo = Array.from({ length: 50 }, (_, i) => `termo${i}`).join(" ");
    const m = montarMensagem1(ctx([ach("a", 1, true, longo)]));
    const linha = m.split("\n").find((l) => l.includes("custando clientes: "))!;
    const achado = linha.slice(linha.indexOf("custando clientes: ") + "custando clientes: ".length);
    expect(achado.length).toBeLessThanOrEqual(140 + 1);
  });
  it("empresa com caracteres especiais fica literal e em uma linha", () => {
    const m = montarMensagem1(ctx([ach("a", 1)], produto, 'Bar & Cia. "O Zé" $1 {x}\nlinha2'));
    expect(m).toContain('Bar & Cia. "O Zé" $1 {x} linha2');
  });
  it("lança sem achado utilizável", () => {
    expect(() => montarMensagem1(ctx([ach("a", 1, false)]))).toThrow();
  });
});

describe("montarMensagem2", () => {
  it("1 achado", () => {
    const m = montarMensagem2(ctx([ach("a", 1, true, "cardápio em PDF")]));
    expect(m).toContain("1. cardápio em PDF. o cardápio vira página própria.");
    expect(m).not.toContain("2. ");
    expect(m).toContain("Veja como fica: https://exemplo.com.br/demo");
    expect(m).toContain("Teste grátis por 7 dias.");
    expect(m).toContain(produto.resumo);
    expect(validarTexto(m, produto)).toEqual({ ok: true });
  });
  it("5 achados: lista só 3, por peso", () => {
    const m = montarMensagem2(
      ctx([ach("a", 1), ach("b", 5), ach("c", 4), ach("d", 3), ach("e", 2)]),
    );
    expect(m).toContain("1. vimos b.");
    expect(m).toContain("2. vimos c.");
    expect(m).toContain("3. vimos d.");
    expect(m).not.toContain("4. ");
    expect(m).not.toContain("vimos e");
    expect(m).not.toContain("vimos a");
  });
  it("3 achados exatos", () => {
    const m = montarMensagem2(ctx([ach("a", 1), ach("b", 2), ach("c", 3)]));
    expect(m).toMatch(/1\. vimos c.*\n2\. vimos b.*\n3\. vimos a/);
  });
  it("sem link_demo e sem prova: linhas somem, nada inventado", () => {
    const m = montarMensagem2(
      ctx([ach("a", 1)], { ...produto, link_demo: null, prova: undefined }),
    );
    expect(m).not.toContain("Veja como fica");
    expect(m).not.toContain("Teste grátis");
    expect(m).not.toMatch(/\n\n\n/);
    expect(validarTexto(m, produto)).toEqual({ ok: true });
  });
  it("link e prova em branco também somem", () => {
    const m = montarMensagem2(ctx([ach("a", 1)], { ...produto, link_demo: "  ", prova: "\n" }));
    expect(m).not.toContain("Veja como fica");
  });
  it("lança sem achado utilizável", () => {
    expect(() => montarMensagem2(ctx([]))).toThrow();
  });
  it("vimos_curto de 300 chars é limitado também na Msg 2", () => {
    const longo = Array.from({ length: 50 }, (_, i) => `termo${i}`).join(" ");
    const m = montarMensagem2(ctx([ach("a", 1, true, longo)]));
    const item = m.split("\n").find((l) => l.startsWith("1. "))!;
    expect(item.split(". ")[1]!.length).toBeLessThanOrEqual(140);
  });
});

describe("CERCA DE HONESTIDADE (§6.1): achado não citável ou sem solução nunca aparece", () => {
  const marca = (c: string) => `MARCA_${c.toUpperCase()}_UNICA`;
  const solucoesMarcadas: Record<string, string> = Object.fromEntries(
    ["a", "b", "c", "d"].map((c) => [c, `resolve ${marca("sol_" + c)}`]),
  );
  const p: ProdutoDoRoteiro = { ...produto, solucoes: solucoesMarcadas };

  // Gera combinações determinísticas: cada achado é citável?/tem solução?/peso.
  const codigos = ["a", "b", "c", "d", "sem1", "sem2"];
  const casos: AchadoDaEmpresa[][] = [];
  for (let mask = 0; mask < 1 << codigos.length; mask++) {
    casos.push(
      codigos.map((c, i) => ({
        codigo: c,
        vimos_curto: marca(c),
        peso: (mask * 7 + i * 3) % 5,
        citavel: ((mask >> i) & 1) === 1,
      })),
    );
  }

  it("em todas as 64 combinações, só aparece o que é citável E tem solução", () => {
    for (const achados of casos) {
      const proibidos = achados.filter((a) => !a.citavel || !(a.codigo in solucoesMarcadas));
      const e = elegibilidade(achados, p);
      if (!e.elegivel) {
        expect(() => montarMensagem1(ctx(achados, p))).toThrow();
        expect(() => montarMensagem2(ctx(achados, p))).toThrow();
        continue;
      }
      for (const m of [montarMensagem1(ctx(achados, p)), montarMensagem2(ctx(achados, p))]) {
        for (const x of proibidos) {
          expect(m).not.toContain(marca(x.codigo));
          if (x.codigo in solucoesMarcadas) expect(m).not.toContain(marca("sol_" + x.codigo));
        }
      }
    }
  });

  it("produto TEM a solução, mas o achado é não-citável: nada sai", () => {
    const achados = [ach("a", 99, false, marca("a"))];
    expect(elegibilidade(achados, p).elegivel).toBe(false);
    expect(escolherAchadoCritico(achados, p)).toBeNull();
    expect(() => montarMensagem1(ctx(achados, p))).toThrow();
    expect(() => montarMensagem2(ctx(achados, p))).toThrow();
  });

  it("mistura: o não-citável de peso máximo não vaza para as mensagens", () => {
    const achados = [ach("a", 99, false, marca("a")), ach("b", 1, true, marca("b"))];
    const m1 = montarMensagem1(ctx(achados, p));
    const m2 = montarMensagem2(ctx(achados, p));
    for (const m of [m1, m2]) {
      expect(m).not.toContain(marca("a"));
      expect(m).not.toContain(marca("sol_a"));
      expect(m).toContain(marca("b"));
    }
  });
});

describe("validarTexto", () => {
  const ok = `Olá.\n\n${rodapeDeSaida()}`;
  it("texto limpo com rodapé passa", () => expect(validarTexto(ok, produto)).toEqual({ ok: true }));
  it("reprova emoji, inclusive composto e bandeira", () => {
    for (const e of ["\u{1F600}", "\u{2764}\u{FE0F}", "\u{1F1E7}\u{1F1F7}", "\u{1F44D}\u{1F3FD}"]) {
      const r = validarTexto(`Olá ${e}\n\n${rodapeDeSaida()}`, produto);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivos.join()).toMatch(/emoji/);
    }
  });
  it("não confunde acentos, números e pontuação com emoji", () => {
    expect(
      validarTexto(`Ação nº 1: 100 por cento — “ok” R$ 5,00 ✓\n\n${rodapeDeSaida()}`, {
        proibicoes: [],
      }),
    ).toEqual({ ok: true });
  });
  it("proibição sem acento/caixa, palavra inteira", () => {
    const p = { proibicoes: ["garantímos", "100%", "sem custo"] };
    expect(validarTexto(`GARANTIMOS resultado\n\n${rodapeDeSaida()}`, p).ok).toBe(false);
    expect(validarTexto(`Resultado 100% certo\n\n${rodapeDeSaida()}`, p).ok).toBe(false);
    expect(validarTexto(`Tudo SEM  CUSTO\n\n${rodapeDeSaida()}`, p).ok).toBe(false);
    // palavra inteira: "garantimosX" ou contido em outra palavra não casa
    expect(validarTexto(`desgarantimosx\n\n${rodapeDeSaida()}`, p)).toEqual({ ok: true });
  });
  it("termo proibido vazio é ignorado", () => {
    expect(validarTexto(ok, { proibicoes: ["", "  "] })).toEqual({ ok: true });
  });
  it("sem rodapé reprova", () => {
    const r = validarTexto("Olá, tudo bem?", produto);
    expect(!r.ok && r.motivos.join()).toMatch(/rodapé/);
  });
  it("rodapé de outro idioma conferido pelo locale", () => {
    expect(validarTexto(`Hola\n\n${rodapeDeSaida("es")}`, produto, "es")).toEqual({ ok: true });
    expect(validarTexto(`Hola\n\n${rodapeDeSaida("es")}`, produto, "pt").ok).toBe(false);
  });
  it("acumula motivos", () => {
    const r = validarTexto("garantimos \u{1F600}", produto);
    expect(!r.ok && r.motivos.length).toBe(3);
  });
});

describe("compararComEsperado", () => {
  const esperada = montarMensagem2(ctx([ach("a", 1)]));
  it("igual literal", () =>
    expect(compararComEsperado(esperada, esperada)).toEqual({ igual: true }));
  it("normaliza espaços e quebras", () => {
    expect(compararComEsperado(esperada.replace(/\n/g, "  \r\n "), esperada)).toEqual({
      igual: true,
    });
  });
  it("contém a Msg 2 dentro de corpo maior (bolhas coladas)", () => {
    expect(compararComEsperado(`Oi!\n${esperada}\nabraço`, esperada)).toEqual({ igual: true });
  });
  it("divergência de uma palavra", () => {
    expect(compararComEsperado(esperada.replace("Combinado", "Beleza"), esperada)).toEqual({
      igual: false,
    });
  });
  it("esperada vazia nunca é igual", () => {
    expect(compararComEsperado("qualquer", "  ")).toEqual({ igual: false });
  });
});
