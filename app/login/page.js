import { login } from "@/app/actions";
import Btn from "@/components/Btn";

export default function Login({ searchParams }) {
  return (
    <div className="login">
      <form action={login} className="card">
        <h1>Moz Teles</h1>
        <p className="mut">Sistema de requisições</p>
        {searchParams.erro && <p className="erro">Telefone ou senha incorrectos.</p>}
        <label>Telefone</label>
        <input name="telefone" inputMode="tel" required autoFocus />
        <label>Senha</label>
        <input name="senha" type="password" required />
        <Btn className="pri">Entrar</Btn>
      </form>
    </div>
  );
}
