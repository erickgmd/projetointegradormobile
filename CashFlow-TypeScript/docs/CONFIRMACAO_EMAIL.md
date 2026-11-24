# CashFlow — confirmação de e-mail web

Atualização preparada para a pasta **CashFlow-TypeScript** do repositório erickgmd/projetointegradormobile, usada como Root Directory no Render. Base consultada: commit `9db50d1385a0391afe5ac72355512cfe4caf5762`.

## O que muda

- Novos cadastros por e-mail/senha ficam pendentes, sem cookie de sessão, até confirmar o endereço.
- Link de uso único válido por 24 horas. A página exige clicar em Confirmar e-mail, evitando consumo por scanners que apenas abrem o link.
- Após confirmar, o usuário entra normalmente com e-mail e senha. O link não autentica automaticamente.
- Reenvio com resposta genérica para não revelar cadastro, intervalo mínimo de um minuto por conta e limite de cinco requisições por IP a cada 15 minutos.
- Token aleatório de 256 bits; só o hash SHA-256 fica no banco. O link usa fragmento e a página o remove do histórico sem persistir o token.
- Contas anteriores à atualização continuam acessando. Elas não são marcadas artificialmente como confirmadas: apenas não passam a exigir confirmação.
- Google só dispensa a confirmação quando o token tem email_verified=true. Se Google reivindicar um pré-cadastro pendente, a senha desse pré-cadastro é removida para evitar que outra pessoa conserve acesso.
- Trocar o e-mail no perfil exige confirmar o novo endereço e encerra as sessões antigas. Sem envio configurado, a troca é recusada sem modificar o endereço existente.
- Tabela de tokens com RLS habilitada, sem políticas públicas e sem acesso pelo papel cashflow_app.

## Aplicar no projeto

1. Faça backup/commit do código atual e backup do banco.
2. Extraia este ZIP em uma pasta separada. Copie o conteúdo da pasta **CashFlow-TypeScript** do pacote para a pasta **CashFlow-TypeScript** do seu repositório, preservando os caminhos. O pacote contém somente arquivos novos ou alterados; não substitua o projeto inteiro.
3. Se algum desses arquivos tiver mudanças suas posteriores ao commit-base, faça a mesclagem manual. Não sobrescreva essas mudanças sem revisar.
4. Não copie para o `src` da raiz do repositório: ele pertence à outra versão. Não há alterações Android, em google-services.json, Firebase ou chaves de assinatura neste pacote.

## Banco de dados

Na pasta CashFlow-TypeScript, com DATABASE_URL e SSL configurados:

```powershell
npm run db:migrate
```

O comando inclui a nova migração `database/004_email_verification.sql`. Ela adiciona duas colunas a usuarios e a tabela verificacoes_email, sem remover usuários ou transações. É idempotente. Execute com o proprietário do banco, como nas migrações anteriores. Não execute somente a migração 004 em um banco vazio: as anteriores criam o papel cashflow_app e a estrutura-base.

Você deve aplicar a migração **antes** de colocar a nova versão no ar. Não a executamos no Supabase. O novo servidor verifica a existência da tabela e se recusa a iniciar se a migração estiver ausente.

## Render e SMTP

Mantenha o Root Directory como `CashFlow-TypeScript` e confira estas variáveis em Environment:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://projetointegradormobile.onrender.com
SMTP_HOST=seu-servidor-smtp
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-usuario-smtp
SMTP_PASSWORD=sua-senha-smtp
SMTP_FROM=CashFlow <seu-email-remetente@dominio.com>
```

Use dados reais do seu provedor, sem publicar credenciais no Git. Porta 465 normalmente usa SMTP_SECURE=true. O remetente deve estar autorizado pelo provedor. Se o ambiente de hospedagem bloquear a conexão SMTP, será necessário um provedor/rota de envio permitido pelo ambiente; esta atualização não contorna bloqueios de rede.

Sem APP_ORIGIN válido ou SMTP_HOST/SMTP_FROM em produção, novos cadastros retornam indisponibilidade e não criam contas inacessíveis. Se o SMTP falhar durante o envio, a conta fica pendente e pode solicitar reenvio. Em desenvolvimento, com APP_ORIGIN configurado e sem SMTP, o link aparece no terminal somente para teste local; não compartilhe esse terminal ou link.

## Validar e publicar

```powershell
npm install
npm run check
npm test
npm run build
```

Os comandos devem ser executados dentro de CashFlow-TypeScript. Nenhuma dependência nova foi adicionada.

Depois de revisar os arquivos, faça commit/push na branch de publicação e redeploy no Render conforme o fluxo do seu projeto. A publicação desta branch no GitHub não aplica a migração, não configura o SMTP e não coloca a funcionalidade em produção automaticamente.

## Teste de aceite depois do deploy

1. Cadastre uma nova conta usando um e-mail de teste que você consiga acessar.
2. Confira que o cadastro vai à tela de confirmação, sem acesso ao dashboard.
3. Antes de confirmar, tente entrar com a senha correta: o acesso deve ser bloqueado.
4. Abra o e-mail, clique no link e depois no botão Confirmar e-mail.
5. Entre com a senha e confira o acesso.
6. Reutilize o link: deve ser recusado. Teste também reenvio, link anterior e conta existente.
7. Para contas Google, valide o login sem exigir um segundo e-mail de confirmação.

O recebimento real de e-mail depende das suas credenciais SMTP, do provedor e da hospedagem. Não foi enviado e-mail real nem testado recebimento em caixa postal nesta entrega.

## Testes incluídos

`tests/email-verification.test.ts` cobre cadastro pendente, hash, login bloqueado, senha incorreta, token válido/inválido/expirado/reutilizado, reenvio e intervalo, falha e ausência de SMTP, contas antigas, Google e pré-cadastro, troca de e-mail, página sem consumo automático, concorrência de confirmação, permissão dos tokens e migração idempotente. O envio SMTP é substituído por um emissor de teste; rotas, SQL e estado do banco são exercitados de verdade com PGlite. A página de confirmação é exercitada com JSDOM. Não é teste em navegador real ou Android.

Observações da validação local: Node 24.22.3, dependências já instaladas no ambiente. A suíte existente escreve um aviso `fetch is not defined` no teste de acessibilidade Home/Perfil, mas o teste termina aprovado. O npm também avisa sobre a configuração http-proxy do ambiente. Esses avisos não representam entrega SMTP comprovada.
