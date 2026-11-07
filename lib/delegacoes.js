import { q } from "@/lib/db";

// Delegações de aprovação activas: quem está a decidir por quem.
// Uma delegação vale entre o início e o fim e pode ser cancelada antes do fim.

export const delegacoesAtivasPara = (paraId) =>
  q(
    `SELECT d.*, u.nome AS de_nome
       FROM delegacoes_aprovacao d
       JOIN utilizadores u ON u.id=d.de_id
      WHERE d.para_id=$1
        AND d.cancelada_em IS NULL
        AND now() BETWEEN d.inicio AND d.fim
      ORDER BY d.fim DESC`,
    [paraId]
  );

export const delegacoesAtivasDe = (deId) =>
  q(
    `SELECT d.*, u.nome AS para_nome
       FROM delegacoes_aprovacao d
       JOIN utilizadores u ON u.id=d.para_id
      WHERE d.de_id=$1
        AND d.cancelada_em IS NULL
        AND now() BETWEEN d.inicio AND d.fim
      ORDER BY d.fim DESC`,
    [deId]
  );

// Ids dos aprovadores de quem este utilizador é delegado (para saber se já votou).
export async function idsDelegadores(paraId) {
  const rows = await delegacoesAtivasPara(paraId);
  return rows.map((d) => d.de_id).filter(Boolean);
}
