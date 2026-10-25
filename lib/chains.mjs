import { defineChain } from 'viem';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const hashkeyTestnet = defineChain({
  id: 133, name: 'HashKey Chain Testnet', nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hsk.xyz'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://testnet-explorer.hsk.xyz' } },
});
export const hashkey = defineChain({
  id: 177, name: 'HashKey Chain', nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.hsk.xyz'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://hashkey.blockscout.com' } },
});

// Stablecoins used by HSP (per hashfans merchant docs as summarised publicly; verify before mainnet use)
export const TOKENS = {
  133: { USDC: '0x79AEc4EeA31D50792F61D1Ca0733C18c89524C9e', USDT: '0x372325443233fEbaC1F6998aC750276468c83CC6' },
  177: { USDC: '0x054ed45810DbBAb8B27668922D110669c9D88D0a', USDT: '0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029' },
};

const art = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url)), 'utf8'));
export const loadArtifact = (name) => { const a = art(name); return { abi: a.abi, bytecode: a.bytecode.object }; };

export const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
];
