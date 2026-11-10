/**
 * PATCH  /api/v1/prospecting/products/:id — edita um produto vivo (manager+).
 * DELETE /api/v1/prospecting/products/:id — ARQUIVA (nunca apaga): campanhas já
 *        ativadas guardam o retrato, e o histórico não pode sumir.
 *
 * Só sessão. A organização vem do cookie validado, nunca do corpo ou do caminho.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { arquivarProduto, atualizarProduto, ProdutoErro } from "@/lib/prospecting/produto/repo";
import { produtoAtualizarSchema } from "@/lib/prospecting/produto/schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Contexto = { params: Promise<{ id: string }> };

function falhaDoRepo(erro: unknown, requestId: string, t: (s: string) => string): Response {
  if (erro instanceof ProdutoErro) {
    if (erro.codigo === "nao_encontrado")
      return fail("not_found", t("Produto não encontrado."), 404, { requestId, headers });
    if (erro.codigo === "nome_duplicado")
      return fail("state_conflict", t(erro.message), 409, { requestId, headers });
  }
  logger.warn("prospecting.product_write_failed", { requestId });
  return fail("internal_error", "Erro ao salvar o produto.", 500, { requestId, headers });
}

export async function PATCH(req: NextRequest, { params }: Contexto): Promise<Response> {
  const support = await requireSupportWrite();
  if (support) return support;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "prospecting_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, headers });
  const parsed = produtoAtualizarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      headers,
      details: z.flattenError(parsed.error).fieldErrors as Record<string, unknown>,
    });

  try {
    const produto = await atualizarProduto(await createClient(), org.orgId, id, parsed.data);
    void audit({
      action: "prospecting.product_updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "prospecting_product",
      resourceId: produto.id,
      requestId,
      metadata: { campos: Object.keys(parsed.data) },
    });
    return ok(produto, { requestId, headers });
  } catch (erro) {
    return falhaDoRepo(erro, requestId, t);
  }
}

export async function DELETE(_req: NextRequest, { params }: Contexto): Promise<Response> {
  const support = await requireSupportWrite();
  if (support) return support;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "prospecting_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, headers });

  try {
    const { produto, jaArquivado } = await arquivarProduto(await createClient(), org.orgId, id);
    // Arquivar o já arquivado não é mutação: sem efeito, sem auditoria.
    if (!jaArquivado)
      void audit({
        action: "prospecting.product_archived",
        actorUserId: user.id,
        organizationId: org.orgId,
        resourceType: "prospecting_product",
        resourceId: produto.id,
        requestId,
        metadata: { nome: produto.nome },
      });
    return ok(produto, { requestId, headers });
  } catch (erro) {
    return falhaDoRepo(erro, requestId, t);
  }
}
