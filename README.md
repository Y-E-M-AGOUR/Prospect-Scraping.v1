# TCB Prospect Capture MVP

This workspace contains a first-pass Chrome extension and Google Apps Script backend for capturing LinkedIn prospects into Google Sheets.

The MVP flow is:

1. Open a LinkedIn profile or Sales Navigator lead page.
2. Click the extension.
3. Review the extracted prospect fields.
4. Append the row to Google Sheets.
5. Apps Script enriches the prospect through ZoomInfo and writes email, direct mobile, and estimated company revenue to the same row.

## Files

- `extension/` - loadable Chrome Manifest V3 extension.
- `apps-script/Code.gs` - Google Apps Script web app backend.
- `docs/data-contract.md` - sheet columns and request payload.
- `docs/setup.md` - detailed setup steps.

## Important Notes

- ZoomInfo credentials are intentionally kept in Apps Script properties, not in the Chrome extension.
- The extension only captures data visible on the active LinkedIn page and lets the user review/edit before appending.
- LinkedIn page structure changes often, so the scraper uses conservative heuristics and exposes capture warnings in the popup.
- Confirm LinkedIn, ZoomInfo, and internal data-handling policies before using this beyond a personal MVP.

## Quick Start

1. Create a Google Sheet.
2. Paste `apps-script/Code.gs` into the Sheet's Apps Script project.
3. Add script properties described in `docs/setup.md`.
4. Deploy the script as a web app.
5. Load `extension/` as an unpacked Chrome extension.
6. Open extension settings and paste the Apps Script web app URL plus shared secret.

The sheet can be blank. The backend writes headers automatically on first append.
