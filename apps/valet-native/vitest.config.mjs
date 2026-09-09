import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-native-svg": fileURLToPath(
        new URL("./test/react-native-svg.mock.mjs", import.meta.url),
      ),
    },
  },
});
