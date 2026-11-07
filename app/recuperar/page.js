import Link from "next/link";
import { redefinirComCodigo } from "@/app/actions";
import Btn from "@/components/Btn";

export const metadata = { title: "Recuperar senha · Moz Teles" };

const ERROS = {
  1: "Telefone ou código incorrectos, ou o código já expirou. Peça um novo ao administrador.",
  dados: "Preencha o telefone e o código.",
  fraca: "A senha tem de ter pelo menos 8 caracteres, com letras e números.",
  confirma: "As duas senhas não coincidem.",
  limite: "Demasiadas tentativas falhadas. Aguarde 15 minutos e tente outra vez.",
};

export default function Recuperar({ searchParams }) {
  return (
    <div className="login">
      <form action={redefinirComCodigo} className="card login-card">
        <Link href="/" className="marca-login">
          <span className="logo-marca">Moz Teles</span>
          <span className="mut">Recuperar acesso</span>
        </Link>

        {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível continuar."}</p>}

        <p className="mut pequeno">
          Peça ao administrador um <b>código de recuperação</b> (vale 24 horas e só pode ser usado uma vez).
          Depois preencha aqui o seu telefone, o código e a senha nova.
        </p>

        <label>Telefone</label>
        <input
          name="telefone"
          inputMode="tel"
          autoComplete="username"
          placeholder="84 000 0000"
          required
          autoFocus
        />
        <label>Código de recuperação</label>
        <input name="codigo" placeholder="XXXX-XXXX" autoComplete="one-time-code" required />
        <label>Senha nova</label>
        <input name="nova" type="password" autoComplete="new-password" minLength="8" required />
        <label>Repetir a senha nova</label>
        <input name="confirmar" type="password" autoComplete="new-password" minLength="8" required />

        <Btn className="pri largo">Definir senha nova</Btn>
        <p className="mut centro pequeno">
          Ao definir a senha nova, todos os acessos antigos são terminados.
        </p>
      </form>
      <p className="mut centro">
        <Link href="/login">← Voltar ao login</Link>
      </p>
    </div>
  );
}
