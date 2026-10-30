import { sessaoActiva } from "@/lib/auth";
import { dadosRelatorioRequisicoes, URGENCIAS } from "@/lib/relatorios";
import { ESTADOS } from "@/lib/ui";
import { nomeCsv, paraCsv, respostaCsv } from "@/lib/csv";
import { dt } from "@/lib/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export async function GET(req) {
  const s = await sessaoActiva();
  if (!s) return new Response("Não autorizado", { status: 401 });
  if (!["admin", "financeiro", "aprovador"].includes(s.perfil))
    return new Response("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const d = await dadosRelatorioRequisicoes(sp, s.perfil, { limite: 5000, offset: 0 });

  const csv = paraCsv(
    [
      { titulo: "Código" },
      { titulo: "Mestre" },
      { titulo: "Site" },
      { titulo: "Valor estimado (MZN)" },
      { titulo: "Urgência" },
      { titulo: "Estado" },
      { titulo: "Criada em" },
    ],
    d.rows.map((r) => [
      r.codigo,
      r.mestre,
      r.site,
      money(r.valor_estimado),
      URGENCIAS[r.urgencia] || r.urgencia,
      ESTADOS[r.estado] || r.estado,
      dt(r.criado_em),
    ])
  );

  return respostaCsv(csv, nomeCsv("requisicoes"));
}
