import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { ACHADOS } from "@/lib/prospecting/produto/achados-da-empresa";
import { montarRoteiroDoCandidato } from "@/lib/prospecting/produto/roteiro-do-candidato";
import type { ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";
import type { SiteEnrichment } from "@/lib/prospecting/site-classify";

/**
 * CERCA: nenhuma mensagem de prospecção cita achado sem solução (spec §6.1).
 *
 * A regra mora em UM lugar (`achadosUsaveis`, em `produto/roteiro.ts`) e UMA porta chega nela
 * (`montarRoteiroDoCandidato`). Esta cerca prova as duas pontas:
 *
 *  1. ESTRUTURAL — só `roteiro-do-candidato.ts` pode chamar `montarMensagem1/2`. Worker, contexto,
 *     prévia e conferência da Msg 2 não montam texto de achado por conta própria: se alguém
 *     importar o montador cru num deles, o achado deixa de passar pelo filtro único e esta cerca
 *     reprova. A frase de um achado (`vimos_curto`) também não pode ser copiada para outro módulo.
 *  2. COMPORTAMENTAL — para TODO subconjunto de soluções do catálogo, nenhuma Msg 1 nem Msg 2
 *     contém a frase de um achado que o produto não resolve.
 */

const RAIZ = join(__dirname, "..", "..");
const MONTADORES = /\bmontarMensagem[12]\b/;

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", ".claude", "evidence"].includes(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

describe("a porta única do texto de prospecção", () => {
  const fonte = ["lib", "app", "components", "hooks"].flatMap((d) => arquivos(join(RAIZ, d)));
  const rel = (f: string) => relative(RAIZ, f).replace(/\\/g, "/");

  it("só o módulo do roteiro e o montador por candidato chamam montarMensagem1/2", () => {
    const quem = fonte
      .filter((f) => MONTADORES.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(quem).toEqual([
      "lib/prospecting/produto/roteiro-do-candidato.ts",
      "lib/prospecting/produto/roteiro.ts",
    ]);
  });

  it("worker, contexto, prévia e conferência da Msg 2 montam pela porta única", () => {
    for (const f of [
      "lib/prospecting/worker.ts",
      "lib/prospecting/context.ts",
      "lib/prospecting/previa-gerar.ts",
      "lib/prospecting/produto/msg2.ts",
      "app/app/prospecting/_client.tsx",
    ]) {
      const texto = readFileSync(join(RAIZ, f), "utf8");
      expect(MONTADORES.test(texto), `${f} monta mensagem por conta própria`).toBe(false);
    }
    // E os que precisam do texto o pedem à porta única.
    for (const f of [
      "lib/prospecting/worker.ts",
      "lib/prospecting/previa-gerar.ts",
      "lib/prospecting/produto/msg2.ts",
      "app/app/prospecting/_client.tsx",
    ]) {
      expect(readFileSync(join(RAIZ, f), "utf8"), f).toContain("montarRoteiroDoCandidato");
    }
  });

  it("a frase de um achado (vimos_curto) mora só na tabela ACHADOS", () => {
    for (const [codigo, { vimos_curto }] of Object.entries(ACHADOS)) {
      const copias = fonte.filter(
        (f) => !rel(f).endsWith("produto/achados-da-empresa.ts") && readFileSync(f, "utf8").includes(vimos_curto),
      );
      expect(copias.map(rel), `a frase de "${codigo}" foi copiada`).toEqual([]);
    }
  });
});

describe("nenhum subconjunto de soluções deixa vazar achado sem solução", () => {
  const SITE: SiteEnrichment = {
    ver: 1,
    classe: "site-ruim",
    // Todos os problemas medidos de um site que abre, de uma vez.
    problemas: [
      "sem-https",
      "http-sem-redirecionar",
      "conteudo-misto",
      "nao-mobile",
      "lento",
      "quase-vazia",
      "http-500",
      "construtor-Wix",
      "sem-atualizacao-desde-2019",
      "falta-whatsapp",
    ],
    checklist: { tem: [], falta: [] },
    final_url: "https://x.com.br/",
    http_status: 200,
    tempo_ms: 300,
    conteudo_resumo: null,
    pagespeed: null,
    verificado_em: "2026-11-09T12:00:00.000Z",
    provisorio: false,
    tentativas: 0,
  };
  const dados = { name: "Padaria Central", website: "https://x.com.br", site: SITE };
  const codigos = Object.keys(ACHADOS);

  function snapshotCom(resolvidos: string[]): ProdutoSnapshot {
    return {
      product_id: "10000000-0000-4000-8000-000000000009",
      produto_atualizado_em: "2026-11-10T10:00:00.000Z",
      nome: "Manero",
      resumo: "Cardápio digital para restaurantes.",
      assina: "Dani",
      solucoes: Object.fromEntries(resolvidos.map((c) => [c, `solução ${c}`])),
      prova: null,
      link_demo: null,
      proibicoes: [],
    };
  }

  it("para cada código resolvido isoladamente, só a frase DELE aparece", () => {
    for (const resolvido of codigos) {
      const r = montarRoteiroDoCandidato({
        data: dados,
        snapshot: snapshotCom([resolvido]),
        locale: "pt",
        agoraIso: "2026-11-10T12:00:00.000Z",
      });
      if (r.estado !== "pronto") continue; // o código não faz parte deste site: inelegível
      for (const [codigo, { vimos_curto }] of Object.entries(ACHADOS)) {
        const aparece = r.msg1.includes(vimos_curto) || r.msg2.includes(vimos_curto);
        expect(aparece, `${resolvido} resolvido, mas a frase de ${codigo}: ${aparece}`).toBe(codigo === resolvido);
      }
    }
  });

  it("com subconjuntos variados (todas as 2^N combinações de 6 códigos do site), nunca vaza", () => {
    const doSite = ["sem-https", "nao-mobile", "lento", "quase-vazia", "conteudo-misto", "construtor-pronto"];
    for (let mascara = 0; mascara < 1 << doSite.length; mascara++) {
      const resolvidos = doSite.filter((_, i) => mascara & (1 << i));
      const r = montarRoteiroDoCandidato({
        data: dados,
        snapshot: snapshotCom(resolvidos),
        locale: "pt",
        agoraIso: "2026-11-10T12:00:00.000Z",
      });
      if (resolvidos.length === 0) {
        expect(r.estado).toBe("inelegivel");
        continue;
      }
      expect(r.estado).toBe("pronto");
      if (r.estado !== "pronto") continue;
      const naoResolvidos = codigos.filter((c) => !resolvidos.includes(c));
      for (const codigo of naoResolvidos) {
        const frase = ACHADOS[codigo as keyof typeof ACHADOS].vimos_curto;
        expect(r.msg1.includes(frase) || r.msg2.includes(frase), `vazou ${codigo} com ${resolvidos}`).toBe(false);
      }
    }
  });
});
