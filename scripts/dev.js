import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npmCommand, ["--prefix", "client", "run", "dev"], { stdio: "inherit" }),
  spawn(npmCommand, ["--prefix", "server", "run", "dev"], { stdio: "inherit" }),
];

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
};

for (const child of children) {
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code || 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
