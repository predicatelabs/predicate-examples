import { CONTRACTS } from '@/config/contracts';
import { encodeAbiParameters } from 'viem';

// Permit2 domain and types for EIP-712 signing
const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: 1, // Mainnet
  verifyingContract: CONTRACTS.PERMIT2,
};

const PERMIT_SINGLE_TYPE = {
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
};

export interface Permit2Allowance {
  token: string;
  amount: bigint;
  expiration: number;
  nonce: number;
}

export interface Permit2Signature {
  permitSingle: {
    details: {
      token: string;
      amount: string;
      expiration: number;
      nonce: number;
    };
    spender: string;
    sigDeadline: number;
  };
  signature: string;
}

export class Permit2Client {
  
  /**
   * Check current Permit2 allowance with expiration
   */
  static async checkPermit2Allowance(
    owner: string,
    token: string,
    spender: string
  ): Promise<Permit2Allowance | null> {
    try {
      const response = await fetch('/api/check-permit2-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, token, spender }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check Permit2 allowance');
      }
      
      return data.allowance;
    } catch (error) {
      console.error('Error checking Permit2 allowance:', error);
      return null;
    }
  }

  /**
   * Check if current allowance is valid (not expired and sufficient amount)
   */
  static isAllowanceValid(
    allowance: Permit2Allowance | null,
    requiredAmount: bigint
  ): boolean {
    if (!allowance) return false;
    
    const now = Math.floor(Date.now() / 1000);
    const isNotExpired = allowance.expiration > now;
    const hasSufficientAmount = allowance.amount >= requiredAmount;
    
    console.log('🔍 Checking allowance validity:', {
      allowance: allowance.amount.toString(),
      required: requiredAmount.toString(),
      expiration: allowance.expiration,
      now,
      isNotExpired,
      hasSufficientAmount,
      isValid: isNotExpired && hasSufficientAmount
    });
    
    return isNotExpired && hasSufficientAmount;
  }

  /**
   * Create Permit2 signature for allowance (not one-time use)
   * This creates a large allowance that can be used multiple times
   */
  static async createPermit2Signature(
    walletClient: any, // wagmi wallet client
    token: string,
    amount: bigint,
    spender: string
  ): Promise<Permit2Signature> {
    const sigDeadline = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now  
    const expiration = Math.floor(Date.now() / 1000) + 7200;  // 2 hours from now
    
    // Get address from wallet client
    const address = walletClient.account.address;
    
    // Get the next unused nonce
    const permitNonce = await this.getPermit2Nonce(address, token, spender);
    console.log('🔍 Using nonce for permit:', permitNonce);

    // Use a large amount for allowance instead of exact amount
    // This allows multiple swaps without re-signing
    const allowanceAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffff'); // Max uint160

    const permitSingle = {
      details: {
        token,
        amount: allowanceAmount.toString(),
        expiration,
        nonce: permitNonce,
      },
      spender,
      sigDeadline,
    };

    console.log('🔍 Signing permit with details:', permitSingle);

    // Sign the permit using wagmi wallet client
    const signature = await walletClient.signTypedData({
      domain: PERMIT2_DOMAIN,
      types: PERMIT_SINGLE_TYPE,
      primaryType: 'PermitSingle',
      message: permitSingle,
    });

    return {
      permitSingle,
      signature,
    };
  }

  /**
   * Get current nonce for Permit2 - with retry logic for blockchain updates
   */
  static async getPermit2Nonce(owner: string, token: string, spender: string): Promise<number> {
    try {
      const response = await fetch('/api/get-permit2-nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, token, spender }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get Permit2 nonce');
      }
      
      console.log('🔍 Got nonce from API:', data.nonce);
      return data.nonce;
    } catch (error) {
      console.error('Error getting Permit2 nonce:', error);
      return 0; // Default to 0 if unable to fetch
    }
  }

  /**
   * Encode permit data for Universal Router
   */
  static encodePermitData(permit: Permit2Signature): string {
    return encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            {
              type: 'tuple',
              name: 'details',
              components: [
                { type: 'address', name: 'token' },
                { type: 'uint160', name: 'amount' },
                { type: 'uint48', name: 'expiration' },
                { type: 'uint48', name: 'nonce' },
              ],
            },
            { type: 'address', name: 'spender' },
            { type: 'uint256', name: 'sigDeadline' },
          ],
        },
        { type: 'bytes' },
      ],
      [
        {
          details: {
            token: permit.permitSingle.details.token as `0x${string}`,
            amount: BigInt(permit.permitSingle.details.amount),
            expiration: permit.permitSingle.details.expiration,
            nonce: permit.permitSingle.details.nonce,
          },
          spender: permit.permitSingle.spender as `0x${string}`,
          sigDeadline: BigInt(permit.permitSingle.sigDeadline),
        },
        permit.signature as `0x${string}`,
      ]
    );
  }

  /**
   * Get time until expiration in seconds
   */
  static getTimeUntilExpiration(allowance: Permit2Allowance): number {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, allowance.expiration - now);
  }

  /**
   * Format expiration time for display
   */
  static formatExpirationTime(allowance: Permit2Allowance): string {
    const timeLeft = this.getTimeUntilExpiration(allowance);
    
    if (timeLeft <= 0) {
      return 'expired';
    }
    
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s left`;
    } else {
      return `${seconds}s left`;
    }
  }

  /**
   * Check if we need a new signature based on allowance state
   */
  static needsNewSignature(
    allowance: Permit2Allowance | null,
    requiredAmount: bigint,
    existingSignature?: Permit2Signature | null
  ): boolean {
    // If we have a valid allowance, we don't need a new signature
    if (this.isAllowanceValid(allowance, requiredAmount)) {
      console.log('🔍 Valid allowance exists, no new signature needed');
      return false;
    }

    // If allowance is invalid or missing, we need a new signature
    console.log('🔍 Invalid/missing allowance, new signature needed');
    return true;
  }
} 