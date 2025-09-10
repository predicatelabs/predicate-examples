# Centrifuge Smart Contract Project

This project demonstrates how to use both the Centrifuge Protocol V3 and Predicate Contracts as libraries in a Foundry-based smart contract development environment.

## Project Structure

```
centrifuge/
├── src/
│   └── Counter.sol           # Example contract using protocol-v3 and predicate-contracts
├── test/
│   └── Counter.t.sol         # Tests for the example contract
├── script/
│   └── Counter.s.sol         # Deployment script
├── lib/
│   ├── forge-std/            # Foundry standard library
│   ├── predicate-contracts/  # Predicate Labs contracts (submodule)
│   └── protocol-v3/          # Centrifuge Protocol V3 (submodule)
└── foundry.toml             # Foundry configuration with remappings
```

## Dependencies

This project includes the following dependencies as git submodules:

- **[Centrifuge Protocol V3](https://github.com/centrifuge/protocol-v3)**: Open infrastructure for onchain asset management
- **[Predicate Contracts](https://github.com/PredicateLabs/predicate-contracts)**: Smart contracts for Predicate Labs
- **Forge Standard Library**: Testing utilities and base contracts

## Available Imports

### Protocol V3 Imports

```solidity
import "protocol-v3/misc/Auth.sol";
import "protocol-v3/misc/ERC20.sol";
import "protocol-v3/hub/Hub.sol";
import "protocol-v3/spoke/Spoke.sol";
import "protocol-v3/vaults/AsyncVault.sol";
// ... and many more
```

### Predicate Contracts Imports

```solidity
import "predicate-contracts/ServiceManager.sol";
import "predicate-contracts/SimpleServiceManager.sol";
import "predicate-contracts/mixins/PredicateClient.sol";
// ... and more
```

### Additional Dependencies

```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
// ... and more
```

## Commands

### Build
```bash
forge build
```

### Test
```bash
forge test
```

### Deploy (example)
```bash
forge script script/Counter.s.sol --rpc-url <your-rpc-url> --private-key <your-private-key>
```

## Example Usage

The `CentrifugeExample` contract in `src/Counter.sol` demonstrates:

1. **Inheriting from Protocol V3 contracts**: Uses `Auth` for access control
2. **Importing Predicate contracts**: Shows how to reference ServiceManager
3. **Proper contract structure**: Includes constructor and access-controlled functions

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Import from protocol-v3
import "protocol-v3/misc/Auth.sol";
import "protocol-v3/misc/ERC20.sol";

// Import from predicate-contracts
import "predicate-contracts/ServiceManager.sol";

contract CentrifugeExample is Auth {
    uint256 public number;
    
    constructor() Auth(msg.sender) {}

    function setNumber(uint256 newNumber) public auth {
        number = newNumber;
    }

    function increment() public auth {
        number++;
    }
}
```

## Configuration

The `foundry.toml` file includes proper remappings for all dependencies:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.28"
optimizer = true
optimizer_runs = 200

# Remappings for dependencies
remappings = [
  "forge-std/=lib/forge-std/src/",
  "predicate-contracts/=lib/predicate-contracts/src/",
  "protocol-v3/=lib/protocol-v3/src/",
  "@openzeppelin/contracts/=lib/predicate-contracts/lib/openzeppelin-contracts/contracts/",
  "@openzeppelin/contracts-upgradeable/=lib/predicate-contracts/lib/openzeppelin-contracts-upgradeable/contracts/",
  "eigenlayer-contracts/=lib/predicate-contracts/lib/eigenlayer-contracts/",
  "eigenlayer-middleware/=lib/predicate-contracts/lib/eigenlayer-middleware/src/"
]
```

## Getting Started

1. Make sure you have [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
2. Initialize submodules (if cloning from git): `git submodule update --init --recursive`
3. Build the project: `forge build`
4. Run tests: `forge test`
5. Start building your contracts using the available libraries!

## License

This project is licensed under the UNLICENSED license.