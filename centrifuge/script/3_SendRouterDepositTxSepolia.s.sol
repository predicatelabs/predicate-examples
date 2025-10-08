// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";
import "forge-std/console2.sol";

import {PredicateMessage} from "predicate-contracts/interfaces/IPredicateClient.sol";
import {PredicateRouter} from "src/PredicateRouter.sol";
import {BaseSyncDepositVault} from "protocol-v3/vaults/BaseVaults.sol";

/// @notice Broadcasts a `PredicateRouter.deposit` transaction on Sepolia using a JSON-encoded predicate message.
/// @dev Expects the following environment variables (mirrors the naming used elsewhere in this repo):
///         - PRIVATE_KEY                Broadcaster key (required when broadcasting)
///         - PREDICATE_ROUTER_ADDRESS   Target PredicateRouter contract
///         - PREDICATE_VAULT_ADDRESS    Centrifuge vault to deposit into
///         - PREDICATE_ASSETS           Asset amount (uint, defaults to 0)
///         - PREDICATE_RECEIVER_ADDRESS Receiver of the minted shares (defaults to the owner)
///         - PREDICATE_OWNER_ADDRESS    Address providing the assets (defaults to broadcaster)
///         - PREDICATE_MESSAGE_PATH     Path to JSON file containing the predicate message
///         - PREDICATE_CHAIN_ID         Optional override for chain id logging (defaults to block.chainid)
///
/// The predicate message file must contain the fields produced by `signaturesToBytes`:
/// {
///   "taskId": "...",
///   "expireByTime": 123,
///   "signerAddresses": ["0x..."],
///   "signatures": ["0x..."]
/// }
contract SendRouterDepositTxSepolia is Script {
    using stdJson for string;

    struct Config {
        address router;
        address vault;
        uint256 assets;
        address receiver;
        address owner;
        string predicateMessagePath;
    }

    function run() external {
        Config memory cfg = _loadConfig();

        uint256 broadcasterKey = vm.envUint("PRIVATE_KEY");
        address broadcaster = vm.addr(broadcasterKey);

        if (cfg.owner == address(0)) cfg.owner = broadcaster;
        if (cfg.receiver == address(0)) cfg.receiver = cfg.owner;

        console2.log("Submitting PredicateRouter.deposit from", broadcaster);
        console2.log("Router", cfg.router);
        console2.log("Vault", cfg.vault);
        console2.log("Assets", cfg.assets);
        console2.log("Receiver", cfg.receiver);
        console2.log("Owner", cfg.owner);

        PredicateMessage memory predicateMsg = _loadPredicateMessage(cfg.predicateMessagePath);

        vm.startBroadcast(broadcasterKey);
        PredicateRouter(cfg.router).deposit(
            BaseSyncDepositVault(cfg.vault), cfg.assets, cfg.receiver, cfg.owner, predicateMsg
        );
        vm.stopBroadcast();
    }

    function _loadConfig() internal view returns (Config memory cfg) {
        cfg.router = vm.envAddress("PREDICATE_ROUTER_ADDRESS");
        cfg.vault = vm.envAddress("PREDICATE_VAULT_ADDRESS");
        cfg.assets = vm.envOr("PREDICATE_ASSETS", uint256(0));
        if (vm.envExists("PREDICATE_RECEIVER_ADDRESS")) {
            cfg.receiver = vm.envAddress("PREDICATE_RECEIVER_ADDRESS");
        }
        if (vm.envExists("PREDICATE_OWNER_ADDRESS")) {
            cfg.owner = vm.envAddress("PREDICATE_OWNER_ADDRESS");
        }
        cfg.predicateMessagePath = vm.envString("PREDICATE_MESSAGE_PATH");
    }

    function _loadPredicateMessage(string memory jsonPath) internal view returns (PredicateMessage memory message) {
        string memory rawJson = vm.readFile(jsonPath);
        // Validate JSON by attempting to parse it; throws on invalid JSON.
        vm.parseJson(rawJson);

        message.taskId = rawJson.readString(".taskId");
        message.expireByTime = rawJson.readUint(".expireByTime");
        message.signerAddresses = rawJson.readAddressArray(".signerAddresses");
        message.signatures = rawJson.readBytesArray(".signatures");
    }
}
