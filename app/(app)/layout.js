import Link from "next/link";
import { exigirSessao } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { logout } from "@/app/actions";

export default async function AppLayout({ children }) {
  const s = await exigirSessao();
  const { n } = await q1("SELECT count(*)::int AS n FROM notificacoes WHERE utilizador_id=$1 AND NOT lida", [s.id]);
  const bloqueado = s.deve_mudar_senha;
  return (
    <>
      <header className="topo">
        <Link href="/inicio" className="logo">
          Moz Teles
        </Link>
        {!bloqueado && (
          <nav>
            <Link href="/inicio">Início</Link>
            <Link href="/requisicoes">Requisições</Link>
            {s.perfil === "mestre" && <Link href="/requisicoes/nova">Nova</Link>}
            {s.perfil === "mestre" && <Link href="/modelos">Modelos</Link>}
            {s.perfil === "aprovador" && <Link href="/delegacoes">Delegações</Link>}
            <Link href="/inventario">Inventário</Link>
            {["mestre", "financeiro", "admin"].includes(s.perfil) && (
              <Link href="/creditos">Saldo</Link>
            )}
            {["admin", "financeiro", "aprovador"].includes(s.perfil) && (
              <Link href="/relatorios/requisicoes">Relatórios</Link>
            )}
            {s.perfil === "admin" && (
              <>
                <Link href="/admin">Admin</Link>
                <Link href="/admin/projetos">Projectos</Link>
                <Link href="/admin/regras-aprovacao">Regras de aprovação</Link>
                <Link href="/admin/auditoria">Auditoria</Link>
              </>
            )}
            {["admin", "financeiro"].includes(s.perfil) && (
              <Link href="/prestacao-contas">Prestação de contas</Link>
            )}
            <Link href="/notificacoes">
              Avisos{n > 0 && <span className="pill">{n}</span>}
            </Link>
          </nav>
        )}
        <span className="quem">
          {s.nome} · {s.perfil}
        </span>
        {!bloqueado && (
          <Link href="/conta/senha" className="link-topo">
            Conta
          </Link>
        )}
        <form action={logout}>
          <button className="link">Sair</button>
        </form>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
