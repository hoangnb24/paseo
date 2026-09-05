import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { isPlatform } from "../src/test-utils/platform.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const supervisorEntrypoint = fileURLToPath(new URL("./supervisor-entrypoint.ts", import.meta.url));
const daemonWorker = fileURLToPath(new URL("../src/server/daemon-worker.ts", import.meta.url));
const fixtureTitle = "A19 fixture process title";

type KernelIdentity = {
  title: string;
  command: string;
};

async function readKernelIdentityAfterImport(
  entrypoint: string,
  packaged: boolean,
): Promise<KernelIdentity> {
  const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-a19-daemon-identity-"));
  const moduleUrl = JSON.stringify(pathToFileURL(entrypoint).href);
  const probe = [
    `process.title = ${JSON.stringify(fixtureTitle)};`,
    `await import(${moduleUrl});`,
    'process.stdout.write(`A19_TITLE_RESULT:${JSON.stringify({ title: process.title })}\\n`);',
    "setInterval(() => {}, 1000);",
  ].join("\n");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PASEO_HOME: paseoHome,
    PASEO_LISTEN: "127.0.0.1:0",
    PASEO_RELAY_ENABLED: "false",
    PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD: "0",
    PASEO_DICTATION_ENABLED: "0",
    PASEO_VOICE_MODE_ENABLED: "0",
  };
  if (packaged) {
    environment.MEETLESS_RUNTIME_PACKAGED = "1";
  } else {
    delete environment.MEETLESS_RUNTIME_PACKAGED;
  }

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", probe],
    {
      cwd: repoRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  try {
    const result = await new Promise<KernelIdentity>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`title probe timed out: ${stderr}`));
      }, 15_000);
      const finish = (error: Error | undefined, identity?: KernelIdentity) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else if (identity) {
          resolve(identity);
        }
      };

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
        const match = stdout.match(/A19_TITLE_RESULT:(\{[^\n]+\})/u);
        if (!match) return;

        let title: string;
        try {
          title = (JSON.parse(match[1]) as { title: string }).title;
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        try {
          const command = execFileSync("ps", ["-p", String(child.pid), "-o", "command="], {
            encoding: "utf8",
          }).trim();
          finish(undefined, { title, command });
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => finish(error));
      child.once("exit", (code, signal) => {
        if (!settled) {
          finish(
            new Error(
              `title probe exited ${code ?? "without a status"}${signal ? ` (${signal})` : ""}: ${stderr}`,
            ),
          );
        }
      });
    });
    return result;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    rmSync(paseoHome, { recursive: true, force: true });
  }
}

describe.skipIf(isPlatform("win32"))("daemon process identity", () => {
  test("packaged supervisor preserves the inherited kernel command", async () => {
    const identity = await readKernelIdentityAfterImport(supervisorEntrypoint, true);
    expect(identity.title).toBe(fixtureTitle);
    expect(identity.command).toContain(fixtureTitle);
  });

  test("packaged worker preserves the inherited kernel command", async () => {
    const identity = await readKernelIdentityAfterImport(daemonWorker, true);
    expect(identity.title).toBe(fixtureTitle);
    expect(identity.command).toContain(fixtureTitle);
  });

  test("development supervisor keeps its existing title", async () => {
    const identity = await readKernelIdentityAfterImport(supervisorEntrypoint, false);
    expect(identity.title).toBe("Paseo Supervisor");
    expect(identity.command).toContain("Paseo Supervisor");
  });

  test("development worker keeps its existing title", async () => {
    const identity = await readKernelIdentityAfterImport(daemonWorker, false);
    expect(identity.title).toBe("Paseo Daemon");
    expect(identity.command).toContain("Paseo Daemon");
  });
});
