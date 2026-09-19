# Overwatch AI

Firefox extension that closes tabs unrelated to what you're working on.

Give it your current work prompt (e.g. `building an auth service in Go`), and it evaluates new and active tabs against that prompt using [TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev). If you open off-topic tabs (YouTube, Reddit, social media, random browsing), it warns you and closes them.

---

## What It Does

- **Sub-200ms evaluation**: Uses TypeSafe Jev (`jev-latest`) to classify tabs in ~100ms instead of waiting seconds for a slow LLM.
- **Event-driven**: Only checks when you switch tabs or a new page finishes loading. Doesn't run annoying constant background loops.
- **5s warning before closing**: Shows a quick 5-second countdown on distracting tabs so you can click "Keep Tab" if it was actually useful.
- **Tab recovery**: Any tab that gets closed is saved in the popup list so you can reopen it with one click.
- **Allowlist**: Automatically ignores `localhost`, developer documentation, GitHub, and search engines. You can also add custom domains.

---

## Setup (Firefox)

1. Go to `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...** and pick `manifest.json`.
3. Open the extension popup from your toolbar.
4. Enter your TypeSafe API key (from [console.typesafe.ai/keys](https://console.typesafe.ai/keys)).
5. Enter what you're working on and leave it running.

---

## How It Works

```text
[ Tab Opened or Switched ]
            │
    [ Whitelisted / Cached? ] ── Yes ──► (Ignore)
            │ No
            ▼
    [ Send title & excerpt to Jev ]
            │
    [ Is tab distracting? ]
      ├─► Yes ──► Show 5s warning ──► Close & save to history
      └─► No  ──► Cache as allowed
```
