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
