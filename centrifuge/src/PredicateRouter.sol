// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Auth} from "protocol-v3/misc/Auth.sol";
import {IBaseVault} from "protocol-v3/vaults/interfaces/IBaseVault.sol";
import {BaseSyncDepositVault} from "protocol-v3/vaults/BaseVaults.sol";
import {IVault} from "protocol-v3/spoke/interfaces/IVault.sol";
import {ISpoke, VaultDetails} from "protocol-v3/spoke/interfaces/ISpoke.sol";
import {IShareToken} from "protocol-v3/spoke/interfaces/IShareToken.sol";
import {IERC20} from "protocol-v3/misc/interfaces/IERC20.sol";
import {SafeTransferLib} from "protocol-v3/misc/libraries/SafeTransferLib.sol";
import {IMemberlist} from "protocol-v3/hooks/interfaces/IMemberlist.sol";
import {PredicateMessage} from "predicate-contracts/interfaces/IPredicateClient.sol";
import {PredicateClient} from "predicate-contracts/mixins/PredicateClient.sol";

/// @title PredicateRouter
/// @notice Router that validates predicate messages, records temporary membership on the share-token hook, and
///         executes Centrifuge vault actions (deposit/mint) in a single transaction.
/// @dev    This contract does three things when a user calls `deposit`/`mint`:
///             1. Verifies the predicate message against the configured `PredicateManager` via `PredicateClient`.
///             2. Updates the share token’s hook data (using the hook-manager role) with the attestation expiry.
///             3. Pulls user assets, approves the vault, and forwards the call to the Centrifuge vault.
///         The hook then enforces the expiry on any subsequent transfer of the share token.
contract PredicateRouter is PredicateClient, Auth {
    ISpoke public immutable spoke;

    /// @notice Emitted after membership is updated for a particular vault action.
    event PredicateMemberAuthorized(
        address indexed shareToken,
        address indexed vault,
        address indexed user,
        bytes4 actionSelector,
        uint64 validUntil
    );

    error HookNotConfigured();
    error ShareTokenNotFound();
    error InvalidOwner();
    error PredicateVerificationFailed();
    error PredicateMessageExpired();

    /// @param spoke_            Centrifuge spoke used to resolve share tokens (pool + share class).
    /// @param predicateManager  Predicate service manager that validates predicate messages.
    /// @param policyID          Initial policy identifier used when building predicate tasks.
    /// @param deployer          Address granted the initial auth role for router governance.
    constructor(ISpoke spoke_, address predicateManager, string memory policyID, address deployer) Auth(deployer) {
        spoke = spoke_;
        if (predicateManager != address(0)) {
            _initPredicateClient(predicateManager, policyID);
        }
    }

    /// @notice Updates the predicate manager used for signature validation.
    /// @param predicateManager New predicate manager address.
    function setPredicateManager(address predicateManager) external auth {
        _setPredicateManager(predicateManager);
    }

    /// @notice Updates the policy string used when constructing predicate tasks.
    /// @param policyID New policy identifier (must be known to the registry).
    function setPolicy(string memory policyID) external auth {
        _setPolicy(policyID);
    }

    /// @notice Validates a predicate message, updates hook membership, and deposits assets into the vault.
    /// @param vault      Target vault.
    /// @param assets     Amount of underlying assets to deposit.
    /// @param receiver   Address receiving the newly minted shares.
    /// @param owner      Address providing the assets (must approve the router).
    /// @param predicateMsg Predicate message covering this deposit call.
    /// @return shares    Amount of shares minted to `receiver`.
    function deposit(
        BaseSyncDepositVault vault,
        uint256 assets,
        address receiver,
        address owner,
        PredicateMessage calldata predicateMsg
    ) external returns (uint256 shares) {
        require(owner == msg.sender || owner == address(this), InvalidOwner());

        bytes memory callData =
            abi.encodeWithSignature("deposit(address,uint256,address,address)", address(vault), assets, receiver, owner);

        (IShareToken shareToken, uint64 expiry) = _authorize(vault, receiver, msg.sender, predicateMsg, callData);

        VaultDetails memory details = spoke.vaultDetails(IBaseVault(address(vault)));
        _collectAssets(details.asset, owner, assets);
        _approveMax(details.asset, address(vault));

        shares = vault.deposit(assets, receiver);
        emit PredicateMemberAuthorized(address(shareToken), address(vault), receiver, _selector(callData), expiry);
    }

    /// @notice Validates a predicate message, updates hook membership, and mints shares by providing assets.
    /// @param vault        Target vault.
    /// @param shares       Amount of shares to mint.
    /// @param receiver     Address receiving the shares (membership is written for this account).
    /// @param owner        Address providing the assets (must approve the router).
    /// @param predicateMsg  Predicate message covering this mint call.
    /// @return assets      Amount of assets actually consumed by the mint (mirrors the vault return value).
    function mint(
        BaseSyncDepositVault vault,
        uint256 shares,
        address receiver,
        address owner,
        PredicateMessage calldata predicateMsg
    ) external returns (uint256 assets) {
        require(owner == msg.sender || owner == address(this), InvalidOwner());

        bytes memory callData =
            abi.encodeWithSignature("mint(address,uint256,address,address)", address(vault), shares, receiver, owner);

        (IShareToken shareToken, uint64 expiry) = _authorize(vault, receiver, msg.sender, predicateMsg, callData);

        VaultDetails memory details = spoke.vaultDetails(IBaseVault(address(vault)));
        assets = vault.previewMint(shares);
        _collectAssets(details.asset, owner, assets);
        _approveMax(details.asset, address(vault));

        assets = vault.mint(shares, receiver);
        emit PredicateMemberAuthorized(address(shareToken), address(vault), receiver, _selector(callData), expiry);
    }

    /// @dev Validates the attestation and writes the expiry into the share token hook.
    /// @param vault              Vault whose share token should be updated.
    /// @param receiver           Account that receives temporary membership for this call.
    /// @param caller             Real EVM sender (propagated into the attestation check).
    /// @param predicateMsg       Predicate message authorising the call.
    /// @param encodedSigAndArgs  ABI-encoded selector + arguments for the target call.
    /// @return shareToken        Share token instance resolved from the spoke.
    /// @return expiry            Expiry timestamp (stored in the hook data).
    function _authorize(
        BaseSyncDepositVault vault,
        address receiver,
        address caller,
        PredicateMessage calldata predicateMsg,
        bytes memory encodedSigAndArgs
    ) internal returns (IShareToken shareToken, uint64 expiry) {
        uint256 expireBy = predicateMsg.expireByTime;
        if (expireBy <= block.timestamp || expireBy > type(uint64).max) {
            revert PredicateMessageExpired();
        }

        if (!_authorizeTransaction(predicateMsg, encodedSigAndArgs, caller, 0)) {
            revert PredicateVerificationFailed();
        }

        expiry = uint64(expireBy);

        IVault vaultInterface = IVault(address(vault));
        shareToken = spoke.shareToken(vaultInterface.poolId(), vaultInterface.scId());
        if (address(shareToken) == address(0)) revert ShareTokenNotFound();

        address hookAddress = shareToken.hook();
        if (hookAddress == address(0)) revert HookNotConfigured();

        IMemberlist(hookAddress).updateMember(address(shareToken), receiver, expiry);
    }

    /// @dev Extracts the first four bytes from the encoded call data.
    function _selector(bytes memory encodedSigAndArgs) internal pure returns (bytes4 selector) {
        if (encodedSigAndArgs.length >= 4) {
            assembly {
                selector := mload(add(encodedSigAndArgs, 32))
            }
        }
    }

    /// @dev Pulls assets from the owner to the router (unless the router is the owner).
    function _collectAssets(address asset, address owner, uint256 amount) internal {
        if (amount == 0 || owner == address(this)) return;
        SafeTransferLib.safeTransferFrom(asset, owner, address(this), amount);
    }

    /// @dev Approves the vault for unlimited transfers if no allowance is set yet.
    function _approveMax(address asset, address spender) internal {
        if (IERC20(asset).allowance(address(this), spender) == 0) {
            SafeTransferLib.safeApprove(asset, spender, type(uint256).max);
        }
    }
}
