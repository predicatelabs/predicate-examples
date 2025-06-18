# Uniswap V4 Swap App

A minimal NextJS application for swapping USDC and USDT using Uniswap V4 with Predicate policy compliance.

## Features

- 🔄 Simple USDC ↔ USDT swaps
- 🔐 Policy-compliant transactions via Predicate API
- 🦄 Uniswap V4 integration with hooks
- 💰 Wallet connection with RainbowKit
- 📱 Responsive design with Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Predicate API key (contact Predicate team for production keys)
- WalletConnect Project ID (get from [WalletConnect Cloud](https://cloud.walletconnect.com))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd uniswap-v4
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file:
```bash
# Predicate API Configuration
NEXT_PUBLIC_PREDICATE_API_KEY=your_predicate_api_key_here

# WalletConnect Project ID
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id_here

# Contract Addresses (update with actual deployed addresses)
NEXT_PUBLIC_PREDICATE_HOOK_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_POOL_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_POSITION_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser.

## Configuration

### Contract Addresses

Update the contract addresses in `config/contracts.ts`:

- `PREDICATE_HOOK`: The deployed Predicate Hook contract address
- `POOL_MANAGER`: Uniswap V4 Pool Manager address
- `POSITION_MANAGER`: Uniswap V4 Position Manager address
- `USDC` and `USDT`: Token contract addresses

### Predicate Configuration

Update the Predicate configuration in `config/contracts.ts`:

- `API_URL`: Predicate API endpoint
- `POLICY_ID`: Your specific policy ID

## How It Works

1. **Connect Wallet**: Users connect their Ethereum wallet via RainbowKit
2. **Select Tokens**: Choose between USDC and USDT for swapping
3. **Enter Amount**: Specify the amount to swap
4. **Policy Validation**: The app calls the Predicate API to validate the transaction
5. **Execute Swap**: If compliant, the swap is executed on Uniswap V4

## Architecture

```
uniswap-v4/
├── app/                 # Next.js app directory
│   ├── page.tsx        # Main page
│   ├── layout.tsx      # App layout with providers
│   └── providers.tsx   # Wagmi and RainbowKit providers
├── components/         # React components
│   └── SwapInterface.tsx
├── config/            # Configuration files
│   └── contracts.ts   # Contract addresses and settings
├── lib/              # Utility libraries
│   ├── wagmi-config.ts
│   └── predicate-client.ts
└── types/            # TypeScript type definitions
    └── predicate.ts
```

## Key Components

- **SwapInterface**: Main swap UI component
- **PredicateClient**: Handles Predicate API interactions
- **Providers**: Wagmi and RainbowKit configuration

## Development Notes

This is a **proof of concept** application. For production use:

1. Replace placeholder contract addresses with actual deployed contracts
2. Implement proper error handling and user feedback
3. Add transaction confirmation and status tracking
4. Implement actual price feeds instead of 1:1 simulation
5. Add slippage protection and deadline settings
6. Implement proper token allowance handling

## Technologies Used

- [Next.js 15](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [RainbowKit](https://www.rainbowkit.com/) - Wallet connection
- [Wagmi](https://wagmi.sh/) - Ethereum interactions
- [Viem](https://viem.sh/) - Ethereum utilities
- [Uniswap V4](https://docs.uniswap.org/contracts/v4) - DEX protocol
- [Predicate](https://predicate.io/) - Policy compliance

## Contributing

This is a production-ready Uniswap V4 swap interface. Feel free to extend it with:

- Additional token pairs
- Advanced trading features
- Portfolio tracking
- Analytics dashboard

## License

MIT
