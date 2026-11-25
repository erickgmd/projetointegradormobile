// Valores grandes sempre cabem no espaço: a fonte diminui até o texto caber
// na largura disponível (no máximo até 45% do tamanho original). Se ainda
// assim não couber, o valor quebra de linha em vez de vazar do cartão.
// Funciona no computador e no celular e acompanha mudanças de valor e de tela.
(function () {
    "use strict";

    const SELETORES = [
        ".summary .card p",              // Saldo, Receitas, Despesas e cartões do BCB
        ".transaction-amount",           // valores do histórico
        ".result-item span:last-child",  // resultados das Ferramentas
        ".cashbot-item-v",               // números nas respostas do CashBot
    ].join(",");
    const MINIMO = 0.45;
    const larguras = new WeakMap();

    // Devolve a proporção usada (1 = tamanho original).
    function ajustar(el) {
        // Escondido (outra aba): mantém como está e reajusta quando aparecer.
        if (!el.isConnected || el.clientWidth === 0) { larguras.set(el, 0); return 1; }
        el.classList.remove("fit-quebra");
        el.style.removeProperty("font-size");
        larguras.set(el, el.clientWidth);
        if (el.scrollWidth <= el.clientWidth + 1) return 1;
        const base = parseFloat(getComputedStyle(el).fontSize) || 16;
        const menor = base * MINIMO;
        let tamanho = Math.max(menor, Math.floor(base * (el.clientWidth / el.scrollWidth) * 100) / 100);
        // "important": algumas regras do celular fixam a fonte com !important.
        const aplicar = () => el.style.setProperty("font-size", tamanho + "px", "important");
        aplicar();
        for (let i = 0; i < 24 && el.scrollWidth > el.clientWidth + 1 && tamanho > menor; i++) {
            tamanho = Math.max(menor, tamanho - 0.5);
            aplicar();
        }
        if (el.scrollWidth > el.clientWidth + 1) el.classList.add("fit-quebra");
        return tamanho / base;
    }

    // Cartões do resumo lado a lado (celular): se algum valor precisaria ficar
    // pequeno demais, os cartões passam a ocupar a linha inteira, um embaixo do outro.
    function ajustarResumo(resumo) {
        const valores = [...resumo.querySelectorAll(".card p")];
        resumo.classList.remove("resumo-empilhado");
        const menor = Math.min(...valores.map(ajustar));
        if (menor < 0.7 && getComputedStyle(resumo).gridTemplateColumns.split(" ").length > 1) {
            resumo.classList.add("resumo-empilhado");
            valores.forEach(ajustar);
        }
        valores.forEach((v) => larguras.set(v, v.clientWidth));
    }
    // Valor ao lado de um rótulo (Ferramentas, CashBot, histórico no celular):
    // se precisaria ficar pequeno demais, desce para a linha de baixo, com a largura toda.
    function ajustarLinha(el) {
        const linha = el.parentElement;
        linha?.classList.remove("valor-abaixo");
        el.classList.remove("valor-linha");
        const proporcao = ajustar(el);
        if (proporcao < 0.75 && linha && getComputedStyle(linha).display.includes("flex")) {
            linha.classList.add("valor-abaixo");
            el.classList.add("valor-linha");
            ajustar(el);
        }
    }
    function ajustarItem(el) {
        const resumo = el.matches(".summary .card p") ? el.closest(".summary") : null;
        if (resumo) ajustarResumo(resumo);
        else ajustarLinha(el);
    }

    // Reajusta quando a largura do elemento muda (girar o celular, redimensionar,
    // trocar de aba: o elemento sai de largura 0 e passa a ter largura).
    const tamanhoObs = "ResizeObserver" in window
        ? new ResizeObserver((entradas) => {
            for (const { target } of entradas) {
                if (target.clientWidth !== larguras.get(target)) agendar(target);
            }
        })
        : null;
    const observados = new WeakSet();

    function acompanhar(el) {
        if (!observados.has(el)) {
            observados.add(el);
            tamanhoObs?.observe(el);
        }
        ajustarItem(el);
    }

    let pendentes = new Set();
    let agendado = false;
    function agendar(el) {
        pendentes.add(el);
        if (agendado) return;
        agendado = true;
        requestAnimationFrame(() => {
            const lote = pendentes;
            pendentes = new Set();
            agendado = false;
            // Um resumo inteiro é ajustado uma vez só, mesmo com vários valores mudando.
            const resumos = new Set();
            lote.forEach((el) => {
                const resumo = el.matches(".summary .card p") ? el.closest(".summary") : null;
                if (resumo) {
                    if (resumos.has(resumo)) { if (!observados.has(el)) { observados.add(el); tamanhoObs?.observe(el); } return; }
                    resumos.add(resumo);
                }
                acompanhar(el);
            });
        });
    }

    function varrer(raiz) {
        if (raiz.nodeType !== 1) return;
        if (raiz.matches?.(SELETORES)) agendar(raiz);
        raiz.querySelectorAll?.(SELETORES).forEach(agendar);
    }

    function iniciar() {
        varrer(document.body);
        // Valores novos ou atualizados (saldo recalculado, lista refeita, resposta do CashBot).
        new MutationObserver((mudancas) => {
            for (const m of mudancas) {
                const alvo = m.target.nodeType === 1 ? m.target : m.target.parentElement;
                const valor = alvo?.closest?.(SELETORES);
                if (valor) agendar(valor);
                m.addedNodes.forEach(varrer);
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
        if (!tamanhoObs) window.addEventListener("resize", () => document.querySelectorAll(SELETORES).forEach(agendar));
        // As fontes carregadas depois mudam a largura do texto.
        document.fonts?.ready.then(() => document.querySelectorAll(SELETORES).forEach(agendar));
    }

    window.CashFlowFitText = { ajustar, varrer };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();
