'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi';
import type { UseBalanceReturnType } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';

import { TOKEN_CONFIG, CONTRACTS, POOL_CONFIG } from '@/config/contracts';
import { Permit2Client } from '@/lib/permit2-client';
import type { Permit2Allowance, Permit2Signature } from '@/lib/permit2-client';
import type { Token, PoolKey, BeforeSwapArgs } from '@/types/uniswapv4';
import type { PredicateRequest } from '@predicate/core';

import {
  encodeBeforeSwapCall,
  encodeAddress_Uint256,
  encodePredicateMessage,
  encodePermit2Permit, encodeExactInputSingleParams, encodeBytes_BytesArray
} from '@/lib/v4-encoder';

// Constants
const TOKENS = [TOKEN_CONFIG.USDC, TOKEN_CONFIG.USDT] as const;

const TIMEOUT_DELAYS = {
  APPROVAL_CHECK: 2000,
  SUCCESS_INDICATOR: 3000,
} as const;

const TRANSACTION_DEADLINE_SECONDS = 7200; // 2 hours

// ERC20 ABI for token approvals
const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance', 
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// UniversalRouter ABI - from official documentation
const UNIVERSAL_ROUTER_ABI = [
  {
    inputs: [
      { name: 'commands', type: 'bytes', internalType: 'bytes' },
      { name: 'inputs', type: 'bytes[]', internalType: 'bytes[]' },
      { name: 'deadline', type: 'uint256', internalType: 'uint256' }
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  }
] as const;

// Style constants for consistency and maintainability
const STYLES = {
  primary: '#486765',
  secondary: '#101010', 
  background: '#FFFFFF',
  text: '#101010',
  textLight: '#486765',
  textWhite: '#FFFFFF',
} as const;

const INPUT_CLASSES = 'border-2 px-3 py-2 text-lg font-black font-mono focus:outline-none box-border';
const TOKEN_SELECTOR_CLASSES = `${INPUT_CLASSES} w-24 text-center`;
const AMOUNT_INPUT_CLASSES = `${INPUT_CLASSES} flex-1 text-right min-w-0`;

// Types
type ApprovalStep = 'erc20' | 'permit2' | 'ready';
type TransactionStatus = 'idle' | 'success' | 'failed';

interface SwapButtonProps {
  isConnected: boolean;
  isLoading: boolean;
  hasAmount: boolean;
  tokenIn: Token;
  tokenOut: Token;
  onSwap: () => void;
  onApproval: () => void;
  onCheckApproval: () => void;
  needsApproval: boolean;
  isApproving: boolean;
  isPending?: boolean;
  isConfirming?: boolean;
  approvalStep: ApprovalStep;
}

interface TokenSectionProps {
  label: string;
  token: Token;
  amount: string;
  onTokenChange?: (symbol: string) => void;
  onAmountChange?: (amount: string) => void;
  balance?: UseBalanceReturnType['data'];
  isInput?: boolean;
  tokens?: readonly Token[];
}

interface ErrorPopupProps {
  error: string;
  onClose: () => void;
}

// Utility functions
const isUserRejectionError = (error: unknown): boolean => {
  const errorMessage = error instanceof Error ? error.message : '';
  return errorMessage.includes('User rejected the request') || 
         errorMessage.includes('User denied transaction signature') ||
         errorMessage.includes('UserRejectedRequestError');
};

const getMaxUint256 = (): bigint => 
  BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

export function SwapInterface() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  // State
  const [tokenIn, setTokenIn] = useState<Token>(TOKENS[0]);
  const [amountIn, setAmountIn] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [permit2Allowance, setPermit2Allowance] = useState<Permit2Allowance | null>(null);
  const [permit2Signature, setPermit2Signature] = useState<Permit2Signature | null>(null);
  const [allowanceStatus, setAllowanceStatus] = useState('');
  const [approvalStep, setApprovalStep] = useState<ApprovalStep>('erc20');
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>('idle');

  // Derived state
  const tokenOut = tokenIn.symbol === 'USDC' ? TOKENS[1] : TOKENS[0];
  const amountOut = amountIn;

  // Hooks
  const { data: balanceIn, refetch: refetchBalanceIn } = useBalance({
    address: address,
    token: tokenIn.address as `0x${string}`,
  });

  const { data: balanceOut, refetch: refetchBalanceOut } = useBalance({
    address: address,
    token: tokenOut.address as `0x${string}`,
  });

  const { writeContract, data: hash, isPending, error: contractError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Check if token approval is needed
  const checkApproval = useCallback(async () => {
    if (!address || !amountIn) return;
    
    try {
      const amountInWei = parseUnits(amountIn, tokenIn.decimals);
      
      // Step 1: Check ERC20 allowance for Permit2 contract
      const allowanceResult = await fetch('/api/check-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: address,
          spender: CONTRACTS.PERMIT2,
          token: tokenIn.address,
        }),
      });
      
      const allowanceData = await allowanceResult.json();
      const erc20Allowance = BigInt(allowanceData.allowance || '0');
      
      // Step 2: Check Permit2 allowance with expiration
      let permit2AllowanceResult = null;
      try {
        permit2AllowanceResult = await Permit2Client.checkPermit2Allowance(
          address,
          tokenIn.address,
          CONTRACTS.UNIVERSAL_ROUTER
        );
      } catch (permitError) {
        console.warn('Error checking Permit2 allowance:', permitError);
        permit2AllowanceResult = null;
      }
      
      setPermit2Allowance(permit2AllowanceResult);
      
      // Step 3: Determine what approval is needed
      const needsERC20Approval = erc20Allowance < amountInWei;
      const needsNewPermit2Signature = Permit2Client.needsNewSignature(
        permit2AllowanceResult, 
        amountInWei
      );
      
      setNeedsApproval(needsERC20Approval || needsNewPermit2Signature);
      
      // Step 4: Update status message and approval step
      if (needsERC20Approval) {
        setAllowanceStatus('Step 1: ERC20 approval needed');
        setApprovalStep('erc20');
      } else if (needsNewPermit2Signature) {
        if (permit2AllowanceResult) {
          const timeLeft = Permit2Client.formatExpirationTime(permit2AllowanceResult);
          setAllowanceStatus(`Step 2: Permit2 allowance expired (${timeLeft})`);
        } else {
          setAllowanceStatus('Step 2: Permit2 allowance needed');
        }
        setApprovalStep('permit2');
      } else {
        const timeLeft = permit2AllowanceResult ? Permit2Client.formatExpirationTime(permit2AllowanceResult) : '';
        setAllowanceStatus(`✅ Ready to swap ${permit2Signature ? '(with allowance)' : `(${timeLeft})`}`);
        setApprovalStep('ready');
      }
      
    } catch (err) {
      console.error('Error in checkApproval:', err);
      setAllowanceStatus('Error checking approvals');
    }
  }, [address, amountIn, tokenIn.decimals, tokenIn.address, permit2Signature]);

  const handleApproval = useCallback(async () => {
    if (!address || !walletClient) return;
    
    setIsApproving(true);
    setError(null);
    
    try {
      const amountInWei = parseUnits(amountIn, tokenIn.decimals);
      
      // Check what type of approval is needed
      const erc20Allowance = await fetch('/api/check-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: address,
          spender: CONTRACTS.PERMIT2,
          token: tokenIn.address,
        }),
      }).then(r => r.json()).then(d => BigInt(d.allowance || '0'));
      
      const needsERC20Approval = erc20Allowance < amountInWei;
      
      if (needsERC20Approval) {
        // First do ERC20 approval to Permit2
        writeContract({
          address: tokenIn.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACTS.PERMIT2 as `0x${string}`, getMaxUint256()], // Max approval
        });
      } else {
        // Create Permit2 allowance signature
        const permit2SignatureResult = await Permit2Client.createPermit2Signature(
          walletClient,
          tokenIn.address,
          amountInWei,
          CONTRACTS.UNIVERSAL_ROUTER
        );
        
        setPermit2Signature(permit2SignatureResult);
        setIsApproving(false);
        
        // Update UI state immediately after signature creation
        setNeedsApproval(false);
        setApprovalStep('ready');
        setAllowanceStatus('✅ Ready to swap (with allowance)');
      }
    } catch (err) {
      if (isUserRejectionError(err)) {
        const errorMsg = approvalStep === 'erc20' 
          ? `You have rejected the approval for ${tokenIn.symbol}.`
          : `You have rejected signing the allowance for ${tokenIn.symbol}.`;
        setError(errorMsg);
      } else {
        console.error('Approval error:', err);
        setError(err instanceof Error ? err.message : 'Approval failed');
      }
      setIsApproving(false);
    }
  }, [address, walletClient, amountIn, tokenIn.decimals, tokenIn.address, tokenIn.symbol, approvalStep, writeContract]);

  const handleSwap = useCallback(async () => {
    if (!isConnected || !address) {
      setError('Connect wallet first');
      return;
    }
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setError('Enter valid amount');
      return;
    }

    const amountInWei = parseUnits(amountIn, tokenIn.decimals);
    
    if (!permit2Signature && !permit2Allowance) {
      setError('Valid Permit2 allowance required. Please approve first.');
      return;
    }
    
    const hasValidPermit = permit2Signature || Permit2Client.isAllowanceValid(permit2Allowance, amountInWei);
    
    if (!hasValidPermit) {
      setError('Insufficient Permit2 allowance. Please approve again.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {

      const token0 = tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase() ? tokenIn : tokenOut;
      const token1 = tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase() ? tokenOut : tokenIn;
      
      const poolKey: PoolKey = {
        currency0: token0.address,
        currency1: token1.address,
        fee: POOL_CONFIG.FEE_TIER,
        tickSpacing: POOL_CONFIG.TICK_SPACING,
        hooks: CONTRACTS.PREDICATE_HOOK,
      };
      
      const isZeroForOne = tokenIn.address.toLowerCase() === poolKey.currency0.toLowerCase();
      const amountSpecified = amountInWei.toString();

      const beforeSwapArgs: BeforeSwapArgs = {
        sender: address,
        poolKey: poolKey,
        zeroForOne: isZeroForOne,
        amountSpecified: amountSpecified
      };

      const encodedCall = encodeBeforeSwapCall(beforeSwapArgs);
      
      const predicateRequest: PredicateRequest = {
        from: address,
        to: CONTRACTS.PREDICATE_HOOK,
        data: encodedCall,
        msg_value: '0'
      };

      // Get Predicate authorization from backend API
      const evaluationResponse = await fetch('/api/evaluate-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(predicateRequest),
      });

      if (!evaluationResponse.ok) {
        throw new Error(`Policy evaluation failed: ${evaluationResponse.statusText}`);
      }

      const evaluationResult = await evaluationResponse.json();

      if (!evaluationResult.is_compliant) {
        throw new Error(`Transaction not compliant with policy`);
      }

      // Convert signatures to bytes for hookData
      const predicateMessage = {
        taskId: evaluationResult.task_id || '',
        expireByBlockNumber: evaluationResult.expire_by_block_number || 0,
        signerAddresses: evaluationResult.signer_addresses || [],
        signatures: evaluationResult.signatures || []
      };
      const hookData = encodePredicateMessage(predicateMessage);
      const amountOutMin = parseUnits('0.1', tokenOut.decimals);

      // Build Universal Router commands and inputs
      let commands: string;
      const inputs: string[] = [];
      
      if (permit2Signature) {
        // Case 1: We have a fresh permit signature - need to establish allowance
        commands = `0x0a10`; // PERMIT2_PERMIT + V4_SWAP
        
        // Input 0: PERMIT2_PERMIT parameters
        inputs[0] = encodePermit2Permit(permit2Signature);
        
        // Input 1: V4_SWAP parameters
        const v4Actions = `0x060c0f`; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
        const v4Params: string[] = [];
        
        v4Params[0] = encodeExactInputSingleParams({
          poolKey,
          zeroForOne: isZeroForOne,
          amountIn: amountInWei,
          amountOutMinimum: amountOutMin,
          hookData,
        });

        v4Params[1] = encodeAddress_Uint256([
          isZeroForOne ? poolKey.currency0 : poolKey.currency1,
          amountInWei.toString()
        ]);

        v4Params[2] = encodeAddress_Uint256([
          isZeroForOne ? poolKey.currency1 : poolKey.currency0,
          amountOutMin.toString()
        ]);
        
        inputs[1] = encodeBytes_BytesArray([v4Actions, v4Params]);
        
      } else {
        // Case 2: We have a valid existing allowance
        commands = `0x10`; // Just V4_SWAP
        
        const v4Actions = `0x060c0f`; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
        const v4Params: string[] = [];
        
        v4Params[0] = encodeExactInputSingleParams({
          poolKey,
          zeroForOne: isZeroForOne,
          amountIn: amountInWei,
          amountOutMinimum: amountOutMin,
          hookData,
        });

        v4Params[1] = encodeAddress_Uint256([
          isZeroForOne ? poolKey.currency0 : poolKey.currency1,
          amountInWei.toString()
        ]);

        v4Params[2] = encodeAddress_Uint256([
          isZeroForOne ? poolKey.currency1 : poolKey.currency0,
          amountOutMin.toString()
        ]);
        
        inputs[0] = encodeBytes_BytesArray([v4Actions, v4Params]);
      }

      const deadline = Math.floor(Date.now() / 1000) + TRANSACTION_DEADLINE_SECONDS;

      writeContract({
        address: CONTRACTS.UNIVERSAL_ROUTER as `0x${string}`,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: [commands as `0x${string}`, inputs as `0x${string}`[], BigInt(deadline)],
      });

    } catch (err) {
      if (isUserRejectionError(err)) {
        setError(`You have rejected the transaction to swap ${tokenIn.symbol} for ${tokenOut.symbol}.`);
      } else {
        console.error('Swap error:', err);
        setError(err instanceof Error ? err.message : 'Swap failed');
      }
      setIsLoading(false);
    }
  }, [
    isConnected, address, amountIn, tokenIn, tokenOut, permit2Signature, 
    permit2Allowance, writeContract
  ]);

  // Handle transaction completion
  useEffect(() => {
    if (isConfirmed && hash && txHash !== hash) {
      setTxHash(hash);
      setIsLoading(false);
      setIsApproving(false);
      
      if (needsApproval) {
        // This was an ERC20 approval transaction
        setNeedsApproval(false);
        
        // Check approvals after a short delay to allow blockchain state to update
        setTimeout(() => {
          checkApproval();
        }, TIMEOUT_DELAYS.APPROVAL_CHECK);
        
      } else {
        // This was a swap transaction - SUCCESS!
        setTransactionStatus('success');
        
        // Clear the permit2 signature after successful use
        setPermit2Signature(null);
        
        // Clear amount to reset the form
        setAmountIn('');
        
        // Refresh balances to show updated amounts
        refetchBalanceIn();
        refetchBalanceOut();
        
        // Show success indicator for 3 seconds
        setTimeout(() => {
          setTransactionStatus('idle');
        }, TIMEOUT_DELAYS.SUCCESS_INDICATOR);
      }
    }
  }, [isConfirmed, hash, txHash, needsApproval, checkApproval, refetchBalanceIn, refetchBalanceOut]);

  // Handle contract errors and transaction failures
  useEffect(() => {
    if (contractError && !error) {
      if (isUserRejectionError(contractError)) {
        setError(`You have rejected the transaction to swap ${tokenIn.symbol} for ${tokenOut.symbol}.`);
        setTransactionStatus('idle');
      } else {
        console.error('Contract error:', contractError);
        setError(contractError.message);
        setTransactionStatus('failed');
        
        setTimeout(() => {
          setTransactionStatus('idle');
        }, TIMEOUT_DELAYS.SUCCESS_INDICATOR);
      }
      
      setIsLoading(false);
      setIsApproving(false);
    }
  }, [contractError, error, tokenIn.symbol, tokenOut.symbol]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <>
      <style jsx>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      
      {/* Error Popup */}
      {error && <ErrorPopup error={error} onClose={clearError} />}
      
      <div 
        className="w-96 mx-auto border-2 font-mono"
        style={{
          backgroundColor: STYLES.background,
          borderColor: STYLES.secondary
        }}
      >
        {/* Header */}
        <SwapHeader />

        <div className="p-6 space-y-4">
          {/* FROM Section */}
          <TokenSection
            label="FROM"
            token={tokenIn}
            amount={amountIn}
            onTokenChange={(symbol) => setTokenIn(TOKENS.find(t => t.symbol === symbol) || TOKENS[0])}
            onAmountChange={setAmountIn}
            balance={balanceIn}
            isInput={true}
            tokens={TOKENS}
          />

          {/* Arrow */}
          <SwapArrow />

          {/* TO Section */}
          <TokenSection
            label="TO"
            token={tokenOut}
            amount={amountOut || '0.00'}
            balance={balanceOut}
            isInput={false}
          />

          {/* Allowance Status */}
          {allowanceStatus && (
            <div className="text-xs font-black text-center p-2 border border-dashed" 
                 style={{ color: STYLES.textLight, borderColor: STYLES.textLight }}>
              {allowanceStatus}
            </div>
          )}

          {/* Transaction Status Indicators */}
          {transactionStatus !== 'idle' && (
            <div className="flex justify-center items-center p-2">
              {transactionStatus === 'success' && (
                <div className="flex items-center space-x-2 text-green-600">
                  <div className="text-xl">✅</div>
                  <span className="text-xs font-black">Swap Successful!</span>
                </div>
              )}
              {transactionStatus === 'failed' && (
                <div className="flex items-center space-x-2 text-red-600">
                  <div className="text-xl">❌</div>
                  <span className="text-xs font-black">Transaction Failed</span>
                </div>
              )}
            </div>
          )}

          {/* Swap Button */}
          <SwapButton
            isConnected={isConnected}
            isLoading={isLoading}
            hasAmount={!!amountIn}
            tokenIn={tokenIn}
            tokenOut={tokenOut}
            onSwap={handleSwap}
            onApproval={handleApproval}
            onCheckApproval={checkApproval}
            needsApproval={needsApproval}
            isApproving={isApproving}
            isPending={isPending}
            isConfirming={isConfirming}
            approvalStep={approvalStep}
          />
        </div>
      </div>
    </>
  );
}

// Extracted components for better maintainability
function ErrorPopup({ error, onClose }: ErrorPopupProps) {
  const handleClose = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose(e);
    }
  }, [handleClose]);

  const handleModalClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Add keyboard support for ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 cursor-pointer" 
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={handleBackdropClick}
      />
      
      {/* Modal */}
      <div 
        className="relative border-2 shadow-lg font-mono max-w-md w-full max-h-96 overflow-hidden"
        style={{
          backgroundColor: STYLES.background,
          borderColor: STYLES.secondary
        }}
        onClick={handleModalClick}
      >
        {/* Header with close button */}
        <div 
          className="border-b-2 px-6 py-4 flex justify-between items-center"
          style={{
            borderColor: STYLES.secondary,
            backgroundColor: STYLES.primary
          }}
        >
          <h3 className="text-lg font-black" style={{ color: STYLES.textWhite }}>
            Transaction Cancelled
          </h3>
          <button
            onClick={handleClose}
            className="text-xl font-black hover:opacity-75 cursor-pointer p-1"
            style={{ color: STYLES.textWhite }}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
        </div>
        
        {/* Content with scroll if needed */}
        <div className="px-6 py-6 overflow-y-auto max-h-64">
          <p className="text-sm font-black mb-6 leading-relaxed break-words" style={{ color: STYLES.text }}>
            {error}
          </p>
          
          {/* Button */}
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2 border-2 font-black text-sm hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: STYLES.primary,
                borderColor: STYLES.secondary,
                color: STYLES.textWhite
              }}
              type="button"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SwapHeader() {
  return (
    <div 
      className="border-b-2 p-4 text-center"
      style={{
        borderColor: STYLES.secondary,
        backgroundColor: STYLES.primary
      }}
    >
      <h2 className="text-lg font-black" style={{color: STYLES.textWhite}}>SWAP</h2>
    </div>
  );
}

function SwapArrow() {
  return (
    <div className="flex justify-center">
      <div 
        className="border-2 p-2"
        style={{
          borderColor: STYLES.secondary,
          backgroundColor: STYLES.primary
        }}
      >
        <div className="text-lg font-black" style={{color: STYLES.textWhite}}>↓</div>
      </div>
    </div>
  );
}

function TokenSection({ 
  label, 
  token, 
  amount, 
  onTokenChange, 
  onAmountChange, 
  balance, 
  isInput = false,
  tokens = []
}: TokenSectionProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-black" style={{color: STYLES.text}}>
        {label}
      </div>
      <div className="flex space-x-3 overflow-hidden">
        {/* Token Selector/Display - Fixed width for perfect alignment */}
        {isInput ? (
          <select
            value={token.symbol}
            onChange={(e) => onTokenChange?.(e.target.value)}
            className={TOKEN_SELECTOR_CLASSES}
            style={{
              backgroundColor: STYLES.background,
              color: STYLES.text,
              borderColor: STYLES.secondary,
              height: '3rem',
              lineHeight: '1.5rem',
              flexShrink: 0
            }}
          >
            {tokens.map(t => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
        ) : (
          <div 
            className={TOKEN_SELECTOR_CLASSES}
            style={{
              backgroundColor: STYLES.primary,
              borderColor: STYLES.secondary,
              color: STYLES.textWhite,
              height: '3rem',
              lineHeight: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {token.symbol}
          </div>
        )}
        
        {/* Amount Input/Display - Flex-1 for perfect alignment */}
        {isInput ? (
          <input
            type="number"
            value={amount}
            onChange={(e) => onAmountChange?.(e.target.value)}
            className={AMOUNT_INPUT_CLASSES}
            placeholder="0.00"
            style={{
              backgroundColor: STYLES.background,
              borderColor: STYLES.secondary,
              color: STYLES.text,
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'textfield',
              margin: 0,
              height: '3rem',
              lineHeight: '1.5rem',
              width: 0
            }}
          />
        ) : (
          <div 
            className={AMOUNT_INPUT_CLASSES}
            style={{
              backgroundColor: STYLES.primary,
              borderColor: STYLES.secondary,
              color: STYLES.textWhite,
              height: '3rem',
              lineHeight: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              width: 0
            }}
          >
            {amount}
          </div>
        )}
      </div>
      
      {/* Balance Display */}
      {balance && (
        <div className="text-xs font-black text-right" style={{color: STYLES.textLight}}>
          Balance: {parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function SwapButton({ 
  isConnected, 
  isLoading, 
  hasAmount, 
  tokenIn, 
  tokenOut, 
  onSwap, 
  onApproval, 
  onCheckApproval, 
  needsApproval, 
  isApproving,
  isPending, 
  isConfirming,
  approvalStep
}: SwapButtonProps) {
  // Determine button text and action
  let buttonText = 'CHECK APPROVALS';
  let buttonAction = onCheckApproval;
  
  if (!isConnected) {
    buttonText = 'CONNECT WALLET';
  } else if (isApproving) {
    buttonText = approvalStep === 'erc20' ? 'APPROVING ERC20...' : 'SIGNING PERMIT2...';
  } else if (isConfirming) {
    buttonText = 'CONFIRMING...';
  } else if (isPending) {
    buttonText = 'CONFIRM IN WALLET...';
  } else if (isLoading) {
    buttonText = 'GETTING AUTHORIZATION...';
  } else if (!hasAmount) {
    buttonText = 'ENTER AMOUNT';
  } else if (needsApproval && hasAmount) {
    if (approvalStep === 'erc20') {
      buttonText = `STEP 1: APPROVE ${tokenIn.symbol}`;
    } else if (approvalStep === 'permit2') {
      buttonText = `STEP 2: SIGN ALLOWANCE`;
    }
    buttonAction = onApproval;
  } else if (approvalStep === 'ready') {
    buttonText = `SWAP ${tokenIn.symbol} → ${tokenOut.symbol}`;
    buttonAction = onSwap;
  }
  
  // Determine if button should be disabled
  const isCheckingApprovals = buttonAction === onCheckApproval;
  const isDisabled = !isConnected || isLoading || isPending || isConfirming || isApproving || 
                    (!hasAmount && !isCheckingApprovals);
  
  return (
    <button
      onClick={buttonAction}
      disabled={isDisabled}
      className="w-full py-3 font-black font-mono border-2 mt-6"
      style={{
        backgroundColor: STYLES.primary,
        color: STYLES.textWhite,
        borderColor: STYLES.secondary,
        opacity: isDisabled ? 0.5 : 1
      }}
    >
      {buttonText}
    </button>
  );
} 