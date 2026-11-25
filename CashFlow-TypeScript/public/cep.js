// Busca de endereço pelo CEP, usada no Perfil e no cadastro de endereço.
// Consulta o ViaCEP e, se ele falhar, a BrasilAPI. Preenche rua, bairro,
// cidade e estado; tudo continua editável à mão.
//
// CashFlowCep.ligar({
//   cep: <input>, logradouro, bairro, cidade, estado,   // campos (inputs/selects)
//   status: (texto, tipo) => {},                        // tipo: "loading" | "ok" | "error" | ""
//   depois: (endereco) => {},                           // opcional, após preencher
// })
(function () {
    "use strict";

    async function consultar(cep, signal) {
        const tentativas = [
            async () => {
                const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
                if (r.status === 400) return { inexistente: true };
                if (!r.ok) throw new Error("ViaCEP " + r.status);
                const d = await r.json();
                if (d.erro) return { inexistente: true };
                return { logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, estado: d.uf };
            },
            async () => {
                const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`, { signal });
                if (r.status === 404) return { inexistente: true };
                if (!r.ok) throw new Error("BrasilAPI " + r.status);
                const d = await r.json();
                return { logradouro: d.street, bairro: d.neighborhood, cidade: d.city, estado: d.state };
            },
        ];
        let falhou = null;
        for (const tentar of tentativas) {
            try {
                const resultado = await tentar();
                if (!resultado.inexistente) return resultado;
                falhou = falhou || "inexistente";
            } catch (erro) {
                if (erro.name === "AbortError") throw erro;
                falhou = falhou === "inexistente" ? falhou : "rede";
            }
        }
        // Se algum serviço respondeu que o CEP não existe, é isso que a pessoa precisa saber.
        throw Object.assign(new Error(falhou), { tipo: falhou });
    }

    function ligar(o) {
        const { cep } = o;
        if (!cep || cep.dataset.cepLigado) return;
        cep.dataset.cepLigado = "1";
        cep.setAttribute("inputmode", "numeric");
        cep.setAttribute("maxlength", "9");
        const status = o.status || (() => {});
        const campos = ["logradouro", "bairro", "cidade", "estado"].map((k) => [k, o[k]]).filter(([, el]) => el);
        let ultimo = cep.value.replace(/\D/g, "");
        let controle = null;
        let preenchido = false;

        function limparPreenchidos() {
            if (!preenchido) return;
            campos.forEach(([, el]) => { el.value = ""; });
            preenchido = false;
        }

        async function buscar(digitos) {
            if (digitos === ultimo) return;
            ultimo = digitos;
            controle?.abort();
            controle = new AbortController();
            if (/^(\d)\1{7}$/.test(digitos)) {
                limparPreenchidos();
                status("CEP inválido. Confira os 8 números.", "error");
                return;
            }
            status("Buscando endereço...", "loading");
            try {
                const end = await consultar(digitos, controle.signal);
                campos.forEach(([k, el]) => {
                    const v = String(end[k] || "");
                    if (el.tagName === "SELECT" && v && ![...el.options].some((op) => op.value === v)) return;
                    el.value = v;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                });
                preenchido = true;
                status(
                    end.logradouro
                        ? "Endereço encontrado. Confira e complete com o número."
                        : "CEP encontrado. Esse CEP é da cidade toda: preencha a rua e o bairro.",
                    "ok",
                );
                o.depois?.(end);
            } catch (erro) {
                if (erro.name === "AbortError") return;
                ultimo = "";
                limparPreenchidos();
                status(
                    erro.tipo === "inexistente"
                        ? "Não encontramos esse CEP. Confira os números ou preencha o endereço à mão."
                        : "Não foi possível consultar o CEP agora. Preencha o endereço à mão ou tente de novo.",
                    "error",
                );
            }
        }

        // Máscara 00000-000 e busca assim que os 8 números forem digitados (ou colados).
        cep.addEventListener("input", () => {
            const digitos = cep.value.replace(/\D/g, "").slice(0, 8);
            cep.value = digitos.replace(/^(\d{5})(\d)/, "$1-$2");
            if (digitos.length === 8) buscar(digitos);
            else {
                controle?.abort();
                if (digitos !== ultimo) ultimo = "";
                status(digitos.length ? "Digite os 8 números do CEP." : "Digite o CEP: o endereço é preenchido automaticamente.", "");
            }
        });
        cep.addEventListener("blur", () => {
            const n = cep.value.replace(/\D/g, "").length;
            if (n > 0 && n < 8) status("CEP incompleto: ele tem 8 números.", "error");
        });
        // Quando o valor salvo é carregado depois, ele passa a ser o "último" CEP (não busca de novo).
        return { definirSalvo(v) { ultimo = String(v || "").replace(/\D/g, ""); } };
    }

    window.CashFlowCep = { ligar, consultar };
})();
