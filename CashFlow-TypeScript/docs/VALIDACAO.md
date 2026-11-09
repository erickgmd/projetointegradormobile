# Validação da versão3 —04/11/2026

## Resultado executado

- `npm test`:39 testes aprovados,0 falhas,0 ignorados. Última execução: aproximadamente35s neste ambiente.
- `npm run check`: tipos aprovados.
- `npm run build`: compilação aprovada e bibliotecas gráficas copiadas para public/vendor.
- `npm ci`: instalação reproduzível executada; lock atualizado para a biblioteca estática corrigida.
- `npm audit --omit=dev`:0 vulnerabilidades conhecidas reportadas no catálogo consultado para as dependências de produção.
- Revisão estática independente: nenhum achado crítico/importante apontado no conjunto examinado.

A auditoria encontrou vulnerabilidades na versão anterior de @fastify/static. A dependência foi atualizada para10.1.10 e a suíte completa foi repetida com sucesso. Auditoria sem ocorrências não constitui prova de ausência de vulnerabilidades.

## Cobertura

API de cadastro/login/logout, sessão expirada/inativa, hashes PHP, formulários, origem da requisição, recuperação com envio simulado, token único, revogação de sessões, edição de lançamento, categorias, reenvio idempotente, saldo exato, limites, alertas, RLS contra acesso cruzado e política pública legada, preferências, consentimento, exclusão da conta, estrutura antiga varchar/int8 e preservação de dados, falha do Banco Central, webhook com segredo e deduplicação, fila durável e retry de alertas.

Parser Telegram, vínculo, mensagens, categorias sugeridas, data em São Paulo, prévia OCR, confirmação obrigatória e descarte do buffer com provedor simulado. Calculadora CLT2026, limites INSS/IRRF e simulações com taxa zero.

UI de edição, despesa rápida e retry, dados opcionais no cadastro, referências locais e integração da Home com a API. Axe-core em login, três etapas de cadastro, privacidade, Home e Perfil, com contraste de cores desabilitado por limitação do DOM simulado. Não houve violações automatizadas detectadas nesses cenários; isso não certifica WCAG2.1AA.

## Limites de comprovação

Banco PGlite (PostgreSQL embarcado), Fastify inject e JSDOM. Não houve acesso ou alteração no banco Supabase real, execução Docker, navegação em Chrome/Firefox/Edge/Safari reais, email SMTP real, bot/cliente Telegram real nem processamento OCR real de notas. O modelo OCR e as integrações exigem configuração no seu ambiente.

Prazos3s/5s/15s/60s e disponibilidade95% não foram demonstrados. A publicação no repositório GitHub oficial depende de identificar esse repositório. Os procedimentos de privacidade, operador, contato e retenção de backups exigem revisão antes de publicar. A matriz MATRIZ.md e o plano ACEITE.md registram as pendências, sem classificá-las como cumpridas.
