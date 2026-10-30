import { NextResponse } from "next/server";
import { sessao } from "@/lib/auth";
import { dadosRelatorioRequisicoes, URGENCIAS } from "@/lib/relatorios";
import { ESTADOS } from "@/lib/ui";
import {
  criarDocumento, texto, resumo, secao, tabela, finalizar, money, dataHora,
} from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const s = await sessao();
  if (!s) return new NextResponse("Não autorizado", { status: 401 });
  if (!["admin", "financeiro", "aprovador"].includes(s.perfil))
    return new NextResponse("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const d = await dadosRelatorioRequisicoes(sp, s.perfil, { limite: 5000, offset: 0 });
  const f = d.filtros;

  const partes = [];
  if (f.estado) partes.push(`Estado: ${ESTADOS[f.estado]}`);
  if (f.urgencia) partes.push(`Urgência: ${URGENCIAS[f.urgencia]}`);
  if (f.de || f.ate) partes.push(`Período: ${f.de || "início"} a ${f.ate || "hoje"}`);
  if (f.mestre) partes.push(`Mestre: ${f.mestre}`);
  if (f.site) partes.push(`Site: ${d.sites.find((x) => String(x.id) === String(f.site))?.nome || f.site}`);
  if (f.texto) partes.push(`Texto: ${f.texto}`);

  const st = await criarDocumento({
    titulo: "Relatório de requisições",
    subtitulo: partes.length ? partes.join("  |  ") : "Todos os registos",
  });

  resumo(st, [
    { rotulo: "Requisições encontradas", valor: String(d.n) },
    { rotulo: "Valor estimado total", valor: money(d.total) },
  ]);

  secao(st, "Lista de requisições");
  if (d.rows.length === 0) {
    texto(st, "Nenhuma requisição corresponde aos critérios seleccionados.");
  } else {
    tabela(st, {
      colunas: [
        { titulo: "Código", peso: 1.3 },
        { titulo: "Mestre", peso: 2 },
        { titulo: "Site", peso: 1.9 },
        { titulo: "Valor", peso: 1.3, align: "right" },
        { titulo: "Urgência", peso: 0.9 },
        { titulo: "Estado", peso: 1.2 },
        { titulo: "Data", peso: 1.4 },
      ],
      linhas: d.rows.map((r) => [
        r.codigo,
        r.mestre,
        r.site,
        money(r.valor_estimado),
        URGENCIAS[r.urgencia] || r.urgencia,
        ESTADOS[r.estado] || r.estado,
        dataHora(r.criado_em),
      ]),
    });
  }

  const pdf = await finalizar(st);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-requisicoes.pdf"`,
    },
  });
}
