# Validação local — confirmação de e-mail CashFlow

Data: 24/11/2026. Base do backend: CashFlow-TypeScript, commit 9db50d1385a0391afe5ac72355512cfe4caf5762.

- `npm run check`: concluído com código 0.
- `npm test`: 65 testes aprovados, 0 falhas, 0 ignorados. Inclui 15 testes novos de confirmação de e-mail.
- `npm run build`: concluído com código 0.
- Runtime: Node 24.22.3; dependências já disponíveis no ambiente, sem reinstalação limpa.
- Novas rotas, persistência, hashes, consumo único e bloqueio de login foram exercitados com Fastify inject e PostgreSQL embarcado PGlite.
- Página de confirmação exercitada por JSDOM com chamadas à API real de teste: abrir o link não consome o token; o botão faz a confirmação e permite login posterior.
- SMTP e verificação criptográfica externa Google substituídos nos respectivos testes por adaptadores de teste. Não foi enviado e-mail real.
- Suite anterior emite um `ReferenceError: fetch is not defined` durante o teste axe-core Home/Perfil, que ainda é reportado como aprovado pelo executor. O npm avisa sobre http-proxy do ambiente. Esses avisos foram preservados e não são considerados prova de validação real do envio.
- Sem validação visual em navegador real nesta entrega e sem testes Android.
- Nenhuma alteração aplicada ao Render ou Supabase; migração e deploy dependem dos passos em CONFIRMACAO_EMAIL.md.

Escopo de empacotamento: somente arquivos alterados/novos da pasta publicada. Não inclui .env, credenciais, node_modules, dist ou projeto Android.
