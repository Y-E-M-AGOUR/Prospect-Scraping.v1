# Apps Script Properties Visual

In Apps Script, open `Project Settings > Script Properties > Edit script properties`.

Use this visual as the fill-in guide. Values should be pasted without quotes.

```text
+-------------------------------+--------------------------------------------------+
| Property                      | Value                                            |
+-------------------------------+--------------------------------------------------+
| SPREADSHEET_ID                | 1AbCdefGHIjkLmNoPqRstUvWxYz1234567890           |
| SHEET_NAME                    | Prospects                                        |
| SHARED_SECRET                 | paste-a-long-random-secret-you-create            |
| ZOOMINFO_USERNAME             | your ZoomInfo API username                       |
| ZOOMINFO_PASSWORD             | your ZoomInfo API password                       |
| ZOOMINFO_BASE_URL             | https://api.zoominfo.com                         |
| ZOOMINFO_AUTH_PATH            | /authenticate                                    |
| ZOOMINFO_ENRICH_CONTACT_PATH  | /enrich/contact                                  |
| ZOOMINFO_ENABLED              | true                                             |
+-------------------------------+--------------------------------------------------+
```

## Where Values Come From

```text
Google Sheet URL
https://docs.google.com/spreadsheets/d/1AbCdefGHIjkLmNoPqRstUvWxYz1234567890/edit
                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                      SPREADSHEET_ID

Chrome extension settings
Apps Script Web App URL  -> paste the deployed Apps Script /exec URL
Shared Secret            -> same value as SHARED_SECRET
```

## If ZoomInfo Uses An API Key

If your ZoomInfo tenant uses an API key instead of username/password, use these rows instead of `ZOOMINFO_USERNAME` and `ZOOMINFO_PASSWORD`:

```text
+-------------------------------+--------------------------------------------------+
| Property                      | Value                                            |
+-------------------------------+--------------------------------------------------+
| ZOOMINFO_API_KEY              | paste-your-ZoomInfo-api-key                      |
| ZOOMINFO_API_KEY_HEADER       | Authorization                                    |
| ZOOMINFO_AUTH_HEADER_PREFIX   | Bearer                                           |
+-------------------------------+--------------------------------------------------+
```

## Minimum Required Rows

For live Google Sheets capture without ZoomInfo, these are the minimum rows:

```text
SPREADSHEET_ID
SHARED_SECRET
ZOOMINFO_ENABLED = false
```

For Google Sheets capture plus ZoomInfo enrichment, use:

```text
SPREADSHEET_ID
SHARED_SECRET
ZOOMINFO_USERNAME
ZOOMINFO_PASSWORD
ZOOMINFO_ENABLED = true
```

`SHEET_NAME` is optional. If omitted, the backend uses `Prospects`.
