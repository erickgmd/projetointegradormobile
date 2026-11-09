# Migração CashFlow

Objetivo: substituir todo PHP por TypeScript/Fastify, conservar interface e PostgreSQL.
Escolha autorizada: stack sugerida na conversa; implementação integral solicitada pelo usuário.
Alternativas: Go priorizaria distribuição nativa; manter PHP evitaria migração. TypeScript reaproveita conhecimento do frontend.

1. Testar contratos de cadastro em três etapas, login/logout, perfil, limites, transações e isolamento de usuários.
2. Implementar API com SQL parametrizado, senhas bcrypt compatíveis com PHP, sessões persistidas no PostgreSQL e cookies HttpOnly.
3. Adaptar URLs no frontend, conservar relatórios, gráficos e acessibilidade. Não incluir credenciais do original.
4. Entregar migração SQL aditiva, Docker Compose e execução Windows; validar testes e compilação.
   Revisão: datas inválidas, valores monetários brasileiros, acesso entre usuários, sessão após logout, migração sobre dados existentes.
   Limites: dump do banco e implementação do bot Telegram não constam do ZIP; APIs e CDNs externas dependem de internet.
