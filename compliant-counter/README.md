Here’s a concise and clear README for your `compliant-counter` project:

---

# Compliant Counter

This project demonstrates integrating a Solidity contract with Predicate's API to fetch signatures and submit transactions. It walks through building, testing, deploying, and interacting with the contract using TypeScript.

## Prerequisites

1. **Dependencies**:
    - [Node.js](https://nodejs.org) (18+ recommended)
    - [Foundry](https://book.getfoundry.sh/) installed globally (`curl -L https://foundry.paradigm.xyz | bash`)
2. **Environment Variables**:
    - Create a `.env` file based on `.env.example` with the following:
        - `PRIVATE_KEY`: Your Ethereum private key.
        - `RPC_URL`: Your Ethereum RPC URL.
        - `PREDICATE_API_KEY`: Your Predicate API key.
        - `CONTRACT_ADDRESS`: Deployed contract address (set after deployment).

## Project Structure

- `contracts/`: Contains Solidity contract (`Counter.sol`) and deployment script (`Counter.s.sol`).
- `src/`: TypeScript code to fetch signatures from Predicate and interact with the deployed contract.

## Getting Started

### 1. Build the Contract

From `/compliant-counter/contracts`, run the following command to compile the contract:

```bash
  forge build
```

### 2. Test the Contract

Run the tests:

```bash
forge test
```

### 3. Deploy the Contract

Deploy the contract using Foundry's script:

```bash
forge script script/Counter.s.sol \
    --rpc-url <RPC_URL> \
    --broadcast --verify -vvvv \
    --etherscan-api-key <ETHERSCAN_API_KEY> \
    --private-key <PRIVATE_KEY>
```

If the contract doesn't verify automatically, run:

```bash
forge verify-contract \
    <CONTRACT_ADDRESS> \
    src/Counter.sol:Counter \
    --chain-id 1 \
    --constructor-args $(cast abi-encode "constructor(address,string)" $PREDICATE_MANAGER $POLICY_ID) \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version 0.8.28
```

### 4. Set Environment Variables

Update your `.env` file with the deployed `CONTRACT_ADDRESS`.

### 5. Run the Script

Install dependencies:

```bash
npm install
```

Start the TypeScript script to interact with the contract:

```bash
npm start
```

This script fetches Predicate signatures, submits a transaction to the deployed contract, and logs the results.

---