(() => {
  const button = document.getElementById("install-app");
  const help = document.getElementById("install-help");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let installPrompt;

  function update() {
    button.hidden = standalone.matches || navigator.standalone === true;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = undefined;
    button.hidden = true;
  });
  standalone.addEventListener("change", update);
  button.addEventListener("click", async () => {
    if (!installPrompt) {
      help.showModal();
      return;
    }
    const prompt = installPrompt;
    installPrompt = undefined;
    await prompt.prompt();
  });
  update();
})();
