# Cálculos financeiros

A calculadora salarial simula um vínculo CLT mensal na competência2026. INSS por faixas progressivas até o teto; IRRF com a maior dedução entre INSS+dependentes e desconto simplificado, seguido do redutor2026. O plano de saúde informado é descontado do líquido; não é tratado como dedução mensal de IRRF. Não contempla férias,13º, múltiplos vínculos, pensão, benefícios, descontos convencionais nem acerto anual. Os resultados são estimativas do cenário informado.

Fontes oficiais consultadas em04/11/2026:

- [INSS tabela2026](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal)
- [Receita Federal tributação2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026)

Simulador de juros: taxa anual efetiva convertida para mês, aportes no final de cada mês; não inclui imposto ou tarifas. Financiamento: parcelas constantes pelo sistema Price, taxa mensal, sem IOF ou tarifas; suporta taxa zero. Conversor: cotação fornecida pelo usuário, não cotação em tempo real.

Saldo e limites são calculados em NUMERIC no PostgreSQL; o retorno em reais é convertido apenas para apresentação. No navegador os totais usam centavos inteiros. RNF024 tem testes para0,10+0,20, limites80/100 e período mensal. Limite100 dispara ao atingir, antecipando também o aviso de ultrapassagem para não deixar o usuário sem aviso na fronteira; texto distingue atingir de ultrapassar.
