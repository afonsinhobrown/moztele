import test from "node:test";
import assert from "node:assert/strict";
import { errosSenha, senhaValida } from "../lib/senha.js";

test("aceita senhas razoáveis", () => {
  assert.equal(senhaValida("obra2026segura"), true);
  assert.equal(senhaValida("Maputo#2026"), true);
});

test("rejeita senhas fracas", () => {
  assert.equal(senhaValida("12345678"), false);
  assert.equal(senhaValida("abcdefgh"), false);
  assert.equal(senhaValida("Ab1"), false);
  assert.equal(senhaValida(" senha2026"), false);
  assert.equal(senhaValida("a".repeat(80) + "1"), false);
});

test("explica o que falta", () => {
  assert.ok(errosSenha("abc").some((e) => e.includes("8 caracteres")));
  assert.ok(errosSenha("abcdefgh").some((e) => e.includes("número")));
  assert.ok(errosSenha("12345678").some((e) => e.includes("letra")));
});
