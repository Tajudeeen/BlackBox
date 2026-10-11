import { isAddress } from 'viem';
export { BLACKBOX_MARKET_ABI, BLACKBOX_COIN_ABI } from './abi.generated';
const configured = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS;
export const MARKET_CONTRACT_ADDRESS = configured && isAddress(configured) ? configured : undefined;
