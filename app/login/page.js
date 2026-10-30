import Link from "next/link";
import { login } from "@/app/actions";
import Btn from "@/components/Btn";

export const metadata = { title: "Entrar · Moz Teles" };

const ERROS = {
  1: "Telefone ou senha incorrectos.",
  limite: "Demasiadas tentativas falhadas. Aguarde 15 minutos e tente outra vez.",
  config: "O sistema não está configurado correctamente. Contacte o administrador.",
};

export default function Login({ searchParams }) {
  return (
    <div className="login">
      <form action={login} className="card login-card">
        <Link href="/" className="marca-login">
          <span className="logo-marca">Moz Teles</span>
          <span className="mut">Sistema de requisições</span>
        </Link>
        {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível entrar."}</p>}
        {searchParams.de && <input type="hidden" name="de" value={searchParams.de} />}
        <label>Telefone</label>
        <input
          name="telefone"
          inputMode="tel"
          autoComplete="username"
          placeholder="84 000 0000"
          required
          autoFocus
        />
        <label>Senha</label>
        <input name="senha" type="password" autoComplete="current-password" required />
        <Btn className="pri largo">Entrar</Btn>
        <p className="mut centro">Acesso reservado a mestres, aprovadores, financeiro e administração.</p>
      </form>
      <p className="mut centro">
        <Link href="/">← Voltar ao site</Link>
      </p>
    </div>
  );
}
