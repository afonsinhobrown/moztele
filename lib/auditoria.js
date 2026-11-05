export async function auditar(run, { tabela, operacao, registroId, utilizadorId, detalhes }) {
  await run(
    `INSERT INTO auditoria (tabela, operacao, registro_id, utilizador_id, detalhes)
     VALUES ($1,$2,$3,$4,$5)`,
    [tabela, operacao, registroId, utilizadorId, detalhes ? JSON.stringify(detalhes) : null]
  );
}
