/**
 * Smoke test for Hugh Assistant.
 * Run with: npm run test:smoke
 * Requires the dev server running on localhost:3000 (or set BASE_URL).
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Status endpoint returns 200 with expected fields
  try {
    const res = await fetch(`${BASE}/api/status`);
    const body = await res.json();

    if (res.status !== 200) {
      results.push({
        name: "Status endpoint returns 200",
        passed: false,
        detail: `Got ${res.status}`,
      });
    } else {
      results.push({
        name: "Status endpoint returns 200",
        passed: true,
        detail: `OK — ${JSON.stringify(body)}`,
      });

      // Test 2: anthropic field
      results.push({
        name: "Anthropic is configured",
        passed: body.anthropic === "configured",
        detail: `anthropic: ${body.anthropic}`,
      });

      // Test 3: model field
      results.push({
        name: "Model ID present",
        passed: typeof body.model === "string" && body.model.length > 0,
        detail: `model: ${body.model}`,
      });

      // Test 4: database field present
      results.push({
        name: "Database field present",
        passed: body.database === "connected" || body.database === "disconnected",
        detail: `database: ${body.database}`,
      });
    }
  } catch (err) {
    results.push({
      name: "Status endpoint reachable",
      passed: false,
      detail: `${err}`,
    });
  }

  // Test 5: Chat endpoint returns 401 when unauthenticated
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
      redirect: "manual",
    });
    // NextAuth may return 302 redirect or 401
    const authBlocked = res.status === 401 || res.status === 302 || res.status === 403;
    results.push({
      name: "Chat endpoint rejects unauthenticated requests",
      passed: authBlocked,
      detail: `Got ${res.status}`,
    });
  } catch (err) {
    results.push({
      name: "Chat auth guard",
      passed: false,
      detail: `${err}`,
    });
  }

  // Test 6: Oversized input rejection (> 32KB)
  try {
    const oversized = "x".repeat(33_000);
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: oversized }],
      }),
      redirect: "manual",
    });
    // Should not return 500 — any 4xx or redirect is acceptable
    results.push({
      name: "Oversized input does not cause 500",
      passed: res.status !== 500,
      detail: `Got ${res.status}`,
    });
  } catch (err) {
    results.push({
      name: "Oversized input handling",
      passed: false,
      detail: `${err}`,
    });
  }

  // Test 7: Homepage returns 200
  try {
    const res = await fetch(`${BASE}/`, { redirect: "manual" });
    results.push({
      name: "Homepage returns 200",
      passed: res.status === 200,
      detail: `Got ${res.status}`,
    });
  } catch (err) {
    results.push({
      name: "Homepage reachable",
      passed: false,
      detail: `${err}`,
    });
  }

  // Test 8: Security headers present on /api/status
  try {
    const res = await fetch(`${BASE}/api/status`);
    const hasXFrame = !!res.headers.get("x-frame-options");
    const hasXContent = !!res.headers.get("x-content-type-options");
    const hasReferrer = !!res.headers.get("referrer-policy");
    const allPresent = hasXFrame && hasXContent && hasReferrer;
    results.push({
      name: "Security headers present",
      passed: allPresent,
      detail: `X-Frame-Options: ${hasXFrame}, X-Content-Type-Options: ${hasXContent}, Referrer-Policy: ${hasReferrer}`,
    });
  } catch (err) {
    results.push({
      name: "Security headers check",
      passed: false,
      detail: `${err}`,
    });
  }

  // Test 9: Auth providers endpoint lists google
  try {
    const res = await fetch(`${BASE}/api/auth/providers`);
    if (res.ok) {
      const body = await res.json();
      const hasGoogle = "google" in body;
      results.push({
        name: "Auth providers lists google",
        passed: hasGoogle,
        detail: `Providers: ${Object.keys(body).join(", ")}`,
      });
    } else {
      results.push({
        name: "Auth providers endpoint",
        passed: false,
        detail: `Got ${res.status}`,
      });
    }
  } catch (err) {
    results.push({
      name: "Auth providers check",
      passed: false,
      detail: `${err}`,
    });
  }

  // Test 10: Status endpoint responds within 2 seconds
  try {
    const start = Date.now();
    await fetch(`${BASE}/api/status`);
    const elapsed = Date.now() - start;
    results.push({
      name: "Status endpoint < 2s response time",
      passed: elapsed < 2000,
      detail: `${elapsed}ms`,
    });
  } catch (err) {
    results.push({
      name: "Status response time",
      passed: false,
      detail: `${err}`,
    });
  }

  return results;
}

async function main() {
  console.log(`\nHugh Assistant Smoke Test`);
  console.log(`Base URL: ${BASE}\n`);

  const results = await runTests();
  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.name} — ${r.detail}`);
    if (r.passed) passed++;
    else failed++;
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
