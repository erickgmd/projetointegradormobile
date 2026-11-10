# CashFlow versão 3

Projeto web com backend TypeScript/Fastify/PostgreSQL e módulo Telegram/OCR, adaptado aos41 requisitos funcionais e25 não funcionais recebidos. A situação de cada requisito está em `docs/requisitos/MATRIZ.md`: implementação em código não equivale a comprovar SLA, acessibilidade completa ou disponibilidade em produção.

## Atualizar sua instalação Windows com Supabase

1. Pare a versão anterior com Ctrl+C. Faça backup do banco. Extraia este ZIP em outra pasta.
2. Copie seu `.env` e `supabase-ca.crt` da instalação anterior para a pasta nova que contém `package.json`. O pacote não inclui credenciais reais.
3. Preserve sua `DATABASE_URL` e acrescente no `.env`:

```env
DB_SSL=true
DB_CA_FILE=./supabase-ca.crt
APP_ORIGIN=http://localhost:3001
PORT=3001
HOST=127.0.0.1
NODE_ENV=development
```

`DB_CA_FILE` permite usar o certificado sem repetir o comando PowerShell `NODE_EXTRA_CA_CERTS`. Use a senha codificada na URL apenas uma vez, conforme sua conexão já validada.

4. No PowerShell, dentro da pasta nova, execute um comando por vez:

```powershell
npm ci
npm run db:migrate
npm run build
npm start
```

Acesse **http://localhost:3001**. Requisitos: Node.js 22 ou superior; recomendado24.

A migração003 acrescenta as colunas do login com Google e do "Lembrar de mim". A migração002 acrescenta tabelas, preferências, consentimento, validade dos tokens e políticas RLS. Mantém os dados financeiros, não converte `renda`/`despesas` varchar do esquema antigo e converte os códigos Telegram para texto. Campos complementares do cadastro tornam-se opcionais. Categorias legadas de até100 caracteres são importadas.

**RLS:** a migração deve ser executada pelo proprietário do banco, capaz de criar e conceder o papel `cashflow_app`. Ela restringe os papéis públicos `anon` e `authenticated` do Supabase: os dados passam a ser acessados pelo backend. Teste primeiro em cópia do banco, especialmente se houver outro aplicativo usando a API direta do Supabase. Recriar políticas não remove políticas de terceiros, mas uma política restritiva mantém o isolamento do papel do CashFlow.

Links Telegram antigos precisam ser gerados e vinculados novamente no bot novo, porque o código passa a ter hash, validade de10 min e consumo único. Senhas bcrypt PHP continuam reconhecidas; sessões antigas são encerradas por inatividade ou logout.

## Funções incluídas

Cadastro em três etapas com dados complementares opcionais; login; recuperação por email; sessão com30 min de inatividade; edição/exclusão de transações; categorias próprias; despesa rápida; resumo e filtros; limite mensal e avisos80/100%; relatórios PDF; ferramentas financeiras; preferências de tema/acessibilidade; consentimento e exclusão de conta.

O módulo Telegram oferece vínculo, receitas/despesas por texto, saldo, extrato e comprovante por foto com OCR e confirmação antes de salvar. O arquivo de imagem é processado em memória e descartado; o cache de OCR contém apenas o modelo de idioma. A foto original no serviço Telegram segue as regras desse serviço.

Os gráficos e a biblioteca PDF são fornecidos localmente em `public/vendor/`. ViaCEP, Banco Central e VLibras dependem de internet; falhas nesses serviços não desabilitam o registro financeiro. A calculadora salarial está identificada como simulação CLT 2026; fontes e limites em `docs/requisitos/CALCULOS.md`.

O aplicativo Android fica em `mobile/` (Capacitor 8) e abre as mesmas telas do servidor. O passo a passo para instalar, testar no emulador do Android Studio e gerar o APK está em `docs/MOBILE_ANDROID.md`.

## Recuperação de senha por email

Configure no `.env` os dados SMTP do seu provedor:

```env
APP_ORIGIN=http://localhost:3001
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-usuario
SMTP_PASSWORD=sua-senha-smtp
SMTP_FROM=CashFlow <endereco-autorizado@seu-dominio.com>
```

Sem SMTP em produção, a recuperação informa indisponibilidade; em desenvolvimento, o link aparece no terminal do servidor. Exemplo com Gmail e configuração do login com Google em `docs/ATUALIZACAO_NOV2026.md`. Com SMTP, a resposta não revela se o email existe. O link dura15 min, é de uso único e a redefinição revoga todas as sessões. Em produção, `APP_ORIGIN` deve usar seu domínio HTTPS e o remetente deve ser autorizado pelo provedor.

## Bot Telegram e OCR

1. Crie um bot no BotFather e configure `TELEGRAM_BOT_TOKEN` no `.env`.
2. Gere um segredo local:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Copie o resultado para `TELEGRAM_WEBHOOK_SECRET`. Publique a aplicação em HTTPS (ou utilize um túnel HTTPS para desenvolvimento), ajuste `APP_ORIGIN` e reinicie o servidor.
4. Prepare o modelo português de OCR antes do primeiro uso:

```powershell
npm run ocr:prepare
```

5. Registre o webhook:

```powershell
npm run telegram:webhook
```

O webhook usa a mesma aplicação e banco; o computador/servidor precisa permanecer acessível. `localhost` sozinho não recebe mensagens do Telegram.

No Perfil, informe seu username, gere o código e envie ao bot em chat privado:

```text
/vincular CODIGO_GERADO
receita salario 2500,00
despesa mercado 35,90
/saldo
/extrato
```

Envie uma foto de comprovante legível com estabelecimento, data e total. A prévia oferece Confirmar/Cancelar e expira em15 min. Não salvará automaticamente. O processamento tem limite de tempo e pode pedir nova foto ou registro textual se a leitura falhar. O prazo de15 s é uma meta a medir no ambiente publicado, inclusive com o modelo aquecido; não uma garantia obtida nos testes com OCR simulado.

As atualizações e os alertas usam filas no PostgreSQL, com retry. Transações financeiras têm idempotência persistente, inclusive no reenvio de confirmação OCR. Mensagens externas são entrega ao menos uma vez: se o processo cair depois de enviar e antes de confirmar no banco, a mensagem pode se repetir; o lançamento financeiro permanece único.

## Docker local

```powershell
docker compose up --build -d
```

Cria banco local independente do Supabase, exposto em `localhost:5433`; aplicação em `localhost:3001`. O volume mantém os dados. Nunca use `docker compose down -v` se pretende preservá-los. A configuração local não injeta automaticamente as credenciais SMTP/Telegram do `.env` no contêiner; use a configuração de produção ou ajuste o serviço explicitamente.

## Publicação e GitHub

O exemplo `compose.production.yaml` acrescenta Caddy/HTTPS, reinício automático e remove a exposição direta do Node e do banco. Requer Docker Compose2.24+ e um domínio com DNS apontando para o servidor. Preencha `CASHFLOW_DOMAIN`, uma senha própria para PostgreSQL e os dados SMTP/Telegram no `.env`. Esse exemplo utiliza o banco do Compose; para manter Supabase na nuvem, ajuste explicitamente `DATABASE_URL`, `DB_SSL` e a montagem do arquivo CA no serviço `app`.

```powershell
docker compose -f compose.yaml -f compose.production.yaml up --build -d
```

Em produção, `NODE_ENV=production`, origem HTTPS e cookies Secure são obrigatórios. `TRUST_PROXY=true` só deve ser usado com o Node acessível exclusivamente pelo proxy confiável. Defina o operador e o contato de privacidade da instância antes de publicar. Configure backup externo, retenção de backups, monitoramento e atualizações. A meta de95% de disponibilidade precisa de histórico de monitoramento.

O workflow `.github/workflows/validacao.yml` executa tipos, testes e build. A publicação no repositório oficial ainda depende de identificar seu endereço; nenhum repositório remoto foi alterado neste trabalho. Não versione `.env`, certificados privados, tokens ou dados reais. O `.gitignore` cobre esses arquivos.

## Estrutura e verificações

- `src/services/`: finanças, recuperação/exclusão, filas.
- `src/integrations/`: Telegram, OCR e SMTP.
- `src/db.ts`: conexão TLS, transações e papel RLS por usuário.
- `src/app.ts` e `src/routes-requirements.ts`: HTTP e contratos de API.
- `database/`: migrações001 e002.
- `public/`: telas, preferências e bibliotecas locais.
- `tests/`: testes de API, finanças, RLS, bot, filas, UI e auditoria automatizada.
- `docs/requisitos/`: fonte, matriz, cálculos e plano de aceite.

```powershell
npm run check
npm test
npm run build
```

Os testes SQL usam PGlite, a API usa Fastify inject e a UI usa JSDOM/axe. Não houve acesso ao seu Supabase, envio de email/mensagem real, OCR real, execução Docker nem inspeção em navegadores reais. Auditoria automática de acessibilidade não incluiu contraste de cores e não certifica WCAG2.1AA. Veja `docs/VALIDACAO.md` e `docs/requisitos/ACEITE.md`.
# Login Google com Firebase

Esta versão usa Firebase Authentication com popup SDK no site e troca REST no backend para Android. Siga [INTEGRACAO_FIREBASE.md](INTEGRACAO_FIREBASE.md) antes de publicar. As configurações públicas estão em config/firebase-web.json (site) e config/firebase.json (Android); preserve o pacote com.Cashflow. As instruções antigas de GOOGLE_CLIENT_ID abaixo foram substituídas por essa configuração. Ative Google e autorize o domínio no Firebase.

