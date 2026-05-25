#!/usr/bin/env node
/**
 * Pharos Contract Inspector
 *
 * Two-tier inspection of an address on the Pharos Network:
 *   Tier 1 (always): RPC-based — contract vs wallet, standard detection, metadata, proxy check
 *   Tier 2 (optional): SocialScan API — verification status, compiler info, license
 *
 * Usage:
 *   node scripts/inspect_contract.js <address> [mainnet|testnet]
 *   SOCIALSCAN_API_KEY=<key> node scripts/inspect_contract.js <address> mainnet
 */

import {
  createPublicClient,
  http,
  defineChain,
  isAddress,
  getAddress,
  parseAbi,
} from "viem";

// --- Pharos chain definitions ---
const pharosMainnet = defineChain({
  id: 1672,
  name: "Pharos Pacific Ocean Mainnet",
  nativeCurrency: { name: "Pharos", symbol: "PROS", decimals: 18 },
  rpcUrls: { default: { http: ["rpc.pharos.xyz"] } },
});

const pharosTestnet = defineChain({
  id: 688689,
  name: "Pharos Atlantic Testnet",
  nativeCurrency: { name: "Pharos", symbol: "PROS", decimals: 18 },
  rpcUrls: { default: { http: ["atlantic.dplabs-internal.com"] } },
});

const EXPLORERS = {
  mainnet: "pharosscan.xyz",
  testnet: "atlantic.pharosscan.xyz",
};

const SOCIALSCAN_NETWORKS = {
  mainnet: "pharos-mainnet",
  testnet: "pharos-atlantic-testnet",
};

// --- Interface IDs (ERC-165) ---
const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

// --- EIP-1967 implementation storage slot ---
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const erc165Abi = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

const erc721MetaAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

// --- Saf…
