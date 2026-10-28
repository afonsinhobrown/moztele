export const MT = (v) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" }).format(Number(v || 0));

export const dt = (d) =>
  d
    ? new Date(d).toLocaleString("pt-MZ", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Maputo" })
    : "";

export const ESTADOS = {
  rascunho: "Rascunho",
  submetido: "Submetido",
  correccao_pedida: "Correcção pedida",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  dinheiro_enviado: "Dinheiro enviado",
  compra_comprovada: "Compra comprovada",
  fechado: "Fechado",
  cancelado: "Cancelado",
};

export function Badge({ estado }) {
  return <span className={`badge b-${estado}`}>{ESTADOS[estado] || estado}</span>;
}
