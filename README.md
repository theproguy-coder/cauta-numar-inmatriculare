# Verificare disponibilitate numar de inmatriculare — DGPCI

CLI tool scris in TypeScript/Bun care automatizeaza complet verificarea disponibilitatii numerelor de inmatriculare romanesti prin API-ul oficial DGPCI, cu rezolvare automata reCAPTCHA v2 via 2captcha si persistenta locala a rezultatelor.

---

## Motivatie si context

Verificarea manuala a disponibilitatii unui numar de inmatriculare pe [dgpci.mai.gov.ro](https://dgpci.mai.gov.ro/drpciv-forms/plate-number) este posibila, dar face cate un request protejat de reCAPTCHA v2 pentru fiecare verificare. Daca vrei sa identifici un numar specific dintr-o serie (ex: `B??RMS`), trebuie sa verifici sute de combinatii — manual imposibil practic.

Exista servicii comerciale care vand acest tip de verificare bulk la **~150 RON / 1000 numere**. Costul real al aceleiasi operatiuni rezolvand captcha-ul prin 2captcha este de **~$1 / 1000 numere** (aproximativ 4-5 RON), de ~30x mai ieftin.

Acest tool automatizeaza complet procesul fara a folosi un browser, direct la nivel de API.

---

## Arhitectura si flux de executie

```
┌─────────────────────────────────────────────┐
│                   index.ts                  │
│                                             │
│  1. load env vars (judet, format, token)    │
│  2. load db.json (state persistence)        │
│  3. for i in 1..999:                        │
│     a. skip if already in db.json           │
│     b. POST /in.php → 2captcha submit       │
│     c. poll GET /res.php → captcha token    │
│     d. POST /plate-status → DGPCI API       │
│     e. parse response → GASIT | X           │
│     f. write to db.json immediately         │
└─────────────────────────────────────────────┘
```

Procesul este **secvential** — un singur fir de executie, un numar verificat pe rand, fara concurenta. Fiecare verificare dureaza intre 20-40 de secunde, din care ~20s sunt latenta de rezolvare captcha.

---

## Stack

| Component | Detaliu |
|---|---|
| Runtime | Bun 1.x |
| Limbaj | TypeScript (ESNext, fara transpilare) |
| HTTP client | `fetch` nativ Bun |
| Captcha solver | 2captcha REST API |
| Persistenta | JSON local (`db.json`) |
| TLS | `NODE_TLS_REJECT_UNAUTHORIZED=0` (cert self-signed pe serverul DGPCI) |

---

## Endpointuri utilizate

### 1. DGPCI — Verificare numar inmatriculare

```
POST https://dgpci.mai.gov.ro/drpciv-forms-api/plate-status
```

**Headers:**
```http
Content-Type: application/json
Accept: application/json
Origin: https://dgpci.mai.gov.ro
Referer: https://dgpci.mai.gov.ro/drpciv-forms/plate-number
```

**Request body (JSON):**
```json
{
  "plateNumber": "B47RMS",
  "userEmail": "check@check.com",
  "language": "RO",
  "reCaptchaKey": "<token_returnat_de_2captcha>"
}
```

**Response body (JSON):**
```json
{
  "code": "available",
  "message": "Numarul de inmatriculare este disponibil",
  "errMessage": null
}
```

Campuri relevante din raspuns:
- `code` — `"available"` daca numarul e disponibil, altceva daca nu
- `message` — mesaj text in romana
- `errMessage` — eroare de validare (ex: captcha invalid, format gresit)

Pagina frontend (care genereaza contextul pentru captcha):
```
https://dgpci.mai.gov.ro/drpciv-forms/plate-number
```

---

### 2. 2captcha — Submit task reCAPTCHA v2

```
POST https://2captcha.com/in.php
Content-Type: application/x-www-form-urlencoded
```

**Body (form-urlencoded):**
```
key=<captcha-token>
method=userrecaptcha
googlekey=6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA
pageurl=https://dgpci.mai.gov.ro/drpciv-forms/plate-number
json=1
```

Parametrii cheie:
- `googlekey` — site key-ul reCAPTCHA embed in formularul DGPCI, fix: `6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA`
- `pageurl` — URL-ul paginii unde e embedat captcha-ul; Google valideaza originea tokenului

**Response (JSON):**
```json
{ "status": 1, "request": "78291038210" }
```

- `status: 1` = succes
- `request` = ID-ul task-ului, folosit la polling

---

### 3. 2captcha — Poll rezultat

```
GET https://2captcha.com/res.php?key=<token>&action=get&id=<request_id>&json=1
```

Se polleaza la fiecare **5 secunde**, maxim **30 de incercari** (150 secunde timeout).

**Response intermediar:**
```json
{ "status": 0, "request": "CAPCHA_NOT_READY" }
```

**Response final (captcha rezolvat):**
```json
{ "status": 1, "request": "03AGdBq24xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..." }
```

Valoarea din `request` este tokenul reCAPTCHA v2 care se trimite in campul `reCaptchaKey` catre API-ul DGPCI.

---

## Cost real per verificare

| Serviciu | Cost |
|---|---|
| 2captcha — reCAPTCHA v2 | $0.00099 / captcha (~0.004 RON) |
| 1000 verificari prin 2captcha | ~$1 (~4-5 RON) |
| Servicii comerciale echivalente | ~150 RON / 1000 verificari |

Costul unui run complet de 999 numere (ex: `B001RMS` - `B999RMS`) este sub **$1**.

---

## Configurare

Copiaza `.env.template` in `.env`:

```env
judet=B
format=RMS
captcha-id=2captcha
captcha-token=your_2captcha_api_key_here
```

| Variabila | Descriere | Exemplu |
|---|---|---|
| `judet` | Codul judetului | `B`, `CJ`, `IS` |
| `format` | Sufixul dorit | `RMS`, `AAA` |
| `captcha-id` | Providerul captcha | `2captcha` |
| `captcha-token` | API key-ul providerului | `a1b2c3d4...` |

---

## Executie

```bash
bun --env-file .env index.ts
```

Aplicatia itereaza `i` de la `1` la `999` si formeaza numarul ca:
```
${judet}${i.toString().padStart(2, "0")}${format}
```

Deci pentru `judet=B`, `format=RMS`:
- `i=1` → `B01RMS`
- `i=10` → `B10RMS`
- `i=100` → `B100RMS`
- `i=999` → `B999RMS`

---

## Persistenta — db.json

Rezultatele sunt scrise imediat dupa fiecare verificare in `db.json`:

```json
{
  "B01RMS": "X",
  "B47RMS": "GASIT",
  "B100RMS": "X"
}
```

- `GASIT` — numarul este disponibil pentru rezervare
- `X` — numarul este deja inmatriculat sau rezervat

La repornire, toate intrarile existente din `db.json` sunt sarite automat — procesul poate fi intrerupt si reluat oricand fara pierdere de date sau consum dublu de credite captcha.

---

## Note tehnice

- **TLS**: serverul `dgpci.mai.gov.ro` foloseste un certificat care nu trece validarea standard; aplicatia seteaza `NODE_TLS_REJECT_UNAUTHORIZED=0` la runtime pentru a ocoli eroarea
- **Email**: campul `userEmail` din request accepta orice adresa valida sintactic; nu este validata sau verificata de server
- **Rate limiting**: nu am identificat rate limiting activ din partea API-ului DGPCI; latenta naturala a rezolvarii captcha (~20s) actioneaza ca throttle implicit
- **Captcha**: 2captcha foloseste solutionari umani sau modele ML; rata de succes este >99% pentru reCAPTCHA v2 standard; tokenul returnat are valabilitate de ~2 minute, suficient pentru a fi consumat imediat
