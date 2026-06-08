import { describe, expect, it } from "@jest/globals";
import { resolve } from "node:path";

import { assertPathsWithinRoot } from "../../../src/mcp/assert-paths-within-root.js";
import { ValidationError } from "../../../src/shared/errors.js";

const ROOT = resolve("/srv/media");

describe("assertPathsWithinRoot", () => {
  it("e no-op quando allowedRoot e null (mantem o alcance equivalente ao CLI)", () => {
    expect(() =>
      assertPathsWithinRoot(["/etc/passwd", "../../qualquer", "/abs/out"], null),
    ).not.toThrow();
  });

  it("aceita inputs e outputDir sob a raiz", () => {
    expect(() =>
      assertPathsWithinRoot([`${ROOT}/a.mkv`, `${ROOT}/sub/b.mkv`, `${ROOT}/out`], ROOT),
    ).not.toThrow();
  });

  it("aceita o proprio diretorio raiz", () => {
    expect(() => assertPathsWithinRoot([ROOT], ROOT)).not.toThrow();
  });

  it("rejeita caminho absoluto fora da raiz", () => {
    expect(() => assertPathsWithinRoot(["/etc/passwd"], ROOT)).toThrow(ValidationError);
  });

  it("rejeita escape via .. mesmo comecando sob a raiz", () => {
    expect(() => assertPathsWithinRoot([`${ROOT}/../secret/x.mkv`], ROOT)).toThrow(ValidationError);
  });

  it("rejeita irmao que apenas compartilha o prefixo do nome da raiz", () => {
    // /srv/media-evil NAO esta sob /srv/media — guarda o boundary de separador.
    expect(() => assertPathsWithinRoot([resolve("/srv/media-evil/x.mkv")], ROOT)).toThrow(
      ValidationError,
    );
  });

  it("rejeita o lote inteiro se UM unico caminho escapar", () => {
    expect(() =>
      assertPathsWithinRoot([`${ROOT}/ok.mkv`, "/etc/shadow", `${ROOT}/out`], ROOT),
    ).toThrow(ValidationError);
  });

  it("resolve caminhos relativos contra o cwd do processo", () => {
    const cwdRoot = resolve(".");

    expect(() => assertPathsWithinRoot(["sub/a.mkv"], cwdRoot)).not.toThrow();
    expect(() => assertPathsWithinRoot(["../fora.mkv"], cwdRoot)).toThrow(ValidationError);
  });

  it("nomeia o caminho ofensor e a raiz na mensagem", () => {
    expect(() => assertPathsWithinRoot(["/etc/passwd"], ROOT)).toThrow(/MCP_ALLOWED_ROOT/);
    expect(() => assertPathsWithinRoot(["/etc/passwd"], ROOT)).toThrow(/etc[\\/]passwd/);
  });
});
