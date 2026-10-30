import { telefoneWhatsapp } from "./telefone.js";

// Envio de avisos por WhatsApp Cloud API (Meta). Sem as variáveis configuradas
// a aplicação funciona na mesma: só não manda mensagens fora da app.
export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function enviarWhatsapp(telefone, texto) {
  if (!whatsappConfigurado()) return false;
  const para = telefoneWhatsapp(telefone);
  if (!para) throw new Error("Telefone inválido para WhatsApp.");
  const versao = process.env.WHATSAPP_API_VERSION || "v21.0";
  const res = await fetch(
    `https://graph.facebook.com/${versao}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: para,
        type: "text",
        text: { preview_url: false, body: String(texto).slice(0, 4000) },
      }),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    const detalhe = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`WhatsApp ${res.status}: ${detalhe}`);
  }
  return true;
}
