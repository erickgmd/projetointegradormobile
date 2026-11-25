class FinanceManager {
    constructor() {
        this.transactions = [];
        this.apiJuros = "/api/mercado/taxas";
        this.dadosJuros = [];
        this.bcbEventosRegistrados = false;
        this.bcbJaCarregado = false;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadCategories();
        this.setTodayDate();
        this.initTabs();
        const period=document.getElementById("bcbPeriod");if(period){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);period.value=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
        document.getElementById("bcbReload")?.addEventListener("click",()=>{this.bcbJaCarregado=false;this.carregarDadosJuros();});
        await this.loadTransactions();
        this.updateDisplay();
    }

    initTabs() {
        const allTabButtons = document.querySelectorAll('.nav-btn, .hero-action-btn');

        allTabButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetTab = e.currentTarget.getAttribute('data-tab');
                await this.switchTab(targetTab);
            });
        });
    }

    async switchTab(tabName) {
        // A mensagem de boas-vindas ("Dashboard") só aparece na aba Dashboard.
        document.body.dataset.tab = tabName;
        document.querySelectorAll('.nav-btn, .hero-action-btn')
            .forEach(btn => btn.classList.remove('active'));

        document.querySelectorAll('.tab-content')
            .forEach(tab => tab.classList.remove('active'));

        document.querySelectorAll(`[data-tab="${tabName}"]`)
            .forEach(btn => btn.classList.add('active'));

        const targetTab = document.getElementById(tabName);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (tabName === 'market' && !this.bcbJaCarregado) {
            await this.carregarDadosJuros();
        }
    }

    bindEvents() {
        document.getElementById('transactionForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addTransaction();
        });

        document.getElementById('filterType')?.addEventListener('change', () => {
            this.filterTransactions();
        });

        document.getElementById('filterMonth')?.addEventListener('change', () => {
            this.filterTransactions();
        });

        document.getElementById('clearAll')?.addEventListener('click', async () => {
            await this.clearAllTransactions();
        });

        document.getElementById('category')?.addEventListener('change', (e) => {
            this.autoSetType(e.target.value);
        });

        document.getElementById('type')?.addEventListener('change', (e) => {
            this.filterCategoriesByType(e.target.value);
            this.avisoValorNegativo();
        });

        // Valor negativo: avisa que o sinal de menos não é necessário.
        const amountInput = document.getElementById('amount');
        amountInput?.addEventListener('input', () => this.avisoValorNegativo());
        amountInput?.addEventListener('change', () => this.corrigirValorNegativo());

        document.getElementById('generatePdfBtn')?.addEventListener('click', () => {
            this.generatePdfReport();
        });
    }

    setTodayDate() {
        const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = today;
    }

    autoSetType(category) {
        const incomeCategories = ['salario', 'freelance', 'investimentos', 'outros-receitas'];
        const typeSelect = document.getElementById('type');
        if (!typeSelect) return;

        const custom = (this.customCategories || []).find(c => c.nome === category);
        if (custom) { typeSelect.value = custom.tipo; return; }
        if (incomeCategories.includes(category)) {
            typeSelect.value = 'income';
        } else if (category) {
            typeSelect.value = 'expense';
        }
    }

    async loadCategories() {
        try {
            const response = await fetch('/api/categorias', {credentials:'include'});
            const data = await response.json();
            this.customCategories = data.categories || [];
            const select = document.getElementById('category');
            // Categorias próprias entram no grupo do tipo delas (Receitas/Despesas).
            const groups = select ? [...select.querySelectorAll('optgroup')] : [];
            // Categorias excluídas saem da lista.
            const nomes = new Set(this.customCategories.map(c => c.nome));
            [...select.options].forEach(o => {
                if (o.dataset.custom && !nomes.has(o.value)) {
                    if (select.value === o.value) select.value = '';
                    o.remove();
                }
            });
            this.customCategories.forEach(c => {
                if (![...select.options].some(o => o.value === c.nome)) {
                    const option = new Option(c.nome, c.nome);
                    option.dataset.custom = '1';
                    const group = groups.find(g => g.label === (c.tipo === 'income' ? 'Receitas' : 'Despesas'));
                    (group || select).appendChild(option);
                }
            });
            this.filterCategoriesByType(document.getElementById('type')?.value || '');
            window.dispatchEvent(new Event('cashflow:categorias'));
        } catch (error) { console.warn('Categorias indisponíveis', error); }
    }

    // Com o tipo escolhido, a lista mostra só as categorias daquele tipo.
    filterCategoriesByType(type) {
        const select = document.getElementById('category');
        if (!select) return;
        const wanted = type === 'income' ? 'Receitas' : type === 'expense' ? 'Despesas' : '';
        select.querySelectorAll('optgroup').forEach(group => {
            const show = !wanted || group.label === wanted;
            group.hidden = !show;
            group.disabled = !show;
        });
        const selected = select.selectedOptions[0];
        if (selected?.parentElement?.disabled) select.value = '';
    }

    editTransaction(id) {
        const transaction = this.transactions.find(t => Number(t.id) === Number(id));
        if (!transaction) return;
        this.editingId = id;
        this.transactionKey = null;
        for (const key of ['description','amount','category','type','date']) {
            if (key === 'category') this.filterCategoriesByType(transaction.type);
            document.getElementById(key).value = key === 'date' ? String(transaction[key]).slice(0,10) : transaction[key];
        }
        const form = document.getElementById('transactionForm');
        if (!document.getElementById('cancelEdit')) {
            const cancel = document.createElement('button'); cancel.id = 'cancelEdit'; cancel.type = 'button';
            cancel.textContent = 'Cancelar edição'; cancel.onclick = () => this.clearForm(); form.append(cancel);
        }
        form.closest('.tab-content')?.classList.add('active');
        form.scrollIntoView({behavior:'smooth',block:'center'});
        document.getElementById('description').focus();
    }

    // O valor é sempre positivo: o tipo (Receita/Despesa) é que define se entra ou sai.
    avisoValorNegativo() {
        const input = document.getElementById('amount');
        if (!input) return;
        let hint = document.getElementById('amountHint');
        const negativo = /^\s*-/.test(input.value) || Number(input.value) < 0;
        if (!negativo) { hint?.remove(); input.removeAttribute('aria-describedby'); return; }
        if (!hint) {
            hint = document.createElement('p');
            hint.id = 'amountHint';
            hint.className = 'field-hint field-hint-warn';
            hint.setAttribute('role', 'status');
            input.after(hint);
            input.setAttribute('aria-describedby', 'amountHint');
        }
        const tipo = document.getElementById('type')?.value;
        hint.textContent = tipo === 'income'
            ? 'Receitas não usam sinal de menos. Digite só o valor; se for um gasto, escolha o tipo Despesa.'
            : 'Não precisa do sinal de menos: escolha o tipo Despesa e digite só o valor (ex.: 500). Vamos registrar como despesa.';
    }

    // Ao sair do campo, -500 vira 500 e, se o tipo ainda não foi escolhido, vira Despesa.
    corrigirValorNegativo() {
        const input = document.getElementById('amount');
        const valor = Number(input?.value);
        if (!input || !(valor < 0)) return;
        input.value = String(Math.abs(valor));
        const type = document.getElementById('type');
        if (type && !type.value) {
            type.value = 'expense';
            this.filterCategoriesByType('expense');
        }
        this.avisoValorNegativo();
        const hint = document.getElementById('amountHint') || document.createElement('p');
        if (!hint.id) {
            hint.id = 'amountHint';
            hint.className = 'field-hint field-hint-warn';
            hint.setAttribute('role', 'status');
            input.after(hint);
        }
        hint.textContent = type?.value === 'income'
            ? 'Tiramos o sinal de menos. Confira o tipo: está marcado como Receita.'
            : 'Tiramos o sinal de menos: o valor será registrado como despesa.';
    }

    async addTransaction() {
        const description = document.getElementById('description').value.trim();
        let amount = document.getElementById('amount').value.trim();
        const category = document.getElementById('category').value;
        const type = document.getElementById('type').value;
        const date = document.getElementById('date').value;

        if (!description || !amount || !category || !type || !date) {
            this.showErrorMessage('Preencha descrição, valor, data, tipo e categoria.');
            return;
        }
        if (Number(amount) < 0) {
            if (type === 'income') {
                this.showErrorMessage('Receitas não usam sinal de menos. Digite só o valor ou mude o tipo para Despesa.');
                return;
            }
            // Despesa com "-500": registra 500 (o sinal não é somado duas vezes).
            amount = String(Math.abs(Number(amount)));
            document.getElementById('amount').value = amount;
        }
        if (!(Number(amount) > 0)) {
            this.showErrorMessage('Informe um valor maior que zero.');
            return;
        }
        const editing = Boolean(this.editingId);
        const submitBtn = document.querySelector('#transactionForm button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData();
        if (this.editingId) formData.append('id', this.editingId);
        this.transactionKey ||= crypto.randomUUID();
        formData.append('idempotency_key', this.transactionKey);
        formData.append('description', description);
        formData.append('amount', amount);
        formData.append('category', category);
        formData.append('type', type);
        formData.append('date', date);

        try {
            const response = await fetch(this.editingId ? '/api/transacoes/editar' : '/api/transacoes', {
                method: 'POST',
                body: formData,
                credentials: "include"
            });

            const raw = await response.text();

            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                throw new Error('Resposta inválida do servidor: ' + raw);
            }

            if (result.status === 'success') {
                this.transactionKey = null;
                this.editingId = null;
                await this.loadTransactions();
                this.updateDisplay();
                this.clearForm();
                this.showSuccessMessage(editing ? 'Transação atualizada com sucesso!' : 'Transação adicionada com sucesso!');
            } else {
                this.showErrorMessage(result.message || 'Não foi possível salvar a transação.');
            }
        } catch (error) {
            console.error('Erro ao salvar transação:', error);
            this.showErrorMessage('Não foi possível salvar a transação. Verifique sua conexão e tente novamente.');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    clearForm() {
        this.editingId = null;
        document.getElementById('cancelEdit')?.remove();
        document.getElementById('transactionForm')?.reset();
        document.getElementById('amountHint')?.remove();
        this.setTodayDate();
        this.filterCategoriesByType('');
    }

    showErrorMessage(message) {
        this.showSuccessMessage(message, true);
    }

    showSuccessMessage(message, isError = false) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isError ? '#dc2626' : '#48bb78'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        notification.setAttribute('role', isError ? 'alert' : 'status');

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
            style.remove();
        }, isError ? 5000 : 3000);
    }

    async deleteTransaction(id) {
        if (!confirm('Tem certeza que deseja excluir esta transação?')) return;

        const formData = new FormData();
        formData.append('id', id);

        try {
            const response = await fetch('/api/transacoes/excluir', {
                method: 'POST',
                body: formData,
                credentials: "include"
            });

            const raw = await response.text();

            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                throw new Error('Resposta inválida do servidor: ' + raw);
            }

            if (result.status === 'success') {
                await this.loadTransactions();
                this.updateDisplay();
                this.showSuccessMessage('Transação excluída com sucesso!');
            } else {
                this.showErrorMessage(result.message || 'Não foi possível excluir a transação.');
            }
        } catch (error) {
            console.error('Erro ao excluir transação:', error);
            this.showErrorMessage('Não foi possível excluir a transação. Tente novamente.');
        }
    }

    // Pede para digitar EXCLUIR antes de apagar todas as transações.
    confirmarExclusaoTotal() {
        return new Promise(resolve => {
            if (typeof HTMLDialogElement === 'undefined') {
                resolve(window.prompt('Para excluir TODAS as transações, digite EXCLUIR:') === 'EXCLUIR');
                return;
            }
            const total = this.transactions.length;
            const dialog = document.createElement('dialog');
            dialog.className = 'confirm-dialog';
            dialog.setAttribute('aria-labelledby', 'confirmTitulo');
            dialog.innerHTML = `
                <form method="dialog" class="confirm-sheet">
                    <div class="confirm-icon" aria-hidden="true">🗑️</div>
                    <h3 id="confirmTitulo">Excluir todas as transações?</h3>
                    <p>Isso apaga <strong>${total} transaç${total === 1 ? 'ão' : 'ões'}</strong> de forma definitiva. Não dá para desfazer.</p>
                    <label for="confirmTexto">Para confirmar, digite <strong>EXCLUIR</strong></label>
                    <input id="confirmTexto" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="EXCLUIR">
                    <div class="confirm-actions">
                        <button type="button" class="confirm-cancel" data-acao="cancelar">Cancelar</button>
                        <button type="submit" class="confirm-ok" data-acao="excluir" disabled>Excluir tudo</button>
                    </div>
                </form>`;
            document.body.appendChild(dialog);
            const input = dialog.querySelector('#confirmTexto');
            const excluir = dialog.querySelector('[data-acao="excluir"]');
            let ok = false;
            input.addEventListener('input', () => { excluir.disabled = input.value.trim().toUpperCase() !== 'EXCLUIR'; });
            dialog.querySelector('[data-acao="cancelar"]').addEventListener('click', () => dialog.close());
            dialog.querySelector('form').addEventListener('submit', () => { ok = input.value.trim().toUpperCase() === 'EXCLUIR'; });
            dialog.addEventListener('close', () => { dialog.remove(); resolve(ok); });
            dialog.showModal();
            input.focus();
        });
    }

    async clearAllTransactions() {
        if (!this.transactions.length) {
            this.showErrorMessage('Não há transações para excluir.');
            return;
        }
        if (!(await this.confirmarExclusaoTotal())) return;

        try {
            const response = await fetch('/api/transacoes/limpar', {
                method: 'POST',
                credentials: "include"
            });

            const raw = await response.text();

            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                throw new Error('Resposta inválida do servidor: ' + raw);
            }

            if (result.status === 'success') {
                await this.loadTransactions();
                this.updateDisplay();
                this.showSuccessMessage('Todas as transações foram excluídas!');
            } else {
                this.showErrorMessage(result.message || 'Não foi possível excluir as transações.');
            }
        } catch (error) {
            console.error('Erro ao excluir transações:', error);
            this.showErrorMessage('Não foi possível excluir as transações. Tente novamente.');
        }
    }

    filterTransactions() {
        this.displayTransactions();
        this.updateSummary();
        this.updateChart();
    }

    updateDisplay() {
        this.populateMonthFilter();
        this.updateSummary();
        this.displayTransactions();
        this.updateChart();
    }

    getFilteredTransactions() {
        const typeFilter = document.getElementById('filterType')?.value || 'all';
        const monthFilter = document.getElementById('filterMonth')?.value || 'all';

        let filteredTransactions = [...this.transactions];

        if (typeFilter !== 'all') {
            filteredTransactions = filteredTransactions.filter(t => t.type === typeFilter);
        }

        if (monthFilter !== 'all') {
            filteredTransactions = filteredTransactions.filter(t => String(t.date).slice(0, 7) === monthFilter);
        }

        return filteredTransactions;
    }

    updateSummary() {
        const filtered = this.getFilteredTransactions();

        const income = filtered
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + Math.round(Number(t.amount)*100), 0)/100;

        const expenses = filtered
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + Math.round(Number(t.amount)*100), 0)/100;

        const balance = Math.round(income*100-expenses*100)/100;

        const incomeEl = document.querySelector('#dashboard .income-total');
        const expenseEl = document.querySelector('#dashboard .expense-total');
        const balanceEl = document.querySelector('#dashboard .balance-total');
        const balanceCardEl = document.querySelector('#dashboard .balance-card');

        if (incomeEl) incomeEl.textContent = this.formatCurrency(income);
        if (expenseEl) expenseEl.textContent = this.formatCurrency(expenses);
        if (balanceEl) {
            balanceEl.textContent = this.formatCurrency(balance);
            balanceEl.style.color = balance >= 0 ? '#1F4BA0' : '#dc2626';
            balanceEl.classList.toggle('is-negative', balance < 0);
        }
        // Os cards seguem o filtro de mês do histórico; o rótulo mostra o período.
        const month = document.getElementById('filterMonth')?.value || 'all';
        const periodo = month === 'all' ? 'Todo o período' : this.formatMonthYear(month);
        document.querySelectorAll('#dashboard .summary-period').forEach(el => { el.textContent = periodo; });
        if (balanceCardEl) {
            balanceCardEl.style.borderTopColor = balance >= 0 ? '#1F4BA0' : '#ef4444';
        }
    }

    displayTransactions() {
        const transactionList = document.getElementById('transactionList');
        if (!transactionList) return;

        const filteredTransactions = this.getFilteredTransactions();

        if (filteredTransactions.length === 0) {
            transactionList.innerHTML = `
                <div class="empty-state">
                    <p>📊 Nenhuma transação encontrada</p>
                    <p>Não há registros para o filtro selecionado.</p>
                </div>
            `;
            return;
        }

        filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const iconEdit = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
        const iconTrash = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

        transactionList.innerHTML = filteredTransactions.map(transaction => {
            const descricao = this.escapeHtml(transaction.description);
            const entrada = transaction.type === 'income';
            return `
            <div class="transaction-item ${transaction.type}">
                <div class="tx-icon" aria-hidden="true">${entrada ? '↑' : '↓'}</div>
                <div class="transaction-info">
                    <h4>${descricao}</h4>
                    <p>${this.escapeHtml(this.formatCategory(transaction.category))} • ${this.formatDate(transaction.date)}</p>
                </div>
                <div class="tx-side">
                    <span class="transaction-amount ${transaction.type}">
                        ${entrada ? '+' : '-'} ${this.formatCurrency(Number(transaction.amount))}
                    </span>
                    <div class="tx-actions">
                        <button type="button" class="tx-btn tx-edit" onclick="financeManager.editTransaction(${Number(transaction.id)})" aria-label="Editar transação ${descricao}" title="Editar">${iconEdit}<span>Editar</span></button>
                        <button type="button" class="tx-btn tx-delete delete-btn" onclick="financeManager.deleteTransaction(${Number(transaction.id)})" aria-label="Excluir transação ${descricao}" title="Excluir">${iconTrash}<span>Excluir</span></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    updateChart() {
        if(typeof Chart === "undefined")return;
        const filtered = this.getFilteredTransactions();
        const categoryTotals = {};

        filtered.forEach(t => {
            if (!categoryTotals[t.category]) categoryTotals[t.category] = { income: 0, expense: 0 };
            if (t.type === 'income') categoryTotals[t.category].income += Number(t.amount);
            else categoryTotals[t.category].expense += Number(t.amount);
        });

        const categoryDescriptions = {};
        filtered.forEach(t => {
            if (!categoryDescriptions[t.category]) categoryDescriptions[t.category] = [];
            categoryDescriptions[t.category].push(`${t.description} (${this.formatDate(t.date)})`);
        });

        const sortedCategories = Object.keys(categoryTotals).sort((a, b) => {
            const totalA = categoryTotals[a].income + categoryTotals[a].expense;
            const totalB = categoryTotals[b].income + categoryTotals[b].expense;
            return totalB - totalA;
        });

        const descriptionsByLabel = {};
        sortedCategories.forEach((cat, i) => {
            descriptionsByLabel[i] = categoryDescriptions[cat] || [];
        });

        const labels = sortedCategories.map(c => this.formatCategory(c));
        const incomeData = sortedCategories.map(c => categoryTotals[c].income);
        const expenseData = sortedCategories.map(c => categoryTotals[c].expense);

        if (this._chart) {
            this._chart.destroy();
            this._chart = null;
        }

        const container = document.querySelector('.chart-container');
        const canvas = document.getElementById('categoryChart');

        if (!container || !canvas) return;

        if (labels.length === 0) {
            container.style.height = '320px';
            container.innerHTML = `
                <div class="chart-empty-state">
                    <div class="chart-empty-icon">📊</div>
                    <h3>Nenhuma transação para exibir</h3>
                    <p>Adicione receitas ou despesas para visualizar gráficos e análises por categoria.</p>
                </div>
            `;
            return;
        }

        if (!document.getElementById('categoryChart')) {
            container.innerHTML = '<canvas id="categoryChart"></canvas>';
        }
        const canvasNovo = document.getElementById('categoryChart');

        container.style.height = Math.max(300, labels.length * 44 + 80) + 'px';
        container.style.position = 'relative';

        const formatBRL = (v) =>
            'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        this._chart = new Chart(canvasNovo, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Receitas',
                        data: incomeData,
                        backgroundColor: 'rgba(34, 197, 94, 0.80)',
                        borderColor: '#16a34a',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        borderSkipped: false,
                        barPercentage: 0.45,
                        categoryPercentage: 0.85,
                    },
                    {
                        label: 'Despesas',
                        data: expenseData,
                        backgroundColor: 'rgba(239, 68, 68, 0.80)',
                        borderColor: '#dc2626',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        borderSkipped: false,
                        barPercentage: 0.45,
                        categoryPercentage: 0.85,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => items[0].label,
                            label: (ctx) => ` ${ctx.dataset.label}: ${this.formatCurrency(ctx.parsed.x)}`,
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                const descs = descriptionsByLabel[idx];
                                if (!descs || descs.length === 0) return [];
                                return ['', ' Transações:', ...descs.slice(0, 5).map(d => `  · ${d}`)];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        stacked: true,
                        grid: { display: false }
                    },
                    x: {
                        stacked: true,
                        ticks: {
                            callback: (value) => formatBRL(value)
                        }
                    }
                }
            }
        });
    }

    async loadTransactions() {
        try {
            const response = await fetch('/api/transacoes', {
                credentials: 'include'
            });
            const raw = await response.text();

            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                throw new Error('Resposta inválida do servidor: ' + raw);
            }

            if (result.status === 'success') {
                this.transactions = result.transactions || [];
            } else {
                this.transactions = [];
                console.warn(result.message || 'Nenhuma transação carregada.');
            }
        } catch (error) {
            console.error('Erro ao carregar transações:', error);
            this.transactions = [];
        }
    }

    populateMonthFilter() {
        const filterMonth = document.getElementById('filterMonth');
        const reportMonth = document.getElementById('reportMonth');

        if (!filterMonth) return;

        const currentValue = filterMonth.value;

        const months = [...new Set(
            this.transactions.map(t => String(t.date).slice(0, 7))
        )].sort().reverse();

        filterMonth.innerHTML = `<option value="all">Todos os meses</option>`;

        months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = this.formatMonthYear(month);
            filterMonth.appendChild(option);
        });

        if (months.includes(currentValue)) {
            filterMonth.value = currentValue;
        }

        if (reportMonth && months.length > 0 && !reportMonth.value) {
            reportMonth.value = months[0];
        }
    }

    getTransactionsByMonth(month) {
        if (!month || month === 'all') {
            return [...this.transactions];
        }

        return this.transactions.filter(t => String(t.date).slice(0, 7) === month);
    }

    formatMonthYear(monthString) {
        const [year, month] = monthString.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);

        return date.toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric'
        });
    }

    getLargestValue(transactions, type) {
        const values = transactions
            .filter(t => t.type === type)
            .map(t => Number(t.amount));

        return values.length ? Math.max(...values) : 0;
    }

    drawSummaryCard(doc, x, y, w, h, title, value, color) {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(x, y, w, h, 3, 3, 'FD');

        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(x, y, w, 5, 'F');

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(10);
        doc.text(title, x + 3, y + 11);

        doc.setTextColor(20, 20, 20);
        doc.setFontSize(11);
        doc.text(String(value), x + 3, y + 18);
    }

    createIncomeExpenseChart(income, expenses) {
        const canvas = document.createElement('canvas');
        canvas.width = 700;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#222';
        ctx.font = '22px Arial';
        ctx.fillText('Receitas x Despesas', 20, 30);

        const maxValue = Math.max(income, expenses, 1);
        const baseY = 320;
        const maxBarHeight = 200;
        const barWidth = 140;

        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(80, 60);
        ctx.lineTo(80, baseY);
        ctx.lineTo(620, baseY);
        ctx.stroke();

        const incomeHeight = (income / maxValue) * maxBarHeight;
        const expenseHeight = (expenses / maxValue) * maxBarHeight;

        ctx.fillStyle = '#48bb78';
        ctx.fillRect(160, baseY - incomeHeight, barWidth, incomeHeight);

        ctx.fillStyle = '#e53e3e';
        ctx.fillRect(380, baseY - expenseHeight, barWidth, expenseHeight);

        ctx.fillStyle = '#222';
        ctx.font = '18px Arial';
        ctx.fillText('Receitas', 175, 350);
        ctx.fillText('Despesas', 390, 350);

        ctx.font = '16px Arial';
        ctx.fillText(this.formatCurrency(income), 145, baseY - incomeHeight - 12);
        ctx.fillText(this.formatCurrency(expenses), 365, baseY - expenseHeight - 12);

        return canvas.toDataURL('image/png');
    }

    createCategoryPieChart(transactions) {
        const canvas = document.createElement('canvas');
        canvas.width = 700;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const categoryTotals = {};
        transactions.forEach(t => {
            if (!categoryTotals[t.category]) {
                categoryTotals[t.category] = 0;
            }
            categoryTotals[t.category] += Number(t.amount);
        });

        const entries = Object.entries(categoryTotals);

        ctx.fillStyle = '#222';
        ctx.font = '22px Arial';
        ctx.fillText('Distribuição por Categoria', 20, 30);

        if (entries.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '18px Arial';
            ctx.fillText('Sem dados para exibir', 240, 200);
            return canvas.toDataURL('image/png');
        }

        const total = entries.reduce((sum, [, value]) => sum + value, 0);
        let startAngle = 0;

        const colors = [
            '#4facfe', '#00c49f', '#ffbb28', '#ff8042', '#a78bfa',
            '#34d399', '#f87171', '#facc15', '#60a5fa', '#c084fc'
        ];

        entries.forEach(([category, value], index) => {
            const sliceAngle = (value / total) * Math.PI * 2;

            ctx.beginPath();
            ctx.moveTo(220, 210);
            ctx.arc(220, 210, 110, startAngle, startAngle + sliceAngle);
            ctx.closePath();

            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();

            startAngle += sliceAngle;
        });

        ctx.font = '14px Arial';
        entries.forEach(([category, value], index) => {
            const legendY = 80 + (index * 26);

            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(400, legendY - 12, 14, 14);

            ctx.fillStyle = '#222';
            const percentage = ((value / total) * 100).toFixed(1);
            ctx.fillText(`${this.formatCategory(category)} (${percentage}%)`, 425, legendY);
        });

        return canvas.toDataURL('image/png');
    }

    createDailyEvolutionChart(transactions, reportMonth) {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 350;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#222';
        ctx.font = '22px Arial';
        ctx.fillText('Evolução Diária', 20, 30);

        const [year, month] = reportMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();

        const dailyIncome = new Array(daysInMonth).fill(0);
        const dailyExpense = new Array(daysInMonth).fill(0);

        transactions.forEach(t => {
            const date = new Date(`${t.date}T00:00:00`);
            const day = date.getDate() - 1;

            if (t.type === 'income') {
                dailyIncome[day] += Number(t.amount);
            } else {
                dailyExpense[day] += Number(t.amount);
            }
        });

        const maxValue = Math.max(...dailyIncome, ...dailyExpense, 1);

        const chartX = 60;
        const chartY = 280;
        const chartWidth = 760;
        const chartHeight = 180;

        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(chartX, 60);
        ctx.lineTo(chartX, chartY);
        ctx.lineTo(chartX + chartWidth, chartY);
        ctx.stroke();

        const drawLine = (data, color) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;

            data.forEach((value, i) => {
                const x = chartX + (i / (daysInMonth - 1 || 1)) * chartWidth;
                const y = chartY - (value / maxValue) * chartHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        };

        drawLine(dailyIncome, '#48bb78');
        drawLine(dailyExpense, '#e53e3e');

        ctx.fillStyle = '#48bb78';
        ctx.fillRect(640, 20, 15, 15);
        ctx.fillStyle = '#222';
        ctx.font = '14px Arial';
        ctx.fillText('Receitas', 662, 32);

        ctx.fillStyle = '#e53e3e';
        ctx.fillRect(740, 20, 15, 15);
        ctx.fillStyle = '#222';
        ctx.fillText('Despesas', 762, 32);

        ctx.font = '10px Arial';
        ctx.fillStyle = '#444';
        for (let i = 0; i < daysInMonth; i += Math.ceil(daysInMonth / 8)) {
            const x = chartX + (i / (daysInMonth - 1 || 1)) * chartWidth;
            ctx.fillText(String(i + 1), x, chartY + 15);
        }

        return canvas.toDataURL('image/png');
    }

    async generatePdfReport() {
        const reportMonth = document.getElementById('reportMonth')?.value;

        if (!reportMonth) {
            this.showErrorMessage('Selecione um mês para gerar o relatório.');
            return;
        }

        const transactions = this.getTransactionsByMonth(reportMonth);

        if (transactions.length === 0) {
            this.showErrorMessage(`Nenhuma transação encontrada em ${this.formatMonthYear(reportMonth)}. O relatório não foi gerado.`);
            return;
        }

        try {
            let username = "Usuário";

            try {
                const responseUser = await fetch('/api/perfil', {
                    credentials: 'include'
                });

                const resultUser = await responseUser.json();

                if (resultUser.status === "success") {
                    username = resultUser.dados?.nome || resultUser.nome || "Usuário";
                }
            } catch (error) {
                console.warn("Não foi possível carregar nome do usuário para o relatório:", error);
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 14;
            const contentW = pageW - margin * 2;

            const generatedAt = new Date().toLocaleString('pt-BR');
            const monthLabel = this.formatMonthYear(reportMonth);

            const income = transactions
                .filter(t => t.type === 'income')
                .reduce((sum, t) => sum + Math.round(Number(t.amount)*100), 0)/100;

            const expenses = transactions
                .filter(t => t.type === 'expense')
                .reduce((sum, t) => sum + Math.round(Number(t.amount)*100), 0)/100;

            const balance = Math.round(income*100-expenses*100)/100;
            const savingsRate = income > 0 ? (balance / income) * 100 : 0;
            const expenseRate = income > 0 ? (expenses / income) * 100 : 0;

            const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

            const categoryTotals = {};
            transactions.forEach(t => {
                if (!categoryTotals[t.category]) {
                    categoryTotals[t.category] = { income: 0, expense: 0, total: 0 };
                }

                const value = Number(t.amount);
                categoryTotals[t.category][t.type === 'income' ? 'income' : 'expense'] += value;
                categoryTotals[t.category].total += value;
            });

            const topCategories = Object.entries(categoryTotals)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 6);

            const biggestIncome = this.getLargestValue(transactions, 'income');
            const biggestExpense = this.getLargestValue(transactions, 'expense');

            const setText = (color = [15, 23, 42]) => doc.setTextColor(color[0], color[1], color[2]);
            const setFill = (color) => doc.setFillColor(color[0], color[1], color[2]);
            const setDraw = (color) => doc.setDrawColor(color[0], color[1], color[2]);

            let y = 53;

            const money = (value) => this.formatCurrency(Number(value || 0));

            const percent = (value) => `${Number(value || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            })}%`;

            const checkPage = (neededHeight) => {
                if (y + neededHeight > pageH - 18) {
                    doc.addPage();
                    y = 18;
                }
            };

            const addFooter = () => {
                const totalPages = doc.internal.getNumberOfPages();

                for (let p = 1; p <= totalPages; p++) {
                    doc.setPage(p);
                    setDraw([226, 232, 240]);
                    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    setText([100, 116, 139]);
                    doc.text(`CashFlow • Relatório financeiro • Página ${p} de ${totalPages}`, margin, pageH - 7);
                    doc.text(`Gerado em ${generatedAt}`, pageW - margin, pageH - 7, { align: 'right' });
                }
            };

            const drawHeader = () => {
                setFill([15, 23, 42]);
                doc.rect(0, 0, pageW, 43, 'F');

                setFill([37, 99, 235]);
                doc.roundedRect(margin, 11, 14, 14, 3, 3, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                setText([255, 255, 255]);
                doc.text('CF', margin + 7, 20, { align: 'center' });

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.text('Relatório Financeiro Mensal', margin + 20, 17);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                setText([203, 213, 225]);
                doc.text(`Usuário: ${username}`, margin + 20, 25);
                doc.text(`Período: ${monthLabel}`, margin + 20, 31);

                setFill([30, 41, 59]);
                doc.roundedRect(pageW - margin - 48, 12, 48, 18, 4, 4, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                setText([226, 232, 240]);
                doc.text('SALDO DO MÊS', pageW - margin - 24, 18, { align: 'center' });

                doc.setFontSize(10);
                setText(balance >= 0 ? [134, 239, 172] : [252, 165, 165]);
                doc.text(money(balance), pageW - margin - 24, 26, { align: 'center' });
            };

            const drawKpiCard = (x, yCard, w, h, title, value, subtitle, color) => {
                setFill([248, 250, 252]);
                setDraw([226, 232, 240]);
                doc.roundedRect(x, yCard, w, h, 4, 4, 'FD');

                setFill(color);
                doc.roundedRect(x, yCard, w, 3.2, 2, 2, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                setText([100, 116, 139]);
                doc.text(title, x + 4, yCard + 10);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                setText([15, 23, 42]);
                doc.text(String(value), x + 4, yCard + 18);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.4);
                setText([100, 116, 139]);
                doc.text(String(subtitle), x + 4, yCard + 25);
            };

            const drawProgress = (x, yBar, w, label, value, color) => {
                const safeValue = Math.max(0, Math.min(100, Number(value || 0)));

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                setText([51, 65, 85]);
                doc.text(label, x, yBar);

                doc.setFont('helvetica', 'normal');
                setText([100, 116, 139]);
                doc.text(percent(value), x + w, yBar, { align: 'right' });

                setFill([226, 232, 240]);
                doc.roundedRect(x, yBar + 3, w, 5, 2.5, 2.5, 'F');

                setFill(color);
                doc.roundedRect(x, yBar + 3, w * safeValue / 100, 5, 2.5, 2.5, 'F');
            };

            const drawIncomeExpenseChart = (x, yChart, w, h) => {
                const max = Math.max(income, expenses, 1);
                const barW = 22;
                const base = yChart + h - 16;
                const maxH = h - 32;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                setText([15, 23, 42]);
                doc.text('Receitas x Despesas', x, yChart);

                setDraw([226, 232, 240]);
                doc.line(x, base, x + w, base);

                const drawBar = (barX, value, color, label) => {
                    const barH = (Number(value) / max) * maxH;
                    setFill(color);
                    doc.roundedRect(barX, base - barH, barW, barH, 3, 3, 'F');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    setText([15, 23, 42]);
                    doc.text(money(value), barX + barW / 2, base - barH - 3, { align: 'center' });

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    setText([100, 116, 139]);
                    doc.text(label, barX + barW / 2, base + 6, { align: 'center' });
                };

                drawBar(x + 26, income, [34, 197, 94], 'Receitas');
                drawBar(x + 76, expenses, [239, 68, 68], 'Despesas');
            };

            const drawCategoryRanking = (x, yRank, w) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                setText([15, 23, 42]);
                doc.text('Top categorias', x, yRank);

                const max = Math.max(...topCategories.map(([, data]) => data.total), 1);
                let localY = yRank + 8;

                if (topCategories.length === 0) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    setText([100, 116, 139]);
                    doc.text('Sem categorias para exibir.', x, localY);
                    return;
                }

                topCategories.forEach(([cat, data]) => {
                    const total = data.total;
                    const barW = (total / max) * (w - 40);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    setText([51, 65, 85]);
                    doc.text(this.formatCategory(cat), x, localY);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    setText([15, 23, 42]);
                    doc.text(money(total), x + w, localY, { align: 'right' });

                    setFill([226, 232, 240]);
                    doc.roundedRect(x, localY + 3, w, 4.2, 2, 2, 'F');

                    const color = data.expense > data.income ? [239, 68, 68] : [34, 197, 94];
                    setFill(color);
                    doc.roundedRect(x, localY + 3, barW, 4.2, 2, 2, 'F');

                    localY += 12;
                });
            };

            const drawInsights = (x, yInsight, w) => {
                const insights = [];

                if (balance >= 0) {
                    insights.push(`Seu saldo fechou positivo em ${money(balance)}.`);
                } else {
                    insights.push(`Seu saldo fechou negativo em ${money(Math.abs(balance))}.`);
                }

                if (income > 0) {
                    insights.push(`As despesas consumiram ${percent(expenseRate)} das receitas.`);
                }

                if (savingsRate >= 20) {
                    insights.push('Excelente: sua margem de economia ficou acima de 20%.');
                } else if (savingsRate >= 0) {
                    insights.push('Atenção: tente ampliar sua margem de economia mensal.');
                } else {
                    insights.push('Prioridade: revisar despesas para recuperar saldo positivo.');
                }

                if (topCategories[0]) {
                    insights.push(`Categoria com maior impacto: ${this.formatCategory(topCategories[0][0])}.`);
                }

                setFill([241, 245, 249]);
                setDraw([226, 232, 240]);
                doc.roundedRect(x, yInsight, w, 36, 4, 4, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                setText([15, 23, 42]);
                doc.text('Resumo executivo', x + 5, yInsight + 8);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.2);
                setText([51, 65, 85]);

                let lineY = yInsight + 15;
                insights.slice(0, 4).forEach(item => {
                    const lines = doc.splitTextToSize(`• ${item}`, w - 10);
                    doc.text(lines, x + 5, lineY);
                    lineY += lines.length * 4.4;
                });
            };

            const drawTableHeader = () => {
                setFill([15, 23, 42]);
                doc.roundedRect(margin, y, contentW, 9, 2, 2, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.4);
                setText([255, 255, 255]);

                doc.text('Data', margin + 3, y + 6);
                doc.text('Descrição', margin + 24, y + 6);
                doc.text('Categoria', margin + 88, y + 6);
                doc.text('Tipo', margin + 132, y + 6);
                doc.text('Valor', pageW - margin - 3, y + 6, { align: 'right' });
                y += 9;
            };

            const drawTableRow = (t, index) => {
                const rowH = 9;
                checkPage(rowH + 10);

                if (y < 25) {
                    drawTableHeader();
                }

                setFill(index % 2 === 0 ? [248, 250, 252] : [255, 255, 255]);
                doc.rect(margin, y, contentW, rowH, 'F');

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.3);
                setText([51, 65, 85]);

                const desc = this.escapeHtml(String(t.description || '')).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const shortDesc = desc.length > 34 ? desc.slice(0, 34) + '...' : desc;
                const cat = this.formatCategory(t.category);
                const shortCat = cat.length > 21 ? cat.slice(0, 21) + '...' : cat;

                doc.text(this.formatDate(t.date), margin + 3, y + 6);
                doc.text(shortDesc, margin + 24, y + 6);
                doc.text(shortCat, margin + 88, y + 6);

                setText(t.type === 'income' ? [22, 163, 74] : [220, 38, 38]);
                doc.setFont('helvetica', 'bold');
                doc.text(t.type === 'income' ? 'Receita' : 'Despesa', margin + 132, y + 6);
                doc.text(`${t.type === 'income' ? '+' : '-'} ${money(Number(t.amount))}`, pageW - margin - 3, y + 6, { align: 'right' });

                y += rowH;
            };

            drawHeader();

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            setText([15, 23, 42]);
            doc.text('Indicadores principais', margin, y);
            y += 6;

            const gap = 5;
            const cardW = (contentW - gap * 2) / 3;

            drawKpiCard(margin, y, cardW, 29, 'Receitas', money(income), 'Entradas do período', [34, 197, 94]);
            drawKpiCard(margin + cardW + gap, y, cardW, 29, 'Despesas', money(expenses), 'Saídas do período', [239, 68, 68]);
            drawKpiCard(margin + (cardW + gap) * 2, y, cardW, 29, 'Saldo', money(balance), balance >= 0 ? 'Resultado positivo' : 'Resultado negativo', balance >= 0 ? [37, 99, 235] : [220, 38, 38]);

            y += 39;

            drawKpiCard(margin, y, cardW, 27, 'Transações', String(transactions.length), 'Lançamentos analisados', [14, 165, 233]);
            drawKpiCard(margin + cardW + gap, y, cardW, 27, 'Maior receita', money(biggestIncome), 'Maior entrada individual', [22, 163, 74]);
            drawKpiCard(margin + (cardW + gap) * 2, y, cardW, 27, 'Maior despesa', money(biggestExpense), 'Maior saída individual', [220, 38, 38]);

            y += 38;

            drawInsights(margin, y, contentW);
            y += 48;

            checkPage(72);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            setText([15, 23, 42]);
            doc.text('Análise visual', margin, y);
            y += 8;

            setFill([255, 255, 255]);
            setDraw([226, 232, 240]);
            doc.roundedRect(margin, y, contentW, 74, 4, 4, 'FD');

            drawIncomeExpenseChart(margin + 7, y + 10, 105, 54);
            drawCategoryRanking(margin + 120, y + 10, contentW - 128);

            y += 86;

            checkPage(38);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            setText([15, 23, 42]);
            doc.text('Saúde financeira', margin, y);
            y += 9;

            drawProgress(margin, y, contentW, 'Comprometimento das receitas com despesas', expenseRate, expenseRate <= 70 ? [34, 197, 94] : expenseRate <= 90 ? [245, 158, 11] : [239, 68, 68]);
            y += 16;
            drawProgress(margin, y, contentW, 'Margem de economia do período', Math.max(0, savingsRate), savingsRate >= 20 ? [34, 197, 94] : savingsRate >= 0 ? [245, 158, 11] : [239, 68, 68]);
            y += 22;

            checkPage(50);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            setText([15, 23, 42]);
            doc.text('Detalhamento das transações', margin, y);
            y += 7;

            drawTableHeader();

            sortedTransactions.forEach((t, index) => {
                drawTableRow(t, index);
            });

            addFooter();

            const pdfName = `relatorio-cashflow-${reportMonth}.pdf`;
            if (window.CashFlowMobile) {
                await window.CashFlowMobile.savePdf(doc, pdfName);
            } else {
                doc.save(pdfName);
            }

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            this.showErrorMessage("Não foi possível gerar o relatório: " + error.message);
        }
    }

    // Erro da calculadora aparece no próprio card, e o resultado anterior some.
    toolError(resultId, message) {
        const result = document.getElementById(resultId);
        if (!result) return;
        result.style.display = 'none';
        let el = result.parentElement.querySelector('.tool-error');
        if (!el) {
            el = document.createElement('p');
            el.className = 'tool-error';
            el.setAttribute('role', 'alert');
            result.insertAdjacentElement('beforebegin', el);
        }
        el.textContent = message;
        el.hidden = !message;
    }

    // Campos de dinheiro das ferramentas usam máscara (R$ 1.234,56); aqui vira Number.
    lerValor(id) {
        const el = document.getElementById(id);
        return window.CashFlowMoney ? window.CashFlowMoney.valor(el) : parseFloat(el?.value);
    }

    calculateSalary() {
        const grossSalary = this.lerValor('grossSalary');
        const dependents = parseInt(document.getElementById('dependents').value) || 0;
        const healthPlan = this.lerValor('healthPlan') || 0;

        if (!grossSalary || grossSalary <= 0) {
            this.toolError('salaryResult', 'Informe um salário bruto maior que zero.');
            return;
        }
        if (dependents < 0 || healthPlan < 0) {
            this.toolError('salaryResult', 'Dependentes e plano de saúde não podem ser negativos.');
            return;
        }

        let result;try { result=window.CashFlowCalculators.salary2026(grossSalary,dependents,healthPlan); } catch(error){this.toolError('salaryResult', error.message);return;}
        this.toolError('salaryResult', '');
        const {inss,irrf,net:netSalary}=result;

        document.getElementById('inssValue').textContent = this.formatCurrency(inss);
        document.getElementById('irrfValue').textContent = this.formatCurrency(irrf);
        document.getElementById('netSalary').textContent = this.formatCurrency(netSalary);
        document.getElementById('salaryResult').style.display = 'block';
    }

    calculateCompoundInterest() {
        const initialAmount = this.lerValor('initialAmount') || 0;
        const monthlyContribution = this.lerValor('monthlyContribution') || 0;
        const interestRate = parseFloat(document.getElementById('interestRate').value) || 0;
        const timePeriod = parseInt(document.getElementById('timePeriod').value) || 0;

        if (initialAmount < 0 || monthlyContribution < 0 || interestRate < 0 || timePeriod <= 0) {
            this.toolError('interestResult', 'Use valores positivos e um período de pelo menos 1 ano.');
            return;
        }
        if (initialAmount === 0 && monthlyContribution === 0) {
            this.toolError('interestResult', 'Informe um valor inicial ou um aporte mensal.');
            return;
        }
        this.toolError('interestResult', '');

        const monthlyRate = Math.pow(1 + interestRate / 100, 1 / 12) - 1;
        const months = timePeriod * 12;

        const futureValue = window.CashFlowCalculators.compound(initialAmount,monthlyContribution,interestRate,months);

        const totalInvested = initialAmount + monthlyContribution * months;
        const interestEarned = futureValue - totalInvested;

        document.getElementById('totalInvested').textContent = this.formatCurrency(totalInvested);
        document.getElementById('interestEarned').textContent = this.formatCurrency(interestEarned);
        document.getElementById('finalAmount').textContent = this.formatCurrency(futureValue);
        document.getElementById('interestResult').style.display = 'block';
    }

    calculateLoan() {
        const loanAmount = this.lerValor('loanAmount') || 0;
        const loanRate = parseFloat(document.getElementById('loanRate').value) || 0;
        const loanPeriod = parseInt(document.getElementById('loanPeriod').value) || 0;

        if (loanAmount <= 0 || loanRate < 0 || loanPeriod <= 0) {
            this.toolError('loanResult', 'Informe o valor do empréstimo, uma taxa a partir de 0% e o prazo em meses.');
            return;
        }
        this.toolError('loanResult', '');

        const monthlyRate = loanRate / 100;
        const monthlyPayment = window.CashFlowCalculators.loan(loanAmount,loanRate,loanPeriod);

        const totalPayment = monthlyPayment * loanPeriod;
        const totalInterest = totalPayment - loanAmount;

        document.getElementById('monthlyPayment').textContent = this.formatCurrency(monthlyPayment);
        document.getElementById('totalPayment').textContent = this.formatCurrency(totalPayment);
        document.getElementById('totalInterest').textContent = this.formatCurrency(totalInterest);
        document.getElementById('loanResult').style.display = 'block';
    }

    convertCurrency() {
        const amount = this.lerValor('amountToConvert') || 0;
        const fromCurrency = document.getElementById('fromCurrency').value;
        const toCurrency = document.getElementById('toCurrency').value;
        const exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || 0;

        if (amount <= 0) {
            this.toolError('currencyResult', 'Informe um valor maior que zero.');
            return;
        }

        let convertedAmount;
        if (fromCurrency === toCurrency) {
            // Mesma moeda: não precisa de cotação.
            convertedAmount = amount;
        } else if (fromCurrency !== 'BRL' && toCurrency !== 'BRL') {
            this.toolError('currencyResult', 'Converta entre Real (BRL) e outra moeda. Para duas moedas estrangeiras, converta primeiro para BRL.');
            return;
        } else if (exchangeRate <= 0) {
            const estrangeira = fromCurrency === 'BRL' ? toCurrency : fromCurrency;
            this.toolError('currencyResult', `Informe a cotação: quantos reais vale 1 ${estrangeira}.`);
            return;
        } else {
            convertedAmount = fromCurrency === 'BRL' ? amount / exchangeRate : amount * exchangeRate;
        }
        this.toolError('currencyResult', '');

        document.getElementById('convertedAmount').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: toCurrency }).format(convertedAmount);
        document.getElementById('currencyResult').style.display = 'block';
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(amount);
    }

    formatDate(dateString) {
        return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
    }

    formatCategory(category) {
        const categoryNames = {
            'salario': 'Salário',
            'freelance': 'Freelance',
            'investimentos': 'Investimentos',
            'outros-receitas': 'Outras receitas',
            'alimentacao': 'Alimentação',
            'transporte': 'Transporte',
            'moradia': 'Moradia',
            'saude': 'Saúde',
            'educacao': 'Educação',
            'lazer': 'Lazer',
            'outros-despesas': 'Outras despesas'
        };
        return categoryNames[category] || category;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatarPercentual(valor) {
        return Number(valor).toFixed(2).replace(".", ",") + "%";
    }

    formatarCnpjBase(cnpj) {
        const somenteDigitos = String(cnpj || "").replace(/\D/g, "");
        const base = somenteDigitos.slice(0, 8).padStart(8, "0");
        return base.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");
    }

    formatarPeriodo(item) {
        // A API traz "Out-2026" e "2026-10"; mostra só uma vez: "out/2026".
        const anoMes = String(item.AnoMes || item.anoMes || '');
        const m = anoMes.match(/^(\d{4})-(\d{2})/);
        if (m) {
            const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
            return `${nomes[Number(m[2]) - 1] || m[2]}/${m[1]}`;
        }
        if (item.Mes) {
            return String(item.Mes);
        }
        if (item.Periodo) {
            return item.Periodo;
        }
        if (item.anoMes) {
            return String(item.anoMes);
        }
        return '--';
    }

    normalizarRegistroJuros(item) {
        return {
            InstituicaoFinanceira: item.InstituicaoFinanceira || item.instituicaoFinanceira || "Instituição não informada",
            Modalidade: item.Modalidade || item.modalidade || item.ModalidadeCredito || "Modalidade não informada",
            Mes: item.Mes || item.mes || "",
            AnoMes: item.AnoMes || item.anoMes || item.Periodo || "",
            CNPJ8: item.CNPJ8 || item.cnpj8 || item.CNPJ || item.cnpj || "",
            TaxaJurosAoMes: Number(item.TaxaJurosAoMes || item.taxaJurosAoMes || 0),
            TaxaJurosAoAno: Number(item.TaxaJurosAoAno || item.taxaJurosAoAno || 0)
        };
    }

    atualizarStatusJuros(tipo, mensagem) {
        const statusEl = document.getElementById("bcbStatus");
        if (!statusEl) return;

        statusEl.className = `bcb-status ${tipo}`;
        statusEl.innerHTML = mensagem;
        statusEl.style.display = "flex";
    }

    mostrarAreaJuros() {
        const cards = document.getElementById("bcbCards");
        const filters = document.getElementById("bcbFilters");
        const lista = document.getElementById("bcbLista");

        if (cards) cards.style.display = "grid";
        if (filters) filters.style.display = "grid";
        if (lista) lista.style.display = "block";
    }

    // Os filtros (mês de referência) continuam visíveis: dá para trocar o mês
    // enquanto carrega ou depois de um erro.
    esconderAreaJuros() {
        const cards = document.getElementById("bcbCards");
        const filters = document.getElementById("bcbFilters");
        const lista = document.getElementById("bcbLista");

        if (cards) cards.style.display = "none";
        if (filters) filters.style.display = "grid";
        if (lista) lista.style.display = "none";
    }

    renderizarCardsJuros(lista) {
        const elMenorTaxa = document.getElementById("bcbMenorTaxa");
        const elMenorBanco = document.getElementById("bcbMenorBanco");
        const elMaiorTaxa = document.getElementById("bcbMaiorTaxa");
        const elMaiorBanco = document.getElementById("bcbMaiorBanco");
        const elMediaTaxa = document.getElementById("bcbMediaTaxa");
        const elTotal = document.getElementById("bcbTotalRegistros");

        if (!elMenorTaxa || !elMenorBanco || !elMaiorTaxa || !elMaiorBanco || !elMediaTaxa || !elTotal) return;

        elTotal.textContent = `${lista.length} registros`;
        // Taxa 0,00% é dado não informado pelo banco: não entra em menor/maior/média.
        lista = lista.filter(item => Number(item.TaxaJurosAoAno) > 0);

        if (!lista.length) {
            elMenorTaxa.textContent = "--";
            elMenorBanco.textContent = "--";
            elMaiorTaxa.textContent = "--";
            elMaiorBanco.textContent = "--";
            elMediaTaxa.textContent = "--";
            return;
        }

        const menor = lista.reduce((a, b) => a.TaxaJurosAoAno < b.TaxaJurosAoAno ? a : b);
        const maior = lista.reduce((a, b) => a.TaxaJurosAoAno > b.TaxaJurosAoAno ? a : b);
        const media = lista.reduce((acc, item) => acc + Number(item.TaxaJurosAoAno), 0) / lista.length;

        elMenorTaxa.textContent = this.formatarPercentual(menor.TaxaJurosAoAno);
        elMenorBanco.textContent = `${menor.InstituicaoFinanceira} • ${this.formatarPeriodo(menor)}`;

        elMaiorTaxa.textContent = this.formatarPercentual(maior.TaxaJurosAoAno);
        elMaiorBanco.textContent = `${maior.InstituicaoFinanceira} • ${this.formatarPeriodo(maior)}`;

        elMediaTaxa.textContent = this.formatarPercentual(media);
    }

    renderizarListaJuros(lista) {
        const container = document.getElementById("bcbLista");
        if (!container) return;

        if (!lista.length) {
            container.innerHTML = `<div class="empty-state"><p>Nenhum resultado encontrado.</p></div>`;
            return;
        }

        container.innerHTML = lista.map(item => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <h4>${this.escapeHtml(item.InstituicaoFinanceira)}</h4>
                    <p>
                        ${this.escapeHtml(item.Modalidade)} • ${this.escapeHtml(this.formatarPeriodo(item))}
                        ${item.CNPJ8 ? `• CNPJ base: ${this.formatarCnpjBase(item.CNPJ8)}` : ''}
                    </p>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                    ${Number(item.TaxaJurosAoAno) > 0
                        ? `<span class="transaction-amount income">${this.formatarPercentual(item.TaxaJurosAoAno)}</span>
                    <small>${this.formatarPercentual(item.TaxaJurosAoMes)} ao mês</small>`
                        : `<span class="transaction-amount">Não informada</span>
                    <small>taxa não divulgada pelo banco</small>`}
                </div>
            </div>
        `).join('');
    }

    aplicarFiltrosJuros() {
        const termo = document.getElementById("bcbBusca")?.value.toLowerCase().trim() || "";
        const ordenacao = document.getElementById("bcbOrdenacao")?.value || "asc";

        let lista = this.dadosJuros.filter(item => {
            const instituicao = String(item.InstituicaoFinanceira || "").toLowerCase();
            const modalidade = String(item.Modalidade || "").toLowerCase();
            const periodo = String(this.formatarPeriodo(item) || "").toLowerCase();
            const cnpj = String(item.CNPJ8 || "").toLowerCase();

            return (
                instituicao.includes(termo) ||
                modalidade.includes(termo) ||
                periodo.includes(termo) ||
                cnpj.includes(termo)
            );
        });

        lista.sort((a, b) => {
            // Sem taxa informada vai para o fim da lista.
            const semA = !(Number(a.TaxaJurosAoAno) > 0), semB = !(Number(b.TaxaJurosAoAno) > 0);
            if (semA !== semB) return semA ? 1 : -1;
            return ordenacao === "asc"
                ? a.TaxaJurosAoAno - b.TaxaJurosAoAno
                : b.TaxaJurosAoAno - a.TaxaJurosAoAno;
        });

        this.renderizarCardsJuros(lista);
        this.renderizarListaJuros(lista);
    }

    registrarEventosJuros() {
        if (this.bcbEventosRegistrados) return;

        document.getElementById("bcbBusca")?.addEventListener("input", () => this.aplicarFiltrosJuros());
        document.getElementById("bcbOrdenacao")?.addEventListener("change", () => this.aplicarFiltrosJuros());

        this.bcbEventosRegistrados = true;
    }

    async carregarDadosJuros() {
        const pedido = document.getElementById("bcbPeriod")?.value || "";
        this.bcbPedido = pedido;
        const nomePedido = /^\d{4}-\d{2}$/.test(pedido)
            ? new Date(Number(pedido.slice(0, 4)), Number(pedido.slice(5, 7)) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
            : "";
        this.atualizarStatusJuros("bcb-loading", `<span class="bcb-spinner"></span> Carregando taxas do Banco Central${nomePedido ? " de " + nomePedido : ""}...`);
        this.esconderAreaJuros();

        try {
            const response = await fetch(this.apiJuros + "?mes=" + encodeURIComponent(pedido), {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });

            const json = await response.json().catch(() => ({}));
            // Se a pessoa trocou de mês no meio do caminho, só vale a última consulta.
            if (this.bcbPedido !== pedido) return;

            if (!response.ok) {
                throw new Error(json.message || `Erro HTTP ${response.status}`);
            }

            this.dadosJuros = (json.value || [])
                .map(item => this.normalizarRegistroJuros(item))
                .filter(item => item.InstituicaoFinanceira && !Number.isNaN(item.TaxaJurosAoAno));

            this.registrarEventosJuros();

            if (!this.dadosJuros.length) {
                this.atualizarStatusJuros("bcb-error", `Nenhum dado de taxa foi retornado pela API.`);
                return;
            }

            this.mostrarAreaJuros();
            this.aplicarFiltrosJuros();
            const nomeMes = (anoMes) => {
                const m = /^(\d{4})-?(\d{2})$/.exec(String(anoMes || ""));
                return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : String(anoMes || "");
            };
            const avisoMes = json.mes && json.mes_solicitado && json.mes !== json.mes_solicitado
                ? `O Banco Central ainda não publicou ${nomeMes(json.mes_solicitado)}. Exibindo ${nomeMes(json.mes)}, o mês mais recente disponível.`
                : (json.mes ? `Dados de ${nomeMes(json.mes)}.` : "");
            this.atualizarStatusJuros("bcb-success", cashflowEscape(avisoMes + (json.desatualizado ? " (cópia salva; o BCB não respondeu agora)" : "")));
            this.bcbJaCarregado = true;

        } catch (erro) {
            if (this.bcbPedido !== pedido) return;
            console.error("Erro ao carregar juros:", erro);
            this.atualizarStatusJuros(
                "bcb-error",
                `<span>${cashflowEscape(erro.message && !/^Erro HTTP|Failed to fetch|NetworkError/i.test(erro.message)
                    ? erro.message
                    : "Não foi possível carregar as taxas agora. Verifique sua conexão.")}</span>` +
                ` <button type="button" class="bcb-retry">Tentar novamente</button>`
            );
            document.querySelector("#bcbStatus .bcb-retry")?.addEventListener("click", () => {
                this.bcbJaCarregado = false;
                this.carregarDadosJuros();
            });
            this.esconderAreaJuros();
        }
    }
}



// Inicialização corrigida: usuário, dropdown e CashFlow
async function loadUserName() {
    try {
        const response = await fetch('/api/perfil', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store'
        });

        const raw = await response.text();
        let result;

        try {
            result = JSON.parse(raw);
        } catch (error) {
            console.error('perfil.php não retornou JSON:', raw);
            throw new Error('Resposta inválida do perfil.php');
        }

        if (result.status === "success") {
            const userNameElement = document.getElementById("userName");
            if (userNameElement) {
                userNameElement.textContent = result.dados?.nome || result.nome || "Usuário";
                userNameElement.href = "../CashFlow_Tela_Perfil/perfil.html";
            }
            return;
        }

        console.warn("Usuário não autenticado:", result.message || result);
    } catch (error) {
        console.error("Erro ao carregar usuário:", error);
    }
}

function initUserDropdown() {
    const userIcon = document.getElementById("userIcon");
    const userDropdown = document.getElementById("userDropdown");

    if (!userIcon || !userDropdown) return;

    userDropdown.style.display = "none";

    userIcon.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        userDropdown.style.display =
            userDropdown.style.display === "block" ? "none" : "block";
    });

    userDropdown.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        userDropdown.style.display = "none";
    });
}

function initCashFlowMelhorias() {
    // O CashBot é controlado por initCashBotAnimated (mais abaixo). A versão antiga
    // daqui chamava uma função inexistente (getCashBotResposta) a cada Enter.
}

function initResumoClicavelEAlertas() {
    const aplicarFiltro = (tipo) => {
        if (!window.financeManager) return;

        const filterType = document.getElementById("filterType");
        const transactionList = document.getElementById("transactionList");

        if (filterType) {
            filterType.value = tipo;
            window.financeManager.filterTransactions();
        }

        transactionList?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    document.querySelector(".income-card")?.addEventListener("click", () => aplicarFiltro("income"));
    document.querySelector(".expense-card")?.addEventListener("click", () => aplicarFiltro("expense"));

    setTimeout(() => {
        if (!window.financeManager || !Array.isArray(window.financeManager.transactions)) return;

        const receitas = window.financeManager.transactions
            .filter(t => t.type === "income")
            .reduce((total, t) => total + Math.round(Number(t.amount)*100), 0)/100;

        const despesas = window.financeManager.transactions
            .filter(t => t.type === "expense")
            .reduce((total, t) => total + Math.round(Number(t.amount)*100), 0)/100;

        if (receitas > 0 && despesas / receitas >= 0.8) {
            const alerta = document.getElementById("expenseAlert");
            alerta?.classList.add("show-alert");

            setTimeout(() => {
                alerta?.classList.remove("show-alert");
            }, 7000);
        }
    }, 1300);
}

document.addEventListener("DOMContentLoaded", async () => {
    initUserDropdown();
    initThemePanel();
    initCashFlowMelhorias();

    await loadUserName();

    window.financeManager = new FinanceManager();

    setTimeout(initResumoClicavelEAlertas, 500);
});


/* Tema, modo claro/escuro e controle total de contraste */
function initThemePanel() {
    const root = document.documentElement;
    const body = document.body;

    const panelToggle = document.getElementById("themePanelToggle");
    const panel = document.getElementById("themePanel");
    const closePanel = document.getElementById("closeThemePanel");

    const themeMode = document.getElementById("themeMode");
    const contrastLevel = document.getElementById("contrastLevel");
    const contrastValue = document.getElementById("contrastValue");
    const brightnessLevel = document.getElementById("brightnessLevel");
    const brightnessValue = document.getElementById("brightnessValue");
    const fontScale = document.getElementById("fontScale");
    const fontScaleValue = document.getElementById("fontScaleValue");

    const highContrastPreset = document.getElementById("highContrastPreset");
    const resetThemeSettings = document.getElementById("resetThemeSettings");

    const defaults = {
        theme: "auto",
        contrast: 100,
        brightness: 100,
        fontScale: 100
    };

    const getSavedSettings = () => {
        try {
            return JSON.parse(localStorage.getItem("cashflowThemeSettings")) || defaults;
        } catch {
            return defaults;
        }
    };

    const saveSettings = (settings) => {
        localStorage.setItem("cashflowThemeSettings", JSON.stringify(settings));
        clearTimeout(window.cashflowPreferenceTimer);
        window.cashflowPreferenceTimer = setTimeout(async () => {
            try {
                const preferencias = {...(window.cashflowPreferences || {}), ...settings};
                await window.cashflowRequest('/api/perfil', {preferencias});
                window.cashflowPreferences = preferencias;
            } catch (error) { console.warn('Preferências não salvas:', error); }
        }, 500);
    };

    const applySettings = (settings) => {
        body.classList.remove("theme-light", "theme-dark");

        if (settings.theme === "light") {
            body.classList.add("theme-light");
        } else if (settings.theme === "dark") {
            body.classList.add("theme-dark");
        } else {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            body.classList.add(prefersDark ? "theme-dark" : "theme-light");
        }

        root.style.setProperty("--user-contrast", `${settings.contrast}%`);
        root.style.setProperty("--user-brightness", `${settings.brightness}%`);
        root.style.setProperty("--user-font-scale", `${settings.fontScale}%`);

        // O filtro fica no <html>: no <body> ele quebraria os botões fixos
        // (Aparência, Ajuda), que passariam a rolar junto com a página.
        body.style.filter = "";
        root.style.filter = (Number(settings.contrast) === 100 && Number(settings.brightness) === 100)
            ? ""
            : `contrast(${settings.contrast}%) brightness(${settings.brightness}%)`;
        body.style.fontSize = `${settings.fontScale}%`;

        if (themeMode) themeMode.value = settings.theme === "system" ? "auto" : settings.theme;
        if (contrastLevel) contrastLevel.value = settings.contrast;
        if (contrastValue) contrastValue.textContent = `${settings.contrast}%`;
        if (brightnessLevel) brightnessLevel.value = settings.brightness;
        if (brightnessValue) brightnessValue.textContent = `${settings.brightness}%`;
        if (fontScale) fontScale.value = settings.fontScale;
        if (fontScaleValue) fontScaleValue.textContent = `${settings.fontScale}%`;
    };

    let settings = {
        ...defaults,
        ...getSavedSettings()
    };

    applySettings(settings);

    panelToggle?.addEventListener("click", () => {
        panel?.classList.toggle("hidden-theme-panel");
    });

    closePanel?.addEventListener("click", () => {
        panel?.classList.add("hidden-theme-panel");
    });

    document.addEventListener("click", (event) => {
        if (!panel || !panelToggle) return;

        const clickedInsidePanel = panel.contains(event.target);
        const clickedToggle = panelToggle.contains(event.target);

        if (!clickedInsidePanel && !clickedToggle) {
            panel.classList.add("hidden-theme-panel");
        }
    });

    themeMode?.addEventListener("change", () => {
        settings.theme = themeMode.value === "auto" ? "system" : themeMode.value;
        applySettings(settings);
        saveSettings(settings);
    });

    contrastLevel?.addEventListener("input", () => {
        settings.contrast = Number(contrastLevel.value);
        applySettings(settings);
        saveSettings(settings);
    });

    brightnessLevel?.addEventListener("input", () => {
        settings.brightness = Number(brightnessLevel.value);
        applySettings(settings);
        saveSettings(settings);
    });

    fontScale?.addEventListener("input", () => {
        settings.fontScale = Number(fontScale.value);
        applySettings(settings);
        saveSettings(settings);
    });

    highContrastPreset?.addEventListener("click", () => {
        settings = {
            theme: "dark",
            contrast: 170,
            brightness: 105,
            fontScale: 110
        };
        applySettings(settings);
        saveSettings(settings);
    });

    resetThemeSettings?.addEventListener("click", () => {
        settings = { ...defaults };
        applySettings(settings);
        saveSettings(settings);
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (settings.theme === "auto") {
            applySettings(settings);
        }
    });
}






/* CASHBOT ANIMADO - MANUAL, SEM IA E SEM BOTPRESS */
// O CashBot fica em cashbot.js.



/* CLIQUE NOS CARDS DO RESUMO
   - Saldo Atual: mostra todas as transações
   - Receitas: mostra apenas receitas
   - Despesas: mostra apenas despesas
*/
(function () {
    function initSummaryCardsClick() {
        const balanceCard = document.querySelector(".balance-card");
        const incomeCard = document.querySelector(".income-card");
        const expenseCard = document.querySelector(".expense-card");
        const filterType = document.getElementById("filterType");
        const transactionList = document.getElementById("transactionList");

        if (!filterType || !window.financeManager) return;

        function aplicarFiltro(tipo) {
            filterType.value = tipo;
            window.financeManager.filterTransactions();

            if (transactionList) {
                transactionList.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        }

        if (balanceCard) {
            balanceCard.setAttribute("title", "Clique para ver receitas e despesas");
            balanceCard.onclick = function () {
                aplicarFiltro("all");
            };
        }

        if (incomeCard) {
            incomeCard.setAttribute("title", "Clique para ver apenas receitas");
            incomeCard.onclick = function () {
                aplicarFiltro("income");
            };
        }

        if (expenseCard) {
            expenseCard.setAttribute("title", "Clique para ver apenas despesas");
            expenseCard.onclick = function () {
                aplicarFiltro("expense");
            };
        }
    }

    window.addEventListener("load", function () {
        setTimeout(initSummaryCardsClick, 800);
    });
})();




/* CHATBOT SCROLL FOLLOW DEFINITIVO
   O botão e o painel do chatbot acompanham a rolagem sem aumentar a altura da página.
   Não mexe no VLibras.
*/
(function () {
    let ticking = false;

    function setImportant(el, prop, value) {
        if (!el) return;
        el.style.setProperty(prop, value, "important");
    }

    function moveToBody(el) {
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    }

    function getViewportScroll() {
        return {
            scrollY: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
            height: window.innerHeight || document.documentElement.clientHeight || 700,
            width: window.innerWidth || document.documentElement.clientWidth || 1200
        };
    }

    function placeChatbot() {
        // Desativado: o CSS mantém o botão e o painel fixos no rodapé da tela.
        return;
        const btn = document.getElementById("chatbotFab");
        const panel = document.getElementById("chatbotPanel");

        if (!btn && !panel) return;

        moveToBody(btn);
        moveToBody(panel);

        const vp = getViewportScroll();
        const mobile = vp.width <= 768;

        const left = mobile ? 16 : 24;
        const bottom = mobile ? 16 : 24;
        const panelBottom = mobile ? 90 : 104;

        if (btn) {
            const btnH = btn.offsetHeight || 66;
            const y = vp.scrollY + vp.height - btnH - bottom;

            setImportant(btn, "position", "absolute");
            setImportant(btn, "left", "0");
            setImportant(btn, "right", "auto");
            setImportant(btn, "top", "0");
            setImportant(btn, "bottom", "auto");
            setImportant(btn, "z-index", "2147483647");
            setImportant(btn, "visibility", "visible");
            setImportant(btn, "opacity", "1");
            setImportant(btn, "will-change", "transform");
            setImportant(btn, "transform", `translate3d(${left}px, ${Math.max(0, y)}px, 0)`);
        }

        if (panel) {
            const isHidden = panel.classList.contains("cashbot-hidden") || panel.classList.contains("hidden-chat");
            const estimatedPanelH = mobile ? Math.min(520, vp.height - 112) : Math.min(560, vp.height - 132);
            const realPanelH = isHidden ? estimatedPanelH : (panel.offsetHeight || estimatedPanelH);
            const y = vp.scrollY + vp.height - realPanelH - panelBottom;

            setImportant(panel, "position", "absolute");
            setImportant(panel, "left", "0");
            setImportant(panel, "right", mobile ? "16px" : "auto");
            setImportant(panel, "top", "0");
            setImportant(panel, "bottom", "auto");
            setImportant(panel, "width", mobile ? "calc(100vw - 32px)" : "min(410px, calc(100vw - 48px))");
            setImportant(panel, "max-height", mobile ? "calc(100vh - 112px)" : "calc(100vh - 132px)");
            setImportant(panel, "overflow-y", "auto");
            setImportant(panel, "z-index", "2147483647");
            setImportant(panel, "will-change", "transform");
            setImportant(panel, "transform", `translate3d(${left}px, ${Math.max(0, y)}px, 0)`);
        }
    }

    function requestPlace() {
        if (ticking) return;

        ticking = true;
        window.requestAnimationFrame(function () {
            placeChatbot();
            ticking = false;
        });
    }

    function startChatbotScrollFollow() {
        // Com o filtro de tema no <html>, "position: fixed" funciona: os botões
        // ficam presos ao rodapé da tela pelo CSS, sem recalcular na rolagem.
        return;

        window.addEventListener("scroll", requestPlace, { passive: true });
        window.addEventListener("resize", requestPlace);

        const btn = document.getElementById("chatbotFab");
        const panel = document.getElementById("chatbotPanel");

        if (btn) {
            btn.addEventListener("click", function () {
                setTimeout(placeChatbot, 0);
                setTimeout(placeChatbot, 180);
                setTimeout(placeChatbot, 360);
            });
        }

        if (panel) {
            panel.addEventListener("transitionend", placeChatbot);
            panel.addEventListener("animationend", placeChatbot);
        }

        setInterval(placeChatbot, 500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startChatbotScrollFollow);
    } else {
        startChatbotScrollFollow();
    }

    window.addEventListener("load", function () {
        placeChatbot();
        setTimeout(placeChatbot, 500);
        setTimeout(placeChatbot, 1500);
    });
})();


/* NOTIFICAÇÕES DE GASTO MÁXIMO */
(function () {
    let gastoMaximoConfig = null;

    function formatMoney(value) {
        return Number(value || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function getCurrentMonth() {
        return new Date().toISOString().slice(0, 7);
    }

    function getCurrentMonthLabel() {
        return new Date().toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric"
        });
    }

    async function carregarConfigGastoMaximo() {
        try {
            let response = await fetch("/api/config/gastos", {
                credentials: "include",
                cache: "no-store"
            });

            // fallback perfil gasto máximo
            if (!response.ok) {
                response = await fetch("/api/config/gastos", {
                    credentials: "include",
                    cache: "no-store"
                });
            }

            const raw = await response.text();
            const result = JSON.parse(raw);

            if (result.status === "success") {
                gastoMaximoConfig = {
                    gastoMaximo: Number(result.gasto_maximo || 0)
                };
            } else {
                gastoMaximoConfig = {
                    gastoMaximo: 0
                };
            }
        } catch (error) {
            console.warn("Não foi possível carregar configuração de gasto máximo:", error);
            gastoMaximoConfig = {
                gastoMaximo: 0
            };
        }
    }

    function calcularDespesasMesAtual() {
        if (!window.financeManager || !Array.isArray(window.financeManager.transactions)) {
            return 0;
        }

        const mesAtual = getCurrentMonth();

        return window.financeManager.transactions
            .filter(t => t.type === "expense" && String(t.date).slice(0, 7) === mesAtual)
            .reduce((total, t) => total + Math.round(Number(t.amount || 0)*100), 0)/100;
    }

    function setBadge(count) {
        const badge = document.getElementById("notificationBadge");

        if (!badge) return;

        if (count > 0) {
            badge.textContent = String(count);
            badge.classList.add("show");
        } else {
            badge.textContent = "0";
            badge.classList.remove("show");
        }
    }

    function renderNotifications() {
        const list = document.getElementById("notificationList");
        const status = document.getElementById("notificationStatus");

        if (!list || !status) return;

        const limite = Number(gastoMaximoConfig?.gastoMaximo || 0);
        const despesas = window.cashflowServerSummary?.despesas ?? calcularDespesasMesAtual();
        const restante = limite - despesas;

        if (limite <= 0) {
            setBadge(0);
            status.textContent = "Limite não configurado";

            list.innerHTML = `
                <div class="notification-item info">
                    <div class="notification-item-icon">⚙️</div>
                    <div>
                        <strong>Configure seu gasto máximo</strong>
                        <p>Defina um limite mensal no perfil para receber alertas quando ultrapassar o valor.</p>
                    </div>
                </div>
            `;
            return;
        }

        if (despesas >= limite) {
            const excesso = despesas - limite;
            setBadge(1);
            status.textContent = "Atenção necessária";

            list.innerHTML = `
                <div class="notification-item danger">
                    <div class="notification-item-icon">🚨</div>
                    <div>
                        <strong>Gasto máximo atingido ou ultrapassado</strong>
                        <p>Em ${getCurrentMonthLabel()}, suas despesas chegaram a <b>${formatMoney(despesas)}</b>.</p>
                        <p>Seu limite é <b>${formatMoney(limite)}</b>. ${excesso>0?"Você ultrapassou em":"O excesso atual é"} <b>${formatMoney(excesso)}</b>.</p>
                    </div>
                </div>
            `;
            return;
        }

        if (despesas >= limite * 0.8) {
            setBadge(1);
            status.textContent = "Perto do limite";

            list.innerHTML = `
                <div class="notification-item warning">
                    <div class="notification-item-icon">⚠️</div>
                    <div>
                        <strong>Você está perto do gasto máximo</strong>
                        <p>Você já gastou <b>${formatMoney(despesas)}</b> de <b>${formatMoney(limite)}</b>.</p>
                        <p>Restam aproximadamente <b>${formatMoney(restante)}</b> para este mês.</p>
                    </div>
                </div>
            `;
            return;
        }

        setBadge(0);
        status.textContent = "Tudo certo";

        list.innerHTML = `
            <div class="notification-item success">
                <div class="notification-item-icon">✅</div>
                <div>
                    <strong>Dentro do limite</strong>
                    <p>Você gastou <b>${formatMoney(despesas)}</b> de <b>${formatMoney(limite)}</b> neste mês.</p>
                    <p>Ainda restam <b>${formatMoney(restante)}</b>.</p>
                </div>
            </div>
        `;
    }

    async function atualizarNotificacoesGasto() {
        await carregarConfigGastoMaximo();
        try{const response=await fetch('/api/resumo',{credentials:'include',cache:'no-store'});if(response.ok){window.cashflowServerSummary=await response.json();gastoMaximoConfig.gastoMaximo=window.cashflowServerSummary.gasto_maximo;}}catch(error){console.warn('Resumo temporariamente indisponível.');}
        renderNotifications();
    }

    function initNotificationBell() {
        const bell = document.getElementById("notificationBell");
        const dropdown = document.getElementById("notificationDropdown");

        if (!bell || !dropdown) return;

        bell.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            dropdown.classList.toggle("show");
            await atualizarNotificacoesGasto();
        });

        dropdown.addEventListener("click", (event) => {
            event.stopPropagation();
        });

        document.addEventListener("click", () => {
            dropdown.classList.remove("show");
        });

        setTimeout(atualizarNotificacoesGasto, 900);
        setInterval(atualizarNotificacoesGasto, 30000);
    }

    window.addEventListener("load", initNotificationBell);
    window.atualizarNotificacoesGasto = atualizarNotificacoesGasto;
})();


/* Atualiza o sino após alterações nas transações */
(function () {
    function hookFinanceNotificationUpdates() {
        if (!window.financeManager || window.financeManager.__notificationHooked) return;

        const methods = ["addTransaction", "deleteTransaction", "clearAllTransactions", "loadTransactions", "updateDisplay"];

        methods.forEach(methodName => {
            const original = window.financeManager[methodName];

            if (typeof original !== "function") return;

            window.financeManager[methodName] = async function (...args) {
                const result = await original.apply(this, args);

                if (typeof window.atualizarNotificacoesGasto === "function") {
                    setTimeout(window.atualizarNotificacoesGasto, 350);
                }

                return result;
            };
        });

        window.financeManager.__notificationHooked = true;
    }

    window.addEventListener("load", () => {
        setTimeout(hookFinanceNotificationUpdates, 1000);
        setTimeout(hookFinanceNotificationUpdates, 2500);
    });
})();

// Recarrega lançamentos feitos pelo bot, sem renovar a sessão por polling.
setInterval(async()=>{if(document.visibilityState!=="visible"||!window.financeManager)return;try{await window.financeManager.loadTransactions();window.financeManager.updateDisplay();}catch(error){console.warn('Atualização financeira pendente.');}},30000);

// Avisos da conta no topo da Home: boas-vindas (conta nova) e confirmação de email.
(function initContaAvisos() {
    const esc = (v) => (window.cashflowEscape ? window.cashflowEscape(v) : String(v ?? ''));
    async function montar() {
        const box = document.getElementById('contaAvisos');
        if (!box) return;
        let dados;
        try {
            const r = await fetch('/api/perfil', { credentials: 'include', cache: 'no-store' });
            if (!r.ok) return;
            dados = (await r.json()).dados || {};
        } catch { return; }
        const params = new URLSearchParams(location.search);
        const novo = params.get('bemvindo') === '1';
        if (novo) {
            params.delete('bemvindo');
            history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
        }
        const primeiro = String(dados.nome || '').trim().split(/\s+/)[0];
        const cards = [];
        if (novo) {
            cards.push(`
                <div class="conta-aviso conta-aviso-boasvindas" role="status">
                    <div class="conta-aviso-ico" aria-hidden="true">🎉</div>
                    <div class="conta-aviso-texto">
                        <strong>Bem-vindo(a)${primeiro ? ', ' + esc(primeiro) : ''}! Sua conta está pronta.</strong>
                        <span>Comece registrando um gasto ou uma receita. Endereço e dados financeiros são opcionais e ficam no seu perfil.</span>
                    </div>
                    <div class="conta-aviso-acoes">
                        <a class="conta-aviso-btn" href="../CashFlow_Tela_Perfil/perfil.html">Completar perfil</a>
                        <button type="button" class="conta-aviso-fechar" data-fechar aria-label="Fechar aviso de boas-vindas">Agora não</button>
                    </div>
                </div>`);
        }
        if (dados.email && !dados.emailConfirmado) {
            cards.push(`
                <div class="conta-aviso conta-aviso-email" role="status">
                    <div class="conta-aviso-ico" aria-hidden="true">📧</div>
                    <div class="conta-aviso-texto">
                        <strong>Confirme seu email</strong>
                        <span>Enviamos um link para <b>${esc(dados.email)}</b>. Confirmar garante que você consiga recuperar a senha. Não achou? Veja o spam.</span>
                        <span class="conta-aviso-status" data-status></span>
                    </div>
                    <div class="conta-aviso-acoes">
                        <button type="button" class="conta-aviso-btn" data-reenviar>Reenviar link</button>
                    </div>
                </div>`);
        }
        box.innerHTML = cards.join('');
        box.querySelectorAll('[data-fechar]').forEach((b) =>
            b.addEventListener('click', () => b.closest('.conta-aviso').remove()));
        const reenviar = box.querySelector('[data-reenviar]');
        reenviar?.addEventListener('click', async () => {
            const status = box.querySelector('[data-status]');
            reenviar.disabled = true;
            reenviar.textContent = 'Enviando...';
            try {
                const r = await fetch('/api/email/reenviar', { method: 'POST', credentials: 'include' });
                const d = await r.json().catch(() => ({}));
                status.textContent = d.message || (r.ok ? 'Link enviado.' : 'Não foi possível enviar agora.');
                status.classList.toggle('erro', !r.ok);
                if (d.confirmado) setTimeout(() => reenviar.closest('.conta-aviso')?.remove(), 1500);
                reenviar.textContent = r.ok ? 'Enviado ✓' : 'Tentar de novo';
                reenviar.disabled = r.ok;
            } catch {
                status.textContent = 'Sem conexão. Tente de novo.';
                status.classList.add('erro');
                reenviar.textContent = 'Tentar de novo';
                reenviar.disabled = false;
            }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
    else montar();
})();


// Aparência pelo menu do usuário (no celular o botão 🎨 flutuante fica escondido)
// e o 💬 que some ao rolar para baixo, para não cobrir o conteúdo.
(function initBotoesFlutuantes() {
    function montar() {
        document.getElementById('openAppearanceMenu')?.addEventListener('click', () => {
            document.getElementById('userDropdown')?.classList.remove('show', 'active', 'open');
            document.getElementById('themePanel')?.classList.remove('hidden-theme-panel');
        });
        const fab = document.getElementById('chatbotFab');
        if (!fab) return;
        let ultimoY = window.scrollY, timer;
        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            const painelAberto = fab.classList.contains('cashbot-active');
            if (!painelAberto && y > ultimoY + 4 && y > 120) fab.classList.add('fab-escondido');
            else if (y < ultimoY - 4) fab.classList.remove('fab-escondido');
            ultimoY = y;
            clearTimeout(timer);
            timer = setTimeout(() => fab.classList.remove('fab-escondido'), 900);
        }, { passive: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
    else montar();
})();


// Máscara de dinheiro nas Ferramentas e consulta automática das taxas do BCB
// ao trocar o mês de referência.
(function initMascarasEPeriodos() {
    function montar() {
        const money = window.CashFlowMoney;
        if (money) {
            ['grossSalary', 'healthPlan', 'initialAmount', 'monthlyContribution', 'loanAmount']
                .forEach((id) => money.aplicar(document.getElementById(id)));
            const simbolos = { BRL: 'R$ ', USD: 'US$ ', EUR: '€ ', GBP: '£ ' };
            const origem = document.getElementById('fromCurrency');
            const valor = document.getElementById('amountToConvert');
            money.aplicar(valor, { prefixo: () => simbolos[origem?.value] || '' });
            origem?.addEventListener('change', () => valor?.cashflowMoney?.atualizar());
        }
        let espera;
        document.getElementById('bcbPeriod')?.addEventListener('change', () => {
            clearTimeout(espera);
            espera = setTimeout(() => {
                const fm = window.financeManager;
                if (!fm) return;
                fm.bcbJaCarregado = false;
                fm.carregarDadosJuros();
            }, 250);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
    else montar();
})();
