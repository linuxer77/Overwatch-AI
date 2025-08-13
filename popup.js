document.addEventListener("DOMContentLoaded", async () => {
  const setupView = document.getElementById("setup-view");
  const mainView = document.getElementById("main-view");

  const apiKeyInput = document.getElementById("apiKey");
  const saveKeyBtn = document.getElementById("saveKey");
  const openTogetherBtn = document.getElementById("openTogether");
  const changeKeyBtn = document.getElementById("changeKey");
  const keyStatus = document.getElementById("key-status");

  const promptInput = document.getElementById("prompt");
  const startBtn = document.getElementById("start");
  const status = document.getElementById("status");

  function showSetup() {
    setupView.style.display = "block";
    mainView.style.display = "none";
    keyStatus.textContent = "";
    apiKeyInput.focus();
  }

  function showMain() {
    setupView.style.display = "none";
    mainView.style.display = "block";
    status.textContent = "Ready to monitor.";
  }

  async function loadInitialState() {
    try {
      const { togetherApiKey, workPrompt } = await browser.storage.local.get([
        "togetherApiKey",
        "workPrompt",
      ]);

      if (togetherApiKey) {
        showMain();
        if (workPrompt) {
          promptInput.value = workPrompt;
          status.textContent =
            "Prompt loaded. Monitoring will resume when started.";
        }
      } else {
        showSetup();
      }
    } catch (err) {
      console.error("Failed to read storage:", err);
      showSetup();
    }
  }

  saveKeyBtn?.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      keyStatus.textContent = "API key cannot be empty.";
      keyStatus.className = "status error";
      return;
    }

    try {
      await browser.storage.local.set({ togetherApiKey: key });
      keyStatus.textContent = "API key saved.";
      keyStatus.className = "status ok";
      // After saving the key, proceed to main flow
      showMain();
    } catch (err) {
      console.error("Failed to save API key:", err);
      keyStatus.textContent = "Failed to save API key.";
      keyStatus.className = "status error";
    }
  });

  openTogetherBtn?.addEventListener("click", () => {
    browser.tabs.create({ url: "https://www.together.ai/" });
  });

  changeKeyBtn?.addEventListener("click", () => {
    showSetup();
    apiKeyInput.select();
  });

  startBtn?.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();

    if (!prompt) {
      status.textContent = "Prompt cannot be empty.";
      status.className = "status error";
      return;
    }

    try {
      const { togetherApiKey } = await browser.storage.local.get(
        "togetherApiKey"
      );
      if (!togetherApiKey) {
        status.textContent = "Please set your Together API key first.";
        status.className = "status error";
        showSetup();
        return;
      }

      await browser.storage.local.set({ workPrompt: prompt });
      status.textContent = "Prompt saved. Monitoring started.";
      status.className = "status ok";
      console.log("Prompt stored:", prompt);
    } catch (err) {
      console.error("Storage error:", err);
      status.textContent = "Failed to save prompt.";
      status.className = "status error";
    }
  });

  promptInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      startBtn.click();
    }
  });

  await loadInitialState();
});
