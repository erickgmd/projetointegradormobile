# Contratos adicionais

A API usa cookie HttpOnly. Não envie usuário_id para escolher a conta: o servidor resolve a sessão. Todos os dados externos são parâmetros SQL. Os comandos financeiros usam um papel RLS restrito, mesmo que a conexão principal seja proprietária.

| Método   | Rota                           | Entrada/saída                                                                                       |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| POST     | /api/cadastro/etapa1           | nome,email,senha,confirmar_senha,consentimento=true; CPF,nascimento,telefone opcionais              |
| POST     | /api/cadastro/etapa2           | endereço opcional; aceita objeto vazio para pular                                                   |
| POST     | /api/cadastro/etapa3           | dados financeiros opcionais; aceita objeto vazio                                                    |
| POST     | /api/senha/recuperar           | email; resposta genérica,503 quando SMTP não configurado                                            |
| POST     | /api/senha/redefinir           | token,senha,confirmar_senha; token único15 min                                                       |
| POST     | /api/session/atividade         | atualiza atividade após interação real; consultas automáticas não renovam sessão                    |
| GET/POST | /api/perfil                    | consulta/atualização parcial; preferencias={theme,contrast,brightness,fontScale,highContrast}       |
| GET/POST | /api/categorias                | lista próprias/cria com nome,tipo=income ou expense                                                 |
| POST     | /api/transacoes                | description,amount,category,type,date,idempotency_key                                               |
| POST     | /api/transacoes/editar         | mesmos campos e id; chave nova para cada operação lógica                                            |
| POST     | /api/transacoes/rapida         | texto e idempotency_key; exemplo mercado35,90(com espaço antes do valor)                            |
| GET      | /api/resumo?mes=AAAA-MM        | resumo mensal exato, saldo_total e alertas; padrão mês atual São Paulo                              |
| GET      | /api/mercado/taxas?mes=AAAA-MM | consulta Olinda por mês, cache5 min; padrão mês anterior; até1000 registros retornados                |
| POST     | /api/consentimento             | aceito=true; registra versão e timestamp                                                            |
| POST     | /api/conta/excluir             | senha,confirmacao=EXCLUIR; exclusão definitiva no banco ativo                                       |
| POST     | /api/telegram                  | acao=gerar e nome_telegram; token exibido uma vez, hash no banco; verificar retorna status/validade |
| POST     | /api/telegram/webhook          | atualização Telegram com cabeçalho X-Telegram-Bot-Api-Secret-Token; dedup update_id                 |

Criar/editar aceita chave no corpo ou cabeçalho Idempotency-Key. Repita a mesma chave com os mesmos dados ao recuperar de falha de rede; outra operação recebe chave nova. Reuso com dados diferentes retorna409. Sem chave, a criação/edição é rejeitada. Operações de limpar/excluir são naturalmente idempotentes quanto aos dados removidos.

O saldo_total legado em transacoes não é usado nem atualizado: o saldo é derivado dos lançamentos. Campo legado NOT NULL sem default ou tipos não mostrados no diagrama podem exigir ajuste específico na cópia do banco.
