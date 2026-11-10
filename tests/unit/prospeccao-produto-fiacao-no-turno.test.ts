import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CERCA DE FIAÇÃO: a Msg 2 da prospecção só vale se o turno do agente a recebe e a confere.
 * Como no molde de `prospeccao-saida-ligada-nos-envios.test.ts`: o comportamento de cada peça é
 * medido nos testes de `lib/prospecting/produto/`; aqui se prova que o turno (7 mil linhas, sem
 * teste de integração barato) as CHAMA, na ordem e com as garantias que a doutrina pede.
 */
const RAIZ = join(__dirname, "..", "..");
const turno = readFileSync(join(RAIZ, "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

describe("a Msg 2 da prospecção no turno do agente", () => {
  it("é calculada UMA vez, só no turno que responde a pessoa (nunca prévia nem follow-up)", () => {
    expect(turno).toMatch(
      /msg2DaProspeccao\s*=\s*\n?\s*!preview && liveJob\(\)\.kind === 'inbound_turn' && input\.conversationId\s*\n?\s*\? await msg2PendenteDoTurno\(pool, tenantId, input\.conversationId\)/,
    );
    expect(turno.match(/msg2PendenteDoTurno\(/g)).toHaveLength(1);
  });

  it("vai ao agente no sufixo por-lead (dado), e não no system", () => {
    const sufixos = turno.slice(turno.indexOf("const openingSuffixes = ["));
    expect(sufixos.slice(0, 400)).toContain("msg2DaProspeccao?.bloco ?? ''");
    // O system (agentLayer) recebe só o contexto da campanha, que NÃO carrega a Msg 2.
    expect(turno).toContain("agentConfig.systemPrompt + prospectingContext");
    expect(turno).not.toMatch(/systemPrompt\s*\+\s*msg2/);
  });

  it("a conferência lê só o que o canal ACEITOU e roda antes do roteiro do atendimento", () => {
    expect(turno).toContain("corposConfirmados.push(finalBody)");
    expect(turno).toMatch(/resultadoDoEnvio\.kind === 'sent' \|\|\s*\n\s*resultadoDoEnvio\.kind === 'queued' \|\|\s*\n\s*resultadoDoEnvio\.kind === 'already_sent'/);
    const conferencia = turno.indexOf("conferirMsg2DoTurno(pool");
    expect(conferencia).toBeGreaterThan(-1);
    expect(turno.slice(conferencia, conferencia + 300)).toContain("corposConfirmados,");
    expect(conferencia).toBeLessThan(turno.indexOf("if (roteiro !== null) {\n      await garantirPerguntaDoRoteiro"));
    expect(turno.match(/conferirMsg2DoTurno\(/g)).toHaveLength(1);
  });

  it("o gate de spinning só é desarmado para o corpo que contém a Msg 2 inteira", () => {
    expect(turno).toMatch(
      /msg2DaProspeccao !== null &&\s*\n\s*compararComEsperado\(body, msg2DaProspeccao\.esperada\)\.igual\s*\n\s*\? \{ enforceSpinning: false \}/,
    );
    // Nenhum outro desligamento do spinning no send_message do modelo.
    expect(turno.match(/enforceSpinning: false/g)).toHaveLength(2); // a pergunta do roteiro + a Msg 2
  });
});
