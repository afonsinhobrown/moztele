import test from "node:test";
import assert from "node:assert/strict";
import { codigoIgual, gerarCodigo, hashCodigo, normalizarCodigo, VALIDADE_HORAS } from "../../lib/codigos.js";

test("código tem o formato XXXX-XXXX e não usa letras ambíguas", () => {
  for (let i = 0; i < 50; i++) {
    const c = gerarCodigo();
    assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok(!/[0O1IL]/.test(c.replace("-", "")));
  }
});

test("normalização aceita minúsculas, espaços e hífens", () => {
  assert.equal(normalizarCodigo(" abcd-2345 "), "ABCD2345");
  assert.equal(normalizarCodigo("ABCD 2345"), "ABCD2345");
});

test("hash é estável e compara em segurança", () => {
  const c = gerarCodigo();
  assert.equal(hashCodigo(c), hashCodigo(c.toLowerCase().replace("-", " ")));
  assert.equal(hashCodigo(c).length, 64);
  assert.ok(codigoIgual(c, hashCodigo(c)));
  assert.equal(codigoIgual(gerarCodigo() + "X", hashCodigo(c)), false);
  assert.equal(codigoIgual(c, ""), false);
});

test("validade do código é de um dia", () => {
  assert.equal(VALIDADE_HORAS, 24);
});
