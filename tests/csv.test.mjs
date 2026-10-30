import test from "node:test";
import assert from "node:assert/strict";
import { paraCsv } from "../lib/csv.js";

const colunas = [{ titulo: "Nome" }, { titulo: "Valor" }];

test("csv começa com BOM e usa ponto e vírgula", () => {
  const csv = paraCsv(colunas, [["Ana", "1,50"]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /Nome;Valor\r\n/);
  assert.match(csv, /Ana;1,50/);
});

test("csv escapa aspas e separadores", () => {
  const csv = paraCsv(colunas, [['"Factura"; 1', "10"]]);
  assert.match(csv, /"""Factura""; 1";10/);
});

test("csv lida com valores nulos", () => {
  const csv = paraCsv(colunas, [[null, undefined]]);
  assert.match(csv, /\r\n;\r\n$/);
});
