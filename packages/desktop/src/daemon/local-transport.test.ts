import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import { closeAllTransportSessions, openLocalTransportSession } from "./local-transport";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const temporaryRoots: string[] = [];

afterEach(async () => {
  closeAllTransportSessions();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe.skipIf(process.platform === "win32")("local daemon transport", () => {
  it("connects to a Unix socket whose filesystem path contains spaces", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paseo local transport "));
    temporaryRoots.push(root);
    const socketPath = path.join(root, "recording control.sock");
    const server = createServer();
    const webSocketServer = new WebSocketServer({ server });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });

      await expect(
        openLocalTransportSession({
          transportType: "socket",
          transportPath: socketPath,
        }),
      ).resolves.toMatch(/^local-session-/u);
    } finally {
      closeAllTransportSessions();
      await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
