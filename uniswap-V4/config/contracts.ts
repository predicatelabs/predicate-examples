export const CONTRACTS = {
  // Mainnet contract addresses - OFFICIAL UNISWAP V4 DEPLOYED ADDRESSES
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USD Coin on mainnet (Circle official)
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Tether USD on mainnet
  PREDICATE_HOOK: '0x145b39c7F5af791813Ba1fB16A4de63fDfCfA8A0', // YOUR DEPLOYED PredicateHook
  
  // UNISWAP V4 CORE CONTRACTS (Official mainnet addresses)
  POOL_MANAGER: '0x000000000004444c5dc75cB358380D2e3dE08A90', // Uniswap V4 PoolManager (mainnet)
  POSITION_MANAGER: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e', // V4 Position Manager (mainnet)
  UNIVERSAL_ROUTER: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af', // Universal Router (mainnet) - USE THIS FOR SWAPS
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2 contract
  
  // ADDITIONAL V4 PERIPHERY CONTRACTS
  QUOTER: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203', // V4 Quoter for price quotes
  STATE_VIEW: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227', // StateView for reading pool state
  
  // PREDICATE-SPECIFIC
  SERVICE_MANAGER: '0xf6f4A30EeF7cf51Ed4Ee1415fB3bFDAf3694B0d2', // Predicate Service Manager
} as const;

export const POOL_CONFIG = {
  // Pool configuration matching working examples
  FEE_TIER: 0, // Zero fees as used in working examples
  TICK_SPACING: 1, // Changed from 1 to 60 to match working examples
  SQRT_PRICE_LIMIT_X96: '0', // No price limit (0 = no limit)
} as const;

export const TOKEN_CONFIG = {
  USDC: {
    address: CONTRACTS.USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://ethereum-optimism.github.io/data/USDC/logo.png',
  },
  USDT: {
    address: CONTRACTS.USDT,
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://ethereum-optimism.github.io/data/USDT/logo.png',
  },
} as const;

// Function signatures used by PredicateHook for validation
export const FUNCTION_SIGNATURES = {
  // V4 Hook signatures for predicate validation - using actual Solidity types
  BEFORE_SWAP: 'beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)',
  AFTER_SWAP: 'afterSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),(int128,int128),bytes)',
  
  // Universal Router command encoding
  V4_SWAP_COMMAND: 'V4_SWAP', // Universal Router command for V4 swaps
  
  // V4Router action types used in Universal Router (with correct action codes)
  SWAP_EXACT_IN_SINGLE: 'SWAP_EXACT_IN_SINGLE', // Action 0x06 for exact input swaps
  SETTLE_ALL: 'SETTLE_ALL', // Action 0x0c to settle input tokens
  TAKE_ALL: 'TAKE_ALL', // Action 0x0f to take output tokens
} as const; 