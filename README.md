# 💰 CashFlow

Aplicação de gestão financeira pessoal desenvolvida como Projeto Integrador do curso de Ciência da Computação.

O CashFlow permite organizar receitas e despesas, acompanhar o saldo e consultar informações financeiras em uma interface web, com adaptação para Android.

## 🎯 Objetivo

Auxiliar o usuário no controle das finanças pessoais, oferecendo uma visão organizada das movimentações e recursos para apoiar o planejamento financeiro.

## ✨ Funcionalidades

- Cadastro e autenticação de usuários.
- Login com conta Google.
- Recuperação de senha por e-mail, mediante configuração SMTP.
- Cadastro de receitas e despesas.
- Histórico de transações com filtros.
- Visualização de saldo, receitas e despesas.
- Gráficos e resumo por categoria.
- Relatórios financeiros e exportação em PDF.
- Perfil e configurações do usuário.
- Definição de gasto máximo.
- Ajustes de aparência e acessibilidade.
- Integração com VLibras.
- Assistente de orientação financeira.
- Versão Android integrada à aplicação web.

## 🛠️ Tecnologias

| Camada | Tecnologias |
|---|---|
| Interface web | HTML, CSS e JavaScript |
| Backend | Node.js, TypeScript e Fastify |
| Banco de dados | PostgreSQL hospedado no Supabase |
| Autenticação | Sessões com cookies e integração Google |
| Envio de e-mails | Nodemailer e SMTP |
| Gráficos | Chart.js |
| Relatórios PDF | jsPDF |
| Aplicativo Android | Capacitor e Android Studio |
| Hospedagem web | Render |
| Gerenciamento de testes | Qase |

## 📁 Organização do projeto

```text
CashFlow-TypeScript/
├── public/          # Páginas, estilos e scripts da interface
├── src/             # Código-fonte do backend
│   ├── integrations/
│   └── services/
├── scripts/         # Scripts auxiliares
├── tests/           # Testes automatizados
├── mobile/          # Projeto de integração mobile
└── package.json
```

## ⚙️ Pré-requisitos

Para executar a versão web:

- Node.js 22 ou superior.
- npm.
- PostgreSQL local ou uma conexão com o Supabase.
- Git.

Para compilar a versão Android, também são necessários Android Studio, Android SDK e um JDK compatível com as versões de Gradle e do plugin Android utilizadas pelo projeto.

## 🚀 Executando a aplicação web

### 1. Clone o repositório

```bash
git clone https://github.com/erickgmd/projetointegradormobile.git
cd projetointegradormobile/CashFlow-TypeScript
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na pasta `CashFlow-TypeScript`. Utilize o `.env.example` do repositório como referência, se disponível.

Exemplo básico:

```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3001

APP_ORIGIN=http://127.0.0.1:3001
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:PORTA/BANCO

GOOGLE_CLIENT_ID=SEU_CLIENT_ID_WEB

SMTP_HOST=SEU_SERVIDOR_SMTP
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=SEU_USUARIO_SMTP
SMTP_PASSWORD=SUA_SENHA_SMTP
SMTP_FROM=CashFlow <seu-email@dominio.com>
```

Substitua os valores de exemplo pelas configurações do seu ambiente.

> Nunca publique o arquivo `.env`, senhas, chaves privadas ou arquivos de assinatura Android no GitHub.

### 4. Prepare o banco de dados

```bash
npm run db:migrate
```

Confira a conexão com o banco e os requisitos de SSL antes de executar as migrações.

### 5. Inicie em desenvolvimento

```bash
npm run dev
```

Acesse:

```text
http://127.0.0.1:3001
```

### 6. Execute a versão compilada

```bash
npm run build
npm start
```

## 🔐 Autenticação com Google

O login Google exige um cliente OAuth configurado para a aplicação.

Para a versão web:

1. Configure o cliente OAuth do tipo Aplicativo da Web.
2. Cadastre as origens JavaScript autorizadas dos ambientes local e publicado.
3. Defina `GOOGLE_CLIENT_ID` no servidor.
4. Confirme que o cliente utilizado pela interface corresponde ao esperado pelo backend.

A versão Android também exige a configuração do identificador do aplicativo e das impressões digitais dos certificados de assinatura.

> A assinatura de desenvolvimento, a chave de upload e a chave de assinatura utilizada pelo Google Play podem ser diferentes. Configure o certificado correspondente à versão instalada.

## ✉️ Recuperação de senha

A recuperação utiliza um link enviado por e-mail.

Para habilitar o envio no ambiente publicado:

- Configure as variáveis SMTP.
- Defina `APP_ORIGIN` com a URL pública HTTPS.
- Verifique as credenciais e as permissões do provedor de e-mail.

Em desenvolvimento, quando o SMTP não estiver configurado, o projeto pode apresentar o link de recuperação no terminal. Esse comportamento não substitui o envio de e-mail em produção.

## 🧪 Testes

Verifique os tipos do projeto:

```bash
npm run check
```

Execute os testes automatizados:

```bash
npm test
```

Os casos e registros de execução são gerenciados no [projeto CashFlow no Qase](https://app.qase.io/project/CASHFLOW).

A cobertura planejada inclui:

- Autenticação e validação de formulários.
- Cadastro e validação de transações.
- Resumo financeiro.
- Encerramento e proteção de sessão.
- Navegação por teclado.
- Recuperação de senha.
- Comportamentos da versão Android.

> Um caso cadastrado não significa um teste executado. Resultados aprovados devem estar associados à execução real e às respectivas evidências. Testes web não substituem testes no aplicativo Android.

## 📱 Versão Android

A adaptação mobile utiliza Capacitor para integrar a interface web ao aplicativo Android.

Para distribuir uma versão pelo Google Play Console:

1. Configure o endereço público da aplicação.
2. Sincronize o projeto mobile com o Android.
3. Abra o projeto no Android Studio.
4. Atualize o `versionCode` a cada nova publicação.
5. Gere um Android App Bundle assinado no formato `.aab`.
6. Envie o arquivo para a faixa de testes correspondente.

Mantenha o identificador do aplicativo e a assinatura compatíveis com a aplicação já cadastrada no Google Play.

## 🌐 Ambiente publicado

[https://projetointegradormobile.onrender.com](https://projetointegradormobile.onrender.com)

A disponibilidade depende da infraestrutura e das configurações do serviço de hospedagem.

## 🛡️ Cuidados de segurança

- Utilize HTTPS no ambiente publicado.
- Mantenha credenciais em variáveis de ambiente.
- Não exponha credenciais do banco no frontend.
- Preserve a validação dos certificados SSL.
- Utilize dados fictícios nos testes.
- Não inclua senhas, tokens ou dados pessoais nas evidências.
- Faça backup do banco antes de alterações estruturais.
- Guarde as chaves de assinatura Android em local seguro.

## 🎓 Contexto acadêmico

Projeto desenvolvido para integrar conhecimentos de desenvolvimento web e mobile, banco de dados, engenharia de software, acessibilidade e qualidade de software.

## 👥 Equipe

Desenvolvido pela equipe do Projeto Integrador CashFlow.
