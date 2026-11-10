import type { CodigoDeAchado } from "./schema";

/**
 * Como a tela de produtos chama cada achado da auditoria, em português de quem
 * vende (sem o código técnico). `Record<CodigoDeAchado, …>` faz o compilador
 * reprovar código novo sem rótulo; o teste cobre a outra ponta (rótulo vazio).
 * Client-safe.
 */
export const ROTULO_DO_ACHADO: Record<CodigoDeAchado, string> = {
  agregador: "Só aparece em diretório ou rede social (sem site próprio)",
  "sem-site": "Não tem site",
  "ssl-invalido": "Site com certificado de segurança inválido",
  "fora-do-ar": "Site fora do ar",
  "dns-morto": "O endereço do site não existe mais",
  "sem-https": "Site sem cadeado de segurança",
  "http-sem-redirecionar": "Site abre sem cadeado e não leva para a versão segura",
  "conteudo-misto": "Site com cadeado, mas com itens sem segurança",
  "nao-mobile": "Site que não se ajusta ao celular",
  lento: "Site lento para abrir",
  "quase-vazia": "Página quase vazia",
  "sem-atualizacao": "Site sem atualização há anos",
  "erro-http": "Site que abre com erro",
  "construtor-pronto": "Site feito em construtor genérico",
  "plataforma-de-pedidos": "Cardápio numa plataforma de pedidos de terceiros (sem site próprio)",
};
