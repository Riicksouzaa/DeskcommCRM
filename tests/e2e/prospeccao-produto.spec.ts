import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "./helpers/test";
import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal, destinoEhLocal } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

/**
 * PRODUTO CADASTRADO DA PROSPECÇÃO — PELA TELA (spec 2026-11-10, PX-01/PX-02).
 *
 * Prova, dirigindo a tela /app/prospecting/produtos como o administrador:
 * 1. cadastrar um produto com uma solução para o achado "Não tem site";
 * 2. editar (a frase nova aparece ao reabrir);
 * 3. repetir o nome mostra a mensagem humana de nome duplicado, sem criar um segundo;
 * 4. arquivar tira da lista, e "Mostrar arquivados" o devolve com o selo.
 *
 * Pré-requisitos: banco local do baseline, app buildada.
 *   pnpm e2e:env && pnpm e2e:build
 *   pnpm exec playwright test tests/e2e/prospeccao-produto.spec.ts
 */

const env = carregarEnvLocal();
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const admin = createClient(URL_SUPABASE, env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EVIDENCIA = path.join(process.cwd(), "evidence", "produto-da-prospeccao");
const NOME = "E2E Site profissional QA";

function orgDoTeste(): string {
  const creds = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as {
    org_id: string;
  };
  return creds.org_id;
}

async function limpar(): Promise<void> {
  await admin
    .from("prospecting_products")
    .delete()
    .eq("organization_id", orgDoTeste())
    .like("nome", "E2E %");
}

test.describe("Produto da prospecção pela tela", () => {
  test.beforeAll(async () => {
    if (!destinoEhLocal(URL_SUPABASE)) {
      throw new Error(`RECUSADO: ${URL_SUPABASE} não é loopback — esta spec não escreve fora do local.`);
    }
    fs.mkdirSync(EVIDENCIA, { recursive: true });
    await limpar();
  });
  test.afterAll(limpar);

  test("criar, editar, recusar nome repetido e arquivar", async ({ page }) => {
    test.setTimeout(120_000);
    await loginComoAdmin(page, lerCreds());
    await page.goto("/app/prospecting/produtos");

    await expect(page.getByRole("heading", { level: 1, name: "Produtos da prospecção" })).toBeVisible();
    await expect(page.getByText("Nenhum produto ainda", { exact: false })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "01-vazio.png"), fullPage: true });

    // 1. criar
    await page.getByRole("button", { name: "Novo produto" }).click();
    await page.getByLabel("Nome do produto").fill(NOME);
    await page.getByLabel("Categoria").fill("Criação de sites");
    await page.getByLabel("Resumo").fill("Sites rápidos para pequenos negócios.");
    await page.getByLabel("Termos proibidos").fill("garantido\nmilagre");
    await page.getByLabel("Não tem site", { exact: true }).fill("Criamos o seu site em uma semana");
    await page.screenshot({ path: path.join(EVIDENCIA, "02-formulario.png") });
    await page.getByRole("button", { name: "Salvar produto" }).click();

    await expect(page.getByRole("heading", { level: 2, name: NOME })).toBeVisible();
    await expect(page.getByText("1 problema com solução")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "03-lista.png"), fullPage: true });

    // 2. editar
    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByLabel("Não tem site", { exact: true })).toHaveValue(
      "Criamos o seu site em uma semana",
    );
    await page.getByLabel("Site lento para abrir").fill("Deixamos o seu site rápido");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText("2 problemas com solução")).toBeVisible();

    // 3. nome repetido
    await page.getByRole("button", { name: "Novo produto" }).click();
    await page.getByLabel("Nome do produto").fill(NOME);
    await page.getByLabel("Categoria").fill("Criação de sites");
    await page.getByLabel("Resumo").fill("Outro resumo.");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByRole("alert")).toContainText("Já existe um produto com esse nome");
    await page.screenshot({ path: path.join(EVIDENCIA, "04-nome-repetido.png") });
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("heading", { level: 2, name: NOME })).toHaveCount(1);

    // 4. arquivar
    await page.getByRole("button", { name: "Arquivar" }).click();
    await expect(page.getByRole("heading", { level: 2, name: NOME })).toHaveCount(0);
    await page.getByLabel("Mostrar arquivados").check();
    await expect(page.getByRole("heading", { level: 2, name: NOME })).toBeVisible();
    await expect(page.getByText("Arquivado", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "05-arquivado.png"), fullPage: true });
  });
});
