import { enableCompileCache } from "node:module";

// Cache compiled main-process code between launches; a no-op where unsupported.
enableCompileCache?.();
require("./main.cjs");
