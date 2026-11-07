import test from "node:test";
import assert from "node:assert/strict";
import {
  base32Codificar,
  base32Decodificar,
  codigoTotp,
  gerarSegredo,
  uriOtpauth,
  verificarTotp,
} from "../../lib/totp.js";

// RFC 6238, secção de teste: segredo "12345678901234567890" em base32.
const SEGREDO_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("base32 vai e volta sem perder bytes", () => {
  const original = Buffer.from("moztele-1234");
  assert.deepEqual(base32Decodificar(base32Codificar(original)), original);
});

test("segredo gerado tem tamanho utilizável", () => {
  const s = gerarSegredo();
  assert.ok(s.length >= 32);
  assert.ok(base32Decodificar(s).length >= 16);
});

test("código TOTP conhecido do RFC 6238", () => {
  // 59 s depois da época => passo 1, código 287082 (6 dígitos)
  assert.equal(codigoTotp(SEGREDO_RFC, 1), "287082");
});

test("aceita o passo actual e os vizinhos, recusa o resto", () => {
  const segredo = gerarSegredo();
  const agora = Date.now();
  const passo = Math.floor(agora / 1000 / 30);
  const actual = codigoTotp(segredo, passo);

  assert.ok(verificarTotp(segredo, actual, 1, agora));
  assert.ok(verificarTotp(segredo, codigoTotp(segredo, passo - 1), 1, agora));
  assert.equal(verificarTotp(segredo, "000000", 1, agora), actual === "000000");
  assert.equal(verificarTotp(segredo, "", 1, agora), false);
  assert.equal(verificarTotp("", actual, 1, agora), false);
});

test("URI otpauth traz segredo, emissor e parâmetros", () => {
  const uri = uriOtpauth("ABCDEF234567", "841111111");
  assert.ok(uri.startsWith("otpauth://totp/"));
  assert.ok(uri.includes("secret=ABCDEF234567"));
  assert.ok(uri.includes("issuer=Moz+Teles"));
  assert.ok(uri.includes("digits=6"));
});
