import { describe, expect, it } from "vitest";

import { ROTULO_DO_ACHADO } from "./rotulos";
import { CODIGOS_DE_ACHADO } from "./schema";

describe("rótulos dos achados do produto", () => {
  it("há um rótulo legível para cada código, e nenhum sobrando", () => {
    expect(Object.keys(ROTULO_DO_ACHADO).sort()).toEqual([...CODIGOS_DE_ACHADO].sort());
    for (const codigo of CODIGOS_DE_ACHADO) {
      const r = ROTULO_DO_ACHADO[codigo];
      expect(r.trim().length, codigo).toBeGreaterThan(5);
      expect(r, codigo).not.toBe(codigo);
    }
  });
});
