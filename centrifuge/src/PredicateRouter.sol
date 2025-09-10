// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Auth} from "protocol-v3/misc/Auth.sol";
import {Recoverable} from "protocol-v3/misc/Recoverable.sol";
import {IERC20} from "protocol-v3/misc/interfaces/IERC20.sol";
import {SafeTransferLib} from "protocol-v3/misc/libraries/SafeTransferLib.sol";

import {IBaseVault} from "protocol-v3/vaults/interfaces/IBaseVault.sol";
import {BaseSyncDepositVault} from "protocol-v3/vaults/BaseVaults.sol";
import {IVault} from "protocol-v3/spoke/interfaces/IVault.sol";

import {IGateway} from "protocol-v3/common/interfaces/IGateway.sol";
import {ISpoke, VaultDetails} from "protocol-v3/spoke/interfaces/ISpoke.sol";
import {IShareToken} from "protocol-v3/spoke/interfaces/IShareToken.sol";

import {PredicateTransferHook} from "./PredicateTransferHook.sol";
import {PredicateMessage} from "predicate-contracts/interfaces/IPredicateClient.sol";

/// @title PredicateRouter
/// @notice Minimal router for synchronous vault deposits with current-transaction member validity
/// @dev Delegates predicate verification to PredicateTransferHook - MVP for sync deposits only
contract PredicateRouter is Auth, Recoverable {
    ISpoke public immutable spoke;
    IGateway public immutable gateway;
    
    event MemberUpdatedForVault(address indexed vault, address indexed user);
    
    error InvalidVault();
    error InvalidOwner();
    
    constructor(
        IGateway gateway_,
        ISpoke spoke_,
        address deployer
    ) Auth(deployer) {
        gateway = gateway_;
        spoke = spoke_;
    }
    
    modifier payTransaction() {
        if (!gateway.isBatching()) {
            gateway.startTransactionPayment{value: msg.value}(msg.sender);
        }
        _;
        if (!gateway.isBatching()) {
            gateway.endTransactionPayment();
        }
    }
    
    /// @notice Validates predicate attestation and updates member for current transaction only
    /// @param vault The vault being accessed
    /// @param user The user making the request
    /// @param message The predicate attestation
    /// @param encodedSigAndArgs The encoded function call
    function _updateMemberOnPredicateHook(
        IBaseVault vault,
        address user,
        PredicateMessage calldata message,
        bytes memory encodedSigAndArgs
    ) internal {
        IVault vaultInterface = IVault(address(vault));
        IShareToken shareToken = spoke.shareToken(vaultInterface.poolId(), vaultInterface.scId());
        
        address hookAddress = shareToken.hook();
        require(hookAddress != address(0), InvalidVault());
        
        PredicateTransferHook(hookAddress).updateMemberWithAuthorization(
            address(shareToken),
            user,
            message,
            encodedSigAndArgs
        );
        
        emit MemberUpdatedForVault(address(vault), user);
    }
    
    //----------------------------------------------------------------------------------------------
    // Synchronous Deposit Function (MVP)
    //----------------------------------------------------------------------------------------------
    
    /// @notice Synchronous deposit with predicate validation
    /// @param vault The sync vault to deposit into
    /// @param assets The amount of assets to deposit
    /// @param receiver The receiver address
    /// @param owner The owner address
    /// @param message The predicate attestation
    function deposit(
        BaseSyncDepositVault vault,
        uint256 assets,
        address receiver,
        address owner,
        PredicateMessage calldata message
    ) external payable payTransaction {
        require(owner == msg.sender || owner == address(this), InvalidOwner());
        
        bytes memory encodedCall = abi.encodeWithSignature(
            "deposit(address,uint256,address,address)",
            address(vault), assets, receiver, owner
        );
        
        _updateMemberOnPredicateHook(vault, receiver, message, encodedCall);
        
        VaultDetails memory vaultDetails = spoke.vaultDetails(IBaseVault(address(vault)));
        if (owner != address(this)) {
            SafeTransferLib.safeTransferFrom(vaultDetails.asset, owner, address(this), assets);
        }
        _approveMax(vaultDetails.asset, address(vault));
        
        vault.deposit(assets, receiver);
    }
    
    
    //----------------------------------------------------------------------------------------------
    // Utilities
    //----------------------------------------------------------------------------------------------
    
    /// @notice Approves maximum amount for a spender if not already approved
    /// @param asset The asset to approve
    /// @param spender The spender address
    function _approveMax(address asset, address spender) internal {
        if (IERC20(asset).allowance(address(this), spender) == 0) {
            SafeTransferLib.safeApprove(asset, spender, type(uint256).max);
        }
    }
}
