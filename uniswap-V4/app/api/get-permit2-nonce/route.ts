import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { CONTRACTS } from '@/config/contracts';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// AllowanceTransfer ABI for getting the correct nonce
const PERMIT2_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' }
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, token, spender } = body;

    if (!owner || !token || !spender) {
      return NextResponse.json(
        { error: 'Missing required parameters: owner, token, spender' },
        { status: 400 }
      );
    }

    console.log('🔍 Getting AllowanceTransfer nonce for:', { owner, token, spender });

    try {
      // Get the current allowance state which includes the nonce
      const result = await publicClient.readContract({
        address: CONTRACTS.PERMIT2 as `0x${string}`,
        abi: PERMIT2_ABI,
        functionName: 'allowance',
        args: [owner as `0x${string}`, token as `0x${string}`, spender as `0x${string}`],
      });

      const [amount, expiration, currentNonce] = result;
      
      console.log('🔍 Current allowance state:', {
        amount: amount.toString(),
        expiration: Number(expiration),
        currentNonce: Number(currentNonce)
      });

      // CRITICAL: The stored nonce in Permit2 is the NEXT expected nonce, not the last used
      // Based on error trace: contract had nonce 1, user provided 0, error occurred
      // This means we should use the stored nonce as-is
      const nextNonce = Number(currentNonce);
      
      console.log('✅ Using stored nonce as next nonce:', {
        storedNonce: Number(currentNonce),
        nextNonce,
        reason: 'Stored nonce is the next expected nonce in AllowanceTransfer'
      });

      return NextResponse.json({ 
        nonce: nextNonce,
        schema: 'AllowanceTransfer',
        currentAmount: amount.toString(),
        currentExpiration: Number(expiration),
        storedNonce: Number(currentNonce),
      });
      
    } catch (contractError) {
      console.warn('Could not read allowance mapping:', contractError);
      
      // If we can't read the current state, start with nonce 0
      // This is safe for AllowanceTransfer as unused nonces won't conflict
      const fallbackNonce = 0;
      console.log('🔄 Using fallback nonce:', fallbackNonce);
      
      return NextResponse.json({ 
        nonce: fallbackNonce,
        fallback: true,
        schema: 'AllowanceTransfer'
      });
    }

  } catch (error) {
    console.error('❌ Error getting Permit2 nonce:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get Permit2 nonce', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 