import { z } from "zod";

import { CLASSES_DE_SITE } from "@/lib/prospecting/site-classify";

/**
 * Produto cadastrado da prospecção (spec 2026-11-10-prospeccao-produto-da-campanha-design §3).
 * Client-safe: nenhum import de `node:*` nem de banco. A tela e a rota usam o mesmo Zod.
 */

/**
 * Os códigos de achado que a auditoria MEDE hoje e que a abordagem pode citar.
 * Fonte única do mapa `solucoes`: código fora desta lista é recusado.
 *
 * Régua: só é citável o que foi medido e é definitivo (`citavelNoArgumento`, #3723).
 * Por isso ficam de fora `nao-medido` e `site-ok` (classes) e todo `falta-*`
 * (melhoria do checklist, nunca gancho). Os códigos de problema são os que
 * `site-fetch.ts` grava em `data.site.problemas`; as três FAMÍLIAS cobrem os
 * códigos com sufixo dinâmico (`http-404` -> `erro-http`, `construtor-Wix` ->
 * `construtor-pronto`, `sem-atualizacao-desde-2019` -> `sem-atualizacao`).
 * Quando o catálogo PR-02 existir, esta constante passa a derivar dele.
 */
const CLASSES_CITAVEIS = CLASSES_DE_SITE.filter(
  (c) => c !== "nao-medido" && c !== "site-ok" && c !== "site-ruim",
);

export const CODIGOS_DE_ACHADO = [
  // Classes de auditoria que, sozinhas, são o achado (agregador, sem-site, ssl-invalido, fora-do-ar).
  ...CLASSES_CITAVEIS,
  // Problemas medidos de um site que abre.
  "dns-morto",
  "sem-https",
  "http-sem-redirecionar",
  "conteudo-misto",
  "nao-mobile",
  "lento",
  "quase-vazia",
  // Famílias de código com sufixo dinâmico.
  "sem-atualizacao",
  "erro-http",
  "construtor-pronto",
  // Medido só pelo endereço do `website` (sem rede): o cardápio mora numa plataforma de terceiros.
  "plataforma-de-pedidos",
] as const;
export type CodigoDeAchado = (typeof CODIGOS_DE_ACHADO)[number];

const CODIGOS = new Set<string>(CODIGOS_DE_ACHADO);

export function ehCodigoDeAchado(codigo: string): codigo is CodigoDeAchado {
  return CODIGOS.has(codigo);
}

/**
 * Traduz um código CRU de `data.site.problemas` (ou a classe) para o código do
 * catálogo acima, ou `null` quando não é citável (`falta-*`, `nao-medido`, desconhecido).
 */
export function codigoDeAchadoDoProblema(bruto: string): CodigoDeAchado | null {
  if (bruto.startsWith("falta-")) return null;
  if (bruto.startsWith("sem-atualizacao-desde-")) return "sem-atualizacao";
  if (bruto.startsWith("construtor-")) return "construtor-pronto";
  if (/^http-\d{3}$/.test(bruto)) return "erro-http";
  return ehCodigoDeAchado(bruto) ? bruto : null;
}

export const LIMITES_DO_PRODUTO = {
  nome: 80,
  categoria: 80,
  resumo: 300,
  prova: 300,
  assina: 80,
  linkDemo: 500,
  solucao: 300,
  maxSolucoes: 20,
  proibicao: 60,
  maxProibicoes: 20,
} as const;

const textoObrigatorio = (max: number) => z.string().trim().min(1).max(max);
/** Opcional: vazio vira `null`, para a tela poder limpar o campo. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const linkHttps = z
  .string()
  .trim()
  .max(LIMITES_DO_PRODUTO.linkDemo)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => {
      if (v === null) return true;
      try {
        const u = new URL(v);
        return u.protocol === "https:" && u.hostname.includes(".") && !/\s/.test(v);
      } catch {
        return false;
      }
    },
    { message: "link_demo deve ser um endereço https válido" },
  );

const solucoesSchema = z
  .record(z.string(), z.string().trim().min(1).max(LIMITES_DO_PRODUTO.solucao))
  .superRefine((mapa, ctx) => {
    const codigos = Object.keys(mapa);
    if (codigos.length > LIMITES_DO_PRODUTO.maxSolucoes)
      ctx.addIssue({
        code: "custom",
        message: `No máximo ${LIMITES_DO_PRODUTO.maxSolucoes} soluções`,
      });
    for (const codigo of codigos)
      if (!ehCodigoDeAchado(codigo))
        ctx.addIssue({
          code: "custom",
          path: [codigo],
          message: `Código de achado desconhecido: ${codigo}`,
        });
  });

const proibicoesSchema = z
  .array(z.string().trim().min(1).max(LIMITES_DO_PRODUTO.proibicao))
  .max(LIMITES_DO_PRODUTO.maxProibicoes)
  .transform((lista) => {
    // Dedup sem diferenciar caixa, preservando a primeira grafia.
    const vistos = new Set<string>();
    return lista.filter((t) => {
      const k = t.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  });

const camposDoProduto = {
  nome: textoObrigatorio(LIMITES_DO_PRODUTO.nome),
  categoria: textoObrigatorio(LIMITES_DO_PRODUTO.categoria),
  resumo: textoObrigatorio(LIMITES_DO_PRODUTO.resumo),
  solucoes: solucoesSchema,
  prova: textoOpcional(LIMITES_DO_PRODUTO.prova),
  link_demo: linkHttps,
  proibicoes: proibicoesSchema,
  assina: textoOpcional(LIMITES_DO_PRODUTO.assina),
};

/** Criação. `solucoes` e `proibicoes` ausentes valem vazio. Chave desconhecida é recusada. */
export const produtoCriarSchema = z
  .object({
    ...camposDoProduto,
    solucoes: solucoesSchema.default({}),
    proibicoes: proibicoesSchema.default([]),
  })
  .strict();
export type ProdutoCriar = z.infer<typeof produtoCriarSchema>;

/** Edição parcial: só o que veio muda; ao menos um campo. */
export const produtoAtualizarSchema = z
  .object(camposDoProduto)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" });
export type ProdutoAtualizar = z.infer<typeof produtoAtualizarSchema>;

/** A linha como a API devolve. */
export interface ProdutoDaProspeccao {
  id: string;
  nome: string;
  categoria: string;
  resumo: string;
  solucoes: Record<string, string>;
  prova: string | null;
  link_demo: string | null;
  proibicoes: string[];
  assina: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
