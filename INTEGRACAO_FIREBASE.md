# CashFlow com Firebase Authentication

## O que mudou

No site, o botão usa o SDK modular Firebase Authentication com signInWithPopup. Ele envia o ID token Firebase ao servidor, que o verifica com Firebase Admin SDK (assinatura, emissor, audiência e validade). Apenas contas com provedor google.com e email verificado são aceitas. O SDK web é empacotado localmente em public/vendor/firebase-auth.js durante npm run build, sem Analytics.

No Android, o seletor nativo Capgo continua obtendo o token Google. O servidor verifica essa credencial e a autentica no Firebase via accounts:signInWithIdp. Não é aberto popup web no WebView. O google-services.json configura o projeto Android, e sua configuração pública foi extraída para config/firebase.json. O site usa config/firebase-web.json com os dados fornecidos pelo usuário. A verificação de assinatura por chave pública usa projectId explícito; não realiza operações administrativas de contas nem checagem remota de revogação. Não é preciso enviar chave privada/service account para esse fluxo.

A identidade Google original é mantida em usuarios.google_sub; contas e transações existentes permanecem no PostgreSQL/Supabase. Login por senha, recuperação de senha e sessões continuam no backend atual. O token Firebase do site fica apenas em memória, é trocado por sessão HttpOnly do CashFlow e a sessão Firebase local é encerrada. Nenhum refresh token é salvo no localStorage.

## Configurar o site no Firebase

1. Em Authentication > Sign-in method, habilite Google e selecione o email de suporte.
2. Em Authentication > Settings > Authorized domains, adicione projetointegradormobile.onrender.com (sem https e sem caminho). Para desenvolvimento, adicione localhost explicitamente se necessário.
3. Em Authentication > Google, confira a configuração Web SDK e o cliente OAuth Web ativo do mesmo projeto. Caso o cliente tenha sido excluído, restaure-o ou configure um substituto válido. Migrar para Firebase não recupera um cliente OAuth excluído.
4. O authDomain usado é cashflow-41beb.firebaseapp.com. Para clientes configurados manualmente, confira a URI de redirecionamento https://cashflow-41beb.firebaseapp.com/__/auth/handler no cliente OAuth Web.
5. Publique package.json, package-lock.json, config, src, scripts e public no Render. Build: npm ci && npm run build. Start: npm start. Recarregue o site após o deploy.
6. A alteração web não exige gerar outro AAB. O fluxo Android foi preservado e continua exigindo SHA-1 correto.

## 1 Configuração obrigatória no painel

1. No Firebase, abra o projeto cashflow-41beb.
2. Em Authentication > Sign-in method, habilite Google e escolha o email de suporte.
3. Em Configurações do projeto > Seus apps, confirme o pacote exato com.Cashflow.
4. Cadastre o SHA-1 da assinatura efetivamente instalada: debug para Run, JKS para APK direto, assinatura do app do Play Console para teste interno distribuído pela Play Store. Cadastre também o SHA-256 correspondente.
5. Confirme que o cliente Web usado no login pertence a esse mesmo projeto Firebase/Google Cloud. Nas origens JavaScript desse cliente, autorize https://projetointegradormobile.onrender.com e o localhost usado no desenvolvimento. Se OAuth estiver em modo de teste, inclua as contas dos testadores.
6. Se atualizar o JSON, substitua mobile/android/app/google-services.json e rode npm run firebase:configure na pasta CashFlow-TypeScript.

O erro 28444 acontece antes da troca com Firebase: o seletor Google ainda exige pacote, SHA-1 e cliente Web corretos. O JSON sozinho não cadastra uma assinatura ausente.

## 2 Publicar o backend no Render

Atualize no seu repositório os arquivos deste pacote (incluindo package.json, package-lock.json, src, scripts, config/firebase.json, config/firebase-web.json, public/firebase-auth-entry.js e public/auth-ui.js). Não publique .env, JKS, pastas de build ou node_modules.

Na raiz CashFlow-TypeScript, execute:

```powershell
npm ci
npm run check
npm test
npm run build
```

Mantenha no Render o Root Directory CashFlow-TypeScript, Build Command npm ci && npm run build, Start Command npm start. Preserve as variáveis do banco, SSL e Telegram que já funcionam. Configure APP_ORIGIN=https://projetointegradormobile.onrender.com e NODE_ENV=production. A configuração Firebase pública já está em config/firebase.json.

Se necessário, sobrescreva FIREBASE_PROJECT_ID, FIREBASE_API_KEY e FIREBASE_WEB_CLIENT_ID no Render com os valores do seu projeto. O antigo GOOGLE_CLIENT_ID não é mais usado no startup. Para API keys com restrição de aplicativo Android, use uma chave apropriada ao backend e restrita às APIs necessárias do Firebase Authentication; não remova proteções indiscriminadamente.

## 3 Gerar novo Android

Na pasta mobile:

```powershell
npm ci
$env:CASHFLOW_URL="https://projetointegradormobile.onrender.com"
npx cap sync android
npx cap open android
```

O applicationId continua com.Cashflow (não mudar o pacote publicado); o namespace Java br.com.cashflow.app pode permanecer diferente. A configuração Capacitor foi alinhada a com.Cashflow. A versão passou para versionCode 9 / versionName 2.1.0. Se 9 já existir na Play Console, escolha um número maior antes de gerar o AAB. Assine com sua chave de upload atual; este pacote não inclui chaves de assinatura. Use JDK compatível com Gradle/AGP do projeto e tenha o SDK Android instalado.

## 4 Validar no celular

1. Publique primeiro o backend atualizado e depois instale o APK/AAB novo.
2. Toque em Entrar com Google, escolha uma conta e conclua o consentimento do CashFlow quando solicitado.
3. Confira se o usuário aparece em Firebase > Authentication > Users.
4. Para uma conta existente, confira se as transações continuam na mesma conta.
5. Crie uma transação de teste, recarregue, saia e teste novamente.
6. Repita pela Play Store usando a assinatura de app do Play, não só a chave de upload.

Nenhuma chamada real de login foi realizada durante a preparação deste pacote. Os testes locais usam respostas Firebase simuladas e não substituem a validação no aparelho. Nenhum usuário do Firebase ou banco hospedado foi alterado durante este trabalho.
