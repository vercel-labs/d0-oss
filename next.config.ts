import { headers } from "next/headers";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // Include font files in the server bundle
      config.module.rules.push({
        test: /\.(ttf|ttc|otf|woff|woff2)$/,
        type: "asset/resource",
        generator: {
          filename: "static/fonts/[name][ext]",
        },
      });

      // Handle native .node files from resvg-js
      config.module.rules.push({
        test: /\.node$/,
        loader: "node-loader",
      });

      // Externalize native modules
      config.externals = config.externals || [];
      config.externals.push({
        "@resvg/resvg-js": "@resvg/resvg-js",
      });
    }
    return config;
  },
};

export default nextConfig;
