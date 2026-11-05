/**
 * Transcrição GRATUITA pelo Whisper local do compose (`TRANSCRICAO_LOCAL`).
 *
 * Medido em produção em 04/11/2026: organização só-OpenRouter, nenhuma nota de
 * voz virava texto. A escada precisava de um degrau que não dependesse de
 * chave nem de modelo de conversa — o serviço `whisper` (speaches) da própria
 * VPS. Estes casos prendem:
 *
 *   - ligado, o degrau vence o serviço do `.env`, a chave OpenAI e a OpenRouter;
 *   - o destino é o endereço FIXO `http://whisper:8000`, sem segredo nenhum;
 *   - sem `TRANSCRIPTION_LANGUAGES` o idioma vai como `pt` (o produto é pt-BR,
 *     e Whisper sem idioma alucina em áudio curto);
 *   - desligado (o padrão), a escada de antes não muda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ModuloDeEnv from "@/lib/env";

const doEnv = vi.hoisted(() => ({ local: "", apiKey: "", model: "", languages: "" }));
vi.mock("@/lib/env", async (importOriginal) => {
  const real = await importOriginal<typeof ModuloDeEnv>();
  return {
    env: {
      ...real.env,
      get TRANSCRICAO_LOCAL() {
        return doEnv.local;
      },
      get TRANSCRIPTION_API_KEY() {
        return doEnv.apiKey;
      },
      get TRANSCRIPTION_BASE_URL() {
        return "";
      },
      get TRANSCRIPTION_MODEL() {
        return doEnv.model;
      },
      get TRANSCRIPTION_LANGUAGES() {
        return doEnv.languages;
      },
    },
  };
});

let chamadas: Array<{ url: string; init: RequestInit }> = [];

beforeEach(() => {
  doEnv.local = "";
  doEnv.apiKey = "";
  doEnv.model = "";
  doEnv.languages = "";
  chamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return new Response(JSON.stringify({ text: "oi, quero saber o preço" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const { decidirTranscricao, transcricaoLocalLigada, MODELO_DO_WHISPER_LOCAL } = await import(
  "@/lib/messaging/media/escada-de-transcricao"
);

const conversaOpenRouter = { provider: "openrouter", apiKey: "sk-or-x", modelId: "z-ai/glm-5.3-flash" };

describe("Whisper local: transcrição gratuita no próprio servidor", () => {
  it("ligado, vence o serviço do .env, a chave OpenAI e a OpenRouter", async () => {
    doEnv.local = "ligada";
    doEnv.apiKey = "gsk-servico";
    const chaveOpenai = vi.fn(async () => "sk-openai");

    const d = await decidirTranscricao({ conversa: conversaOpenRouter, chaveOpenai });

    expect(d.origem).toBe("whisper_local");
    expect(d.anuncio).toEqual({ provider: "whisper_local", modelId: MODELO_DO_WHISPER_LOCAL });
    expect(chaveOpenai, "a chave OpenAI nem foi lida").not.toHaveBeenCalled();
  });

  it("chama o endereço fixo, sem credencial, com pt quando o idioma não foi declarado", async () => {
    doEnv.local = "true";

    const d = await decidirTranscricao({ conversa: null });
    const texto = await d.transcriber!.transcribe(Buffer.from("OggS"), "audio/ogg; codecs=opus");

    expect(texto).toBe("oi, quero saber o preço");
    const c = chamadas.at(-1)!;
    expect(c.url).toBe("http://whisper:8000/v1/audio/transcriptions");
    expect((c.init.headers as Record<string, string>).Authorization).toBe("Bearer local");
    const corpo = c.init.body as FormData;
    expect(corpo.get("model")).toBe(MODELO_DO_WHISPER_LOCAL);
    expect(corpo.get("language")).toBe("pt");
  });

  it("respeita TRANSCRIPTION_MODEL e TRANSCRIPTION_LANGUAGES", async () => {
    doEnv.local = "1";
    doEnv.model = "Systran/faster-whisper-medium";
    doEnv.languages = "es";

    const d = await decidirTranscricao({ conversa: null });
    await d.transcriber!.transcribe(Buffer.from("x"), "audio/ogg");

    const corpo = chamadas.at(-1)!.init.body as FormData;
    expect(corpo.get("model")).toBe("Systran/faster-whisper-medium");
    expect(corpo.get("language")).toBe("es");
  });

  it("controle: desligado (o padrão), a escada de antes não muda", async () => {
    const d = await decidirTranscricao({ conversa: conversaOpenRouter });
    expect(d.origem).toBe("padrao_openrouter");
  });

  it("a chave aceita as grafias comuns e trata o resto como desligado", () => {
    for (const v of ["1", "true", "ON", " ligada ", "sim"]) expect(transcricaoLocalLigada(v)).toBe(true);
    for (const v of ["", "0", "false", "off", "talvez", undefined]) expect(transcricaoLocalLigada(v)).toBe(false);
  });
});
