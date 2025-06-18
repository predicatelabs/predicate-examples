import { ethers } from 'ethers';
import { CONTRACTS, POOL_CONFIG } from '@/config/contracts';

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
  },
  {
    "inputs": [{"name": "id", "type": "bytes32"}],
    "name": "_pools",
    "outputs": [
      {"name": "sqrtPriceX96", "type": "uint160"},
      {"name": "tick", "type": "int24"},
      {"name": "protocolFee", "type": "uint24"},
      {"name": "lpFee", "type": "uint24"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export class PoolInitializer {
  
  /**
   * Get the PoolKey for USDC/USDT with PredicateHook
   */
  static getPoolKey() {
    // Ensure currency0 < currency1 (lexicographic ordering)
    const usdc = CONTRACTS.USDC.toLowerCase();
    const usdt = CONTRACTS.USDT.toLowerCase();
    
    return {
      currency0: usdc < usdt ? CONTRACTS.USDC : CONTRACTS.USDT,
      currency1: usdc < usdt ? CONTRACTS.USDT : CONTRACTS.USDC,
      fee: POOL_CONFIG.FEE_TIER,
      tickSpacing: POOL_CONFIG.TICK_SPACING,
      hooks: CONTRACTS.PREDICATE_HOOK,
    };
  }

  /**
   * Calculate the pool ID from the pool key
   */
  static getPoolId(poolKey: ReturnType<typeof PoolInitializer.getPoolKey>): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedKey = abiCoder.encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    );
    return ethers.keccak256(encodedKey);
  }

  /**
   * Check if the pool exists
   */
  static async checkPoolExists(provider: ethers.Provider): Promise<{
    exists: boolean;
    sqrtPriceX96?: string;
    tick?: number;
    details?: any;
  }> {
    try {
      const poolManager = new ethers.Contract(
        CONTRACTS.POOL_MANAGER,
        POOL_MANAGER_ABI,
        provider
      );

      const poolKey = this.getPoolKey();
      const poolId = this.getPoolId(poolKey);

      console.log('🔍 Checking pool existence...');
      console.log('Pool Key:', poolKey);
      console.log('Pool ID:', poolId);

      const poolState = await poolManager._pools(poolId);
      
      // If sqrtPriceX96 is 0, the pool doesn't exist
      const exists = poolState.sqrtPriceX96 !== '0';
      
      return {
        exists,
        sqrtPriceX96: poolState.sqrtPriceX96.toString(),
        tick: Number(poolState.tick),
        details: {
          protocolFee: poolState.protocolFee.toString(),
          lpFee: poolState.lpFee.toString(),
        }
      };
    } catch (error) {
      console.error('Error checking pool:', error);
      return { exists: false };
    }
  }

  /**
   * Generate the transaction data to initialize the pool
   */
  static generateInitializeTransaction(): {
    to: string;
    data: string;
    poolKey: ReturnType<typeof PoolInitializer.getPoolKey>;
    sqrtPriceX96: string;
  } {
    const poolKey = this.getPoolKey();
    
    // SQRT_PRICE_1_1 = sqrt(1) * 2^96 = 2^96 (1:1 price ratio for USDC:USDT)
    const SQRT_PRICE_1_1 = '79228162514264337593543950336'; // 2^96

    const iface = new ethers.Interface(POOL_MANAGER_ABI);
    const data = iface.encodeFunctionData('initialize', [
      [
        poolKey.currency0,
        poolKey.currency1,
        poolKey.fee,
        poolKey.tickSpacing,
        poolKey.hooks
      ],
      SQRT_PRICE_1_1
    ]);

    return {
      to: CONTRACTS.POOL_MANAGER,
      data,
      poolKey,
      sqrtPriceX96: SQRT_PRICE_1_1
    };
  }

  /**
   * Generate a human-readable summary for pool initialization
   */
  static getInitializationSummary() {
    const poolKey = this.getPoolKey();
    const poolId = this.getPoolId(poolKey);

    return {
      poolKey,
      poolId,
      description: `Initialize USDC/USDT pool with PredicateHook`,
      details: [
        `Currency 0: ${poolKey.currency0} (${poolKey.currency0 === CONTRACTS.USDC ? 'USDC' : 'USDT'})`,
        `Currency 1: ${poolKey.currency1} (${poolKey.currency1 === CONTRACTS.USDC ? 'USDC' : 'USDT'})`,
        `Fee: ${poolKey.fee} (0 = zero fees)`,
        `Tick Spacing: ${poolKey.tickSpacing}`,
        `Hook: ${poolKey.hooks} (PredicateHook)`,
        `Initial Price: 1:1 USDC:USDT`,
      ]
    };
  }
} 