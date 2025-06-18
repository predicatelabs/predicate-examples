'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ethers } from 'ethers';
import { PoolInitializer } from '@/lib/pool-initializer';
import { CONTRACTS } from '@/config/contracts';

// PoolManager ABI for initialization
const POOL_MANAGER_ABI = [
  {
    "inputs": [
      {
        "components": [
          {"name": "currency0", "type": "address"},
          {"name": "currency1", "type": "address"},
          {"name": "fee", "type": "uint24"},
          {"name": "tickSpacing", "type": "int24"},
          {"name": "hooks", "type": "address"}
        ],
        "name": "key",
        "type": "tuple"
      },
      {"name": "sqrtPriceX96", "type": "uint160"}
    ],
    "name": "initialize",
    "outputs": [{"name": "tick", "type": "int24"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

interface PoolStatus {
  exists: boolean;
  checking: boolean;
  sqrtPriceX96?: string;
  tick?: number;
  error?: string;
}

export function PoolManager() {
  const { address, isConnected } = useAccount();
  const [poolStatus, setPoolStatus] = useState<PoolStatus>({ exists: false, checking: false });
  const [showDetails, setShowDetails] = useState(false);

  const { writeContract, data: hash, isPending, error: contractError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const checkPoolStatus = async () => {
    if (!window.ethereum) {
      setPoolStatus({ exists: false, checking: false, error: 'No Ethereum provider found' });
      return;
    }

    setPoolStatus({ exists: false, checking: true });

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const result = await PoolInitializer.checkPoolExists(provider);
      
      setPoolStatus({
        exists: result.exists,
        checking: false,
        sqrtPriceX96: result.sqrtPriceX96,
        tick: result.tick,
        error: result.exists ? undefined : 'Pool not initialized'
      });
    } catch (error) {
      console.error('Error checking pool status:', error);
      setPoolStatus({
        exists: false,
        checking: false,
        error: error instanceof Error ? error.message : 'Failed to check pool status'
      });
    }
  };

  const initializePool = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    const txData = PoolInitializer.generateInitializeTransaction();
    const poolKey = txData.poolKey;

    writeContract({
      address: CONTRACTS.POOL_MANAGER as `0x${string}`,
      abi: POOL_MANAGER_ABI,
      functionName: 'initialize',
      args: [
        [
          poolKey.currency0 as `0x${string}`,
          poolKey.currency1 as `0x${string}`,
          poolKey.fee,
          poolKey.tickSpacing,
          poolKey.hooks as `0x${string}`
        ],
        BigInt(txData.sqrtPriceX96)
      ],
    });
  };

  // Auto-check pool status on component mount
  useEffect(() => {
    checkPoolStatus();
  }, []);

  // Handle transaction completion
  if (isConfirmed && hash) {
    setTimeout(() => {
      checkPoolStatus(); // Recheck after initialization
      alert(`✅ POOL INITIALIZED!\n\nTransaction: ${hash}`);
    }, 1000);
  }

  const poolDetails = PoolInitializer.getInitializationSummary();

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">Pool Status</h3>
        <button
          onClick={checkPoolStatus}
          disabled={poolStatus.checking}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {poolStatus.checking ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-3">
        {/* Status Display */}
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            poolStatus.checking ? 'bg-yellow-500 animate-pulse' :
            poolStatus.exists ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="font-medium">
            {poolStatus.checking ? 'Checking pool status...' :
             poolStatus.exists ? 'Pool is initialized ✅' : 'Pool not initialized ❌'}
          </span>
        </div>

        {/* Error Display */}
        {poolStatus.error && !poolStatus.checking && (
          <div className="text-red-600 text-sm">
            {poolStatus.error}
          </div>
        )}

        {/* Pool Details */}
        {poolStatus.exists && poolStatus.sqrtPriceX96 && (
          <div className="text-sm text-gray-600">
            <div>Price: {poolStatus.sqrtPriceX96}</div>
            <div>Tick: {poolStatus.tick}</div>
          </div>
        )}

        {/* Initialization Section */}
        {!poolStatus.exists && !poolStatus.checking && (
          <div className="border-t pt-3 mt-3">
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Pool needs to be initialized first
                </span>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  {showDetails ? 'Hide' : 'Show'} Details
                </button>
              </div>
              
              {showDetails && (
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <div><strong>Description:</strong> {poolDetails.description}</div>
                  <div><strong>Pool ID:</strong> <code className="bg-gray-100 px-1 rounded">{poolDetails.poolId}</code></div>
                  {poolDetails.details.map((detail, idx) => (
                    <div key={idx}>• {detail}</div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={initializePool}
              disabled={!isConnected || isPending || isConfirming}
              className="w-full px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Confirming...' :
               isConfirming ? 'Initializing...' :
               !isConnected ? 'Connect Wallet to Initialize' :
               'Initialize Pool'}
            </button>

            {contractError && (
              <div className="mt-2 text-red-600 text-sm">
                Error: {contractError.message}
              </div>
            )}
          </div>
        )}

        {/* Success Message */}
        {poolStatus.exists && (
          <div className="text-green-700 text-sm bg-green-50 p-2 rounded">
            ✅ Pool is ready for swapping! You can now use the swap interface above.
          </div>
        )}
      </div>
    </div>
  );
} 