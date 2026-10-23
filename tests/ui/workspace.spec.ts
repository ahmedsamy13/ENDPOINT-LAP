import { test, expect } from "@playwright/test";
test("opens without login and builds a request with unsaved indicators", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Every endpoint.")).toBeVisible();
  await expect(page.getByText("Browser editor · launch desktop")).toBeVisible();
  await page.getByRole("button", { name: "Create a request" }).click();
  await page
    .getByRole("textbox", { name: "Request URL" })
    .fill("http://localhost:3000/users");
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByRole("textbox", { name: "Key 1", exact: true }).fill("page");
  await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("2");
  await page.getByRole("button", { name: /^Body/ }).click();
  await page.getByLabel("Body type").selectOption("json");
  await expect(
    page.getByRole("textbox", { name: "Request body editor" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Identity/ }).click();
  await page.getByLabel("Authentication type").selectOption("bearer");
  await page.getByLabel("Access token", { exact: true }).fill("test-token");
  await expect(
    page.getByLabel("Access token", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show credentials" }).click();
  await expect(
    page.getByLabel("Access token", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page.screenshot({
    path: "test-results/request-editor.png",
    fullPage: true,
  });
});
test("command palette, keyboard navigation and settings are accessible", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Every endpoint.")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Search requests or type a command…")
    .fill("new request");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Request URL")).toBeVisible();
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Application settings" }),
  ).toBeVisible();
  await expect(page.getByText("No account, telemetry")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("browser cannot silently send through browser fetch", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  await page.getByLabel("Request URL").fill("http://localhost:3000");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("This operation requires the Relay desktop app."),
  ).toBeVisible();
});
test("declarative assertions and extraction can be edited", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  await page.getByRole("button", { name: /^Checks & capture/ }).click();
  await page.getByRole("button", { name: "Add assertion" }).click();
  await page.getByLabel("Assertion type 1").selectOption("json");
  await page.getByLabel("Assertion path 1").fill("$.id");
  await page.getByLabel("Expected value 1").fill("42");
  await page.getByRole("button", { name: "Add extraction" }).click();
  await expect(page.getByLabel("Extraction variable 1")).toHaveValue(
    "accessToken",
  );
  await expect(
    page.getByText("Imported JavaScript is never executed."),
  ).toBeVisible();
});
test("request recipe uses progressive disclosure and preserves inputs", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  await expect(page.getByRole("button", { name: /^Query/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByLabel("Key 1", { exact: true }).fill("limit");
  await page.getByLabel("Value 1", { exact: true }).fill("25");
  await page.getByRole("button", { name: /^Body/ }).click();
  await expect(page.getByLabel("Key 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Query/ }).click();
  await expect(page.getByLabel("Value 1", { exact: true })).toHaveValue("25");
  await expect(page.getByRole("button", { name: /^Query/ })).toContainText(
    "1 active",
  );
});
test("paste cURL unpacks the request without sending or executing a shell", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  await page.getByLabel("Request URL").evaluate((el) => {
    const data = new DataTransfer();
    data.setData(
      "text/plain",
      `curl -X POST 'https://example.test/users' -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'`,
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByLabel("Request URL")).toHaveValue(
    "https://example.test/users",
  );
  await expect(page.getByLabel("HTTP method")).toHaveValue("POST");
  await expect(page.getByRole("button", { name: /^Body/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByLabel("Body type")).toHaveValue("json");
  await expect(
    page.getByRole("textbox", { name: "Request body editor" }),
  ).toContainText("Ada");
  await expect(
    page.getByText("cURL unpacked into this request."),
  ).toBeVisible();
  await expect(page.getByText("Nothing on the wire. Yet.")).toBeVisible();
});
test("inbound fills the width and outbound is below on a scrolling workbench", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  const request = page.getByRole("region", { name: "Request configuration" });
  const response = page.getByRole("region", { name: "API response" });
  const a = (await request.boundingBox())!;
  const b = (await response.boundingBox())!;
  expect(a.y).toBeGreaterThanOrEqual(b.y + b.height);
  expect(Math.abs(a.x - b.x)).toBeLessThan(2);
  expect(Math.abs(a.width - b.width)).toBeLessThan(2);
  expect(b.width).toBeGreaterThan(1000);
  expect(b.height).toBeGreaterThan(600);
  await page.getByRole("button", { name: "Configure outbound" }).click();
  await expect(request).toBeInViewport();
  await expect(page.getByLabel("HTTP method")).toBeInViewport();
  await page.getByRole("button", { name: "View response" }).click();
  await expect(response).toBeInViewport();
  await page.getByRole("button", { name: "Hide library" }).click();
  await expect(page.getByLabel("Active project")).toHaveCount(0);
  await page.getByRole("button", { name: "Show library" }).click();
  await expect(page.getByLabel("Active project")).toBeVisible();
});
test("draft close uses an accessible in-app confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  await page.getByLabel("Request URL").fill("https://example.test/keep-me");
  await page.keyboard.press("Control+w");
  await expect(
    page.getByRole("dialog", { name: "Close this request?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Request URL")).toHaveValue(
    "https://example.test/keep-me",
  );
  await page.keyboard.press("Control+w");
  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByText("Every endpoint.")).toBeVisible();
});

test("creation dialogs retain names on outside clicks and persistence errors", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "New collection",
    exact: true,
  });
  await dialog.getByLabel("Name", { exact: true }).fill("Keep my collection");
  await page.mouse.click(12, 12);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Keep my collection",
  );
  await dialog
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  // Browser mode has no database. Failed persistence must retain the dialog.
  await expect(dialog.getByRole("alert")).toContainText(
    "requires the Relay desktop app",
  );
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Keep my collection",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  const request = page.getByRole("dialog", {
    name: "New request",
    exact: true,
  });
  await request.getByLabel("Name", { exact: true }).fill("Keep my request");
  await page.mouse.click(12, 12);
  await expect(request).toBeVisible();
  await page.keyboard.press("Control+n");
  await expect(page.getByLabel("Request URL")).toHaveCount(0);
  await request.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("method menu lists all options and POST PUT PATCH expose a retained body", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  const method = page.getByRole("combobox", {
    name: "HTTP method",
    exact: true,
  });
  await expect(method.locator("option")).toHaveText([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
    "TRACE",
    "CONNECT",
    "Custom…",
  ]);
  await method.selectOption("POST");
  await expect(
    page.getByRole("button", { name: "Body", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Body type")).toHaveValue("json");
  const editor = page.getByRole("textbox", { name: "Request body editor" });
  await expect(editor).toBeInViewport();
  await editor.fill('{"name":"Retained"}');
  await method.selectOption("PATCH");
  await expect(editor).toContainText("Retained");
  await method.selectOption("GET");
  await method.selectOption("PUT");
  await expect(editor).toContainText("Retained");
  await method.selectOption("custom");
  await page.getByLabel("Custom HTTP method").fill("PROPFIND");
  await expect(page.getByLabel("Custom HTTP method")).toHaveValue("PROPFIND");
  await method.selectOption("DELETE");
  await expect(page.getByLabel("Custom HTTP method")).toHaveCount(0);
});

test("environment drafts survive outside clicks and require explicit discard", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Edit environments", exact: true })
    .click();
  const env = page.getByRole("dialog", { name: "Environments", exact: true });
  await env.getByRole("button", { name: "New environment" }).click();
  await env.getByLabel("Environment name").fill("Unsaved environment");
  await page.mouse.click(12, 12);
  await expect(env).toBeVisible();
  await env.getByRole("button", { name: "Close dialog" }).click();
  const confirm = page.getByRole("dialog", {
    name: "Discard environment changes?",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(env.getByLabel("Environment name")).toHaveValue(
    "Unsaved environment",
  );
  await env.getByRole("button", { name: "New environment" }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await env.getByRole("button", { name: "Close dialog" }).click();
  await confirm
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("minimum desktop window keeps body and send controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  await page.getByLabel("HTTP method", { exact: true }).selectOption("PATCH");
  await expect(
    page.getByRole("textbox", { name: "Request body editor" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByLabel("HTTP method", { exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "View response" }).click();
  await expect(
    page.getByRole("region", { name: "API response" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
