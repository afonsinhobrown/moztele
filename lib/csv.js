// CSV para Excel em português: separador ";", UTF-8 com BOM e CRLF.
const BOM = "\uFEFF";

function celula(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function paraCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(";");
  const corpo = linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  return BOM + [cabecalho, corpo].filter(Boolean).join("\r\n") + "\r\n";
}

export function nomeCsv(base = "exportacao") {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${base}-${iso}.csv`;
}

export function respostaCsv(conteudo, nome) {
  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
