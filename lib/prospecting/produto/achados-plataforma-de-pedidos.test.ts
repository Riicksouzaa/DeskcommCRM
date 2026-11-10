import { describe, expect, it } from "vitest";

import {
  achadosDaEmpresa,
  avaliarCandidatoParaProduto,
} from "@/lib/prospecting/produto/achados-da-empresa";
import type { ProdutoDoRoteiro } from "@/lib/prospecting/produto/roteiro";
import { plataformaDePedidos, type SiteEnrichment } from "@/lib/prospecting/site-classify";

/**
 * As pizzarias de Goiânia da busca real de 2026-11-10 (20 empresas). Os endereços são
 * os que o Google mostrou como "Site da empresa". 9 de 20 eram plataforma de pedidos de
 * terceiros, e a tela dizia "site em ordem" ou "site não medido" para elas.
 */
const AGORA = "2026-11-10T12:00:00.000Z";

function site(parcial: Partial<SiteEnrichment>): SiteEnrichment {
  return {
    ver: 1,
    classe: "site-ok",
    problemas: [],
    checklist: { tem: [], falta: [] },
    final_url: null,
    http_status: 200,
    tempo_ms: 300,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-10T11:00:00.000Z",
    provisorio: false,
    tentativas: 0,
    ...parcial,
  };
}

const BLOQUEADO = (): SiteEnrichment =>
  site({ classe: "nao-medido", problemas: ["medicao-bloqueada"], http_status: 403 });

const produto = (solucoes: Record<string, string>): ProdutoDoRoteiro => ({
  nome: "Manero",
  resumo: "Cardápio digital para restaurantes.",
  solucoes,
  prova: null,
  link_demo: null,
  proibicoes: [],
});

const PLATAFORMAS_REAIS: Array<[empresa: string, url: string, nome: string]> = [
  ["Pizzaria no Quintal", "https://pizzarianoquintal.saipos.com/home?src=&utm_source=gmn", "Saipos"],
  ["Pizzaria Eskenosen", "https://pedido.anota.ai/loja/eskenosen-pizzaria?f=msa", "Anota AI"],
  ["RAIO 21", "https://instadelivery.com.br/raio21pizzaria", "Instadelivery"],
  ["Brasa Ville", "https://app.cardapioweb.com/brasa_ville_pizzaria_unidade_faicalville", "Cardápio Web"],
  ["Valentella", "https://menu.brendi.com.br/valentella-pizzeria-alto-da-gloria/", "Brendi"],
  ["Artesano", "https://deliverydireto.com.br/artesanopizzaepesto/artesanopizzaepesto?dd=menu", "Delivery Direto"],
  ["Casa São Paulo", "https://deliveryapp.neemo.com.br/delivery/4644/menu", "Neemo"],
  ["Arte e Sabor", "https://pizzariaarteesabor.byfood.com.br/", "ByFood"],
  ["forno de ouro", "http://fornodeouro.gynfood.com.br/", "Gynfood"],
];

const SITES_PROPRIOS_REAIS = [
  "http://briepizzaria.com.br/",
  "http://www.amodapizzaria.com.br/",
  "https://brasadnapoli.com.br/",
];

describe("plataformaDePedidos: reconhecida só pelo endereço", () => {
  it.each(PLATAFORMAS_REAIS)("%s -> plataforma de terceiros", (_empresa, url, nome) => {
    expect(plataformaDePedidos(url)).toBe(nome);
  });

  it("o subdomínio da loja removida também é da plataforma (Massas e Cia)", () => {
    expect(plataformaDePedidos("http://massasecia.saipos.com.br/")).toBe("Saipos");
  });

  it.each(SITES_PROPRIOS_REAIS)("%s é domínio próprio: não é plataforma", (url) => {
    expect(plataformaDePedidos(url)).toBeNull();
  });

  it("rede social, link-in-bio e WhatsApp seguem sendo agregador, não plataforma", () => {
    for (const url of [
      "https://beacons.ai/casa09gastronomia/home",
      "https://wa.me/message/FVFQOBLGJ7GLL1",
      "https://www.instagram.com/nossacasapizzaria/",
    ])
      expect(plataformaDePedidos(url)).toBeNull();
  });

  it("não casa por trecho: um domínio que apenas contém o nome não é a plataforma", () => {
    expect(plataformaDePedidos("https://meusaipos.com.br/")).toBeNull();
    expect(plataformaDePedidos("https://anota.ai.falso.com/")).toBeNull();
    expect(plataformaDePedidos(null)).toBeNull();
    expect(plataformaDePedidos("não é url")).toBeNull();
  });
});

describe("achadosDaEmpresa com plataforma de pedidos", () => {
  it.each(PLATAFORMAS_REAIS)("%s: o achado sai mesmo com o site 'em ordem'", (_e, url) => {
    const r = achadosDaEmpresa({ website: url, site: site({ classe: "site-ok" }) }, AGORA);
    expect(r).toMatchObject({ estado: "medido", citavel: true });
    if (r.estado !== "medido") throw new Error("esperava medido");
    expect(r.achados.map((a) => a.codigo)).toEqual(["plataforma-de-pedidos"]);
  });

  it.each(PLATAFORMAS_REAIS)("%s: o achado sai mesmo com a plataforma barrando a medição", (_e, url) => {
    const r = achadosDaEmpresa({ website: url, site: BLOQUEADO() }, AGORA);
    if (r.estado !== "medido") throw new Error("esperava medido");
    expect(r.citavel).toBe(true);
    expect(r.achados.map((a) => a.codigo)).toEqual(["plataforma-de-pedidos"]);
  });

  it("defeito da PÁGINA da plataforma (lento, celular) não é da pizzaria: não vira achado", () => {
    const r = achadosDaEmpresa(
      {
        website: "https://instadelivery.com.br/raio21pizzaria",
        site: site({ classe: "site-ruim", problemas: ["lento", "nao-mobile", "construtor-Wix"] }),
      },
      AGORA,
    );
    if (r.estado !== "medido") throw new Error("esperava medido");
    expect(r.achados.map((a) => a.codigo)).toEqual(["plataforma-de-pedidos"]);
  });

  it("Massas e Cia: a loja sumiu da Saipos -> o achado é o endereço morto, não 'plataforma'", () => {
    const r = achadosDaEmpresa(
      { website: "http://massasecia.saipos.com.br/", site: site({ classe: "fora-do-ar", problemas: ["dns-morto"] }) },
      AGORA,
    );
    if (r.estado !== "medido") throw new Error("esperava medido");
    const codigos = r.achados.map((a) => a.codigo);
    expect(codigos).toContain("dns-morto");
    expect(codigos).not.toContain("plataforma-de-pedidos");
  });

  it("veredito provisório (queda de rede) não é fato: nenhum achado", () => {
    const r = achadosDaEmpresa(
      {
        website: "https://app.cardapioweb.com/x",
        site: site({ classe: "nao-medido", provisorio: true, tentativas: 3 }),
      },
      AGORA,
    );
    expect(r).toMatchObject({ estado: "medido", achados: [], citavel: false });
  });

  it("domínio próprio bloqueado continua sem achado (a regra #3723 não foi afrouxada)", () => {
    const r = achadosDaEmpresa({ website: "https://pizzariaxyz.com.br/", site: BLOQUEADO() }, AGORA);
    expect(r).toMatchObject({ estado: "medido", achados: [], citavel: false });
  });
});

describe("elegibilidade com plataforma de pedidos", () => {
  const url = "https://pedido.anota.ai/loja/eskenosen-pizzaria";

  it("com a frase de solução cadastrada, a bloqueada fica elegível e o achado é o crítico", () => {
    const v = avaliarCandidatoParaProduto(
      { website: url, site: BLOQUEADO() },
      produto({ "plataforma-de-pedidos": "O Manero dá à pizzaria um cardápio próprio, com o nome dela." }),
      AGORA,
    );
    expect(v.estado).toBe("elegivel");
    if (v.estado === "elegivel") expect(v.critico?.codigo).toBe("plataforma-de-pedidos");
  });

  it("sem a frase de solução, fica de fora com o motivo escrito (nada inventado)", () => {
    const v = avaliarCandidatoParaProduto({ website: url, site: BLOQUEADO() }, produto({}), AGORA);
    expect(v.estado).toBe("inelegivel");
  });
});
