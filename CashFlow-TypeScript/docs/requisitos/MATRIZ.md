# Matriz de rastreabilidade

Base: documento original em Requisitos_Recebidos.docx e transcrição FONTE.md. São41 RF e25 RNF. “Implementado” descreve código presente; somente os testes citados constituem evidência executada. As dependências e validações restantes não são tratadas como cumpridas.

Escopo entregue: web responsiva, API e bot Telegram. Não inclui cliente Android/iOS nativo; marcações APP do documento não representam validação de aplicativo nativo.

## Funcionais

| Código | Situação                          | Implementação                           | Evidência ou dependência                                             |
| ------ | --------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| RF001  | Implementado                      | API e cadastro web                      | Três etapas, coleta mínima e etapas opcionais; teste requirements    |
| RF002  | Implementado/testado              | Autenticação bcrypt                     | Testes API e compatibilidade PHP                                     |
| RF003  | Implementado; configurar SMTP     | accounts/mail e telas recuperação       | Token único15 min, teste com sender simulado; email real pendente     |
| RF004  | Implementado/testado              | Sessões PostgreSQL + session.js         | Logout, inatividade30 min, consultas não renovam sessão               |
| RF005  | Implementado/testado              | finance + formulário                    | Receita idempotente                                                  |
| RF006  | Implementado/testado              | finance + despesa rápida                | Despesa idempotente                                                  |
| RF007  | Implementado/testado              | Editar na lista e API                   | Teste UI e persistência                                              |
| RF008  | Implementado/testado              | Excluir por usuário                     | Testes API/RLS                                                       |
| RF009  | Implementado                      | Histórico web                           | Filtros mês/tipo preservados; teste de carregamento UI               |
| RF010  | Implementado/testado              | Categorias próprias + predefinidas      | Tipo e usuário validados                                             |
| RF011  | Implementado/testado              | Resumo SQL NUMERIC e totais em centavos | Saldo e reenvio testados; web atualiza dados do bot em polling30 s    |
| RF012  | Implementado                      | Dashboard/Chart.js local                | UI integrada; revisão visual publicada pendente                      |
| RF013  | Implementado/testado              | Perfil e config gastos                  | Gasto vazio normalizado zero                                         |
| RF014  | Implementado/testado              | Resumo mensal e notificações            | Considera despesas do mês São Paulo                                  |
| RF015  | Implementado/testado              | Avisos web e fila80%                    | Entrega Telegram depende bot publicado                               |
| RF016  | Implementado/testado              | Avisos web e fila100%                   | Também avisa ao atingir exatamente100%; distingue excesso            |
| RF017  | Implementado                      | Relatório mensal existente              | Indicadores/gráficos/ranking/detalhes preservados; aceite manual     |
| RF018  | Implementado                      | jsPDF local                             | Exportação preservada; verificar PDF em navegador real               |
| RF019  | Implementado/testado              | Calculadora CLT 2026                     | Fontes e limites em CALCULOS.md                                      |
| RF020  | Implementado/testado              | Juros compostos                         | Taxa zero e fórmula testadas                                         |
| RF021  | Implementado/testado              | Financiamento Price                     | Taxa zero suportada                                                  |
| RF022  | Implementado                      | Conversor manual                        | Cotação fornecida pelo usuário, conforme tela                        |
| RF023  | Implementado; validar API real    | Proxy Olinda + filtro/ordenação         | Timeout/cache e isolamento de falha testados; rede real não validada |
| RF024  | Implementado/testado              | Perfil/preferências                     | Persistência em JSONB                                                |
| RF025  | Implementado                      | ViaCEP no cadastro                      | Preenchimento e entrada manual preservados; rede real não validada   |
| RF026  | Implementado/testado              | Token Telegram48hex                     | Hash, username e expiração10 min                                      |
| RF027  | Implementado/testado              | Consulta status + renovação             | Código bruto só exibido ao gerar; regeneração atualiza username      |
| RF028  | Implementado; configurar bot      | Telegram receita                        | Parser/integração simulada testados                                  |
| RF029  | Implementado; configurar bot      | Telegram despesa                        | Uma mensagem registra lançamento                                     |
| RF030  | Implementado; configurar bot      | Telegram /saldo                         | Resposta em português                                                |
| RF031  | Implementado; configurar bot      | Telegram /extrato                       | Até20lançamentos recentes                                            |
| RF032  | Implementado; configurar bot      | Fila PostgreSQL de alertas              | Retry testado; entrega real pendente                                 |
| RF033  | Implementado; configurar bot      | Recepção foto privada                   | Limite10 MB e origem Telegram fixa                                    |
| RF034  | Implementado; validar OCR real    | Tesseract português                     | Extrator e mock testados; modelo/download e notas reais pendentes    |
| RF035  | Implementado/testado              | Classificador por palavras              | Categoria sugerida na prévia                                         |
| RF036  | Implementado/testado              | Callbacks Confirmar/Cancelar            | Sem registro automático; reenvio idempotente                         |
| RF037  | Implementado/testado parcialmente | Tema sistema/claro/escuro               | Preferência persistida; inspeção visual pendente                     |
| RF038  | Implementado                      | Contraste/brilho/fonte/alto contraste   | Controles preservados e normalizados; auditoria visual pendente      |
| RF039  | Integração preservada             | VLibras externo                         | Serviço real precisa de internet e aceite manual                     |
| RF040  | Implementado                      | CashBot local                           | Perguntas rápidas e texto; conteúdo preservado                       |
| RF041  | Implementado/testado              | Limpar Tudo com confirmação             | Isolamento e limpeza testados                                        |

## Não funcionais

| Código | Situação                                    | Implementação                                  | Evidência ou dependência                                                                 |
| ------ | ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| RNF001 | Meta operacional não comprovada             | Compressão e bibliotecas locais                | Medir3 s em4G e cache frio; ACEITE.md                                                     |
| RNF002 | Meta operacional não comprovada             | Filas de comandos separadas de OCR             | Medir5 s incluindo Telegram/rede/carga                                                    |
| RNF003 | Implementado; prazo a medir                 | Outbox no commit, worker1 s, web30 s             | Retry testado; medir entrega<=60 s em produção                                            |
| RNF004 | Limite implementado; meta a medir           | OCR com deadline15 s para download/leitura      | Resposta e fila podem acrescentar tempo; modelo frio e hardware afetam desempenho        |
| RNF005 | Fluxo implementado                          | Campo rápido e mensagem Telegram               | Até3 interações no caminho descrito; validar usabilidade real                             |
| RNF006 | Implementado                                | Mensagens em português                         | Erros orientados, SMTP indisponível e falhas externas                                    |
| RNF007 | Implementado; validar dispositivos          | CSS responsivo e viewport                      | Aceite em320 px/tablet/desktop pendente                                                   |
| RNF008 | Parcial; auditoria completa pendente        | Labels/foco/teclado/axe                        | Testes automatizados sem contraste; não certifica WCAG2.1AA                              |
| RNF009 | Implementado/testado                        | bcrypt com salt                                | Senha nunca é armazenada em texto puro                                                   |
| RNF010 | Implementado                                | SQL parametrizado para dados externos          | Identificadores dinâmicos só de listas constantes; DDL estático                          |
| RNF011 | Implementado/testado em PGlite              | RLS restritivo + papel por transação           | Inclui teste contra política pública legada; Supabase real pendente                      |
| RNF012 | Implementado; configurar deploy             | TLS PostgreSQL com CA e Caddy HTTPS            | Validar certificados e cookies no domínio publicado                                      |
| RNF013 | Implementado/testado                        | Token hash10 min/uso único                      | Vínculo restrito ao username e chat privado                                              |
| RNF014 | Controles implementados; revisão necessária | Coleta mínima e aviso                          | Operador, contato, bases legais e backups devem ser definidos/validados antes publicação |
| RNF015 | Implementado/testado                        | Consentimento versionado e exclusão            | Exclusão no banco ativo; retenção de backups é procedimento do operador                  |
| RNF016 | Implementado/testado com mock               | Imagem apenas em memória e buffer limpo        | Modelo de idioma pode ser cacheado; origem Telegram não é armazenamento deste servidor   |
| RNF017 | Não comprovado                              | Health check, reinício e roteiro monitoramento | 95% exige histórico real e infraestrutura publicada                                      |
| RNF018 | Implementado/testado para finanças          | Operações atômicas e chave persistente         | Mensagem externa pode repetir após crash envio/commit; lançamento financeiro não         |
| RNF019 | Implementado/testado parcialmente           | Timeouts, fallback e entrada manual            | Olinda e OCR simulados; ensaio de provedores reais pendente                              |
| RNF020 | Validação manual pendente                   | HTML/JS para navegadores atuais                | Não houve execução real Chrome/Firefox/Edge/Safari                                       |
| RNF021 | Validação manual pendente                   | Telegram Bot API padrão                        | Não houve teste real Android/iOS/web                                                     |
| RNF022 | Implementado                                | Módulos services/integrations/db e formatação  | TypeScript e Prettier                                                                    |
| RNF023 | Pendente repositório oficial                | Workflow GitHub CI incluído                    | Endereço oficial não fornecido; nenhum remoto foi alterado                               |
| RNF024 | Implementado/testado                        | Saldo/limites/alertas/reenvio/RLS              | Suite automatizada em tests                                                              |
| RNF025 | Preparado; carga não comprovada             | PostgreSQL, pool, sessões/filas compartilhadas | Definir volume alvo; rate limit compartilhado pode ser necessário em escala              |
