import { describe, expect, it } from "vitest";

import {
  arquivarProduto,
  atualizarProduto,
  buscarProduto,
  criarProduto,
  listarProdutos,
  ProdutoErro,
  type ClienteDoProduto,
} from "@/lib/prospecting/produto/repo";

/** Cliente de mentira que grava cada filtro aplicado e devolve o resultado combinado. */
function cliente(resultado: { data: unknown; error: { code?: string } | null }) {
  const chamadas: Array<[string, ...unknown[]]> = [];
  const cadeia: Record<string, unknown> = {};
  for (const metodo of ["select", "insert", "update", "eq", "is", "order"])
    cadeia[metodo] = (...args: unknown[]) => {
      chamadas.push([metodo, ...args]);
      return cadeia;
    };
  cadeia.single = async () => resultado;
  cadeia.maybeSingle = async () => resultado;
  cadeia.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok);
  const db = { from: () => cadeia } as unknown as ClienteDoProduto;
  return { db, chamadas };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const orgFiltrada = (c: Array<[string, ...unknown[]]>) =>
  c.some(([m, col, val]) => m === "eq" && col === "organization_id" && val === ORG);

describe("repo do produto: sempre filtra pela organização da sessão", () => {
  it("listar, buscar, atualizar e arquivar filtram organization_id", async () => {
    const l = cliente({ data: [], error: null });
    await listarProdutos(l.db, ORG);
    expect(orgFiltrada(l.chamadas)).toBe(true);
    expect(l.chamadas.some(([m, col]) => m === "is" && col === "archived_at")).toBe(true);

    const b = cliente({ data: null, error: null });
    expect(await buscarProduto(b.db, ORG, ID)).toBeNull();
    expect(orgFiltrada(b.chamadas)).toBe(true);

    const a = cliente({ data: { id: ID }, error: null });
    await atualizarProduto(a.db, ORG, ID, { resumo: "x" });
    expect(orgFiltrada(a.chamadas)).toBe(true);

    const r = cliente({ data: { id: ID }, error: null });
    await arquivarProduto(r.db, ORG, ID);
    expect(orgFiltrada(r.chamadas)).toBe(true);
  });

  it("criar grava a organização da sessão, ignorando qualquer organization_id da entrada", async () => {
    let gravado: Record<string, unknown> = {};
    const { db } = cliente({ data: { id: ID }, error: null });
    const original = db.from.bind(db);
    (db as unknown as { from: () => unknown }).from = () => {
      const c = original("prospecting_products") as unknown as Record<string, unknown>;
      const insert = c.insert as (v: Record<string, unknown>) => unknown;
      c.insert = (v: Record<string, unknown>) => {
        gravado = v;
        return insert(v);
      };
      return c;
    };
    await criarProduto(db, ORG, "u1", {
      nome: "n",
      categoria: "c",
      resumo: "r",
      solucoes: {},
      proibicoes: [],
      prova: null,
      link_demo: null,
      assina: null,
      mensagem_1: null,
      mensagem_2: null,
      ...({ organization_id: "outra-org" } as object),
    });
    expect(gravado.organization_id).toBe(ORG);
    expect(gravado.created_by).toBe("u1");
  });

  it("23505 vira nome_duplicado; ausência vira nao_encontrado", async () => {
    const dup = cliente({ data: null, error: { code: "23505" } });
    await expect(
      criarProduto(dup.db, ORG, "u", {
        nome: "n", categoria: "c", resumo: "r", solucoes: {}, proibicoes: [], prova: null, link_demo: null, assina: null, mensagem_1: null, mensagem_2: null,
      }),
    ).rejects.toMatchObject({ codigo: "nome_duplicado" });
    const nada = cliente({ data: null, error: null });
    await expect(atualizarProduto(nada.db, ORG, ID, { resumo: "x" })).rejects.toBeInstanceOf(ProdutoErro);
    await expect(arquivarProduto(nada.db, ORG, ID)).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });
});
