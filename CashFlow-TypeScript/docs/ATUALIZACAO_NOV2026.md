# Atualização de novembro/2026: Google, senha forte, mobile e correções

Esta versão vale ao mesmo tempo para o **site** e para o **aplicativo Android**: o app abre as mesmas telas do servidor, então tudo que mudou em `public/` aparece nos dois.

## O que mudou

| Pedido | O que foi feito |
| --- | --- |
| Login e cadastro com Google | Botão "Entrar com Google" no login e "Cadastrar com Google" no cadastro. No site usa o botão oficial do Google; no app usa o login nativo do Android (plugin `@capgo/capacitor-social-login`). O servidor confere o token do Google (`/api/login/google`). Conta nova pelo Google exige aceitar os termos; se já existir conta com o mesmo email, ela é vinculada. |
| Despesa rápida | Virou um cartão próprio, com o mesmo visual dos outros, campo e botão "Registrar" lado a lado e "Criar nova categoria" organizada. |
| Botão Aparência acompanhando o rodapé | O contraste/brilho era aplicado no `<body>`, o que fazia os botões fixos rolarem junto com a página. Agora o filtro fica no `<html>` e os botões Aparência e Ajuda ficam presos ao rodapé da tela. |
| Monitor de taxas BCB | O endereço da API estava errado (`TaxasJurosMensalPorMes(Mes=@Mes)` não existe). Agora a consulta usa o recurso correto com filtro por `anoMes`. Se o mês pedido ainda não foi publicado, mostra o mês mais recente e avisa. Tempo de espera maior, cópia em cache por 30 min e botão "Tentar novamente". |
| VLibras | Atualizado para a versão atual do plugin (v7). A marcação antiga (`<div vw>`) foi removida. No celular, o botão flutuante do VLibras (que cobria o conteúdo no meio da tela) fica oculto e o VLibras abre pelo botão "Tradução em Libras" no painel Aparência. No computador continua como antes. |
| Resetar senha por email | Email em HTML com botão "Criar nova senha", telas novas de "Esqueceu a senha?" e "Criar nova senha" com medidor de força. Sem SMTP configurado (fora de produção), o link aparece no terminal do servidor para testar. |
| Caracteres especiais no cadastro | O cadastro agora envia em JSON UTF-8 e foi testado com nome "João D'Ávila-Conceição" e senha com `@ # ! ç`. |
| Aviso de senha fraca | Medidor (fraca/média/forte) com a lista do que falta. Regra: 8+ caracteres, maiúscula, minúscula, número e caractere especial. A mesma regra vale no servidor (cadastro e redefinição). |
| LGPD/Termos/Política | Os links abrem uma janela por cima do cadastro, com "Voltar" e "Li e concordo" (que já marca a caixa). Nada do que foi preenchido se perde. A página `/privacidade.html` também ganhou "Voltar" para a tela anterior. |
| Mensagem dos termos | Sem o balão do navegador: aparece a mensagem em vermelho embaixo da caixa, igual às outras. |
| CEP automático | O botão "Buscar CEP" saiu. Ao digitar os 8 números, o endereço é preenchido e uma linha abaixo do campo mostra o resultado. |
| CSS da recuperação de senha | Telas novas no mesmo visual do login. |
| Lembrar de mim | Não fazia nada. Agora: marcado, o email fica salvo no aparelho e a sessão dura 30 dias (mesmo fechando o app). Desmarcado, a sessão acaba ao fechar o navegador ou após 30 min parado. |
| Aspecto mobile | Barra de navegação inferior (Dashboard, Ferramentas, Relatórios, Taxas BCB), cabeçalho compacto, resumo com saldo em destaque, campos maiores (sem zoom ao tocar), telas de login/cadastro em formato de "folha" de app, botões flutuantes acima da barra. No computador o layout continua o mesmo. |

Outras correções encontradas no caminho: o ícone de mostrar senha do login exibia o texto "icone senha.png"; a caixa "Lembrar de mim" não era acessível pelo teclado; a tela de Perfil não tinha ajuste para celular; excluir uma conta criada só com Google dava erro.

## Como atualizar sua instalação

1. Pare o servidor (Ctrl+C).
2. Extraia o zip por cima da pasta atual (o seu `.env` e o certificado não vêm no zip e continuam como estão).
3. Na pasta `CashFlow-TypeScript`:
   ```powershell
   npm install
   npm run db:migrate
   npm run build
   npm start
   ```
   O `db:migrate` aplica a migração `003_google_lembrar.sql` (colunas `usuarios.google_sub` e `sessoes.lembrar`). Ela só acrescenta colunas.
4. Na pasta `mobile` (para o app):
   ```powershell
   npm install
   npx cap sync android
   ```
   Depois rode ▶ no Android Studio.

## Configurar o login com Google

Sem esta configuração o botão aparece, mas avisa que o Google ainda não foi configurado.

1. Acesse https://console.cloud.google.com e crie um projeto (ex.: "CashFlow").
2. Abra **Google Auth Platform** (ou "APIs e serviços > Tela de consentimento OAuth") e clique em **Começar**:
   - **Branding**: nome do app "CashFlow" e seu email de suporte.
   - **Audience (Público)**: tipo **Externo**. Enquanto estiver em teste, adicione em **Test users** os emails Google que vão testar.
3. Em **Clients (Clientes) > Create client**, crie o cliente **Aplicativo da Web**:
   - Origens JavaScript autorizadas: `http://localhost:3001` (e, quando publicar, o seu domínio `https://...`).
   - Copie o **Client ID** (termina em `.apps.googleusercontent.com`).
4. Ainda em **Clients**, crie um cliente **Android** (necessário para o app):
   - Nome do pacote: `br.com.cashflow.app`
   - Impressão digital SHA-1 da chave de depuração. No PowerShell:
     ```powershell
     keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
     ```
     Copie a linha `SHA1:`. Se o `keytool` não for reconhecido, use o do Android Studio: `& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" ...` com os mesmos parâmetros. Outra opção: na pasta `mobile\android`, rode `.\gradlew signingReport`.
   - O ID deste cliente Android **não** vai no código. O Google reconhece o app pelo pacote + SHA-1.
5. No `.env` do servidor:
   ```env
   GOOGLE_CLIENT_ID=SEU_CLIENT_ID_WEB.apps.googleusercontent.com
   ```
   Reinicie o `npm start`.
6. Para testar no emulador, ele precisa ter os serviços do Google: crie o celular virtual com uma imagem **"Google Play"** (ou "Google APIs") e entre com uma conta Google em **Configurações > Google** dentro do emulador.

Quando gerar o APK assinado para publicar, crie outro cliente Android com o SHA-1 da chave de publicação.

## Configurar o envio de email (Gmail)

1. Na conta Google que vai enviar, ative a **Verificação em duas etapas**.
2. Em https://myaccount.google.com/apppasswords crie uma **senha de app** (ex.: "CashFlow").
3. No `.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=seuemail@gmail.com
   SMTP_PASSWORD=as16letrasdasenhadeapp
   SMTP_FROM=CashFlow <seuemail@gmail.com>
   ```
4. Reinicie o servidor. Em "Esqueceu a senha?", o email chega com o botão "Criar nova senha".

O link do email usa o `APP_ORIGIN` (`http://localhost:3001`), então abra o email no computador onde o servidor está rodando. Para funcionar no celular de qualquer pessoa, o servidor precisa estar publicado com HTTPS e o `APP_ORIGIN` apontando para esse domínio.

Sem SMTP, para testar: peça a recuperação e copie o link que aparece no terminal do `npm start`.

## Verificações feitas

- 48 testes automatizados passando (`npm test`), incluindo novos testes de senha forte, Lembrar de mim, login Google (conta nova, vínculo e exclusão), consulta ao BCB e email de recuperação.
- Telas conferidas em tamanho de celular (Pixel 7) e de computador num navegador Chromium, com o servidor rodando em PostgreSQL local.
- Não foi possível testar daqui: o login real do Google (exige seu Client ID), o envio real de email, a API do Banco Central, o ViaCEP e o VLibras (sem acesso a esses sites neste ambiente). A lógica do BCB foi testada com respostas simuladas no formato da API.

## Ajustes seguintes (v3)

- **Origem não autorizada:** em desenvolvimento (`NODE_ENV=development`), o servidor aceita `localhost`, `127.0.0.1` e `10.0.2.2` na mesma porta. Em produção continua aceitando só o `APP_ORIGIN`.
- **Erros em vermelho:** somem assim que a pessoa corrige o campo (cadastro, login, recuperar e redefinir senha).
- **Perfil:** "Preferências de apresentação" e "Privacidade e conta" foram refeitos no mesmo visual dos outros blocos (claro e escuro), com interruptor de alto contraste e área de exclusão destacada.
- **App mais leve:** no celular, sem desfoque de fundo, sem animações contínuas, gráficos sem animação e VLibras carregado só quando a pessoa toca em "Tradução em Libras".

## Ajustes seguintes (v4)

- **Movimentações:** cabeçalho alinhado à esquerda no celular, filtros lado a lado, "Limpar tudo" discreto, cada transação com ícone ↑/↓ e botões Editar/Excluir com ícone (no celular, só o ícone, com área de toque de 44px).
- **Boas-vindas "Dashboard":** aparece só na aba Dashboard.
- **Consentimento:** quando já registrado, o Perfil mostra "Consentimento registrado" com a data, em vez da caixa de seleção.
- **Telegram:** o código sumia logo depois de ser gerado (a tela recarregava o estado e escondia). Agora aparece a mensagem completa `/vincular CÓDIGO` com botão "Copiar mensagem", validade e situação do vínculo. O item do menu passou a se chamar "Código".
- **Gasto máximo:** o campo tem o mesmo visual dos outros. Ao tocar em "Configurar gasto máximo" nas notificações, o Perfil rola até o campo, destaca e posiciona o cursor nele.
- **Banco antigo (Supabase):** a migração 003 libera `senha` vazia para contas criadas pelo Google.
