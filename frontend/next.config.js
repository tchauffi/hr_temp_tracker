/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://api:8000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
