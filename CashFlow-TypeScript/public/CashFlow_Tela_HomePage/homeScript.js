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
        this.setTodayDate();
        this.initTabs();
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

        if (incomeCategories.includes(category)) {
            typeSelect.value = 'income';
        } else if (category) {
            typeSelect.value = 'expense';
        }
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
        formData.append('description', description);
        formData.append('amount', amount);
        formData.append('category', category);
        formData.append('type', type);
        formData.append('date', date);

        try {
            const response = await fetch('/api/transacoes', {
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

        transactionList.innerHTML = filteredTransactions.map(transaction => `
            <div class="transaction-item ${transaction.type}">
                <div class="transaction-info">
                    <h4>${this.escapeHtml(transaction.description)}</h4>
                    <p>${this.escapeHtml(this.formatCategory(transaction.category))} • ${this.formatDate(transaction.date)}</p>
                </div>
                <div style="display: flex; align-items: center;">
                    <span class="transaction-amount ${transaction.type}">
                        ${transaction.type === 'income' ? '+' : '-'} ${this.formatCurrency(Number(transaction.amount))}
                    </span>
                    <button class="delete-btn" onclick="financeManager.deleteTransaction(${transaction.id})">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');
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

        if (!filterMonth || !reportMonth) return;

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

        if (months.length > 0 && !reportMonth.value) {
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
        const reportMonth = document.getElementById('reportMonth').value;

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
            const responseUser = await fetch('/api/perfil', {
                credentials: 'include'
            });

            const resultUser = await responseUser.json();

            if (resultUser.status !== "success") {
                alert("Sessão inválida. Faça login novamente.");
                window.location.href = "/CashFlow_Tela_de_Login/login.html";
                return;
            }

            const username = resultUser.dados.nome || "Usuário";

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const income = transactions
                .filter(t => t.type === 'income')
                .reduce((sum, t) => sum + Math.round(Number(t.amount)*100), 0)/100;

            const expenses = transactions
                .filter(t => t.type === 'expense')
                .reduce((sum, t) => sum + Math.round(Number(t.amount)*100), 0)/100;

            const balance = Math.round(income*100-expenses*100)/100;
            const generatedAt = new Date().toLocaleString('pt-BR');

            let y = 20;

            doc.setFillColor(26, 32, 62);
            doc.rect(0, 0, 210, 30, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.text('Relatório Financeiro Mensal', 14, 15);

            doc.setFontSize(10);
            doc.text(`Usuário: ${username}`, 14, 23);
            doc.text(`Gerado em: ${generatedAt}`, 120, 23);

            y = 40;
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            doc.text(`Mês de referência: ${this.formatMonthYear(reportMonth)}`, 14, y);
            y += 10;

            this.drawSummaryCard(doc, 14, y, 55, 22, 'Receitas', this.formatCurrency(income), [72, 187, 120]);
            this.drawSummaryCard(doc, 77, y, 55, 22, 'Despesas', this.formatCurrency(expenses), [229, 62, 62]);
            this.drawSummaryCard(doc, 140, y, 55, 22, 'Saldo', this.formatCurrency(balance), balance >= 0 ? [56, 161, 105] : [200, 40, 40]);

            y += 30;

            this.drawSummaryCard(doc, 14, y, 55, 18, 'Transações', String(transactions.length), [66, 153, 225]);
            this.drawSummaryCard(doc, 77, y, 55, 18, 'Maior Receita', this.formatCurrency(this.getLargestValue(transactions, 'income')), [91, 192, 141]);
            this.drawSummaryCard(doc, 140, y, 55, 18, 'Maior Despesa', this.formatCurrency(this.getLargestValue(transactions, 'expense')), [240, 92, 92]);

            y += 28;

            const barChart = this.createIncomeExpenseChart(income, expenses);
            doc.text('Comparativo de Receitas e Despesas', 14, y);
            y += 4;
            doc.addImage(barChart, 'PNG', 14, y, 85, 55);

            const pieChart = this.createCategoryPieChart(transactions);
            doc.text('Distribuição por Categoria', 110, y - 4);
            doc.addImage(pieChart, 'PNG', 110, y, 85, 55);

            y += 65;

            const lineChart = this.createDailyEvolutionChart(transactions, reportMonth);
            doc.text('Evolução Financeira Diária', 14, y);
            y += 4;
            doc.addImage(lineChart, 'PNG', 14, y, 180, 55);

            y += 65;

            doc.setFontSize(13);
            doc.text('Detalhamento das Transações', 14, y);
            y += 8;

            doc.setFontSize(10);

            if (transactions.length === 0) {
                doc.text('Nenhuma transação registrada neste mês.', 14, y);
            } else {
                transactions
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .forEach((t, index) => {
                        const linha = `${index + 1}. ${t.description} | ${this.formatCategory(t.category)} | ${t.type === 'income' ? 'Receita' : 'Despesa'} | ${this.formatCurrency(Number(t.amount))} | ${this.formatDate(t.date)}`;

                        const linhas = doc.splitTextToSize(linha, 180);
                        doc.text(linhas, 14, y);
                        y += linhas.length * 6 + 2;

                        if (y > 275) {
                            doc.addPage();
                            y = 20;
                        }
                    });
            }

            doc.save(`relatorio-financeiro-${reportMonth}.pdf`);

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            alert("Erro ao gerar relatório.");
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
        if (filters) filters.style.display = "block";
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
            const response = await fetch(this.apiJuros, {
                method: "GET"
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP ${response.status}`);
            }

            const json = await response.json();

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
            this.atualizarStatusJuros("bcb-success", ``);
            this.bcbJaCarregado = true;

        } catch (erro) {
            console.error("Erro ao carregar juros:", erro);
            this.atualizarStatusJuros(
                "bcb-error",
                `Não foi possível carregar as taxas. Verifique se a API permite acesso direto do navegador ou use um proxy/backend para consultar o BCB.`
            );
            this.esconderAreaJuros();
        }
    }
}

const userIcon = document.getElementById("userIcon");
const userDropdown = document.getElementById("userDropdown");

if (userIcon && userDropdown) {
    userIcon.addEventListener("click", () => {
        userDropdown.style.display =
            userDropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", (event) => {
        if (!userIcon.contains(event.target) && !userDropdown.contains(event.target)) {
            userDropdown.style.display = "none";
        }
    });
}

async function loadUserName() {
    try {
        const response = await fetch('/api/perfil', {
            credentials: 'include'
        });

        const result = await response.json();

        if (result.status === "success") {
            const userNameElement = document.getElementById("userName");

            if (userNameElement) {
                userNameElement.textContent = result.dados.nome;
            }
        } else {
            window.location.href = "/CashFlow_Tela_de_Login/login.html";
        }

    } catch (error) {
        console.error("Erro ao carregar usuário:", error);
        window.location.href = "/CashFlow_Tela_de_Login/login.html";
    }
}

document.getElementById("logoutBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();

    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });

        const result = await response.json();

        if (result.status === 'success') {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('/CashFlow_Tela_de_Login/login.html?_=' + Date.now());
        } else {
            alert('Erro no logout: ' + (result.message || 'Tente novamente'));
        }
    } catch (err) {
        console.error('Erro no logout:', err);
        window.location.replace('/CashFlow_Tela_de_Login/login.html?_=' + Date.now());
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    await loadUserName();
    window.financeManager = new FinanceManager();
});

/* Melhorias CashFlow: UX, chatbot, acessibilidade, alertas e detalhamento */
document.addEventListener('DOMContentLoaded', () => {
    const contrastToggle = document.getElementById('contrastToggle');
    contrastToggle?.addEventListener('click', () => {
        document.body.classList.toggle('high-contrast');
        const isActive = document.body.classList.contains('high-contrast');
        contrastToggle.textContent = isActive ? '☀️ Contraste normal' : '🌓 Alto contraste';
    });

    const chatbotFab = document.getElementById('chatbotFab');
    const chatbotPanel = document.getElementById('chatbotPanel');
    const closeChatbot = document.getElementById('closeChatbot');
    const sendChat = document.getElementById('sendChat');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');

    chatbotFab?.addEventListener('click', () => chatbotPanel?.classList.toggle('hidden-chat'));
    closeChatbot?.addEventListener('click', () => chatbotPanel?.classList.add('hidden-chat'));

    const responderCashBot = (pergunta) => {
        const texto = pergunta.toLowerCase();

        if (texto.includes('invest')) {
            return 'Para investimentos, defina objetivo, prazo e perfil de risco. Para curto prazo, priorize segurança e liquidez.';
        }

        if (texto.includes('econom') || texto.includes('poupar')) {
            return 'Uma boa estratégia é separar os gastos por categoria e criar uma meta mensal de economia.';
        }

        if (texto.includes('despesa') || texto.includes('gasto')) {
            return 'Revise despesas recorrentes, corte gastos não essenciais e acompanhe se elas passam de 80% das receitas.';
        }

        if (texto.includes('receita') || texto.includes('salário') || texto.includes('salario')) {
            return 'Registre todas as entradas para comparar corretamente com as despesas e acompanhar seu saldo real.';
        }

        return 'Minha sugestão é acompanhar receitas, despesas e saldo mensalmente para tomar decisões financeiras com mais segurança.';
    };

    const enviarMensagemChat = () => {
        if (!chatInput || !chatMessages) return;

        const pergunta = chatInput.value.trim();
        if (!pergunta) return;

        chatMessages.innerHTML += `<p><strong>Você:</strong> ${window.cashflowEscape(pergunta)}</p>`;
        chatMessages.innerHTML += `<p><strong>CashBot:</strong> ${responderCashBot(pergunta)}</p>`;
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    sendChat?.addEventListener('click', enviarMensagemChat);
    chatInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') enviarMensagemChat();
    });

    const aplicarFiltroResumo = (tipo) => {
        if (!window.financeManager) return;

        const filterType = document.getElementById('filterType');
        const transactionList = document.getElementById('transactionList');

        if (filterType) {
            filterType.value = tipo;
            window.financeManager.filterTransactions();
        }

        transactionList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    document.querySelector('.income-card')?.addEventListener('click', () => aplicarFiltroResumo('income'));
    document.querySelector('.expense-card')?.addEventListener('click', () => aplicarFiltroResumo('expense'));

    const verificarExcessoGastos = () => {
        if (!window.financeManager || !Array.isArray(window.financeManager.transactions)) return;

        const receitas = window.financeManager.transactions
            .filter(t => t.type === 'income')
            .reduce((total, t) => total + Math.round(Number(t.amount)*100), 0)/100;

        const despesas = window.financeManager.transactions
            .filter(t => t.type === 'expense')
            .reduce((total, t) => total + Math.round(Number(t.amount)*100), 0)/100;

        const alerta = document.getElementById('expenseAlert');

        if (alerta && receitas > 0 && despesas / receitas >= 0.8) {
            alerta.classList.add('show-alert');

            setTimeout(() => {
                alerta.classList.remove('show-alert');
            }, 7000);
        }
    };

    setTimeout(verificarExcessoGastos, 1200);
});
