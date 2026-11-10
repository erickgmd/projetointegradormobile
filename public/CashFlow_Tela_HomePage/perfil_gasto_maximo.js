document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("gastoMaximoForm");
    const input = document.getElementById("gastoMaximoInput");
    const message = document.getElementById("gastoMaximoMensagem");

    if (!form || !input || !message) return;

    function showMessage(text, type = "success") {
        message.textContent = text;
        message.className = `profile-limit-message ${type}`;
    }

    async function carregarLimite() {
        try {
            const response = await fetch("/api/config/gastos", {
                credentials: "include",
                cache: "no-store"
            });

            const result = await response.json();

            if (result.status === "success" && Number(result.gasto_maximo) > 0) {
                input.value = Number(result.gasto_maximo).toFixed(2);
            }
        } catch (error) {
            console.warn("Erro ao carregar gasto máximo:", error);
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const valor = Number(input.value || 0);

        if (valor < 0) {
            showMessage("Informe um valor válido.", "error");
            return;
        }

        const formData = new FormData();
        formData.append("gasto_maximo", String(valor));

        try {
            const response = await fetch("/api/config/gastos", {
                method: "POST",
                body: formData,
                credentials: "include"
            });

            const result = await response.json();

            if (result.status === "success") {
                showMessage("Gasto máximo salvo com sucesso!", "success");
            } else {
                showMessage(result.message || "Erro ao salvar.", "error");
            }
        } catch (error) {
            showMessage("Erro ao salvar gasto máximo: " + error.message, "error");
        }
    });

    carregarLimite();
});
