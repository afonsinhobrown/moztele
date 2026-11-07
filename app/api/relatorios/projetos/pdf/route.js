import { NextResponse } from "next/server";
import { sessao } from "@/lib/auth";
import { dadosRelatorioProjetos } from "@/lib/relatorios";
import { criarDocumento, texto, resumo, secao, tabela, finalizar, money } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const s = await sessao();
  if (!s) return new NextResponse("Não autorizado", { status: 401 });
  if (!["admin", "financeiro", "aprovador"].includes(s.perfil))
    return new NextResponse("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rows = await dadosRelatorioProjetos(sp);
  const sub = sp.de || sp.ate ? `Período: ${sp.de || "início"} a ${sp.ate || "hoje"}` : "Todo o período";

  const total = (campo) => rows.reduce((a, r) => a + Number(r[campo] || 0), 0);

  const st = await criarDocumento({ titulo: "Relatório por projecto", subtitulo: sub });

  resumo(st, [
    { rotulo: "Orçamento total", valor: money(total("orcamento_total")) },
    { rotulo: "Solicitado", valor: money(total("solicitado")) },
    { rotulo: "Aprovado", valor: money(total("aprovado")) },
    { rotulo: "Transferido", valor: money(total("transferido")) },
    { rotulo: "Comprovado", valor: money(total("comprovado")) },
    { rotulo: "Saldo", valor: money(total("transferido") - total("comprovado")) },
  ]);

  secao(st, "Orçamento por projecto");
  if (rows.length === 0) texto(st, "Sem projectos no período.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Projecto", peso: 3 },
        { titulo: "Área", peso: 1.6 },
        { titulo: "Orçamento", peso: 1.5, align: "right" },
        { titulo: "Solicitado", peso: 1.5, align: "right" },
        { titulo: "Aprovado", peso: 1.5, align: "right" },
        { titulo: "Transferido", peso: 1.5, align: "right" },
        { titulo: "Comprovado", peso: 1.5, align: "right" },
        { titulo: "Saldo", peso: 1.4, align: "right" },
      ],
      linhas: rows.map((r) => [
        `${r.codigo} - ${r.nome}`,
        r.area || "-",
        money(r.orcamento_total),
        money(r.solicitado),
        money(r.aprovado),
        money(r.transferido),
        money(r.comprovado),
        money(Number(r.transferido) - Number(r.comprovado)),
      ]),
    });

  const pdf = await finalizar(st);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-projetos.pdf"`,
    },
  });
}
