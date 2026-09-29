import { rmSync } from "node:fs";

// Resolve from this script so cleanup always targets this repository's output.
rmSync(new URL("../.test-build/", import.meta.url), { recursive: true, force: true });
