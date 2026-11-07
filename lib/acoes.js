import { q, q1 } from "@/lib/db";

// Limite de frequência por utilizador e por acção.
// É uma travagem simples contra cliques repetidos e spam de comentários;
// o limite do login (por telefone e IP) continua em lib/limite.js.
export async function limitar(s, acao, maximo, janelaMinutos) {
  if (!s?.id) return true;
  const chave = `${acao}:${s.id}`;
  const { n } = await q1(
    `SELECT count(*)::int AS n FROM limites_acao
      WHERE chave=$1 AND criado_em > now() - ($2 || ' minutes')::interval`,
    [chave, String(janelaMinutos)]
  );
  if (Number(n) >= maximo) return false;
  await q("INSERT INTO limites_acao (chave) VALUES ($1)", [chave]);
  // Limpeza oportunista, sem cron.
  if (Math.random() < 0.03)
    await q("DELETE FROM limites_acao WHERE criado_em < now() - interval '2 days'");
  return true;
}
