// SMS por gateway HTTP genérico. Configure SMS_URL e SMS_TOKEN com o seu
// fornecedor (Africa's Talking, Twilio, gateway local) e o corpo esperado:
// POST {"to": "...", "message": "..."} com Authorization: Bearer <token>.
// Sem configuração, não é enviado nada.

export const smsConfigurado = () => Boolean(process.env.SMS_URL && process.env.SMS_TOKEN);

export async function enviarSms(telefone, texto) {
  if (!smsConfigurado() || !telefone) return false;
  const res = await fetch(process.env.SMS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SMS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: String(telefone),
      message: String(texto || "").slice(0, 480),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detalhe = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`SMS ${res.status}: ${detalhe}`);
  }
  return true;
}
