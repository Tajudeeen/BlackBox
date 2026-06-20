"use client";

import { sepolia } from "wagmi/chains";

import { ZamaProvider, RelayerWeb, SepoliaConfig, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

import { wagmiConfig } from "@/lib/wagmi-config";

// Sepolia is BLACKBOX's deployment target (see the root README). The
// Zama-hosted testnet relayer is used directly with no API key or backend
// proxy: per Zama's own docs, an API key is only required for the
// mainnet-hosted relayer, and a backend proxy is an authentication
// concern that only matters once an API key is in play. If this app is
// ever pointed at mainnet, see
// https://docs.zama.org/protocol/sdk/guides/authentication for the
// backend-proxy pattern required there.
const zamaSigner = new WagmiSigner({ config: wagmiConfig });

const zamaRelayer = new RelayerWeb({
  getChainId: () => zamaSigner.getChainId(),
  transports: {
    [sepolia.id]: {
      ...SepoliaConfig,
      network: process.env.NEXT_PUBLIC_RPC_URL ?? SepoliaConfig.network,
    },
  },
});

export function ZamaFhevmProvider({ children }: { children: React.ReactNode }) {
  return (
    <ZamaProvider relayer={zamaRelayer} signer={zamaSigner} storage={indexedDBStorage}>
      {children}
    </ZamaProvider>
  );
}
