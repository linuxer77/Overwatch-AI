const TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions";
console.log("Background script loaded");
let monitorIntervalId = null;
async function getApiKey() {
  const { togetherApiKey } = await browser.storage.local.get("togetherApiKey");
  return togetherApiKey || null;
}

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.storage.local.get("togetherApiKey").then(({ togetherApiKey }) => {
      if (!togetherApiKey) {
        const url = browser.runtime.getURL("popup.html");
        browser.tabs.create({ url });
      }
    });
  }
});

function startMonitoring(workPrompt) {
  if (!workPrompt) return;
  console.log("Monitoring started with prompt:", workPrompt);

  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
  }

  getApiKey().then((apiKey) => {
    if (!apiKey) {
      console.warn(
        "Together API key is not set. Open the popup to enter your key."
      );
      return;
    }

    const systemPrompt = `
You are a relevance classifier. Given a user's work prompt and a browser tab's content,
respond with a JSON object containing a single float field named "relevance" between 0.0 and 1.0.

Respond ONLY with valid JSON like:
{ "relevance": 0.23 }

No extra words, no formatting, no explanation.
`;

    monitorIntervalId = setInterval(async () => {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];
      if (!tab || !tab.id) return;

      const [result] = await browser.tabs
        .executeScript(tab.id, {
          code: `
          (() => ({
            title: document.title,
            url: window.location.href,
            text: document.body.innerText.slice(0, 10000)
          }))();
        `,
        })
        .catch(() => [{}]);

      if (!result || !result.text) return;

      const fullPrompt = `
${systemPrompt}

User work prompt:
${workPrompt}

Tab title:
${result.title}

Tab URL:
${result.url}

Tab content:
${result.text}
`;

      const res = await fetch(TOGETHER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-ai/DeepSeek-V3",
          messages: [
            {
              role: "user",
              content: fullPrompt,
            },
          ],
        }),
      });

      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || "";

      const match = text.match(/"relevance"\s*:\s*(\d+(\.\d+)?)/);
      const relevance = match ? parseFloat(match[1]) : 1;

      const tabinfo = `
        Tab title:
        ${result.title}

        Tab URL:
        ${result.url}

        Tab content:
        ${result.text}
        `;
      console.log("Tab relevance:", relevance);
      console.log("Tab info: ", tabinfo);

      if (relevance < 0.4) {
        browser.tabs.remove(tab.id);
      }
    }, 10000);
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.togetherApiKey) {
    browser.storage.local.get("workPrompt").then(({ workPrompt }) => {
      if (workPrompt) startMonitoring(workPrompt);
    });
  }

  if (changes.workPrompt) {
    startMonitoring(changes.workPrompt.newValue);
  }
});

browser.storage.local.get("workPrompt").then(({ workPrompt }) => {
  if (workPrompt) startMonitoring(workPrompt);
});
