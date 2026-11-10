import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { ProspectingError } from "@/lib/prospecting/provider";
import { conferirProdutoParaCampanha } from "@/lib/prospecting/produto/roteiro-do-candidato";
import {
  construirSnapshot,
  produtoSnapshotSchema,
  type ProdutoSnapshot,
} from "@/lib/prospecting/produto/snapshot";

/**
 * O PRODUTO NA ATIVAÇÃO da campanha (PX-03).
 *
 * Só o SERVIDOR decide o retrato: `product_id` é a escolha do operador, mas o
 * produto é lido aqui, filtrado por `organization_id` (resolvido da sessão, NUNCA
 * do corpo), e "não existe", "é de outra organização" e "está arquivado" têm a
 * MESMA recusa — nenhuma das três deixa o chamador descobrir se um id existe em
 * outro tenant.
 *
 * Roda dentro de `activateCampaign` (sob o bloqueio da organização) e em mais
 * nenhum lugar: o worker e o `resume` leem o retrato JÁ gravado, nunca o produto
 * vivo — arquivar um produto não pausa campanha em andamento.
 */

const RECUSA_PRODUTO = "Escolha um produto cadastrado e ativo desta organização para a campanha.";

interface LinhaDoProduto {
  id: string;
  nome: string;
  resumo: string;
  solucoes: Record<string, string>;
  prova: string | null;
  link_demo: string | null;
  proibicoes: string[];
  assina: string | null;
  updated_at: Date | string;
}

export async function resolverProdutoDaAtivacao(
  db: Queryable,
  org: string,
  productId: string,
  agentId: string,
  /** Retrato já gravado por uma ativação interrompida DESTA campanha com o MESMO produto. */
  retratoSalvo?: ProdutoSnapshot | null,
  /**
   * `false` na PRÉVIA de um rascunho: o retrato é montado do mesmo jeito, mas o texto barrado não
   * recusa — a prévia o mostra com o motivo. Na ativação é sempre `true`.
   */
  conferirTextos = true,
): Promise<ProdutoSnapshot> {
  const salvo = retratoSalvo ? produtoSnapshotSchema.safeParse(retratoSalvo) : null;
  let snapshot: ProdutoSnapshot;
  if (salvo?.success && salvo.data.product_id === productId) {
    // Retomada da MESMA ativação: o retrato que o operador viu vale; editar o produto no
    // meio da preparação não o muda (e não derruba a comparação de "mesma configuração").
    snapshot = salvo.data;
  } else {
    const { rows } = await db.query<LinhaDoProduto>(
      "select id, nome, resumo, solucoes, prova, link_demo, proibicoes, assina, updated_at from public.prospecting_products where organization_id=$1 and id=$2 and archived_at is null",
      [org, productId],
    );
    const produto = rows[0];
    if (!produto) throw new ProspectingError(RECUSA_PRODUTO, 422);
    let assina = produto.assina?.trim() || null;
    if (!assina && agentId) {
      // A mensagem diz "Aqui é {assina}": sem nome de voz no produto, vale o nome do agente
      // da campanha (a voz que responde depois). Sem nenhum dos dois, não há como assinar.
      const agente = await db.query<{ name: string | null }>(
        "select name from public.ai_agents where organization_id=$1 and id=$2",
        [org, agentId],
      );
      assina = agente.rows[0]?.name?.trim() || null;
    }
    if (!assina)
      throw new ProspectingError(
        'O produto precisa de um nome em "Assina" (a voz que se apresenta na mensagem).',
        422,
      );
    snapshot = construirSnapshot(
      { ...produto, updated_at: new Date(produto.updated_at).toISOString() },
      assina.slice(0, 80),
    );
  }
  if (!conferirTextos) return snapshot;
  const locale = (
    await db.query<{ locale: string | null }>(
      "select locale from public.organizations where id=$1",
      [org],
    )
  ).rows[0]?.locale;
  const motivos = conferirProdutoParaCampanha(snapshot, locale ?? null);
  if (motivos.length > 0)
    throw new ProspectingError(
      `O texto montado a partir do produto seria barrado antes do envio. Corrija o produto: ${motivos.join(" ")}`,
      422,
    );
  return snapshot;
}
