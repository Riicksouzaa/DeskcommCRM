/**
 * A PORTA QUE O CONVITE USA QUANDO O GOTRUE ESTÁ FECHADO (#1653).
 *
 * `disable_signup` é a única trava do GoTrue que fecha `POST /auth/v1/signup`
 * para quem tem a anon key — e ela fecha TAMBÉM o convite, porque o convite
 * cria a conta por ali. Este arquivo guarda as duas metades do conserto:
 *
 *   1. `lerConfigPublicaDoGoTrue` — a pergunta pública que decide qual caminho
 *      a server action usa. `null` (rede fora, resposta estranha) não pode virar
 *      nem "aberto" nem "fechado": os dois erros têm vítima diferente.
 *   2. `criarContaDeConvite` — a conta nasce pela admin API (que o
 *      `disable_signup` não alcança) e o e-mail de confirmação sai pelo
 *      `/resend`, do jeito que o fluxo `/auth/confirm` já espera. Se o e-mail
 *      não sair, a conta é APAGADA: este caminho existe para NÃO deixar conta
 *      órfã para trás.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const admin = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  generateLink: vi.fn(),
  resend: vi.fn(),
}));
const email = vi.hoisted(() => ({
  configurado: vi.fn(async () => false),
  enviar: vi.fn(),
  audit: vi.fn(),
  // O que `after()` recebeu: roda só quando o teste mandar, como depois da resposta.
  depois: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: { createUser: admin.createUser, deleteUser: admin.deleteUser, generateLink: admin.generateLink },
    },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void email.depois.push(fn) }));
vi.mock("@/lib/email/roteador", () => ({ emailConfigurado: email.configurado, sendEmail: email.enviar }));
vi.mock("@/lib/audit", () => ({ audit: email.audit, hashEmail: (e: string) => `hash:${e}` }));
vi.mock("@/lib/branding/saida", () => ({
  marcaDaSaida: vi.fn(async () => ({ nome: "Marca", accent: "#123456", accentFg: "#ffffff" })),
}));
vi.mock("@/lib/email/templates/acesso-gotrue", () => ({
  montarEmailDeAcesso: (_m: string, _marca: unknown, link: string) => ({ subject: "Confirme", html: link, text: link }),
}));

const convite = async () => await import("./convite-no-gotrue");

function responderSettings(corpo: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => corpo }) as Response),
  );
}

const entrada = {
  email: "convidada@exemplo.test",
  password: "SenhaForte!2026",
  inviteToken: "token-assinado-do-convite",
  fullName: "Convidada da Silva",
  emailRedirectTo: "https://crm.exemplo.test/auth/confirm?type=signup",
};

beforeEach(() => {
  vi.clearAllMocks();
  email.configurado.mockResolvedValue(false);
  email.depois.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lerConfigPublicaDoGoTrue", () => {
  it("URL do Supabase com barra final não vira `//auth` (404 no gateway)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_SUPABASE_URL: "https://sb.exemplo.test/", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
    }));
    try {
      responderSettings({ disable_signup: true });
      const { lerConfigPublicaDoGoTrue } = await convite();
      await lerConfigPublicaDoGoTrue();
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://sb.exemplo.test/auth/v1/settings");
    } finally {
      vi.doUnmock("@/lib/env");
      vi.resetModules();
    }
  });

  it("lê `disable_signup` do endpoint público", async () => {
    responderSettings({ disable_signup: true, mailer_autoconfirm: false });
    await expect((await convite()).lerConfigPublicaDoGoTrue()).resolves.toEqual({ disable_signup: true });
  });

  it("cadastro aberto é `false`, não ausência de resposta", async () => {
    responderSettings({ disable_signup: false });
    await expect((await convite()).lerConfigPublicaDoGoTrue()).resolves.toEqual({ disable_signup: false });
  });

  it("rede fora → `null` (nunca lança: isto roda no meio do cadastro)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect((await convite()).lerConfigPublicaDoGoTrue()).resolves.toBeNull();
  });

  it("resposta sem o campo → `null`: não sei não vira 'aberto'", async () => {
    responderSettings({ external: {} });
    await expect((await convite()).lerConfigPublicaDoGoTrue()).resolves.toBeNull();
  });

  it("HTTP 500 do GoTrue → `null`", async () => {
    responderSettings({ disable_signup: true }, false);
    await expect((await convite()).lerConfigPublicaDoGoTrue()).resolves.toBeNull();
  });
});

describe("criarContaDeConvite", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({ auth: { resend: admin.resend } } as never);
  });

  it("cria pela admin API com o convite no user_metadata e manda o e-mail", async () => {
    admin.createUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    admin.resend.mockResolvedValue({ error: null });

    const r = await (await convite()).criarContaDeConvite(entrada);

    expect(r).toEqual({ ok: true, sessao_ativa: false });
    // `email_confirm: false` é o que mantém a prova de caixa postal: a conta
    // só ativa pelo e-mail que chega NO ENDEREÇO DO CONVITE.
    expect(admin.createUser).toHaveBeenCalledWith({
      email: entrada.email,
      password: entrada.password,
      email_confirm: false,
      user_metadata: { invite_token: entrada.inviteToken, full_name: entrada.fullName },
    });
    // O `createUser` do GoTrue não dispara e-mail nenhum (medido no fonte
    // v2.196.0) — sem este reenvio a pessoa esperaria um link que nunca sai.
    expect(admin.resend).toHaveBeenCalledWith({
      type: "signup",
      email: entrada.email,
      options: { emailRedirectTo: entrada.emailRedirectTo },
    });
  });

  it("conta já existe → `conta_ja_existe` (não é falha de infra)", async () => {
    admin.createUser.mockResolvedValue({
      data: null,
      error: { message: "A user with this email address has already been registered", code: "email_exists", status: 422 },
    });

    const r = await (await convite()).criarContaDeConvite(entrada);

    expect(r).toEqual({ ok: false, motivo: "conta_ja_existe" });
    expect(admin.resend).not.toHaveBeenCalled();
  });

  it("e-mail de confirmação não saiu → APAGA a conta e devolve erro", async () => {
    admin.createUser.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    admin.resend.mockResolvedValue({ error: { message: "smtp indisponível", status: 500 } });
    admin.deleteUser.mockResolvedValue({ error: null });

    const r = await (await convite()).criarContaDeConvite(entrada);

    expect(r).toEqual({ ok: false, motivo: "email_de_confirmacao_falhou", detalhe: "smtp indisponível" });
    // Sem esta linha, a próxima tentativa da mesma pessoa cairia em
    // "conta já existe" com um e-mail que nunca chegou — conta órfã, que é o
    // defeito que a issue #1653 existe para fechar.
    expect(admin.deleteUser).toHaveBeenCalledWith("u-2");
  });

  describe("com transporte de e-mail no CRM (SMTP lento não segura a tela)", () => {
    beforeEach(() => {
      email.configurado.mockResolvedValue(true);
    });

    it("responde ANTES do envio: o GoTrue só gera o token, o CRM envia em `after()`", async () => {
      admin.createUser.mockResolvedValue({ data: { user: { id: "u-3" } }, error: null });
      admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hash/+=" } }, error: null });
      email.enviar.mockResolvedValue({ ok: true, via: "smtp" });

      const r = await (await convite()).criarContaDeConvite(entrada);

      expect(r).toEqual({ ok: true, sessao_ativa: false });
      // Medido em produção: o `/resend` do GoTrue esperava o SMTP (~30 s) e
      // estourava a tela (20 s). Ele não pode mais ser chamado neste caminho.
      expect(admin.resend).not.toHaveBeenCalled();
      expect(admin.generateLink).toHaveBeenCalledWith({
        type: "signup",
        email: entrada.email,
        password: entrada.password,
        options: {
          data: { invite_token: entrada.inviteToken, full_name: entrada.fullName },
          redirectTo: entrada.emailRedirectTo,
        },
      });
      expect(email.enviar).not.toHaveBeenCalled();
      expect(email.depois).toHaveLength(1);

      await email.depois[0]!();
      expect(email.enviar).toHaveBeenCalledTimes(1);
      // `&`, não `?`: o redirect já traz `?type=signup`, e o `token_hash`
      // codificado é o que `/auth/confirm` repassa a `/login/continuar`.
      expect(email.enviar.mock.calls[0]![0]).toMatchObject({
        to: entrada.email,
        html: `${entrada.emailRedirectTo}&token_hash=hash%2F%2B%3D`,
      });
      expect(email.audit).not.toHaveBeenCalled();
    });

    it("envio que falha depois da resposta NÃO apaga a conta e fica na trilha", async () => {
      admin.createUser.mockResolvedValue({ data: { user: { id: "u-4" } }, error: null });
      admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "h" } }, error: null });
      email.enviar.mockResolvedValue({ ok: false, error: "send_failed", details: "timeout" });

      await (await convite()).criarContaDeConvite(entrada);
      await email.depois[0]!();

      // Apagar aqui é o defeito medido: o e-mail podia ter saído e o link
      // chegaria apontando para uma conta inexistente.
      expect(admin.deleteUser).not.toHaveBeenCalled();
      expect(email.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "auth.signup_failed",
          metadata: expect.objectContaining({ reason: "email_de_confirmacao_falhou", via: "admin_convite" }),
        }),
      );
    });

    it("conta de tentativa anterior, NÃO confirmada → link novo, sem erro", async () => {
      admin.createUser.mockResolvedValue({
        data: null,
        error: { message: "already been registered", code: "email_exists", status: 422 },
      });
      admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "novo" } }, error: null });

      const r = await (await convite()).criarContaDeConvite(entrada);

      expect(r).toEqual({ ok: true, sessao_ativa: false });
      expect(email.depois).toHaveLength(1);
    });

    it("conta já CONFIRMADA → `conta_ja_existe` (o GoTrue recusa o link)", async () => {
      admin.createUser.mockResolvedValue({
        data: null,
        error: { message: "already been registered", code: "email_exists", status: 422 },
      });
      admin.generateLink.mockResolvedValue({
        data: null,
        error: { message: "A user with this email address has already been registered", code: "email_exists", status: 422 },
      });

      const r = await (await convite()).criarContaDeConvite(entrada);

      expect(r).toEqual({ ok: false, motivo: "conta_ja_existe" });
      expect(email.depois).toHaveLength(0);
    });

    it("conta criada agora e sem token → desfaz a conta (nada de conta órfã)", async () => {
      admin.createUser.mockResolvedValue({ data: { user: { id: "u-5" } }, error: null });
      admin.generateLink.mockResolvedValue({ data: null, error: { message: "db fora", status: 500 } });
      admin.deleteUser.mockResolvedValue({ error: null });

      const r = await (await convite()).criarContaDeConvite(entrada);

      expect(r).toEqual({ ok: false, motivo: "criacao_recusada", detalhe: "db fora" });
      expect(admin.deleteUser).toHaveBeenCalledWith("u-5");
      expect(email.depois).toHaveLength(0);
    });
  });

  it("429 do GoTrue vira `rate_limited`, igual ao caminho de sempre", async () => {
    admin.createUser.mockResolvedValue({
      data: null,
      error: { message: "rate limit exceeded", status: 429 },
    });

    const r = await (await convite()).criarContaDeConvite(entrada);

    expect(r).toEqual({ ok: false, motivo: "rate_limited" });
  });
});
