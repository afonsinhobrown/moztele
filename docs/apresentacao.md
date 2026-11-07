# Moz Teles — Sistema de Requisições
### Conteúdo de apresentação

**Resumo em uma frase:** o sistema que garante que o dinheiro da obra tem prova em cada passo — do pedido do mestre ao acerto do financeiro.

---

## 1. O problema

- **Pedidos em conversa.** O material é pedido por WhatsApp e por telefone. Ninguém sabe ao certo o que foi autorizado, por quem e por quanto.
- **Dinheiro sem prova.** Transferências sem comprovativo, facturas repetidas e saldos que ninguém consegue explicar no fim da obra.
- **Sem rasto do responsável.** Quando algo falha não há histórico: quem aprovou, quem pagou, quem comprou e quanto sobrou.

**Resultado:** obras mais caras, acertos demorados e desconfiança entre mestre, aprovador e financeiro.

---

## 2. A proposta

Um fluxo único, do pedido ao fecho. Cada passo tem valor, documento e responsável.

Quatro princípios:

- **Prova obrigatória** — sem comprovativo, a requisição não avança nem fecha. A regra está na base de dados.
- **Aprovação por valor** — escalões definidos pela empresa: quantos aprovadores por faixa.
- **Saldo à vista** — enviado, gasto e saldo calculados automaticamente, com devolução, abatimento e reembolso.
- **Tudo registado** — histórico de estados e auditoria de cada alteração, com o nome de quem fez.

---

## 3. O fluxo em quatro passos

1. **Orçamento.** O mestre descreve o material, anexa a cotação e o sistema calcula o total.
2. **Aprovação.** As regras por valor decidem quantos aprovadores são precisos.
3. **Dinheiro.** O financeiro envia o valor e anexa o comprovativo da transferência.
4. **Compra e acerto.** O mestre anexa as facturas; o financeiro fecha com o saldo acertado.

Entre cada passo: aviso ao responsável seguinte, prazo a contar e registo no histórico.
O fecho só é aceite com prova de financiamento e prova de compra.

---

## 4. Quem faz o quê

| Perfil | O que faz | O que vê |
| --- | --- | --- |
| **Mestre** | Cria requisições, compra e anexa comprovativos. | As suas requisições e as de quem chefia. |
| **Aprovador** | Aprova, reprova ou pede correcção (com motivo). | A fila de aprovação da sua área. |
| **Financeiro** | Envia dinheiro, confere provas e faz o acerto. | Requisições aprovadas e prestação de contas. |
| **Administração** | Gere utilizadores, sites, projectos, regras e catálogos. | Tudo, mais a auditoria. |

- **Chefia:** acompanha as requisições de quem chefia e é avisada quando essa pessoa submete.
- **Delegação:** um aprovador ausente nomeia outro para decidir em seu nome, até uma data.
- A permissão é aplicada no servidor, em cada ecrã e em cada acção — não é só esconder botões.

---

## 5. Aprovação por escalões

- Até **50 000 MZN** → 1 aprovação.
- Acima de **50 000 MZN** → 2 aprovações.
- Os escalões são editáveis em Administração → Regras de aprovação (tabela `regras_aprovacao`).
- **Reprovar exige motivo**, que fica registado com o nome de quem decidiu.
- **Correcção volta ao mestre** sem perder o histórico: edita, corrige e re-submete.
- **Nova submissão reinicia a contagem** — as aprovações anteriores não contam para a nova versão.
- A contagem é de **aprovadores diferentes**, não de cliques.

---

## 6. A prova

- **Comprovativo de envio** — obrigatório para o dinheiro sair.
- **Comprovativo de compra** — factura, recibo ou foto do material; o fecho exige pelo menos um.
- **Ficheiros privados** — guardados em bucket privado (Cloudflare R2) e servidos pela aplicação, apenas a quem tem sessão e pode ver aquela requisição.
- **Anti-duplicação** — o SHA-256 de cada comprovativo é único: a mesma factura não entra duas vezes.
- Limites: PDF, JPG ou PNG, até 4 MB; o tipo é decidido pelos primeiros bytes (nada de HTML/SVG disfarçado).

---

## 7. O acerto

O sistema soma transferências e saldo abatido, subtrai as compras e mostra o que sobra antes de fechar.

Exemplo: transferido 45 000 + saldo abatido 5 000 − gasto 38 500 = **saldo 11 500 MZN**.

Três destinos possíveis:

- **Devolvido** — comprovativo da devolução obrigatório.
- **Abatido** — fica como crédito para a próxima requisição do mesmo mestre e site, aplicado automaticamente.
- **Excesso** — o mestre gastou mais do que recebeu; o reembolso é registado com prova.

Cancelar ou reprovar devolve o crédito ao saldo disponível. O acerto e os relatórios contam transferências **mais** saldo abatido.

---

## 8. Projectos e orçamento

- Cada requisição pode ser ligada a um **projecto com orçamento total**.
- A verificação acontece **ao criar, ao re-submeter e ao duplicar** — uma correcção não é porta aberta para gastar mais.
- Relatório por projecto: orçamento, solicitado, aprovado, transferido, comprovado e saldo, por período.
- Exportação em PDF e CSV, com os mesmos filtros do ecrã.

---

## 9. Inventário e reutilização

- **Stock por site:** material, unidade, quantidade e mínimo; itens abaixo do mínimo destacados e filtráveis.
- **Movimentos com autor:** entradas, saídas e ajustes de contagem com saldo antes/depois, motivo e responsável.
- **Nunca negativo:** a saída é recusada se não houver stock suficiente.
- **Entrada a partir da compra:** depois de comprar, o mestre dá entrada no inventário e as quantidades ficam ligadas àquela requisição.
- **Reutilizar:** modelos de requisição (partilháveis), favoritos de material, duplicar uma requisição e PDF pronto a imprimir.

---

## 10. Avisos e prazos

Canais:

- **Na aplicação** — sino Avisos, com contagem por ler.
- **WhatsApp** — template aprovado para avisos proactivos (fora da janela de 24 h).
- **Email** — via Resend, para quem tem email na ficha.
- **SMS** — gateway HTTP, para zonas sem dados.

Prazos por estado (SLA): submetido 4 dias · aprovado 5 · dinheiro enviado 10 · compra comprovada 5.
A lista marca **A acompanhar** e **Atrasado** com os dias. `npm run alertas` (cron diário) avisa responsáveis e evita repetições. Comentários avisam mestre, aprovadores que decidiram e chefia.

---

## 11. Segurança e controlo

- **Sessões revogáveis:** desactivar um utilizador ou mudar a senha corta acessos antigos.
- **Segundo factor (TOTP):** código de 6 dígitos a cada entrada, com Google Authenticator, Authy ou 1Password.
- **Recuperação de senha:** o administrador gera um código de uso único (24 h, guardado em hash) e passa-o por telefone; a pessoa usa-o em `/recuperar`.
- **Limites:** login com 8 falhas em 15 minutos; acções sensíveis limitadas por utilizador.
- **Auditoria:** cada inserção, alteração e remoção fica registada com autor e diferenças — senhas e segredos nunca entram no registo.
- **Cabeçalhos:** nosniff, X-Frame-Options, Permissions-Policy e Content-Security-Policy.

---

## 12. Como está feito

- **Next.js 14** (App Router, acções no servidor) — ecrãs leves e validação no servidor.
- **PostgreSQL (Neon)** — regras de negócio no banco: fecho só com prova, histórico e auditoria por triggers.
- **Cloudflare R2** — comprovativos privados, entrega autenticada.
- **50 testes automáticos** (unitários e de integração com base real), CI com Postgres que aplica esquema e migrações e faz o build.
- **`/api/saude`** para monitorização; alertas diários por cron.

---

## 13. O que muda no dia a dia

- O mestre entra e vê logo **o que fazer**: criar requisição nova ou continuar a que está à espera dele (corrigir, comprar, dar entrada no stock).
- O aprovador entra e vê **a fila da sua área**, sem procurar.
- O financeiro entra e vê **o que está por pagar e por acertar**.
- A administração vê o estado geral, as contas de teste activas e as últimas alterações.
- Ninguém precisa de perguntar "em que pé está?" — está na lista e no histórico.

---

## 14. Estado e próximos passos

**Já está:** fluxo completo, aprovações por valor, delegação, auditoria, 2FA, canais de aviso, relatórios, inventário e exportações.

**Antes de dinheiro real:**

1. Remover as contas de teste e mudar a senha do administrador.
2. Desligar a lista de credenciais no login (`MOSTRAR_CREDENCIAIS_TESTE=false`).
3. Configurar armazenamento (R2), canais de aviso e template de WhatsApp.
4. Activar Point-in-Time Recovery no Neon e object lock no R2.
5. Agendar os alertas diários e monitorizar `/api/saude`.

**Fecho:** menos papelada, mais obra feita.
