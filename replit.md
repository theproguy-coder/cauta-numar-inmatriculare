# Cauta Numar de Inmatriculare

A CLI automation tool that checks the availability of Romanian car license plate numbers on the DGPCI website.

## Overview

The script iterates through all number combinations (1–99) for a given county and letter suffix, checking each against the DGPCI website using Puppeteer. Results are saved to `db.json`.

## Stack

- **Runtime**: Bun 1.3
- **Language**: TypeScript
- **Browser Automation**: puppeteer-extra + puppeteer-extra-plugin-recaptcha
- **Captcha Solving**: 2captcha (or compatible provider)

## Running the Script

```bash
bun --env-file .env index.ts
```

## Required Environment Variables

Set these in `.env` (see `.env.template`):

| Variable | Description | Example |
|---|---|---|
| `judet` | County acronym | `CJ` |
| `format` | Plate suffix format | `ABC` |
| `captcha-id` | Captcha provider ID | `2captcha` |
| `captcha-token` | Captcha provider API token | `your_token` |

## Data Storage

Results are saved to `db.json` in the format:
```json
{ "CJ01ABC": "GASIT", "CJ02ABC": "X" }
```
- `GASIT` = plate number is available
- `X` = plate number is taken

The script skips already-checked plates on restart.
