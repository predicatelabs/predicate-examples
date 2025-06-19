// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";

contract CounterScript is Script {
    Counter public counter;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        // Read from environment variables - will fail if not provided
        address serviceManager = vm.envAddress("REGISTRY_ADDRESS");
        string memory policyID = vm.envString("POLICY_ID");
        
        console.log("Deploying Counter with:");
        console.log("Service Manager:", serviceManager);
        console.log("Policy ID:", policyID);
        
        counter = new Counter(serviceManager, policyID);
        
        console.log("Counter deployed at:", address(counter));

        vm.stopBroadcast();
    }
}
