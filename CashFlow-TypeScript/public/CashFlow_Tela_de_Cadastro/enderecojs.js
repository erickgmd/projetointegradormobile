// Cadastro, etapa 2: endereço opcional com busca automática do CEP (cep.js).
document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    const cepInput = document.getElementById('cep');
    const cepStatus = document.getElementById('cepStatus');
    const alerta = document.getElementById('enderecoAlerta');
    const $ = (id) => document.getElementById(id);
    const buscaCep = window.CashFlowCep?.ligar({
        cep: cepInput,
        logradouro: $('logradouro'),
        bairro: $('bairro'),
        cidade: $('cidade'),
        estado: $('estado'),
        status(texto, tipo) {
            if (!cepStatus) return;
            cepStatus.textContent = texto;
            cepStatus.className = 'cep-status' + (tipo ? ' ' + tipo : '');
        },
        depois(end) {
            (end.logradouro ? $('numero') : $('logradouro'))?.focus();
        },
    });

    // Só entra aqui quem já criou a conta na etapa 1; os dados salvos voltam preenchidos.
    fetch('/api/perfil', { credentials: 'include' })
        .then((r) => {
            if (r.status === 401) {
                window.location.replace('/CashFlow_Tela_de_Cadastro/dadospessoais.html');
                return null;
            }
            return r.ok ? r.json() : null;
        })
        .then((r) => {
            const d = r?.dados;
            if (!d) return;
            for (const id of ['cep', 'logradouro', 'complemento', 'bairro', 'cidade', 'estado', 'tipo_residencia', 'tempo_residencia']) {
                const el = form.elements[id] || document.getElementById(id);
                if (el && d[id] && !el.value) el.value = d[id];
            }
            if (d.cep) buscaCep?.definirSalvo(d.cep);
        })
        .catch(() => {});

    // Navegação entre passos
    document.querySelector('.btn-secondary').addEventListener('click', function () {
        window.location.href = '../CashFlow_Tela_de_Cadastro/dadospessoais.html';
    });

    document.getElementById('skipAddress').addEventListener('click', () => {
        for (const control of form.querySelectorAll('input,select')) control.value = '';
        form.requestSubmit();
    });

    function mostrarAlerta(texto) {
        if (!alerta) return window.alert(texto);
        alerta.className = 'form-alert show error';
        alerta.textContent = texto;
        alerta.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(form);
        // Sem coluna própria no banco: o número vai junto do logradouro ("Rua X, 123").
        const numero = document.getElementById('numero').value.trim();
        const logradouro = String(formData.get('logradouro') || '').trim();
        if (numero && logradouro) formData.set('logradouro', `${logradouro}, ${numero}`);
        else if (numero) formData.set('complemento', [`Nº ${numero}`, formData.get('complemento')].filter(Boolean).join(' - '));
        fetch("/api/cadastro/etapa2", {
            method: "POST",
            credentials: "include",
            body: formData
        })
            .then(res => res.json())
            .then(result => {
                if (result.status === "success") {
                    window.location.href = "finalizacao.html";
                } else {
                    mostrarAlerta(result.message || "Não foi possível salvar o endereço.");
                }
            })
            .catch(() => mostrarAlerta("Sem conexão com o servidor. Tente novamente."));
    });
});
