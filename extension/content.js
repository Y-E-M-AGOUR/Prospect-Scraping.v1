(() => {
  if (window.__tcbProspectCaptureLoaded) {
    return;
  }
  window.__tcbProspectCaptureLoaded = true;

  const EXCLUDED_TITLE_PATTERNS = [
    /\b(board|board member|board director|board observer|board advisor|advisory board)\b/i,
    /\b(advisor|adviser|advisory)\b/i,
    /\b(volunteer|pro bono)\b/i,
    /\b(mentor|coach)\b/i
  ];

  const PERSONAL_COMPANY_PATTERNS = [
    /\bself[-\s]?employed\b/i,
    /\bsole proprietorship\b/i,
    /\bsole proprietor\b/i,
    /\bfreelance\b/i,
    /\bindependent consultant\b/i,
    /\bindependent consulting\b/i,
    /\bconsulting practice\b/i,
    /\bpersonal venture\b/i
  ];

  const EMPLOYMENT_TYPE_PATTERN = /\b(full-time|part-time|self-employed|freelance|contract|internship|apprenticeship|temporary|seasonal)\b/i;
  const DATE_PATTERN = /\b(present|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|\d{4})\b/i;
  const DURATION_PATTERN = /\b\d+\s+(yr|yrs|year|years|mo|mos|month|months)\b/i;
  const LOCATION_PATTERN = /\b(remote|hybrid|on-site|greater|area|united states|metropolitan)\b/i;
  const COMPANY_SUFFIX_PATTERN = /\s*[\u00b7|]\s*(full-time|part-time|self-employed|freelance|contract|internship|apprenticeship|temporary|seasonal).*$/i;

  const NOISE_PATTERNS = [
    /^experience$/i,
    /^education$/i,
    /^company name$/i,
    /^title$/i,
    /^employment type$/i,
    /^dates employed$/i,
    /^location$/i,
    /^show more$/i,
    /^show less$/i,
    /^see more$/i,
    /^see all/i,
    /^profile photo$/i,
    /^background image$/i,
    /^connect$/i,
    /^message$/i,
    /^follow$/i,
    /^more$/i,
    /^contact info$/i,
    / logo$/i,
    / image$/i
  ];

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "TCB_CAPTURE_PROFILE") {
      return false;
    }

    try {
      sendResponse({ ok: true, prospect: captureProfile() });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    }

    return true;
  });

  function captureProfile() {
    const name = getName();
    const parsedName = parseName(name);
    const headline = getHeadline();
    const candidates = getExperienceCandidates();
    const selectedRole = chooseCurrentRole(candidates, headline);

    return {
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      currentTitle: selectedRole.title,
      currentCompany: selectedRole.company,
      linkedInUrl: getLinkedInUrl(),
      source: "LinkedIn",
      capturedAt: new Date().toISOString(),
      headline,
      roleSource: selectedRole.source,
      roleConfidence: selectedRole.confidence,
      extractionWarnings: buildWarnings(parsedName, selectedRole),
      rejectedCurrentRoles: candidates
        .filter((candidate) => candidate.current && !isValidOperatingRole(candidate).valid)
        .slice(0, 5)
        .map((candidate) => ({
          title: candidate.title,
          company: candidate.company,
          reason: isValidOperatingRole(candidate).reason
        }))
    };
  }

  function buildWarnings(parsedName, selectedRole) {
    const warnings = [];
    if (!parsedName.firstName || !parsedName.lastName) {
      warnings.push("Name extraction needs review.");
    }
    if (!selectedRole.title || !selectedRole.company) {
      warnings.push("Current operating role needs review.");
    }
    if (selectedRole.confidence === "low") {
      warnings.push("Role was inferred from the profile headline.");
    }
    return warnings;
  }

  function getLinkedInUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";

    if (url.pathname.startsWith("/in/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      url.pathname = `/${parts.slice(0, 2).join("/")}/`;
    }

    return url.toString();
  }

  function getName() {
    return queryText([
      "main h1",
      "h1.text-heading-xlarge",
      "[data-anonymize='person-name']",
      "h1"
    ]);
  }

  function getHeadline() {
    return queryText([
      "main [data-anonymize='headline']",
      "main .text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      ".ph5 .mt2 .text-body-medium"
    ]);
  }

  function queryText(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = normalizeText(element ? element.innerText || element.textContent : "");
      if (text) {
        return text;
      }
    }
    return "";
  }

  function parseName(name) {
    const clean = normalizeText(name)
      .replace(/\b(he\/him|she\/her|they\/them)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const parts = clean
      .split(" ")
      .filter(Boolean)
      .filter((part) => !/^(phd|ph\.d\.|mba|cpa|cfa|esq|jr\.?|sr\.?|ii|iii|iv)$/i.test(part.replace(/,/g, "")));

    return {
      firstName: parts[0] || "",
      lastName: parts.length > 1 ? parts[parts.length - 1] : ""
    };
  }

  function getExperienceCandidates() {
    const section = findSectionByHeading("experience");
    if (!section) {
      return [];
    }

    const listItems = Array.from(section.querySelectorAll("li.artdeco-list__item, li.pvs-list__paged-list-item, li"));
    const seen = new Set();
    const candidates = [];

    for (const item of listItems) {
      const lines = cleanLines(item.innerText || item.textContent || "");
      if (lines.length < 2) {
        continue;
      }

      const candidate = parseExperienceCandidate(lines);
      const key = `${candidate.title}|${candidate.company}|${candidate.dateText}`.toLowerCase();
      if (!candidate.title || !candidate.company || seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push(candidate);
    }

    return candidates;
  }

  function findSectionByHeading(label) {
    const sections = Array.from(document.querySelectorAll("main section, section"));
    for (const section of sections) {
      const heading = normalizeText(
        Array.from(section.querySelectorAll("h2, [role='heading']"))
          .map((element) => element.innerText || element.textContent || "")
          .join(" ")
      ).toLowerCase();

      const ariaLabel = normalizeText(section.getAttribute("aria-label") || "").toLowerCase();
      if (heading.includes(label) || ariaLabel.includes(label)) {
        return section;
      }
    }
    return null;
  }

  function parseExperienceCandidate(lines) {
    const dateLine = lines.find((line) => looksLikeDateLine(line)) || "";
    let title = lines[0] || "";
    let company = firstCompanyLine(lines.slice(1));

    if (lines.length > 2 && isEmploymentTypeLine(lines[1]) && !looksLikeDateLine(lines[2])) {
      company = cleanCompany(lines[0]);
      title = lines[2];
    }

    if (!company && lines.length > 1) {
      company = cleanCompany(lines[1]);
    }

    return {
      title: cleanRoleTitle(title),
      company: cleanCompany(company),
      dateText: dateLine,
      current: /\bpresent\b/i.test(dateLine),
      source: "experience",
      confidence: "high",
      rawLines: lines.slice(0, 10)
    };
  }

  function chooseCurrentRole(candidates, headline) {
    const currentOperatingRole = candidates.find((candidate) => {
      const validity = isValidOperatingRole(candidate);
      return candidate.current && validity.valid;
    });

    if (currentOperatingRole) {
      return currentOperatingRole;
    }

    const headlineRole = parseHeadlineRole(headline);
    if (headlineRole && isValidOperatingRole(headlineRole).valid) {
      return {
        ...headlineRole,
        source: "headline",
        confidence: "low"
      };
    }

    return {
      title: "",
      company: "",
      source: "none",
      confidence: "low"
    };
  }

  function parseHeadlineRole(headline) {
    const text = normalizeText(headline);
    const match = text.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s+\||$)/i);
    if (!match) {
      return null;
    }

    return {
      title: cleanRoleTitle(match[1]),
      company: cleanCompany(match[2]),
      current: true
    };
  }

  function isValidOperatingRole(candidate) {
    const title = candidate.title || "";
    const company = candidate.company || "";
    const text = `${title} ${company} ${(candidate.rawLines || []).join(" ")}`;

    if (EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
      return { valid: false, reason: "Excluded board, advisor, volunteer, mentor, or coach role." };
    }

    if (PERSONAL_COMPANY_PATTERNS.some((pattern) => pattern.test(text))) {
      return { valid: false, reason: "Excluded personal, independent, freelance, or sole-proprietor engagement." };
    }

    if (!title || !company) {
      return { valid: false, reason: "Missing title or company." };
    }

    return { valid: true, reason: "" };
  }

  function cleanLines(text) {
    const lines = normalizeText(text)
      .split("\n")
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .filter((line) => !NOISE_PATTERNS.some((pattern) => pattern.test(line)));

    return Array.from(new Set(lines));
  }

  function firstCompanyLine(lines) {
    const companyLine = lines.find((line) => {
      if (looksLikeDateLine(line) || isEmploymentTypeLine(line) || DURATION_PATTERN.test(line)) {
        return false;
      }
      if (LOCATION_PATTERN.test(line) && line.length < 45) {
        return false;
      }
      return true;
    });

    return companyLine ? cleanCompany(companyLine) : "";
  }

  function cleanRoleTitle(title) {
    return normalizeText(title)
      .replace(/^title\s*/i, "")
      .replace(/\s*[\u00b7|]\s*(full-time|part-time|contract|self-employed).*$/i, "")
      .trim();
  }

  function cleanCompany(company) {
    return normalizeText(company)
      .replace(/^company name\s*/i, "")
      .replace(COMPANY_SUFFIX_PATTERN, "")
      .trim();
  }

  function looksLikeDateLine(line) {
    return DATE_PATTERN.test(line) && (/\bpresent\b/i.test(line) || /[-\u2013]/.test(line) || /\d{4}/.test(line));
  }

  function isEmploymentTypeLine(line) {
    return EMPLOYMENT_TYPE_PATTERN.test(line) && line.length < 35;
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();
  }
})();
