import type { StorybookConfig } from "@storybook/nextjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-themes"],
  framework: "@storybook/nextjs",
  webpackFinal: async (config) => {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@shared": path.resolve(__dirname, "../../src"),
      };
    }
    return config;
  },
};

export default config;
