// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {CommonBase} from "../lib/forge-std/src/Base.sol";
import {StdAssertions} from "../lib/forge-std/src/StdAssertions.sol";
import {StdChains} from "../lib/forge-std/src/StdChains.sol";
import {StdCheats, StdCheatsSafe} from "../lib/forge-std/src/StdCheats.sol";
import {StdUtils} from "../lib/forge-std/src/StdUtils.sol";
import {Test} from "../lib/forge-std/src/Test.sol";
import {Counter} from "../src/Counter.sol";
import {PredicateMessage} from "../src/interface/IPredicateClient.sol";
import {IPredicateManager} from "../src/interface/IPredicateManager.sol";

contract CounterTest is Test {
    Counter public counter;
    address mockPredicateManager;

    function setUp() public {
        mockPredicateManager = makeAddr("predicateManager");
        vm.etch(mockPredicateManager, "mock");
        counter = new Counter(mockPredicateManager, "test-policy");
        counter.setNumber(0);
    }

    function test_Increment() public {
        PredicateMessage memory message = PredicateMessage({
            taskId: "test-task-id",
            expireByBlockNumber: block.number + 100,
            signerAddresses: new address[](1),
            signatures: new bytes[](1)
        });

        // Mock validate signatures call
        vm.mockCall(
            mockPredicateManager,
            abi.encodeWithSelector(IPredicateManager.validateSignatures.selector),
            abi.encode(true)
        );

        counter.increment(message);
        assertEq(counter.number(), 1);
    }

    function testFuzz_SetNumber(uint256 x) public {
        counter.setNumber(x);
        assertEq(counter.number(), x);
    }
}
