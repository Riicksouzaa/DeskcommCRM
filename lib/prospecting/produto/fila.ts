import { insertInboxItem } from "@/lib/agent-engine/db/repository";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { audit } from "@/lib/audit";
import { avaliarCandidatoParaProduto } from "@/lib/prospecting/produto/achados-da-empresa";
import { produtoDoRoteiro, type ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";
import type { Candidate } from "@/lib/prospecting/store";

/**
 * A FILA DA CAMPANHA COM PRODUTO (PX-04) e o BLOQUEIO DO TEXTO BARRADO (PX-05).
 *
 * Toda consulta filtra `organization_id` (a do job, nunca a do corpo).
 */

/** Quantos queued se examinam por consulta: o envio é 1 por vez, isto só pula o inelegível. */
const LOTE = 100;
/** Quantas rodadas de lote no máximo por tick (cada uma, 100 linhas). */
const RODADAS_MAXIMAS = 5;

export interface ProximoDaFila {
  candidato: Candidate | null;
  /** Há `queued` que espera a auditoria: a campanha NÃO está concluída, só sem o que enviar agora. */
  haPendentes: boolean;
  /** Quantos foram para "Não abordado" nesta chamada, por não terem achado com solução. */
  puladas: number;
}

/**
 * O próximo candidato a ENVIAR numa campanha com produto: o primeiro `queued` (mesma ordem de
 * sempre) que seja ELEGÍVEL — 1 achado citável com solução (D2 = A).
 *
 * - inelegível: vai a `skipped` com o motivo em `error` (é o campo que a tela de candidatos já
 *   mostra em "Não abordado"), sem tentativa nem cota queimada;
 * - pendente (auditoria do site ainda não terminou): continua `queued`, e o envio segue para o
 *   próximo. Nunca é abordado sem achado e nunca é descartado por demora do preparo.
 */
export async function proximoDaFilaDoProduto(
  db: Queryable,
  org: string,
  campaignId: string,
  snapshot: ProdutoSnapshot,
  agoraIso: string,
): Promise<ProximoDaFila> {
  const produto = produtoDoRoteiro(snapshot);
  let puladas = 0;
  let haPendentes = false;
  // Os inelegíveis SAEM de "queued" ao serem pulados; só os pendentes ficam e precisam ser saltados.
  let pendentesVistos = 0;
  for (let rodada = 0; rodada < RODADAS_MAXIMAS; rodada++) {
    const { rows } = await db.query<Candidate>(
      "select * from public.prospecting_candidates where organization_id=$1 and campaign_id=$2 and status='queued' order by created_at,id limit $3 offset $4",
      [org, campaignId, LOTE, pendentesVistos],
    );
    for (const c of rows) {
      const v = avaliarCandidatoParaProduto(c.data, produto, agoraIso);
      if (v.estado === "elegivel") return { candidato: c, haPendentes, puladas };
      if (v.estado === "pendente") {
        haPendentes = true;
        pendentesVistos++;
        continue;
      }
      await db.query(
        "update public.prospecting_candidates set status='skipped', error=$3, updated_at=now() where organization_id=$1 and id=$2 and status='queued'",
        [org, c.id, v.motivo],
      );
      puladas++;
    }
    if (rows.length < LOTE) break;
  }
  return { candidato: null, haPendentes, puladas };
}

/** Prefixo do motivo gravado em `error` do candidato barrado. */
export const PREFIXO_BARRADA = "Mensagem barrada antes do envio: ";

/**
 * Registra um texto barrado: o candidato vai a falha com o motivo (nada saiu), o aviso entra na
 * Central (UM por campanha enquanto aberto) e a trilha audita.
 *
 * Não pausa a campanha: o defeito do PRODUTO (proibição que casa com o próprio texto, emoji) é
 * recusado na ativação (`conferirProdutoParaCampanha`), então o que chega aqui é da EMPRESA — por
 * exemplo, o nome do negócio que contém um termo proibido. Falha do candidato, como todas as outras.
 */
export async function registrarMensagemBarrada(
  db: Queryable,
  entrada: {
    org: string;
    campaignId: string;
    campaignName: string;
    candidateId: string;
    conversationId: string | null;
    motivos: string[];
  },
): Promise<void> {
  const motivo = `${PREFIXO_BARRADA}${entrada.motivos.join(" ")}`.slice(0, 500);
  await db.query(
    "update public.prospecting_candidates set status='failed', error=$3, updated_at=now() where organization_id=$1 and id=$2 and status in ('queued','sending')",
    [entrada.org, entrada.candidateId, motivo],
  );
  // Aviso na Central: nunca derruba o fluxo. Sem ref (o defeito é da campanha/produto, não de uma
  // conversa) — assim o índice único por título fecha a corrida no banco.
  try {
    await insertInboxItem(
      db as unknown as Parameters<typeof insertInboxItem>[0],
      entrada.org,
      {
        kind: "other",
        severity: "warn",
        title: `Prospecção: mensagem barrada antes do envio (campanha "${entrada.campaignName.slice(0, 80)}")`,
        body:
          `O texto montado para uma empresa foi barrado e NADA foi enviado a ela. Motivo: ${entrada.motivos.join(" ")} ` +
          "Confira o nome desta empresa e os termos proibidos do produto. A campanha segue com as próximas empresas.",
      },
      "kind_e_titulo",
    );
  } catch {
    // aviso best-effort; o candidato já está marcado e a trilha abaixo registra
  }
  void audit({
    action: "prospecting.message_blocked",
    organizationId: entrada.org,
    bypassedRls: true,
    resourceType: "prospecting_candidate",
    resourceId: entrada.candidateId,
    metadata: {
      campaign_id: entrada.campaignId,
      conversation_id: entrada.conversationId,
      reasons: entrada.motivos,
    },
  });
}
