import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    alias: {
      "react-native": fileURLToPath(new URL("./test/react-native.ts", import.meta.url)),
    },
  },
});
