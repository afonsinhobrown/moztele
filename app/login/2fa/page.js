import Link from "next/link";
import { verificar2fa } from "@/app/actions";
import Btn from "@/components/Btn";

export const metadata = { title: "Confirmação · Moz Teles" };

const ERROS = {
  1: "Código incorrecto. Abra a aplicação autenticadora e tente outra vez.",
  limite: "Demasiadas tentativas falhadas. Aguarde 15 minutos e tente outra vez.",
};

export default function SegundoFactor({ searchParams }) {
  return (
    <div className="login">
      <form action={verificar2fa} className="card login-card">
        <Link href="/" className="marca-login">
          <span className="logo-marca">Moz Teles</span>
          <span className="mut">Confirmação em dois passos</span>
        </Link>

        {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível confirmar."}</p>}

        <p className="mut pequeno">
          Escreva o código de 6 dígitos que aparece na sua aplicação autenticadora.
        </p>
        <label>Código</label>
        <input
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength="7"
          placeholder="000000"
          required
          autoFocus
        />
        <Btn className="pri largo">Entrar</Btn>
        <p className="mut centro pequeno">
          Perdeu o telemóvel? Peça ao administrador para repor o segundo factor da sua conta.
        </p>
      </form>
      <p className="mut centro">
        <Link href="/login">← Voltar ao login</Link>
      </p>
    </div>
  );
}
