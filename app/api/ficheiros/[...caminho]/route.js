import { NextResponse } from "next/server";
import { sessao } from "@/lib/auth";
import { armazenamentoConfigurado, lerFicheiro } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entrega os ficheiros privados guardados no R2 (comprovativos, orçamentos).
// O bucket não é público: só serve quem tem sessão válida na aplicação.
export async function GET(_req, { params }) {
  const s = await sessao();
  if (!s) return NextResponse.json({ erro: "Precisa de entrar." }, { status: 401 });

  const chave = (params.caminho || []).join("/");
  if (!chave || chave.split("/").some((p) => !p || p === "." || p === ".." || !/^[\w.-]+$/.test(p)))
    return NextResponse.json({ erro: "Caminho inválido." }, { status: 400 });
  if (!armazenamentoConfigurado()) return NextResponse.json({ erro: "Armazenamento não configurado." }, { status: 404 });

  try {
    const f = await lerFicheiro(chave);
    if (!f) return NextResponse.json({ erro: "Ficheiro não encontrado." }, { status: 404 });
    const nome = chave.split("/").pop().replace(/[^\w.-]/g, "_");
    return new NextResponse(f.corpo, {
      headers: {
        "content-type": f.tipo,
        "content-length": String(f.corpo.length),
        "content-disposition": `inline; filename="${nome}"`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    console.error(`Falha ao ler o ficheiro ${chave}:`, e);
    return NextResponse.json({ erro: "Não foi possível ler o ficheiro." }, { status: 500 });
  }
}
