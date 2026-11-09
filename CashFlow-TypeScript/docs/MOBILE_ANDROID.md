# CashFlow no Android (Capacitor)

A pasta `mobile/` contém o aplicativo Android do CashFlow, feito com Capacitor 8. O aplicativo é um "invólucro" nativo que abre as telas do servidor CashFlow (as mesmas de `public/`) e acrescenta recursos do celular, como salvar e compartilhar o relatório PDF.

O servidor (Fastify + PostgreSQL) continua sendo o mesmo. Por isso as telas, o login com cookie de sessão, a proteção de origem e as regras de negócio funcionam sem reescrever o frontend.

```
CashFlow-TypeScript/
├── src/, public/, database/ ...   servidor e telas (sem mudanças de arquitetura)
├── public/mobile.js               ajustes usados só dentro do app (PDF)
└── mobile/
    ├── capacitor.config.ts        endereço do servidor que o app abre
    ├── www/                       página de carregamento e página "sem conexão"
    └── android/                   projeto Android Studio (gerado pelo Capacitor)
```

## 1. Instalar as ferramentas (uma vez só)

1. **Node.js 22 ou superior** (já usado pelo projeto). Confira com `node -v`.
2. **Android Studio 2025.2.1 ou superior**: https://developer.android.com/studio. Na primeira abertura, aceite o assistente padrão ("Standard"). Ele instala o Android SDK, as ferramentas e o JDK.
3. No Android Studio, abra **More Actions > SDK Manager** (ou **Settings > Languages & Frameworks > Android SDK**):
   - aba **SDK Platforms**: marque **Android 16 (API 36)**;
   - aba **SDK Tools**: confirme **Android SDK Build-Tools**, **Android SDK Platform-Tools** e **Android Emulator**.
4. Coloque o `adb` no PATH do Windows (necessário para o passo 5):
   - Pesquise "Variáveis de ambiente" no Windows > **Variáveis de Ambiente** > em "Variáveis do usuário", edite **Path** > **Novo** e adicione:
     `%LOCALAPPDATA%\Android\Sdk\platform-tools`
   - Feche e abra o PowerShell de novo. Teste com `adb version`.

## 2. Criar o celular virtual (emulador)

1. Android Studio > **More Actions > Virtual Device Manager** > **Create Virtual Device** (ou o botão **+**).
2. Escolha um aparelho, por exemplo **Pixel 8**, e clique em **Next**.
3. Escolha a imagem do sistema **API 36** (baixe se pedir) e conclua.
4. Clique em ▶ para ligar o emulador e espere a tela inicial do Android aparecer.

## 3. Subir o servidor CashFlow no computador

No PowerShell, na pasta do projeto (a que contém `package.json`), como você já faz:

```powershell
npm ci
npm run db:migrate
npm run build
npm start
```

Confirme no navegador do computador que **http://localhost:3001** abre a tela de login. Deixe essa janela do PowerShell aberta.

Mantenha no `.env`:

```env
APP_ORIGIN=http://localhost:3001
PORT=3001
HOST=127.0.0.1
NODE_ENV=development
```

## 4. Instalar as dependências do aplicativo (uma vez só)

Abra **outro** PowerShell:

```powershell
cd mobile
npm install
npx cap sync android
```

O projeto Android já vem gerado em `mobile/android`. Se um dia você apagar essa pasta, recrie com `npx cap add android` e depois `npx cap sync android`.

## 5. Liberar o endereço do emulador no servidor

O emulador enxerga o seu computador pelo endereço fixo `10.0.2.2`. O aplicativo já vem configurado para abrir `http://10.0.2.2:3001`. Acrescente no `.env` do servidor:

```env
APP_EXTRA_ORIGINS=http://10.0.2.2:3001
```

Depois reinicie o servidor (Ctrl+C e `npm start`). Sem essa linha, a proteção de origem recusa o login feito pelo app.

## 6. Abrir no Android Studio e rodar

```powershell
npx cap open android
```

Se o comando não encontrar o Android Studio, abra o Android Studio manualmente e use **Open** na pasta `mobile\android`.

No Android Studio:

1. Espere a barra inferior terminar o **Gradle Sync** (na primeira vez demora alguns minutos e baixa dependências).
2. No topo, escolha o emulador criado no passo 2.
3. Clique em ▶ **Run 'app'**.

O CashFlow abre no emulador na tela de login. Faça login, cadastre transações, gere o relatório PDF (abre a tela de salvar/compartilhar do Android) e teste as demais telas.

### Testar no seu celular físico (opcional)

1. No celular: **Configurações > Sobre o telefone** > toque 7 vezes em **Número da versão**. Depois, em **Opções do desenvolvedor**, ative **Depuração USB**.
2. Conecte o cabo USB, aceite a autorização no celular e confira com `adb devices`.
3. O celular não enxerga `10.0.2.2`. Aponte o app para `localhost` e redirecione a porta pelo cabo:
   ```powershell
   $env:CASHFLOW_URL="http://localhost:3001"
   npx cap sync android
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:3001 tcp:3001
   ```
4. Clique em ▶ no Android Studio escolhendo o seu aparelho. Repita o `adb reverse` sempre que reconectar o cabo ou o Android Studio reiniciar. Para voltar ao emulador, feche o PowerShell (ou rode `Remove-Item Env:CASHFLOW_URL`) e rode `npx cap sync android` de novo.

## 6.1 Login com Google no app

O app usa o login nativo do Android. Configure o `GOOGLE_CLIENT_ID` e o cliente Android (pacote `br.com.cashflow.app` + SHA-1) como em `docs/ATUALIZACAO_NOV2026.md`. O emulador precisa de uma imagem **Google Play** com uma conta Google conectada.

## 7. Depurar (ver erros do app)

- Com o app aberto, acesse no **Chrome do computador**: `chrome://inspect/#devices` e clique em **inspect** abaixo de "CashFlow". Você vê o console, a rede (`/api/...`) e os cookies, como no DevTools comum.
- No Android Studio, a aba **Logcat** mostra os erros nativos.

## 8. Ciclo de trabalho no dia a dia

| O que mudou | O que fazer |
| --- | --- |
| HTML, CSS ou JS em `public/` | Só recarregar o app (feche e abra, ou no `chrome://inspect` aperte F5). Não precisa recompilar. |
| Código do servidor em `src/` | `npm run build` e reiniciar `npm start` (ou usar `npm run dev`). |
| `mobile/capacitor.config.ts`, plugins ou `mobile/www` | `npx cap sync android` e rodar ▶ de novo. |

## 9. Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| Tela "Não foi possível conectar" | O servidor não está rodando (`npm start`). |
| Login responde "Origem não autorizada" | Falta `APP_EXTRA_ORIGINS=http://10.0.2.2:3001` no `.env`, ou o servidor não foi reiniciado depois de incluir a linha. |
| "Erro ao conectar com o servidor" e `ERR_CONNECTION_REFUSED` no `chrome://inspect` | O app está apontando para `localhost` sem `adb reverse` ativo. No emulador, use o padrão `10.0.2.2` (rode `npx cap sync android` sem `CASHFLOW_URL`). |
| Tela branca | Abra `chrome://inspect` e veja o erro no console. |
| Gradle falha na primeira vez | Confira a internet, depois **File > Sync Project with Gradle Files**. Se pedir, aceite instalar o SDK/Build-Tools indicado. |
| `npx cap open android` não abre | Abra o Android Studio e use **Open** em `mobile\android`. |

## 10. Gerar o APK

**APK de teste:** Android Studio > **Build > Generate App Bundles or APKs > Generate APKs**. O arquivo fica em `mobile\android\app\build\outputs\apk\debug\app-debug.apk`. Esse APK aponta para `10.0.2.2:3001` e só funciona no emulador, com o servidor rodando no computador.

**Versão para outras pessoas usarem:** o servidor precisa estar publicado com HTTPS (veja "Publicação" no `README.md`, com `compose.production.yaml`). Depois:

```powershell
cd mobile
$env:CASHFLOW_URL="https://seu-dominio.com.br"
npx cap sync android
```

No `.env` do servidor publicado, `APP_ORIGIN` deve ser exatamente esse mesmo endereço. Gere o pacote assinado em **Build > Generate Signed App Bundle or APK** (crie e guarde a keystore; ela é necessária para todas as atualizações futuras). Na versão HTTPS o app não libera tráfego `http`.

## Como funciona e limites

- O app carrega as telas do servidor (`server.url` do Capacitor). Sem internet ou com o servidor fora do ar, ele mostra `mobile/www/erro.html`.
- Em produção não use `APP_EXTRA_ORIGINS`: o app e o `APP_ORIGIN` usam o mesmo domínio HTTPS.
- O cookie de sessão (`httpOnly`, `SameSite=Lax`) funciona como no navegador, porque as telas e a API estão na mesma origem.
- `public/mobile.js` só age dentro do app. No navegador comum nada muda. Dentro do app, o relatório PDF é gravado no cache e aberto na tela de compartilhar/salvar do Android, porque o WebView não faz download de arquivos gerados em memória.
- ViaCEP, Banco Central e VLibras continuam dependendo de internet, como na versão web.
- Este formato não funciona sem conexão com o servidor. Para uso offline seria necessário empacotar as telas dentro do app e liberar CORS e cookies entre origens no servidor, o que é uma mudança maior.
- Testado neste pacote: geração do projeto Android pelo Capacitor e os 39 testes do servidor. A compilação no Android Studio e a execução em emulador ou aparelho precisam ser conferidas na sua máquina.
