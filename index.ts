import fs from "fs/promises";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const county = process.env.judet!;
const format = process.env.format!;
const captchaToken = process.env["captcha-token"]!;

const SITE_KEY = "6Le9UwsUAAAAAGR_XRglppXV_ZTRjQOcPPyz7dxA";
const PAGE_URL = "https://dgpci.mai.gov.ro/drpciv-forms/plate-number";
const API_URL = "https://dgpci.mai.gov.ro/drpciv-forms-api/plate-status";
const CAPTCHA_SUBMIT_URL = "https://2captcha.com/in.php";
const CAPTCHA_RESULT_URL = "https://2captcha.com/res.php";
const USER_EMAIL = "check@check.com";

const db = {
    async save() {
        await fs.writeFile("db.json", JSON.stringify(this.data, undefined, 4));
    },
    async get() {
        try {
            this.data = JSON.parse(await fs.readFile("db.json", "utf-8"));
        } catch {
            this.data = {};
        }
    },
    data: {} as Record<string, "GASIT" | "X">
};

async function solveCaptcha(): Promise<string> {
    console.log("  → Trimit captcha la 2captcha...");

    const submitRes = await fetch(CAPTCHA_SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            key: captchaToken,
            method: "userrecaptcha",
            googlekey: SITE_KEY,
            pageurl: PAGE_URL,
            json: "1"
        })
    });
    const submitData = await submitRes.json() as any;

    if (submitData.status !== 1) {
        throw new Error(`2captcha submit error: ${JSON.stringify(submitData)}`);
    }
    const requestId = submitData.request;
    console.log(`  → Captcha trimis (id: ${requestId}), astept rezultat...`);

    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 5000));

        const resultRes = await fetch(
            `${CAPTCHA_RESULT_URL}?key=${captchaToken}&action=get&id=${requestId}&json=1`
        );
        const resultData = await resultRes.json() as any;

        if (resultData.status === 1) {
            console.log("  → Captcha rezolvat!");
            return resultData.request;
        }
        if (resultData.request !== "CAPCHA_NOT_READY") {
            throw new Error(`2captcha error: ${JSON.stringify(resultData)}`);
        }
        console.log(`  → Inca astept captcha (incercarea ${attempt + 1}/30)...`);
    }

    throw new Error("Timeout: captcha nu a fost rezolvat in 150s");
}

async function checkPlate(plateNumber: string): Promise<"GASIT" | "X"> {
    const captchaKey = await solveCaptcha();

    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "https://dgpci.mai.gov.ro",
            "Referer": "https://dgpci.mai.gov.ro/drpciv-forms/plate-number"
        },
        body: JSON.stringify({
            plateNumber,
            userEmail: USER_EMAIL,
            language: "RO",
            reCaptchaKey: captchaKey
        })
    });

    const data = await res.json() as any;
    console.log(`  → Raspuns API: ${JSON.stringify(data)}`);

    if (data.errMessage) {
        throw new Error(`API error: ${data.errMessage}`);
    }

    const code = (data.code ?? "").toLowerCase();
    const message = (data.message ?? "").toLowerCase();

    if (code === "available" || message.includes("disponibil") && !message.includes("nu este")) {
        return "GASIT";
    } else {
        return "X";
    }
}

await db.get();

console.log(`Pornesc cautarea pentru ${county}XX/XXX${format} (01-999)...`);
console.log(`API direct, fara browser.\n`);

for (let i = 1; i <= 999; i++) {
    const number = `${county}${i.toString().padStart(2, "0")}${format}`;
    if (db.data[number]) {
        console.log(`[${i}/999] ${number} — deja verificat (${db.data[number]}), sar peste.`);
        continue;
    }

    console.log(`[${i}/999] Verific: ${number}`);
    try {
        const result = await checkPlate(number);
        db.data[number] = result;
        await db.save();

        if (result === "GASIT") {
            console.log(`  ✓ ${number} — DISPONIBIL!\n`);
        } else {
            console.log(`  ✗ ${number} — ocupat.\n`);
        }
    } catch (err: any) {
        console.error(`  ! Eroare la ${number}: ${err.message}`);
        await new Promise(r => setTimeout(r, 3000));
    }
}

console.log("\nGata! Rezultate salvate in db.json.");
const available = Object.entries(db.data)
    .filter(([, v]) => v === "GASIT")
    .map(([k]) => k);
if (available.length > 0) {
    console.log(`Numere disponibile: ${available.join(", ")}`);
} else {
    console.log("Niciun numar disponibil gasit.");
}
