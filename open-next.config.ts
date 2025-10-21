import { cloudflare } from "@opennextjs/cloudflare/config";

export default cloudflare({
  outputDir: ".open-next",
  sourcemap: true,
  serve: {
    // Ensure Pages receives prebuilt assets for static routes
    trailingSlash: false,
  },
});
