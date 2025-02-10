// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {PredicateClient} from "./PredicateClient.sol";
import {PredicateMessage} from "./interface/IPredicateClient.sol";
import {IPredicateManager} from "./interface/IPredicateManager.sol";

contract Counter is PredicateClient {
    uint256 public number;

    //Predicate: Initialize the predicate manager address
    constructor(address _predicateManager, string memory _policyID) {
        _initPredicateClient(_predicateManager, _policyID);
    }

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment(PredicateMessage calldata _message) public {
        //Predicate: public function should verify signatures before invoking internal business logic
        bytes memory encodedSigAndArgs = abi.encodeWithSignature("_increment()");
        require(
            _authorizeTransaction(_message, encodedSigAndArgs, msg.sender, 0),
            "MetaCoin: unauthorized transaction"
        );
        _increment();
    }

    function _increment() internal {
        number++;
    }

    // Predicate: should be ownable in production
    function setPolicy(string memory _policyID) external {
        _setPolicy(_policyID);
    }

    // Predicate: should be ownable in production
    function setPredicateManager(address _predicateManager) external {
        _setPredicateManager(_predicateManager);
    }
}
