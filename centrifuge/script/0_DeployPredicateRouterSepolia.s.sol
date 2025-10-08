// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {PredicateRouter} from "src/PredicateRouter.sol";
import {ISpoke} from "protocol-v3/spoke/interfaces/ISpoke.sol";

/// @notice Deploys the PredicateRouter to Sepolia and logs the constructor parameters used.
/// @dev Configuration is read entirely from environment variables to maintain deterministic
///      deploys. All values default to zero-equivalents so that dry runs are possible.
///
/// Environment variables (optional unless noted otherwise):
/// - `PRIVATE_KEY`              Broadcaster key (required when using `--broadcast`).
/// - `SPOKE_ADDRESS`            Centrifuge spoke controlling share tokens (default: address(0)).
/// - `PREDICATE_MANAGER_ADDRESS`Predicate service manager address that validates predicate messages (default: address(0)).
/// - `POLICY_ID`                Predicate policy identifier (default: empty string).
///
/// Example usage:
/// ```bash
/// PRIVATE_KEY=... \
/// SPOKE_ADDRESS=0x... \
/// PREDICATE_MANAGER_ADDRESS=0x... \
/// POLICY_ID="centrifuge-policy" \
/// forge script script/0_DeployPredicateRouterSepolia.s.sol:DeployPredicateRouterSepolia \
///   --rpc-url $SEPOLIA_RPC_URL --broadcast
/// ```
///
/// To verify afterwards:
/// `forge verify-contract --chain-id 11155111 <ROUTER_ADDRESS> src/PredicateRouter.sol:PredicateRouter --constructor-args $(cast abi-encode "constructor(address,address,string,address)" <SPOKE> <MANAGER> <POLICY> <DEPLOYER>) --etherscan-api-key $ETHERSCAN_API_KEY --watch`
contract DeployPredicateRouterSepolia is Script {
    error UnexpectedChain(uint256 currentChainId);

    /// @dev In-memory copy of deploy-time configuration to avoid repeated env lookups.
    struct Config {
        address spoke;
        address predicateManager;
        string policyId;
    }

    function run() external returns (PredicateRouter router) {
        Config memory cfg = _loadConfig();

        if (block.chainid != 11155111) {
            revert UnexpectedChain(block.chainid);
        }

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deploying PredicateRouter on Sepolia with sender", deployer);
        console2.log("Spoke address", cfg.spoke);
        console2.log("Predicate manager", cfg.predicateManager);
        console2.log("Policy ID", bytes(cfg.policyId).length > 0 ? cfg.policyId : "<empty>");

        // Deploy the router in a single tx; no post-processing occurs inside the script.
        vm.startBroadcast(deployerKey);
        router = new PredicateRouter(ISpoke(cfg.spoke), cfg.predicateManager, cfg.policyId, deployer);
        vm.stopBroadcast();

        console2.log("PredicateRouter deployed", address(router));
    }

    /// @dev Pulls environment-driven configuration, falling back to zero values when unset.
    function _loadConfig() internal view returns (Config memory cfg) {
        if (vm.envExists("SPOKE_ADDRESS")) {
            cfg.spoke = vm.envAddress("SPOKE_ADDRESS");
        }
        if (vm.envExists("PREDICATE_MANAGER_ADDRESS")) {
            cfg.predicateManager = vm.envAddress("PREDICATE_MANAGER_ADDRESS");
        }
        if (vm.envExists("POLICY_ID")) {
            cfg.policyId = vm.envString("POLICY_ID");
        }
    }
}
