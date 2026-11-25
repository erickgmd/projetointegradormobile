// Máscara de valores em reais (padrão brasileiro): 250000 → R$ 250.000,00.
// A pessoa digita a parte inteira normalmente e usa vírgula para os centavos;
// os ",00" são completados ao sair do campo. Tudo é feito com texto, então
// números grandes nunca viram notação científica (1e+21).
// Para os cálculos, use CashFlowMoney.valor(input), que devolve um Number.
(function () {
    "use strict";

    const agrupar = (digitos) =>
        (digitos.replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    // Separa o texto em parte inteira e centavos, aceitando "1.234,56", "1234,5" e "1500.50".
    function partes(texto) {
        let s = String(texto ?? "").replace(/[^\d,.]/g, "");
        if (s.includes(",")) {
            const i = s.lastIndexOf(",");
            return { inteiro: s.slice(0, i).replace(/\D/g, ""), centavos: s.slice(i + 1).replace(/\D/g, "").slice(0, 2), virgula: true };
        }
        if (/^\d+\.\d{1,2}$/.test(s)) {
            const [inteiro, centavos] = s.split(".");
            return { inteiro, centavos, virgula: true };
        }
        return { inteiro: s.replace(/\D/g, ""), centavos: "", virgula: false };
    }

    function formatar(texto, completar = false) {
        const p = partes(texto);
        if (!p.inteiro && !p.virgula) return "";
        const centavos = completar ? (p.centavos + "00").slice(0, 2) : p.centavos;
        return agrupar(p.inteiro) + (p.virgula || completar ? "," + centavos : "");
    }

    function numero(texto) {
        const p = partes(texto);
        if (!p.inteiro && !p.centavos) return NaN;
        return Number(`${p.inteiro || "0"}.${p.centavos || "0"}`);
    }

    // Número → "R$ 1.234,56" sem passar por notação científica.
    function formatarNumero(valor, prefixo = "R$ ") {
        if (valor === null || valor === undefined || valor === "") return "";
        const s = typeof valor === "number" ? valor.toFixed(2) : String(valor);
        if (!/^\d+(\.\d+)?$/.test(s)) return "";
        const [inteiro, dec = ""] = s.split(".");
        return prefixo + agrupar(inteiro) + "," + (dec + "00").slice(0, 2);
    }

    function aviso(input, texto) {
        let el = input.parentElement?.querySelector(`.money-hint[data-for="${input.id || input.name}"]`);
        if (!texto) { el?.remove(); return; }
        if (!el) {
            el = document.createElement("small");
            el.className = "money-hint";
            el.dataset.for = input.id || input.name;
            el.setAttribute("role", "alert");
            input.after(el);
        }
        el.textContent = texto;
    }

    // Opções: prefixo ("R$ "), max (Number) e mensagemMax.
    function aplicar(input, opcoes = {}) {
        if (!input || input.dataset.moneyMask) return;
        input.dataset.moneyMask = "1";
        const prefixo = () => (typeof opcoes.prefixo === "function" ? opcoes.prefixo() : opcoes.prefixo ?? "R$ ");
        const max = opcoes.max ?? 999999999999.99;
        const mensagemMax = opcoes.mensagemMax || `O valor máximo é ${formatarNumero(max, prefixo())}.`;
        const inicial = input.value;
        if (input.type === "number") input.type = "text";
        input.inputMode = "decimal";
        input.autocomplete = "off";
        if (input.placeholder && /^[\d.]+$/.test(input.placeholder)) input.placeholder = prefixo() + formatar(input.placeholder, true);
        let anterior = "";

        const montar = (corpo) => (corpo ? prefixo() + corpo : "");
        function atualizar(completar) {
            const bruto = input.value;
            const corpo = formatar(bruto, completar && bruto.trim() !== "");
            if (corpo && numero(corpo) > max) {
                aviso(input, mensagemMax);
                input.value = anterior;
                return;
            }
            aviso(input, "");
            // Mantém o cursor depois do mesmo número de dígitos que antes.
            const pos = input.selectionStart ?? bruto.length;
            const significativos = bruto.slice(0, pos).replace(/[^\d,]/g, "").length;
            const novo = montar(corpo);
            input.value = novo;
            anterior = novo;
            if (document.activeElement === input && !completar) {
                let i = prefixo().length, vistos = 0;
                while (i < novo.length && vistos < significativos) { if (/[\d,]/.test(novo[i])) vistos++; i++; }
                try { input.setSelectionRange(i, i); } catch { /* alguns tipos não aceitam */ }
            }
        }
        input.addEventListener("input", () => atualizar(false));
        input.addEventListener("blur", () => atualizar(true));
        if (inicial) { input.value = inicial; atualizar(true); }
        input.cashflowMoney = { atualizar: () => atualizar(true) };
    }

    const valor = (input) => numero(typeof input === "string" ? input : input?.value);

    window.CashFlowMoney = { aplicar, valor, formatar, formatarNumero, numero };
})();
