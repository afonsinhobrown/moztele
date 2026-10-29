import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const W = 842;
const H = 595;
const M = 40;
const CONTENT = W - M * 2;
const AZUL = rgb(0.06, 0.24, 0.43);
const CINZA = rgb(0.42, 0.46, 0.52);
const ESCURO = rgb(0.11, 0.14, 0.19);
const FUNDO = rgb(0.94, 0.96, 0.98);
const LINHA = rgb(0.85, 0.88, 0.91);

const limpar = (t) => String(t).replace(/\u00a0/g, " ");

export const money = (v) =>
  limpar(
    `${Number(v || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`
  );

export const dataHora = (d) =>
  d
    ? limpar(
        new Date(d).toLocaleString("pt-PT", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Africa/Maputo",
        })
      )
    : "";

export const data = (d) =>
  d ? limpar(new Date(d).toLocaleDateString("pt-PT", { timeZone: "Africa/Maputo" })) : "";

function wrapText(texto, font, size, max) {
  const palavras = String(texto ?? "").split(/\s+/).filter(Boolean);
  const linhas = [];
  let linha = "";
  for (const p of palavras) {
    const t = linha ? `${linha} ${p}` : p;
    if (font.widthOfTextAtSize(t, size) > max && linha) {
      linhas.push(linha);
      linha = p;
    } else {
      linha = t;
    }
  }
  if (linha) linhas.push(linha);
  return linhas.length ? linhas : [""];
}

function truncar(texto, font, size, max) {
  let t = String(texto ?? "");
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  const ell = "...";
  while (t.length > 1 && font.widthOfTextAtSize(t + ell, size) > max) t = t.slice(0, -1);
  return t + ell;
}

function novaPagina(st, primeira = false) {
  st.page = st.doc.addPage([W, H]);
  st.page.drawText(st.titulo, { x: M, y: H - 40, size: 16, font: st.bold, color: AZUL });
  st.page.drawLine({
    start: { x: M, y: H - 50 },
    end: { x: W - M, y: H - 50 },
    thickness: 0.7,
    color: LINHA,
  });
  let y = H - 68;
  if (primeira && st.subtitulo) {
    const linhas = wrapText(st.subtitulo, st.font, 9, CONTENT);
    for (const l of linhas) {
      st.page.drawText(l, { x: M, y, size: 9, font: st.font, color: CINZA });
      y -= 12;
    }
    y -= 6;
  }
  st.y = y;
}

function precisa(st, altura) {
  if (st.y - altura < M + 26) {
    novaPagina(st);
    return true;
  }
  return false;
}

export async function criarDocumento({ titulo, subtitulo }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const st = { doc, font, bold, titulo, subtitulo, page: null, y: 0 };
  novaPagina(st, true);
  return st;
}

export function texto(st, txt, { size = 10, color = ESCURO, bold = false, gap = 4 } = {}) {
  const font = bold ? st.bold : st.font;
  const linhas = wrapText(txt, font, size, CONTENT);
  for (const l of linhas) {
    precisa(st, size + 2);
    st.page.drawText(l, { x: M, y: st.y, size, font, color });
    st.y -= size + 3;
  }
  st.y -= gap;
}

export function resumo(st, itens) {
  for (const it of itens) {
    precisa(st, 16);
    st.page.drawText(it.rotulo + ":", { x: M, y: st.y, size: 10, font: st.bold, color: AZUL });
    const rotulo = it.rotulo + ": ";
    const x = M + st.bold.widthOfTextAtSize(rotulo, 10);
    st.page.drawText(String(it.valor), { x, y: st.y, size: 10, font: st.font, color: ESCURO });
    st.y -= 16;
  }
  st.y -= 6;
}

export function secao(st, titulo) {
  st.y -= 6;
  precisa(st, 30);
  st.page.drawText(titulo, { x: M, y: st.y, size: 12, font: st.bold, color: AZUL });
  st.y -= 18;
}

function cabecalho(st, colunas, larguras) {
  st.page.drawRectangle({ x: M, y: st.y - 14, width: CONTENT, height: 18, color: FUNDO });
  let x = M;
  colunas.forEach((c, i) => {
    st.page.drawText(String(c.titulo), {
      x: x + 4,
      y: st.y - 10,
      size: 8.5,
      font: st.bold,
      color: AZUL,
    });
    x += larguras[i];
  });
  st.y -= 19;
}

export function tabela(st, { colunas, linhas }) {
  const pesos = colunas.map((c) => c.peso || 1);
  const totalPesos = pesos.reduce((a, b) => a + b, 0);
  const larguras = pesos.map((p) => (p / totalPesos) * CONTENT);

  precisa(st, 24);
  cabecalho(st, colunas, larguras);

  let idx = 0;
  for (const linha of linhas) {
    if (st.y - 16 < M + 26) {
      novaPagina(st);
      cabecalho(st, colunas, larguras);
    }
    if (idx % 2 === 1)
      st.page.drawRectangle({ x: M, y: st.y - 13, width: CONTENT, height: 16, color: FUNDO });
    let x = M;
    linha.forEach((celula, i) => {
      const size = 8.5;
      const max = larguras[i] - 8;
      const txt = truncar(celula, st.font, size, max);
      const tw = st.font.widthOfTextAtSize(txt, size);
      const tx = colunas[i].align === "right" ? x + larguras[i] - 4 - tw : x + 4;
      st.page.drawText(txt, { x: tx, y: st.y - 10, size, font: st.font, color: ESCURO });
      x += larguras[i];
    });
    st.y -= 16;
    st.page.drawLine({
      start: { x: M, y: st.y + 3 },
      end: { x: W - M, y: st.y + 3 },
      thickness: 0.4,
      color: LINHA,
    });
    idx++;
  }
  st.y -= 10;
}

export async function finalizar(st) {
  const pages = st.doc.getPages();
  const total = pages.length;
  const gerado = `Moz Teles - gerado em ${dataHora(new Date())}`;
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: 28 },
      end: { x: W - M, y: 28 },
      thickness: 0.5,
      color: LINHA,
    });
    p.drawText(gerado, { x: M, y: 16, size: 8, font: st.font, color: CINZA });
    const label = `Pagina ${i + 1} de ${total}`;
    const w = st.font.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: W - M - w, y: 16, size: 8, font: st.font, color: CINZA });
  });
  return st.doc.save();
}
