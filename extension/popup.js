const state = {
  prospect: null,
  busy: false
};

const fields = {};

document.addEventListener("DOMContentLoaded", () => {
  for (const id of ["firstName", "lastName", "currentTitle", "currentCompany", "linkedInUrl", "notes"]) {
    fields[id] = document.getElementById(id);
  }

  document.getElementById("captureButton").addEventListener("click", captureFromPage);
  document.getElementById("appendButton").addEventListener("click", appendToSheet);
  document.getElementById("optionsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());

  captureFromPage();
});

async function captureFromPage() {
  setBusy(true);
  setStatus("Capturing the active LinkedIn profile.", "neutral");

  try {
    const tab = await getActiveTab();
    if (!tab || !isLinkedInProfileUrl(tab.url || "")) {
      throw new Error("Open a LinkedIn profile or Sales Navigator lead page first.");
    }

    let response;
    try {
      response = await sendTabMessage(tab.id, { type: "TCB_CAPTURE_PROFILE" });
    } catch (_error) {
      await injectContentScript(tab.id);
      response = await sendTabMessage(tab.id, { type: "TCB_CAPTURE_PROFILE" });
    }

    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "LinkedIn capture failed.");
    }

    state.prospect = response.prospect;
    renderProspect(response.prospect);

    const warningText = response.prospect.extractionWarnings && response.prospect.extractionWarnings.length
      ? ` Review: ${response.prospect.extractionWarnings.join(" ")}`
      : "";
    setStatus(`Captured ${response.prospect.firstName || "prospect"} ${response.prospect.lastName || ""}.${warningText}`, "success");
    document.getElementById("appendButton").disabled = false;
  } catch (error) {
    setStatus(error.message || String(error), "error");
    document.getElementById("appendButton").disabled = true;
  } finally {
    setBusy(false);
  }
}

async function appendToSheet() {
  setBusy(true);
  setStatus("Appending row and requesting ZoomInfo enrichment.", "neutral");

  try {
    const settings = await storageGet(["scriptUrl", "sharedSecret"]);
    if (!settings.scriptUrl || !settings.sharedSecret) {
      chrome.runtime.openOptionsPage();
      throw new Error("Add the Apps Script URL and shared secret in settings.");
    }

    const prospect = collectProspect();
    validateProspect(prospect);

    const response = await fetch(settings.scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        secret: settings.sharedSecret,
        prospect
      })
    });

    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result && result.error ? result.error : "Google Sheets append failed.");
    }

    setStatus(`Appended row ${result.row || ""}. ZoomInfo status: ${result.zoomInfoStatus || "complete"}.`, "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

function renderProspect(prospect) {
  fields.firstName.value = prospect.firstName || "";
  fields.lastName.value = prospect.lastName || "";
  fields.currentTitle.value = prospect.currentTitle || "";
  fields.currentCompany.value = prospect.currentCompany || "";
  fields.linkedInUrl.value = prospect.linkedInUrl || "";
  fields.notes.value = "";

  document.getElementById("captureDetails").textContent = JSON.stringify({
    headline: prospect.headline,
    roleSource: prospect.roleSource,
    roleConfidence: prospect.roleConfidence,
    rejectedCurrentRoles: prospect.rejectedCurrentRoles || [],
    warnings: prospect.extractionWarnings || []
  }, null, 2);
}

function collectProspect() {
  return {
    firstName: fields.firstName.value.trim(),
    lastName: fields.lastName.value.trim(),
    currentTitle: fields.currentTitle.value.trim(),
    currentCompany: fields.currentCompany.value.trim(),
    linkedInUrl: fields.linkedInUrl.value.trim(),
    notes: fields.notes.value.trim(),
    source: "LinkedIn",
    capturedAt: state.prospect && state.prospect.capturedAt ? state.prospect.capturedAt : new Date().toISOString(),
    roleSource: state.prospect && state.prospect.roleSource ? state.prospect.roleSource : "manual",
    roleConfidence: state.prospect && state.prospect.roleConfidence ? state.prospect.roleConfidence : "manual"
  };
}

function validateProspect(prospect) {
  const missing = [];
  if (!prospect.firstName) missing.push("first name");
  if (!prospect.lastName) missing.push("last name");
  if (!prospect.currentTitle) missing.push("current title");
  if (!prospect.currentCompany) missing.push("current company");
  if (!prospect.linkedInUrl) missing.push("LinkedIn URL");

  if (missing.length) {
    throw new Error(`Add ${missing.join(", ")} before appending.`);
  }
}

function setBusy(isBusy) {
  state.busy = isBusy;
  document.getElementById("captureButton").disabled = isBusy;
  document.getElementById("appendButton").disabled = isBusy || !state.prospect;
}

function setStatus(message, kind) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = `status ${kind === "success" ? "success" : kind === "error" ? "error" : ""}`;
}

function isLinkedInProfileUrl(url) {
  return /^https:\/\/www\.linkedin\.com\/(in|sales\/lead|sales\/people)\//i.test(url);
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function injectContentScript(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}
