// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {PredicateRouter} from "src/PredicateRouter.sol";
import {FullRestrictions} from "protocol-v3/hooks/FullRestrictions.sol";

import {ITransferHook, HookData} from "protocol-v3/common/interfaces/ITransferHook.sol";

import {SimpleServiceManager} from "predicate-contracts/SimpleServiceManager.sol";
import {PredicateMessage} from "predicate-contracts/interfaces/IPredicateClient.sol";
import {Task} from "predicate-contracts/interfaces/IPredicateManager.sol";

import {IShareToken} from "protocol-v3/spoke/interfaces/IShareToken.sol";
import {ISpoke} from "protocol-v3/spoke/interfaces/ISpoke.sol";
import {SyncDepositVault} from "protocol-v3/vaults/SyncDepositVault.sol";
import {VaultDetails} from "protocol-v3/spoke/interfaces/ISpoke.sol";
import {d18} from "protocol-v3/misc/types/D18.sol";
import {IERC20} from "protocol-v3/misc/interfaces/IERC20.sol";
import {IAsyncRequestManager} from "protocol-v3/vaults/interfaces/IVaultManagers.sol";
import {UpdateContractMessageLib} from "protocol-v3/spoke/libraries/UpdateContractMessageLib.sol";

import {SyncDepositTestHelper} from "lib/protocol-v3/test/vaults/integration/SyncDeposit.t.sol";
import {ERC20} from "protocol-v3/misc/ERC20.sol";

contract PredicateRouterTest is SyncDepositTestHelper {
    // ANSI colour codes used to make console output easy to read during forked test execution.
    string private constant COLOR_TITLE = "\x1b[35m";
    string private constant COLOR_ACTION = "\x1b[36m";
    string private constant COLOR_VALUE = "\x1b[33m";
    string private constant COLOR_RESET = "\x1b[0m";

    PredicateRouter internal router;
    FullRestrictions internal hook;
    SimpleServiceManager internal serviceManager;
    SyncDepositVault internal vault;
    IShareToken internal shareToken;

    string internal constant POLICY_ID = "centrifuge-policy";
    uint256 internal constant ATTESTER_PK = 0xBEEF;
    address internal attester = vm.addr(ATTESTER_PK);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    address internal globalEscrowAddr;

    bytes4 internal constant SELECTOR_DEPOSIT = bytes4(keccak256("deposit(address,uint256,address,address)"));
    bytes4 internal constant SELECTOR_MINT = bytes4(keccak256("mint(address,uint256,address,address)"));

    /// Emits a coloured section title so the main phases of each test are obvious in the logs.
    function _logTitle(string memory text) internal pure {
        console2.log(string.concat(COLOR_TITLE, text, COLOR_RESET));
    }

    /// Prints an action label together with an address value.
    function _logAction(string memory label, address value) internal pure {
        console2.log(string.concat(COLOR_ACTION, label, COLOR_RESET), value);
    }

    /// Prints an action label together with a numeric value.
    function _logAction(string memory label, uint256 value) internal pure {
        console2.log(string.concat(COLOR_ACTION, label, COLOR_RESET), value);
    }

    /// Writes an action label followed by a short textual note.
    function _logNote(string memory label, string memory note) internal pure {
        console2.log(string.concat(COLOR_ACTION, label, COLOR_RESET, " ", COLOR_VALUE, note, COLOR_RESET));
    }

    function _setTemporaryMember(address user) internal {
        uint64 expiry = uint64(block.timestamp + 1 hours);
        bytes16 hookData = bytes16(uint128(expiry) << 64);
        vm.prank(address(root));
        shareToken.setHookData(user, hookData);
    }

    function _depositDirect(address user, uint256 assets) internal returns (uint256 sharesMinted) {
        _setTemporaryMember(user);
        erc20.mint(user, assets);
        vm.startPrank(user);
        erc20.approve(address(vault), assets);
        sharesMinted = vault.deposit(assets, user);
        vm.stopPrank();
    }

    function _requestRedeem(address user, uint256 shares) internal {
        vm.prank(user);
        vault.requestRedeem(shares, user, user);
    }

    function _fulfillRedeem(address user, uint256 shares) internal returns (uint256 assetsForShares) {
        VaultDetails memory details = spoke.vaultDetails(vault);
        assetsForShares = vault.convertToAssets(shares);
        uint128 assetId = spoke.assetToId(details.asset, details.tokenId).raw();

        centrifugeChain.isFulfilledRedeemRequest(
            vault.poolId().raw(),
            vault.scId().raw(),
            bytes32(bytes20(user)),
            assetId,
            uint128(assetsForShares),
            uint128(shares),
            0
        );
    }

    /// @dev Helper: produce a predicate message that authorises `encodedCall` for `user` and expires in one hour.
    function _buildPredicateMessage(address user, bytes memory encodedCall, string memory taskId)
        internal
        returns (PredicateMessage memory predicateMsg)
    {
        return _buildPredicateMessage(user, encodedCall, taskId, block.timestamp + 1 hours);
    }

    /// @dev Helper: same as above but with a custom expiry timestamp.
    function _buildPredicateMessage(address user, bytes memory encodedCall, string memory taskId, uint256 expireByTime)
        internal
        returns (PredicateMessage memory predicateMsg)
    {
        Task memory task = Task({
            taskId: taskId,
            msgSender: user,
            target: address(router),
            value: 0,
            encodedSigAndArgs: encodedCall,
            policyID: POLICY_ID,
            quorumThresholdCount: 1,
            expireByTime: expireByTime
        });

        vm.startPrank(address(router));
        bytes32 digest = serviceManager.hashTaskSafe(task);
        vm.stopPrank();

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, digest);

        address[] memory signerAddresses = new address[](1);
        signerAddresses[0] = attester;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = abi.encodePacked(r, s, v);

        predicateMsg = PredicateMessage({
            taskId: taskId,
            expireByTime: expireByTime,
            signerAddresses: signerAddresses,
            signatures: signatures
        });
    }

    function _extractExpiry(bytes16 hookData) internal pure returns (uint64) {
        return uint64(uint128(hookData) >> 64); // see PredicateTransferHook.updateMemberWithAuthorization
    }

    function setUp() public override {
        string memory rpcUrl = vm.envString("MAINNET_RPC_URL");
        vm.createSelectFork(rpcUrl);
        _logTitle("=== setUp: mainnet fork initialised ===");

        super.setUp();

        serviceManager = new SimpleServiceManager();
        serviceManager.initialize(address(this));

        address[] memory registrationKeys = new address[](1);
        registrationKeys[0] = attester;
        address[] memory signingKeys = new address[](1);
        signingKeys[0] = attester;
        address[] memory removeOperators = new address[](0);
        serviceManager.syncOperators(registrationKeys, signingKeys, removeOperators);

        string[] memory policyIds = new string[](1);
        policyIds[0] = POLICY_ID;
        uint32[] memory thresholds = new uint32[](1);
        thresholds[0] = 1;
        serviceManager.syncPolicies(policyIds, thresholds);

        globalEscrowAddr = address(asyncRequestManager.globalEscrow());

        // Deploy a fresh hook and router wired to the local predicate service manager.
        hook = new FullRestrictions(
            address(root), address(spoke), address(balanceSheet), globalEscrowAddr, address(spoke), address(this)
        );

        // Router is deployed, then initialised with the service manager/policy that our helpers use for predicate messages.
        router = new PredicateRouter(ISpoke(address(spoke)), address(serviceManager), POLICY_ID, address(this));
        _logAction("PredicateRouter deployed", address(router));

        (SyncDepositVault syncVault,) = _deploySyncDepositVault(d18(1, 1), d18(1, 1));
        vault = syncVault;
        _logAction("SyncDepositVault linked", address(vault));
        assertEq(address(vault.asyncRedeemManager()), address(asyncRequestManager), "unexpected redeem manager");

        shareToken = IShareToken(address(vault.share()));

        address rootAddress = address(root);
        vm.prank(rootAddress);
        shareToken.file("hook", address(hook));
        _logAction("Hook assigned by root", rootAddress);
        assertEq(shareToken.hook(), address(hook), "hook not set");

        // Grant the router hook-manager rights so it can call `updateMember` on the share token.
        bytes memory payload = UpdateContractMessageLib.serialize(
            UpdateContractMessageLib.UpdateContractUpdateAddress({
                kind: bytes32("manager"),
                assetId: 0,
                what: bytes32(bytes20(address(router))),
                isEnabled: true
            })
        );

        hook.update(vault.poolId(), vault.scId(), payload);
    }

    /// @notice Ensure an attested deposit succeeds, records the expiry, and moves assets/shares as expected.
    function testDepositHappyPath() public {
        _logTitle("=== test: deposit happy path ===");

        // Provide Alice with assets and approve the router for transfer.
        uint256 assets = 1_000 * 1e6;
        erc20.mint(alice, assets);
        vm.prank(alice);
        erc20.approve(address(router), assets);
        _logAction("Alice approved assets", assets);

        // Build the ABI-encoded vault call and wrap it in a valid predicate message signed by the operator.
        bytes memory encodedCall =
            abi.encodeWithSignature("deposit(address,uint256,address,address)", address(vault), assets, alice, alice);

        PredicateMessage memory predicateMsg = _buildPredicateMessage(alice, encodedCall, "deposit-task");
        _logAction("Predicate expiry", predicateMsg.expireByTime);

        // Membership should be updated before the vault interaction.
        vm.expectEmit(true, true, true, true);
        emit PredicateRouter.PredicateMemberAuthorized(
            address(shareToken), address(vault), alice, SELECTOR_DEPOSIT, uint64(predicateMsg.expireByTime)
        );

        vm.prank(alice);
        uint256 sharesMinted = router.deposit(vault, assets, alice, alice, predicateMsg);
        _logAction("Shares minted", sharesMinted);

        uint256 sharesExpected = vault.previewDeposit(assets);
        assertEq(shareToken.balanceOf(alice), sharesExpected, "shares not minted");
        assertEq(sharesMinted, sharesExpected, "returned shares mismatch");
        _logAction("Alice share balance", shareToken.balanceOf(alice));

        uint64 expiry = _extractExpiry(shareToken.hookDataOf(alice));
        assertEq(expiry, uint64(predicateMsg.expireByTime), "expiry mismatch");
        _logAction("Hook expiry recorded", expiry);

        assertEq(erc20.balanceOf(address(router)), 0, "router retained assets");

        VaultDetails memory details = spoke.vaultDetails(vault);
        address escrow = address(balanceSheet.poolEscrowProvider().escrow(vault.poolId()));
        assertEq(ERC20(details.asset).balanceOf(escrow), assets, "escrow not funded");
        _logAction("Escrow asset balance", ERC20(details.asset).balanceOf(escrow));
    }

    /// @notice Ensure an attested mint succeeds and the router leaves no asset residue.
    function testMintHappyPath() public {
        _logTitle("=== test: mint happy path ===");
        uint256 shares = 50e6; // share token has 6 decimals by default
        uint256 assetsRequired = vault.previewMint(shares);

        erc20.mint(alice, assetsRequired);
        vm.prank(alice);
        erc20.approve(address(router), assetsRequired);
        _logAction("Alice approved assets", assetsRequired);

        bytes memory encodedCall =
            abi.encodeWithSignature("mint(address,uint256,address,address)", address(vault), shares, alice, alice);

        PredicateMessage memory predicateMsg = _buildPredicateMessage(alice, encodedCall, "mint-task");
        _logAction("Predicate expiry", predicateMsg.expireByTime);

        // Membership must be updated before the share mint proceeds.
        vm.expectEmit(true, true, true, true);
        emit PredicateRouter.PredicateMemberAuthorized(
            address(shareToken), address(vault), alice, SELECTOR_MINT, uint64(predicateMsg.expireByTime)
        );

        vm.prank(alice);
        uint256 assetsUsed = router.mint(vault, shares, alice, alice, predicateMsg);

        assertEq(assetsUsed, assetsRequired, "mint assets mismatch");
        assertEq(shareToken.balanceOf(alice), shares, "shares not minted");
        _logAction("Alice share balance", shareToken.balanceOf(alice));
        assertEq(erc20.balanceOf(address(router)), 0, "router retained assets after mint");
    }

    /// @notice Predicate messages that are already expired must be rejected before assets move.
    function testDepositFailsWithExpiredPredicateMessage() public {
        _logTitle("=== test: deposit fails with expired predicate message ===");
        uint256 assets = 1_000 * 1e6;
        erc20.mint(alice, assets);
        vm.prank(alice);
        erc20.approve(address(router), assets);

        bytes memory encodedCall =
            abi.encodeWithSignature("deposit(address,uint256,address,address)", address(vault), assets, alice, alice);

        PredicateMessage memory predicateMsg =
            _buildPredicateMessage(alice, encodedCall, "expired-task", block.timestamp);
        _logAction("Expired predicate timestamp", predicateMsg.expireByTime);

        vm.prank(alice);
        vm.expectRevert(PredicateRouter.PredicateMessageExpired.selector);
        router.deposit(vault, assets, alice, alice, predicateMsg);
    }

    /// @notice Invalid attestation signatures must fail verification.
    function testDepositFailsWithInvalidSignature() public {
        _logTitle("=== test: deposit fails with invalid signature ===");
        uint256 assets = 1_000 * 1e6;
        erc20.mint(alice, assets);
        vm.prank(alice);
        erc20.approve(address(router), assets);

        bytes memory encodedCall =
            abi.encodeWithSignature("deposit(address,uint256,address,address)", address(vault), assets, alice, alice);

        PredicateMessage memory predicateMsg = _buildPredicateMessage(alice, encodedCall, "invalid-task");
        bytes memory corruptedSig = predicateMsg.signatures[0];
        // flip last byte to invalidate signature
        corruptedSig[corruptedSig.length - 1] = bytes1(uint8(corruptedSig[corruptedSig.length - 1]) ^ 0x01);
        predicateMsg.signatures[0] = corruptedSig;
        _logAction("Corrupted signature byte", uint8(corruptedSig[corruptedSig.length - 1]));

        vm.prank(alice);
        vm.expectRevert(ECDSA.ECDSAInvalidSignature.selector);
        router.deposit(vault, assets, alice, alice, predicateMsg);
    }

    /// @notice Predicate messages with mismatched caller context must be rejected.
    function testDepositFailsWithMismatchedTarget() public {
        _logTitle("=== test: deposit fails when predicate context mismatches ===");
        uint256 assets = 500 * 1e6;
        erc20.mint(alice, assets);
        vm.prank(alice);
        erc20.approve(address(router), assets);
        _logAction("Alice approved assets", assets);

        bytes memory encodedCallAlice =
            abi.encodeWithSignature("deposit(address,uint256,address,address)", address(vault), assets, alice, alice);

        PredicateMessage memory predicateMsg =
            _buildPredicateMessage(alice, encodedCallAlice, "bad-target", block.timestamp + 1 hours);

        // Call from Bob so the encoded args + msgSender differ from the signed payload.
        vm.prank(bob);
        vm.expectRevert(bytes("Predicate.validateSignatures: Invalid signature"));
        router.deposit(vault, assets, alice, bob, predicateMsg);
    }

    /// @notice After an attested deposit, the user should be able to redeem and withdraw via the standard flow.
    function testWithdrawAfterDeposit() public {
        _logTitle("=== test: withdraw after authorized deposit ===");
        uint256 assets = 2_000 * 1e6;
        erc20.mint(alice, assets);
        vm.prank(alice);
        erc20.approve(address(router), assets);
        _logAction("Alice approved assets", assets);

        bytes memory encodedCall =
            abi.encodeWithSignature("deposit(address,uint256,address,address)", address(vault), assets, alice, alice);
        PredicateMessage memory predicateMsg = _buildPredicateMessage(alice, encodedCall, "withdraw-flow");
        _logAction("Predicate expiry", predicateMsg.expireByTime);

        vm.prank(alice);
        uint256 sharesMinted = router.deposit(vault, assets, alice, alice, predicateMsg);
        _logAction("Shares minted", sharesMinted);

        // Redeem flow relies on the hook data written during the initial attested deposit.
        vm.prank(alice);
        vault.requestRedeem(sharesMinted, alice, alice); // move shares into Centrifuge global escrow
        _logAction("requestRedeem shares", sharesMinted);

        assertEq(shareToken.balanceOf(globalEscrowAddr), sharesMinted, "shares not escrowed");
        _logAction("Escrow share balance", shareToken.balanceOf(globalEscrowAddr));

        VaultDetails memory details = spoke.vaultDetails(vault);
        uint256 assetsForShares = vault.convertToAssets(sharesMinted); // exact asset amount expected upon fulfilment
        uint128 assetId = spoke.assetToId(details.asset, details.tokenId).raw();
        _logAction("Redeem asset amount", assetsForShares);

        centrifugeChain.isFulfilledRedeemRequest(
            vault.poolId().raw(),
            vault.scId().raw(),
            bytes32(bytes20(alice)),
            assetId,
            uint128(assetsForShares),
            uint128(sharesMinted),
            0
        );
        _logNote("Redeem fulfilment", "mock centrifuge chain callback");

        vm.prank(alice);
        uint256 sharesBurned = vault.withdraw(assetsForShares, alice, alice); // claim assets directly from the vault
        assertEq(sharesBurned, sharesMinted, "shares burned mismatch");
        _logAction("Shares burned", sharesBurned);

        assertEq(shareToken.balanceOf(alice), 0, "shares still held by alice");
        assertEq(shareToken.balanceOf(globalEscrowAddr), 0, "shares remain in escrow");
        assertEq(erc20.balanceOf(alice), assetsForShares, "assets not withdrawn to alice");
        _logAction("Alice ERC20 balance", erc20.balanceOf(alice));
    }

    /// @notice Confirm that calling the vault directly without a predicate membership reverts.
    function testVaultDepositFailsWithoutMembership() public {
        _logTitle("=== test: vault deposit fails without membership ===");
        uint256 assets = 1_000 * 1e6;
        erc20.mint(alice, assets);
        _logAction("Assets minted for Alice", assets);

        vm.startPrank(alice);
        erc20.approve(address(vault), assets);
        _logAction("Alice approved assets", assets);
        vm.expectRevert(ITransferHook.TransferBlocked.selector);
        vault.deposit(assets, alice);
        vm.stopPrank();

        assertEq(shareToken.balanceOf(alice), 0, "unexpected shares minted");
        _logAction("Alice share balance", shareToken.balanceOf(alice));
    }

    /// @notice After seeding hook data manually, a direct vault deposit should succeed.
    function testVaultDepositSucceedsWithActiveMembership() public {
        _logTitle("=== test: vault deposit succeeds with active membership ===");
        uint256 assets = 1_000 * 1e6;
        _logAction("Assets to deposit", assets);
        uint256 sharesMinted = _depositDirect(alice, assets);

        assertEq(shareToken.balanceOf(alice), sharesMinted, "shares not minted to member");
        _logAction("Shares minted", sharesMinted);
        _logAction("Alice share balance", shareToken.balanceOf(alice));
    }

    /// @notice Freezing a user via the hook manager prevents them from transferring shares.
    function testShareTransferBlockedForFrozenSource() public {
        _logTitle("=== test: share transfer blocked when source frozen ===");
        uint256 sharesMinted = _depositDirect(alice, 500 * 1e6);
        _setTemporaryMember(bob);

        _logAction("Shares minted for Alice", sharesMinted);
        _logAction("Alice share balance", shareToken.balanceOf(alice));
        _logAction("Bob share balance", shareToken.balanceOf(bob));

        hook.freeze(address(shareToken), alice);
        _logAction("Alice frozen flag", hook.isFrozen(address(shareToken), alice) ? 1 : 0);

        vm.prank(alice);
        (bool success,) = address(shareToken).call(abi.encodeCall(IERC20.transfer, (bob, sharesMinted)));
        assertFalse(success, "frozen transfer should fail");
        _logAction("Alice share balance post transfer", shareToken.balanceOf(alice));
        _logAction("Bob share balance post transfer", shareToken.balanceOf(bob));
    }

    /// @notice ERC-20 transfers require the recipient to have up-to-date hook data.
    function testRegularTransferRequiresTargetMembership() public {
        _logTitle("=== test: regular transfer requires target membership ===");
        uint256 sharesMinted = _depositDirect(alice, 400 * 1e6);
        _logAction("Shares minted for Alice", sharesMinted);

        vm.prank(alice);
        vm.expectRevert(ITransferHook.TransferBlocked.selector);
        shareToken.transfer(bob, sharesMinted);
        _logNote("Transfer attempt", "target lacks membership");

        _setTemporaryMember(bob);
        _logAction("Bob hook expiry", _extractExpiry(shareToken.hookDataOf(bob)));

        vm.prank(alice);
        bool success = shareToken.transfer(bob, sharesMinted);
        assertTrue(success, "transfer blocked despite membership");

        assertEq(shareToken.balanceOf(alice), 0, "alice retained shares");
        assertEq(shareToken.balanceOf(bob), sharesMinted, "bob missing shares");
        _logAction("Alice share balance", shareToken.balanceOf(alice));
        _logAction("Bob share balance", shareToken.balanceOf(bob));
    }

    /// @notice Redemption requests honour predicate expiry; refreshing membership permits the call.
    function testRequestRedeemRequiresActiveMembership() public {
        _logTitle("=== test: request redeem requires active membership ===");
        uint256 sharesMinted = _depositDirect(alice, 750 * 1e6);

        _logAction("Shares minted", sharesMinted);
        _logAction("Alice share balance", shareToken.balanceOf(alice));

        vm.warp(block.timestamp + 2 hours);
        _logAction("Warped timestamp", block.timestamp);

        vm.prank(alice);
        vm.expectRevert(IAsyncRequestManager.TransferNotAllowed.selector);
        vault.requestRedeem(sharesMinted, alice, alice);
        _logAction("Alice share balance post failed request", shareToken.balanceOf(alice));
        _logAction("Escrow share balance", shareToken.balanceOf(globalEscrowAddr));

        _setTemporaryMember(alice);
        _logAction("Alice hook expiry", _extractExpiry(shareToken.hookDataOf(alice)));
        _requestRedeem(alice, sharesMinted);

        assertEq(shareToken.balanceOf(alice), 0, "shares still with alice");
        assertEq(shareToken.balanceOf(globalEscrowAddr), sharesMinted, "escrow did not receive shares");
        _logAction("Escrow share balance post request", shareToken.balanceOf(globalEscrowAddr));
    }

    /// @notice Once a redeem request is fulfilled, the hook should have burned the shares held by the escrow managers.
    function testFulfillRedeemBurnsSharesViaManager() public {
        _logTitle("=== test: fulfill redeem burns shares via manager ===");
        uint256 sharesMinted = _depositDirect(alice, 600 * 1e6);
        _requestRedeem(alice, sharesMinted);

        assertEq(shareToken.balanceOf(globalEscrowAddr), sharesMinted, "escrow missing shares");
        _logAction("Shares minted", sharesMinted);
        _logAction("Escrow share balance", shareToken.balanceOf(globalEscrowAddr));

        uint256 assetsForShares = _fulfillRedeem(alice, sharesMinted);

        assertEq(shareToken.balanceOf(globalEscrowAddr), 0, "escrow retains shares post-fulfillment");
        assertEq(shareToken.balanceOf(address(asyncRequestManager)), 0, "async manager retains shares");
        assertEq(shareToken.balanceOf(address(balanceSheet)), 0, "balance sheet retains shares");
        assertEq(asyncRequestManager.maxWithdraw(vault, alice), assetsForShares, "max withdraw not updated");
        _logAction("Assets reserved for Alice", assetsForShares);
        _logAction("Async manager max withdraw", asyncRequestManager.maxWithdraw(vault, alice));
    }

    /// @notice After fulfilment, withdrawing the reserved assets should burn the user shares as expected.
    function testWithdrawAfterFulfillmentBurnsUserShares() public {
        _logTitle("=== test: withdraw after fulfillment burns user shares ===");
        uint256 sharesMinted = _depositDirect(alice, 900 * 1e6);
        _requestRedeem(alice, sharesMinted);
        uint256 assetsForShares = _fulfillRedeem(alice, sharesMinted);

        vm.prank(alice);
        uint256 sharesBurned = vault.withdraw(assetsForShares, alice, alice);

        assertEq(sharesBurned, sharesMinted, "unexpected shares burned");
        assertEq(shareToken.balanceOf(alice), 0, "alice regained shares");
        assertEq(erc20.balanceOf(alice), assetsForShares, "assets not withdrawn to alice");
        _logAction("Shares minted", sharesMinted);
        _logAction("Assets withdrawn", assetsForShares);
        _logAction("Alice share balance", shareToken.balanceOf(alice));
        _logAction("Alice ERC20 balance", erc20.balanceOf(alice));
    }

    /// @notice Burning shares from the designated cross-chain source should bypass membership checks.
    function testCrosschainBurnAllowed() public {
        _logTitle("=== test: crosschain burn allowed ===");
        uint256 shares = 250 * 1e6;

        uint64 expiry = uint64(block.timestamp + 1 hours);
        uint128 hookDataValue = uint128(expiry) << 64;

        vm.startPrank(address(root));
        shareToken.setHookData(address(spoke), bytes16(hookDataValue));
        shareToken.mint(address(spoke), shares);
        vm.stopPrank();
        _logAction("Spoke share balance pre burn", shareToken.balanceOf(address(spoke)));

        HookData memory hookData =
            HookData({from: shareToken.hookDataOf(address(spoke)), to: shareToken.hookDataOf(address(0))});
        assertTrue(hook.checkERC20Transfer(address(spoke), address(0), shares, hookData), "crosschain burn blocked");
        _logNote("Crosschain burn check", "allowed");

        vm.prank(address(spoke));
        shareToken.burn(address(spoke), shares);

        assertEq(shareToken.balanceOf(address(spoke)), 0, "spoke retained shares after burn");
        _logAction("Spoke share balance post burn", shareToken.balanceOf(address(spoke)));
    }
}
