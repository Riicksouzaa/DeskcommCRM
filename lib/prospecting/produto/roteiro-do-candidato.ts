import {
  ACHADOS,
  avaliarCandidatoParaProduto,
  type VereditoDoCandidato,
} from "@/lib/prospecting/produto/achados-da-empresa";
import {
  comRodape,
  marcadoresSemValor,
  modeloUsaAchado,
  renderizarModelo,
  validarModelo,
} from "@/lib/prospecting/produto/modelo";
import {
  LIMITE_VIMOS_CURTO,
  MAXIMO_ACHADOS_NA_MSG2,
  limitarSemCortarPalavra,
  montarMensagem1,
  montarMensagem2,
  semPontoFinal,
  solucaoDe,
  validarTexto,
  type AchadoDaEmpresa,
  type ContextoDaMensagem,
  type ProdutoDoRoteiro,
} from "@/lib/prospecting/produto/roteiro";
import { produtoDoRoteiro, type ProdutoSnapshot } from "@/lib/prospecting/produto/snapshot";
import type { DadosComSite } from "@/lib/prospecting/site-efetivo";

/**
 * O ROTEIRO DE UM CANDIDATO — a morada ÚNICA de "o que esta empresa recebe".
 *
 * Quem monta Msg 1 e Msg 2 do candidato é esta função, e só ela: o worker (o
 * que SAI), o contexto do agente (a Msg 2 que ele manda literal), a prévia da
 * tela e a rota de prévia chamam a mesma coisa. É isso que faz a "prova em par"
 * (DoD 12) valer: tela e envio não têm como divergir, porque não têm dois
 * autores. Pura, client-safe: nenhum banco, nenhuma IA.
 */

export interface EntradaDoRoteiro {
  /** `prospecting_candidates.data`: o nome da empresa e a auditoria do site. */
  data: DadosComSite & { name: string };
  snapshot: ProdutoSnapshot;
  /** `organizations.locale`: decide a palavra do rodapé de saída. */
  locale: string | null;
  agoraIso: string;
}

export type RoteiroDoCandidato =
  | { estado: "pendente"; motivo: string }
  | { estado: "inelegivel"; motivo: string }
  | {
      estado: "pronto";
      msg1: string;
      /** Vazio = esta campanha não tem Msg 2 do sistema (modelo só de Msg 1). */
      msg2: string;
      critico: AchadoDaEmpresa | null;
      /** Os achados que a Msg 2 lista (até 3, citáveis, com solução). */
      citaveisComSolucao: AchadoDaEmpresa[];
      /** Vazio = o texto pode sair. Preenchido = barrado (proibição, emoji, rodapé). */
      barrada: string[];
    };

/** Pictograma, bandeira, ZWJ, seletor de variação, keycap: nome de negócio vem cheio disto. */
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu;

/**
 * O nome do negócio é DADO DE TERCEIRO: entra na mensagem, mas sem emoji (a
 * regra PR-07 vale para o texto inteiro, e o nome é o único pedaço que o
 * operador não escreveu) e numa linha só.
 */
export function nomeLimpoDaEmpresa(nome: string): string {
  const limpo = nome.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  return limpo.length > 0 ? limpo : "sua empresa";
}

/**
 * As mensagens a partir dos MODELOS do produto (modelo.ts). `achado` é o crítico medido da
 * empresa, ou `null` quando o modelo não usa achado. O rodapé de saída é sempre do sistema.
 */
function montarDoModelo(
  snapshot: ProdutoSnapshot,
  produto: ProdutoDoRoteiro,
  nome: string,
  achado: AchadoDaEmpresa | null,
  locale: string | null,
): { msg1: string; msg2: string } {
  const frase = achado ? semPontoFinal(limitarSemCortarPalavra(achado.vimos_curto, LIMITE_VIMOS_CURTO)) : "";
  const solucao = achado ? semPontoFinal(solucaoDe(produto, achado.codigo) ?? "") : "";
  const valores = {
    empresa: nome,
    contato: nome,
    assina: snapshot.assina,
    produto: snapshot.nome,
    resumo: snapshot.resumo,
    link_demo: snapshot.link_demo,
    prova: snapshot.prova,
    achado: frase,
    solucao,
  };
  const m1 = snapshot.mensagem_1?.trim() ?? "";
  const m2 = snapshot.mensagem_2?.trim() ?? "";
  return {
    msg1: comRodape(renderizarModelo(m1, valores), locale),
    msg2: m2 ? comRodape(renderizarModelo(m2, valores), locale) : "",
  };
}

export function montarRoteiroDoCandidato(entrada: EntradaDoRoteiro): RoteiroDoCandidato {
  const { data, snapshot, locale, agoraIso } = entrada;
  const produto = produtoDoRoteiro(snapshot);
  const veredito: VereditoDoCandidato = avaliarCandidatoParaProduto(data, produto, agoraIso);
  if (veredito.estado !== "elegivel") return { estado: veredito.estado, motivo: veredito.motivo };

  const nome = nomeLimpoDaEmpresa(data.name);
  if (snapshot.mensagem_1?.trim()) {
    const { msg1, msg2 } = montarDoModelo(snapshot, produto, nome, veredito.critico, locale);
    const barrada: string[] = [];
    for (const [rotulo, texto] of [
      ["Mensagem 1", msg1],
      ["Mensagem 2", msg2],
    ] as const) {
      if (!texto) continue;
      const v = validarTexto(texto, produto, locale);
      if (!v.ok) for (const m of v.motivos) barrada.push(`${rotulo}: ${m}`);
    }
    return {
      estado: "pronto",
      msg1,
      msg2,
      critico: veredito.critico,
      citaveisComSolucao: veredito.citaveisComSolucao.slice(0, MAXIMO_ACHADOS_NA_MSG2),
      barrada,
    };
  }
  if (veredito.critico === null) return { estado: "inelegivel", motivo: "Sem achado para o produto." };
  const ctx: ContextoDaMensagem = {
    // Não há nome de pessoa na ficha (o contato é a empresa): o cumprimento usa o nome do negócio.
    contato: nome,
    assina: snapshot.assina,
    empresa: nome,
    produto,
    achados: veredito.achados,
    locale,
  };
  const msg1 = montarMensagem1(ctx);
  const msg2 = montarMensagem2(ctx);
  const barrada: string[] = [];
  for (const [rotulo, texto] of [
    ["Mensagem 1", msg1],
    ["Mensagem 2", msg2],
  ] as const) {
    const v = validarTexto(texto, produto, locale);
    if (!v.ok) for (const m of v.motivos) barrada.push(`${rotulo}: ${m}`);
  }
  return {
    estado: "pronto",
    msg1,
    msg2,
    critico: veredito.critico,
    citaveisComSolucao: veredito.citaveisComSolucao.slice(0, MAXIMO_ACHADOS_NA_MSG2),
    barrada,
  };
}

/**
 * Confere os TEXTOS DO PRODUTO antes de a campanha começar (na ativação).
 *
 * O defeito que mais se repete é o do produto, não o da empresa: uma proibição
 * que casa com o próprio nome ou resumo, um emoji colado na prova. Esse defeito
 * barraria TODO candidato, um por minuto, até esvaziar a fila. Aqui se monta uma
 * Msg 1 e uma Msg 2 de exemplo para cada solução cadastrada e se aplica a
 * mesma validação do envio; qualquer motivo recusa a ativação, com o texto do
 * motivo para a pessoa corrigir o produto.
 */
export function conferirProdutoParaCampanha(
  snapshot: ProdutoSnapshot,
  locale: string | null,
): string[] {
  const produto = produtoDoRoteiro(snapshot);
  const motivos = new Set<string>();
  const m1 = snapshot.mensagem_1?.trim();
  if (m1) {
    // MODELOS do produto (modelo.ts): confere marcador inexistente, dado que falta (link, prova) e
    // aplica a validação do envio num exemplo — sem achado se o modelo não usa, com um por solução se usa.
    const m2 = snapshot.mensagem_2?.trim() ?? "";
    for (const texto of [m1, m2]) {
      if (!texto) continue;
      for (const motivo of validarModelo(texto)) motivos.add(motivo);
      for (const motivo of marcadoresSemValor(texto, snapshot)) motivos.add(motivo);
    }
    if (motivos.size > 0) return [...motivos];
    const precisaAchado = modeloUsaAchado(m1) || modeloUsaAchado(m2);
    const exemplos: Array<AchadoDaEmpresa | null> = [];
    if (precisaAchado) {
      for (const codigo of Object.keys(snapshot.solucoes).filter((c) => Object.hasOwn(ACHADOS, c))) {
        const base = ACHADOS[codigo as keyof typeof ACHADOS];
        exemplos.push({ codigo, vimos_curto: base.vimos_curto, peso: base.peso, citavel: true });
      }
      if (exemplos.length === 0)
        return ["O texto usa {achado} ou {solucao}, mas o produto não tem nenhuma solução cadastrada."];
    } else {
      exemplos.push(null);
    }
    for (const achado of exemplos) {
      const { msg1, msg2 } = montarDoModelo(snapshot, produto, "Empresa Exemplo", achado, locale);
      for (const texto of [msg1, msg2]) {
        if (!texto) continue;
        const v = validarTexto(texto, produto, locale);
        if (!v.ok) for (const m of v.motivos) motivos.add(m);
      }
    }
    return [...motivos];
  }
  const codigos = Object.keys(snapshot.solucoes).filter((c) => Object.hasOwn(ACHADOS, c));
  if (codigos.length === 0)
    return ["O produto não tem nenhuma solução cadastrada para os achados que a auditoria mede."];
  for (const codigo of codigos) {
    const achado: AchadoDaEmpresa = {
      codigo,
      vimos_curto: ACHADOS[codigo as keyof typeof ACHADOS].vimos_curto,
      peso: ACHADOS[codigo as keyof typeof ACHADOS].peso,
      citavel: true,
    };
    const ctx: ContextoDaMensagem = {
      contato: "Empresa Exemplo",
      assina: snapshot.assina,
      empresa: "Empresa Exemplo",
      produto,
      achados: [achado],
      locale,
    };
    for (const texto of [montarMensagem1(ctx), montarMensagem2(ctx)]) {
      const v = validarTexto(texto, produto, locale);
      if (!v.ok) for (const m of v.motivos) motivos.add(m);
    }
  }
  return [...motivos];
}
