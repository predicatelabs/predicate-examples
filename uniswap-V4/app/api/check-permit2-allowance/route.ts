import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { CONTRACTS } from '@/config/contracts';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

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

    console.log('🔍 API: Checking Permit2 allowance request:', { owner, token, spender });

    if (!owner || !token || !spender) {
      console.log('❌ API: Missing parameters');
      return NextResponse.json(
        { error: 'Missing required parameters: owner, token, spender' },
        { status: 400 }
      );
    }

    console.log('🔍 API: About to call publicClient.readContract...');
    console.log('🔍 API: PERMIT2 address:', CONTRACTS.PERMIT2);

    const result = await publicClient.readContract({
      address: CONTRACTS.PERMIT2 as `0x${string}`,
      abi: PERMIT2_ABI,
      functionName: 'allowance',
      args: [owner as `0x${string}`, token as `0x${string}`, spender as `0x${string}`],
    });

    console.log('🔍 API: Raw contract result:', result);

    const [amount, expiration, nonce] = result;
    
    const allowance = {
      token,
      amount: amount.toString(),
      expiration: Number(expiration),
      nonce: Number(nonce),
    };

    console.log('✅ API: Permit2 allowance result:', allowance);

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    const isExpired = expiration < now;
    const timeLeft = Number(expiration) - now;

    const response = { 
      allowance,
      isExpired,
      timeLeft: Math.max(0, timeLeft),
      expirationTime: new Date(Number(expiration) * 1000).toISOString(),
    };

    console.log('✅ API: Returning response:', response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('❌ API: Error checking Permit2 allowance:', error);
    console.error('❌ API: Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to check Permit2 allowance', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 