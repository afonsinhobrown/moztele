import test from "node:test";
import assert from "node:assert/strict";
import { calcularMovimento, estadoStock, rotuloStock } from "../lib/stock.js";

test("entrada soma ao stock", () => {
  const r = calcularMovimento({ tipo: "entrada", quantidade: 5, saldoAtual: 10 });
  assert.equal(r.saldoApos, 15);
  assert.equal(r.delta, 5);
});

test("saída subtrai e recusa abaixo de zero", () => {
  assert.equal(calcularMovimento({ tipo: "saida", quantidade: 4, saldoAtual: 10 }).saldoApos, 6);
  assert.equal(calcularMovimento({ tipo: "saida", quantidade: 11, saldoAtual: 10 }).erro, "insuficiente");
});

test("ajuste define a contagem física", () => {
  const r = calcularMovimento({ tipo: "ajuste", quantidade: 3, saldoAtual: 10 });
  assert.equal(r.saldoApos, 3);
  assert.equal(r.delta, -7);
  assert.equal(calcularMovimento({ tipo: "ajuste", quantidade: 0, saldoAtual: 10 }).saldoApos, 0);
});

test("quantidades inválidas são recusadas", () => {
  assert.equal(calcularMovimento({ tipo: "entrada", quantidade: 0, saldoAtual: 1 }).erro, "quantidade");
  assert.equal(calcularMovimento({ tipo: "entrada", quantidade: -2, saldoAtual: 1 }).erro, "quantidade");
  assert.equal(calcularMovimento({ tipo: "entrada", quantidade: "x", saldoAtual: 1 }).erro, "quantidade");
  assert.equal(calcularMovimento({ tipo: "entrada", quantidade: 1, saldoAtual: -1 }).erro, "stock");
  assert.equal(calcularMovimento({ tipo: "outro", quantidade: 1, saldoAtual: 1 }).erro, "tipo");
});

test("estado do stock e rótulos", () => {
  assert.equal(estadoStock(0, 5), "sem");
  assert.equal(estadoStock(3, 5), "baixo");
  assert.equal(estadoStock(5, 5), "baixo");
  assert.equal(estadoStock(6, 5), "ok");
  assert.equal(estadoStock(1, 0), "ok");
  assert.equal(rotuloStock("baixo"), "Abaixo do mínimo");
});
