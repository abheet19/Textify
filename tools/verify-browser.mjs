import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const url = process.env.TEXTIFY_TEST_URL;
assert.ok(
  url?.startsWith("http://127.0.0.1:"),
  "Only run this synthetic fixture driver against a local test server",
);
const out = process.env.TEXTIFY_EVIDENCE_DIR;
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.TEXTIFY_BROWSER_CHANNEL,
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  bypassCSP: true,
});
const page = await context.newPage();
const errors = [];
const consoleErrors = [];
const requestFailures = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) =>
  requestFailures.push(`${request.method()} ${request.url()}`),
);
const checks = [];
const documentListResponses = [];
page.on("response", (response) => {
  const request = response.request();
  if (
    request.method() === "GET" &&
    new URL(response.url()).pathname === "/api/documents"
  ) {
    documentListResponses.push(response.status());
  }
});
const check = async (name, fn) => {
  await fn();
  checks.push(name);
};
const auditAccessibility = async () => {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(() =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    }),
  );
  assert.deepEqual(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    })),
    [],
  );
};

try {
  await page.goto(url);
  await check("semantic structure and accessible control names", async () => {
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.locator("h1").count(), 1);
    const audit = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map(
        (element) => element.id,
      );
      const unnamed = [
        ...document.querySelectorAll("button, input, select, textarea, a"),
      ]
        .filter((element) => element.getClientRects().length)
        .filter((element) => {
          const labels = element.id
            ? document.querySelectorAll(
                `label[for="${CSS.escape(element.id)}"]`,
              ).length
            : 0;
          return !(
            element.getAttribute("aria-label") ||
            element.textContent.trim() ||
            labels ||
            element.title
          );
        })
        .map((element) => element.outerHTML);
      return {
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        unnamed,
      };
    });
    assert.deepEqual(audit, { duplicateIds: [], unnamed: [] });
  });
  await check("locked inventory and wrong-code rejection", async () => {
    assert.equal(await page.locator("#documents option").count(), 1);
    await page.getByLabel("Access code", { exact: false }).fill("wrong-code");
    await page
      .getByRole("button", { name: "Unlock workspace", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#access-status")
        .textContent.includes("valid Textify access code"),
    );
    assert.deepEqual(documentListResponses, [401]);
  });
  await check("unlock empty inventory and session-only code", async () => {
    await page.locator("#access-code").fill("synthetic-test-code");
    await page
      .getByRole("button", { name: "Unlock workspace", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#access-status").textContent.includes("unlocked"),
    );
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("textify-access-code")),
      "synthetic-test-code",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("textify-access-code")),
      null,
    );
    assert.deepEqual(documentListResponses, [401, 200]);
  });
  await check(
    "missing selection produces an in-page actionable error",
    async () => {
      await page
        .getByLabel("Question", { exact: true })
        .fill("Explain the privacy boundary");
      await page
        .getByRole("button", { name: "Find supported answer", exact: true })
        .click();
      assert.ok(
        (await page.locator("#ask-status").innerText()).includes(
          "Choose an indexed source",
        ),
      );
    },
  );
  const source =
    "Privacy keeps the private key with the learner and the server only receives encrypted values. <img src=x onerror=window.__sourceXss=1> <svg onload=window.__sourceXss=1> These strings are source text, never markup. ".repeat(
      14,
    );
  const file = {
    name: "study-<img src=x onerror=window.__nameXss=1>.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  };
  await check(
    "TXT upload selects indexed source and renders filename as text",
    async () => {
      await page.locator("#file").setInputFiles(file);
      await page
        .getByRole("button", { name: "Build evidence index", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#upload-status")
          .textContent.includes("chunks indexed"),
      );
      await page.waitForFunction(
        () => document.querySelectorAll("#documents option").length === 2,
      );
      await page.locator("#documents").selectOption({ index: 1 });
      assert.equal(await page.locator("#documents img").count(), 0);
      assert.equal(await page.evaluate(() => window.__nameXss), undefined);
    },
  );
  await check(
    "duplicate upload retains one document and gives explicit feedback",
    async () => {
      await page
        .getByRole("button", { name: "Build evidence index", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#upload-status")
          .textContent.includes("already indexed"),
      );
      assert.equal(await page.locator("#documents option").count(), 2);
    },
  );
  await check(
    "ask returns visible source evidence without executing source HTML",
    async () => {
      await page
        .getByRole("button", { name: "Find supported answer", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.querySelector("#answer").classList.contains("hidden"),
      );
      assert.ok(
        (await page.locator("#answer-text").innerText()).includes("[S1]"),
      );
      assert.ok(
        (await page.locator("#citations").innerText()).includes("<img"),
      );
      assert.equal(
        await page.locator("#citations img, #citations svg").count(),
        0,
      );
      assert.equal(await page.evaluate(() => window.__sourceXss), undefined);
    },
  );
  await check(
    "desktop cited-answer state passes automated WCAG A/AA rules",
    auditAccessibility,
  );
  await page.screenshot({
    path: path.join(out, "textify-cited-answer.png"),
    fullPage: true,
  });
  await check(
    "locking during a request suppresses its stale private response",
    async () => {
      await page.evaluate(() => {
        window.__originalFetch = window.fetch;
        window.fetch = (input, options) => {
          if (input === "/api/ask") {
            return new Promise((resolve) => {
              window.__releaseStaleAsk = () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      answer: "STALE PRIVATE ANSWER",
                      generation_mode: "evidence-only",
                      citations: [
                        {
                          source: "S1",
                          chunk: 1,
                          text: "STALE PRIVATE CITATION",
                        },
                      ],
                    }),
                    {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    },
                  ),
                );
            });
          }
          return window.__originalFetch(input, options);
        };
      });
      await page
        .getByRole("button", { name: "Find supported answer", exact: true })
        .click();
      await page.waitForFunction(
        () => typeof window.__releaseStaleAsk === "function",
      );
      await page
        .getByRole("button", { name: "Lock workspace", exact: true })
        .click();
      await page.evaluate(() => window.__releaseStaleAsk());
      await page.waitForTimeout(50);
      assert.equal(await page.locator("#answer").isVisible(), false);
      assert.equal(
        (await page.locator("body").innerText()).includes("STALE PRIVATE"),
        false,
      );
      await page.evaluate(() => {
        window.fetch = window.__originalFetch;
        delete window.__originalFetch;
        delete window.__releaseStaleAsk;
      });
      await page.locator("#access-code").fill("synthetic-test-code");
      await page
        .getByRole("button", { name: "Unlock workspace", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#access-status")
          .textContent.includes("unlocked"),
      );
      await page.waitForFunction(
        () => document.querySelectorAll("#documents option").length === 2,
      );
      await page.locator("#documents").selectOption({ index: 1 });
    },
  );
  await check(
    "unsupported file and exhausted upload budget show recoverable errors",
    async () => {
      await page.locator("#file").setInputFiles({
        name: "bad.html",
        mimeType: "text/html",
        buffer: Buffer.from("<h1>bad</h1>"),
      });
      await page
        .getByRole("button", { name: "Build evidence index", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#upload-status")
          .textContent.includes("supports PDF"),
      );
      await page.locator("#file").setInputFiles(file);
      await page
        .getByRole("button", { name: "Build evidence index", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#upload-status")
          .textContent.includes("Request budget reached"),
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Build evidence index", exact: true })
          .isEnabled(),
        true,
      );
    },
  );
  await check(
    "remove-source confirmation cancels then accepts and clears evidence",
    async () => {
      page.once("dialog", (dialog) => dialog.dismiss());
      await page
        .getByRole("button", { name: "Remove source", exact: true })
        .click();
      assert.equal(await page.locator("#documents option").count(), 2);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Remove source", exact: true })
        .click();
      await page.waitForFunction(() =>
        document.querySelector("#ask-status").textContent.includes("removed"),
      );
      assert.equal(await page.locator("#documents option").count(), 1);
      assert.equal(await page.locator("#answer").isVisible(), false);
    },
  );
  await check("theme state, keyboard focus, and 320px reflow", async () => {
    const theme = page.locator("#theme");
    await theme.click();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    assert.equal(await theme.getAttribute("aria-pressed"), "true");
    assert.equal(await theme.innerText(), "Light theme");
    await page.setViewportSize({ width: 320, height: 720 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.locator("body").press("Tab");
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.tagName),
      "BODY",
    );
    const undersizedTargets = await page.evaluate(() =>
      [...document.querySelectorAll("button, input, select, textarea, a")]
        .filter((element) => element.getClientRects().length)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 24 || rect.height < 24;
        })
        .map((element) => element.id || element.textContent.trim()),
    );
    assert.deepEqual(undersizedTargets, []);
  });
  await check(
    "lock clears session credential and hides private source state",
    async () => {
      await page
        .getByRole("button", { name: "Lock workspace", exact: true })
        .click();
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("textify-access-code"),
        ),
        null,
      );
      assert.equal(await page.locator("#documents option").count(), 1);
      assert.equal(await page.locator("#answer").isVisible(), false);
    },
  );
  await check(
    "320px locked state passes automated WCAG A/AA rules",
    auditAccessibility,
  );
  await page.screenshot({
    path: path.join(out, "textify-mobile-locked.png"),
    fullPage: true,
  });
  const expectedConsoleStatusPattern =
    /Failed to load resource: the server responded with a status of (401|415|429)\b/;
  const expectedConsoleErrors = consoleErrors.filter((message) =>
    expectedConsoleStatusPattern.test(message),
  );
  const expectedConsoleStatuses = expectedConsoleErrors
    .map((message) => Number(message.match(expectedConsoleStatusPattern)[1]))
    .sort((left, right) => left - right);
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !expectedConsoleStatusPattern.test(message),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(expectedConsoleStatuses, [401, 415, 429]);
  assert.deepEqual(unexpectedConsoleErrors, []);
  assert.deepEqual(requestFailures, []);
  await writeFile(
    path.join(out, "browser-results.json"),
    JSON.stringify(
      {
        checks,
        count: checks.length,
        viewportCoverage: ["1280x900", "320x720"],
        errors,
        expectedConsoleErrors,
        unexpectedConsoleErrors,
        requestFailures,
        scope:
          "Real local UI/API/PostgreSQL pgvector with isolated synthetic data and mocked provider responses; no paid provider verification.",
      },
      null,
      2,
    ),
  );
  console.log(
    `Textify browser: ${checks.length} workflows passed; expected 401/415/429 diagnostics observed; no unexpected browser errors.`,
  );
} finally {
  await browser.close();
}
