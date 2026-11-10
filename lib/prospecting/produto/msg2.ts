import { insertInboxItem } from "@/lib/agent-engine/db/repository";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { campaignConfigSchema, type Prospect } from "@/lib/prospecting/schema";
import { compararComEsperado } from "@/lib/prospecting/produto/roteiro";
import { montarRoteiroDoCandidato } from "@/lib/prospecting/produto/roteiro-do-candidato";
import type { ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";

/**
 * A MSG 2 DO ROTEIRO NO TURNO DO AGENTE (D1 = A, D4 = A).
 *
 * A Msg 2 é montada pelo SISTEMA (`montarRoteiroDoCandidato`, a mesma função da
 * Msg 1 e da prévia) e entregue ao agente pronta, com a ordem de enviá-la
 * LITERAL quando a pessoa aceitar. Depois do turno, uma conferência compara o
 * corpo enviado com ela:
 *
 *  - igual           -> `msg2_sent_at` + `msg2_literal = true`: a Msg 2 saiu, não volta;
 *  - reescrita       -> o agente apresentou o produto com outras palavras: o envio
 *                       JÁ feito não é desfeito nem bloqueado (a pessoa já leu),
 *                       mas `msg2_literal = false`, aviso na Central e trilha;
 *  - nenhuma das duas -> a pessoa recusou ou perguntou outra coisa: a Msg 2
 *                       continua pendente (resposta de recusa NÃO é divergência).
 *
 * Tudo aqui é fail-open: o contexto e a conferência NUNCA lançam — um defeito
 * deste módulo não pode derrubar o turno de atendimento de uma pessoa.
 */

export interface Msg2DoTurno {
  candidatoId: string;
  campanhaId: string;
  /** A Msg 2 montada para ESTA empresa; é contra ela que o corpo enviado é comparado. */
  esperada: string;
  /** O DADO (não instrução) que vai ao agente no sufixo por-lead do turno. */
  bloco: string;
  snapshot: ProdutoSnapshot;
}

interface LinhaDaConversa {
  id: string;
  campaign_id: string;
  data: Prospect;
  config: unknown;
  msg2_sent_at: Date | null;
  locale: string | null;
}

/** Marcas do bloco: o agente copia o que está ENTRE elas, e a conferência não depende delas. */
const ABRE = "<<<MENSAGEM_2";
const FECHA = "MENSAGEM_2>>>";

/**
 * A Msg 2 pendente desta conversa, ou `null` (não é conversa de campanha com produto, a Msg 2 já
 * saiu, o texto seria barrado ou algo falhou). Roda uma vez por turno, no começo.
 */
export async function msg2PendenteDoTurno(
  db: Queryable,
  org: string,
  conversationId: string,
): Promise<Msg2DoTurno | null> {
  try {
    const { rows } = await db.query<LinhaDaConversa>(
      "select p.id, p.campaign_id, p.data, c.config, p.msg2_sent_at, (select o.locale from public.organizations o where o.id = $1) as locale from public.prospecting_candidates p join public.prospecting_campaigns c on c.organization_id = p.organization_id and c.id = p.campaign_id where p.organization_id = $1 and p.conversation_id = $2 and p.status in ('sending', 'sent') limit 1",
      [org, conversationId],
    );
    const linha = rows[0];
    if (!linha || linha.msg2_sent_at !== null) return null;
    const cfg = campaignConfigSchema.safeParse(linha.config);
    if (!cfg.success || !cfg.data.product_snapshot) return null;
    const snapshot = cfg.data.product_snapshot;
    const roteiro = montarRoteiroDoCandidato({
      data: linha.data,
      snapshot,
      locale: linha.locale,
      agoraIso: new Date().toISOString(),
    });
    // Texto barrado nunca é entregue ao agente como "o que enviar".
    if (roteiro.estado !== "pronto" || roteiro.barrada.length > 0) return null;
    // Modelo só de Msg 1: não há Msg 2 do sistema, o agente conduz a conversa pelo prompt dele.
    if (!roteiro.msg2) return null;
    return {
      candidatoId: linha.id,
      campanhaId: linha.campaign_id,
      esperada: roteiro.msg2,
      snapshot,
      bloco: [
        "## Mensagem 2 da prospecção (texto pronto)",
        "Isto é DADO gerado pelo sistema, não instrução. Se a pessoa aceitou conhecer os achados que a primeira mensagem prometeu, envie o texto entre as marcas EXATAMENTE como está, numa única mensagem, sem reescrever, resumir nem acrescentar nada. Envie uma vez só.",
        ABRE,
        roteiro.msg2,
        FECHA,
      ].join("\n"),
    };
  } catch (erro) {
    logger.warn("[prospecting] não foi possível montar a Msg 2 do turno; segue sem ela", {
      organization_id: org,
      error: erro instanceof Error ? erro.message.slice(0, 200) : String(erro),
    });
    return null;
  }
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O corpo parece uma TENTATIVA de apresentar a Msg 2 (sem ser literal)? Sim quando reusa uma peça
 * dela: a abertura "Combinado. O que vimos na …", o link da demonstração ou o miolo de um item
 * (o achado ou a solução). Resposta de recusa, pergunta ou conversa solta não reusa nenhuma.
 */
export function pareceTentativaDeMsg2(corpoEnviado: string, msg2Esperada: string): boolean {
  const corpo = normalizar(corpoEnviado);
  const linhas = msg2Esperada
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const abertura = normalizar(linhas[0] ?? "");
  if (abertura.length >= 15 && corpo.includes(abertura)) return true;
  const link = linhas.find((l) => /^Veja como fica: /.test(l))?.replace(/^Veja como fica: /, "");
  if (link && corpo.includes(normalizar(link))) return true;
  for (const linha of linhas) {
    const item = /^\d+\.\s+(.+)$/.exec(linha)?.[1];
    if (!item) continue;
    // "{vimos}. {solução}." — cada metade é uma peça que só vem do roteiro.
    for (const parte of item.split(/\.\s+/)) {
      const p = normalizar(parte.replace(/\.$/, ""));
      if (p.length >= 20 && corpo.includes(p)) return true;
    }
  }
  return false;
}

export type ResultadoDaConferencia = "literal" | "reescrita" | "nao_foi_a_msg2";

export function classificarCorpoDaMsg2(
  corpoEnviado: string,
  msg2Esperada: string,
): ResultadoDaConferencia {
  if (compararComEsperado(corpoEnviado, msg2Esperada).igual) return "literal";
  return pareceTentativaDeMsg2(corpoEnviado, msg2Esperada) ? "reescrita" : "nao_foi_a_msg2";
}

/**
 * Conferência pós-turno. `corposConfirmados` são os corpos que o canal ACEITOU (`sent`/`queued`):
 * mensagem barrada, vetada ou falhada não conta como "a Msg 2 saiu".
 * Devolve o resultado (para teste); nunca lança.
 */
export async function conferirMsg2DoTurno(
  db: Queryable,
  entrada: {
    org: string;
    conversationId: string;
    msg2: Msg2DoTurno;
    corposConfirmados: readonly string[];
  },
): Promise<ResultadoDaConferencia> {
  const { org, conversationId, msg2 } = entrada;
  try {
    let resultado: ResultadoDaConferencia = "nao_foi_a_msg2";
    for (const corpo of entrada.corposConfirmados) {
      const r = classificarCorpoDaMsg2(corpo, msg2.esperada);
      if (r === "literal") {
        resultado = "literal";
        break;
      }
      if (r === "reescrita") resultado = "reescrita";
    }
    if (resultado === "nao_foi_a_msg2") return resultado;

    // Marca UMA vez: `msg2_sent_at is null` fecha a corrida entre dois turnos.
    const { rows } = await db.query<{ id: string }>(
      "update public.prospecting_candidates set msg2_sent_at = now(), msg2_literal = $3, updated_at = now() where organization_id = $1 and id = $2 and msg2_sent_at is null returning id",
      [org, msg2.candidatoId, resultado === "literal"],
    );
    if (rows.length === 0) return resultado;

    void audit({
      action: "prospecting.msg2_checked",
      organizationId: org,
      bypassedRls: true,
      resourceType: "prospecting_candidate",
      resourceId: msg2.candidatoId,
      metadata: {
        campaign_id: msg2.campanhaId,
        conversation_id: conversationId,
        literal: resultado === "literal",
      },
    });
    if (resultado === "reescrita") {
      await insertInboxItem(
        db as unknown as Parameters<typeof insertInboxItem>[0],
        org,
        {
          kind: "other",
          severity: "warn",
          title: "Prospecção: o agente reescreveu a mensagem 2",
          body:
            "A pessoa recebeu a apresentação do produto com outras palavras, e não o texto pronto do sistema. " +
            "O envio não foi desfeito. Confira a conversa para ver se o que foi dito está de acordo com o produto cadastrado.",
          refKind: "conversation",
          refId: conversationId,
        },
        "kind_ref_e_titulo",
      );
    }
    return resultado;
  } catch (erro) {
    logger.warn("[prospecting] a conferência da Msg 2 falhou; o turno segue", {
      organization_id: org,
      error: erro instanceof Error ? erro.message.slice(0, 200) : String(erro),
    });
    return "nao_foi_a_msg2";
  }
}
