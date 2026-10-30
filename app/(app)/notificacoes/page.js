import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { dt } from "@/lib/ui";
import { marcarNotificacoesLidas } from "@/app/actions";
import Btn from "@/components/Btn";

export default async function Notificacoes() {
  const s = await exigir();
  const rows = await q(
    "SELECT n.*, r.codigo FROM notificacoes n LEFT JOIN requisicoes r ON r.id=n.requisicao_id WHERE n.utilizador_id=$1 ORDER BY n.enviada_em DESC LIMIT 100",
    [s.id]
  );
  const porLer = rows.filter((n) => !n.lida).length;
  return (
    <>
      <div className="linha">
        <h1>Avisos</h1>
        {porLer > 0 && (
          <form action={marcarNotificacoesLidas}>
            <Btn className="sec">Marcar todas como lidas</Btn>
          </form>
        )}
      </div>
      <div className="card">
        {rows.length === 0 && <p className="mut">Sem avisos.</p>}
        {rows.map((n) => (
          <p key={n.id} className={n.lida ? "mut" : ""}>
            <b>{dt(n.enviada_em)}</b> · {n.mensagem}{" "}
            {n.requisicao_id && <Link href={`/requisicoes/${n.requisicao_id}`}>{n.codigo}</Link>}
          </p>
        ))}
      </div>
    </>
  );
}
