import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type {
  ProdutoAtualizar,
  ProdutoCriar,
  ProdutoDaProspeccao,
} from "@/lib/prospecting/produto/schema";

/**
 * Repositório do produto cadastrado da prospecção.
 *
 * A organização vem SEMPRE do chamador (sessão/JWT já validado), nunca do corpo.
 * Toda consulta filtra `organization_id` explicitamente, mesmo sob RLS: com o
 * cliente admin (service role) este filtro é a única barreira.
 */
export type ClienteDoProduto = SupabaseClient<Database>;

export class ProdutoErro extends Error {
  constructor(
    readonly codigo: "nome_duplicado" | "nao_encontrado" | "falha",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ProdutoErro";
  }
}

export const COLUNAS_DO_PRODUTO =
  "id, nome, categoria, resumo, solucoes, prova, link_demo, proibicoes, assina, mensagem_1, mensagem_2, archived_at, created_at, updated_at";

function mapear(linha: unknown): ProdutoDaProspeccao {
  return linha as ProdutoDaProspeccao;
}

function falhar(erro: { code?: string } | null): never {
  if (erro?.code === "23505")
    throw new ProdutoErro("nome_duplicado", "Já existe um produto com este nome.");
  throw new ProdutoErro("falha", "Não foi possível concluir a operação com o produto.");
}

export async function listarProdutos(
  db: ClienteDoProduto,
  organizationId: string,
  opcoes: { incluirArquivados?: boolean } = {},
): Promise<ProdutoDaProspeccao[]> {
  let consulta = db
    .from("prospecting_products")
    .select(COLUNAS_DO_PRODUTO)
    .eq("organization_id", organizationId);
  if (!opcoes.incluirArquivados) consulta = consulta.is("archived_at", null);
  const { data, error } = await consulta
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) falhar(error);
  return (data ?? []).map(mapear);
}

export async function buscarProduto(
  db: ClienteDoProduto,
  organizationId: string,
  id: string,
): Promise<ProdutoDaProspeccao | null> {
  const { data, error } = await db
    .from("prospecting_products")
    .select(COLUNAS_DO_PRODUTO)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) falhar(error);
  return data ? mapear(data) : null;
}

export async function criarProduto(
  db: ClienteDoProduto,
  organizationId: string,
  userId: string,
  entrada: ProdutoCriar,
): Promise<ProdutoDaProspeccao> {
  const { data, error } = await db
    .from("prospecting_products")
    .insert({ ...entrada, organization_id: organizationId, created_by: userId })
    .select(COLUNAS_DO_PRODUTO)
    .single();
  if (error || !data) falhar(error);
  return mapear(data);
}

/** Edita um produto VIVO. Arquivado não se edita (desarquivar não existe na v1). */
export async function atualizarProduto(
  db: ClienteDoProduto,
  organizationId: string,
  id: string,
  mudancas: ProdutoAtualizar,
): Promise<ProdutoDaProspeccao> {
  const { data, error } = await db
    .from("prospecting_products")
    .update(mudancas)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .is("archived_at", null)
    .select(COLUNAS_DO_PRODUTO)
    .maybeSingle();
  if (error) falhar(error);
  if (!data) throw new ProdutoErro("nao_encontrado", "Produto não encontrado.");
  return mapear(data);
}

/** Arquiva (nunca apaga). Idempotente: arquivar o já arquivado devolve a linha como está. */
export async function arquivarProduto(
  db: ClienteDoProduto,
  organizationId: string,
  id: string,
): Promise<{ produto: ProdutoDaProspeccao; jaArquivado: boolean }> {
  const { data, error } = await db
    .from("prospecting_products")
    .update({ archived_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .is("archived_at", null)
    .select(COLUNAS_DO_PRODUTO)
    .maybeSingle();
  if (error) falhar(error);
  if (data) return { produto: mapear(data), jaArquivado: false };
  const existente = await buscarProduto(db, organizationId, id);
  if (!existente) throw new ProdutoErro("nao_encontrado", "Produto não encontrado.");
  return { produto: existente, jaArquivado: true };
}
