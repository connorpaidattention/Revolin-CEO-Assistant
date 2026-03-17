/**
 * Startup environment validation.
 * Logs warnings for missing critical env vars.
 * Call once at module scope — runs on cold start.
 */

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const warnings: string[] = [];

  if (!process.env.AUTH_SECRET) {
    warnings.push("AUTH_SECRET not set — sessions will not be secure");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push("ANTHROPIC_API_KEY not set — chat will not work");
  }
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    warnings.push("Google OAuth credentials missing — sign-in will fail");
  }
  if (!process.env.ALLOWED_EMAIL) {
    warnings.push("ALLOWED_EMAIL not set — no users can sign in");
  }

  for (const w of warnings) {
    console.warn(`[env] WARNING: ${w}`);
  }
}
