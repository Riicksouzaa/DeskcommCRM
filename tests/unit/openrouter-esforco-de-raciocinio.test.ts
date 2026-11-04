/**
 * O ESFORÇO DE RACIOCÍNIO PELA OPENROUTER É REGULÁVEL — pelo knob
 * OPENROUTER_REASONING_EFFORT, e SÓ na fábrica da OpenRouter.
 *
 * Motivo (medido em produção em 2026-11-04, `z-ai/glm-5.3-flash`, que o
 * catálogo da OpenRouter marca com raciocínio obrigatório e esforço padrão
 * `max`): um formulário de 11 campos fez o modelo raciocinar até o teto de
 * saída (4096) duas vezes seguidas, e o turno fechou com zero mensagens ao
 * cliente. O campo vai no CORPO da chamada de Chat Completions.
 *
 * O que estes testes medem: o corpo que SAI do processo (fetch interceptado).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, type LanguageModel } from "ai";

import {
  createDefaultRegistry,
  esforcoDeRaciocinioOpenRouter,
} from "@/lib/agent-engine/edge/llm/providers";
import { loadEnv } from "@/lib/agent-engine/env";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function interceptarSaida(): { urls: string[]; corpos: Array<Record<string, unknown>> } {
  const urls: string[] = [];
  const corpos: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      urls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as { url: string }).url);
      corpos.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      throw new Error("PARADA_DE_TESTE");
    }),
  );
  return { urls, corpos };
}

async function disparar(model: LanguageModel): Promise<void> {
  await generateText({ model, prompt: "oi", maxRetries: 0 }).catch(() => {});
}

describe("knob ligado: a chamada da OpenRouter leva reasoning.effort", () => {
  it("pela opção do registry, no Chat Completions", async () => {
    const { urls, corpos } = interceptarSaida();
    await disparar(
      createDefaultRegistry({ openrouterReasoningEffort: "low" })["openrouter"]!("sk-or-teste", "z-ai/glm-5.3-flash"),
    );
    expect(urls[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(corpos[0]?.reasoning).toEqual({ effort: "low" });
    // O resto da chamada segue intacto.
    expect(corpos[0]?.model).toBe("z-ai/glm-5.3-flash");
    expect(corpos[0]?.messages).toBeDefined();
  });

  it("pelo ambiente (OPENROUTER_REASONING_EFFORT), que é como o operador liga", async () => {
    vi.stubEnv("OPENROUTER_REASONING_EFFORT", "high");
    const { corpos } = interceptarSaida();
    await disparar(createDefaultRegistry()["openrouter"]!("sk-or-teste", "z-ai/glm-5.3-flash"));
    expect(corpos[0]?.reasoning).toEqual({ effort: "high" });
  });

  it("vale também no endereço próprio da OpenRouter (gateway do operador)", async () => {
    const { urls, corpos } = interceptarSaida();
    await disparar(
      createDefaultRegistry({ openrouterReasoningEffort: "low", allowedHosts: ["gw.exemplo.com"] })["openrouter"]!(
        "sk-or-teste",
        "z-ai/glm-5.3-flash",
        "https://gw.exemplo.com/api/v1",
      ),
    );
    expect(urls[0]).toBe("https://gw.exemplo.com/api/v1/chat/completions");
    expect(corpos[0]?.reasoning).toEqual({ effort: "low" });
  });
});

describe("knob desligado: nada muda", () => {
  it("sem o knob, o corpo não leva reasoning (padrão do modelo, como antes)", async () => {
    vi.stubEnv("OPENROUTER_REASONING_EFFORT", "");
    const { corpos } = interceptarSaida();
    await disparar(createDefaultRegistry()["openrouter"]!("sk-or-teste", "z-ai/glm-5.3-flash"));
    expect(corpos[0]).not.toHaveProperty("reasoning");
  });

  it("o knob da OpenRouter não vaza para os outros provedores", async () => {
    const registro = createDefaultRegistry({ openrouterReasoningEffort: "low", openaiReasoningEffort: null });
    for (const [provedor, modelo, base] of [
      ["requesty", "openai/gpt-4o-mini", undefined],
      ["openai", "gpt-6-luna", undefined],
      ["deepseek", "deepseek-chat", undefined],
    ] as const) {
      const { corpos } = interceptarSaida();
      await disparar(registro[provedor]!("chave-de-teste", modelo, base));
      expect(corpos[0], provedor).not.toHaveProperty("reasoning");
      vi.unstubAllGlobals();
    }
  });
});

describe("grafia do knob", () => {
  it("recusa none: modelo de raciocínio obrigatório devolve 400 em TODA chamada com ele", () => {
    // Medido contra a API real (2026-11-04): z-ai/glm-5.3-flash + effort none →
    // 400 "Reasoning is mandatory for this endpoint and cannot be disabled".
    // O knob é da instalação e o modelo é de cada organização: aceitar `none`
    // derrubaria todo turno de quem usa um desses modelos.
    expect(() => esforcoDeRaciocinioOpenRouter("none")).toThrow(/none não é aceito.*minimal/);
    expect(() =>
      loadEnv({ ...process.env, OPENROUTER_REASONING_EFFORT: "none" } as NodeJS.ProcessEnv),
    ).toThrow(/OPENROUTER_REASONING_EFFORT/);
  });

  it("aceita os esforços da OpenRouter, sem diferenciar maiúsculas", () => {
    for (const v of ["minimal", "low", "medium", "high", "xhigh", "max"]) {
      expect(esforcoDeRaciocinioOpenRouter(v)).toBe(v);
    }
    expect(esforcoDeRaciocinioOpenRouter(" LOW ")).toBe("low");
    expect(esforcoDeRaciocinioOpenRouter("")).toBeNull();
    expect(esforcoDeRaciocinioOpenRouter(undefined)).toBeNull();
  });

  it("grafia errada derruba o boot do worker com o nome da variável", () => {
    expect(() => esforcoDeRaciocinioOpenRouter("baixo")).toThrow(/OPENROUTER_REASONING_EFFORT/);
    expect(() =>
      loadEnv({
        ...process.env,
        OPENROUTER_REASONING_EFFORT: "baixo",
      } as NodeJS.ProcessEnv),
    ).toThrow(/OPENROUTER_REASONING_EFFORT/);
  });
});
