import { defineConfig } from "vite";

// GitHub Pages project-page deployment: https://darkmikez.github.io/crystal-order/
// The base must match the repo name so built asset URLs resolve correctly
// under the /crystal-order/ sub-path Pages serves this project from.
export default defineConfig({
  base: "/crystal-order/",
});
