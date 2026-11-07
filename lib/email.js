// Envio de email por API HTTP (Resend). Sem chave configurada a app funciona
// na mesma: os avisos ficam só na aplicação (e no WhatsApp/SMS, se ligados).

export const emailConfigurado = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function enviarEmail({ para, assunto, texto }) {
  if (!emailConfigurado() || !para) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [para],
      subject: String(assunto || "Moz Teles").slice(0, 200),
      text: String(texto || "").slice(0, 8000),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detalhe = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Email ${res.status}: ${detalhe}`);
  }
  return true;
}
