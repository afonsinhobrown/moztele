// Normalização de telefones moçambicanos. Guardamos e mostramos sempre igual,
// para o login não falhar por causa de espaços ou do indicativo.
export function normalizarTelefone(v) {
  let t = String(v ?? "").trim().replace(/[^\d+]/g, "");
  if (t.startsWith("+")) t = "+" + t.slice(1).replace(/\+/g, "");
  else t = t.replace(/\+/g, "");
  return t;
}

export function telefoneValido(t) {
  return /^\+?\d{8,15}$/.test(String(t || ""));
}

// Número internacional para a API do WhatsApp (sem "+").
export function telefoneWhatsapp(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("258")) return d;
  if (d.length === 9) return `258${d}`; // 84/82/86/87 + 8 dígitos
  return d;
}
