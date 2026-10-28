# Moz Teles · Sistema de Requisições

Next.js 14 + PostgreSQL (Neon). Fluxo: mestre cria orçamento (com documentos) → aprovador aprova/reprova →
financeiro envia o dinheiro (com comprovativo de transferência) → mestre compra (com comprovativo de compra) →
financeiro faz o acerto e fecha.

## Correr na sua máquina
1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL` (do Neon; apague `&channel_binding=require`)
   e `AUTH_SECRET` (frase longa e aleatória).
3. As tabelas já estão criadas (o esquema está em `db/schema.sql`).
4. Crie o primeiro administrador: `npm run criar-admin -- "O Seu Nome" 840000000 UmaSenhaForte`
5. `npm run dev` e abra http://localhost:3000. Entre com o telefone e a senha.
6. Em **Admin**: crie sites e utilizadores (mestres, aprovadores, financeiros).

Em desenvolvimento, os ficheiros ficam em `public/uploads`.

## Publicar na Vercel
1. Envie o projecto para o GitHub e importe na Vercel.
2. Em Settings → Environment Variables: `DATABASE_URL` e `AUTH_SECRET`.
3. Em Storage, crie um **Blob** e ligue ao projecto (cria `BLOB_READ_WRITE_TOKEN`). Sem isto, os uploads não funcionam na Vercel.
4. Deploy.

## Notas
- Limite de 4 MB por ficheiro (limite da Vercel para pedidos).
- Os ficheiros no Blob têm links públicos difíceis de adivinhar; para privacidade total seria preciso Blob privado.
- Regras de aprovação (nº de aprovadores por valor) estão na tabela `regras_aprovacao`.
- O banco recusa fechar uma requisição sem os dois comprovativos.
- Avisos: só dentro da app. WhatsApp/SMS ainda não estão ligados.
- Não é possível editar os itens depois de criados: em caso de correcção, cancele e crie nova (ou anexe documentos novos).
