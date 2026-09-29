import type { NextConfig } from "next";

// Routes that save finished videos run ffmpeg for color matching.
const ffmpegRoutes = ["/api/jobs", "/api/account", "/api/cron/maintenance"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: Object.fromEntries(
    ffmpegRoutes.map((route) => [route, ["./node_modules/ffmpeg-static/ffmpeg"]]),
  ),
};

export default nextConfig;
