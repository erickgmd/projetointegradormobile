// CashBot: assistente do CashFlow.
// Responde com os números da própria conta (gastos, saldo, categorias, limite,
// comparação com o mês anterior), explica como usar o app e oferece atalhos
// (botões de ação e sugestões de próxima pergunta que nunca somem).
(function () {
    "use strict";

    const STORAGE_KEY = "cashflow-cashbot-conversa";
    const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const MESES_LABEL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

    // ---------- Utilidades ----------
    const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
    const moeda = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
    const pct = (v) => `${Math.round(v)}%`;
    const has = (text, ...termos) => termos.some((t) => text.includes(t));
    const fm = () => window.financeManager;
    const transacoes = () => (fm() && Array.isArray(fm().transactions) ? fm().transactions : []);
    const nomeCategoria = (c) => (fm() && typeof fm().formatCategory === "function" ? fm().formatCategory(c) : c);
    const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    const somaCentavos = (lista) => lista.reduce((acc, t) => acc + Math.round(Number(t.amount) * 100), 0) / 100;
    const doTipo = (lista, tipo) => lista.filter((t) => t.type === tipo);
    const rotuloMes = (ym) => {
        const [a, m] = ym.split("-").map(Number);
        return `${MESES_LABEL[m - 1]} de ${a}`;
    };
    const mesAnterior = (ym) => {
        const [a, m] = ym.split("-").map(Number);
        const d = new Date(Date.UTC(a, m - 2, 1));
        return d.toISOString().slice(0, 7);
    };
    const diasNoMes = (ym) => {
        const [a, m] = ym.split("-").map(Number);
        return new Date(Date.UTC(a, m, 0)).getUTCDate();
    };

    let limiteCache;
    async function limiteMensal() {
        if (limiteCache !== undefined) return limiteCache;
        try {
            const r = await fetch("/api/config/gastos", { credentials: "include" });
            const d = await r.json();
            limiteCache = Number(d.gasto_maximo) || 0;
        } catch {
            limiteCache = 0;
        }
        setTimeout(() => { limiteCache = undefined; }, 60000);
        return limiteCache;
    }

    // ---------- Entendendo o período pedido ----------
    function periodo(text) {
        const atual = mesAtual();
        if (has(text, "mes passado", "mes anterior", "ultimo mes")) return { tipo: "mes", ym: mesAnterior(atual) };
        for (let i = 0; i < 12; i++) {
            const m = text.match(new RegExp(`\\b${MESES[i]}\\b(?: de)?(?: (\\d{4}))?`));
            if (m) {
                let ano = Number(m[1]) || Number(atual.slice(0, 4));
                const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
                if (!m[1] && ym > atual) ano -= 1;
                return { tipo: "mes", ym: `${ano}-${String(i + 1).padStart(2, "0")}` };
            }
        }
        if (has(text, "total", "geral", "tudo", "sempre", "todo o periodo", "desde o inicio") && !has(text, "este mes", "esse mes", "neste mes", "nesse mes")) return { tipo: "tudo" };
        return { tipo: "mes", ym: atual };
    }
    const filtrarPeriodo = (lista, p) => (p.tipo === "tudo" ? lista : lista.filter((t) => String(t.date).slice(0, 7) === p.ym));
    const textoPeriodo = (p) => (p.tipo === "tudo" ? "no total" : p.ym === mesAtual() ? "neste mês" : `em ${rotuloMes(p.ym)}`);

    // Categoria ou palavra citada: "quanto gastei com mercado?"
    function alvo(text) {
        const m = text.match(/\b(?:com|em|no|na|de)\s+([a-z0-9 ]{3,30})$/);
        const termo = m ? m[1].replace(/\b(este|esse|neste|nesse|mes|passado|anterior|total|geral)\b/g, "").trim() : "";
        if (!termo || MESES.some((mes) => termo.startsWith(mes))) return null;
        return termo;
    }
    const combina = (t, termo) => norm(nomeCategoria(t.category)).includes(termo) || norm(t.category).includes(termo) || norm(t.description).includes(termo);

    // ---------- Respostas com os dados da conta ----------
    // Cada resposta: { texto, itens?, acoes?, sugestoes? }
    const R = (texto, extra = {}) => ({ texto, ...extra });

    function semDados(p) {
        return R(`Você ainda não tem transações ${textoPeriodo(p)}.`, {
            acoes: [{ label: "➕ Adicionar transação", acao: "nova" }],
            sugestoes: ["Como cadastrar uma transação?", "Resumo do mês"],
        });
    }

    function topCategorias(lista, n = 3) {
        const por = {};
        doTipo(lista, "expense").forEach((t) => { por[t.category] = (por[t.category] || 0) + Number(t.amount); });
        const total = Object.values(por).reduce((a, b) => a + b, 0);
        return Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, n).map(([c, v]) => ({ nome: nomeCategoria(c), valor: v, parte: total ? (v / total) * 100 : 0 }));
    }

    async function respostaDados(text) {
        if (!fm()) return null;
        // Perguntas de "como fazer" vão para a ajuda, não para os números.
        if (/^(como|onde fica|o que e|o que sao|pra que|para que|cadê|cade)\b/.test(text) || has(text, "criar categoria", "nova categoria")) return null;
        const lista = transacoes();
        const p = periodo(text);
        const doPeriodo = filtrarPeriodo(lista, p);
        const receitas = somaCentavos(doTipo(doPeriodo, "income"));
        const despesas = somaCentavos(doTipo(doPeriodo, "expense"));
        const rotulo = textoPeriodo(p);

        // Resumo completo
        if (has(text, "resumo", "como estou", "como estao minhas financas", "situacao", "visao geral", "balanco")) {
            if (!doPeriodo.length) return semDados(p);
            const top = topCategorias(doPeriodo, 1)[0];
            const itens = [
                ["Receitas", moeda(receitas)],
                ["Despesas", moeda(despesas)],
                ["Saldo", moeda(receitas - despesas)],
                ["Transações", String(doPeriodo.length)],
            ];
            if (top) itens.push(["Maior categoria", `${top.nome} (${pct(top.parte)})`]);
            const limite = await limiteMensal();
            if (limite && p.tipo === "mes") itens.push(["Limite usado", pct((despesas / limite) * 100)]);
            const titulo = p.tipo === "tudo" ? "Resumo geral" : p.ym === mesAtual() ? "Resumo deste mês" : `Resumo de ${rotuloMes(p.ym)}`;
            return R(`${titulo}:`, {
                itens,
                acoes: [{ label: "📄 Gerar relatório PDF", acao: "relatorio" }],
                sugestoes: ["Onde mais gastei?", "Comparar com o mês passado", "Uma dica para economizar"],
            });
        }

        // Comparação com o mês anterior
        if (has(text, "compar", "diferenca", "mais que o mes", "menos que o mes")) {
            const atual = mesAtual(), antes = mesAnterior(atual);
            const g1 = somaCentavos(doTipo(filtrarPeriodo(lista, { tipo: "mes", ym: atual }), "expense"));
            const g0 = somaCentavos(doTipo(filtrarPeriodo(lista, { tipo: "mes", ym: antes }), "expense"));
            if (!g0 && !g1) return semDados({ tipo: "mes", ym: atual });
            let texto;
            if (!g0) texto = `Neste mês você gastou ${moeda(g1)}. Em ${MESES_LABEL[Number(antes.slice(5)) - 1]} não há gastos registrados para comparar.`;
            else {
                const dif = ((g1 - g0) / g0) * 100;
                texto = dif > 0
                    ? `Você gastou ${moeda(g1)} neste mês, ${pct(dif)} a mais que em ${MESES_LABEL[Number(antes.slice(5)) - 1]} (${moeda(g0)}).`
                    : dif < 0
                        ? `Boa! Você gastou ${moeda(g1)} neste mês, ${pct(-dif)} a menos que em ${MESES_LABEL[Number(antes.slice(5)) - 1]} (${moeda(g0)}).`
                        : `Você gastou o mesmo que no mês passado: ${moeda(g1)}.`;
            }
            return R(texto, { sugestoes: ["Onde mais gastei?", "Quanto ainda posso gastar?", "Resumo do mês"] });
        }

        // Limite / quanto posso gastar / previsão
        if (has(text, "limite", "posso gastar", "ainda posso", "quanto falta", "previsao", "projecao", "vou gastar", "orcamento")) {
            const limite = await limiteMensal();
            const ym = mesAtual();
            const gastoMes = somaCentavos(doTipo(filtrarPeriodo(lista, { tipo: "mes", ym }), "expense"));
            const dia = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(new Date()));
            const previsao = dia ? (gastoMes / dia) * diasNoMes(ym) : gastoMes;
            if (!limite)
                return R(`Você ainda não definiu um gasto máximo mensal. Neste mês já gastou ${moeda(gastoMes)}; nesse ritmo, deve fechar o mês em cerca de ${moeda(previsao)}.`, {
                    acoes: [{ label: "🎯 Definir meu limite", acao: "limite" }],
                    sugestoes: ["O que é o alerta de gastos?", "Onde mais gastei?"],
                });
            const resta = limite - gastoMes;
            const itens = [
                ["Limite do mês", moeda(limite)],
                ["Já gasto", `${moeda(gastoMes)} (${pct((gastoMes / limite) * 100)})`],
                [resta >= 0 ? "Ainda pode gastar" : "Passou do limite em", moeda(Math.abs(resta))],
                ["Previsão para o fim do mês", moeda(previsao)],
            ];
            const texto = resta < 0
                ? "⚠️ Você já passou do seu limite deste mês."
                : previsao > limite
                    ? "Atenção: no ritmo atual, você deve passar do limite antes do fim do mês."
                    : "Você está dentro do limite. 👍";
            return R(texto, { itens, acoes: [{ label: "🎯 Ajustar limite", acao: "limite" }], sugestoes: ["Onde mais gastei?", "Uma dica para economizar"] });
        }

        // Últimas transações
        if (has(text, "ultimas", "ultimos", "recentes", "historico", "ultimo lancamento", "ultima transacao")) {
            const ultimas = [...lista].sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id || 0) - (a.id || 0)).slice(0, 5);
            if (!ultimas.length) return semDados({ tipo: "tudo" });
            return R("Suas últimas transações:", {
                itens: ultimas.map((t) => [`${t.type === "income" ? "↑" : "↓"} ${t.description}`, `${t.type === "income" ? "+" : "−"} ${moeda(Number(t.amount))}`]),
                sugestoes: ["Resumo do mês", "Maior gasto do mês"],
            });
        }

        // Maior gasto individual
        if (has(text, "maior gasto", "maior despesa", "gasto mais alto", "mais caro")) {
            const maior = doTipo(doPeriodo, "expense").sort((a, b) => Number(b.amount) - Number(a.amount))[0];
            if (!maior) return semDados(p);
            return R(`Seu maior gasto ${rotulo} foi "${maior.description}" (${nomeCategoria(maior.category)}): ${moeda(Number(maior.amount))}.`, {
                sugestoes: ["Onde mais gastei?", "Resumo do mês"],
            });
        }

        // Categorias que mais pesam
        if (has(text, "onde mais", "mais gastei", "categoria", "categorias", "com o que", "em que gastei", "pra onde")) {
            const top = topCategorias(doPeriodo, 3);
            if (!top.length) return semDados(p);
            return R(`Onde seu dinheiro foi ${rotulo}:`, {
                itens: top.map((c) => [c.nome, `${moeda(c.valor)} · ${pct(c.parte)}`]),
                acoes: [{ label: "📊 Ver despesas", acao: "despesas" }],
                sugestoes: ["Uma dica para economizar", "Comparar com o mês passado"],
            });
        }

        // Média diária
        if (has(text, "media", "por dia", "diario")) {
            if (p.tipo === "tudo") return null;
            const dia = p.ym === mesAtual() ? Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(new Date())) : diasNoMes(p.ym);
            return R(`Sua média de gastos ${rotulo} é ${moeda(despesas / Math.max(1, dia))} por dia.`, { sugestoes: ["Quanto ainda posso gastar?", "Onde mais gastei?"] });
        }

        // Quantidade de transações
        if (has(text, "quantas transacoes", "quantos lancamentos", "quantas despesas", "quantas receitas")) {
            return R(`Você tem ${doPeriodo.length} transaç${doPeriodo.length === 1 ? "ão" : "ões"} ${rotulo}: ${doTipo(doPeriodo, "income").length} receita(s) e ${doTipo(doPeriodo, "expense").length} despesa(s).`, {
                sugestoes: ["Resumo do mês", "Últimas transações"],
            });
        }

        const pedeValor = has(text, "quanto", "qual", "quais", "meu ", "minha ", "total", "gastei", "recebi", "ganhei", "sobrou", "entrou", "paguei");
        if (!pedeValor) return null;
        const querGasto = has(text, "gast", "despes", "paguei", "saiu", "saida");
        const querReceita = has(text, "receb", "receita", "ganhei", "ganho", "entrou", "entrada", "salario");
        const querSaldo = has(text, "saldo", "sobrou", "sobra", "balanco");
        if (!querGasto && !querReceita && !querSaldo) return null;

        // Gasto com algo específico
        const termo = querGasto ? alvo(text) : null;
        if (termo) {
            const achados = doTipo(doPeriodo, "expense").filter((t) => combina(t, termo));
            return R(achados.length
                ? `Você gastou ${moeda(somaCentavos(achados))} com "${termo}" ${rotulo} (${achados.length} lançamento${achados.length === 1 ? "" : "s"}).`
                : `Não encontrei gastos com "${termo}" ${rotulo}.`, { sugestoes: ["Onde mais gastei?", "Resumo do mês"] });
        }

        if (!doPeriodo.length) return semDados(p);
        if (querSaldo)
            return R(`Seu saldo ${rotulo} é ${moeda(receitas - despesas)}.`, {
                itens: [["Receitas", moeda(receitas)], ["Despesas", moeda(despesas)]],
                sugestoes: ["Onde mais gastei?", "Comparar com o mês passado"],
            });
        if (querGasto && querReceita)
            return R(`${rotulo[0].toUpperCase() + rotulo.slice(1)} você recebeu ${moeda(receitas)} e gastou ${moeda(despesas)}.`, { sugestoes: ["Meu saldo", "Onde mais gastei?"] });
        if (querGasto)
            return R(`Você gastou ${moeda(despesas)} ${rotulo}.`, {
                acoes: [{ label: "📊 Ver despesas", acao: "despesas" }],
                sugestoes: ["Onde mais gastei?", "Comparar com o mês passado", "Quanto ainda posso gastar?"],
            });
        return R(`Você recebeu ${moeda(receitas)} ${rotulo}.`, { sugestoes: ["Meu saldo", "Quanto gastei este mês?"] });
    }

    // ---------- Dica personalizada ----------
    async function dica() {
        const lista = filtrarPeriodo(transacoes(), { tipo: "mes", ym: mesAtual() });
        const top = topCategorias(lista, 1)[0];
        const despesas = somaCentavos(doTipo(lista, "expense"));
        const receitas = somaCentavos(doTipo(lista, "income"));
        const limite = await limiteMensal();
        const dicas = [];
        if (top && top.parte >= 40) dicas.push(`${top.nome} representa ${pct(top.parte)} dos seus gastos do mês. Cortar 10% nessa categoria já economiza cerca de ${moeda(top.valor * 0.1)}.`);
        if (receitas && despesas > receitas) dicas.push(`Neste mês as despesas (${moeda(despesas)}) estão maiores que as receitas (${moeda(receitas)}). Vale revisar gastos que não são essenciais.`);
        if (receitas && despesas <= receitas) dicas.push(`Tente separar 10% do que entra (${moeda(receitas * 0.1)}) logo no começo do mês para uma reserva de emergência.`);
        if (!limite) dicas.push("Defina um gasto máximo mensal: o CashFlow avisa quando você chegar a 80% e a 100% dele.");
        if (!dicas.length) dicas.push("Registre todos os gastos, até os pequenos: eles somam rápido. A despesa rápida ajuda — é só escrever \"café 6,50\".");
        return R("💡 " + dicas[0], {
            itens: dicas.slice(1, 3).map((d) => ["•", d]),
            acoes: limite ? [] : [{ label: "🎯 Definir meu limite", acao: "limite" }],
            sugestoes: ["Onde mais gastei?", "Quanto ainda posso gastar?"],
        });
    }

    // ---------- Registrar gasto pela conversa ----------
    function registrar(original, text) {
        if (!has(text, "registrar", "registra", "anotar", "anota", "lancar", "lanca", "adicionar gasto", "adiciona gasto", "gastei", "paguei")) return null;
        if (MESES.some((m) => text.includes(m))) return null;
        const valor = original.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/);
        if (!valor) return null;
        if (has(text, "quanto")) return null;
        const descricao = original
            .replace(valor[0], "")
            .replace(/\b(registrar|registra|anotar|anota|lançar|lancar|lança|lanca|adicionar|adiciona|um|uma|gasto|despesa|de|com|no|na|em|reais|r\$|gastei|paguei|hoje)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim() || "gasto";
        const sugestao = `${descricao} ${valor[0]}`;
        return R(`Posso deixar pronto para você: "${sugestao}". Confira e toque em Registrar na Despesa rápida.`, {
            acoes: [{ label: "✍️ Preencher despesa rápida", acao: "rapida", valor: sugestao }],
            sugestoes: ["Quanto gastei este mês?", "Últimas transações"],
        });
    }

    // ---------- Como usar o app ----------
    const AJUDA = [
        { keys: ["cadastrar", "adicionar transacao", "nova transacao", "lancamento", "como registro", "como adiciono"], r: () => R("Você tem dois jeitos de registrar:", { itens: [["1.", "Despesa rápida: escreva \"mercado 35,90\" e toque em Registrar."], ["2.", "Nova Transação: escolha o tipo, a categoria, o valor e a data."]], acoes: [{ label: "➕ Adicionar transação", acao: "nova" }], sugestoes: ["Como excluir uma transação?", "Criar categoria"] }) },
        { keys: ["excluir todas", "apagar todas", "limpar tudo", "zerar", "todas as transacoes"], r: () => R("No fim do Histórico de Transações há o botão \"Excluir todas as transações\". Para evitar acidentes, é preciso digitar EXCLUIR para confirmar.", { sugestoes: ["Como excluir uma transação?"] }) },
        { keys: ["excluir", "apagar", "remover", "deletar"], r: () => R("No Histórico de Transações, toque em 🗑 Excluir ao lado do lançamento. Para corrigir em vez de apagar, use ✏️ Editar.", { sugestoes: ["Como editar uma transação?", "Últimas transações"] }) },
        { keys: ["editar", "corrigir", "alterar transacao", "mudar valor"], r: () => R("No Histórico, toque em ✏️ Editar no lançamento. Os dados voltam para o formulário; ajuste e salve.", { sugestoes: ["Últimas transações"] }) },
        { keys: ["categoria nova", "criar categoria", "nova categoria", "minha categoria"], r: () => R("Na Despesa rápida, toque em \"+ Criar nova categoria\", dê um nome e escolha se é receita ou despesa. Ela aparece na lista da Nova Transação.", { sugestoes: ["Como cadastrar uma transação?"] }) },
        { keys: ["filtrar", "filtro", "filtros"], r: () => R("No Histórico, use os filtros de Mês e Tipo. Os cards de Saldo, Receitas e Despesas acompanham o mês escolhido, e tocar em Receitas ou Despesas filtra a lista.", { acoes: [{ label: "📊 Ver despesas", acao: "despesas" }] }) },
        { keys: ["relatorio", "pdf", "exportar", "imprimir"], r: () => R("Na aba Relatórios, escolha o mês e toque em Gerar PDF. O relatório traz resumo, gráficos e todas as transações do mês.", { acoes: [{ label: "📄 Abrir Relatórios", acao: "relatorio" }] }) },
        { keys: ["tema", "contraste", "escuro", "claro", "aparencia", "brilho", "fonte", "letra"], r: () => R("Em Aparência você escolhe tema claro, escuro ou automático e ajusta contraste, brilho e tamanho da letra.", { acoes: [{ label: "🎨 Abrir Aparência", acao: "aparencia" }] }) },
        { keys: ["vlibras", "libras", "surdo"], r: () => R("O CashFlow tem tradução em Libras pelo VLibras. Abra Aparência e toque no botão Libras.", { acoes: [{ label: "🎨 Abrir Aparência", acao: "aparencia" }] }) },
        { keys: ["alerta", "aviso de gasto", "notificacao", "notificacoes"], r: () => R("Defina um gasto máximo mensal no perfil: o CashFlow avisa no sininho 🔔 quando você chegar a 80% e a 100% dele.", { acoes: [{ label: "🎯 Definir meu limite", acao: "limite" }], sugestoes: ["Quanto ainda posso gastar?"] }) },
        { keys: ["calculadora", "ferramenta", "juros", "financiamento", "conversor", "moeda", "salario liquido", "inss", "irrf"], r: () => R("Na aba Ferramentas há calculadora de salário líquido (CLT 2026), juros compostos, financiamento e conversor de moedas.", { acoes: [{ label: "🔧 Abrir Ferramentas", acao: "ferramentas" }] }) },
        { keys: ["taxa", "bcb", "banco central", "juros dos bancos"], r: () => R("Na aba Taxas BCB você compara as taxas médias de juros dos bancos, publicadas pelo Banco Central.", { acoes: [{ label: "🏦 Abrir Taxas BCB", acao: "taxas" }] }) },
        { keys: ["telegram", "bot do telegram"], r: () => R("No perfil você pode vincular o Telegram e registrar gastos mandando mensagem para o bot do CashFlow.", { acoes: [{ label: "👤 Abrir perfil", acao: "perfil" }] }) },
        { keys: ["senha", "trocar senha", "esqueci"], r: () => R("Para trocar a senha, saia da conta e use \"Esqueceu a senha?\" na tela de login: enviamos um link para o seu email.") },
        { keys: ["perfil", "endereco", "meus dados", "cpf", "telefone", "excluir conta", "apagar conta"], r: () => R("No perfil você atualiza nome, email, endereço, dados financeiros e preferências. Lá também fica a opção de excluir a conta.", { acoes: [{ label: "👤 Abrir perfil", acao: "perfil" }] }) },
        { keys: ["grafico"], r: () => R("O gráfico Resumo por Categoria, no fim do Dashboard, mostra quanto entrou e saiu em cada categoria no período filtrado.", { sugestoes: ["Onde mais gastei?"] }) },
    ];

    function saudacao(text) {
        if (/^(oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|hey|hello)\b/.test(text))
            return R(`Olá${primeiroNome() ? ", " + primeiroNome() : ""}! 👋 O que você quer saber hoje?`, { sugestoes: ["Resumo do mês", "Quanto gastei este mês?", "Uma dica para economizar"] });
        if (/^(obrigad|valeu|vlw|brigad|show|perfeito|otimo)/.test(text))
            return R("Por nada! Se precisar, é só chamar. 😊", { sugestoes: ["Resumo do mês", "Onde mais gastei?"] });
        if (has(text, "o que voce faz", "o que vc faz", "como voce funciona", "ajuda", "help", "menu", "opcoes"))
            return boasVindas();
        return null;
    }

    async function responder(pergunta) {
        const text = norm(pergunta);
        if (!text) return null;
        const s = saudacao(text);
        if (s) return s;
        const reg = registrar(pergunta, text);
        if (reg) return reg;
        if (has(text, "dica", "economizar", "economia", "poupar", "guardar dinheiro", "conselho")) return dica();
        const dados = await respostaDados(text);
        if (dados) return dados;
        const ajuda = AJUDA.find((a) => a.keys.some((k) => text.includes(k)));
        if (ajuda) return ajuda.r();
        if (has(text, "invest")) return R("Antes de investir, monte uma reserva de emergência (3 a 6 meses de despesas). Depois, defina objetivo e prazo: para curto prazo, prefira segurança e liquidez. Na aba Taxas BCB você compara juros de bancos.", { acoes: [{ label: "🔧 Calcular juros compostos", acao: "ferramentas" }] });
        return R("Não entendi bem. 🤔 Tente perguntar de outro jeito ou escolha uma sugestão:", {
            sugestoes: ["Resumo do mês", "Quanto gastei este mês?", "Onde mais gastei?", "Como cadastrar uma transação?", "Uma dica para economizar"],
        });
    }

    function primeiroNome() {
        const el = document.getElementById("userName");
        return String(el?.textContent || "").trim().split(/\s+/)[0] || "";
    }

    function boasVindas() {
        return R(`Oi${primeiroNome() ? ", " + primeiroNome() : ""}! 👋 Sou o CashBot. Respondo com os números da sua conta e explico como usar o app. Experimente:`, {
            itens: [["💰", "\"Quanto gastei este mês?\""], ["📊", "\"Onde mais gastei?\""], ["🎯", "\"Quanto ainda posso gastar?\""], ["✍️", "\"Registrar mercado 35,90\""]],
            sugestoes: ["Resumo do mês", "Quanto gastei este mês?", "Meu saldo", "Uma dica para economizar", "Como cadastrar uma transação?"],
        });
    }

    // ---------- Ações dos botões ----------
    function irParaAba(aba) {
        document.querySelector(`.nav-btn[data-tab="${aba}"]`)?.click();
    }
    function executar(acao) {
        const fechar = () => window.innerWidth <= 768 && fecharChat();
        switch (acao.acao) {
            case "nova":
                irParaAba("dashboard");
                fechar();
                setTimeout(() => {
                    const campo = document.getElementById("description");
                    campo?.scrollIntoView({ behavior: "smooth", block: "center" });
                    campo?.focus({ preventScroll: true });
                }, 200);
                break;
            case "rapida": {
                irParaAba("dashboard");
                fechar();
                const campo = document.getElementById("quickText");
                if (campo) {
                    campo.value = acao.valor || "";
                    campo.scrollIntoView({ behavior: "smooth", block: "center" });
                    setTimeout(() => campo.focus({ preventScroll: true }), 250);
                }
                break;
            }
            case "despesas": {
                irParaAba("dashboard");
                fechar();
                const tipo = document.getElementById("filterType");
                const mes = document.getElementById("filterMonth");
                if (mes && [...mes.options].some((o) => o.value === mesAtual())) mes.value = mesAtual();
                if (tipo) tipo.value = "expense";
                fm()?.filterTransactions?.();
                fm()?.updateDisplay?.();
                document.getElementById("transactionList")?.scrollIntoView({ behavior: "smooth", block: "start" });
                break;
            }
            case "relatorio": irParaAba("reports"); fechar(); break;
            case "ferramentas": irParaAba("tools"); fechar(); break;
            case "taxas": irParaAba("market"); fechar(); break;
            case "aparencia": document.getElementById("themePanel")?.classList.remove("hidden-theme-panel"); fecharChat(); break;
            case "limite": window.location.href = "../CashFlow_Tela_Perfil/perfil.html#gasto-maximo"; break;
            case "perfil": window.location.href = "../CashFlow_Tela_Perfil/perfil.html"; break;
        }
    }

    // ---------- Interface ----------
    let painel, fab, mensagens, chips, input, historico = [], ultimaPergunta = "";

    function salvar() {
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(historico.slice(-30))); } catch { /* sem armazenamento */ }
    }

    function desenharMensagem(msg, animar = true) {
        const row = document.createElement("div");
        row.className = `cashbot-message ${msg.de === "user" ? "cashbot-message-user" : "cashbot-message-bot"}${animar ? " cashbot-entra" : ""}`;
        const avatar = document.createElement("div");
        avatar.className = "cashbot-message-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = msg.de === "user" ? "Você" : "CF";
        const bubble = document.createElement("div");
        bubble.className = "cashbot-bubble";
        const p = document.createElement("p");
        p.textContent = msg.texto;
        bubble.appendChild(p);
        if (msg.itens?.length) {
            const ul = document.createElement("ul");
            ul.className = "cashbot-itens";
            msg.itens.forEach(([k, v]) => {
                const li = document.createElement("li");
                const a = document.createElement("span");
                a.className = "cashbot-item-k";
                a.textContent = k;
                const b = document.createElement("span");
                b.className = "cashbot-item-v";
                b.textContent = v;
                li.append(a, b);
                if (k === "•" || /^\d\.$|^[^\w\s]{1,2}$/u.test(k)) li.classList.add("cashbot-item-texto");
                ul.appendChild(li);
            });
            bubble.appendChild(ul);
        }
        if (msg.acoes?.length) {
            const box = document.createElement("div");
            box.className = "cashbot-acoes";
            msg.acoes.forEach((a) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "cashbot-acao";
                btn.textContent = a.label;
                btn.addEventListener("click", () => executar(a));
                box.appendChild(btn);
            });
            bubble.appendChild(box);
        }
        if (msg.de === "user") row.append(bubble, avatar);
        else row.append(avatar, bubble);
        mensagens.appendChild(row);
        mensagens.scrollTop = mensagens.scrollHeight;
    }

    function mostrarChips(lista) {
        chips.replaceChildren();
        (lista?.length ? lista : ["Resumo do mês", "Quanto gastei este mês?", "Onde mais gastei?", "Meu saldo", "Uma dica para economizar", "Como cadastrar uma transação?"]).forEach((texto) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "cashbot-chip";
            b.textContent = texto;
            b.addEventListener("click", () => perguntar(texto));
            chips.appendChild(b);
        });
        chips.scrollLeft = 0;
    }

    function adicionar(msg, animar = true) {
        historico.push(msg);
        desenharMensagem(msg, animar);
        salvar();
    }

    let ocupado = false;
    async function perguntar(texto) {
        const pergunta = String(texto || "").trim();
        if (!pergunta || ocupado) return;
        ocupado = true;
        ultimaPergunta = pergunta;
        input.value = "";
        adicionar({ de: "user", texto: pergunta });
        const digitando = document.createElement("div");
        digitando.className = "cashbot-message cashbot-message-bot cashbot-typing-row";
        digitando.innerHTML = '<div class="cashbot-message-avatar" aria-hidden="true">CF</div><div class="cashbot-bubble cashbot-typing" aria-label="CashBot digitando"><span></span><span></span><span></span></div>';
        mensagens.appendChild(digitando);
        mensagens.scrollTop = mensagens.scrollHeight;
        let resposta;
        try {
            [resposta] = await Promise.all([responder(pergunta), new Promise((r) => setTimeout(r, 450))]);
        } catch {
            resposta = R("Tive um problema para ler seus dados agora. Tente de novo em instantes.");
        }
        digitando.remove();
        resposta ||= R("Não entendi bem. 🤔");
        adicionar({ de: "bot", ...resposta });
        mostrarChips(resposta.sugestoes);
        ocupado = false;
    }

    function abrirChat() {
        painel.classList.remove("cashbot-hidden");
        painel.classList.add("cashbot-open");
        fab.classList.add("cashbot-active");
        fab.setAttribute("aria-expanded", "true");
        mensagens.scrollTop = mensagens.scrollHeight;
        if (window.innerWidth > 768) setTimeout(() => input.focus(), 150);
    }
    function fecharChat() {
        painel.classList.add("cashbot-hidden");
        painel.classList.remove("cashbot-open");
        fab.classList.remove("cashbot-active");
        fab.setAttribute("aria-expanded", "false");
    }

    function recomecar() {
        historico = [];
        mensagens.replaceChildren();
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ok */ }
        const bv = boasVindas();
        adicionar({ de: "bot", ...bv });
        mostrarChips(bv.sugestoes);
    }

    function iniciar() {
        painel = document.getElementById("chatbotPanel");
        fab = document.getElementById("chatbotFab");
        mensagens = document.getElementById("chatMessages");
        chips = document.getElementById("cashbotChips");
        input = document.getElementById("chatInput");
        const form = document.getElementById("chatbotForm");
        if (!painel || !fab || !mensagens || !chips || !input || !form) return;

        fab.setAttribute("aria-controls", "chatbotPanel");
        fab.setAttribute("aria-expanded", "false");
        fab.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            painel.classList.contains("cashbot-hidden") ? abrirChat() : fecharChat();
        };
        document.getElementById("closeChatbot")?.addEventListener("click", (e) => { e.preventDefault(); fecharChat(); });
        document.getElementById("resetChatbot")?.addEventListener("click", recomecar);
        form.onsubmit = (e) => { e.preventDefault(); perguntar(input.value); };
        input.addEventListener("keydown", (e) => {
            if (e.key === "ArrowUp" && !input.value && ultimaPergunta) { input.value = ultimaPergunta; e.preventDefault(); }
        });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !painel.classList.contains("cashbot-hidden")) fecharChat(); });
        // Atalhos antigos com a classe .cashbot-question (ex.: outras telas) continuam funcionando.
        document.querySelectorAll(".cashbot-question").forEach((b) => b.addEventListener("click", () => { abrirChat(); perguntar(b.dataset.question || b.textContent); }));

        try { historico = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]"); } catch { historico = []; }
        if (historico.length) {
            historico.forEach((m) => desenharMensagem(m, false));
            const ultimaBot = [...historico].reverse().find((m) => m.de === "bot");
            mostrarChips(ultimaBot?.sugestoes);
        } else {
            const bv = boasVindas();
            adicionar({ de: "bot", ...bv }, false);
            mostrarChips(bv.sugestoes);
        }
    }

    window.CashBot = { responder, perguntar: (t) => perguntar(t) };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();
