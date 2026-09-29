import puppeteer from "puppeteer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting clean WhatsApp browser test...");
console.log("This test does NOT use whatsapp-web.js.");

const browser = await puppeteer.launch({
  headless: true,
  userDataDir: path.join(__dirname, ".wa-browser-test"),
  defaultViewport: null,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ],
});

const pages = await browser.pages();
const page = pages[0] || await browser.newPage();

page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    console.log("URL:", frame.url());
  }
});

page.on("console", (msg) => {
  if (msg.type() === "error") console.log("PAGE ERROR:", msg.text());
});

await page.goto("https://web.whatsapp.com/", {
  waitUntil: "domcontentloaded",
  timeout: 0,
});

console.log("");
console.log("WhatsApp Web opened.");
console.log("Scan the QR manually.");
console.log("Keep this terminal open.");
console.log("If it logs out, copy the URL/output here.");
console.log("");

await new Promise(() => {});
