import test from "node:test";
import assert from "node:assert/strict";
import { acoesDoAprovador, acoesDoFinanceiro, acoesDoMestre } from "../../lib/painelAcoes.js";

const agora = new Date().toISOString();
const haTresDias = new Date(Date.now() - 3 * 86400000).toISOString();

const req = (extra) => ({
  id: 1,
  codigo: "REQ-1",
  estado: "rascunho",
  valor_estimado: 100,
  site: "Site A",
  mestre: "Mestre",
  actualizado_em: agora,
  no_stock: false,
  credito: 0,
  acerto_estado: null,
  ...extra,
});

test("mestre: a correcção pedida vem antes de tudo e aponta à requisição", () => {
  const acoes = acoesDoMestre([
    req({ id: 3, codigo: "REQ-3", estado: "dinheiro_enviado" }),
    req({ id: 1, codigo: "REQ-1", estado: "correccao_pedida" }),
  ]);
  assert.equal(acoes.length, 2);
  assert.equal(acoes[0].codigo, "REQ-1");
  assert.equal(acoes[0].acao, "Corrigir");
  assert.equal(acoes[0].href, "/requisicoes/1");
  assert.equal(acoes[1].acao, "Registar compra");
});

test("mestre: rascunho pede submissão, compra sem stock pede entrada", () => {
  const acoes = acoesDoMestre([
    req({ id: 1, estado: "rascunho" }),
    req({ id: 2, codigo: "REQ-2", estado: "compra_comprovada" }),
  ]);
  assert.deepEqual(acoes.map((a) => a.codigo), ["REQ-1", "REQ-2"]);
  assert.equal(acoes[0].titulo, "Submeter o rascunho");
  assert.equal(acoes[1].titulo, "Dar entrada no stock");
});

test("mestre: com a entrada no stock já lançada não há nada a fazer", () => {
  const acoes = acoesDoMestre([
    req({ estado: "compra_comprovada", no_stock: true }),
    req({ id: 2, estado: "fechado", no_stock: true }),
  ]);
  assert.equal(acoes.length, 0);
});

test("mestre: o que está parado há mais dias sobe dentro da mesma prioridade", () => {
  const acoes = acoesDoMestre([
    req({ id: 1, estado: "dinheiro_enviado", actualizado_em: agora }),
    req({ id: 2, estado: "dinheiro_enviado", actualizado_em: haTresDias }),
  ]);
  assert.equal(acoes[0].id, 2);
  assert.equal(acoes[0].dias >= 3, true);
});

test("financeiro: reembolso primeiro, depois pagar, depois acertar", () => {
  const acoes = acoesDoFinanceiro([
    req({ id: 1, codigo: "ACERTAR", estado: "compra_comprovada" }),
    req({ id: 2, codigo: "PAGAR", estado: "aprovado" }),
    req({ id: 3, codigo: "REEMBOLSO", estado: "fechado", acerto_estado: "excesso_a_reembolsar" }),
  ]);
  assert.deepEqual(acoes.map((a) => a.codigo), ["REEMBOLSO", "PAGAR", "ACERTAR"]);
  assert.equal(acoes[1].titulo, "Enviar o dinheiro");
});

test("financeiro: crédito que cobre o valor troca o botão para confirmar", () => {
  const [acao] = acoesDoFinanceiro([req({ estado: "aprovado", valor_estimado: 100, credito: 100 })]);
  assert.equal(acao.titulo, "Confirmar cobertura pelo saldo");
  assert.equal(acao.acao, "Confirmar");
  assert.equal(acao.cor, "sucesso");
});

test("financeiro: crédito parcial não cobre", () => {
  const [acao] = acoesDoFinanceiro([req({ estado: "aprovado", valor_estimado: 100, credito: 40 })]);
  assert.equal(acao.titulo, "Enviar o dinheiro");
});

test("aprovador: cada requisição submetida é uma decisão pendente", () => {
  const acoes = acoesDoAprovador([
    req({ id: 7, codigo: "REQ-7", estado: "submetido" }),
    req({ id: 8, codigo: "REQ-8", estado: "submetido", actualizado_em: haTresDias }),
  ]);
  assert.equal(acoes.length, 2);
  assert.equal(acoes[0].id, 8);
  assert.equal(acoes[0].acao, "Decidir");
  assert.equal(acoes[0].href, "/requisicoes/8");
});

test("lista vazia devolve lista vazia", () => {
  assert.deepEqual(acoesDoMestre([]), []);
  assert.deepEqual(acoesDoFinanceiro([]), []);
  assert.deepEqual(acoesDoAprovador([]), []);
});
