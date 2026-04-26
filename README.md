# Verificare disponibilitate numar de inmatriculare — DGPCI

> CLI tool scris in TypeScript/Bun care automatizeaza complet verificarea disponibilitatii numerelor de inmatriculare romanesti prin API-ul REST al DGPCI, cu rezolvare automata reCAPTCHA v2 prin serviciul 2captcha, idempotenta completa si persistenta locala a rezultatelor.

---

## Expunere de motive

Romania permite cetatenilor sa isi aleaga un numar de inmatriculare personalizat (format `JUDET + numar + sufix`) prin platforma electronica a Directiei Generale de Politie a Capitalei si Informatii (DGPCI), accesibila la `dgpci.mai.gov.ro`. Procesul oficial implica verificarea manuala a unui numar pe un formular web, cate unul pe rand, fiecare cerere fiind protejata de un reCAPTCHA v2.

Daca doresti un numar dintr-o serie specifica — de exemplu `B??RMS`, unde `??` poate fi orice numar intre 01 si 999 — esti obligat practic sa verifici pana la 999 combinatii. Manual, la 2-3 minute pe verificare (captcha + input + submit + raspuns), ar dura intre **33 si 50 de ore** de lucru uman continuu.

**Servicii comerciale** care ofera aceasta verificare bulk exista pe piata romaneasca si practica preturi de ordinul **150 RON / 1000 verificari**. Marja lor de profit este enorma — costul real al rezolvarii captcha prin 2captcha este de **$0.00099 per captcha**, adica ~4-5 RON la mia de verificari, de aproximativ 30 de ori mai ieftin decat ce se vinde.

Acest tool rezolva problema in intregime: ruleaza nesupravegheata, consuma API-ul DGPCI direct (fara browser, fara Puppeteer, fara overhead), rezolva captcha-ul automat, persista rezultatele incremental si poate fi intrerupt si reluat oricand fara pierderi. Un run complet de 999 verificari costa sub **$1**.

**Succes tuturor celor care il folosesc.**

---

## Cum functioneaza DGPCI-ul pe interior

Formularul de la `https://dgpci.mai.gov.ro/drpciv-forms/plate-number` este o aplicatie frontend (probabil Angular sau React) care la submit face un `POST` catre un backend REST separat, `drpciv-forms-api`, expus pe acelasi domeniu.

Protectia implementata de DGPCI consta exclusiv intr-un **reCAPTCHA v2 Google** (nu v3, nu Enterprise, nu hCaptcha), cu site key fix:

```
6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA
```

Backend-ul valideaza tokenul reCAPTCHA direct cu serverele Google (`https://www.google.com/recaptcha/api/siteverify`) si returneaza eroare daca tokenul lipseste sau a expirat. Nu exista autentificare suplimentara, nu exista session cookies obligatorii, nu exista CSRF tokens verificate activ — requestul este statelss si poate fi replicat direct.

Serverul `dgpci.mai.gov.ro` foloseste un certificat TLS care nu trece validarea default a multor clienti HTTP (posibil self-signed sau emis de un CA intern al MAI). Ocolirea se face cu `NODE_TLS_REJECT_UNAUTHORIZED=0` setat ca variabila de proces inainte de orice fetch.

---

## Arhitectura aplicatiei

```
┌──────────────────────────────────────────────────────────────────┐
│                            index.ts                              │
│                                                                  │
│  INIT                                                            │
│  ├── process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"              │
│  ├── read judet, format, captcha-token from env                  │
│  └── load db.json → db.data (Record<string, "GASIT" | "X">)     │
│                                                                  │
│  MAIN LOOP  i ∈ [1, 999]                                        │
│  ├── plateNumber = `${judet}${pad(i, 2)}${format}`              │
│  ├── if db.data[plateNumber] → skip (already checked)           │
│  │                                                               │
│  ├── solveCaptcha()                                              │
│  │   ├── POST 2captcha /in.php → requestId                      │
│  │   └── poll GET 2captcha /res.php (5s interval, 30x max)      │
│  │       └── returns reCAPTCHA v2 token string                  │
│  │                                                               │
│  ├── checkPlate(plateNumber, captchaToken)                       │
│  │   ├── POST dgpci.mai.gov.ro/drpciv-forms-api/plate-status    │
│  │   └── parse response.code / response.message                 │
│  │       ├── "available" → "GASIT"                              │
│  │       └── anything else → "X"                                │
│  │                                                               │
│  ├── db.data[plateNumber] = result                               │
│  └── fs.writeFile("db.json", JSON.stringify(db.data))           │
│                                                                  │
│  DONE → print all GASIT entries                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Design decisions:**

- **Secvential, nu paralel**: un singur request DGPCI la un moment dat. Nu exista concurenta intentionata. Latenta de ~20s per captcha este suficienta ca throttle natural.
- **Write-after-every-check**: `db.json` este scris sincron dupa fiecare verificare, nu batched. Garanteaza zero pierdere de date la crash sau SIGTERM.
- **Idempotenta**: la repornire, toate intrarile existente in `db.json` sunt sarite. Procesul poate fi intrerupt la orice pas si continuat de unde a ramas.
- **Pad cu 2 cifre**: `i.toString().padStart(2, "0")` genereaza `01`, `02`, ..., `09`, `10`, ..., `99`, `100`, ..., `999`. Numerele cu 3 cifre nu mai necesita padding.

---

## Stack

| Component | Detaliu |
|---|---|
| Runtime | Bun 1.x |
| Limbaj | TypeScript, ESNext target, fara compilare separata |
| HTTP client | `fetch` nativ Bun (bazat pe `undici`) |
| Captcha solver | 2captcha REST API v1 |
| Persistenta | JSON local — `db.json` |
| TLS workaround | `NODE_TLS_REJECT_UNAUTHORIZED=0` setat programatic |
| Package manager | Bun built-in |

---

## Endpointuri — specificatii complete

---

### `POST https://dgpci.mai.gov.ro/drpciv-forms-api/plate-status`

Endpointul principal de business logic. Verifica disponibilitatea unui numar de inmatriculare in baza de date DRPCIV.

**Request headers:**

```http
POST /drpciv-forms-api/plate-status HTTP/1.1
Host: dgpci.mai.gov.ro
Content-Type: application/json
Accept: application/json
Origin: https://dgpci.mai.gov.ro
Referer: https://dgpci.mai.gov.ro/drpciv-forms/plate-number
```

Headerele `Origin` si `Referer` sunt necesare pentru a trece validarea CORS si pentru a imita un request provenit din frontend-ul legitim.

**Request body:**

```json
{
  "plateNumber": "B47RMS",
  "userEmail": "check@check.com",
  "language": "RO",
  "reCaptchaKey": "03AGdBq24PBgM5..."
}
```

| Camp | Tip | Descriere |
|---|---|---|
| `plateNumber` | `string` | Numarul complet de verificat, ex: `B47RMS` |
| `userEmail` | `string` | Adresa email; accepta orice string valid sintactic, nu e verificata |
| `language` | `string` | Codul limbii pentru mesajul de raspuns; `"RO"` pentru romana |
| `reCaptchaKey` | `string` | Tokenul reCAPTCHA v2 obtinut de la 2captcha |

**Response body — numar disponibil:**

```json
{
  "code": "available",
  "message": "Numarul de inmatriculare este disponibil",
  "errMessage": null
}
```

**Response body — numar ocupat:**

```json
{
  "code": "not-available",
  "message": "Numarul de inmatriculare nu este disponibil",
  "errMessage": null
}
```

**Response body — captcha invalid sau expirat:**

```json
{
  "code": null,
  "message": null,
  "errMessage": "reCaptcha validation failed"
}
```

**Logica de interpretare implementata:**

```typescript
const code = (data.code ?? "").toLowerCase();
const message = (data.message ?? "").toLowerCase();

if (code === "available" || (message.includes("disponibil") && !message.includes("nu este"))) {
  return "GASIT";
} else {
  return "X";
}
```

Dubla verificare (`code` + `message`) protejeaza impotriva eventualelor schimbari in API.

---

### `POST https://2captcha.com/in.php`

Submiterea unui task de rezolvare reCAPTCHA v2 catre serviciul 2captcha.

**Request headers:**

```http
POST /in.php HTTP/1.1
Host: 2captcha.com
Content-Type: application/x-www-form-urlencoded
```

**Request body (form-urlencoded):**

```
key=YOUR_2CAPTCHA_API_KEY
method=userrecaptcha
googlekey=6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA
pageurl=https://dgpci.mai.gov.ro/drpciv-forms/plate-number
json=1
```

| Parametru | Valoare | Descriere |
|---|---|---|
| `key` | `$captcha-token` | API key-ul contului tau 2captcha |
| `method` | `userrecaptcha` | Tip task: reCAPTCHA v2 |
| `googlekey` | `6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA` | Site key fix al formularului DGPCI |
| `pageurl` | `https://dgpci.mai.gov.ro/drpciv-forms/plate-number` | URL-ul paginii gazduite; Google valideaza ca tokenul e folosit de pe aceasta origine |
| `json` | `1` | Raspuns in format JSON in loc de text plain |

**Response (succes):**

```json
{ "status": 1, "request": "78291038210" }
```

**Response (eroare):**

```json
{ "status": 0, "request": "ERROR_WRONG_USER_KEY" }
```

Coduri de eroare comune: `ERROR_WRONG_USER_KEY`, `ERROR_KEY_DOES_NOT_EXIST`, `ERROR_ZERO_BALANCE`, `MAX_USER_TURN`.

---

### `GET https://2captcha.com/res.php`

Polling pentru rezultatul taskului de captcha.

**Request:**

```http
GET /res.php?key=YOUR_KEY&action=get&id=78291038210&json=1 HTTP/1.1
Host: 2captcha.com
```

| Parametru | Valoare |
|---|---|
| `key` | API key-ul 2captcha |
| `action` | `get` |
| `id` | Request ID primit la submit |
| `json` | `1` |

**Response — captcha inca in procesare:**

```json
{ "status": 0, "request": "CAPCHA_NOT_READY" }
```

**Response — captcha rezolvat:**

```json
{
  "status": 1,
  "request": "03AGdBq24PBgM5jb_zDPmNhumM6wGa3GS3eEPBqRXvYX..."
}
```

Valoarea din `request` este tokenul reCAPTCHA v2 complet, de format `03AGdBq24...`, cu lungime tipica de 500-1000 de caractere. Acesta are o **valabilitate de aproximativ 120 de secunde** din momentul generarii — suficient pentru a fi consumat imediat in requestul catre DGPCI.

**Strategia de polling implementata:**

```
interval: 5000ms
maxAttempts: 30
timeout total: 150s
```

Daca captcha-ul nu e rezolvat in 150 de secunde, se arunca eroare si se trece la urmatorul numar dupa 3s de backoff.

---

## Analiza de cost

| Componenta | Cost |
|---|---|
| reCAPTCHA v2 via 2captcha | $0.00099 / captcha |
| 999 verificari (run complet) | ~$0.99 / run |
| Echivalent in RON (curs ~4.9) | ~4.85 RON / run |
| Servicii comerciale similare | ~150 RON / 1000 verificari |
| **Factor de diferenta** | **~30x** |

Daca rulezi pentru mai multe serii sau judete, costul ramane liniar si sub $1 per serie de 999 numere.

---

## Configurare

**1. Instaleaza Bun:**

```bash
curl -fsSL https://bun.sh/install | bash
```

**2. Instaleaza dependentele:**

```bash
bun install
```

**3. Creeaza fisierul `.env`:**

```bash
cp .env.template .env
```

**4. Completeaza `.env`:**

```env
judet=B
format=RMS
captcha-id=2captcha
captcha-token=your_2captcha_api_key_here
```

| Variabila | Descriere | Exemplu |
|---|---|---|
| `judet` | Codul oficial al judetului | `B`, `CJ`, `IS`, `TM`, `CT` |
| `format` | Sufixul literelor dorit | `RMS`, `AAA`, `XYZ` |
| `captcha-id` | Providerul captcha | `2captcha` |
| `captcha-token` | API key-ul contului 2captcha | `a1b2c3d4e5f6...` |

Contul 2captcha se creeaza la `https://2captcha.com`. Incarca credit minim ($1-2 pentru a acoperi un run complet cu marja).

---

## Executie

```bash
bun --env-file .env index.ts
```

Aplicatia va afisa progresul in timp real:

```
Pornesc cautarea pentru BXX/XXXRMS (01-999)...
API direct, fara browser.

[1/999] B01RMS — deja verificat (X), sar peste.
[2/999] Verific: B02RMS
  → Trimit captcha la 2captcha...
  → Captcha trimis (id: 78291038210), astept rezultat...
  → Inca astept captcha (incercarea 1/30)...
  → Inca astept captcha (incercarea 2/30)...
  → Captcha rezolvat!
  → Raspuns API: {"code":"not-available","message":"...","errMessage":null}
  ✗ B02RMS — ocupat.

[3/999] Verific: B03RMS
  ...
  ✓ B03RMS — DISPONIBIL!
```

---

## Generarea numerelor

Formula de generare:

```typescript
`${judet}${i.toString().padStart(2, "0")}${format}`
```

Rezultate pentru `judet=B`, `format=RMS`:

| i | Rezultat |
|---|---|
| 1 | `B01RMS` |
| 9 | `B09RMS` |
| 10 | `B10RMS` |
| 99 | `B99RMS` |
| 100 | `B100RMS` |
| 999 | `B999RMS` |

Numerele de 3 cifre (100-999) nu mai primesc padding — `padStart(2, "0")` nu adauga zerouri daca stringul are deja 3+ caractere.

---

## Persistenta — `db.json`

Formatul fisierului:

```json
{
  "B01RMS": "X",
  "B47RMS": "GASIT",
  "B100RMS": "X",
  "B250RMS": "GASIT"
}
```

| Valoare | Semnificatie |
|---|---|
| `"GASIT"` | Numarul este disponibil pentru rezervare pe platforma DGPCI |
| `"X"` | Numarul este ocupat (inmatriculat sau rezervat deja) |

Fisierul este rescris complet dupa fiecare verificare individuala (`JSON.stringify` + `fs.writeFile`). Nu exista buffer sau write batching — orice crash lasa `db.json` consistent.

**Interogare rapida a rezultatelor din linie de comanda:**

```bash
# toate disponibile
bun -e "const db = require('./db.json'); console.log(Object.entries(db).filter(([,v])=>v==='GASIT').map(([k])=>k).join('\n'))"

# numara ocupate
bun -e "const db = require('./db.json'); console.log(Object.values(db).filter(v=>v==='X').length)"
```

---

## Note tehnice

### TLS
Serverul `dgpci.mai.gov.ro` serveste un certificat TLS care esueaza validarea default in Node.js/Bun — probabil emis de un CA intern al MAI Romania, absent din trust store-urile standard. Solutia implementata:

```typescript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
```

Aceasta linie trebuie sa fie **prima** din fisier, inainte de orice import sau fetch. In Bun, `fetch` foloseste `undici` care citeste variabila la momentul cererii, deci ordinea conteaza.

### reCAPTCHA site key
Site key-ul `6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA` este embed in codul sursa al paginii DGPCI si este public. Nu este un secret — este vizibil in orice DevTools > Network sau in sursa HTML. Secretul real este `secret key`-ul Google, care sta exclusiv pe serverul DGPCI si nu este expus niciodata clientului.

### Valabilitatea tokenului reCAPTCHA
Tokenul returnat de 2captcha expira in **~120 de secunde**. Fluxul curent trimite requestul catre DGPCI imediat dupa primirea tokenului, deci nu exista risc de expirare in conditii normale. Daca insa serverul DGPCI e lent sau apare o retransmisie, tokenul poate expira si requestul va returna `errMessage: "reCaptcha validation failed"` — caz in care se va arunca exceptie si se va trece la urmatorul numar.

### Rate limiting
Nu am identificat rate limiting activ implementat de API-ul DGPCI. Latenta naturala a rezolvarii captcha (~20-30 secunde per verificare) actioneaza ca throttle implicit si mentine ritmul de request la niveluri normale. Daca DGPCI va implementa in viitor limitare pe baza de IP, solutia ar fi adaugarea unui proxy rotativ sau introducerea unui delay explicit intre requesturi.

### Campul `userEmail`
Accepta orice string care trece validarea sintactica de email pe server. Nu este trimis niciun email de confirmare. Nu este verificata existenta adresei. Folosim `check@check.com` ca valoare fixa.

---

Programul a fost scris in Februarie 2025 si publicat in Decembrie 2025.

© 2025, Andrei Ranta | All rights reserved.
