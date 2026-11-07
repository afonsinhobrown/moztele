import crypto from "node:crypto";

// TOTP (RFC 6238) compatível com Google Authenticator, Authy, 1Password, etc.
// Implementado com node:crypto para não acrescentar dependências.

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASSOS = 30; // segundos por código
const DIGITOS = 6;

export function base32Codificar(buffer) {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const b of buffer) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decodificar(texto) {
  const limpo = String(texto || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) continue;
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const gerarSegredo = () => base32Codificar(crypto.randomBytes(20));

const passoAtual = (agora = Date.now()) => Math.floor(agora / 1000 / PASSOS);

export function codigoTotp(segredo, passo = passoAtual()) {
  const chave = base32Decodificar(segredo);
  if (!chave.length) return "";
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = crypto.createHmac("sha1", chave).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

// Aceita o código do passo anterior e do seguinte (relógios desalinhados).
export function verificarTotp(segredo, codigo, janela = 1, agora = Date.now()) {
  const limpo = String(codigo || "").replace(/\D/g, "");
  if (limpo.length !== DIGITOS || !segredo) return false;
  const passo = passoAtual(agora);
  for (let d = -janela; d <= janela; d++) {
    if (codigoTotp(segredo, passo + d) === limpo) return true;
  }
  return false;
}

export function uriOtpauth(segredo, conta, emissor = "Moz Teles") {
  const etiqueta = encodeURIComponent(`${emissor}:${conta}`);
  const params = new URLSearchParams({
    secret: segredo,
    issuer: emissor,
    digits: String(DIGITOS),
    period: String(PASSOS),
    algorithm: "SHA1",
  });
  return `otpauth://totp/${etiqueta}?${params.toString()}`;
}
