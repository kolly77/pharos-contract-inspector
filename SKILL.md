---
name: pharos-contract-inspector
description: Inspect any address on the Pharos Network — detect whether it's a contract or a regular wallet, identify the token standard it implements (ERC-20, ERC-721, ERC-1155), read token metadata, detect proxy contracts (EIP-1967), and optionally pull verification status, compiler details, and license info from Pharosscan via SocialScan. Use whenever a user asks "what is this contract", "is this address a contract", "what kind of token is this", "is this contract verified", "is this a proxy", or any question about an unknown Pharos address.
license: MIT
---

# Pharos Contract Inspector

A two-tier Agent Skill for inspecting addresses on the Pharos Network.

**Tier 1 (always works, no setup):** RPC-only inspection — detects contract vs wallet, identifies the token standard, reads metadata, detects proxies, and links to the explorer.

**Tier 2 (optional, with API key):** Adds verification status, compiler version, optimization settings, license type, and verified contract name from Pharosscan.

## When to use

Use this skill when the user wants to:
- Identify what kind of contract sits at a Pharos address
- Determine if an address holds code or is a regular wallet
- Detect which token standard (ERC-20 / ERC-721 / ERC-1155) a contract implements
- Read a token's name, symbol, and decimals
- Check whether a contract is a proxy and find its implementation
- Confirm whether a contract's source code has been verified on Pharosscan
- Look up a verified contract's compiler version, optimization settings, and license

## Inputs

1. **Address** — the address to inspect (0x-prefixed, 42 chars)

Optional:
- **Network** — `mainnet` (default, chain 1672) or `testnet` (chain 688689 Atlantic)
- **SOCIALSCAN_API_KEY** environment variable — unlocks the Tier 2 verification details

## How to run it

```bash
node scripts/inspect_contract.js <address> [network]
```

For Tier 2 verification details, set the API key first:

```bash
export SOCIALSCAN_API_KEY=your_key_here
node scripts/inspect_contract.js <address> mainnet
```

## Output format

A clean, human-readable report:

```
Address:        0xabc...
Type:           Contract
Network:        Pharos Pacific Ocean Mainnet
Standard:       ERC-721
Name:           Example Collection
Symbol:         EXC
Bytecode size:  4,521 bytes
Proxy:          No
Explorer:       pharosscan.xyz/address/0xabc...

— Verification (SocialScan) —
Verified:       Yes
Contract name:  ExampleNFT
Compiler:       v0.8.20+commit.a1b79de6
Optimization:   Enabled (200 runs)
License:        MIT
```

If no API key is configured, the verification section is replaced with a hint:

```
— Verification —
(Set SOCIALSCAN_API_KEY env var to enable verification details)
```

## Detection logic

- **Contract vs wallet**: `eth_getCode` — empty bytecode means it's an EOA (wallet)
- **ERC-721**: `supportsInterface(0x80ac58cd)` returns true
- **ERC-1155**: `supportsInterface(0xd9b67a26)` returns true
- **ERC-20**: heuristic — `decimals()` + `totalSupply()` both return without reverting
- **Proxy**: reads EIP-1967 implementation slot `0x360894a13...382bbc`; if non-zero, contract is a proxy
- **Verification (Tier 2)**: calls `api.socialscan.io/<network>/v1/explorer/command_api/contract?module=contract&action=getsourcecode&address=<addr>&apikey=<key>` and parses the Etherscan-compatible response

## Edge cases

- **Invalid address format**: rejected up front with a clear message
- **Empty bytecode**: returned as "regular wallet (EOA)" — no further checks attempted
- **Contract that doesn't implement supportsInterface**: ERC-721/1155 detection skipped; falls back to ERC-20 probing
- **Tokens using bytes32 for name/symbol** (older contracts): caught and reported as "name unavailable"
- **SocialScan API unreachable or rate-limited**: Tier 1 output still returned; Tier 2 section shows the error
- **Unverified contract**: Tier 2 reports "Verified: No" cleanly

## Dependencies

- Node.js 18+ (native `fetch` is used for the SocialScan call)
- `viem` (installed via `npm install`)

See `README.md` for setup.
