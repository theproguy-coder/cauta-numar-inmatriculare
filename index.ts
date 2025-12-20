import puppeteer from "puppeteer-extra";
import RecaptchaPlugin from "puppeteer-extra-plugin-recaptcha";
import fs from "fs/promises";

const county = process.env.judet!;
const format = process.env.format!;
const captchaId = process.env["captcha-id"]!;
const captchaToken = process.env["captcha-token"]!;

const db = {
    async save() {
        await fs.writeFile("db.json", JSON.stringify(this.data, undefined, 4));
    },

    async get() {
        this.data = JSON.parse(await fs.readFile("db.json", "utf-8"));
    },

    data: {} as Record<string, "GASIT" | "X">
};

await db.get();

puppeteer.use(
    RecaptchaPlugin({
        provider: {
            id: captchaId,
            token: captchaToken
        },
        visualFeedback: true
    })
);

const browser = await puppeteer.launch({
    headless: false, 
    args: [`--window-size=1080,920`],
    defaultViewport: { width: 1080, height: 920 }
});

const page = await browser.newPage();

for (let i = 1; i <= 99; i++) {
    const number = `${county}${i.toString().padStart(2, "0")}${format}`;
    if (db.data[number]) continue;
    console.log(`Incercam cu: ${number}`);

    await page.goto("https://dgpci.mai.gov.ro/drpciv-forms/plate-number");

    await new Promise(resolve => setTimeout(resolve, 4000));
    await page.mouse.wheel({ deltaY: 600 });
    
    const input = await page.waitForSelector("#plateNumber");
    if (!input) throw new Error("Nu am gasit input-ul");

    const submit = await page.waitForSelector(`.field-submit`).then(e => e?.$("button"));
    if (!submit) throw new Error("Nu am gasit submit-ul");
    
    input.type(number);
    
    const captchaRes = await page.solveRecaptchas()
    console.log(captchaRes);

    await submit.click();
    
    const result = await page.waitForSelector("#stateMatriculation");
    if (!result) throw new Error("Nu am gasit result-ul");

    const res = await page.evaluate(e => e.textContent, result);
    if (!res) throw new Error("Nu am gasit res-ul");
    if (res.includes("nu este disponibil")) {
        db.data[number] = "X";
    } else if (res.includes("este disponibil")) {
        db.data[number] = "GASIT";
    } else {
        throw new Error("Nu am putut citi res-ul");
    }

    await db.save();
}

process.on("exit", () => browser.close());