import { NextResponse } from "next/server";
import { sessao } from "@/lib/auth";
import { obterRequisicao } from "@/lib/requisicoes";
import { URGENCIAS } from "@/lib/relatorios";
import { ESTADOS } from "@/lib/ui";
import {
  criarDocumento, texto, resumo, secao, tabela, finalizar, money, data, dataHora,
} from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisoes = { aprovado: "Aprovado", reprovado: "Reprovado", correccao: "Correcção pedida" };

export async function GET(req, { params }) {
  const s = await sessao();
  if (!s) return new NextResponse("Não autorizado", { status: 401 });

  const id = Number(params.id);
  const d = await obterRequisicao(id, s);
  if (!d) return new NextResponse("Não encontrado", { status: 404 });
  const { r, itens, anexos, aprov, pags, compras, acerto, hist, coment, reembolsos, creditos } = d;

  const enviado = pags.reduce((a, p) => a + Number(p.valor), 0);
  const credito = creditos.reduce((a, c) => a + Number(c.valor), 0);
  const financiado = enviado + credito;
  const gasto = compras.reduce((a, c) => a + Number(c.valor_gasto), 0);

  const st = await criarDocumento({
    titulo: `Requisição ${r.codigo}`,
    subtitulo: `${ESTADOS[r.estado] || r.estado}  |  Criada em ${dataHora(r.criado_em)}`,
  });

  resumo(st, [
    { rotulo: "Mestre", valor: `${r.mestre} (${r.telefone})` },
    { rotulo: "Site", valor: r.site },
    { rotulo: "Urgência", valor: URGENCIAS[r.urgencia] || r.urgencia },
    { rotulo: "Valor estimado", valor: money(r.valor_estimado) },
  ]);

  secao(st, "Justificação");
  texto(st, r.justificacao);

  secao(st, "Orçamento");
  if (itens.length === 0) texto(st, "Sem itens.");
  else {
    tabela(st, {
      colunas: [
        { titulo: "Item", peso: 3 },
        { titulo: "Categoria", peso: 1.6 },
        { titulo: "Qtd", peso: 1 },
        { titulo: "Preço unit.", peso: 1.4, align: "right" },
        { titulo: "Subtotal", peso: 1.4, align: "right" },
      ],
      linhas: itens.map((i) => [
        i.descricao,
        i.categoria || "-",
        `${Number(i.quantidade)} ${i.unidade}`,
        money(i.preco_unitario),
        money(i.subtotal),
      ]),
    });
    resumo(st, [{ rotulo: "Total estimado", valor: money(r.valor_estimado) }]);
  }

  secao(st, "Documentos");
  if (anexos.length === 0) texto(st, "Sem documentos anexados.");
  else
    anexos.forEach((a, i) =>
      texto(st, `${i + 1}. ${a.tipo}${a.nome_original ? ` - ${a.nome_original}` : ""}`, { size: 9, gap: 1 })
    );

  if (aprov.length > 0) {
    secao(st, "Decisões");
    aprov.forEach((a) =>
      texto(st, `${a.aprovador}: ${decisoes[a.decisao] || a.decisao}${a.motivo ? ` - ${a.motivo}` : ""} (${dataHora(a.decidido_em)})`, { size: 9, gap: 1 })
    );
  }

  secao(st, "Dinheiro enviado");
  if (pags.length === 0) texto(st, "Ainda não foi enviado dinheiro.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Valor", peso: 1.4, align: "right" },
        { titulo: "Método", peso: 1.2 },
        { titulo: "Referência", peso: 1.6 },
        { titulo: "Financeiro", peso: 2 },
        { titulo: "Data", peso: 1.6 },
      ],
      linhas: pags.map((p) => [money(p.valor), p.metodo, p.referencia || "-", p.financeiro, dataHora(p.enviado_em)]),
    });
  if (credito > 0)
    texto(st, `Saldo abatido aplicado: ${money(credito)} (creditado de uma requisição anterior).`, {
      size: 9,
      gap: 2,
    });

  secao(st, "Compras");
  if (compras.length === 0) texto(st, "Ainda sem comprovativo de compra.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Valor gasto", peso: 1.5, align: "right" },
        { titulo: "Data da compra", peso: 1.5 },
      ],
      linhas: compras.map((c) => [money(c.valor_gasto), data(c.data_compra)]),
    });

  resumo(st, [
    { rotulo: "Total enviado", valor: money(enviado) },
    { rotulo: "Saldo abatido aplicado", valor: money(credito) },
    { rotulo: "Total financiado", valor: money(financiado) },
    { rotulo: "Total gasto", valor: money(gasto) },
    { rotulo: "Saldo", valor: money(financiado - gasto) },
  ]);

  if (acerto) {
    secao(st, "Acerto");
    resumo(st, [
      { rotulo: "Valor enviado", valor: money(acerto.valor_enviado) },
      { rotulo: "Valor gasto", valor: money(acerto.valor_gasto) },
      { rotulo: "Saldo", valor: money(acerto.saldo) },
      { rotulo: "Estado", valor: acerto.estado.replaceAll("_", " ") },
    ]);
    if (acerto.comprovativo_url) texto(st, "Comprovativo da devolução anexado.", { size: 9 });
  }

  if (reembolsos?.length) {
    secao(st, "Reembolsos ao mestre");
    tabela(st, {
      colunas: [
        { titulo: "Valor", peso: 1.4, align: "right" },
        { titulo: "Data", peso: 1.6 },
        { titulo: "Comprovativo", peso: 1.4 },
      ],
      linhas: reembolsos.map((x) => [money(x.valor), dataHora(x.criado_em), x.comprovativo_url ? "anexado" : "-"]),
    });
  }

  if (coment.length > 0) {
    secao(st, "Comentários");
    coment.forEach((c) =>
      texto(st, `${c.nome} (${dataHora(c.criado_em)}): ${c.texto}`, { size: 9, gap: 2 })
    );
  }

  secao(st, "Histórico");
  if (hist.length === 0) texto(st, "Sem histórico.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Data", peso: 1.6 },
        { titulo: "De", peso: 1.4 },
        { titulo: "Para", peso: 1.4 },
        { titulo: "Utilizador", peso: 1.6 },
      ],
      linhas: hist.map((h) => [
        dataHora(h.criado_em),
        ESTADOS[h.estado_anterior] || "-",
        ESTADOS[h.estado_novo] || h.estado_novo,
        h.nome || "-",
      ]),
    });

  const pdf = await finalizar(st);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="requisicao-${r.codigo}.pdf"`,
    },
  });
}
