import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { logout } from "@/app/actions";

export default async function AppLayout({ children }) {
  const s = await exigir();
  const { n } = await q1("SELECT count(*)::int AS n FROM notificacoes WHERE utilizador_id=$1 AND NOT lida", [s.id]);
  return (
    <>
      <header className="topo">
        <Link href="/requisicoes" className="logo">Moz Teles</Link>
        <nav>
          <Link href="/requisicoes">Requisições</Link>
          {s.perfil === "mestre" && <Link href="/requisicoes/nova">Nova</Link>}
          {["admin", "financeiro", "aprovador"].includes(s.perfil) && <Link href="/relatorios/requisicoes">Relatórios</Link>}
          {s.perfil === "admin" && <Link href="/admin">Admin</Link>}
          <Link href="/notificacoes">Avisos{n > 0 && <span className="pill">{n}</span>}</Link>
        </nav>
        <span className="quem">{s.nome} · {s.perfil}</span>
        <form action={logout}><button className="link">Sair</button></form>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
