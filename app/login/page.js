import Link from "next/link";
import { login } from "@/app/actions";
import Btn from "@/components/Btn";
import { CREDENCIAIS_TESTE, credenciaisTesteVisiveis } from "@/lib/credenciais-teste";

export const metadata = { title: "Entrar · Moz Teles" };

const ERROS = {
  1: "Telefone ou senha incorrectos.",
  limite: "Demasiadas tentativas falhadas. Aguarde 15 minutos e tente outra vez.",
  config: "O sistema não está configurado correctamente. Contacte o administrador.",
};

export default function Login({ searchParams }) {
  const mostrarTeste = credenciaisTesteVisiveis();
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

        {mostrarTeste && (
          <div className="credenciais-teste">
            <p className="teste-aviso">
              <b>Contas de teste</b> — senhas públicas. Remover antes de produção.
            </p>
            <table>
              <thead>
                <tr><th>Perfil</th><th>Telefone</th><th>Senha</th></tr>
              </thead>
              <tbody>
                {CREDENCIAIS_TESTE.map((c) => (
                  <tr key={c.telefone}>
                    <td>{c.perfil}</td>
                    <td><code>{c.telefone}</code></td>
                    <td><code>{c.senha}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mut pequeno">
              São contas de demonstração para a fase de teste. No fim, correr <code>npm run remover-testes</code> e
              desactivar estas credenciais com <code>MOSTRAR_CREDENCIAIS_TESTE=false</code>.
            </p>
          </div>
        )}
      </form>
      <p className="mut centro">
        <Link href="/">← Voltar ao site</Link>
      </p>
    </div>
  );
}
