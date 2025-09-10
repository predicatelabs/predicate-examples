# Counter Predicate Client

A TypeScript client for incrementing the Counter contract using Predicate signatures.

## Setup

1. Install dependencies:
```bash
cd client
npm install
```

2. Create a `.env` file with the following variables:
```bash
# Predicate API configuration
PREDICATE_API_KEY=your_predicate_api_key_here

# Blockchain configuration
RPC=https://your-rpc-endpoint-here
PRIVATE_KEY=your_private_key_here

# Contract address (deploy the Counter contract first)
COUNTER_CONTRACT_ADDRESS=0x...
```

## Usage

### Run the increment script:
```bash
npm run increment
```

Or directly with ts-node:
```bash
npx ts-node increment-counter.ts
```

### Build and run:
```bash
npm run build
npm start
```

## What it does

1. Connects to your Counter contract
2. Reads the current counter value
3. Prepares a predicate request to increment the counter by 1
4. Evaluates the policy with Predicate
5. If compliant, submits the transaction with predicate signatures
6. Waits for confirmation and displays the new counter value

## Requirements

- Node.js >= 16.0.0
- A deployed Counter contract with predicate protection
- Valid Predicate API key
- RPC endpoint access
- Private key with sufficient funds for gas

## Contract Interaction

The script interacts with the `setNumberWithPredicate` function on the Counter contract, which requires:
- `newNumber`: The new value to set (current + 1)
- `predicateMessage`: The predicate signature data containing:
  - Task ID
  - Expiration block number
  - Signer addresses
  - Signatures

The script encodes the internal `setNumber(uint256)` function call as required by the predicate validation system. 