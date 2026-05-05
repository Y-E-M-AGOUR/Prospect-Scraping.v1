# Data Contract

## Extension To Apps Script Payload

The extension sends a `text/plain` POST body containing JSON. This avoids browser preflight friction with Apps Script web apps.

```json
{
  "secret": "shared-secret",
  "prospect": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "currentTitle": "Chief Financial Officer",
    "currentCompany": "Example Corp",
    "linkedInUrl": "https://www.linkedin.com/in/example/",
    "source": "LinkedIn",
    "capturedAt": "2026-05-05T19:45:00.000Z",
    "roleSource": "experience",
    "roleConfidence": "high",
    "notes": ""
  }
}
```

## Google Sheet Columns

The Apps Script backend writes these columns:

1. Captured At
2. First Name
3. Last Name
4. Current Position Title
5. Current Company
6. LinkedIn URL
7. Estimated Company Revenue
8. Email
9. Email Status
10. Direct Mobile
11. ZoomInfo Match Status
12. ZoomInfo Confidence
13. ZoomInfo Contact ID
14. Role Source
15. Role Confidence
16. Notes

## Backend Response

Successful append:

```json
{
  "ok": true,
  "row": 2,
  "zoomInfoStatus": "matched",
  "enrichmentSummary": {
    "emailFound": true,
    "mobileFound": true,
    "revenueFound": true
  }
}
```

Error:

```json
{
  "ok": false,
  "error": "Unauthorized request."
}
```
