#!/usr/bin/env node
// Creates the first admin account.
//   1. Signs up the user in Supabase (anon key — no service role needed).
//   2. Calls the convex bootstrapFirstAdmin mutation, which only succeeds if
//      no admin staff row exists yet.
//
// Usage:
//   node scripts/createAdmin.mjs <email> <password> [name]

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv(envPath);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const CONVEX_URL = env.VITE_CONVEX_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !CONVEX_URL) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_CONVEX_URL in .env.local");
  process.exit(1);
}

const [, , email, password, nameArg] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/createAdmin.mjs <email> <password> [name]");
  process.exit(1);
}
const name = nameArg ?? email.split("@")[0];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log(`→ Signing up ${email} in Supabase…`);
const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
});

let userId = signUpData?.user?.id ?? null;

if (signUpError) {
  if (/registered|exists/i.test(signUpError.message)) {
    console.log("  user already exists — signing in to fetch id");
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      console.error("  sign-in failed:", signInError.message);
      console.error("  if email confirmation is required, confirm first then re-run.");
      process.exit(1);
    }
    userId = signInData.user.id;
  } else {
    console.error("  signUp error:", signUpError.message);
    process.exit(1);
  }
}

if (!userId) {
  console.error("  no user id returned. Email confirmation may be required —");
  console.error("  confirm the email in Supabase, then re-run this script.");
  process.exit(1);
}

console.log(`  supabase user id: ${userId}`);

console.log(`→ Calling Convex bootstrapFirstAdmin…`);
const convex = new ConvexHttpClient(CONVEX_URL);
const result = await convex.mutation("bootstrap:bootstrapFirstAdmin", {
  supabaseUserId: userId,
  email,
  name,
});

if (!result.ok) {
  console.error(`  failed: ${result.reason}`);
  console.error("  an admin already exists. Use the admin dashboard to add staff,");
  console.error("  or deactivate the existing admin staff row first.");
  process.exit(1);
}

console.log(`✓ Admin created. staffId=${result.staffId}`);
console.log(`  email: ${email}`);
console.log(`  log in at the app's login page.`);
