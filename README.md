# Cautare numar de inmatriculare

M-am lovit de situatia de a dori sa imi inmatriculez masina cu un numar de forma CJXXABC. Pentru ca nu gaseam un numar care nu era deja luat am scris un bot care sa incerce toate combinatiile (1-99) si sa le salveze intr-un fisier.

Programul foloseste puppeteer pentru a naviga pe site-ul dgpci si a introduce toate combinatiile de numere. Pentru partea de captcha foloseste 2captcha, deci este necesar un api token.

Va salva combinatiile in db.json, un obiect de forma { "JJXXABC": "Gasit" | "X" }

## Rulare

```bun --env-file .env index.ts```

## Environment Variables (.env file)

```
judet=string (acronimul judetului e.g CJ)
format=string (formatul numarului de inmatriculare de forma ABC)
captcha-id=string (providerul captcha e.g 2captcha)
captcha-token=string (tokenul providerului)
```

Programul a fost scris in Februarie 2025 si publicat in Decembrie 2025.

© 2025, Andrei Ranta | All rights reserved.