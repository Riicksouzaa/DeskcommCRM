import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { ROTULOS_DAS_OFERTAS, campaignConfigSchema } from "./schema";
import type { ProdutoSnapshot } from "./produto/snapshot";

/**
 * O PRODUTO no contexto do agente (campanha com produto cadastrado, spec §5).
 *
 * Só entra aqui o que o OPERADOR escreveu e o retrato guardou: nome, resumo, prova, link e
 * proibições. O nome do negócio abordado e os achados dele são DADO DE TERCEIRO e não moram na
 * instrução de `system`: vão no bloco "Mensagem 2 da prospecção" do sufixo por-lead do turno
 * (`msg2PendenteDoTurno`). Aqui só a regra de como tratá-lo.
 */
export function blocoDoProdutoParaOAgente(produto: ProdutoSnapshot, msg2JaSaiu: boolean): string {
  const linhas = [
    `\nEsta campanha vende o produto "${produto.nome}": ${produto.resumo}`,
  ];
  if (produto.prova) linhas.push(`Prova ou condição cadastrada pela organização: ${produto.prova}`);
  if (produto.link_demo) linhas.push(`Exemplo para a pessoa ver funcionando: ${produto.link_demo}`);
  linhas.push(
    "Só afirme sobre o produto o que está escrito acima ou na base de conhecimento; não invente preço, prazo, garantia nem resultado.",
  );
  if (produto.proibicoes.length > 0)
    linhas.push(`Nunca escreva estes termos: ${produto.proibicoes.join(", ")}.`);
  linhas.push(
    "A primeira mensagem desta conversa citou um achado sobre a empresa e perguntou se a pessoa quer conhecer os outros. Nunca cite um achado que não esteja na Mensagem 2 pronta do sistema.",
  );
  linhas.push(
    msg2JaSaiu
      ? "A Mensagem 2 (a apresentação dos achados com a solução) JÁ foi enviada: não a reenvie nem repita a apresentação; siga a conversa a partir da resposta da pessoa."
      : 'Se a pessoa aceitou conhecer os achados, envie a Mensagem 2 que aparece pronta no bloco "Mensagem 2 da prospecção", EXATAMENTE como está, sem reescrever. Se ela recusou, pediu para parar ou perguntou outra coisa, responda a isso e NÃO envie a Mensagem 2.',
  );
  return linhas.join("\n");
}

/** Trusted operator criteria; scraped websites never become system instructions. */
export async function prospectingConversationContext(
  db: Queryable,
  org: string,
  conversationId: string,
) {
  const { rows } = await db.query<{
    config: unknown;
    exit_offered_at: Date | null;
    msg2_sent_at?: Date | null;
  }>(
    "select c.config, p.exit_offered_at, p.msg2_sent_at from prospecting_candidates p join prospecting_campaigns c on c.organization_id=p.organization_id and c.id=p.campaign_id where p.organization_id=$1 and p.conversation_id=$2 and p.status in ('sending','sent') limit 1",
    [org, conversationId],
  );
  const parsed = campaignConfigSchema.safeParse(rows[0]?.config);
  if (!parsed.success) return "";
  const c = parsed.data;
  const linha = rows[0];
  let fraseSaida = "";
  // Nos modos atrasados, enquanto a saída ainda não foi oferecida, a abertura
  // não é comercial: só cumprimente e confirme o contato. A instrução de saída
  // é acrescida pelo sistema na mensagem certa — o agente não a escreve.
  if (
    linha &&
    c.exit_offer === "second_message" &&
    linha.exit_offered_at === null
  ) {
    fraseSaida =
      "\n\nAntes da mensagem que leva a instrução de saída, não apresente serviço, preço nem proposta: apresente-se e peça permissão. O sistema acrescenta a instrução de saída sozinho; não a escreva.";
  }
  // Só site é o padrão (`emptyConfig` nasce com ele marcado): quem não mexeu nas caixinhas e
  // vende outra coisa pelo campo livre não pode passar a ler, em todo turno, que vende site.
  const soSite = c.ofertas.length === 1 && c.ofertas[0] === "site";
  // Com produto cadastrado as ofertas antigas são ignoradas: quem diz o que se vende é o retrato.
  const blocoProduto = c.product_snapshot
    ? blocoDoProdutoParaOAgente(c.product_snapshot, !!linha?.msg2_sent_at)
    : "";
  const linhaDasOfertas = soSite || c.product_snapshot
    ? ""
    : `\nO que esta campanha vende, em ordem: ${c.ofertas.map((o) => ROTULOS_DAS_OFERTAS[o]).join("; ")}.`;
  return `\n\nEsta conversa veio de uma campanha de prospecção. Objetivo definido pelo operador: ${c.instruction}\nCritérios de qualificação a confirmar com a pessoa: ${c.qualification}${linhaDasOfertas}${blocoProduto}\nConverse naturalmente, uma pergunta por vez. Uma empresa da lista da campanha ainda não é um cliente qualificado. Registre o que a pessoa confirmar, sem inventar necessidade, orçamento ou interesse. Só depois de confirmar os critérios, use as ferramentas disponíveis para mover o negócio do funil ${c.pipeline_id} para a etapa ${c.qualified_stage_id}. Explique a evidência no registro. Se faltar informação, continue qualificando. Respeite recusa, opt-out e intervenção humana; não prometa condições fora da política do agente.${fraseSaida}`;
}
