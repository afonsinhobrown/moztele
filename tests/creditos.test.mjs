import test from "node:test";
import assert from "node:assert/strict";
import { distribuirCredito } from "../lib/creditos.js";

test("aplica um único crédito até ao valor necessário", () => {
  const r = distribuirCredito([{ id: 1, disponivel: 5000 }], 3000);
  assert.deepEqual(r.aplicacoes, [{ id: 1, valor: 3000 }]);
  assert.equal(r.aplicado, 3000);
  assert.equal(r.restante, 0);
});

test("usa vários créditos pela ordem dada", () => {
  const r = distribuirCredito(
    [
      { id: 1, disponivel: 2000 },
      { id: 2, disponivel: 2500 },
    ],
    4000
  );
  assert.deepEqual(r.aplicacoes, [
    { id: 1, valor: 2000 },
    { id: 2, valor: 2000 },
  ]);
  assert.equal(r.aplicado, 4000);
  assert.equal(r.restante, 0);
});

test("não aplica mais do que existe", () => {
  const r = distribuirCredito([{ id: 1, disponivel: 1000 }], 5000);
  assert.equal(r.aplicado, 1000);
  assert.equal(r.restante, 4000);
});

test("ignora créditos vazios ou negativos", () => {
  const r = distribuirCredito(
    [
      { id: 1, disponivel: 0 },
      { id: 2, disponivel: -50 },
      { id: 3, disponivel: 700 },
    ],
    500
  );
  assert.deepEqual(r.aplicacoes, [{ id: 3, valor: 500 }]);
});

test("sem necessidade não aplica nada", () => {
  const r = distribuirCredito([{ id: 1, disponivel: 500 }], 0);
  assert.deepEqual(r.aplicacoes, []);
  assert.equal(r.aplicado, 0);
});
