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
            this.customCategories.forEach(c => {
                if (![...select.options].some(o => o.value === c.nome)) {
                    const option = new Option(c.nome, c.nome); select.add(option);
                }
            });
        } catch (error) { console.warn('Categorias indisponíveis', error); }
    }

    editTransaction(id) {
        const transaction = this.transactions.find(t => Number(t.id) === Number(id));
        if (!transaction) return;
        this.editingId = id;
        this.transactionKey = null;
        for (const key of ['description','amount','category','type','date']) {
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

    async addTransaction() {
        const description = document.getElementById('description').value.trim();
        const amount = document.getElementById('amount').value.trim();
        const category = document.getElementById('category').value;
        const type = document.getElementById('type').value;
        const date = document.getElementById('date').value;

        if (!description || !amount || !category || !type || !date) {
            alert('Preencha todos os campos.');
            return;
        }

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
                this.showSuccessMessage('Transação adicionada com sucesso!');
            } else {
                alert('Erro: ' + result.message);
            }
        } catch (error) {
            console.error('Erro ao salvar transação:', error);
            alert('Erro ao salvar transação: ' + error.message);
        }
    }

    clearForm() {
        this.editingId = null;
        document.getElementById('cancelEdit')?.remove();
        document.getElementById('transactionForm')?.reset();
        this.setTodayDate();
    }

    showSuccessMessage(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #48bb78;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

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
        }, 3000);
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
                alert('Erro ao excluir transação: ' + result.message);
            }
        } catch (error) {
            console.error('Erro ao excluir transação:', error);
            alert('Erro ao excluir transação: ' + error.message);
        }
    }

    async clearAllTransactions() {
        if (!confirm('Tem certeza que deseja excluir TODAS as transações? Esta ação não pode ser desfeita!')) {
            return;
        }

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
                alert('Erro ao limpar transações: ' + result.message);
            }
        } catch (error) {
            console.error('Erro ao limpar transações:', error);
            alert('Erro ao limpar transações: ' + error.message);
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
        }
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
            alert('Selecione um mês para gerar o relatório.');
            return;
        }

        const transactions = this.getTransactionsByMonth(reportMonth);

        if (transactions.length === 0) {
            alert(`Nenhuma transação encontrada em ${this.formatMonthYear(reportMonth)}. O relatório não foi gerado.`);
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
            alert("Erro ao gerar relatório: " + error.message);
        }
    }

    calculateSalary() {
        const grossSalary = parseFloat(document.getElementById('grossSalary').value);
        const dependents = parseInt(document.getElementById('dependents').value) || 0;
        const healthPlan = parseFloat(document.getElementById('healthPlan').value) || 0;

        if (!grossSalary || grossSalary <= 0) {
            alert('Por favor, insira um salário bruto válido!');
            return;
        }

        let result;try { result=window.CashFlowCalculators.salary2026(grossSalary,dependents,healthPlan); } catch(error){alert(error.message);return;}
        const {inss,irrf,net:netSalary}=result;

        document.getElementById('inssValue').textContent = this.formatCurrency(inss);
        document.getElementById('irrfValue').textContent = this.formatCurrency(irrf);
        document.getElementById('netSalary').textContent = this.formatCurrency(netSalary);
        document.getElementById('salaryResult').style.display = 'block';
    }

    calculateCompoundInterest() {
        const initialAmount = parseFloat(document.getElementById('initialAmount').value) || 0;
        const monthlyContribution = parseFloat(document.getElementById('monthlyContribution').value) || 0;
        const interestRate = parseFloat(document.getElementById('interestRate').value) || 0;
        const timePeriod = parseInt(document.getElementById('timePeriod').value) || 0;

        if (initialAmount < 0 || monthlyContribution < 0 || interestRate < 0 || timePeriod <= 0) {
            alert('Por favor, insira valores válidos!');
            return;
        }

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
        const loanAmount = parseFloat(document.getElementById('loanAmount').value) || 0;
        const loanRate = parseFloat(document.getElementById('loanRate').value) || 0;
        const loanPeriod = parseInt(document.getElementById('loanPeriod').value) || 0;

        if (loanAmount <= 0 || loanRate < 0 || loanPeriod <= 0) {
            alert('Por favor, insira valores válidos!');
            return;
        }

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
        const amount = parseFloat(document.getElementById('amountToConvert').value) || 0;
        const fromCurrency = document.getElementById('fromCurrency').value;
        const toCurrency = document.getElementById('toCurrency').value;
        const exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || 0;

        if (amount <= 0) {
            alert('Por favor, insira um valor válido!');
            return;
        }

        if (exchangeRate <= 0) {
            alert('Por favor, insira uma taxa de câmbio válida!');
            return;
        }

        if (fromCurrency === toCurrency) {
            alert('Selecione moedas diferentes para conversão!');
            return;
        }

        let convertedAmount;
        if (fromCurrency === 'BRL') {
            convertedAmount = amount / exchangeRate;
        } else if (toCurrency === 'BRL') {
            convertedAmount = amount * exchangeRate;
        } else {
            alert('Para conversão entre duas moedas estrangeiras, converta primeiro para BRL.');
            return;
        }

        let currencySymbol;
        switch (toCurrency) {
            case 'USD': currencySymbol = '$'; break;
            case 'EUR': currencySymbol = '€'; break;
            case 'GBP': currencySymbol = '£'; break;
            default: currencySymbol = 'R$';
        }

        document.getElementById('convertedAmount').textContent = `${currencySymbol} ${convertedAmount.toFixed(2)}`;
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
            'outros-receitas': 'Outros (Receitas)',
            'alimentacao': 'Alimentação',
            'transporte': 'Transporte',
            'moradia': 'Moradia',
            'saude': 'Saúde',
            'educacao': 'Educação',
            'lazer': 'Lazer',
            'outros-despesas': 'Outros (Despesas)'
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
        if (item.Mes && item.AnoMes) {
            return `${item.Mes}/${item.AnoMes}`;
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

    esconderAreaJuros() {
        const cards = document.getElementById("bcbCards");
        const filters = document.getElementById("bcbFilters");
        const lista = document.getElementById("bcbLista");

        if (cards) cards.style.display = "none";
        if (filters) filters.style.display = "none";
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
                    <span class="transaction-amount income">${this.formatarPercentual(item.TaxaJurosAoAno)}</span>
                    <small>${this.formatarPercentual(item.TaxaJurosAoMes)} ao mês</small>
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
        this.atualizarStatusJuros("bcb-loading", `<span class="bcb-spinner"></span> Carregando taxas do Banco Central...`);
        this.esconderAreaJuros();

        try {
            const response = await fetch(this.apiJuros+"?mes="+encodeURIComponent(document.getElementById("bcbPeriod")?.value||""), {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            });

            const json = await response.json().catch(() => ({}));

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

    const chatbotFab = document.getElementById("chatbotFab");
    const chatbotPanel = document.getElementById("chatbotPanel");
    const closeChatbot = document.getElementById("closeChatbot");

    chatbotFab?.addEventListener("click", () => {
        chatbotPanel?.classList.toggle("hidden-chat");
    });

    closeChatbot?.addEventListener("click", () => {
        chatbotPanel?.classList.add("hidden-chat");
    });

    document.getElementById("sendChat")?.addEventListener("click", () => {
        const input = document.getElementById("chatInput");
        const messages = document.getElementById("chatMessages");

        if (!input || !messages || !input.value.trim()) return;

        const pergunta = input.value.trim();
        const texto = pergunta.toLowerCase();

        let resposta = getCashBotResposta(pergunta);

        messages.innerHTML += `<p><strong>Você:</strong> ${window.cashflowEscape(pergunta)}</p>`;
        messages.innerHTML += `<p><strong>CashBot:</strong> ${resposta}</p>`;
        input.value = "";
        messages.scrollTop = messages.scrollHeight;
    });

    
    document.querySelectorAll(".faq-question").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById("chatInput");
            const send = document.getElementById("sendChat");

            if (input && send) {
                input.value = button.dataset.question || button.textContent.trim();
                send.click();
            }
        });
    });

    document.getElementById("chatInput")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            document.getElementById("sendChat")?.click();
        }
    });
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
(function () {
    function normalizeText(text) {
        return String(text || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function getCashBotAnswer(question) {
        const text = normalizeText(question);

        const answers = [
            {
                keys: ["cadastrar", "adicionar", "nova transacao", "registrar", "lancamento", "salvar"],
                answer: "Para cadastrar uma transação, preencha descrição, valor, data, categoria e tipo. Depois clique em Adicionar Transação."
            },
            {
                keys: ["excluir", "apagar", "remover", "deletar", "lixeira"],
                answer: "Para excluir uma transação, vá ao Histórico de Transações e clique no ícone de lixeira ao lado do lançamento."
            },
            {
                keys: ["limpar", "limpar tudo", "todas as transacoes", "zerar"],
                answer: "Para apagar todas as transações, clique em Limpar Tudo. O sistema pedirá confirmação antes de excluir."
            },
            {
                keys: ["filtrar", "filtro", "mes", "tipo", "receita", "despesa"],
                answer: "Use os filtros de mês e tipo no Histórico. Você também pode clicar nos cards de Receitas ou Despesas para filtrar automaticamente."
            },
            {
                keys: ["relatorio", "pdf", "gerar relatorio", "baixar"],
                answer: "Na aba Relatórios, selecione o mês desejado e clique em Gerar Relatório PDF."
            },
            {
                keys: ["tema", "contraste", "claro", "escuro", "aparencia", "brilho", "fonte"],
                answer: "Clique em Aparência para escolher tema claro, escuro ou automático. Também é possível ajustar contraste, brilho e tamanho da fonte."
            },
            {
                keys: ["vlibras", "libras", "acessibilidade"],
                answer: "O CashFlow possui VLibras para acessibilidade em Libras. Use o botão do VLibras na tela para ativar a tradução."
            },
            {
                keys: ["alerta", "gastos", "excesso", "80", "oitenta"],
                answer: "O alerta de gastos aparece em 80% e em 100% do gasto máximo mensal configurado no perfil."
            },
            {
                keys: ["saldo", "resumo", "card", "cards"],
                answer: "O saldo atual é calculado automaticamente: receitas menos despesas."
            },
            {
                keys: ["grafico", "categoria", "categorias"],
                answer: "O gráfico por categoria mostra como suas receitas e despesas estão distribuídas."
            },
            {
                keys: ["calculadora", "salario", "juros", "financiamento", "moeda"],
                answer: "Na aba Ferramentas, você encontra calculadoras de salário, juros compostos, financiamento e conversor de moedas."
            }
        ];

        const found = answers.find(item => item.keys.some(key => text.includes(key)));

        if (found) return found.answer;

        if (text.includes("econom") || text.includes("poupar")) {
            return "Uma boa prática é acompanhar gastos por categoria, criar uma meta mensal e manter uma reserva de emergência.";
        }

        if (text.includes("invest")) {
            return "Para investir melhor, defina objetivo, prazo e perfil de risco. Para curto prazo, priorize segurança e liquidez.";
        }

        return "Posso ajudar com transações, filtros, relatórios, gráficos, saldo, ferramentas, tema, contraste, VLibras e alertas. Clique em uma pergunta rápida ou digite sua dúvida.";
    }

    function initCashBotAnimated() {
        const fab = document.getElementById("chatbotFab");
        const panel = document.getElementById("chatbotPanel");
        const closeBtn = document.getElementById("closeChatbot");
        const form = document.getElementById("chatbotForm");
        const input = document.getElementById("chatInput");
        const messages = document.getElementById("chatMessages");

        if (!fab || !panel || !form || !input || !messages) return;

        function openChat() {
            panel.classList.remove("cashbot-hidden");
            panel.classList.add("cashbot-open");
            fab.classList.add("cashbot-active");
            setTimeout(() => input.focus(), 180);
        }

        function closeChat() {
            panel.classList.add("cashbot-hidden");
            panel.classList.remove("cashbot-open");
            fab.classList.remove("cashbot-active");
        }

        function toggleChat(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            if (panel.classList.contains("cashbot-hidden")) {
                openChat();
            } else {
                closeChat();
            }
        }

        function createMessage(type, text) {
            const row = document.createElement("div");
            row.className = type === "user"
                ? "cashbot-message cashbot-message-user"
                : "cashbot-message cashbot-message-bot";

            const avatar = document.createElement("div");
            avatar.className = "cashbot-message-avatar";
            avatar.textContent = type === "user" ? "Você" : "CF";

            const bubble = document.createElement("div");
            bubble.className = "cashbot-bubble";
            bubble.textContent = text;

            if (type === "user") {
                row.appendChild(bubble);
                row.appendChild(avatar);
            } else {
                row.appendChild(avatar);
                row.appendChild(bubble);
            }

            messages.appendChild(row);
            messages.scrollTop = messages.scrollHeight;
        }

        function showTyping(question) {
            const typing = document.createElement("div");
            typing.className = "cashbot-message cashbot-message-bot cashbot-typing-row";
            typing.innerHTML = `
                <div class="cashbot-message-avatar">CF</div>
                <div class="cashbot-bubble cashbot-typing">
                    <span></span><span></span><span></span>
                </div>
            `;

            messages.appendChild(typing);
            messages.scrollTop = messages.scrollHeight;

            setTimeout(() => {
                typing.remove();
                createMessage("bot", getCashBotAnswer(question));
            }, 560);
        }

        function sendQuestion(question) {
            const text = String(question || "").trim();

            if (!text) return;

            createMessage("user", text);
            input.value = "";
            showTyping(text);
        }

        fab.onclick = toggleChat;

        if (closeBtn) {
            closeBtn.onclick = function (event) {
                event.preventDefault();
                closeChat();
            };
        }

        form.onsubmit = function (event) {
            event.preventDefault();
            sendQuestion(input.value);
        };

        document.querySelectorAll(".cashbot-question").forEach(button => {
            button.onclick = function () {
                openChat();
                sendQuestion(button.dataset.question || button.textContent);
            };
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeChat();
        });
    }

    window.addEventListener("load", initCashBotAnimated);
})();


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
