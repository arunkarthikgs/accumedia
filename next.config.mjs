/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js", "sharp", "ffmpeg-static"],
  },
};

export default nextConfig;
