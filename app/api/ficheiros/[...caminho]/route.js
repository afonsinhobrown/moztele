import { NextResponse } from "next/server";
import { sessaoActiva } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { armazenamentoConfigurado, lerFicheiro } from "@/lib/r2";
import { chaveValida, tipoPermitido } from "@/lib/ficheiros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entrega os ficheiros privados guardados no R2. Só serve quem pode ver a
// requisição a que o ficheiro pertence (o bucket nunca é público).
export async function GET(_req, { params }) {
  const s = await sessaoActiva();
  if (!s) return NextResponse.json({ erro: "Precisa de entrar." }, { status: 401 });

  const chave = (params.caminho || []).join("/");
  if (!chaveValida(chave)) return NextResponse.json({ erro: "Caminho inválido." }, { status: 400 });
  if (!armazenamentoConfigurado())
    return NextResponse.json({ erro: "Armazenamento não configurado." }, { status: 404 });

  const f = await q1(
    `SELECT f.tipo_mime, f.requisicao_id, r.mestre_id, st.area_id
       FROM ficheiros f
       LEFT JOIN requisicoes r ON r.id = f.requisicao_id
       LEFT JOIN sites st ON st.id = r.site_id
      WHERE f.chave = $1`,
    [chave]
  );
  if (!f) return NextResponse.json({ erro: "Ficheiro não encontrado." }, { status: 404 });
  if (s.perfil === "mestre" && String(f.mestre_id) !== String(s.id))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (s.perfil === "aprovador" && s.area_id && Number(f.area_id) !== Number(s.area_id))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  try {
    const obj = await lerFicheiro(chave);
    if (!obj) return NextResponse.json({ erro: "Ficheiro não encontrado." }, { status: 404 });

    const mime = tipoPermitido(f.tipo_mime) ? f.tipo_mime : "application/octet-stream";
    const inline = mime === "application/pdf" || mime.startsWith("image/");
    const nome = chave.split("/").pop().replace(/[^\w.-]/g, "_");
    return new NextResponse(obj.corpo, {
      headers: {
        "content-type": mime,
        "content-length": String(obj.corpo.length),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${nome}"`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        ...(inline ? {} : { "content-security-policy": "default-src 'none'; sandbox" }),
      },
    });
  } catch (e) {
    console.error(`Falha ao ler o ficheiro ${chave}:`, e);
    return NextResponse.json({ erro: "Não foi possível ler o ficheiro." }, { status: 500 });
  }
}
