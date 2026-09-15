import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { resolveWindowIconPath } from "./window-icon.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

test("uses an embedder icon instead of the existing Paseo asset", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "paseo-icon-"));
  directories.push(directory);
  const custom = path.join(directory, "custom.png");
  const stock = path.join(directory, "icon.png");
  writeFileSync(custom, "custom");
  writeFileSync(stock, "stock");
  expect(resolveWindowIconPath(custom, [stock])).toBe(custom);
  expect(resolveWindowIconPath(undefined, [path.join(directory, "missing"), stock])).toBe(stock);
  expect(resolveWindowIconPath("  ", [stock])).toBe(stock);
  expect(resolveWindowIconPath(undefined, [])).toBeNull();
  expect(() => resolveWindowIconPath(path.join(directory, "missing"), [stock])).toThrow(
    /PASEO_APP_ICON_PATH/,
  );
  expect(() => resolveWindowIconPath("icon.png", [stock])).toThrow(/absolute icon path/);
});
