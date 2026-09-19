/**
 * Overwatch AI - Popup Controller (Anime / Manga Ink Theme)
 */

const api = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", async () => {
  // Views
  const setupView = document.getElementById("setup-view");
  const mainView = document.getElementById("main-view");
  const statusBadge = document.getElementById("statusBadge");

  // Setup elements
  const apiKeyInput = document.getElementById("apiKey");
  const saveKeyBtn = document.getElementById("saveKeyBtn");
  const openConsoleBtn = document.getElementById("openConsoleBtn");
  const setupStatus = document.getElementById("setupStatus");

  // Main elements
  const workPromptInput = document.getElementById("workPrompt");
  const savePromptBtn = document.getElementById("savePromptBtn");
  const goalStatus = document.getElementById("goalStatus");
  const monitoringToggle = document.getElementById("monitoringToggle");
  const enforcementSelect = document.getElementById("enforcementSelect");
  const newDomainInput = document.getElementById("newDomainInput");
  const addDomainBtn = document.getElementById("addDomainBtn");
  const allowedTags = document.getElementById("allowedTags");
  const graveyardList = document.getElementById("graveyardList");
  const clearGraveyardBtn = document.getElementById("clearGraveyardBtn");
  const changeKeyBtn = document.getElementById("changeKeyBtn");

  function showSetup() {
    setupView.style.display = "block";
    mainView.style.display = "none";
    statusBadge.className = "status-pill paused";
    statusBadge.innerHTML = '<span class="indicator"></span><span>SETUP</span>';
    apiKeyInput.focus();
  }

  function showMain(isMonitoring = true) {
    setupView.style.display = "none";
    mainView.style.display = "block";
    updateStatusBadge(isMonitoring);
  }

  function updateStatusBadge(isActive) {
    if (isActive) {
      statusBadge.className = "status-pill active";
      statusBadge.innerHTML = '<span class="indicator"></span><span>ACTIVE</span>';
    } else {
      statusBadge.className = "status-pill paused";
      statusBadge.innerHTML = '<span class="indicator"></span><span>PAUSED</span>';
    }
  }

  function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Render user allowed domain tags
  function renderDomainTags(domains = []) {
    allowedTags.innerHTML = "";
    if (domains.length === 0) {
      allowedTags.innerHTML = '<span style="font-size: 11px; font-family: monospace; color: var(--text-dark); font-style: italic;">No custom domains added</span>';
      return;
    }

    domains.forEach(domain => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.innerHTML = `
        <span>${domain}</span>
        <span class="tag-remove" data-domain="${domain}">&times;</span>
      `;
      allowedTags.appendChild(tag);
    });
  }

  // Render recently closed tabs (Tab Graveyard)
  function renderGraveyard(items = []) {
    graveyardList.innerHTML = "";
    if (items.length === 0) {
      graveyardList.innerHTML = '<div class="empty-state">No closed tabs.</div>';
      return;
    }

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "graveyard-item";
      row.innerHTML = `
        <div class="graveyard-info">
          <div class="graveyard-title" title="${item.title}">${item.title}</div>
          <div class="graveyard-meta">
            <span>${item.domain || "tab"}</span>
            <span>•</span>
            <span>${formatTimeAgo(item.closedAt)}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm restore-btn" data-url="${item.url}" title="Reopen this tab">↺ RESTORE</button>
      `;
      graveyardList.appendChild(row);
    });
  }

  // Load initial settings
  async function loadState() {
    try {
      if (!api?.storage?.local) {
        showSetup();
        return;
      }

      const {
        typesafeApiKey,
        workPrompt,
        isMonitoringEnabled = true,
        enforcementMode = "grace",
        whitelistDomains = [],
        recentlyClosed = []
      } = await api.storage.local.get([
        "typesafeApiKey",
        "workPrompt",
        "isMonitoringEnabled",
        "enforcementMode",
        "whitelistDomains",
        "recentlyClosed"
      ]);

      if (typesafeApiKey) {
        showMain(isMonitoringEnabled);
        if (workPrompt) workPromptInput.value = workPrompt;
        monitoringToggle.checked = isMonitoringEnabled;
        enforcementSelect.value = enforcementMode;
        renderDomainTags(whitelistDomains);
        renderGraveyard(recentlyClosed);
      } else {
        showSetup();
      }
    } catch (err) {
      console.error("Failed to load initial state:", err);
      showSetup();
    }
  }

  // Save API Key & test with Jev
  saveKeyBtn?.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      setupStatus.className = "status-msg error";
      setupStatus.textContent = "[!] API key cannot be empty.";
      return;
    }

    saveKeyBtn.disabled = true;
    saveKeyBtn.textContent = "VERIFYING KEY...";
    setupStatus.className = "status-msg";
    setupStatus.textContent = "";

    try {
      const response = await api.runtime.sendMessage({
        action: "TEST_API_KEY",
        apiKey: key
      });

      if (response && response.success) {
        await api.storage.local.set({ typesafeApiKey: key });
        setupStatus.className = "status-msg ok";
        setupStatus.textContent = "API key saved.";
        setTimeout(() => {
          showMain(monitoringToggle.checked);
        }, 500);
      } else {
        setupStatus.className = "status-msg error";
        setupStatus.textContent = response?.error || "Invalid TypeSafe key.";
      }
    } catch (err) {
      setupStatus.className = "status-msg error";
      setupStatus.textContent = "Connection error.";
    } finally {
      saveKeyBtn.disabled = false;
      saveKeyBtn.textContent = "SAVE KEY";
    }
  });

  openConsoleBtn?.addEventListener("click", () => {
    api.tabs.create({ url: "https://console.typesafe.ai/keys" });
  });

  changeKeyBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showSetup();
  });

  // Toggle monitoring
  monitoringToggle?.addEventListener("change", async () => {
    const isEnabled = monitoringToggle.checked;
    await api.storage.local.set({ isMonitoringEnabled: isEnabled });
    updateStatusBadge(isEnabled);
  });

  // Save work goal
  savePromptBtn?.addEventListener("click", async () => {
    const prompt = workPromptInput.value.trim();
    if (!prompt) {
      goalStatus.className = "status-msg error";
      goalStatus.textContent = "Prompt cannot be empty.";
      return;
    }

    try {
      await api.storage.local.set({ workPrompt: prompt });
      goalStatus.className = "status-msg ok";
      goalStatus.textContent = "Work prompt updated.";
      api.runtime.sendMessage({ action: "TRIGGER_EVALUATION" }).catch(() => {});
      setTimeout(() => {
        goalStatus.style.display = "none";
      }, 3000);
    } catch (err) {
      goalStatus.className = "status-msg error";
      goalStatus.textContent = "Failed to save prompt.";
    }
  });

  // Enforcement mode change
  enforcementSelect?.addEventListener("change", async () => {
    await api.storage.local.set({ enforcementMode: enforcementSelect.value });
  });

  // Add custom allowed domain
  async function handleAddDomain() {
    let raw = newDomainInput.value.trim().toLowerCase();
    if (!raw) return;

    raw = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    if (!raw) return;

    const { whitelistDomains = [] } = await api.storage.local.get("whitelistDomains");
    if (!whitelistDomains.includes(raw)) {
      const updated = [...whitelistDomains, raw];
      await api.storage.local.set({ whitelistDomains: updated });
      renderDomainTags(updated);
    }
    newDomainInput.value = "";
  }

  addDomainBtn?.addEventListener("click", handleAddDomain);
  newDomainInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddDomain();
  });

  // Remove allowed domain
  allowedTags?.addEventListener("click", async (e) => {
    if (e.target.classList.contains("tag-remove")) {
      const toRemove = e.target.getAttribute("data-domain");
      const { whitelistDomains = [] } = await api.storage.local.get("whitelistDomains");
      const updated = whitelistDomains.filter(d => d !== toRemove);
      await api.storage.local.set({ whitelistDomains: updated });
      renderDomainTags(updated);
    }
  });

  // Graveyard actions (Restore & Clear)
  graveyardList?.addEventListener("click", (e) => {
    if (e.target.classList.contains("restore-btn")) {
      const url = e.target.getAttribute("data-url");
      if (url) {
        api.runtime.sendMessage({ action: "RESTORE_TAB", url });
      }
    }
  });

  clearGraveyardBtn?.addEventListener("click", async () => {
    await api.runtime.sendMessage({ action: "CLEAR_GRAVEYARD" });
    renderGraveyard([]);
  });

  // Auto-refresh graveyard if storage changes while popup is open
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.recentlyClosed) {
      renderGraveyard(changes.recentlyClosed.newValue || []);
    }
  });

  await loadState();
});
