import { describe, expect, it } from "vitest";

import { blocoDoProdutoParaOAgente } from "@/lib/prospecting/context";
import { avaliarCandidatoParaProduto } from "@/lib/prospecting/produto/achados-da-empresa";
import {
  comRodape,
  marcadoresDoModelo,
  marcadoresSemValor,
  modeloUsaAchado,
  renderizarModelo,
  validarModelo,
} from "@/lib/prospecting/produto/modelo";
import {
  conferirProdutoParaCampanha,
  montarRoteiroDoCandidato,
} from "@/lib/prospecting/produto/roteiro-do-candidato";
import { produtoCriarSchema } from "@/lib/prospecting/produto/schema";
import { construirSnapshot, type ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";
import { rodapeDeSaida } from "@/lib/prospecting/rodape-de-saida";
import type { SiteEnrichment } from "@/lib/prospecting/site-classify";

const AGORA = "2026-11-10T21:00:00.000Z";

const MSG1_DIRETA =
  "Olá, {empresa}. Aqui é {assina}, da {produto}.\n{resumo}\nVeja um exemplo de cardápio: {link_demo}\nPosso te mostrar em 20 minutos como ficaria o da {empresa}? Me diga um dia e horário.";

function snapshot(parcial: Partial<ProdutoSnapshot> = {}): ProdutoSnapshot {
  return {
    product_id: "00000000-0000-4000-8000-000000000001",
    produto_atualizado_em: "2026-11-10T20:00:00.000Z",
    nome: "Manero",
    resumo: "Cardápio digital para restaurantes, com link e QR próprios.",
    assina: "Dani, assistente virtual",
    solucoes: { "plataforma-de-pedidos": "Um cardápio com o nome da pizzaria." },
    prova: "Teste de 7 dias.",
    link_demo: "https://manero.app/bibi",
    proibicoes: ["iFood"],
    mensagem_1: MSG1_DIRETA,
    mensagem_2: null,
    ...parcial,
  };
}

function site(parcial: Partial<SiteEnrichment>): SiteEnrichment {
  return {
    ver: 1,
    classe: "nao-medido",
    problemas: ["medicao-bloqueada"],
    checklist: { tem: [], falta: [] },
    final_url: null,
    http_status: 403,
    tempo_ms: 300,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-10T11:00:00.000Z",
    provisorio: false,
    tentativas: 0,
    ...parcial,
  };
}

describe("modelo: marcadores", () => {
  it("acha os marcadores usados, sem repetir", () => {
    expect(marcadoresDoModelo("Oi {empresa}, {empresa} e {assina}")).toEqual(["empresa", "assina"]);
  });

  it("só {achado} e {solucao} dependem da auditoria", () => {
    expect(modeloUsaAchado(MSG1_DIRETA)).toBe(false);
    expect(modeloUsaAchado("Vimos: {achado}")).toBe(true);
    expect(modeloUsaAchado("Resolvemos assim: {solucao}")).toBe(true);
    expect(modeloUsaAchado(null)).toBe(false);
  });

  it("recusa marcador inexistente, chave solta, vazio e texto longo", () => {
    expect(validarModelo(MSG1_DIRETA)).toEqual([]);
    expect(validarModelo("Oi {nome_da_pessoa}")[0]).toMatch(/não existe/);
    expect(validarModelo("Oi {empresa")[0]).toMatch(/sem par/);
    expect(validarModelo("   ")[0]).toMatch(/vazio/);
    expect(validarModelo("a".repeat(1201))[0]).toMatch(/passa de/);
  });

  it("renderiza em uma linha por valor, sem deixar buraco e com o rodapé do sistema", () => {
    const t = renderizarModelo("A {empresa}\n{prova}\n\n\n\nFim", {
      empresa: "Pizza \n Boa",
      prova: "",
    });
    expect(t).toBe("A Pizza Boa\n\nFim");
    expect(comRodape(t)).toBe(`${t}\n\n${rodapeDeSaida()}`);
  });

  it("avisa quando o modelo usa dado que o produto não tem", () => {
    expect(marcadoresSemValor("{link_demo} {prova}", { link_demo: null, prova: "" })).toHaveLength(2);
    expect(marcadoresSemValor("{link_demo}", { link_demo: "https://a.com", prova: null })).toEqual([]);
  });
});

describe("produto: o Zod recusa modelo inválido e guarda o válido", () => {
  const base = { nome: "N", categoria: "C", resumo: "R" };
  it("aceita modelo com marcadores conhecidos e normaliza vazio para null", () => {
    const r = produtoCriarSchema.safeParse({ ...base, mensagem_1: MSG1_DIRETA, mensagem_2: "  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mensagem_1).toBe(MSG1_DIRETA);
      expect(r.data.mensagem_2).toBeNull();
    }
  });
  it("recusa marcador que não existe", () => {
    expect(produtoCriarSchema.safeParse({ ...base, mensagem_1: "Oi {xyz}" }).success).toBe(false);
  });
});

describe("a Msg 1 direta, no lugar do achado", () => {
  it("sai com o exemplo do Bibi, o convite e o rodapé do sistema, SEM achado", () => {
    const r = montarRoteiroDoCandidato({
      data: { name: "Pizzaria no Quintal", website: "https://pizzarianoquintal.saipos.com/home", site: site({}) },
      snapshot: snapshot(),
      locale: null,
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("pronto");
    if (r.estado !== "pronto") return;
    expect(r.msg1).toContain("Olá, Pizzaria no Quintal. Aqui é Dani, assistente virtual, da Manero.");
    expect(r.msg1).toContain("https://manero.app/bibi");
    expect(r.msg1).toContain("ficaria o da Pizzaria no Quintal");
    expect(r.msg1.endsWith(rodapeDeSaida())).toBe(true);
    expect(r.msg2).toBe("");
    expect(r.critico).toBeNull();
    expect(r.barrada).toEqual([]);
  });

  it("serve a empresa que o site barra e a sem site: não depende de auditoria", () => {
    const sem = { name: "La Romana", website: null, site: null };
    const bloqueada = { name: "Eskenosen", website: "https://pedido.anota.ai/x", site: site({}) };
    for (const data of [sem, bloqueada]) {
      expect(
        avaliarCandidatoParaProduto(data, { ...snapshot(), solucoes: {} }, AGORA).estado,
      ).toBe("elegivel");
    }
  });

  it("modelo que usa {achado} volta a exigir achado medido", () => {
    const comAchado = snapshot({ mensagem_1: "Vimos: {achado}. {solucao}." });
    const v = montarRoteiroDoCandidato({
      data: { name: "Eskenosen", website: "https://pedido.anota.ai/x", site: site({}) },
      snapshot: comAchado,
      locale: null,
      agoraIso: AGORA,
    });
    expect(v.estado).toBe("pronto");
    if (v.estado === "pronto") {
      expect(v.msg1).toContain("o endereço do cardápio no Google leva a uma plataforma de pedidos de terceiros");
      expect(v.msg1).toContain("Um cardápio com o nome da pizzaria.");
    }
    const semAchado = montarRoteiroDoCandidato({
      data: { name: "Pizzaria Boa", website: "https://pizzariaboa.com.br", site: site({}) },
      snapshot: comAchado,
      locale: null,
      agoraIso: AGORA,
    });
    expect(semAchado.estado).toBe("inelegivel");
  });

  it("termo proibido ou emoji no texto do produto barra a mensagem (nada sai)", () => {
    const r = montarRoteiroDoCandidato({
      data: { name: "Pizzaria Boa", website: null, site: null },
      snapshot: snapshot({ mensagem_1: "Oi {empresa}, melhor que o iFood!" }),
      locale: null,
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("pronto");
    if (r.estado === "pronto") expect(r.barrada.join(" ")).toMatch(/iFood/);
  });

  it("produto SEM modelo continua no roteiro de achado (nada mudou)", () => {
    const r = montarRoteiroDoCandidato({
      data: { name: "Eskenosen", website: "https://pedido.anota.ai/x", site: site({}) },
      snapshot: snapshot({ mensagem_1: null }),
      locale: null,
      agoraIso: AGORA,
    });
    expect(r.estado).toBe("pronto");
    if (r.estado === "pronto") {
      expect(r.msg1).toContain("vimos um ponto que pode estar custando clientes");
      expect(r.msg2).toContain("Combinado.");
    }
  });
});

describe("a ativação confere os textos do produto", () => {
  it("modelo direto válido passa, mesmo sem nenhuma solução cadastrada", () => {
    expect(conferirProdutoParaCampanha(snapshot({ solucoes: {} }), null)).toEqual([]);
  });
  it("usa {link_demo} sem o produto ter link: barra com o motivo", () => {
    const m = conferirProdutoParaCampanha(snapshot({ link_demo: null }), null);
    expect(m.join(" ")).toMatch(/link da demonstração/);
  });
  it("usa {solucao} sem solução cadastrada: barra", () => {
    const m = conferirProdutoParaCampanha(
      snapshot({ mensagem_1: "{achado}", solucoes: {} }),
      null,
    );
    expect(m.join(" ")).toMatch(/nenhuma solução/);
  });
  it("proibição que casa com o próprio texto barra na ativação, não no envio", () => {
    const m = conferirProdutoParaCampanha(snapshot({ proibicoes: ["Manero"] }), null);
    expect(m.join(" ")).toMatch(/Manero/);
  });
});

describe("o agente sabe o que já foi dito", () => {
  it("com modelo só de Msg 1, não recebe instrução de Msg 2 nem fala de achado", () => {
    const b = blocoDoProdutoParaOAgente(snapshot(), false);
    expect(b).toContain("já foi enviada pelo sistema");
    expect(b).not.toContain("Mensagem 2");
    expect(b).not.toContain("achado");
  });
  it("com Msg 2 no modelo, a instrução da Msg 2 volta", () => {
    expect(blocoDoProdutoParaOAgente(snapshot({ mensagem_2: "Combinado, {empresa}." }), false)).toContain(
      "Mensagem 2",
    );
  });
  it("sem modelo, o texto de sempre", () => {
    expect(blocoDoProdutoParaOAgente(snapshot({ mensagem_1: null }), false)).toContain("citou um achado");
  });
});

describe("retrato do produto", () => {
  it("guarda os modelos e um retrato antigo (sem os campos) continua válido", () => {
    const s = construirSnapshot(
      {
        id: "00000000-0000-4000-8000-000000000001",
        nome: "N",
        resumo: "R",
        solucoes: {},
        prova: null,
        link_demo: null,
        proibicoes: [],
        updated_at: "2026-11-10T20:00:00.000Z",
        mensagem_1: "  Oi {empresa}  ",
        mensagem_2: "",
      },
      "Dani",
    );
    expect(s.mensagem_1).toBe("Oi {empresa}");
    expect(s.mensagem_2).toBeNull();
  });
});
