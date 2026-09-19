/**
 * Overwatch AI - Background Engine (Firefox MV3)
 * Powered by TypeSafe AI (Jev System One Model)
 */

const api = typeof browser !== "undefined" ? browser : chrome;

const TYPESAFE_API_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// In-memory verdict cache: Map<url, { verdict: 'allow' | 'distraction', timestamp: number }>
const verdictCache = new Map();

// Session-specific manual overrides (when user clicks "Keep Tab")
const sessionAllowlist = new Set();

// Concurrency lock to prevent duplicate concurrent evaluations on the same tab
const pendingEvaluations = new Set();

// Built-in allowlisted domain suffixes / protocols
const INTERNAL_PROTOCOLS = [
  "about:",
  "chrome:",
  "chrome-extension:",
  "moz-extension:",
  "resource:",
  "view-source:",
  "data:",
  "file:"
];

const DEFAULT_ALLOWED_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "github.com",
  "gitlab.com",
  "stackoverflow.com",
  "stackexchange.com",
  "developer.mozilla.org",
  "docs.google.com",
  "npmjs.com",
  "pypi.org",
  "crates.io",
  "pkg.go.dev",
  "google.com",
  "duckduckgo.com",
  "bing.com",
  "typesafe.ai",
  "console.typesafe.ai"
];

// Helper: Normalize URL to domain
function getDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Helper: Check if URL or domain is automatically allowed
async function isUrlAllowed(urlStr) {
  if (!urlStr) return true;

  // Protocol check
  for (const proto of INTERNAL_PROTOCOLS) {
    if (urlStr.startsWith(proto)) return true;
  }

  const domain = getDomain(urlStr);
  if (!domain) return true;

  // Check session allowlist
  if (sessionAllowlist.has(urlStr) || sessionAllowlist.has(domain)) {
    return true;
  }

  // Check default allowed domains
  for (const allowed of DEFAULT_ALLOWED_DOMAINS) {
    if (domain === allowed || domain.endsWith("." + allowed)) {
      return true;
    }
  }

  // Check user custom whitelist from storage
  const { whitelistDomains } = await api.storage.local.get("whitelistDomains");
  if (Array.isArray(whitelistDomains)) {
    for (const custom of whitelistDomains) {
      const trimmed = custom.trim().toLowerCase();
      if (!trimmed) continue;
      if (domain === trimmed || domain.endsWith("." + trimmed) || urlStr.includes(trimmed)) {
        return true;
      }
    }
  }

  return false;
}

// Helper: Add tab to Graveyard (Recently Closed History)
async function recordToGraveyard(tabInfo) {
  try {
    const { recentlyClosed = [] } = await api.storage.local.get("recentlyClosed");
    const newEntry = {
      id: "tab_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      title: tabInfo.title || "Untitled Tab",
      url: tabInfo.url,
      domain: getDomain(tabInfo.url),
      closedAt: Date.now(),
      category: tabInfo.category || "distraction",
      reason: tabInfo.reason || "Flagged as off-topic by Jev AI"
    };

    // Keep up to 25 items
    const updated = [newEntry, ...recentlyClosed.filter(item => item.url !== tabInfo.url)].slice(0, 25);
    await api.storage.local.set({ recentlyClosed: updated });
  } catch (err) {
    console.error("Overwatch AI: Failed to record to graveyard", err);
  }
}

// Self-contained page content extractor (runs in content script)
function extractPageMetadata() {
  const title = document.title || "";
  const url = window.location.href;
  const metaDesc = document.querySelector('meta[name="description"]')?.content ||
                   document.querySelector('meta[property="og:description"]')?.content || "";

  // Headings
  const headings = Array.from(document.querySelectorAll("h1, h2"))
    .map(el => el.innerText.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");

  // Main text extraction: prioritize semantic tags
  const mainTarget = document.querySelector("main, article, [role='main'], #content") || document.body;
  let snippet = "";
  if (mainTarget) {
    try {
      const clone = mainTarget.cloneNode(true);
      const toRemove = clone.querySelectorAll("script, style, noscript, nav, footer, header, svg");
      toRemove.forEach(node => node.remove());
      snippet = (clone.innerText || "").replace(/\s+/g, " ").trim();
    } catch {
      snippet = (document.body.innerText || "").replace(/\s+/g, " ").trim();
    }
  }

  return {
    title,
    url,
    metaDesc: metaDesc.slice(0, 400),
    headings: headings.slice(0, 400),
    snippet: snippet.slice(0, 2500)
  };
}

// Injects the grace period warning banner directly into the page
async function injectWarningBanner(tabId, workGoal, graceSeconds = 5) {
  try {
    await api.scripting.executeScript({
      target: { tabId },
      func: (goalText, seconds) => {
        if (document.getElementById("overwatch-warning-banner")) return;

        const banner = document.createElement("div");
        banner.id = "overwatch-warning-banner";
        banner.style.cssText = `
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          z-index: 2147483647 !important;
          background: #0f172a !important;
          color: #f8fafc !important;
          border: 1px solid rgba(239, 68, 68, 0.5) !important;
          border-radius: 12px !important;
          padding: 16px 20px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(239, 68, 68, 0.25) !important;
          max-width: 360px !important;
          line-height: 1.45 !important;
          transition: all 0.3s ease !important;
        `;

        let remaining = seconds;
        banner.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
              <strong style="font-size: 13px; color: #f87171; letter-spacing: 0.5px; text-transform: uppercase;">Overwatch AI Distraction</strong>
            </div>
            <span id="overwatch-countdown" style="font-weight: 700; color: #ef4444; font-size: 14px;">${remaining}s</span>
          </div>
          <p style="margin: 0 0 8px 0; font-size: 12.5px; color: #cbd5e1;">
            This page appears off-topic from your focus:
          </p>
          <div style="background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px; font-size: 12px; color: #a78bfa; margin-bottom: 12px; font-weight: 500; word-break: break-word;">
            "${goalText.replace(/</g, "&lt;")}"
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="overwatch-keep-btn" style="
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 6px;
              padding: 6px 12px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
            ">Keep Tab</button>
            <button id="overwatch-close-btn" style="
              background: rgba(239, 68, 68, 0.2);
              color: #fca5a5;
              border: 1px solid rgba(239, 68, 68, 0.4);
              border-radius: 6px;
              padding: 6px 12px;
              font-size: 12px;
              cursor: pointer;
            ">Close Now</button>
          </div>
        `;

        document.body.appendChild(banner);

        const countdownEl = banner.querySelector("#overwatch-countdown");
        const keepBtn = banner.querySelector("#overwatch-keep-btn");
        const closeBtn = banner.querySelector("#overwatch-close-btn");

        let timer = setInterval(() => {
          remaining -= 1;
          if (countdownEl) countdownEl.textContent = remaining + "s";
          if (remaining <= 0) {
            clearInterval(timer);
            banner.remove();
            (typeof browser !== "undefined" ? browser : chrome).runtime.sendMessage({
              action: "CLOSE_TAB_CONFIRMED"
            });
          }
        }, 1000);

        keepBtn.addEventListener("click", () => {
          clearInterval(timer);
          banner.remove();
          (typeof browser !== "undefined" ? browser : chrome).runtime.sendMessage({
            action: "ALLOW_SESSION_TAB"
          });
        });

        closeBtn.addEventListener("click", () => {
          clearInterval(timer);
          banner.remove();
          (typeof browser !== "undefined" ? browser : chrome).runtime.sendMessage({
            action: "CLOSE_TAB_CONFIRMED"
          });
        });
      },
      args: [workGoal, graceSeconds]
    });
  } catch (err) {
    console.warn("Overwatch AI: Grace banner could not be injected, falling back to direct action.", err);
    // If injection blocked (e.g. strict CSP), close directly
    await recordToGraveyard({
      url: "Blocked tab (Restricted page)",
      title: "Distraction Tab",
      category: "distraction"
    });
    api.tabs.remove(tabId).catch(() => {});
  }
}

// Core evaluation function for a specific tab
async function evaluateTab(tabId) {
  if (!tabId || pendingEvaluations.has(tabId)) return;

  const {
    typesafeApiKey,
    workPrompt,
    isMonitoringEnabled = true,
    enforcementMode = "grace",
    graceSeconds = 5
  } = await api.storage.local.get([
    "typesafeApiKey",
    "workPrompt",
    "isMonitoringEnabled",
    "enforcementMode",
    "graceSeconds"
  ]);

  // Prerequisites check
  if (!isMonitoringEnabled || !typesafeApiKey || !workPrompt || !workPrompt.trim()) {
    return;
  }

  let tab;
  try {
    tab = await api.tabs.get(tabId);
  } catch {
    return; // Tab closed or invalid
  }

  if (!tab || !tab.url || tab.pinned) return;

  // Check URL whitelist
  if (await isUrlAllowed(tab.url)) {
    return;
  }

  // Check in-memory cache
  const cached = verdictCache.get(tab.url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    if (cached.verdict === "allow") return;
  }

  pendingEvaluations.add(tabId);

  try {
    // 1. Extract metadata from the tab
    const [execResult] = await api.scripting.executeScript({
      target: { tabId },
      func: extractPageMetadata
    }).catch(() => [null]);

    const pageData = execResult?.result;
    if (!pageData || !pageData.url) {
      pendingEvaluations.delete(tabId);
      return;
    }

    // Double check url allowed after extraction
    if (await isUrlAllowed(pageData.url)) {
      pendingEvaluations.delete(tabId);
      return;
    }

    const domain = getDomain(pageData.url);

    // 2. Build TypeSafe System One payload for Jev
    const requestPayload = {
      state: {
        user_work_goal: workPrompt.trim(),
        page: {
          title: pageData.title,
          domain: domain,
          url: pageData.url,
          meta_description: pageData.metaDesc,
          headings: pageData.headings,
          snippet: pageData.snippet
        }
      },
      model: JEV_MODEL,
      questions: {
        category: {
          type: "choice",
          instructions: "What is the primary category and intent of this web page in the context of the user's coding work?",
          criteria: {
            "coding_task": "Directly related to programming, software development, code repositories, APIs, libraries, tutorials, or debugging",
            "developer_tool": "Developer utility, search engine queries, localhost testing, cloud consoles, documentation portals, or workplace communication",
            "neutral_reading": "General tech news, blogs, or ambiguous technical reference",
            "distraction": "Social media (Twitter/X, Reddit, Instagram, TikTok), gaming, video entertainment/YouTube, shopping, gossip, or non-work forums"
          }
        },
        is_distraction: {
          type: "noul",
          instructions: "Is this web page an off-topic distraction that does NOT help achieve the user's coding work goal?",
          criteria: {
            "true": "Off-topic distraction, leisure browsing, social feed, entertainment, or unrelated rabbit hole",
            "false": "Relevant, helpful, or necessary for the user's programming goal"
          }
        }
      }
    };

    console.log(`[Overwatch AI] Evaluating "${pageData.title}" (${domain}) with Jev...`);
    const startTime = Date.now();

    const response = await fetch(TYPESAFE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${typesafeApiKey.trim()}`
      },
      body: JSON.stringify(requestPayload)
    });

    const latency = Date.now() - startTime;
    console.log(`[Overwatch AI] Jev response received in ${latency}ms`);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`[Overwatch AI] TypeSafe API error ${response.status}:`, errText);
      pendingEvaluations.delete(tabId);
      return;
    }

    const result = await response.json();
    const isDistractionNoul = result.answers?.is_distraction?.noul ?? 0;
    const categoryChoice = result.answers?.category?.choice ?? "neutral_reading";
    const categoryConfidence = result.answers?.category?.confidence ?? 0;

    console.log(`[Overwatch AI] Jev verdict: category=${categoryChoice} (${(categoryConfidence * 100).toFixed(1)}% conf), is_distraction=${isDistractionNoul.toFixed(2)}`);

    // Confidence-gated classification:
    // Tab is considered a distraction if is_distraction is high AND category confirms distraction with sufficient confidence
    const isConfirmedDistraction =
      (isDistractionNoul >= 0.70 && categoryChoice === "distraction") ||
      (isDistractionNoul >= 0.85 && categoryConfidence >= 0.65);

    if (isConfirmedDistraction) {
      verdictCache.set(pageData.url, { verdict: "distraction", timestamp: Date.now() });

      if (enforcementMode === "instant") {
        await recordToGraveyard({
          url: pageData.url,
          title: pageData.title,
          category: categoryChoice
        });
        api.tabs.remove(tabId).catch(() => {});
      } else {
        // Grace period mode
        await injectWarningBanner(tabId, workPrompt, graceSeconds);
      }
    } else {
      // Allowed page
      verdictCache.set(pageData.url, { verdict: "allow", timestamp: Date.now() });
    }
  } catch (err) {
    console.error("[Overwatch AI] Evaluation failed:", err);
  } finally {
    pendingEvaluations.delete(tabId);
  }
}

// Evaluate currently active tab
async function evaluateActiveTab() {
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      evaluateTab(tabs[0].id);
    }
  } catch (err) {
    console.warn("[Overwatch AI] Failed to query active tab", err);
  }
}

// -------------------------------------------------------------
// EVENT LISTENERS
// -------------------------------------------------------------

// Trigger on tab switch
api.tabs.onActivated.addListener(activeInfo => {
  evaluateTab(activeInfo.tabId);
});

// Trigger on page load complete
api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    evaluateTab(tabId);
  }
});

// Periodic sanity alarm for SPAs (e.g. YouTube / Twitter navigating without full page reload)
api.alarms.create("overwatchPeriodicCheck", { periodInMinutes: 1 });
api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "overwatchPeriodicCheck") {
    evaluateActiveTab();
  }
});

// Listen to storage changes (e.g. workPrompt updated -> flush cache & recheck)
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.workPrompt) {
    verdictCache.clear();
    sessionAllowlist.clear();
    evaluateActiveTab();
  }

  if (changes.isMonitoringEnabled && changes.isMonitoringEnabled.newValue === true) {
    evaluateActiveTab();
  }
});

// Handle runtime messages from Popup and Content Scripts
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TEST_API_KEY") {
    const keyToTest = message.apiKey;
    fetch(TYPESAFE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${keyToTest.trim()}`
      },
      body: JSON.stringify({
        state: "System One health check verification ping",
        model: JEV_MODEL,
        questions: {
          ping: {
            type: "noul",
            instructions: "Is this a valid health check probe?"
          }
        }
      })
    })
      .then(async res => {
        if (res.ok) {
          sendResponse({ success: true });
        } else {
          const errData = await res.json().catch(() => ({}));
          sendResponse({
            success: false,
            status: res.status,
            error: errData.message || `HTTP ${res.status}: Failed to authenticate with TypeSafe API`
          });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message || "Network error connecting to TypeSafe API" });
      });
    return true; // Keep message channel open for async response
  }

  if (message.action === "ALLOW_SESSION_TAB") {
    if (sender.tab?.url) {
      sessionAllowlist.add(sender.tab.url);
      const domain = getDomain(sender.tab.url);
      if (domain) sessionAllowlist.add(domain);
      verdictCache.set(sender.tab.url, { verdict: "allow", timestamp: Date.now() });
      console.log(`[Overwatch AI] Tab whitelisted for session: ${sender.tab.url}`);
    }
  }

  if (message.action === "CLOSE_TAB_CONFIRMED") {
    if (sender.tab?.id) {
      recordToGraveyard({
        url: sender.tab.url,
        title: sender.tab.title,
        category: "distraction"
      });
      api.tabs.remove(sender.tab.id).catch(() => {});
    }
  }

  if (message.action === "RESTORE_TAB") {
    if (message.url) {
      sessionAllowlist.add(message.url);
      api.tabs.create({ url: message.url });
    }
  }

  if (message.action === "CLEAR_GRAVEYARD") {
    api.storage.local.set({ recentlyClosed: [] });
    sendResponse({ success: true });
  }

  if (message.action === "TRIGGER_EVALUATION") {
    evaluateActiveTab();
    sendResponse({ success: true });
  }
});

// Initial startup evaluation & legacy key cleanup
api.runtime.onInstalled.addListener(() => {
  // Purge any legacy keys from previous versions
  api.storage.local.remove(["togetherApiKey", "togetherKey"]).catch(() => {});

  api.storage.local.get(["typesafeApiKey", "workPrompt"]).then(({ typesafeApiKey, workPrompt }) => {
    if (!typesafeApiKey) {
      const url = api.runtime.getURL("popup.html");
      api.tabs.create({ url });
    } else if (workPrompt) {
      evaluateActiveTab();
    }
  });
});

console.log("[Overwatch AI] Background engine loaded with TypeSafe Jev model.");
