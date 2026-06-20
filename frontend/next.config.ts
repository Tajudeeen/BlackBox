import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by @zama-fhe/react-sdk: FHE encryption/decryption runs in a Web
  // Worker backed by WASM, which needs SharedArrayBuffer, which in turn
  // needs the page to be cross-origin isolated.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
