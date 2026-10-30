import test from "node:test";
import assert from "node:assert/strict";
import { diasDesde, prazo, rotuloPrazo } from "../lib/prazos.js";

const agora = new Date("2026-03-10T12:00:00Z");
const ha = (dias) => new Date(agora.getTime() - dias * 86400000);

test("conta dias inteiros desde a última alteração", () => {
  assert.equal(diasDesde(ha(0), agora), 0);
  assert.equal(diasDesde(ha(1), agora), 1);
  assert.equal(diasDesde(ha(9), agora), 9);
  assert.equal(diasDesde("data inválida", agora), 0);
});

test("sinaliza atenção e atraso conforme o estado", () => {
  assert.equal(prazo("submetido", ha(1), agora).nivel, "ok");
  assert.equal(prazo("submetido", ha(3), agora).nivel, "atencao");
  assert.equal(prazo("submetido", ha(5), agora).nivel, "atraso");
  assert.equal(prazo("dinheiro_enviado", ha(7), agora).nivel, "atencao");
  assert.equal(prazo("dinheiro_enviado", ha(11), agora).nivel, "atraso");
  assert.equal(prazo("rascunho", ha(30), agora), null);
});

test("texto do prazo é legível", () => {
  assert.equal(prazo("submetido", ha(0), agora).texto, "desde hoje");
  assert.equal(prazo("submetido", ha(1), agora).texto, "há 1 dia");
  assert.equal(prazo("submetido", ha(3), agora).texto, "há 3 dias");
  assert.equal(rotuloPrazo("atraso"), "Atrasado");
  assert.equal(rotuloPrazo("ok"), "Dentro do prazo");
});
