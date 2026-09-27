#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => { process.exitCode = code; });
