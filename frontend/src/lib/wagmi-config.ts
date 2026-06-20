import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { sepolia } from "wagmi/chains";

// Local FHEVM-ready Hardhat node, matching contracts/hardhat.config.ts.
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: "BLACKBOX",
  // Replace with a real WalletConnect Cloud project id before shipping.
  // See: https://cloud.walletconnect.com
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "blackbox-dev-placeholder",
  chains: [sepolia, hardhatLocal],
  ssr: true,
});
