import { existsSync } from "node:fs";
import path from "node:path";

// Embedders supply their own asset without changing Paseo's packaged defaults.
export function resolveWindowIconPath(
  overridePath: string | undefined,
  candidates: string[],
): string | null {
  const requested = overridePath?.trim();
  if (requested) {
    if (!path.isAbsolute(requested) || !existsSync(requested)) {
      throw new Error("PASEO_APP_ICON_PATH must name an existing absolute icon path");
    }
    return requested;
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
