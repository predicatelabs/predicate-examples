# Predicate V4 Swap

A policy-compliant Uniswap V4 swap interface that validates transactions through Predicate's compliance API before execution.

## Architecture

**Policy With Predicate:**
1. User initiates USDC ↔ USDT swap
2. Transaction data sent to Predicate API for policy validation
3. Predicate returns compliance status + authorization signatures
4. Signatures encoded into Uniswap V4 `hookData` parameter
5. On-chain `PredicateHook` validates signatures during swap execution

**Technical Stack:**
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Wallet**: RainbowKit + Wagmi v2
- **Blockchain**: Ethereum mainnet with Viem
- **DEX**: Uniswap V4 Universal Router with Permit2 approvals
- **Compliance**: Predicate API integration with hook-based validation

## Project Structure

```
├── app/
│   ├── api/                     # Backend API routes
│   │   ├── evaluate-policy/     # Predicate policy validation
│   │   ├── check-allowance/     # ERC20 allowance checks
│   │   ├── check-permit2-allowance/ # Permit2 allowance + expiration
│   │   └── get-permit2-nonce/   # Permit2 nonce management
│   ├── page.tsx                 # Main swap interface page
│   ├── layout.tsx               # App layout with providers
│   └── providers.tsx            # Wagmi + RainbowKit setup
├── components/
│   └── SwapInterface.tsx        # Main swap UI component
├── config/
│   └── contracts.ts             # Contract addresses & pool config
├── lib/
│   ├── v4-encoder.ts           # Uniswap V4 parameter encoding
│   ├── permit2-client.ts       # Permit2 signature management
│   └── wagmi-config.ts         # Wallet connection config
└── types/
    └── uniswapv4.ts            # TypeScript type definitions
```

## Key Components

### SwapInterface (`components/SwapInterface.tsx`)
- **Approval Flow**: ERC20 → Permit2 → Universal Router
- **Policy Integration**: Calls Predicate API before transaction submission
- **State Management**: Handles allowances, signatures, and transaction status
- **UI**: Token selection, amount input, approval progress

### V4 Encoder (`lib/v4-encoder.ts`)
- **Transaction Encoding**: Formats Uniswap V4 parameters for Universal Router
- **Hook Integration**: Encodes Predicate signatures into `hookData`
- **Permit2 Integration**: Handles permit signature encoding

### API Routes (`app/api/`)
- **Policy Evaluation**: Validates transactions with Predicate API  
- **ERC20 Allowances**: Checks ERC20 → Permit2 approvals
- **Permit2**: Direct frontend integration with `@uniswap/permit2-sdk`

## Setup

```bash
npm install
```

Create `.env.local`:
```bash
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id
```

```bash
npm run dev
```

## Contract Addresses (Mainnet)

- **PredicateHook**: `0x145b39c7F5af791813Ba1fB16A4de63fDfCfA8A0`
- **Universal Router**: `0x66a9893cc07d91d95644aedd05d03f95e1dba8af`
- **Permit2**: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- **USDC**: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- **USDT**: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

## Technologies

- [Next.js 15](https://nextjs.org/) - React framework
- [Wagmi v2](https://wagmi.sh/) - Ethereum React hooks
- [Viem](https://viem.sh/) - TypeScript Ethereum library
- [RainbowKit](https://rainbowkit.com/) - Wallet connection UI
- [Uniswap V4](https://docs.uniswap.org/contracts/v4) - DEX protocol
- [Predicate](https://predicate.io/) - Policy compliance validation

## License

MIT
