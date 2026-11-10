/**
 * GET  /api/v1/prospecting/products — produtos cadastrados da prospecção (viewer+).
 *      `?arquivados=1` inclui os arquivados.
 * POST /api/v1/prospecting/products — cria um produto (manager+; admin também).
 *      Aceita `Idempotency-Key: <uuid>`.
 *
 * Só sessão: o produto é configuração de tela. A organização vem do cookie validado
 * (`requireRole`), nunca do corpo, e o cliente é o da sessão (RLS), com o filtro
 * explícito de `organization_id` no repositório.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { criarProduto, listarProdutos, ProdutoErro } from "@/lib/prospecting/produto/repo";
import { produtoCriarSchema } from "@/lib/prospecting/produto/schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
/** Tag do endpoint no recibo de idempotência. */
const ENDPOINT = "/api/v1/prospecting/products";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_products" });
  if (!authz.ok) return authz.response;
  try {
    const produtos = await listarProdutos(await createClient(), authz.org.orgId, {
      incluirArquivados: req.nextUrl.searchParams.get("arquivados") === "1",
    });
    return ok(produtos, { requestId, headers });
  } catch {
    return fail("internal_error", "Erro ao listar produtos.", 500, { requestId, headers });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const support = await requireSupportWrite();
  if (support) return support;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "prospecting_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success)
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId, headers });

  const parsed = produtoCriarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      headers,
      details: z.flattenError(parsed.error).fieldErrors as Record<string, unknown>,
    });
  const entrada = parsed.data;

  const db = await createClient();

  /** O efeito. Lança em falha, para a idempotência não gravar recibo de criação inexistente. */
  async function criar() {
    const produto = await criarProduto(db, org.orgId, user.id, entrada);
    void audit({
      action: "prospecting.product_created",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "prospecting_product",
      resourceId: produto.id,
      requestId,
      metadata: { nome: produto.nome, achados_com_solucao: Object.keys(produto.solucoes).length },
    });
    return produto;
  }

  try {
    if (chave === null) return ok(await criar(), { requestId, headers, status: 201 });

    const desfecho = await comIdempotencia({
      db,
      organizationId: org.orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: entrada,
      executar: async () => ({ resposta: await criar(), status: 201 }),
    });
    if (desfecho.tipo === "conflito")
      return fail(
        "idempotency_conflict",
        t("Esta chave de idempotência já foi usada com outro conteúdo."),
        409,
        { requestId, headers },
      );
    if (desfecho.tipo === "em_curso")
      return fail(
        "idempotency_in_progress",
        t("Esta requisição já está em andamento. Tente novamente em instantes."),
        409,
        { requestId, headers },
      );
    return ok(desfecho.resposta, { requestId, headers, status: 201 });
  } catch (erro) {
    if (erro instanceof ProdutoErro && erro.codigo === "nome_duplicado")
      return fail("state_conflict", t(erro.message), 409, { requestId, headers });
    logger.warn("prospecting.product_create_failed", { requestId });
    return fail("internal_error", "Erro ao criar produto.", 500, { requestId, headers });
  }
}
