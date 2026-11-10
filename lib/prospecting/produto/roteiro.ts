import { rodapeDeSaida, temSaida } from "@/lib/prospecting/rodape-de-saida";

/**
 * O ROTEIRO "achado primeiro, solução depois" — módulo PURO.
 *
 * Spec: docs/superpowers/specs/2026-11-10-prospeccao-produto-da-campanha-design.md
 * (§4 roteiro, §6 honestidade, PX-04 e PX-05, decisões D1 = A, D2 = A, D4 = A).
 *
 * Sem banco, sem rede, sem IA: mesmo insumo, mesma saída. Os tipos são
 * ESTRUTURAIS e próprios — o schema Zod do produto mora em outro módulo e este
 * não o importa.
 *
 * ## A regra que sustenta tudo (§6.1)
 *
 * Achado NÃO citável (`citavel: false`, isto é, não medido ou provisório, ver
 * `citavelNoArgumento` em site-classify.ts) ou SEM solução cadastrada nunca
 * aparece em mensagem. Isso é garantido em UM lugar, `achadosUsaveis`, e todas
 * as saídas (crítico, elegibilidade, Msg 1, Msg 2) passam por ele.
 */

export interface ProdutoDoRoteiro {
  nome: string;
  resumo: string;
  /** código do achado -> como o produto resolve (texto da organização). */
  solucoes: Record<string, string>;
  prova?: string | null;
  link_demo?: string | null;
  proibicoes: string[];
}

export interface AchadoDaEmpresa {
  codigo: string;
  /** frase "o que vimos", do catálogo. */
  vimos_curto: string;
  peso: number;
  /** `citavelNoArgumento` já resolvido por quem monta o achado. */
  citavel: boolean;
}

/** Limite da frase do achado dentro da mensagem (§4.2). */
export const LIMITE_VIMOS_CURTO = 140;
/** Máximo de achados listados na Msg 2 (§4.3). */
export const MAXIMO_ACHADOS_NA_MSG2 = 3;

// ─── utilidades ──────────────────────────────────────────────────────────────

/** Uma linha só: quebra de linha em dado de terceiro não pode criar linha nova na mensagem. */
function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function semPontoFinal(texto: string): string {
  return texto.replace(/[\s.]+$/u, "");
}

function solucaoDe(produto: ProdutoDoRoteiro, codigo: string): string | null {
  // `hasOwn`: um código "constructor" ou "__proto__" não pode herdar solução do protótipo.
  if (!Object.prototype.hasOwnProperty.call(produto.solucoes, codigo)) return null;
  const s = umaLinha(produto.solucoes[codigo] ?? "");
  return s.length > 0 ? s : null;
}

/**
 * Corta em `limite` caracteres sem partir palavra. Se cortou, termina com "..."
 * (as reticências contam dentro do limite). Palavra única maior que o limite é
 * cortada seca: melhor que devolver vazio.
 */
export function limitarSemCortarPalavra(
  texto: string,
  limite: number = LIMITE_VIMOS_CURTO,
): string {
  const t = umaLinha(texto);
  const pontos = Array.from(t);
  if (pontos.length <= limite) return t;
  const reserva = limite - 3;
  const corte = pontos.slice(0, reserva).join("");
  // Se o caractere seguinte ao corte é espaço, o corte já caiu entre palavras.
  const proximo = pontos[reserva] ?? "";
  let base = corte;
  if (!/\s/u.test(proximo)) {
    const ultimoEspaco = corte.search(/\s\S*$/u);
    if (ultimoEspaco > 0) base = corte.slice(0, ultimoEspaco);
  }
  base = base.replace(/[\s.,;:!?\-–—]+$/u, "");
  return `${base}...`;
}

interface AchadoUsavel {
  achado: AchadoDaEmpresa;
  solucao: string;
  ordem: number;
}

/**
 * ÚNICO filtro de honestidade: citável E com solução cadastrada, ordenado por
 * peso decrescente; empate pela ordem de entrada (estável, reprodutível). Código
 * repetido conta uma vez só (vale o primeiro da entrada).
 */
function achadosUsaveis(
  achados: readonly AchadoDaEmpresa[],
  produto: ProdutoDoRoteiro,
): AchadoUsavel[] {
  const vistos = new Set<string>();
  const usaveis: AchadoUsavel[] = [];
  achados.forEach((achado, ordem) => {
    if (achado.citavel !== true) return;
    if (vistos.has(achado.codigo)) return;
    const solucao = solucaoDe(produto, achado.codigo);
    if (solucao === null) return;
    if (umaLinha(achado.vimos_curto).length === 0) return; // sem frase não há o que citar
    vistos.add(achado.codigo);
    usaveis.push({ achado, solucao, ordem });
  });
  return usaveis.sort((a, b) => b.achado.peso - a.achado.peso || a.ordem - b.ordem);
}

// ─── 1. achado crítico ───────────────────────────────────────────────────────

/** O citável de maior peso que tenha solução; empate -> o que veio primeiro. `null` se nenhum. */
export function escolherAchadoCritico(
  achados: readonly AchadoDaEmpresa[],
  produto: ProdutoDoRoteiro,
): AchadoDaEmpresa | null {
  return achadosUsaveis(achados, produto)[0]?.achado ?? null;
}

// ─── 2. elegibilidade ────────────────────────────────────────────────────────

export type Elegibilidade =
  | { elegivel: true; critico: AchadoDaEmpresa; citaveisComSolucao: AchadoDaEmpresa[] }
  | { elegivel: false; motivo: string };

/** D2 = A: 1 achado citável com solução basta. O motivo é legível para a tela. */
export function elegibilidade(
  achados: readonly AchadoDaEmpresa[],
  produto: ProdutoDoRoteiro,
): Elegibilidade {
  if (Object.keys(produto.solucoes).length === 0) {
    return { elegivel: false, motivo: "O produto não tem soluções cadastradas." };
  }
  const usaveis = achadosUsaveis(achados, produto);
  if (usaveis.length > 0) {
    return {
      elegivel: true,
      critico: usaveis[0]!.achado,
      citaveisComSolucao: usaveis.map((u) => u.achado),
    };
  }
  const haCitavel = achados.some((a) => a.citavel === true);
  return haCitavel
    ? {
        elegivel: false,
        motivo: "Há achado citável, mas nenhum tem solução cadastrada no produto.",
      }
    : { elegivel: false, motivo: "Nenhum achado citável (medido e definitivo) para esta empresa." };
}

// ─── 3. mensagens ────────────────────────────────────────────────────────────

export interface ContextoDaMensagem {
  /** Nome de quem recebe. */
  contato: string;
  /** Nome da voz da campanha (ex.: "Dani"). */
  assina: string;
  empresa: string;
  produto: ProdutoDoRoteiro;
  achados: readonly AchadoDaEmpresa[];
  /** Idioma do rodapé de saída; a palavra vem do detector via rodape-de-saida.ts. */
  locale?: string | null;
}

/**
 * Msg 1 (§4.2). LANÇA se a empresa não é elegível: chamar sem checar
 * `elegibilidade` antes seria mandar "analisamos e vimos pontos" sem achado.
 *
 * O fecho é `rodapeDeSaida(locale)` — o rodapé canônico verificado contra o
 * detector — e não uma frase própria: assim `temSaida`/`comSaida` reconhecem o
 * texto e o rodapé nunca duplica.
 */
export function montarMensagem1(ctx: ContextoDaMensagem): string {
  const usaveis = achadosUsaveis(ctx.achados, ctx.produto);
  const critico = usaveis[0]?.achado;
  if (!critico) {
    throw new Error(
      "montarMensagem1: empresa sem achado citável com solução; cheque elegibilidade() antes.",
    );
  }
  const achado = semPontoFinal(limitarSemCortarPalavra(critico.vimos_curto));
  // UM achado só: "vimos pontos", "um deles" e "os outros" seriam falsos — a Msg 2 não teria
  // outro para mostrar. A honestidade da Msg 1 acompanha o número que a Msg 2 vai mostrar.
  if (usaveis.length === 1) {
    return [
      `Olá, ${umaLinha(ctx.contato)}. Aqui é ${umaLinha(ctx.assina)}, da ${umaLinha(ctx.produto.nome)}.`,
      `Analisamos a presença digital da ${umaLinha(ctx.empresa)} e vimos um ponto que pode estar custando clientes: ${achado}.`,
      "Quer que eu mostre como resolver?",
      "",
      rodapeDeSaida(ctx.locale),
    ].join("\n");
  }
  return [
    `Olá, ${umaLinha(ctx.contato)}. Aqui é ${umaLinha(ctx.assina)}, da ${umaLinha(ctx.produto.nome)}.`,
    `Analisamos a presença digital da ${umaLinha(ctx.empresa)} e vimos pontos que podem estar custando clientes.`,
    `Um deles: ${achado}.`,
    "Quer que eu mostre os outros e como resolver?",
    "",
    rodapeDeSaida(ctx.locale),
  ].join("\n");
}

/** Msg 2 (§4.3): até 3 achados citáveis COM solução, por peso; linhas ausentes somem. LANÇA sem elegibilidade. */
export function montarMensagem2(ctx: ContextoDaMensagem): string {
  const usaveis = achadosUsaveis(ctx.achados, ctx.produto).slice(0, MAXIMO_ACHADOS_NA_MSG2);
  if (usaveis.length === 0) {
    throw new Error(
      "montarMensagem2: empresa sem achado citável com solução; cheque elegibilidade() antes.",
    );
  }
  const itens = usaveis.map(
    (u, i) =>
      `${i + 1}. ${semPontoFinal(limitarSemCortarPalavra(u.achado.vimos_curto))}. ${semPontoFinal(u.solucao)}.`,
  );
  const resumo = umaLinha(ctx.produto.resumo);
  const link = umaLinha(ctx.produto.link_demo ?? "");
  const prova = umaLinha(ctx.produto.prova ?? "");

  const linhas = [`Combinado. O que vimos na ${umaLinha(ctx.empresa)}:`, ...itens];
  if (resumo) linhas.push(resumo);
  if (link) linhas.push(`Veja como fica: ${link}`);
  if (prova) linhas.push(prova);
  linhas.push("Quer que eu te explique como começar?", "", rodapeDeSaida(ctx.locale));
  return linhas.join("\n");
}

// ─── 4. validação do texto ───────────────────────────────────────────────────

export type ValidacaoDeTexto = { ok: true } | { ok: false; motivos: string[] };

/** Qualquer pictograma, seletor de variação, ZWJ, bandeira (indicador regional) e keycap. */
const REGEX_EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/u;

export function contemEmoji(texto: string): boolean {
  return REGEX_EMOJI.test(texto);
}

/** Sem acento, minúsculo, espaços colapsados. */
export function normalizarParaComparar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contemTermoInteiro(textoNormalizado: string, termo: string): boolean {
  const t = normalizarParaComparar(termo);
  if (t.length === 0) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(t)}(?![\\p{L}\\p{N}])`, "u");
  return re.test(textoNormalizado);
}

/**
 * Valida o texto montado ANTES do envio (§6.2): sem emoji, sem termo proibido
 * (palavra inteira, sem acento/caixa) e com o rodapé de saída — o mesmo que
 * `rodape-de-saida.ts` escreve, com a palavra do detector.
 */
export function validarTexto(
  texto: string,
  produto: Pick<ProdutoDoRoteiro, "proibicoes">,
  locale?: string | null,
): ValidacaoDeTexto {
  const motivos: string[] = [];
  if (contemEmoji(texto)) motivos.push("O texto contém emoji.");
  const normal = normalizarParaComparar(texto);
  for (const termo of produto.proibicoes) {
    if (contemTermoInteiro(normal, termo))
      motivos.push(`O texto contém o termo proibido "${termo.trim()}".`);
  }
  if (!temSaida(texto, locale)) motivos.push("O texto não termina com o rodapé de saída.");
  return motivos.length === 0 ? { ok: true } : { ok: false, motivos };
}

// ─── 5. conferência pós-turno (D4) ───────────────────────────────────────────

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** O corpo enviado contém a Msg 2 literal (espaços e quebras normalizados)? */
export function compararComEsperado(
  corpoEnviado: string,
  msg2Esperada: string,
): { igual: boolean } {
  const esperado = normalizarEspacos(msg2Esperada);
  if (esperado.length === 0) return { igual: false };
  return { igual: normalizarEspacos(corpoEnviado).includes(esperado) };
}
