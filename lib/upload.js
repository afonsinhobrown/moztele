import { put } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

const MAX = 4 * 1024 * 1024; // 4 MB (limite da Vercel para pedidos é 4,5 MB)

export async function guardar(file, pasta) {
  if (!file || typeof file === "string" || !file.size) return null;
  if (file.size > MAX) throw new Error("Ficheiro acima de 4 MB: reduza a foto ou o PDF.");
  const nome = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const b = await put(`${pasta}/${nome}`, file, { access: "public" });
    return b.url;
  }
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "BLOB_READ_WRITE_TOKEN não está configurado. Ligue um Blob ao projecto na Vercel."
    );
  // Desenvolvimento local: grava em public/uploads
  const dir = path.join(process.cwd(), "public", "uploads", pasta);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, nome), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${pasta}/${nome}`;
}
