// Seletor de mês e ano com setas ‹ ›.
// Substitui o <input type="month"> nativo, que é pouco intuitivo, esvazia quando
// a pessoa edita só o ano e tem setas quase invisíveis no tema escuro.
// O <input> original continua existindo (escondido) com o valor "AAAA-MM",
// então o código que lê ou altera input.value continua funcionando igual.
//
// Uso: <input type="month" id="x" data-month-picker data-min="2015-01" data-max="+12">
//   data-min / data-max: "AAAA-MM", "current" (mês atual), "previous" (mês anterior)
//   ou "+N" / "-N" (N meses a partir do atual).
(function () {
    "use strict";

    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
        "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const nativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

    const hojeYM = () => new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
    }).format(new Date()).slice(0, 7);
    const paraIndice = (ym) => {
        const [a, m] = ym.split("-").map(Number);
        return a * 12 + (m - 1);
    };
    const deIndice = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    const valido = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ""));

    function limite(texto, padrao) {
        const atual = paraIndice(hojeYM());
        if (!texto) return padrao;
        if (texto === "current") return atual;
        if (texto === "previous") return atual - 1;
        if (/^[+-]\d+$/.test(texto)) return atual + Number(texto);
        return valido(texto) ? paraIndice(texto) : padrao;
    }

    function montar(input) {
        if (input.dataset.mpPronto) return;
        input.dataset.mpPronto = "1";
        // Vira campo escondido; o valor atual é preservado.
        const inicial = nativo.get.call(input);
        input.type = "hidden";
        nativo.set.call(input, inicial);
        const atual = paraIndice(hojeYM());
        const min = limite(input.dataset.min, atual - 120);
        const max = Math.max(min, limite(input.dataset.max, atual));
        const id = input.id || `mp${Math.random().toString(36).slice(2, 8)}`;

        const caixa = document.createElement("div");
        caixa.className = "month-picker";
        caixa.setAttribute("role", "group");
        caixa.innerHTML =
            `<button type="button" class="mp-arrow" data-passo="-1" aria-label="Mês anterior">‹</button>` +
            `<select class="mp-mes" id="${id}Mes" aria-label="Mês"></select>` +
            `<select class="mp-ano" id="${id}Ano" aria-label="Ano"></select>` +
            `<button type="button" class="mp-arrow" data-passo="1" aria-label="Próximo mês">›</button>`;
        const selMes = caixa.querySelector(".mp-mes");
        const selAno = caixa.querySelector(".mp-ano");
        const [antes, depois] = caixa.querySelectorAll(".mp-arrow");

        selMes.add(new Option("Mês", ""));
        MESES.forEach((nome, i) => selMes.add(new Option(nome, String(i + 1).padStart(2, "0"))));
        selAno.add(new Option("Ano", ""));
        for (let a = Math.floor(max / 12); a >= Math.floor(min / 12); a--) selAno.add(new Option(String(a), String(a)));

        // A etiqueta do campo passa a apontar para o seletor de mês.
        document.querySelectorAll(`label[for="${input.id}"]`).forEach((l) => l.setAttribute("for", selMes.id));
        if (input.getAttribute("aria-label")) caixa.setAttribute("aria-label", input.getAttribute("aria-label"));

        function desenhar() {
            const v = nativo.get.call(input);
            if (valido(v)) {
                selAno.value = v.slice(0, 4);
                selMes.value = v.slice(5, 7);
            } else {
                selAno.value = "";
                selMes.value = "";
            }
            const ano = Number(selAno.value);
            [...selMes.options].forEach((o) => {
                if (!o.value || !ano) { o.disabled = false; return; }
                const i = ano * 12 + Number(o.value) - 1;
                o.disabled = i < min || i > max;
            });
            const i = valido(v) ? paraIndice(v) : null;
            antes.disabled = i !== null && i <= min;
            depois.disabled = i !== null && i >= max;
        }

        function definir(ym) {
            const i = Math.min(max, Math.max(min, paraIndice(ym)));
            const novo = deIndice(i);
            const mudou = novo !== nativo.get.call(input);
            nativo.set.call(input, novo);
            desenhar();
            if (mudou) {
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }

        selMes.addEventListener("change", () => {
            if (!selMes.value) return desenhar();
            definir(`${selAno.value || Math.floor(max / 12)}-${selMes.value}`);
        });
        selAno.addEventListener("change", () => {
            if (!selAno.value) return desenhar();
            const atualV = nativo.get.call(input);
            const mes = selMes.value || (valido(atualV) ? atualV.slice(5, 7) : deIndice(max).slice(5, 7));
            definir(`${selAno.value}-${mes}`);
        });
        caixa.querySelectorAll(".mp-arrow").forEach((b) => b.addEventListener("click", () => {
            const v = nativo.get.call(input);
            definir(deIndice((valido(v) ? paraIndice(v) : max + 1) + Number(b.dataset.passo)));
        }));

        // Quando o código altera input.value, os seletores acompanham.
        Object.defineProperty(input, "value", {
            configurable: true,
            get() { return nativo.get.call(input); },
            set(v) { nativo.set.call(input, v); desenhar(); },
        });

        input.after(caixa);
        desenhar();
    }

    function iniciar() {
        document.querySelectorAll("input[data-month-picker]").forEach(montar);
    }
    window.CashFlowMonthPicker = { montar, iniciar };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();
