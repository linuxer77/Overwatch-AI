# Overwatch AI 🛡️

**Overwatch AI** is an intelligent distraction-killing browser extension designed to keep you focused while coding. By evaluating the content and intent of your browser tabs against your active coding goal, it detects off-topic distractions (social media, video rabbit holes, online shopping) in real-time and gently intervenes before you lose your flow state.

Powered by **TypeSafe AI's [Jev System One Model](https://typesafe.ai/blog/introducing-system-one-models-and-jev)**.

---

## ⚡ What Changed in v2.0 (Powered by Jev AI)

1. **Sub-200ms Decision Engine (Jev AI)**:
   - Powered exclusively by TypeSafe AI's **Jev** System One model (~70–180ms response time).
   - Fast enough to evaluate tabs the millisecond they load without lagging your browser.
2. **Type-Safe Probabilities & Zero Hallucinations**:
   - Replaced fragile regex parsing (`text.match(/"relevance": .../)`) with Jev's typed primitives (`choice` and `noul`).
   - Uses calibrated confidence scores to prevent false positives on obscure documentation or technical wikis.
3. **Event-Driven Architecture**:
   - Eliminated the blind 10-second `setInterval` loop.
   - Now reacts selectively to tab navigation (`tabs.onUpdated`) and tab switches (`tabs.onActivated`).
   - Features a smart 30-minute in-memory cache so whitelisted documentation pages cost 0 API calls on repeat visits.
4. **Graceful Warning vs. Nuclear Close**:
   - Instead of instantly closing tabs without warning, an in-page 5-second countdown banner appears:
     > *"Overwatch AI: This page appears off-topic from your focus. Closing in 5s... [Keep Tab] [Close Now]"*
   - Clicking **"Keep Tab"** whitelists the tab for the remainder of your session.
   - Want hardcore focus? Toggle **"Instant Close"** mode in the popup anytime.
5. **Tab Graveyard (Undo / Restore)**:
   - If a tab is closed, it is saved to the **Recently Closed Distractions** list in the popup.
   - Reopen any accidentally closed tab with a single click (`↺ Restore`).
6. **Built-in & Custom Whitelists**:
   - Internal protocols (`about:`, `moz-extension:`) and local dev servers (`localhost`, `127.0.0.1`) are never touched.
   - Dev essentials (GitHub, StackOverflow, MDN, package registries, search engines) are automatically permitted.
   - Add custom domain allowlists directly inside the popup.
7. **Firefox Manifest V3 Ready**:
   - Modernized with Manifest V3 scripting permissions, Gecko IDs, and `browser.scripting` support.

---

## 🚀 Installation in Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **"Load Temporary Add-on..."**.
3. Select the [`manifest.json`](manifest.json) file inside this repository directory.
4. Click the Overwatch AI icon in your browser toolbar to open the popup.
5. Enter your **TypeSafe API Key** (from [console.typesafe.ai/keys](https://console.typesafe.ai/keys)).
6. Enter your active coding focus (e.g., *"Building a Go REST API with PostgreSQL"*).
7. Start coding!

---

## 🧩 Architecture

```text
[ Browser Tab Activated / Navigated ]
                  │
                  ▼
   [ Internal URL / Allowed Domain? ] ──── Yes ───► (Bypass / Allow)
                  │ No
                  ▼
         [ In Memory Cache? ] ──────────── Yes ───► (Cached Verdict)
                  │ No
                  ▼
    [ Extract Clean Page Snippet ]
                  │
                  ▼
      [ TypeSafe Jev AI Request ]
         POST /v1/systemone
                  │
      ├── Questions:
      │     ├── category: choice (coding_task, dev_tool, neutral, distraction)
      │     └── is_distraction: noul (probability)
      │
                  ▼
   [ Confidence & Probability Gating ]
      │                                 │
      ├─► Distraction (High Conf)       └─► Relevant / Unsure
      │                                       │
      ▼                                       ▼
  [ Grace Banner (5s) or Instant Close ]   [ Cache as Allowed ]
      │
      └─► Saved to Tab Graveyard
```

---

## ⚙️ Configuration

- **Focus Goal**: Update your prompt whenever you switch tasks.
- **Monitoring Switch**: Easily pause monitoring when taking a deliberate break.
- **Intervention Mode**:
  - `5s Grace Warning`: Gives you time to keep a research tab that looked like an edge case.
  - `Instant Close`: Closes off-topic tabs immediately.
- **Allowed Domains**: Whitelist specific domains for your current workflow (e.g. `youtube.com` if following a video tutorial).
