import { ethers } from 'ethers';
import { PredicateRequest, PredicateEvaluationResult, PredicateMessage, BeforeSwapArgs } from '@/types/predicate';
import { FUNCTION_SIGNATURES } from '@/config/contracts';
// Using local implementations due to type incompatibilities with @predicate/core

export class PredicateClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async evaluatePolicy(request: PredicateRequest): Promise<PredicateEvaluationResult> {
    try {
      // Call our local API route instead of directly calling Predicate API
      const response = await fetch('/api/evaluate-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: request.from,
          to: request.to,
          data: request.data,
          msg_value: request.msg_value,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${response.status} - ${errorData.details || response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error evaluating policy:', error);
      throw error;
    }
  }

  signaturesToBytes(evaluationResult: PredicateEvaluationResult): PredicateMessage {
    return {
      taskId: evaluationResult.task_id,
      expireByBlockNumber: evaluationResult.expiry_block || evaluationResult.expire_by_block_number || 0,
      signerAddresses: evaluationResult.signers || evaluationResult.signer_addresses || [],
      signatures: evaluationResult.signature || evaluationResult.signatures || [],
    };
  }

  /**
   * Encodes the beforeSwap function call for PredicateHook validation (V4)
   * Based on working example - flattens parameters instead of using tuples
   */
  encodeBeforeSwapCall(args: BeforeSwapArgs): string {
    // Use the flattened signature pattern from working example
    const functionSignature = "_beforeSwap(address,address,address,uint24,int24,address,bool,int256)";
    
    // Create function selector manually
    const selector = ethers.keccak256(ethers.toUtf8Bytes(functionSignature)).substring(0, 10);
    
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedArgs = abiCoder.encode(
      [
        "address", // sender
        "address", // currency0
        "address", // currency1
        "uint24",  // fee
        "int24",   // tickSpacing
        "address", // hooks
        "bool",    // zeroForOne
        "int256",  // amountSpecified
      ],
      [
        args.sender,
        args.poolKey.currency0,
        args.poolKey.currency1,
        args.poolKey.fee,
        args.poolKey.tickSpacing,
        args.poolKey.hooks,
        args.zeroForOne,
        args.amountSpecified,
      ],
    );
    
    return selector + encodedArgs.substring(2);
  }

  /**
   * Encodes the PredicateMessage for hookData
   */
  encodePredicateMessage(message: PredicateMessage): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    return abiCoder.encode(
      ['tuple(string,uint256,address[],bytes[])'],
      [[
        message.taskId,
        message.expireByBlockNumber,
        message.signerAddresses,
        message.signatures
      ]]
    );
  }

  /**
   * Encodes ExactInputSingleParams struct - following official Uniswap v4 documentation
   * Matches IV4Router.ExactInputSingleParams from the official docs
   */
  encodeExactInputSingleParams(params: {
    poolKey: {
      currency0: string;
      currency1: string;
      fee: number;
      tickSpacing: number;
      hooks: string;
    };
    zeroForOne: boolean;
    amountIn: bigint;
    amountOutMinimum: bigint;
    hookData: string;
  }): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    // Encode exactly as shown in official documentation:
    // struct ExactInputSingleParams {
    //     PoolKey poolKey;
    //     bool zeroForOne;
    //     uint128 amountIn;
    //     uint128 amountOutMinimum;
    //     bytes hookData;
    // }
    return abiCoder.encode(
      ['tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)'],
      [[
        [
          params.poolKey.currency0,
          params.poolKey.currency1,
          params.poolKey.fee,
          params.poolKey.tickSpacing,
          params.poolKey.hooks
        ],
        params.zeroForOne,
        params.amountIn,
        params.amountOutMinimum,
        params.hookData
      ]]
    );
  }

  /**
   * Encodes [Currency, uint256] pattern used by SETTLE_ALL and TAKE_ALL
   * Following official Uniswap v4 documentation
   */
  encodeAddress_Uint256(params: [string, string]): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(
      ['address', 'uint256'],
      [params[0], params[1]]
    );
  }

  /**
   * Encodes [bytes, bytes[]] pattern for V4_SWAP command input
   */
  encodeBytes_BytesArray(params: [string, string[]]): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(
      ['bytes', 'bytes[]'],
      [params[0], params[1]]
    );
  }

  /**
   * Encodes parameters for PERMIT2_TRANSFER_FROM Universal Router command (0x02)
   * Based on official Universal Router documentation
   */
  encodePermit2TransferFrom(params: {
    token: string;
    recipient: string;
    amount: bigint;
  }): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    // PERMIT2_TRANSFER_FROM expects: (address token, address recipient, uint160 amount)
    return abiCoder.encode(
      ["address", "address", "uint160"],
      [
        params.token,
        params.recipient,
        params.amount.toString()
      ]
    );
  }

  /**
   * Encodes parameters for PERMIT2_PERMIT Universal Router command (0x0a)
   * Based on official Universal Router documentation
   */
  encodePermit2Permit(permitSignature: any): string {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    // PERMIT2_PERMIT expects: (PermitSingle permitSingle, bytes signature)
    return abiCoder.encode(
      [
        "tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)",
        "bytes"
      ],
      [
        [
          [
            permitSignature.permitSingle.details.token,
            permitSignature.permitSingle.details.amount,
            permitSignature.permitSingle.details.expiration,
            permitSignature.permitSingle.details.nonce,
          ],
          permitSignature.permitSingle.spender,
          permitSignature.permitSingle.sigDeadline,
        ],
        permitSignature.signature,
      ]
    );
  }
}

// Helper function for backwards compatibility
export function packFunctionArgs(signature: string, args: unknown[]): string {
  try {
    const iface = new ethers.Interface([`function ${signature}`]);
    const functionName = signature.split('(')[0];
    return iface.encodeFunctionData(functionName, args);
  } catch (error) {
    console.error('Error encoding function args:', error);
    // Fallback to simple encoding
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ signature, args }));
    return '0x' + Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
  }
} 