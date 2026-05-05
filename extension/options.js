document.addEventListener("DOMContentLoaded", async () => {
  const settings = await storageGet(["scriptUrl", "sharedSecret"]);
  document.getElementById("scriptUrl").value = settings.scriptUrl || "";
  document.getElementById("sharedSecret").value = settings.sharedSecret || "";

  document.getElementById("settingsForm").addEventListener("submit", saveSettings);
  document.getElementById("testButton").addEventListener("click", testEndpoint);
});

async function saveSettings(event) {
  event.preventDefault();

  const scriptUrl = document.getElementById("scriptUrl").value.trim();
  const sharedSecret = document.getElementById("sharedSecret").value.trim();

  if (!scriptUrl || !sharedSecret) {
    setStatus("Add both the Apps Script URL and shared secret.", "error");
    return;
  }

  await storageSet({ scriptUrl, sharedSecret });
  setStatus("Settings saved.", "success");
}

async function testEndpoint() {
  const scriptUrl = document.getElementById("scriptUrl").value.trim();
  if (!scriptUrl) {
    setStatus("Add the Apps Script URL before testing.", "error");
    return;
  }

  try {
    setStatus("Testing endpoint.", "neutral");
    const url = new URL(scriptUrl);
    url.searchParams.set("health", "1");

    const response = await fetch(url.toString());
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result && result.error ? result.error : "Endpoint did not return ok.");
    }

    setStatus("Endpoint is reachable.", "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

function setStatus(message, kind) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = `status ${kind === "success" ? "success" : kind === "error" ? "error" : ""}`;
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.sync.set(values, resolve));
}
