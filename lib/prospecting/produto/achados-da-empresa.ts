import {
  CODIGOS_DE_ACHADO,
  codigoDeAchadoDoProblema,
  type CodigoDeAchado,
} from "@/lib/prospecting/produto/schema";
import {
  elegibilidade,
  type AchadoDaEmpresa,
  type ProdutoDoRoteiro,
} from "@/lib/prospecting/produto/roteiro";
import { modeloUsaAchado } from "@/lib/prospecting/produto/modelo";
import { deveReverificar, siteEfetivo, type DadosComSite } from "@/lib/prospecting/site-efetivo";
import {
  citavelNoArgumento,
  plataformaDePedidos,
  problemasMedidos,
  type ClasseDeSite,
} from "@/lib/prospecting/site-classify";

/**
 * DA AUDITORIA DO CANDIDATO PARA OS ACHADOS DA MENSAGEM (spec §4.1, PX-04).
 *
 * Client-safe e PURO: a tela calcula a elegibilidade com a MESMA função que o
 * envio usa (prova em par tela×envio). Nada de rede, nada de IA.
 *
 * ## A regra de honestidade (§6.1)
 *
 * Só é achado o que foi MEDIDO e está DEFINITIVO (`citavelNoArgumento`, #3723).
 * `falta-*` é melhoria, nunca achado; `nao-medido` e veredito provisório não
 * produzem achado nenhum. Quem decide o que entra numa mensagem é
 * `roteiro.ts` (citável E com solução cadastrada); aqui só se traduz a
 * auditoria em achados.
 *
 * ## A tabela de peso e frase
 *
 * Tipada como `Record<CodigoDeAchado, …>`: código novo no catálogo sem peso e
 * frase NÃO compila. Peso maior = mais grave = vai primeiro (e é o "crítico" da
 * Msg 1). As frases são NOSSAS (nenhum texto de terceiro entra aqui), em
 * português, até 140 caracteres e sem emoji — o teste da tabela cobra os três.
 */
export const ACHADOS: Record<CodigoDeAchado, { peso: number; vimos_curto: string }> = {
  "sem-site": {
    peso: 100,
    vimos_curto:
      "a empresa não tem site próprio: quem procura no Google não encontra um endereço para conhecer",
  },
  "fora-do-ar": {
    peso: 95,
    vimos_curto: "o site não abre quando um cliente tenta acessar",
  },
  "dns-morto": {
    peso: 92,
    // Sem "o domínio expirou": em link de plataforma (loja removida) o domínio é de terceiro.
    vimos_curto: "o endereço do site que aparece no Google não existe mais e não abre",
  },
  "ssl-invalido": {
    peso: 88,
    vimos_curto: "o navegador mostra um alerta de segurança antes de abrir o site",
  },
  "sem-https": {
    peso: 82,
    vimos_curto: "o site aparece como 'não seguro' no navegador, sem cadeado",
  },
  agregador: {
    peso: 80,
    vimos_curto:
      "o endereço que aparece no Google é de rede social ou agregador, não um site próprio",
  },
  "nao-mobile": {
    peso: 76,
    vimos_curto: "o site não abre direito no celular",
  },
  "erro-http": {
    peso: 74,
    vimos_curto: "o site responde com erro ao ser aberto",
  },
  "quase-vazia": {
    peso: 70,
    vimos_curto: "a página do site está praticamente vazia, sem apresentar serviços nem contato",
  },
  "http-sem-redirecionar": {
    peso: 66,
    vimos_curto: "quem chega pelo Google abre o site sem cadeado, embora exista a versão segura",
  },
  lento: {
    peso: 62,
    vimos_curto: "o site demora demais para carregar",
  },
  "conteudo-misto": {
    peso: 58,
    vimos_curto: "o site seguro puxa itens inseguros, e partes da página podem nem carregar",
  },
  "sem-atualizacao": {
    peso: 52,
    vimos_curto: "o site não mostra sinal de atualização há anos",
  },
  "construtor-pronto": {
    peso: 40,
    vimos_curto: "o site foi feito em construtor pronto, com a mesma cara de milhares de outros",
  },
  "plataforma-de-pedidos": {
    peso: 45,
    vimos_curto:
      "o endereço do cardápio no Google leva a uma plataforma de pedidos de terceiros, não a um site com o nome da empresa",
  },
};

/** Classes de auditoria que, sozinhas, SÃO o achado (o resto vem de `problemas`). */
const CLASSES_QUE_SAO_ACHADO: ReadonlySet<ClasseDeSite> = new Set([
  "agregador",
  "sem-site",
  "ssl-invalido",
  "fora-do-ar",
]);

export type AchadosDaEmpresa =
  /** Site na web ainda sem veredito (ou provisório com tentativa por vir): não dá para dizer nada. */
  | { estado: "pendente" }
  /** Veredito lido. `citavel=false` quando provisório / não medido: nenhum achado sai. */
  | { estado: "medido"; achados: AchadoDaEmpresa[]; classe: ClasseDeSite; citavel: boolean };

/**
 * Os achados de uma empresa a partir da auditoria que o candidato já tem.
 * Emitidos na ordem de `CODIGOS_DE_ACHADO` (o desempate do roteiro é a ordem de
 * entrada: mesma auditoria, mesma ordem, mesma mensagem).
 */
export function achadosDaEmpresa(data: DadosComSite, agoraIso: string): AchadosDaEmpresa {
  const site = siteEfetivo(data, agoraIso);
  if (!site) return { estado: "pendente" };
  // Provisório que ainda aceita nova tentativa: o preparo vai olhar de novo, não é veredito.
  if (site.provisorio && deveReverificar(site)) return { estado: "pendente" };
  const citavel = citavelNoArgumento(site);
  // PLATAFORMA DE PEDIDOS DE TERCEIROS: fato do ENDEREÇO, não da página. Vale mesmo com a
  // plataforma barrando a nossa medição (o servidor respondeu, logo a loja existe), mas NÃO com
  // veredito provisório (pode ser queda de rede). Os defeitos medidos NA PÁGINA da plataforma
  // (lento, sem celular, construtor…) são da plataforma, não da pizzaria: nunca viram achado.
  const plataforma = plataformaDePedidos(data.website);
  if (plataforma) {
    // `dns-morto` é problema da classe `fora-do-ar`, não classe própria.
    const lojaSumiu = site.classe === "fora-do-ar";
    if (citavel && lojaSumiu) return achadosDeSiteMedido(site);
    if (site.provisorio) return { estado: "medido", achados: [], classe: site.classe, citavel: false };
    return {
      estado: "medido",
      classe: site.classe,
      citavel: true,
      achados: [
        {
          codigo: "plataforma-de-pedidos",
          vimos_curto: ACHADOS["plataforma-de-pedidos"].vimos_curto,
          peso: ACHADOS["plataforma-de-pedidos"].peso,
          citavel: true,
        },
      ],
    };
  }
  if (!citavel) return { estado: "medido", achados: [], classe: site.classe, citavel: false };
  return achadosDeSiteMedido(site);
}

function achadosDeSiteMedido(site: NonNullable<ReturnType<typeof siteEfetivo>>): AchadosDaEmpresa {
  const codigos = new Set<CodigoDeAchado>();
  if (CLASSES_QUE_SAO_ACHADO.has(site.classe)) codigos.add(site.classe as CodigoDeAchado);
  for (const problema of problemasMedidos(site.problemas)) {
    const codigo = codigoDeAchadoDoProblema(problema);
    if (codigo) codigos.add(codigo);
  }
  // "O endereço não existe" é a versão mais específica de "o site não abre": dizer as duas é repetir.
  if (codigos.has("dns-morto")) codigos.delete("fora-do-ar");

  const achados = CODIGOS_DE_ACHADO.filter((c) => codigos.has(c)).map((codigo) => ({
    codigo,
    vimos_curto: ACHADOS[codigo].vimos_curto,
    peso: ACHADOS[codigo].peso,
    citavel: true,
  }));
  return { estado: "medido", achados, classe: site.classe, citavel: true };
}

export type VereditoDoCandidato =
  | { estado: "pendente"; motivo: string }
  | { estado: "inelegivel"; motivo: string }
  | {
      estado: "elegivel";
      /** `null` quando o modelo do produto abre a empresa sem achado (modelo.ts). */
      critico: AchadoDaEmpresa | null;
      citaveisComSolucao: AchadoDaEmpresa[];
      achados: AchadoDaEmpresa[];
    };

/** Prefixo do motivo gravado em `prospecting_candidates.error` — a tela o mostra em "Não abordado". */
export const PREFIXO_SEM_ACHADO = "Sem achado para o produto: ";

/**
 * D2 = A: UM achado citável com solução basta. `pendente` não é inelegível: a
 * empresa espera a auditoria e é reavaliada (o envio não a pula nem a consome).
 */
export function avaliarCandidatoParaProduto(
  data: DadosComSite,
  produto: ProdutoDoRoteiro,
  agoraIso: string,
): VereditoDoCandidato {
  // MODELO DE MENSAGEM SEM ACHADO (modelo.ts): se nenhum dos textos do produto usa {achado} nem
  // {solucao}, a empresa não depende da auditoria — é elegível agora, mesmo com o site ainda em
  // medição ou barrando a nossa. A auditoria segue rodando (a tela a mostra), só não decide.
  if (
    produto.mensagem_1?.trim() &&
    !modeloUsaAchado(produto.mensagem_1) &&
    !modeloUsaAchado(produto.mensagem_2)
  ) {
    return { estado: "elegivel", critico: null, citaveisComSolucao: [], achados: [] };
  }
  const lidos = achadosDaEmpresa(data, agoraIso);
  if (lidos.estado === "pendente")
    return { estado: "pendente", motivo: "A auditoria do site ainda não terminou." };
  if (!lidos.citavel) {
    return {
      estado: "inelegivel",
      motivo: `${PREFIXO_SEM_ACHADO}a auditoria do site é inconclusiva (não foi possível medir), então não há o que citar.`,
    };
  }
  if (lidos.achados.length === 0) {
    return {
      estado: "inelegivel",
      motivo: `${PREFIXO_SEM_ACHADO}o site não tem defeito medido para citar.`,
    };
  }
  const e = elegibilidade(lidos.achados, produto);
  if (!e.elegivel) return { estado: "inelegivel", motivo: `${PREFIXO_SEM_ACHADO}${e.motivo}` };
  return {
    estado: "elegivel",
    critico: e.critico,
    citaveisComSolucao: e.citaveisComSolucao,
    achados: lidos.achados,
  };
}
