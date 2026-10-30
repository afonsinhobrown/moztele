# Moz Teles · Sistema de Requisições

Next.js 14 + PostgreSQL (Neon). Fluxo: mestre cria orçamento (com documentos) → aprovador aprova/reprova →
financeiro envia o dinheiro (com comprovativo de transferência) → mestre compra (com comprovativo de compra) →
financeiro faz o acerto e fecha.

## Correr na sua máquina
1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL` (do Neon; apague `&channel_binding=require`)
   e `AUTH_SECRET` (frase longa e aleatória). Para guardar os ficheiros no Cloudflare R2, preencha também as
   variáveis `OBJECT_STORAGE_*` (credenciais S3 do R2, bucket, endpoint e região `auto`).
3. As tabelas já estão criadas (o esquema está em `db/schema.sql`).
4. Crie o primeiro administrador: `npm run criar-admin -- "O Seu Nome" 840000000 UmaSenhaForte`
5. `npm run dev` e abra http://localhost:3000. Entre com o telefone e a senha.
6. Em **Admin**: crie sites e utilizadores (mestres, aprovadores, financeiros).

Ficheiros (comprovativos, orçamentos) vão para o bucket R2 quando as `OBJECT_STORAGE_*` estão definidas;
sem elas, em desenvolvimento ficam em `public/uploads`. Os objectos no R2 são privados: a aplicação serve-os
em `/api/ficheiros/<pasta>/<nome>` apenas a quem tem sessão iniciada (o bucket não precisa de acesso público).

## Publicar na Vercel
1. Envie o projecto para o GitHub e importe na Vercel.
2. Em Settings → Environment Variables: `DATABASE_URL`, `AUTH_SECRET` e as `OBJECT_STORAGE_*` do R2
   (`OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_BUCKET`,
   `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION=auto`).
3. Sem armazenamento configurado na Vercel, os uploads falham (não há disco persistente). O Vercel Blob
   (`BLOB_READ_WRITE_TOKEN`) continua a funcionar como alternativa, mas o R2 é o preferido.
4. Deploy.

## Notas
- Limite de 4 MB por ficheiro (limite da Vercel para pedidos).
- Os ficheiros no R2 são privados e entregues pela app (`/api/ficheiros/...`), só com sessão. Se voltar a usar o
  Vercel Blob, os links são públicos (difíceis de adivinhar).
- Regras de aprovação (nº de aprovadores por valor) estão na tabela `regras_aprovacao`.
- O banco recusa fechar uma requisição sem os dois comprovativos.
- Avisos: só dentro da app. WhatsApp/SMS ainda não estão ligados.
- Não é possível editar os itens depois de criados: em caso de correcção, cancele e crie nova (ou anexe documentos novos).
