import { put } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";
import { armazenamentoConfigurado, guardarFicheiro as guardarNoR2, apagarFicheiro as apagarNoR2 } from "./r2";
import {
  MAX_FICHEIRO,
  ErroFicheiro,
  chaveNova,
  detectarTipo,
  finalidadeDePasta,
  hashSha256,
} from "./ficheiros";

// Guarda um ficheiro e devolve os dados a registar na base de dados:
// { url, chave, hash, mime, tamanho, nome }.
// Prioridade: Cloudflare R2 → Vercel Blob → disco local (só em desenvolvimento).
export async function guardar(file, pasta) {
  finalidadeDePasta(pasta); // valida a pasta
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return null;
  if (!file.size) return null;
  if (file.size > MAX_FICHEIRO) throw new ErroFicheiro("Ficheiro acima de 4 MB: reduza a foto ou o PDF.", "tamanho");

  const conteudo = Buffer.from(await file.arrayBuffer());
  if (!conteudo.length) return null;

  // O tipo vem do conteúdo, não do nome nem do browser.
  const tipo = detectarTipo(conteudo);
  if (!tipo)
    throw new ErroFicheiro("Só são aceites ficheiros PDF, JPG ou PNG. Converta o documento e tente outra vez.", "tipo");

  const hash = hashSha256(conteudo);
  const chave = chaveNova(pasta, file.name);
  const base = {
    hash,
    mime: tipo.mime,
    tamanho: conteudo.length,
    nome: String(file.name || "ficheiro").slice(0, 255),
  };

  if (armazenamentoConfigurado()) {
    await guardarNoR2(chave, conteudo, tipo.mime);
    return { ...base, url: `/api/ficheiros/${chave}`, chave };
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const b = await put(chave, new Blob([conteudo], { type: tipo.mime }), {
      access: "public",
      addRandomSuffix: false,
    });
    return { ...base, url: b.url, chave: null };
  }

  if (process.env.NODE_ENV === "production")
    throw new ErroFicheiro(
      "Armazenamento não configurado. Defina OBJECT_STORAGE_* (R2) ou BLOB_READ_WRITE_TOKEN na Vercel.",
      "configuracao"
    );

  // Desenvolvimento local: grava em public/uploads
  const destino = path.join(process.cwd(), "public", "uploads", chave);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, conteudo);
  return { ...base, url: `/uploads/${chave}`, chave };
}

// Limpeza quando a transacção falha depois do upload (nada fica órfão).
export async function apagarFicheiroGuardado(f) {
  if (!f?.chave) return;
  try {
    if (armazenamentoConfigurado()) await apagarNoR2(f.chave);
    else if (!process.env.BLOB_READ_WRITE_TOKEN)
      await fs.rm(path.join(process.cwd(), "public", "uploads", f.chave), { force: true });
  } catch (e) {
    console.error("Falha ao limpar ficheiro órfão:", e);
  }
}
