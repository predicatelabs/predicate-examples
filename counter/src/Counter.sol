// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {PredicateClient} from "../lib/predicate-contracts/src/mixins/PredicateClient.sol";
import {PredicateMessage} from "../lib/predicate-contracts/src/interfaces/IPredicateClient.sol";

contract Counter is PredicateClient {
    uint256 public number;

    event NumberSet(uint256 newNumber);
    event Incremented(uint256 newNumber);

    constructor(address _predicateManager, string memory _policyID) {
        _initPredicateClient(_predicateManager, _policyID);
    }

    // Protected function that requires predicate validation
    function setNumberWithPredicate(
        uint256 newNumber, 
        PredicateMessage calldata _message
    ) external payable {
        bytes memory encodedSigAndArgs = abi.encodeWithSignature("setNumber(uint256)", newNumber);
        require(
            _authorizeTransaction(_message, encodedSigAndArgs, msg.sender, msg.value),
            "Counter: unauthorized transaction"
        );
        
        setNumber(newNumber);
    }

    function setNumber(uint256 newNumber) public {
        number = newNumber;
        emit NumberSet(newNumber);
    }

    function increment() public {
        number++;
        emit Incremented(number);
    }

    function setPolicy(string memory _policyID) external {
        _setPolicy(_policyID);
    }

    function setPredicateManager(address _predicateManager) external {
        _setPredicateManager(_predicateManager);
    }
}
