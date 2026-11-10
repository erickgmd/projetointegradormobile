# Requisitos recebidos

| Código | Descrição                                                                                                                                                | APP | WEB |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| RF001  | Cadastrar novo usuário em três etapas: dados pessoais, endereço e dados financeiros                                                                      | X   | X   |
| RF002  | Autenticar usuário por login e senha                                                                                                                     | X   | X   |
| RF003  | Recuperar acesso de usuário que esqueceu a senha                                                                                                         | X   | X   |
| RF004  | Controlar a sessão do usuário, encerrando-a por logout ou inatividade                                                                                    | X   | X   |
| RF005  | Registrar receitas com valor, data, categoria e descrição                                                                                                | X   | X   |
| RF006  | Registrar despesas com valor, data, categoria e descrição                                                                                                | X   | X   |
| RF007  | Editar transações registradas                                                                                                                            | X   | X   |
| RF008  | Excluir transações registradas                                                                                                                           | X   | X   |
| RF009  | Listar o histórico de transações com filtro por mês e por tipo (receita ou despesa)                                                                      | X   | X   |
| RF010  | Categorizar transações em categorias predefinidas ou criadas pelo usuário                                                                                | X   | X   |
| RF011  | Exibir o saldo atualizado (receitas menos despesas)                                                                                                      | X   | X   |
| RF012  | Exibir dashboard com resumo financeiro e gráficos dinâmicos de receitas e despesas por categoria e período                                               | X   | X   |
| RF013  | Definir o gasto máximo mensal no perfil do usuário                                                                                                       | X   | X   |
| RF014  | Acompanhar as despesas do mês em relação ao gasto máximo mensal definido                                                                                 | X   | X   |
| RF015  | Notificar o usuário ao atingir 80% do limite de gastos                                                                                                   | X   | X   |
| RF016  | Notificar o usuário ao ultrapassar o limite de gastos                                                                                                    | X   | X   |
| RF017  | Gerar relatório financeiro mensal com indicadores, gráficos, ranking de categorias e detalhamento das transações                                         |     | X   |
| RF018  | Exportar relatórios financeiros em PDF                                                                                                                   |     | X   |
| RF019  | Calcular salário líquido a partir do salário bruto (calculadora de salário)                                                                              |     | X   |
| RF020  | Simular juros compostos                                                                                                                                  |     | X   |
| RF021  | Simular financiamentos                                                                                                                                   |     | X   |
| RF022  | Converter valores entre moedas                                                                                                                           |     | X   |
| RF023  | Exibir as taxas de juros praticadas pelas instituições financeiras, obtidas da API Olinda do Banco Central, com busca e ordenação (monitor de taxas BCB) |     | X   |
| RF024  | Gerenciar dados pessoais e preferências do perfil                                                                                                        | X   | X   |
| RF025  | Preencher o endereço automaticamente a partir do CEP informado                                                                                           |     | X   |
| RF026  | Gerar código de vinculação entre a conta do usuário e o Telegram a partir do username informado                                                          |     | X   |
| RF027  | Consultar o código gerado e atualizar o username do Telegram vinculado à conta                                                                           |     | X   |
| RF028  | Registrar receitas por mensagem de texto no Telegram                                                                                                     | X   |     |
| RF029  | Registrar despesas por mensagem de texto no Telegram                                                                                                     | X   |     |
| RF030  | Consultar saldo pelo Telegram                                                                                                                            | X   |     |
| RF031  | Consultar extrato pelo Telegram                                                                                                                          | X   |     |
| RF032  | Enviar alertas de limite (80% e ultrapassado) pelo Telegram                                                                                              | X   |     |
| RF033  | Receber imagem de nota fiscal pelo Telegram                                                                                                              | X   |     |
| RF034  | Extrair valor, data e estabelecimento da nota fiscal por OCR                                                                                             | X   |     |
| RF035  | Classificar automaticamente a despesa extraída da nota fiscal                                                                                            | X   |     |
| RF036  | Solicitar confirmação do usuário antes de salvar a transação extraída por OCR                                                                            | X   |     |
| RF037  | Alternar entre tema automático, claro e escuro                                                                                                           | X   | X   |
| RF038  | Ajustar contraste, brilho e tamanho da fonte da interface e ativar o modo de alto contraste                                                              |     | X   |
| RF039  | Traduzir o conteúdo do site para Libras (VLibras)                                                                                                        |     | X   |
| RF040  | Responder dúvidas de uso por chatbot de suporte (CashBot), com perguntas rápidas e campo de texto livre                                                  |     | X   |
| RF041  | Excluir de uma só vez todas as transações do usuário (Limpar Tudo), mediante confirmação                                                                 |     | X   |

| Código | Tipo               | Descrição                                                                                                  | APP | WEB |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------- | --- | --- |
| RNF001 | Performance        | Carregar as telas principais (dashboard e histórico) em até 3 segundos em conexão 4G                       | X   | X   |
| RNF002 | Performance        | Responder aos comandos do bot do Telegram em até 5 segundos                                                | X   |     |
| RNF003 | Performance        | Enviar os alertas de limite (80% e ultrapassado) em até 1 minuto após o registro da transação              | X   | X   |
| RNF004 | Performance        | Processar a imagem da nota fiscal por OCR e devolver o resultado para confirmação em até 15 segundos       | X   |     |
| RNF005 | Usabilidade        | Permitir o registro de uma despesa em até 3 interações (mensagens ou toques)                               | X   | X   |
| RNF006 | Usabilidade        | Exibir mensagens de erro claras, em português, com orientação de correção                                  | X   | X   |
| RNF007 | Usabilidade        | Adaptar o layout a telas de celular, tablet e desktop (design responsivo)                                  | X   | X   |
| RNF008 | Acessibilidade     | Seguir as diretrizes WCAG 2.1 nível AA, incluindo contraste mínimo e navegação por teclado                 | X   | X   |
| RNF009 | Segurança          | Armazenar as senhas com hash e salt, sem guardá-las em texto puro                                          | X   | X   |
| RNF010 | Segurança          | Executar todas as consultas ao banco por Prepared Statements, prevenindo SQL Injection                     | X   | X   |
| RNF011 | Segurança          | Isolar os dados por usuário no banco (RLS), impedindo o acesso a dados de terceiros                        | X   | X   |
| RNF012 | Segurança          | Criptografar a comunicação entre cliente e servidor por HTTPS/TLS                                          | X   | X   |
| RNF013 | Segurança          | Expirar o token de vinculação do Telegram após uso ou após curto prazo                                     | X   | X   |
| RNF014 | Privacidade (LGPD) | Tratar os dados pessoais e financeiros conforme a Lei nº 13.709/2018, coletando apenas o necessário        | X   | X   |
| RNF015 | Privacidade (LGPD) | Registrar o consentimento do usuário e permitir a exclusão da conta e dos dados a pedido                   | X   | X   |
| RNF016 | Privacidade (LGPD) | Descartar a imagem da nota fiscal após a extração dos dados                                                | X   |     |
| RNF017 | Disponibilidade    | Manter o sistema disponível em pelo menos 95% do tempo, excluídas as janelas de manutenção                 | X   | X   |
| RNF018 | Confiabilidade     | Manter a integridade das transações, sem perda ou duplicação em caso de falha ou reenvio                   | X   | X   |
| RNF019 | Confiabilidade     | Tratar a indisponibilidade de APIs externas (OCR, ViaCEP, Olinda) sem interromper o uso das demais funções | X   | X   |
| RNF020 | Compatibilidade    | Funcionar nas versões atuais dos navegadores Chrome, Firefox, Edge e Safari                                |     | X   |
| RNF021 | Compatibilidade    | Funcionar nos clientes do Telegram para Android, iOS e web                                                 | X   |     |
| RNF022 | Manutenibilidade   | Organizar o código em camadas e módulos, seguindo padrão de código definido pela equipe                    | X   | X   |
| RNF023 | Manutenibilidade   | Versionar todo o código e a documentação no repositório oficial do GitHub                                  | X   | X   |
| RNF024 | Manutenibilidade   | Cobrir as regras de negócio críticas (saldo, limites e alertas) com testes automatizados                   | X   | X   |
| RNF025 | Escalabilidade     | Suportar o crescimento do número de usuários sem alteração da arquitetura (banco e deploy em nuvem)        | X   | X   |
