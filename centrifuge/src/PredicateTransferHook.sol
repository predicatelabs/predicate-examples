// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {BaseTransferHook} from "protocol-v3/hooks/BaseTransferHook.sol";
import {ITransferHook, HookData} from "protocol-v3/common/interfaces/ITransferHook.sol";
import {IShareToken} from "protocol-v3/spoke/interfaces/IShareToken.sol";
import {BitmapLib} from "protocol-v3/misc/libraries/BitmapLib.sol";
import {PredicateClient} from "predicate-contracts/mixins/PredicateClient.sol";
import {PredicateMessage} from "predicate-contracts/interfaces/IPredicateClient.sol";

/// @title PredicateTransferHook
/// @notice Transfer hook that supports both permanent members and predicate-based temporary access
/// @dev Extends BaseTransferHook with predicate-aware member validation and compliance checking
contract PredicateTransferHook is BaseTransferHook, PredicateClient {
    using BitmapLib for *;
    
    error PredicateVerificationFailed();
    error PredicateAccessExpired(address user, uint256 expiredAt, uint256 currentTime);

    constructor(
        address root_,
        address redeemSource_,
        address depositTarget_,
        address crosschainSource_,
        address predicateManager_,
        string memory policyID_,
        address deployer
    )
        BaseTransferHook(
            root_,
            redeemSource_,
            depositTarget_,
            crosschainSource_,
            deployer
        )
    {
        _initPredicateClient(predicateManager_, policyID_);
    }

    /// @inheritdoc ITransferHook
    function checkERC20Transfer(
        address from,
        address to,
        uint256, /* value */ 
        HookData calldata hookData
    ) public view override returns (bool) {
        if (isSourceOrTargetFrozen(from, to, hookData)) return false;
        if (isDepositRequestOrIssuance(from, to))
            return isTargetMemberCurrentTransaction(to, hookData);
        if (isDepositFulfillment(from, to)) return true;
        if (isDepositClaim(from, to))
            return isTargetMemberCurrentTransaction(to, hookData);
        if (isRedeemRequest(from, to))
            return isSourceMemberCurrentTransaction(from, hookData);
        if (isRedeemFulfillment(from, to)) return true;
        if (isRedeemClaimOrRevocation(from, to)) return true;
        if (isCrosschainTransfer(from, to)) return true;

        // For regular transfers, allow if target is member
        return isTargetMemberCurrentTransaction(to, hookData);
    }

    /// @inheritdoc ITransferHook
    function onERC20Transfer(address from, address to, uint256 value, HookData calldata hookData)
        external
        override
        returns (bytes4)
    {
        // First check if frozen (existing logic)
        if (isSourceOrTargetFrozen(from, to, hookData)) {
            revert TransferBlocked();
        }
        
        // Then check predicate access with better error messages
        if (!checkERC20Transfer(from, to, value, hookData)) {
            // Check specifically if it's due to expired predicate access
            uint256 fromExpiry = uint128(hookData.from) >> 64;
            uint256 toExpiry = uint128(hookData.to) >> 64;
            
            if (from != address(0) && fromExpiry > 0 && fromExpiry <= block.timestamp && !root.endorsed(from)) {
                revert PredicateAccessExpired(from, fromExpiry, block.timestamp);
            }
            if (to != address(0) && toExpiry > 0 && toExpiry <= block.timestamp && !root.endorsed(to)) {
                revert PredicateAccessExpired(to, toExpiry, block.timestamp);
            }
            
            // Fallback to generic error
            revert TransferBlocked();
        }
        
        return ITransferHook.onERC20Transfer.selector;
    }

    /// @notice Check if source has valid predicate access (not expired)
    function isSourceMemberCurrentTransaction(
        address from,
        HookData calldata hookData
    ) public view returns (bool) {
        return
            uint128(hookData.from) >> 64 > block.timestamp ||
            root.endorsed(from);
    }

    /// @notice Check if target has valid predicate access (not expired)
    function isTargetMemberCurrentTransaction(
        address to,
        HookData calldata hookData
    ) public view returns (bool) {
        return
            uint128(hookData.to) >> 64 > block.timestamp || root.endorsed(to);
    }

    /// @notice Validates predicate attestation and grants access until predicate expiry
    /// @param token The share token address
    /// @param user The user address
    /// @param message The predicate attestation (contains expiry time)
    /// @param encodedSigAndArgs The encoded function call
    function updateMemberWithAuthorization(
        address token,
        address user,
        PredicateMessage calldata message,
        bytes memory encodedSigAndArgs
    ) external {
        require(
            _authorizeTransaction(message, encodedSigAndArgs, user, 0),
            PredicateVerificationFailed()
        );

        // Ensure predicate message hasn't already expired
        require(message.expireByTime > block.timestamp, "Predicate message has expired");

        // Update member with predicate expiry time
        require(!root.endorsed(user), EndorsedUserCannotBeUpdated());

        uint128 hookData = uint128(message.expireByTime) << 64;
        hookData = hookData.withBit(FREEZE_BIT, isFrozen(token, user));
        IShareToken(token).setHookData(user, bytes16(hookData));

        emit UpdateMember(token, user, uint64(message.expireByTime));
    }

    //----------------------------------------------------------------------------------------------
    // Predicate Client Implementation
    //----------------------------------------------------------------------------------------------

    /// @notice Public interface for setting policy - delegates to PredicateClient
    function setPolicy(string memory _policyID) external auth {
        _setPolicy(_policyID);
    }

    /// @notice Public interface for setting predicate manager - delegates to PredicateClient  
    function setPredicateManager(address _predicateManager) external auth {
        _setPredicateManager(_predicateManager);
    }
}
