// Ajustes usados apenas quando o CashFlow roda dentro do aplicativo Android (Capacitor).
// No navegador comum este arquivo não altera nada.
(function () {
  "use strict";
  var cap = window.Capacitor;
  var nativo = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  if (!nativo) return;

  document.documentElement.classList.add("cashflow-app");

  window.CashFlowMobile = {
    // O WebView do Android não baixa arquivos gerados em memória (blob).
    // Grava o PDF no cache do app e abre a tela de compartilhar/salvar do Android.
    savePdf: async function (doc, fileName) {
      var plugins = cap.Plugins || {};
      if (!plugins.Filesystem || !plugins.Share) {
        doc.save(fileName);
        return;
      }
      var base64 = doc.output("datauristring").split(",")[1];
      var file = await plugins.Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: "CACHE",
      });
      try {
        await plugins.Share.share({
          title: fileName,
          dialogTitle: "Salvar ou compartilhar relatório",
          files: [file.uri],
        });
      } catch (error) {
        // Fechar a tela de compartilhamento não é erro.
        if (!/cancel/i.test(String(error && error.message))) throw error;
      }
    },
  };
})();
