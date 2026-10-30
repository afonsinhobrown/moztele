// Contas de demonstração/teste. NÃO usar em produção.
// Podem ser escondidas do login com MOSTRAR_CREDENCIAIS_TESTE=false
// e removidas da base com `npm run remover-testes`.
export const CREDENCIAIS_TESTE = [
  {
    perfil: "Administração",
    perfilSistema: "admin",
    nome: "Admin",
    telefone: "840000000",
    senha: "admin123",
  },
  {
    perfil: "Mestre",
    perfilSistema: "mestre",
    nome: "Mestre Teste",
    telefone: "841111111",
    senha: "teste2026",
  },
  {
    perfil: "Aprovador",
    perfilSistema: "aprovador",
    nome: "Aprovador Teste",
    telefone: "842222222",
    senha: "teste2026",
  },
  {
    perfil: "Financeiro",
    perfilSistema: "financeiro",
    nome: "Financeiro Teste",
    telefone: "843333333",
    senha: "teste2026",
  },
];

export const credenciaisTesteVisiveis = () => process.env.MOSTRAR_CREDENCIAIS_TESTE !== "false";
