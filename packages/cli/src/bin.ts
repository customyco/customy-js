#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { runCli } from "./cli.js";

// The confirmation prompt is written to stderr so `--json` keeps stdout clean.
async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try { return await rl.question(question); } finally { rl.close(); }
}

runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  isTTY: Boolean(process.stdin.isTTY),
  prompt,
}).then((code) => { process.exitCode = code; });
