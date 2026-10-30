import test from "node:test";
import assert from "node:assert/strict";
import {
  chaveNova,
  chaveValida,
  detectarTipo,
  finalidadeDePasta,
  hashSha256,
  nomeFicheiroSeguro,
} from "../lib/ficheiros.js";

const pdf = Buffer.from("%PDF-1.7\nconteudo");
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const html = Buffer.from("<html><script>alert(1)</script></html>");

test("o tipo é decidido pelo conteúdo, não pelo nome", () => {
  assert.equal(detectarTipo(pdf)?.mime, "application/pdf");
  assert.equal(detectarTipo(jpg)?.mime, "image/jpeg");
  assert.equal(detectarTipo(png)?.mime, "image/png");
  assert.equal(detectarTipo(html), null);
  assert.equal(detectarTipo(Buffer.from("")), null);
});

test("hash é estável e tem 64 caracteres hex", () => {
  const h = hashSha256(pdf);
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(h, hashSha256(Buffer.from(pdf)));
  assert.notEqual(h, hashSha256(jpg));
});

test("nomes ficam seguros e com extensão certa", () => {
  assert.equal(nomeFicheiroSeguro("Factura Ção 2026.pdf", "pdf"), "Factura_Cao_2026.pdf");
  assert.equal(nomeFicheiroSeguro("../../etc/passwd", "pdf"), "passwd.pdf");
  assert.equal(nomeFicheiroSeguro("", "jpg"), "ficheiro.jpg");
});

test("chaves geradas são válidas e com a pasta certa", () => {
  const k = chaveNova("compras", "factura.jpg");
  assert.ok(k.startsWith("compras/"));
  assert.ok(k.endsWith(".jpg"));
  assert.ok(chaveValida(k));
});

test("chaveValida rejeita travessias de caminho", () => {
  assert.equal(chaveValida("compras/factura.pdf"), true);
  assert.equal(chaveValida("../segredo.pdf"), false);
  assert.equal(chaveValida("compras/../../x.pdf"), false);
  assert.equal(chaveValida("compras//x.pdf"), false);
  assert.equal(chaveValida(""), false);
});

test("só pastas conhecidas são aceites", () => {
  assert.equal(finalidadeDePasta("transferencias"), "pagamento");
  assert.equal(finalidadeDePasta("compras"), "compra");
  assert.throws(() => finalidadeDePasta("../../etc"));
});
