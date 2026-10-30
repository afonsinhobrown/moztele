import crypto from "node:crypto";

export const MAX_FICHEIRO = 4 * 1024 * 1024; // limite da Vercel para pedidos (4,5 MB)
export const MAX_FICHEIRO_TEXTO = "4 MB";

export class ErroFicheiro extends Error {
  constructor(mensagem, codigo = "ficheiro") {
    super(mensagem);
    this.name = "ErroFicheiro";
    this.codigo = codigo;
  }
}

// Só estes tipos entram. O tipo é decidido pelos primeiros bytes do ficheiro,
// não pelo que o browser diz — evita HTML/SVG disfarçado de imagem.
export const TIPOS = [
  { mime: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  {
    mime: "image/png",
    ext: "png",
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

const comecaCom = (buf, magic) =>
  buf.length >= magic.length && magic.every((b, i) => buf[i] === b);

export function detectarTipo(buf) {
  return TIPOS.find((t) => comecaCom(buf, t.magic)) || null;
}

export const tipoPermitido = (mime) => TIPOS.some((t) => t.mime === mime);

export function hashSha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Pastas onde a aplicação escreve e a finalidade de cada uma (para a base de dados).
export const PASTAS = {
  orcamentos: "orcamento",
  transferencias: "pagamento",
  compras: "compra",
  acertos: "acerto",
  reembolsos: "reembolso",
};

export const FINALIDADES = new Set(Object.values(PASTAS));
export const FINALIDADES_FINANCEIRAS = ["pagamento", "compra", "acerto", "reembolso"];

export function finalidadeDePasta(pasta) {
  const f = PASTAS[pasta];
  if (!f) throw new ErroFicheiro("Pasta de ficheiros inválida.", "pasta");
  return f;
}

export function nomeFicheiroSeguro(nome, ext) {
  const base = String(nome || "ficheiro")
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 70);
  return `${base || "ficheiro"}.${ext}`;
}

export function chaveNova(pasta, nomeOriginal) {
  const tipo = detectarTipoPorExtensao(nomeOriginal);
  const nome = nomeFicheiroSeguro(nomeOriginal, tipo);
  const aleatorio = crypto.randomBytes(4).toString("hex");
  return `${pasta}/${Date.now()}-${aleatorio}-${nome}`;
}

function detectarTipoPorExtensao(nome) {
  const ext = String(nome || "").split(".").pop()?.toLowerCase();
  const tipo = TIPOS.find((t) => t.ext === ext);
  return tipo ? tipo.ext : "bin";
}

// Chaves que esta aplicação pode gerar (defesa contra "..", barras duplas, etc.).
export function chaveValida(chave) {
  if (!chave || typeof chave !== "string" || chave.length > 300) return false;
  return chave.split("/").every((p) => p && p !== "." && p !== ".." && /^[\w.-]+$/.test(p));
}
