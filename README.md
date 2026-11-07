# Moz Teles · Sistema de Requisições

Next.js 14 + PostgreSQL (Neon). Fluxo: mestre cria requisição (com documentos) → aprovador aprova/reprova →
financeiro envia o dinheiro (com comprovativo) → mestre compra (com comprovativo) → financeiro faz o acerto e fecha.

O sistema existe para uma coisa: **o dinheiro tem prova em cada passo** — e quem viu, aprovou e pagou fica registado.

## Começar

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL` (Neon), `AUTH_SECRET` (mínimo 24 caracteres)
   e as `OBJECT_STORAGE_*` do R2.
3. Numa base nova, aplique o esquema (`db/schema.sql`) e depois as migrações: `npm run migrar`.
   Numa base que já existe, basta `npm run migrar`.
4. Crie o primeiro administrador: `npm run criar-admin -- "O Seu Nome" 840000000 UmaSenhaForte`.
   No primeiro acesso ele terá de definir uma senha nova.
5. `npm run dev` e abra http://localhost:3000.

## Comandos

| Comando | Para quê |
| --- | --- |
| `npm run dev` | Desenvolvimento |
| `npm run build` / `npm start` | Produção |
| `npm run migrar` | Aplica migrações pendentes de `db/migrations` |
| `npm run criar-admin -- "Nome" telefone senha` | Cria/repõe um administrador |
| `npm run alertas` | Avisa (app + WhatsApp) de requisições paradas |
| `npm test` | Testes unitários e de integração (node:test, sem dependências) |
| `npm run test:db` | Só os testes de integração, contra a base do `.env.local` |

## Ficheiros

- Vão para o bucket **R2** quando as `OBJECT_STORAGE_*` estão definidas; sem elas, em desenvolvimento ficam em
  `public/uploads`. O Vercel Blob (`BLOB_READ_WRITE_TOKEN`) continua como alternativa.
- Os objectos no R2 são **privados**: a aplicação serve-os em `/api/ficheiros/<pasta>/<nome>` apenas a quem tem
  sessão e pode ver aquela requisição.
- O tipo é decidido pelos primeiros bytes (PDF, JPG ou PNG). Nada de HTML/SVG disfarçado.
- O SHA-256 de cada comprovativo é guardado; o mesmo comprovativo financeiro não pode ser usado duas vezes.
- Limite de 4 MB por ficheiro. As fotos grandes são comprimidas no browser antes do upload.

## Segurança

- Sessões JWT assinadas com `AUTH_SECRET`, revogáveis: desactivar um utilizador ou mudar a senha corta acessos antigos.
- Login com limite de tentativas (8 falhas em 15 minutos bloqueiam telefone e IP).
- Senhas com mínimo de 8 caracteres, letras e números. Novos utilizadores — e todos os que já existiam quando a
  migração 001 foi aplicada — são obrigados a mudar a senha no primeiro acesso.
- Cada mudança de estado fica no histórico com o nome de quem a fez.
- **Segundo factor (TOTP)**: cada pessoa pode ligá-lo em *Conta → Segurança*, com qualquer aplicação
  autenticadora. Quem perder o telemóvel pede ao administrador para repor o segundo factor.
- **Recuperação de senha**: o administrador gera um código de uso único (24 h) e passa-o à pessoa; ela usa-o em
  `/recuperar`. O código fica guardado só em hash.
- **Limite de acções**: criar requisições, submeter, anexar, comprar e comentar têm limite por utilizador e por
  hora. Repetir cliques não enche a base de dados.
- **Auditoria**: cada inserção, alteração e remoção nas tabelas de negócio fica registada (quem, quando, o que
  mudou) por triggers na base de dados. Consulta em *Admin → Auditoria*. Segredos como a senha e o TOTP nunca
  são guardados no registo.
- Cabeçalhos de segurança (`nosniff`, `X-Frame-Options`, política de permissões e `Content-Security-Policy`) em
  todas as respostas.

## Avisos

- Na aplicação: sino **Avisos**. Cada pessoa escolhe se quer também email e SMS em *Conta → Segurança*.
- WhatsApp (opcional): defina `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` (Meta Cloud API). Sem estas
  variáveis os avisos ficam só na app. A API de texto livre só entrega dentro da janela de 24 h; por isso, defina
  `WHATSAPP_TEMPLATE_ALERTA` (template aprovado, com uma variável `{{1}}` no corpo) e
  `WHATSAPP_TEMPLATE_IDIOMA`. Sem template, a app tenta texto livre e registra a falha nos logs.
- Email (opcional): `RESEND_API_KEY` e `EMAIL_FROM` (Resend). Cada utilizador precisa de ter email na ficha.
- SMS (opcional): `SMS_URL` e `SMS_TOKEN` de um gateway HTTP que aceite
  `POST {"to": "...", "message": "..."}` com `Authorization: Bearer`.
- Comentários novos avisam o mestre, os aprovadores que já decidiram e a chefia do mestre.
- Requisições paradas: `npm run alertas` (agende na Vercel com um Cron Job, por exemplo uma vez por dia).

## Inventário

- Cada site tem o seu inventário (`/inventario`): material, unidade, quantidade e mínimo.
- Entradas, saídas e ajustes de contagem ficam registados em `movimentos_stock`, com saldo antes/depois, motivo,
  autor e (quando aplicável) a requisição de origem.
- As saídas nunca deixam o stock negativo; os itens abaixo do mínimo ficam destacados e podem ser filtrados.
- Depois da compra, o mestre pode usar **Dar entrada no stock** na requisição: as quantidades pedidas entram no
  inventário do site e ficam ligadas a essa requisição (uma única vez).
- Nenhum movimento é apagado: o histórico é a fonte de verdade.

## Modelos e favoritos

- **Modelos** (`/modelos`): a partir de uma requisição, o mestre guarda itens + justificação com um nome; pode
  partilhar com os outros mestres. Em “Nova requisição” escolhe-se o modelo e o orçamento aparece preenchido.
- **Favoritos**: na tabela de itens da requisição, a estrela guarda o material; em “Nova requisição” há uma lista
  de favoritos para acrescentar linhas com um clique. Cada mestre só vê os seus.

## Saldo abatido

- Quando o financeiro fecha com **“abatido a próxima requisição”**, o saldo fica registado como crédito do mestre
  para aquele site (`creditos_abatimento`).
- É aplicado **automaticamente** às requisições seguintes desse mestre/site, no momento da submissão (até ao valor
  estimado). O financeiro vê o crédito aplicado e só transfere o que falta.
- Se o crédito cobrir tudo, o financeiro confirma a cobertura sem transferência; o fecho é aceite porque o
  financiamento está documentado pelo crédito.
- Cancelar ou reprovar uma requisição devolve o crédito ao saldo disponível.
- O acerto e os relatórios contam transferências **mais** saldo abatido.

## Chefia e delegação

- Cada utilizador pode ter uma **chefia** (`utilizadores.chefia_id`, em Admin → Utilizadores). A chefia vê as
  requisições de quem chefia na lista e no detalhe — só para acompanhar, sem poder decidi-las — e recebe um aviso
  quando essa pessoa submete.
- **Delegação de aprovação** (`/delegacoes`, para aprovadores): um aprovador ausente nomeia outro aprovador para
  decidir em seu nome até uma data. A decisão conta como do aprovador ausente e a lista mostra
  “(por delegação: quem decidiu)”. O delegado é avisado e pode cancelar a delegação antes do fim.

## Áreas e categorias

- **Áreas** (`/admin/catalogos`): a área do site e a área do aprovador decidem quem vê o quê — um aprovador com
  área definida só vê requisições dessa área.
- **Categorias**: usadas nos itens, no inventário e nos favoritos. Só se apagam as que não estão em uso.

## Auditoria

- *Admin → Auditoria* mostra as alterações por tabela, operação, autor e período, com o detalhe do que mudou.
- O registo é feito por triggers `trg_auditoria` (migração 004) e não pode ser alterado pela aplicação.
- Senhas e segredos de segundo factor nunca entram no registo.

## Testes

- `npm test` corre os testes unitários (`tests/unit`) e os de integração (`tests/integration`).
- Os testes de integração precisam de `DATABASE_URL`; sem ela são saltados. Correm sempre dentro de uma
  transacção que é revertida — a base não fica alterada.
- Cobrem as invariantes que protegem dinheiro: fechar sem comprovativos, comprovativo repetido, stock negativo,
  crédito acima do recebido, delegação para si próprio, histórico e auditoria.
- O CI (`.github/workflows/ci.yml`) sobe um Postgres, aplica `db/schema.sql` e todas as migrações, corre os testes
  e faz o build.

## Contas de teste (fase de teste)

Enquanto o sistema estiver em demonstração, a página de login mostra estas contas e as respectivas senhas:

| Perfil | Telefone | Senha |
| --- | --- | --- |
| Administração | `840000000` | `admin123` |
| Mestre | `841111111` | `teste2026` |
| Aprovador | `842222222` | `teste2026` |
| Financeiro | `843333333` | `teste2026` |

- Recriar/repôr: `npm run criar-testes`.
- **No fim da fase de teste:** `npm run remover-testes` (apaga as contas de teste; se tiverem histórico, desactiva-as)
  e defina `MOSTRAR_CREDENCIAIS_TESTE=false` para esconder a lista do login. Mude também a senha do admin.
- Estas senhas são públicas de propósito. Não deixar isto ligado quando o sistema for usado com dinheiro real.

## Publicar na Vercel

1. Importe o repositório (framework Next.js).
2. Environment Variables: `DATABASE_URL`, `AUTH_SECRET` (mínimo 24 caracteres), `OBJECT_STORAGE_*`
   e, opcionalmente, `WHATSAPP_*`, `RESEND_API_KEY`/`EMAIL_FROM` e `SMS_URL`/`SMS_TOKEN`.
3. **Sem armazenamento configurado, os uploads falham** (a Vercel não tem disco persistente).
4. Deploy. Depois: `npm run migrar` contra a base de produção (ou corra o SQL de `db/migrations` no Neon).
5. Opcional: Cron Job diário `npm run alertas` e monitorização de `/api/saude`.

## Notas

- Limite de 4 MB por ficheiro (limite da Vercel para pedidos).
- Regras de aprovação (nº de aprovadores por valor) estão na tabela `regras_aprovacao`.
- O banco recusa fechar uma requisição sem prova de financiamento (transferência ou saldo abatido) e sem
  comprovativo de compra.
- Vários envios de dinheiro e várias compras por requisição são permitidos (top-up e compras em fornecedores
  diferentes).
- Saldo devolvido exige comprovativo; excesso pago pelo mestre é registado como reembolso com prova.
- Não é possível editar itens depois de submetidos: peça correcção, edite e re-submeta (ou duplique a requisição).
- Requisições ligadas a um projeto (`/admin/projetos`) são controladas pelo orçamento disponível: ao criar, ao
  re-submeter e ao duplicar (a cópia herda o projeto e os fornecedores).
- Relatórios em PDF e CSV (requisições, financeiro e por projeto); inventário em CSV.
- Backup: active Point-in-Time Recovery no Neon e versionamento/object lock no bucket R2. Guarde os
  comprovativos durante o prazo legal da empresa (por omissão, 5 anos).
