import { rodapeDeSaida } from "@/lib/prospecting/rodape-de-saida";

/**
 * MODELOS DE MENSAGEM DO PRODUTO — o texto da Msg 1 e da Msg 2 como DADO.
 *
 * O produto pode trazer o texto das duas mensagens (`mensagem_1`, `mensagem_2`),
 * escrito pela organização na tela de Produtos, com marcadores entre chaves. Sem
 * modelo, vale o roteiro "achado primeiro" de sempre (`roteiro.ts`). Com modelo, mudar
 * o que a campanha diz é editar um produto, nunca um deploy.
 *
 * PURO e client-safe: sem banco, sem rede, sem IA. O rodapé de saída NÃO é escrito
 * pelo autor do modelo: o sistema o acrescenta sempre, com a palavra do detector.
 *
 * Marcadores (todos em uma linha só quando entram no texto):
 *  - `{empresa}` e `{contato}`: o nome do negócio abordado (a ficha não tem nome de pessoa);
 *  - `{assina}`: a voz da campanha; `{produto}`, `{resumo}`, `{link_demo}`, `{prova}`: do produto;
 *  - `{achado}` e `{solucao}`: o achado crítico MEDIDO da empresa e a solução cadastrada para ele.
 *    Só estes dois exigem auditoria: um modelo que não os usa abre a empresa sem achado nenhum.
 */

export const MARCADORES = [
  "empresa",
  "contato",
  "assina",
  "produto",
  "resumo",
  "link_demo",
  "prova",
  "achado",
  "solucao",
] as const;
export type Marcador = (typeof MARCADORES)[number];

export const LIMITE_DO_MODELO = 1200;

const PADRAO = /\{([^{}\s]*)\}/g;
const CONHECIDOS = new Set<string>(MARCADORES);

/** Os marcadores que o texto usa, sem repetição, na ordem em que aparecem. */
export function marcadoresDoModelo(texto: string): string[] {
  const vistos: string[] = [];
  for (const m of texto.matchAll(PADRAO)) {
    const nome = m[1] ?? "";
    if (!vistos.includes(nome)) vistos.push(nome);
  }
  return vistos;
}

/** O modelo precisa de um achado MEDIDO da empresa? Só `{achado}` e `{solucao}` dependem da auditoria. */
export function modeloUsaAchado(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const usados = marcadoresDoModelo(texto);
  return usados.includes("achado") || usados.includes("solucao");
}

/** Motivos, em português, pelos quais o modelo não pode ser salvo. Vazio = válido. */
export function validarModelo(texto: string): string[] {
  const motivos: string[] = [];
  if (texto.trim().length === 0) return ["O texto da mensagem está vazio."];
  if (texto.length > LIMITE_DO_MODELO)
    motivos.push(`O texto passa de ${LIMITE_DO_MODELO} caracteres.`);
  for (const nome of marcadoresDoModelo(texto)) {
    if (!CONHECIDOS.has(nome))
      motivos.push(
        `O marcador {${nome}} não existe. Use: ${MARCADORES.map((m) => `{${m}}`).join(", ")}.`,
      );
  }
  // Chave que sobrou depois de tirar os marcadores inteiros: "{empresa" ou "}" solto.
  if (/[{}]/.test(texto.replace(PADRAO, ""))) motivos.push("Há uma chave { ou } sem par no texto.");
  return motivos;
}

function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Troca os marcadores pelos valores. Valor em branco some do texto; três quebras seguidas
 * viram duas, para um marcador vazio não deixar buraco. Marcador desconhecido fica como está
 * (o `validarModelo` já o recusou ao salvar; aqui não se inventa nada).
 */
export function renderizarModelo(
  texto: string,
  valores: Partial<Record<Marcador, string | null | undefined>>,
): string {
  const trocado = texto.replace(PADRAO, (inteiro, nome: string) => {
    if (!CONHECIDOS.has(nome)) return inteiro;
    return umaLinha(valores[nome as Marcador] ?? "");
  });
  return trocado
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** O texto do modelo com o rodapé de saída do detector. Sempre acrescentado pelo sistema. */
export function comRodape(texto: string, locale?: string | null): string {
  return `${texto}\n\n${rodapeDeSaida(locale)}`;
}

/**
 * Marcadores que o modelo usa e para os quais o produto não tem valor. Barra a ativação com o
 * motivo escrito, em vez de mandar "Veja um exemplo: " sem o link a 20 empresas.
 */
export function marcadoresSemValor(
  texto: string,
  produto: { link_demo?: string | null; prova?: string | null },
): string[] {
  const usados = marcadoresDoModelo(texto);
  const faltam: string[] = [];
  if (usados.includes("link_demo") && !umaLinha(produto.link_demo ?? ""))
    faltam.push("O texto usa {link_demo}, mas o produto não tem link da demonstração.");
  if (usados.includes("prova") && !umaLinha(produto.prova ?? ""))
    faltam.push('O texto usa {prova}, mas o produto não tem o campo "O que você oferece".');
  return faltam;
}
