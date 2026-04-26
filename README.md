# Cautare numar inmatriculare

Aplicatie CLI care verifica automat disponibilitatea numerelor de inmatriculare romanesti de forma `B01RMS`, `B100RMS` etc. pentru un judet si un format date.

## Ce face

- genereaza toate combinatiile numerice pentru intervalul configurat
- trimite cereri direct catre API-ul DGPCI
- rezolva captcha prin 2captcha
- salveaza rezultatele in `db.json`
- reia verificarea fara sa repete numerele deja testate

## Cerinte

- Bun
- un cont/serviciu 2captcha
- variabilele de mediu din `.env.template`

## Rulare

```bash
bun --env-file .env index.ts
```

## Configurare

Copiaza `.env.template` in `.env` si completeaza:

```env
judet=B
format=RMS
captcha-id=2captcha
captcha-token=your_token_here
```

## Rezultate

Rezultatele sunt salvate in `db.json` astfel:

```json
{
  "B01RMS": "X",
  "B47RMS": "GASIT"
}
```

- `GASIT` = disponibil
- `X` = ocupat
