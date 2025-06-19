import * as dotenv from 'dotenv';
import {PredicateClient, PredicateRequest, packFunctionArgs, signaturesToBytes} from '@predicate/core';
import { ethers } from 'ethers';

// Load environment variables
dotenv.config();

const predicateClient = new PredicateClient({
    apiUrl: 'https://api.predicate.io/',
    apiKey: process.env.PREDICATE_API_KEY!
});

if (!process.env.PREDICATE_API_KEY) {
    console.error("Error: PREDICATE_API_KEY is not set.");
    process.exit(1);
}

// Define the ABI for the Counter contract
const contractABI = [
    "function setNumberWithPredicate(uint256 newNumber, tuple(string, uint256, address[], bytes[]) predicateMessage) external payable",
    "function number() external view returns (uint256)"
];

const provider = new ethers.JsonRpcProvider(process.env.RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);

// You'll need to replace this with your deployed Counter contract address
const COUNTER_CONTRACT_ADDRESS = process.env.COUNTER_CONTRACT_ADDRESS || "0x...";

if (!COUNTER_CONTRACT_ADDRESS || COUNTER_CONTRACT_ADDRESS === "0x...") {
    console.error("Error: COUNTER_CONTRACT_ADDRESS is not set. Please set it in your .env file.");
    process.exit(1);
}

const contract = new ethers.Contract(COUNTER_CONTRACT_ADDRESS, contractABI, wallet);

async function main() {
    try {
        const contractAddress = await contract.getAddress();
        console.log("Counter contract address:", contractAddress);

        // Get current number
        const currentNumber = await contract.number();
        console.log("Current counter value:", currentNumber.toString());

        // Calculate new number (increment by 1)
        const newNumber = currentNumber + 1n;
        console.log("New counter value will be:", newNumber.toString());

        // Prepare function arguments
        const functionArgs = [newNumber];

        // IMPORTANT: encode the private function that is invoked by the Predicate function
        const data = packFunctionArgs("setNumber(uint256)", functionArgs);
        
        const request: PredicateRequest = {
            from: wallet.address,
            to: contractAddress,
            data: data,
            msg_value: '0'
        };

        console.log("Evaluating policy for increment transaction...");
        const evaluationResult = await predicateClient.evaluatePolicy(request);
        console.log("Policy evaluation result:", evaluationResult);
        
        if (!evaluationResult.is_compliant) {
            console.error("Policy evaluation failed - transaction not compliant");
            return;
        }

        const predicateMessage = signaturesToBytes(evaluationResult);
        console.log("Predicate message prepared:", {
            taskId: predicateMessage.taskId,
            expireByBlockNumber: predicateMessage.expireByBlockNumber.toString(),
            signerCount: predicateMessage.signerAddresses.length
        });

        console.log("Submitting increment transaction with predicate message...");
        const tx = await contract.setNumberWithPredicate(
            newNumber,
            [
                predicateMessage.taskId,
                predicateMessage.expireByBlockNumber,
                predicateMessage.signerAddresses,
                predicateMessage.signatures
            ]
        );

        console.log("Transaction submitted:", tx.hash);
        console.log("Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("Block number:", receipt.blockNumber);
        console.log("Gas used:", receipt.gasUsed.toString());

        // Verify the new number
        const updatedNumber = await contract.number();
        console.log("Updated counter value:", updatedNumber.toString());

    } catch (error) {
        console.error("Error incrementing counter:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
}); 