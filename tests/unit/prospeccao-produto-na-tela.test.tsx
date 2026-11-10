import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * O SELETOR "PRODUTO" NA TELA DA CAMPANHA (PX-03/PX-04), no jsdom.
 *
 * O que se prova (a medida de layout e a prova com o navegador de verdade são da prova pela tela):
 *  - o seletor lista os produtos vivos da organização, e sem nenhum manda cadastrar;
 *  - escolher um produto desliga as três ofertas antigas e a escolha de saída, e avisa que a saída
 *    acompanha toda mensagem;
 *  - a tela mostra "com achado / sem achado" e, em cada empresa, a Msg 1 que o envio mandaria
 *    (a mesma `montarRoteiroDoCandidato`) ou o motivo de ela ficar de fora.
 */
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

import { ProspectingClient } from "@/app/app/prospecting/_client";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const CHANNEL = "22222222-2222-4222-8222-222222222222";
const PIPELINE = "33333333-3333-4333-8333-333333333333";
const STAGE = "44444444-4444-4444-8444-444444444444";
const AGENT = "55555555-5555-4555-8555-555555555555";
const PRODUTO = "66666666-6666-4666-8666-666666666666";

const produto = {
  id: PRODUTO,
  nome: "Manero",
  categoria: "cardápio digital",
  resumo: "Cardápio digital para restaurantes.",
  solucoes: { "sem-site": "o cardápio vira uma página própria, com foto e preço" },
  prova: null,
  link_demo: null,
  proibicoes: [],
  assina: "Dani",
  archived_at: null,
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
};

const empresa = (id: string, nome: string, website: string | null) => ({
  id,
  campaign_id: CAMPAIGN,
  status: "queued",
  progress: "queued",
  selected: true,
  message_status: null,
  error: null,
  conversation_id: null,
  data: {
    key: id,
    name: nome,
    category: "Restaurante",
    phone: "+5511999990000",
    address: null,
    website,
    rating: null,
    reviews: 0,
    emails: [],
    socials: [],
  },
});

function estado() {
  return {
    configured: true,
    organization_locale: "pt-BR",
    campaigns: [
      {
        id: CAMPAIGN,
        name: "Restaurantes",
        status: "draft",
        search_status: "succeeded",
        error: null,
        config: null,
        search: { niche: "Restaurante", location: "Sorocaba" },
        result_count: 2,
        skipped_count: 0,
        cost_usd: "0.10",
        next_send_at: "2026-09-16T00:00:00Z",
        channel_session_id: null,
      },
    ],
    candidates: [
      empresa("c-sem-site", "Padaria Central", null),
      // Site na web, auditado e com problema que o produto NÃO resolve.
      {
        ...empresa("c-lento", "Cantina Lenta", "https://cantina.example.com.br"),
        data: {
          ...empresa("c-lento", "Cantina Lenta", "https://cantina.example.com.br").data,
          site: {
            ver: 1,
            classe: "site-ruim",
            problemas: ["lento"],
            checklist: { tem: [], falta: [] },
            final_url: "https://cantina.example.com.br/",
            http_status: 200,
            tempo_ms: 300,
            conteudo_resumo: null,
            pagespeed: null,
            verificado_em: "2026-11-09T12:00:00Z",
            provisorio: false,
            tentativas: 0,
          },
        },
      },
    ],
    agents: [{ id: AGENT, name: "Agente" }],
    channels: [{ id: CHANNEL, display_name: "Comercial", phone_number: null, status: "WORKING" }],
    stages: [{ id: STAGE, name: "Novos", pipeline_id: PIPELINE, pipeline_name: "Comercial" }],
  };
}

function abrir(produtos: unknown[]) {
  api.get.mockImplementation(async (url: string) =>
    url.includes("/prospecting/products") ? { data: produtos } : { data: estado() },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProspectingClient />
    </QueryClientProvider>,
  );
}

async function abrirFormulario() {
  fireEvent.click(await screen.findByText("Usar agente existente / configurar manualmente"));
  const seletor = await screen.findByLabelText("Produto");
  // A lista só é buscada quando o seletor existe (campanha congelada não a pede).
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/v1/prospecting/products"));
  return seletor;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("seletor de produto na campanha", () => {
  it("lista os produtos da organização e escolher um desliga as ofertas e a escolha de saída", async () => {
    abrir([produto]);
    const seletor = (await abrirFormulario()) as HTMLSelectElement;
    expect(await within(seletor).findByRole("option", { name: "Manero" })).toBeInTheDocument();
    expect(screen.getByLabelText("Site profissional")).toBeEnabled();
    expect(screen.getByLabelText(/Na primeira mensagem/)).toBeEnabled();

    fireEvent.change(seletor, { target: { value: PRODUTO } });

    await waitFor(() => expect(screen.getByLabelText("Site profissional")).toBeDisabled());
    expect(screen.getByLabelText("Automação do atendimento (CRM)")).toBeDisabled();
    expect(screen.getByLabelText("Automações e integrações (N8N)")).toBeDisabled();
    expect(screen.getByLabelText(/Na primeira mensagem/)).toBeDisabled();
    expect(screen.getByLabelText(/Atrasar para a 2ª mensagem/)).toBeDisabled();
    expect(screen.getByText(/a saída acompanha toda mensagem:/)).toBeInTheDocument();
    expect(screen.getByText(/A mensagem sai montada pelo sistema/)).toBeInTheDocument();
  });

  it("voltar a 'Nenhum' devolve as ofertas e a escolha de saída", async () => {
    abrir([produto]);
    const seletor = await abrirFormulario();
    await within(seletor).findByRole("option", { name: "Manero" });
    fireEvent.change(seletor, { target: { value: PRODUTO } });
    await waitFor(() => expect(screen.getByLabelText("Site profissional")).toBeDisabled());
    fireEvent.change(seletor, { target: { value: "" } });
    await waitFor(() => expect(screen.getByLabelText("Site profissional")).toBeEnabled());
    expect(screen.getByLabelText(/Na primeira mensagem/)).toBeEnabled();
  });

  it("sem produto cadastrado, manda cadastrar (link para a tela de produtos)", async () => {
    abrir([]);
    await abrirFormulario();
    const link = await screen.findByRole("link", { name: "Cadastrar produto" });
    expect(link).toHaveAttribute("href", "/app/prospecting/produtos");
  });

  it("mostra quem tem achado, quem não tem (com o motivo) e a Msg 1 de quem vai receber", async () => {
    abrir([produto]);
    const seletor = await abrirFormulario();
    fireEvent.change(seletor, { target: { value: PRODUTO } });
    await waitFor(() => expect(screen.getByText(/Com achado para o produto:/)).toBeInTheDocument());
    const resumo = screen.getByText(/Com achado para o produto:/).textContent ?? "";
    expect(resumo).toMatch(/Com achado para o produto: 1/);
    expect(resumo).toMatch(/Sem achado \(não serão abordadas\): 1/);
    // A Msg 1 de quem tem achado (trecho): a abertura montada pelo sistema.
    expect(screen.getByText(/Olá, Padaria Central\. Aqui é Dani, da Manero\./)).toBeInTheDocument();
    // O motivo de quem fica de fora.
    expect(
      screen.getByText(/Sem achado para o produto: Há achado citável, mas nenhum tem solução cadastrada/),
    ).toBeInTheDocument();
  });
});
