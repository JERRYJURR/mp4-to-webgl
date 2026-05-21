/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "playwright",
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },
};

export default nextConfig;
