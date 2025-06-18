export interface PredicateRequest {
  from: string;
  to: string;
  data: string;
  msg_value: string;
}

export interface PredicateEvaluationResult {
  is_compliant: boolean;
  task_id: string;
  expire_by_block_number?: number;
  expiry_block?: number;
  signer_addresses?: string[];
  signers?: string[];
  signatures?: string[];
  signature?: string[];
  policy_id?: string;
  error?: string;
}

export interface PredicateMessage {
  taskId: string;
  expireByBlockNumber: number;
  signerAddresses: string[];
  signatures: string[];
}

export interface SwapParams {
  zeroForOne: boolean;
  amountSpecified: string;
  sqrtPriceLimitX96: string;
}

export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

export interface BeforeSwapArgs {
  sender: string;
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountSpecified: string;
}

export interface PredicateHookParams {
  poolKey: PoolKey;
  swapParams: SwapParams;
  predicateMessage: PredicateMessage;
} 