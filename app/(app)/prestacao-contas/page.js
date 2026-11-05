import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { MT, dt, Badge, ESTADOS } from "@/lib/ui";

export default async function PrestacaoContas() {
  await exigir("admin", "financeiro");

  const rows = await q(
    `SELECT r.id, r.codigo, r.estado, r.criado_em, r.actualizado_em,
            u.nome AS mestre, u.telefone, st.nome AS site, p.nome AS projeto,
            COALESCE((SELECT sum(valor) FROM pagamentos WHERE requisicao_id=r.id),0) AS enviado,
            COALESCE((SELECT sum(valor) FROM creditos_aplicacoes WHERE requisicao_id=r.id),0) AS credito,
            COALESCE((SELECT sum(valor_gasto) FROM compras WHERE requisicao_id=r.id),0) AS gasto
       FROM requisicoes r
       JOIN utilizadores u ON u.id=r.mestre_id
       JOIN sites st ON st.id=r.site_id
       LEFT JOIN projetos p ON p.id=r.projeto_id
      WHERE r.estado IN ('dinheiro_enviado','compra_comprovada')
      ORDER BY r.actualizado_em DESC`
  );

  const lista = rows.map((r) => {
    const enviado = Number(r.enviado || 0);
    const credito = Number(r.credito || 0);
    const gasto = Number(r.gasto || 0);
    const saldo = arred(enviado + credito - gasto);
    return { ...r, enviado, credito, gasto, saldo };
  });

  return (
    <>
      <h1>Prestação de contas pendente</h1>
      <p className="mut">
        Requisições com dinheiro enviado e/ou compra já comprovada, mas ainda sem acerto/fecho.
      </p>

      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Requisição</th><th>Mestre</th><th>Site / projecto</th><th>Estado</th>
              <th>Enviado</th><th>Saldo abatido</th><th>Gasto</th><th>Saldo</th><th>Actualizada</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="9" className="mut">Sem pendências de prestação de contas.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/requisicoes/${r.id}`}>{r.codigo}</Link></td>
                <td>{r.mestre}</td>
                <td>{r.site}{r.projeto ? ` · ${r.projeto}` : ""}</td>
                <td><Badge estado={r.estado} /></td>
                <td>{MT(r.enviado)}</td>
                <td>{MT(r.credito)}</td>
                <td>{MT(r.gasto)}</td>
                <td className={r.saldo < 0 ? "erro" : ""}>{MT(r.saldo)}</td>
                <td>{dt(r.actualizado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mut pequeno">
        Saldo negativo significa que o mestre gastou mais do que recebeu (excesso a reembolsar).
        Saldo positivo ainda não foi acertado (devolução ou abatimento a próxima requisição).
      </p>
    </>
  );
}

function arred(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}
