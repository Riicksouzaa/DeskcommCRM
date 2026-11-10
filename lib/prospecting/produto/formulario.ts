import { CODIGOS_DE_ACHADO, type ProdutoDaProspeccao } from "./schema";

/**
 * Lógica pura do formulário de produto (client-safe): estado da tela <-> corpo da API.
 */

export interface FormularioDoProduto {
  nome: string;
  categoria: string;
  resumo: string;
  assina: string;
  linkDemo: string;
  prova: string;
  /** Um termo por linha (vírgula e ponto e vírgula também separam). */
  proibicoes: string;
  /** Código de achado -> frase. Código ausente = linha vazia. */
  solucoes: Record<string, string>;
}

export const FORMULARIO_VAZIO: FormularioDoProduto = {
  nome: "",
  categoria: "",
  resumo: "",
  assina: "",
  linkDemo: "",
  prova: "",
  proibicoes: "",
  solucoes: {},
};

export function formularioDoProduto(p: ProdutoDaProspeccao): FormularioDoProduto {
  return {
    nome: p.nome,
    categoria: p.categoria,
    resumo: p.resumo,
    assina: p.assina ?? "",
    linkDemo: p.link_demo ?? "",
    prova: p.prova ?? "",
    proibicoes: p.proibicoes.join("\n"),
    solucoes: { ...p.solucoes },
  };
}

export function termosDeProibicao(texto: string): string[] {
  return texto
    .split(/[\n,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Corpo para POST/PATCH. Linhas de solução vazias não vão; campo opcional vazio vai `null` (limpa). */
export function corpoDoProduto(f: FormularioDoProduto) {
  const solucoes: Record<string, string> = {};
  for (const codigo of CODIGOS_DE_ACHADO) {
    const frase = (f.solucoes[codigo] ?? "").trim();
    if (frase) solucoes[codigo] = frase;
  }
  return {
    nome: f.nome.trim(),
    categoria: f.categoria.trim(),
    resumo: f.resumo.trim(),
    assina: f.assina.trim() || null,
    link_demo: f.linkDemo.trim() || null,
    prova: f.prova.trim() || null,
    proibicoes: termosDeProibicao(f.proibicoes),
    solucoes,
  };
}

type Traduz = (texto: string) => string;

/** Erro da API em frase humana. `detalhes` é `error.details` (campo -> mensagens). */
export function mensagemDeErroDoProduto(
  status: number,
  detalhes: Record<string, unknown> | undefined,
  t: Traduz = (x) => x,
): string {
  if (status === 409) return t("Já existe um produto com esse nome. Escolha outro nome.");
  if (status === 403) return t("Você não tem permissão para alterar produtos.");
  if (status === 404) return t("Este produto não existe mais. Atualize a lista.");
  if (status === 422) {
    const nomes: Record<string, string> = {
      nome: t("Nome"),
      categoria: t("Categoria"),
      resumo: t("Resumo"),
      assina: t("Quem assina a campanha"),
      link_demo: t("Link da demonstração"),
      prova: t("O que você oferece"),
      proibicoes: t("Termos proibidos"),
      solucoes: t("Problema encontrado → como você resolve"),
    };
    const campos = Object.keys(detalhes ?? {}).map((c) => nomes[c] ?? c);
    return campos.length
      ? t("Confira estes campos: {campos}.").replace("{campos}", campos.join(", "))
      : t("Confira os campos do formulário.");
  }
  return t("Não foi possível salvar agora. Tente de novo em instantes.");
}
