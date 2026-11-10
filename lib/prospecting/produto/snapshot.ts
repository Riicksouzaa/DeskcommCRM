import { z } from "zod";

import { LIMITES_DO_PRODUTO, type ProdutoDaProspeccao } from "@/lib/prospecting/produto/schema";
import type { ProdutoDoRoteiro } from "@/lib/prospecting/produto/roteiro";

/**
 * O RETRATO do produto que a campanha guarda ao ser ativada
 * (spec 2026-11-10-prospeccao-produto-da-campanha-design §3.3).
 *
 * Editar o produto depois NÃO muda campanha em andamento: a mensagem que sai é a
 * que o operador aprovou na ativação. Por isso o retrato carrega os campos que a
 * abordagem usa (e só eles) e a revisão do produto de onde saiu
 * (`produto_atualizado_em`).
 *
 * Client-safe (sem banco). O schema é PERMISSIVO nas chaves de `solucoes`: o
 * vocabulário de achados cresce, e um retrato gravado com um código que o
 * catálogo de hoje não conhece não pode deixar de abrir — senão a campanha
 * ativa pararia de enviar por causa de um deploy.
 */
export const produtoSnapshotSchema = z
  .object({
    product_id: z.string().uuid(),
    /** `updated_at` do produto no instante do retrato: a "versão" de onde a campanha saiu. */
    produto_atualizado_em: z.string().max(40),
    nome: z.string().min(1).max(LIMITES_DO_PRODUTO.nome),
    resumo: z.string().min(1).max(LIMITES_DO_PRODUTO.resumo),
    /** Nome da voz da campanha ("Aqui é {assina}"). Resolvido na ativação — nunca vazio. */
    assina: z.string().min(1).max(LIMITES_DO_PRODUTO.assina),
    solucoes: z.record(z.string().max(80), z.string().min(1).max(LIMITES_DO_PRODUTO.solucao)),
    prova: z.string().max(LIMITES_DO_PRODUTO.prova).nullable(),
    link_demo: z.string().max(LIMITES_DO_PRODUTO.linkDemo).nullable(),
    proibicoes: z
      .array(z.string().min(1).max(LIMITES_DO_PRODUTO.proibicao))
      .max(LIMITES_DO_PRODUTO.maxProibicoes),
  })
  .strict();
export type ProdutoSnapshot = z.infer<typeof produtoSnapshotSchema>;

/**
 * Monta o retrato a partir da linha do produto. `assina` vem resolvido por quem
 * ativa (o do produto, ou o nome do agente da campanha quando o produto não tem).
 */
export function construirSnapshot(
  produto: Pick<
    ProdutoDaProspeccao,
    "id" | "nome" | "resumo" | "solucoes" | "prova" | "link_demo" | "proibicoes" | "updated_at"
  >,
  assina: string,
): ProdutoSnapshot {
  return {
    product_id: produto.id,
    produto_atualizado_em: new Date(produto.updated_at).toISOString(),
    nome: produto.nome,
    resumo: produto.resumo,
    assina,
    solucoes: { ...produto.solucoes },
    prova: produto.prova ?? null,
    link_demo: produto.link_demo ?? null,
    proibicoes: [...produto.proibicoes],
  };
}

/** O recorte que o roteiro (módulo puro) entende. */
export function produtoDoRoteiro(
  s: Pick<ProdutoSnapshot, "nome" | "resumo" | "solucoes" | "prova" | "link_demo" | "proibicoes">,
): ProdutoDoRoteiro {
  return {
    nome: s.nome,
    resumo: s.resumo,
    solucoes: s.solucoes,
    prova: s.prova,
    link_demo: s.link_demo,
    proibicoes: s.proibicoes,
  };
}
