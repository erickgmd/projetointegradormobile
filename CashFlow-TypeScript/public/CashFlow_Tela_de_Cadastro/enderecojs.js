// Cadastro, etapa 2: endereço opcional com busca automática do CEP (ViaCEP).
document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    const cepInput = document.getElementById('cep');
    const cepStatus = document.getElementById('cepStatus');
    const alerta = document.getElementById('enderecoAlerta');
    let ultimoCep = '';
    let controller = null;

    function status(texto, tipo) {
        if (!cepStatus) return;
        cepStatus.textContent = texto;
        cepStatus.className = 'cep-status' + (tipo ? ' ' + tipo : '');
    }

    async function buscarCep(cep) {
        if (cep === ultimoCep) return;
        ultimoCep = cep;
        if (controller) controller.abort();
        controller = new AbortController();
        status('Buscando endereço...', 'loading');
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
            if (!response.ok) throw new Error('CEP não encontrado');
            const data = await response.json();
            if (data.erro) throw new Error('CEP não encontrado');
            document.getElementById('logradouro').value = data.logradouro || '';
            document.getElementById('bairro').value = data.bairro || '';
            document.getElementById('cidade').value = data.localidade || '';
            document.getElementById('estado').value = data.uf || '';
            status('Endereço encontrado. Confira e complete o número/complemento.', 'ok');
            if (!data.logradouro) document.getElementById('logradouro').focus();
            else document.getElementById('complemento').focus();
        } catch (error) {
            if (error.name === 'AbortError') return;
            ultimoCep = '';
            if (error instanceof TypeError)
                status('Sem conexão para consultar o CEP agora. Preencha o endereço manualmente.', 'error');
            else
                status('Não encontramos esse CEP. Confira os números ou preencha o endereço manualmente.', 'error');
        }
    }

    // Máscara 00000-000 e busca assim que os 8 números forem digitados.
    cepInput.addEventListener('input', function (e) {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
        e.target.value = digits.replace(/^(\d{5})(\d)/, '$1-$2');
        if (digits.length === 8) buscarCep(digits);
        else {
            ultimoCep = '';
            status('Digite o CEP: o endereço é preenchido automaticamente.');
        }
    });
    if (cepInput.value) cepInput.dispatchEvent(new Event('input'));

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
