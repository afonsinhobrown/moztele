import { q1 } from "@/lib/db";
import { armazenamentoConfigurado } from "@/lib/r2";
import { whatsappConfigurado } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verificação simples para monitorização (Vercel, UptimeRobot, etc.).
export async function GET() {
  let baseDados = false;
  try {
    await q1("SELECT 1 AS ok");
    baseDados = true;
  } catch {}

  const armazenamento = armazenamentoConfigurado();
  const whatsapp = whatsappConfigurado();
  const tudo = baseDados && armazenamento;

  return Response.json(
    {
      ok: tudo,
      baseDados,
      armazenamento,
      whatsapp,
      versao: "1.1.0",
      hora: new Date().toISOString(),
    },
    { status: tudo ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
