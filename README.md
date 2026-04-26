# Cautare numar inmatriculare

Aplicatie CLI pentru verificarea automatizata a disponibilitatii numerelor de inmatriculare romanesti de forma `B01RMS` sau `B100RMS`, in functie de judet si de sufixul configurat.

## Arhitectura

Aplicatia ruleaza ca un proces batch, fara UI, si urmeaza acest flux:

1. citeste configuratia din mediul de executie
2. incarca starea curenta din `db.json`
3. genereaza secvential numerele tinta pentru intervalul configurat
4. solicita un token reCAPTCHA prin 2captcha
5. trimite cererea HTTP catre endpointul de verificare al DGPCI
6. interpreteaza raspunsul JSON
7. persista rezultatul in `db.json`

## Endpointuri utilizate

### 1. 2captcha submit
`POST https://2captcha.com/in.php`

Trimite cererea de rezolvare a captcha-ului de tip reCAPTCHA v2.

Parametri folositi:
- `key`: tokenul 2captcha
- `method=userrecaptcha`
- `googlekey`: site key-ul formularului DGPCI
- `pageurl`: URL-ul paginii formularului
- `json=1`

### 2. 2captcha poll
`GET https://2captcha.com/res.php`

Interogheaza rezultatul captcha-ului pana cand 2captcha returneaza tokenul final.

Parametri folositi:
- `key`: tokenul 2captcha
- `action=get`
- `id`: request id primit la submit
- `json=1`

### 3. DGPCI plate status
`POST https://dgpci.mai.gov.ro/drpciv-forms-api/plate-status`

Endpoint-ul de business logic pentru verificarea disponibilitatii numarului de inmatriculare.

Payload JSON:
- `plateNumber`
- `userEmail`
- `language`
- `reCaptchaKey`

Raspunsul contine de regula:
- `code`: `available` sau `not-available`
- `message`
- `errMessage`

## Configurare

Copiaza `.env.template` in `.env` si completeaza:

```env
judet=B
format=RMS
captcha-id=2captcha
captcha-token=your_token_here
```

## Executie

```bash
bun --env-file .env index.ts
```

## Persistenta

Rezultatele sunt salvate in `db.json` sub forma:

```json
{
  "B01RMS": "X",
  "B47RMS": "GASIT"
}
```

- `GASIT` = disponibil
- `X` = ocupat

La repornire, aplicatia sare peste intrarile deja salvate.

## Observatii operationale

- aplicatia lucreaza secvential, nu in paralel
- captcha-ul este rezolvat la fiecare verificare
- verificarile sunt salvate imediat dupa fiecare raspuns valid
- verificarea SSL este dezactivata in runtime pentru compatibilitate cu mediul curent
