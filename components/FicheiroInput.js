"use client";
import { useState } from "react";

const LIMITE = 4 * 1024 * 1024;
const KB = (n) => `${Math.round(n / 1024)} KB`;

// Reduz fotos grandes no browser antes do upload (as fotos de telemóvel
// passam facilmente dos 4 MB) e mostra o que vai ser enviado.
async function comprimir(file) {
  if (!file.type.startsWith("image/") || file.size <= 1.2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    bitmap.close?.();
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], String(file.name).replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export default function FicheiroInput({
  name,
  multiple = false,
  required = false,
  accept = "application/pdf,image/jpeg,image/png",
  label,
}) {
  const [estado, setEstado] = useState({ nomes: [], erro: "", aProcessar: false });

  async function aoEscolher(e) {
    const originais = [...(e.target.files || [])];
    if (!originais.length) return;
    setEstado({ nomes: [], erro: "", aProcessar: true });
    const transferencia = new DataTransfer();
    const nomes = [];
    let erro = "";
    for (const f of originais) {
      const final = await comprimir(f);
      if (final.size > LIMITE) {
        erro = `"${final.name}" tem ${KB(final.size)}. O máximo é 4 MB.`;
        continue;
      }
      transferencia.items.add(final);
      nomes.push(`${final.name} · ${KB(final.size)}${final !== f ? " (comprimido)" : ""}`);
    }
    try {
      e.target.files = transferencia.files;
    } catch {
      /* alguns browsers não deixam; o servidor valida de qualquer forma */
    }
    setEstado({ nomes, erro, aProcessar: false });
  }

  return (
    <div className="ficheiro-input">
      {label && <label>{label}</label>}
      <input
        type="file"
        name={name}
        multiple={multiple}
        required={required}
        accept={accept}
        onChange={aoEscolher}
      />
      {estado.aProcessar && <p className="mut">A preparar ficheiros…</p>}
      {estado.nomes.length > 0 && (
        <p className="mut pequeno">
          {estado.nomes.map((n) => (
            <span key={n} className="etiqueta-ficheiro">
              📎 {n}
            </span>
          ))}
        </p>
      )}
      {estado.erro && <p className="erro pequeno">{estado.erro}</p>}
      <p className="mut pequeno">PDF, JPG ou PNG · máximo 4 MB por ficheiro.</p>
    </div>
  );
}
