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

// --- Safe contract read helper: returns null on revert instead of throwing ---
async function safeRead(client, address, abi, functionName, args = []) {
  try {
    return await client.readContract({ address, abi, functionName, args });
  } catch {
    return null;
  }
}

// --- Tier 1: RPC-based inspection ---
async function inspectViaRpc(client, address, explorerUrl) {
  const code = await client.getBytecode({ address });
  const explorerLink = `${explorerUrl}/address/${address}`;

  // No code → it's a regular wallet (EOA)
  if (!code || code === "0x") {
    return {
      type: "Wallet (EOA)",
      bytecodeSize: 0,
      standard: null,
      metadata: {},
      proxy: { isProxy: false, implementation: null },
      explorer: explorerLink,
    };
  }

  // Bytecode size in bytes (strip "0x" then divide by 2)
  const bytecodeSize = (code.length - 2) / 2;

  // --- Standard detection ---
  let standard = null;
  const is721 = await safeRead(client, address, erc165Abi, "supportsInterface", [
    ERC721_INTERFACE_ID,
  ]);
  if (is721 === true) {
    standard = "ERC-721";
  } else {
    const is1155 = await safeRead(client, address, erc165Abi, "supportsInterface", [
      ERC1155_INTERFACE_ID,
    ]);
    if (is1155 === true) {
      standard = "ERC-1155";
    } else {
      // ERC-20 heuristic: decimals() + totalSupply() both work
      const decimals = await safeRead(client, address, erc20Abi, "decimals");
      const totalSupply = await safeRead(client, address, erc20Abi, "totalSupply");
      if (decimals !== null && totalSupply !== null) {
        standard = "ERC-20";
      }
    }
  }

  // --- Metadata ---
  const metadata = {};
  if (standard === "ERC-20") {
    metadata.name = await safeRead(client, address, erc20Abi, "name");
    metadata.symbol = await safeRead(client, address, erc20Abi, "symbol");
    metadata.decimals = await safeRead(client, address, erc20Abi, "decimals");
  } else if (standard === "ERC-721" || standard === "ERC-1155") {
    metadata.name = await safeRead(client, address, erc721MetaAbi, "name");
    metadata.symbol = await safeRead(client, address, erc721MetaAbi, "symbol");
  }

  // --- EIP-1967 proxy detection ---
  let proxy = { isProxy: false, implementation: null };
  try {
    const slotValue = await client.getStorageAt({
      address,
      slot: EIP1967_IMPL_SLOT,
    });
    if (
      slotValue &&
      slotValue !== "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      // Last 20 bytes of the slot = implementation address
      const impl = getAddress("0x" + slotValue.slice(-40));
      if (impl !== "0x0000000000000000000000000000000000000000") {
        proxy = { isProxy: true, implementation: impl };
      }
    }
  } catch {
    // Storage read can fail on some RPCs — skip silently
  }

  return {
    type: "Contract",
    bytecodeSize,
    standard,
    metadata,
    proxy,
    explorer: explorerLink,
  };
}

// --- Tier 2: SocialScan verification check ---
async function checkVerification(address, networkKey, apiKey) {
  const network = SOCIALSCAN_NETWORKS[networkKey];
  const url =
    `api.socialscan.io/${network}/v1/explorer/command_api/contract` +
    `?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SocialScan returned HTTP ${response.status}`);
  }
  const data = await response.json();

  // Etherscan-compatible response shape:
  // { status: "1", message: "OK", result: [{ SourceCode, ABI, ContractName, ... }] }
  if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
    return { verified: false, message: data.message || "No data" };
  }

  const r = data.result[0];
  // SourceCode empty or ABI is "Contract source code not verified" → not verified
  const isVerified =
    r.SourceCode && r.SourceCode.length > 0 && r.ABI !== "Contract source code not verified";

  if (!isVerified) {
    return { verified: false };
  }

  return {
    verified: true,
    contractName: r.ContractName || null,
    compiler: r.CompilerVersion || null,
    optimizationUsed: r.OptimizationUsed === "1",
    runs: r.Runs || null,
    license: r.LicenseType || null,
    evmVersion: r.EVMVersion || null,
    isProxy: r.Proxy === "1",
    implementation: r.Implementation || null,
  };
}

// --- Output formatting ---
function formatReport(address, networkName, rpc, verification) {
  const lines = [];
  lines.push(`Address:        ${address}`);
  lines.push(`Type:           ${rpc.type}`);
  lines.push(`Network:        ${networkName}`);

  if (rpc.type === "Contract") {
    lines.push(`Standard:       ${rpc.standard || "Unknown / non-standard"}`);
    if (rpc.metadata.name) lines.push(`Name:           ${rpc.metadata.name}`);
    if (rpc.metadata.symbol) lines.push(`Symbol:         ${rpc.metadata.symbol}`);
    if (rpc.metadata.decimals !== undefined && rpc.metadata.decimals !== null) {
      lines.push(`Decimals:       ${rpc.metadata.decimals}`);
    }
    lines.push(`Bytecode size:  ${rpc.bytecodeSize.toLocaleString()} bytes`);
    if (rpc.proxy.isProxy) {
      lines.push(`Proxy:          Yes`);
      lines.push(`Implementation: ${rpc.proxy.implementation}`);
    } else {
      lines.push(`Proxy:          No`);
    }
  }
  lines.push(`Explorer:       ${rpc.explorer}`);

  // --- Verification section ---
  lines.push("");
  if (verification === null) {
    lines.push(`— Verification —`);
    lines.push(`(Set SOCIALSCAN_API_KEY env var to enable verification details)`);
  } else if (verification.error) {
    lines.push(`— Verification (SocialScan) —`);
    lines.push(`Error:          ${verification.error}`);
  } else if (!verification.verified) {
    lines.push(`— Verification (SocialScan) —`);
    lines.push(`Verified:       No`);
  } else {
    lines.push(`— Verification (SocialScan) —`);
    lines.push(`Verified:       Yes`);
    if (verification.contractName)
      lines.push(`Contract name:  ${verification.contractName}`);
    if (verification.compiler) lines.push(`Compiler:       ${verification.compiler}`);
    if (verification.optimizationUsed !== undefined) {
      const opt = verification.optimizationUsed
        ? `Enabled (${verification.runs} runs)`
        : "Disabled";
      lines.push(`Optimization:   ${opt}`);
    }
    if (verification.license) lines.push(`License:        ${verification.license}`);
    if (verification.evmVersion && verification.evmVersion !== "Default")
      lines.push(`EVM version:    ${verification.evmVersion}`);
    if (verification.isProxy && verification.implementation)
      lines.push(`Impl (SS):      ${verification.implementation}`);
  }

  return lines.join("\n");
}

// --- Main inspection entry point ---
async function inspect(rawAddress, networkKey = "mainnet") {
  if (!isAddress(rawAddress)) {
    throw new Error(`Invalid address: ${rawAddress}`);
  }
  const address = getAddress(rawAddress); // Checksummed

  const chain = networkKey === "testnet" ? pharosTestnet : pharosMainnet;
  const explorerUrl = EXPLORERS[networkKey] || EXPLORERS.mainnet;
  const client = createPublicClient({ chain, transport: http() });

  const rpc = await inspectViaRpc(client, address, explorerUrl);

  // --- Tier 2: only if API key is present AND it's actually a contract ---
  const apiKey = process.env.SOCIALSCAN_API_KEY;
  let verification = null;
  if (apiKey && rpc.type === "Contract") {
    try {
      verification = await checkVerification(address, networkKey, apiKey);
    } catch (err) {
      verification = { error: err.message };
    }
  }

  return formatReport(address, chain.name, rpc, verification);
}

// --- CLI entry point ---
async function main() {
  const [address, network] = process.argv.slice(2);
  if (!address) {
    console.error("Usage: node scripts/inspect_contract.js <address> [mainnet|testnet]");
    console.error("Optional: set SOCIALSCAN_API_KEY env var for verification details");
    process.exit(1);
  }
  try {
    const report = await inspect(address, network);
    console.log(report);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();

export { inspect };
