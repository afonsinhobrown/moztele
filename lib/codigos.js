import crypto from "node:crypto";

// Sem caracteres que se confundem ao ler por telefone (0/O, 1/I/L).
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO = 8;

export const VALIDADE_HORAS = 24;

// Código do tipo XXXX-XXXX, fácil de ditar. 8 caracteres deste alfabeto ≈ 40 bits.
export function gerarCodigo() {
  const bytes = crypto.randomBytes(TAMANHO);
  let s = "";
  for (let i = 0; i < TAMANHO; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Aceita com ou sem hífen, minúsculas, espaços — o que a pessoa escrever.
export function normalizarCodigo(valor) {
  return String(valor ?? "")
    .toUpperCase()
    .split("")
    .filter((c) => ALFABETO.includes(c))
    .join("")
    .slice(0, TAMANHO + 2);
}

export const hashCodigo = (valor) =>
  crypto.createHash("sha256").update(normalizarCodigo(valor)).digest("hex");

// Comparação em tempo constante, para não revelar o código pelos tempos.
export function codigoIgual(valor, hashGuardado) {
  const a = Buffer.from(hashCodigo(valor), "utf8");
  const b = Buffer.from(String(hashGuardado || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
