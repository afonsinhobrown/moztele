"use client";

export default function Erro({ error, reset }) {
  return (
    <div className="erro-caixa">
      <h1>Algo correu mal</h1>
      <p className="mut">
        Não foi possível carregar esta página. Pode tentar outra vez; se continuar, avise o administrador.
      </p>
      {error?.digest && <p className="mut pequeno">Referência: {error.digest}</p>}
      <div className="acoes">
        <button className="pri" onClick={() => reset()}>
          Tentar novamente
        </button>
        <a href="/requisicoes" className="btn sec">
          Voltar às requisições
        </a>
      </div>
    </div>
  );
}
