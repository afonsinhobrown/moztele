export default function Carregando() {
  return (
    <div className="carregando" aria-busy="true" aria-live="polite">
      <div className="esqueleto" />
      <div className="esqueleto curto" />
      <div className="esqueleto alto" />
      <span className="mut">A carregar…</span>
    </div>
  );
}
