import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const ERC20_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, spender, token } = body;

    if (!owner || !spender || !token) {
      return NextResponse.json(
        { error: 'Missing required parameters: owner, spender, token' },
        { status: 400 }
      );
    }

    console.log('🔍 Checking allowance:', { owner, spender, token });

    const allowance = await publicClient.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner as `0x${string}`, spender as `0x${string}`],
    });

    console.log('✅ Allowance result:', allowance.toString());

    return NextResponse.json({ allowance: allowance.toString() });
  } catch (error) {
    console.error('❌ Error checking allowance:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check allowance', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 