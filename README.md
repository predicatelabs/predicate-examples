# Predicate Examples

Practical examples demonstrating how to integrate [Predicate](https://predicate.io/) policy compliance into smart contracts and DeFi applications.

## Examples

### 🔢 [Counter](./counter/)
Basic smart contract with predicate protection. Shows:
- Smart contract integration with `PredicateClient`
- Policy validation for state-changing operations
- TypeScript client implementation

### 🔄 [Uniswap V4](./uniswap-V4/)
Policy-compliant DEX interface with hook-based validation. Features:
- Next.js frontend with RainbowKit wallet integration
- Predicate API validation before transaction execution
- Uniswap V4 hook integration with compliance signatures

## What is Predicate?

Predicate enables on-chain policy enforcement through cryptographic validation. Transactions are evaluated against configurable policies before on-chain execution, ensuring compliance with regulatory requirements or custom business logic.

## Quick Start

1. **Counter Example**:
   ```bash
   cd counter
   forge build && forge test
   ```

2. **Uniswap V4 Example**:
   ```bash
   cd uniswap-V4
   npm install && npm run dev
   ```

## License

MIT 