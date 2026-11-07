import { telefoneWhatsapp } from "./telefone.js";

// Envio de avisos por WhatsApp Cloud API (Meta). Sem as variáveis configuradas
// a aplicação funciona na mesma: só não manda mensagens fora da app.
export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// A API só entrega texto livre dentro da janela de 24 h desde a última mensagem
// do utilizador. Para avisos proactivos é preciso um template aprovado na Meta.
export const whatsappTemplate = () => process.env.WHATSAPP_TEMPLATE_ALERTA || null;

const versao = () => process.env.WHATSAPP_API_VERSION || "v21.0";

async function enviar(corpo) {
  const res = await fetch(
    `https://graph.facebook.com/${versao()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    const detalhe = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`WhatsApp ${res.status}: ${detalhe}`);
  }
  return true;
}

const numero = (telefone) => {
  const para = telefoneWhatsapp(telefone);
  if (!para) throw new Error("Telefone inválido para WhatsApp.");
  return para;
};

export async function enviarWhatsapp(telefone, texto) {
  if (!whatsappConfigurado()) return false;
  return enviar({
    messaging_product: "whatsapp",
    to: numero(telefone),
    type: "text",
    text: { preview_url: false, body: String(texto).slice(0, 4000) },
  });
}

// Template com uma variável no corpo ({{1}}). É o que permite avisar fora da
// janela de 24 h: por exemplo "Moz Teles: requisição parada ({{1}})".
export async function enviarWhatsappTemplate(telefone, parametros = []) {
  const nome = whatsappTemplate();
  if (!whatsappConfigurado() || !nome) return false;
  const componentes = parametros.length
    ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t) })) }]
    : undefined;
  return enviar({
    messaging_product: "whatsapp",
    to: numero(telefone),
    type: "template",
    template: {
      name: nome,
      language: { code: process.env.WHATSAPP_TEMPLATE_IDIOMA || "pt_BR" },
      ...(componentes ? { components: componentes } : {}),
    },
  });
}

// Prefere o template (entrega garantida) e cai para texto livre se falhar.
export async function enviarAlerta(telefone, texto) {
  if (!whatsappConfigurado()) return false;
  if (whatsappTemplate()) {
    try {
      return await enviarWhatsappTemplate(telefone, [texto]);
    } catch {
      // Template recusado (nome/idioma/variáveis): tenta o texto simples.
    }
  }
  return enviarWhatsapp(telefone, texto);
}
