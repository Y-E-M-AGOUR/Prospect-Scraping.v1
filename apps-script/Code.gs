var SHEET_HEADERS = [
  "Captured At",
  "First Name",
  "Last Name",
  "Current Position Title",
  "Current Company",
  "LinkedIn URL",
  "Estimated Company Revenue",
  "Email",
  "Email Status",
  "Direct Mobile",
  "ZoomInfo Match Status",
  "ZoomInfo Confidence",
  "ZoomInfo Contact ID",
  "Role Source",
  "Role Confidence",
  "Notes"
];

function doGet(_event) {
  return json_({
    ok: true,
    service: "tcb-prospect-capture",
    timestamp: new Date().toISOString()
  });
}

function doPost(event) {
  try {
    var body = parseBody_(event);
    assertSharedSecret_(body.secret);

    var prospect = normalizeProspect_(body.prospect || body);
    var enrichment = safeEnrichWithZoomInfo_(prospect);
    var row = appendProspect_(prospect, enrichment);

    return json_({
      ok: true,
      row: row,
      zoomInfoStatus: enrichment.matchStatus,
      enrichmentSummary: {
        emailFound: Boolean(enrichment.email),
        mobileFound: Boolean(enrichment.directMobile),
        revenueFound: Boolean(enrichment.companyRevenue)
      }
    });
  } catch (error) {
    return json_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function parseBody_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("Missing request body.");
  }

  try {
    return JSON.parse(event.postData.contents);
  } catch (_error) {
    throw new Error("Request body must be JSON.");
  }
}

function assertSharedSecret_(incomingSecret) {
  var expectedSecret = getRequiredProp_("SHARED_SECRET");
  if (!incomingSecret || incomingSecret !== expectedSecret) {
    throw new Error("Unauthorized request.");
  }
}

function normalizeProspect_(prospect) {
  var normalized = {
    firstName: clean_(prospect.firstName),
    lastName: clean_(prospect.lastName),
    currentTitle: clean_(prospect.currentTitle),
    currentCompany: clean_(prospect.currentCompany),
    linkedInUrl: clean_(prospect.linkedInUrl),
    source: clean_(prospect.source) || "LinkedIn",
    capturedAt: clean_(prospect.capturedAt) || new Date().toISOString(),
    roleSource: clean_(prospect.roleSource),
    roleConfidence: clean_(prospect.roleConfidence),
    notes: clean_(prospect.notes)
  };

  var missing = [];
  if (!normalized.firstName) missing.push("firstName");
  if (!normalized.lastName) missing.push("lastName");
  if (!normalized.currentTitle) missing.push("currentTitle");
  if (!normalized.currentCompany) missing.push("currentCompany");
  if (!normalized.linkedInUrl) missing.push("linkedInUrl");

  if (missing.length) {
    throw new Error("Missing required prospect fields: " + missing.join(", "));
  }

  return normalized;
}

function appendProspect_(prospect, enrichment) {
  var spreadsheetId = getRequiredProp_("SPREADSHEET_ID");
  var sheetName = getProp_("SHEET_NAME", "Prospects");
  var lock = LockService.getScriptLock();

  lock.waitLock(30000);
  try {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    ensureHeaders_(sheet);

    sheet.appendRow([
      prospect.capturedAt,
      prospect.firstName,
      prospect.lastName,
      prospect.currentTitle,
      prospect.currentCompany,
      prospect.linkedInUrl,
      enrichment.companyRevenue || "",
      enrichment.email || "",
      enrichment.emailStatus || "",
      enrichment.directMobile || "",
      enrichment.matchStatus || "",
      enrichment.confidence || "",
      enrichment.contactId || "",
      prospect.roleSource || "",
      prospect.roleConfidence || "",
      prospect.notes || ""
    ]);

    SpreadsheetApp.flush();
    return sheet.getLastRow();
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    return;
  }

  var firstRow = sheet.getRange(1, 1, 1, SHEET_HEADERS.length).getValues()[0];
  var isBlank = firstRow.every(function (value) {
    return !value;
  });

  if (isBlank) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
  }
}

function safeEnrichWithZoomInfo_(prospect) {
  try {
    return enrichWithZoomInfo_(prospect);
  } catch (error) {
    var enrichment = emptyEnrichment_("zoominfo_error");
    enrichment.confidence = error && error.message ? error.message.substring(0, 250) : String(error);
    return enrichment;
  }
}

function enrichWithZoomInfo_(prospect) {
  if (String(getProp_("ZOOMINFO_ENABLED", "true")).toLowerCase() === "false") {
    return emptyEnrichment_("zoominfo_disabled");
  }

  if (!hasZoomInfoCredentials_()) {
    return emptyEnrichment_("zoominfo_not_configured");
  }

  var authHeaders = getZoomInfoAuthHeaders_();
  var baseUrl = getProp_("ZOOMINFO_BASE_URL", "https://api.zoominfo.com");
  var enrichPath = getProp_("ZOOMINFO_ENRICH_CONTACT_PATH", "/enrich/contact");
  var payload = {
    matchPersonInput: [
      {
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        companyName: prospect.currentCompany,
        jobTitle: prospect.currentTitle,
        personUrl: prospect.linkedInUrl
      }
    ]
  };

  var outputFields = getZoomInfoOutputFields_();
  if (outputFields.length) {
    payload.outputFields = outputFields;
  }

  var response = fetchJson_(joinUrl_(baseUrl, enrichPath), {
    method: "post",
    contentType: "application/json",
    headers: authHeaders,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return mapZoomInfoResponse_(response);
}

function hasZoomInfoCredentials_() {
  if (getProp_("ZOOMINFO_API_KEY", "")) {
    return true;
  }
  return Boolean(getProp_("ZOOMINFO_USERNAME", "") && getProp_("ZOOMINFO_PASSWORD", ""));
}

function getZoomInfoAuthHeaders_() {
  var apiKey = getProp_("ZOOMINFO_API_KEY", "");
  if (apiKey) {
    var apiKeyHeader = getProp_("ZOOMINFO_API_KEY_HEADER", "");
    if (apiKeyHeader) {
      var headers = {};
      headers[apiKeyHeader] = apiKey;
      return headers;
    }
    return {
      Authorization: buildAuthHeader_(apiKey)
    };
  }

  return {
    Authorization: buildAuthHeader_(getZoomInfoToken_())
  };
}

function getZoomInfoToken_() {
  var cache = CacheService.getScriptCache();
  var cachedToken = cache.get("ZOOMINFO_TOKEN");
  if (cachedToken) {
    return cachedToken;
  }

  var baseUrl = getProp_("ZOOMINFO_BASE_URL", "https://api.zoominfo.com");
  var authPath = getProp_("ZOOMINFO_AUTH_PATH", "/authenticate");
  var usernameField = getProp_("ZOOMINFO_AUTH_USERNAME_FIELD", "username");
  var passwordField = getProp_("ZOOMINFO_AUTH_PASSWORD_FIELD", "password");
  var payload = {};

  payload[usernameField] = getRequiredProp_("ZOOMINFO_USERNAME");
  payload[passwordField] = getRequiredProp_("ZOOMINFO_PASSWORD");

  var response = fetchJson_(joinUrl_(baseUrl, authPath), {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var token = firstValue_(response, [
    "jwt",
    "token",
    "access_token",
    "accessToken",
    "data.jwt",
    "data.token",
    "data.access_token",
    "data.accessToken"
  ]);

  if (!token) {
    throw new Error("ZoomInfo auth response did not include a token.");
  }

  cache.put("ZOOMINFO_TOKEN", String(token), Number(getProp_("ZOOMINFO_TOKEN_TTL_SECONDS", "3300")));
  return String(token);
}

function buildAuthHeader_(token) {
  var prefix = getProp_("ZOOMINFO_AUTH_HEADER_PREFIX", "Bearer");
  return prefix ? prefix + " " + token : String(token);
}

function getZoomInfoOutputFields_() {
  var configured = getProp_("ZOOMINFO_OUTPUT_FIELDS", "");
  var value = configured || [
    "id",
    "firstName",
    "lastName",
    "jobTitle",
    "companyName",
    "companyRevenue",
    "revenue",
    "email",
    "emailStatus",
    "mobilePhone",
    "directPhone",
    "phone",
    "confidenceScore"
  ].join(",");

  return value
    .split(",")
    .map(function (field) {
      return field.trim();
    })
    .filter(Boolean);
}

function mapZoomInfoResponse_(response) {
  var contact = findBestContactObject_(response) || response;
  var enrichment = {
    companyRevenue: firstValue_(contact, [
      "companyRevenue",
      "company.revenue",
      "company.revenueRange",
      "company.companyRevenue",
      "revenue",
      "revenueRange"
    ]) || firstValue_(response, [
      "companyRevenue",
      "company.revenue",
      "company.revenueRange",
      "revenue",
      "revenueRange"
    ]),
    email: firstValue_(contact, [
      "email",
      "emailAddress",
      "workEmail",
      "emails.0.email",
      "emails.0.address",
      "emails.0"
    ]) || firstValue_(response, [
      "email",
      "emailAddress",
      "data.0.email",
      "data.0.emailAddress"
    ]),
    emailStatus: firstValue_(contact, [
      "emailStatus",
      "emailValidationStatus",
      "emailConfidence",
      "emailQuality",
      "emails.0.status"
    ]),
    directMobile: firstValue_(contact, [
      "mobilePhone",
      "mobile",
      "cellPhone",
      "directMobile",
      "directPhone",
      "phone",
      "phones.0.number",
      "phoneNumbers.0.number"
    ]),
    matchStatus: firstValue_(contact, [
      "matchStatus",
      "status",
      "resultStatus"
    ]) || firstValue_(response, [
      "matchStatus",
      "status",
      "resultStatus"
    ]),
    confidence: firstValue_(contact, [
      "confidence",
      "confidenceScore",
      "matchConfidence",
      "score"
    ]),
    contactId: firstValue_(contact, [
      "id",
      "personId",
      "contactId",
      "zoomInfoContactId"
    ])
  };

  if (!enrichment.matchStatus) {
    enrichment.matchStatus = enrichment.email || enrichment.directMobile || enrichment.companyRevenue
      ? "matched"
      : "no_match";
  }

  return enrichment;
}

function emptyEnrichment_(status) {
  return {
    companyRevenue: "",
    email: "",
    emailStatus: "",
    directMobile: "",
    matchStatus: status,
    confidence: "",
    contactId: ""
  };
}

function findBestContactObject_(value) {
  var candidates = [];
  collectContactCandidates_(value, candidates, 0);

  if (!candidates.length) {
    return null;
  }

  candidates.sort(function (a, b) {
    return b.score - a.score;
  });
  return candidates[0].value;
}

function collectContactCandidates_(value, candidates, depth) {
  if (depth > 8 || value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(function (item) {
      collectContactCandidates_(item, candidates, depth + 1);
    });
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  var score = 0;
  if (firstValue_(value, ["email", "emailAddress", "workEmail", "emails.0.email", "emails.0"])) score += 5;
  if (firstValue_(value, ["mobilePhone", "directMobile", "directPhone", "phone", "phones.0.number"])) score += 4;
  if (firstValue_(value, ["companyRevenue", "company.revenue", "revenue"])) score += 3;
  if (firstValue_(value, ["firstName", "lastName", "jobTitle", "companyName"])) score += 2;

  if (score >= 4) {
    candidates.push({ value: value, score: score });
  }

  Object.keys(value).forEach(function (key) {
    collectContactCandidates_(value[key], candidates, depth + 1);
  });
}

function firstValue_(object, paths) {
  for (var i = 0; i < paths.length; i += 1) {
    var value = getPath_(object, paths[i]);
    var scalar = scalarValue_(value);
    if (scalar !== "") {
      return scalar;
    }
  }
  return "";
}

function getPath_(object, path) {
  var parts = path.split(".");
  var current = object;

  for (var i = 0; i < parts.length; i += 1) {
    if (current === null || current === undefined) {
      return "";
    }

    var part = parts[i];
    if (Array.isArray(current)) {
      var index = Number(part);
      current = Number.isInteger(index) ? current[index] : current[0];
      if (!Number.isInteger(index)) {
        i -= 1;
      }
    } else if (typeof current === "object") {
      current = objectValue_(current, part);
    } else {
      return "";
    }
  }

  return current;
}

function objectValue_(object, key) {
  if (Object.prototype.hasOwnProperty.call(object, key)) {
    return object[key];
  }

  var lowerKey = key.toLowerCase();
  var matchingKey = Object.keys(object).find(function (candidate) {
    return candidate.toLowerCase() === lowerKey;
  });

  return matchingKey ? object[matchingKey] : "";
}

function scalarValue_(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.length ? scalarValue_(value[0]) : "";
  }

  if (typeof value === "object") {
    return scalarValue_(firstValue_(value, ["value", "email", "address", "number", "name", "displayName"]));
  }

  return clean_(value);
}

function fetchJson_(url, options) {
  var response = UrlFetchApp.fetch(url, options || {});
  var code = response.getResponseCode();
  var text = response.getContentText();
  var data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      throw new Error("Expected JSON response from " + url + ". Received: " + text.substring(0, 250));
    }
  }

  if (code < 200 || code >= 300) {
    throw new Error("Request to " + url + " failed with " + code + ": " + text.substring(0, 500));
  }

  return data;
}

function joinUrl_(baseUrl, path) {
  return String(baseUrl).replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
}

function getRequiredProp_(name) {
  var value = getProp_(name, "");
  if (!value) {
    throw new Error("Missing script property: " + name);
  }
  return value;
}

function getProp_(name, defaultValue) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  return value === null || value === undefined || value === "" ? defaultValue : value;
}

function clean_(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
