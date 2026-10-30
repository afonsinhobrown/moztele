import { put } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";
import { armazenamentoConfigurado, guardarFicheiro } from "./r2";

const MAX = 4 * 1024 * 1024; // 4 MB (limite da Vercel para pedidos é 4,5 MB)

// Guarda um ficheiro e devolve o URL a gravar na base de dados.
// Prioridade: Cloudflare R2 (OBJECT_STORAGE_*) → Vercel Blob → disco local (só em desenvolvimento).
export async function guardar(file, pasta) {
  if (!file || typeof file === "string" || !file.size) return null;
  if (file.size > MAX) throw new Error("Ficheiro acima de 4 MB: reduza a foto ou o PDF.");
  const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${String(file.name).replace(/[^\w.-]/g, "_")}`;

  if (armazenamentoConfigurado()) {
    const chave = `${pasta}/${nome}`;
    await guardarFicheiro(chave, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    return `/api/ficheiros/${chave}`;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const b = await put(`${pasta}/${nome}`, file, { access: "public" });
    return b.url;
  }

  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Armazenamento não configurado. Defina OBJECT_STORAGE_* (R2) ou BLOB_READ_WRITE_TOKEN na Vercel."
    );

  // Desenvolvimento local: grava em public/uploads
  const dir = path.join(process.cwd(), "public", "uploads", pasta);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, nome), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${pasta}/${nome}`;
}
