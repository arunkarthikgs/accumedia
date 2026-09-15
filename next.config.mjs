/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js", "sharp", "ffmpeg-static"],
  },
};

export default nextConfig;
