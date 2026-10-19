// Captures the real app for the video: 1440x900 at 2x, light theme, into public/shots (git-ignored).
// Credentials: SHOTS_EMAIL / SEED_PASSWORD from the environment, or from ../.secrets/runtime.env. Nothing is written back.
// Read-only: dialogs are opened and closed, never submitted.
import fs from "node:fs";
import { chromium } from "playwright";

const base = process.env.SHOTS_BASE ?? "https://relay-nascon.vercel.app";
const envFile = new URL("../../.secrets/runtime.env", import.meta.url);
const fileEnv = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, "utf8")
        .split("\n")
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    )
  : {};
const email = process.env.SHOTS_EMAIL ?? fileEnv.SHOTS_EMAIL;
const password = process.env.SEED_PASSWORD ?? fileEnv.SEED_PASSWORD;
if (!email || !password) {
  console.error("Set SHOTS_EMAIL and SEED_PASSWORD (env or .secrets/runtime.env).");
  process.exit(1);
}

const out = new URL("../public/shots/", import.meta.url);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce" });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("relay-theme", "light");
  } catch {}
});
const login = await ctx.request.post(`${base}/api/auth/login`, { headers: { origin: base, "content-type": "application/json" }, data: { email, password } });
if (!login.ok()) {
  console.error("login failed:", login.status());
  process.exit(1);
}
const page = await ctx.newPage();

// Blur anything that looks like an email address, a phone number, a key or a long token, text or input.
async function redact() {
  await page.evaluate(() => {
    const risky = [/[\w.+-]+@[\w-]+\.[\w.-]+/, /\+?\d[\d\s()-]{8,}\d/, /\b(sk|pk|rk|whsec|xox[a-z])_[\w-]{6,}/i, /[A-Za-z0-9_-]{32,}/];
    const hit = (s) => risky.some((r) => r.test(s));
    const blur = (el) => {
      el.style.filter = "blur(7px)";
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.parentElement && hit(n.textContent ?? "")) blur(n.parentElement);
    for (const el of document.querySelectorAll("input, textarea")) if (hit(el.value ?? "") || el.type === "password") blur(el);
  });
}

async function shot(name, path, prep) {
  try {
    if (path) await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    if (prep) await prep();
    await page.waitForTimeout(1200);
    await redact();
    await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
    console.log("ok  ", name);
  } catch (e) {
    console.log("fail", name, String(e).split("\n")[0]);
  }
}

const closeDialog = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
};

await shot("dashboard", "/dashboard");
await shot("leads", "/leads");
const href = await page.locator('a[href^="/leads/"]').first().getAttribute("href").catch(() => null);
if (href) {
  await shot("lead-detail", href, async () => {
    await page.getByText("Custody chain").first().scrollIntoViewIfNeeded();
  });
  await shot("booking", href, async () => {
    await page.getByRole("button", { name: /book appointment/i }).first().click();
    await page.getByRole("dialog").waitFor();
  });
  await closeDialog();
  await shot("payment-dialog", null, async () => {
    await page.getByRole("button", { name: /request payment/i }).first().click();
    await page.getByRole("dialog").waitFor();
  });
  await closeDialog();
}
await shot("inbox", "/inbox", async () => {
  await page.locator("main button[type=button]").first().click();
  await page.waitForTimeout(1500);
});
await shot("pipeline", "/pipeline");
await shot("payment-paid", "/payments", async () => {
  const paid = page.getByText("Paid", { exact: true }).first();
  if (await paid.count()) await paid.scrollIntoViewIfNeeded();
});
await shot("audit", "/settings/audit");
await shot("integrations", "/settings/integrations");
await browser.close();
