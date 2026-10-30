import test from "node:test";
import assert from "node:assert/strict";
import { arred, num, quantidadeValida, valorPositivo, valorValido } from "../lib/num.js";

test("num lê os formatos que as pessoas escrevem", () => {
  assert.equal(num("1.234,56"), 1234.56);
  assert.equal(num("1 234,56"), 1234.56);
  assert.equal(num("1234,56"), 1234.56);
  assert.equal(num("1234.56"), 1234.56);
  assert.equal(num("1.234"), 1234);
  assert.equal(num("0,5"), 0.5);
  assert.equal(num("12.345.678,90"), 12345678.9);
  assert.equal(num(" -5,5 "), -5.5);
  assert.equal(num("45 000 MZN"), 45000);
});

test("num rejeita lixo em vez de assumir zero", () => {
  assert.ok(Number.isNaN(num("")));
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("1,2,3")));
  assert.ok(Number.isNaN(num(null)));
});

test("quantidade e valores só passam quando fazem sentido", () => {
  assert.equal(quantidadeValida("2"), 2);
  assert.equal(quantidadeValida("0"), null);
  assert.equal(quantidadeValida("-1"), null);
  assert.equal(quantidadeValida("x"), null);
  assert.equal(valorValido("0"), 0);
  assert.equal(valorValido("abc"), null);
  assert.equal(valorPositivo("0"), null);
  assert.equal(valorPositivo("1500,50"), 1500.5);
});

test("arredonda a dois decimais", () => {
  assert.equal(arred(10.005), 10.01);
  assert.equal(arred(2.344), 2.34);
});
