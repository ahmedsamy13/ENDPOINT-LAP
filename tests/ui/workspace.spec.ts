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
  await page.getByRole("button", { name: /^Payload/ }).click();
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
  await page.getByRole("button", { name: /^Payload/ }).click();
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
  await expect(page.getByRole("button", { name: /^Payload/ })).toHaveAttribute(
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
test("layout is side by side, can stack, and the library can be hidden", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a request" }).click();
  const request = page.getByRole("region", { name: "Request configuration" });
  const response = page.getByRole("region", { name: "API response" });
  const a = await request.boundingBox();
  const b = await response.boundingBox();
  expect(b!.x).toBeGreaterThan(a!.x + a!.width);
  await page.getByRole("button", { name: "Use stacked layout" }).click();
  const stacked = await response.boundingBox();
  const top = await request.boundingBox();
  expect(stacked!.y).toBeGreaterThan(top!.y);
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
