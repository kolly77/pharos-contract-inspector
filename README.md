# Pharos Contract Inspector

An [Agent Skill](agentskills.io) for inspecting any address on the [Pharos Network](www.pharos.xyz). Built for the **Pharos Agent Center Skill Builder Campaign**.

Lets an AI agent answer questions like:
- "What is the contract at `0xabc...`?"
- "Is this address a contract or a wallet?"
- "Is this token an ERC-20, ERC-721, or ERC-1155?"
- "Is this a proxy contract? What's the implementation?"
- "Is this contract verified on Pharosscan?"
- "What compiler version was used?"

## How it works

The skill works in **two tiers**:

### Tier 1 — RPC-only (always works, no setup)

- Detects whether an address is a contract or a regular wallet (EOA)
- Reports bytecode size
- Identifies the token standard via `supportsInterface` (ERC-165) and standard view function probing:
  - ERC-721 — `supportsInterface(0x80ac58cd)`
  - ERC-1155 — `supportsInterface(0xd9b67a26)`
  - ERC-20 — heuristic via `decimals()` + `totalSupply()`
- Reads token metadata: name, symbol, decimals
- Detects proxy contracts by reading the EIP-1967 implementation storage slot
- Generates a direct Pharos explorer link

All operations are **read-only** — zero gas cost.

### Tier 2 — SocialScan verification (with API key)

If you set the `SOCIALSCAN_API_KEY` environment variable, the inspector additionally:

- Confirms whether the source code has been verified on Pharosscan
- Returns verified contract name, compiler version, optimization settings, license
- Returns EVM version and implementation address (for proxies)

Get a free key at developer.socialscan.io.

## Installation

```bash
git clone github.com/<your-username>/pharos-contract-inspector.git
cd pharos-contract-inspector
npm install
```

Requires Node.js 18+.

## Usage

### Without API key (Tier 1 only)

```bash
node scripts/inspect_contract.js <address> [mainnet|testnet]
```

### With API key (Tier 1 + Tier 2)

```bash
export SOCIALSCAN_API_KEY=your_key_here
node scripts/inspect_contract.js <address> mainnet
```

### Example output

```
Address:        0xAbCdEf1234567890aBcDeF1234567890AbCdEf12
Type:           Contract
Network:        Pharos Pacific Ocean Mainnet
Standard:       ERC-721
Name:           Example Collection
Symbol:         EXC
Bytecode size:  4,521 bytes
Proxy:          No
Explorer:       pharosscan.xyz/address/0xAbCd...

— Verification (SocialScan) —
Verified:       Yes
Contract name:  ExampleNFT
Compiler:       v0.8.20+commit.a1b79de6
Optimization:   Enabled (200 runs)
License:        MIT
```

If the API key isn't set, the verification section becomes:

```
— Verification —
(Set SOCIALSCAN_API_KEY env var to enable verification details)
```

## Using as an Agent Skill

This repo follows the [open Agent Skills format](agentskills.io/specification):

```
pharos-contract-inspector/
├── SKILL.md              # Metadata + instructions for the agent
├── scripts/
│   └── inspect_contract.js
├── package.json
└── README.md
```

Agents compatible with Pharos Agent Center (Claude Code, Codex, OpenClaw, etc.) load `SKILL.md` automatically and trigger this skill when the user asks about a contract or address on Pharos.

## Network details

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Mainnet | 1672 | `rpc.pharos.xyz` | `pharosscan.xyz` |
| Atlantic Testnet | 688689 | `atlantic.dplabs-internal.com` | `atlantic.pharosscan.xyz` |

## License

MIT
