import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "expo-blur": fileURLToPath(
        new URL("./test/expo-blur.mock.mjs", import.meta.url),
      ),
      "react-native-svg": fileURLToPath(
        new URL("./test/react-native-svg.mock.mjs", import.meta.url),
      ),
    },
  },
});
