import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";

import { ProdutosClient } from "./_produtos-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Produtos da prospecção" };

export default async function ProdutosDaProspeccaoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/inbox");
  // A API é a autoridade (manager+ escreve); a tela só esconde os botões de quem não pode.
  return <ProdutosClient podeEscrever={roleAtLeast(org.role, "manager")} />;
}
