# Setup Guide

## 1. Google Sheet

Create a Google Sheet for captured prospects. Copy the spreadsheet ID from its URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

The backend creates the header row automatically if the target sheet is empty.

## 2. Apps Script Backend

Open the Google Sheet, then go to `Extensions > Apps Script`. Replace the default script with the contents of `apps-script/Code.gs`.

In Apps Script, open `Project Settings > Script Properties` and add:

| Property | Required | Example |
| --- | --- | --- |
| `SPREADSHEET_ID` | Yes | `1AbC...` |
| `SHEET_NAME` | No | `Prospects` |
| `SHARED_SECRET` | Yes | A long random string |
| `ZOOMINFO_USERNAME` | Usually | ZoomInfo API username |
| `ZOOMINFO_PASSWORD` | Usually | ZoomInfo API password |
| `ZOOMINFO_API_KEY` | Optional | Use if your ZoomInfo tenant authenticates with an API key |
| `ZOOMINFO_API_KEY_HEADER` | Optional | Header name if using an API key header |
| `ZOOMINFO_BASE_URL` | No | `https://api.zoominfo.com` |
| `ZOOMINFO_AUTH_PATH` | No | `/authenticate` |
| `ZOOMINFO_ENRICH_CONTACT_PATH` | No | `/enrich/contact` |
| `ZOOMINFO_OUTPUT_FIELDS` | No | Comma-separated ZoomInfo fields |
| `ZOOMINFO_ENABLED` | No | `true` or `false` |

The defaults use common ZoomInfo Data API shapes:

```text
POST https://api.zoominfo.com/authenticate
POST https://api.zoominfo.com/enrich/contact
```

If your ZoomInfo contract exposes different endpoint paths, token response fields, auth header format, or output field names, update the script properties before testing.

## 3. Deploy Apps Script

In Apps Script:

1. Select `Deploy > New deployment`.
2. Choose `Web app`.
3. Set `Execute as` to `Me`.
4. Set access to `Anyone with the link` if your Workspace policy allows it.
5. Deploy and copy the `/exec` web app URL.

The shared secret still protects writes even when the web app is link-accessible.

## 4. Load the Chrome Extension

In Chrome:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Select `Load unpacked`.
4. Choose the local `extension/` folder.

Open the extension settings, then paste:

- Apps Script Web App URL
- Shared secret matching `SHARED_SECRET`

Use `Test Endpoint` to confirm the web app is reachable.

## 5. Capture a Prospect

Open a LinkedIn profile or Sales Navigator lead page, then click the extension. The popup extracts:

- First name
- Last name
- First valid current corporate operating role
- Current company
- LinkedIn URL

Review the fields, add optional notes, and click `Append To Sheet`.

## Role Selection Rules

The extension picks the first current role from the Experience section that is not a board, advisor, volunteer, mentor, coach, self-employed, freelance, independent consulting, or sole-proprietor engagement. If Experience cannot be parsed, it falls back to headline text like `Title at Company` and marks confidence as low.

## ZoomInfo Behavior

Apps Script appends the row even if ZoomInfo enrichment fails. The row's `ZoomInfo Match Status` column will show one of:

- `matched`
- `no_match`
- `zoominfo_not_configured`
- `zoominfo_disabled`
- `zoominfo_error`

This keeps prospect capture usable while you tune the ZoomInfo API contract.
