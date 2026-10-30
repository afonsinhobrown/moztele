import test from "node:test";
import assert from "node:assert/strict";
import { normalizarTelefone, telefoneValido, telefoneWhatsapp } from "../lib/telefone.js";

test("normaliza espaços, travessões e indicativo", () => {
  assert.equal(normalizarTelefone("84 000 0000"), "840000000");
  assert.equal(normalizarTelefone("+258 84 000 0000"), "+258840000000");
  assert.equal(normalizarTelefone(" (84) 123-4567 "), "841234567");
});

test("valida comprimentos plausíveis", () => {
  assert.equal(telefoneValido("840000000"), true);
  assert.equal(telefoneValido("+258840000000"), true);
  assert.equal(telefoneValido("123"), false);
  assert.equal(telefoneValido(""), false);
});

test("número internacional para WhatsApp", () => {
  assert.equal(telefoneWhatsapp("840000000"), "258840000000");
  assert.equal(telefoneWhatsapp("+258840000000"), "258840000000");
  assert.equal(telefoneWhatsapp("+258 84 000 0000"), "258840000000");
});
