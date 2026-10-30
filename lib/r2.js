// Cliente mínimo para Cloudflare R2 (API compatível com S3), sem dependências.
// Assina pedidos com AWS Signature V4 e usa apenas node:crypto + fetch.
import crypto from "node:crypto";

const ALGORITMO = "AWS4-HMAC-SHA256";

const configuracao = () => ({
  endpoint: String(process.env.OBJECT_STORAGE_ENDPOINT || "").replace(/\/+$/, ""),
  bucket: String(process.env.OBJECT_STORAGE_BUCKET || ""),
  region: String(process.env.OBJECT_STORAGE_REGION || "auto"),
  accessKey: String(process.env.OBJECT_STORAGE_ACCESS_KEY_ID || ""),
  secretKey: String(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || ""),
});

export function armazenamentoConfigurado() {
  const c = configuracao();
  return Boolean(c.endpoint && c.bucket && c.accessKey && c.secretKey);
}

const sha256 = (dados) => crypto.createHash("sha256").update(dados).digest("hex");
const hmac = (chave, dados) => crypto.createHmac("sha256", chave).update(dados).digest();

// Codificação RFC 3986, como o SigV4 exige.
const codificar = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// Aceita apenas chaves simples (pastas/ficheiros sem "..", barras duplicadas, etc.).
function chaveSegura(chave) {
  const limpa = String(chave || "").replace(/^\/+|\/+$/g, "");
  if (!limpa || limpa.split("/").some((p) => !p || p === "." || p === ".." || !/^[\w.-]+$/.test(p)))
    throw new Error("Chave de ficheiro inválida.");
  return limpa;
}

function corpoDaResposta(res) {
  return res.text().then(
    (t) => t.slice(0, 300),
    () => ""
  );
}

async function pedido(metodo, chave, { corpo, tipoConteudo } = {}) {
  if (!armazenamentoConfigurado())
    throw new Error("Armazenamento não configurado: faltam as variáveis OBJECT_STORAGE_*.");

  const c = configuracao();
  const alvo = chaveSegura(chave);
  const caminho = "/" + [c.bucket, ...alvo.split("/")].map(codificar).join("/");
  const url = new URL(c.endpoint + caminho);

  const agora = new Date();
  const dataHora = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20240101T000000Z
  const dia = dataHora.slice(0, 8);
  const dados = corpo ? (Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo)) : Buffer.alloc(0);
  const hashCorpo = sha256(dados);

  // Cabeçalhos assinados (o "host" é enviado automaticamente pelo fetch, mas tem de entrar na assinatura).
  const cabecalhos = {
    host: url.host,
    "x-amz-content-sha256": hashCorpo,
    "x-amz-date": dataHora,
  };
  if (tipoConteudo) cabecalhos["content-type"] = tipoConteudo;

  const nomes = Object.keys(cabecalhos).sort();
  const cabecalhosCanonicos = nomes.map((n) => `${n}:${String(cabecalhos[n]).trim()}\n`).join("");
  const assinados = nomes.join(";");

  const pedidoCanonico = [metodo, caminho, "", cabecalhosCanonicos, assinados, hashCorpo].join("\n");
  const ambito = `${dia}/${c.region}/s3/aws4_request`;
  const paraAssinar = [ALGORITMO, dataHora, ambito, sha256(pedidoCanonico)].join("\n");

  const kData = hmac(`AWS4${c.secretKey}`, dia);
  const kRegiao = hmac(kData, c.region);
  const kServico = hmac(kRegiao, "s3");
  const kAssinatura = hmac(kServico, "aws4_request");
  const assinatura = crypto.createHmac("sha256", kAssinatura).update(paraAssinar).digest("hex");

  const enviar = { ...cabecalhos, authorization: `${ALGORITMO} Credential=${c.accessKey}/${ambito}, SignedHeaders=${assinados}, Signature=${assinatura}` };
  delete enviar.host; // o fetch define o Host a partir do URL

  const res = await fetch(url, {
    method: metodo,
    headers: enviar,
    body: dados.length ? dados : undefined,
    cache: "no-store",
  });
  return { res, alvo };
}

export async function guardarFicheiro(chave, corpo, tipoConteudo) {
  const { res } = await pedido("PUT", chave, {
    corpo,
    tipoConteudo: tipoConteudo || "application/octet-stream",
  });
  if (!res.ok) throw new Error(`R2: falha ao guardar (${res.status}): ${await corpoDaResposta(res)}`);
  return chaveSegura(chave);
}

export async function lerFicheiro(chave) {
  const { res } = await pedido("GET", chave);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2: falha ao ler (${res.status}): ${await corpoDaResposta(res)}`);
  return {
    corpo: Buffer.from(await res.arrayBuffer()),
    tipo: res.headers.get("content-type") || "application/octet-stream",
  };
}

export async function apagarFicheiro(chave) {
  const { res } = await pedido("DELETE", chave);
  if (!res.ok && res.status !== 404) throw new Error(`R2: falha ao apagar (${res.status}): ${await corpoDaResposta(res)}`);
}
