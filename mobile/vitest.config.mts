import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "react-native": fileURLToPath(new URL("./test/react-native.ts", import.meta.url)) } },
});
