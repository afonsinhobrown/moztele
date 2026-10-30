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
| `npm test` | Testes unitários (node:test, sem dependências) |

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
- Senhas com mínimo de 8 caracteres, letras e números. Novos utilizadores são obrigados a mudar a senha no
  primeiro acesso; administradores existentes também (migração 001).
- Cada mudança de estado fica no histórico com o nome de quem a fez.
- Cabeçalhos de segurança (`nosniff`, `X-Frame-Options`, política de permissões) em todas as respostas.

## Avisos

- Na aplicação: sino **Avisos**.
- WhatsApp (opcional): defina `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` (Meta Cloud API). Sem estas
  variáveis os avisos ficam só na app. A API de texto livre só entrega dentro da janela de 24 h; para avisos
  proactivos é preciso um template aprovado na Meta.
- Requisições paradas: `npm run alertas` (agende na Vercel com um Cron Job, por exemplo uma vez por dia).

## Publicar na Vercel

1. Importe o repositório (framework Next.js).
2. Environment Variables: `DATABASE_URL`, `AUTH_SECRET` (mínimo 24 caracteres), `OBJECT_STORAGE_*`
   e, se quiser WhatsApp, `WHATSAPP_*`.
3. **Sem armazenamento configurado, os uploads falham** (a Vercel não tem disco persistente).
4. Deploy. Depois: `npm run migrar` contra a base de produção (ou corra o SQL de `db/migrations` no Neon).
5. Opcional: Cron Job diário `npm run alertas` e monitorização de `/api/saude`.

## Notas

- Limite de 4 MB por ficheiro (limite da Vercel para pedidos).
- Regras de aprovação (nº de aprovadores por valor) estão na tabela `regras_aprovacao`.
- O banco recusa fechar uma requisição sem os dois comprovativos.
- Vários envios de dinheiro e várias compras por requisição são permitidos (top-up e compras em fornecedores
  diferentes).
- Saldo devolvido exige comprovativo; excesso pago pelo mestre é registado como reembolso com prova.
- Não é possível editar itens depois de submetidos: peça correcção, edite e re-submeta (ou duplique a requisição).
- Relatórios em PDF e CSV (requisições e financeiro).
- Backup: active Point-in-Time Recovery no Neon e versionamento/object lock no bucket R2. Guarde os
  comprovativos durante o prazo legal da empresa (por omissão, 5 anos).
