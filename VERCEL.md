# Deploy no Vercel

1. Ir para https://vercel.com/new e importar https://github.com/afonsinhobrown/moztele
2. Adicionar Environment Variables:
   - DATABASE_URL = postgresql://neondb_owner:npg_rZuLQHNqs92X@ep-sparkling-violet-b53i6bll-pooler.c-7.us-east-2.aws.neon.tech/moztele?sslmode=require&channel_binding=require
   - AUTH_SECRET = moztele-chave-forte-12345678901234567890
   - NODE_ENV = production
3. Deploy
4. Admin já criado na BD (840000000 / admin123)

Nota: uploads com @vercel/blob precisam de BLOB_READ_WRITE_TOKEN se quiseres usar Blob. Por agora o código usa guardar() - vê lib/upload.js.
