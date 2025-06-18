import { ethers } from 'ethers';

export class UniversalRouterDebugger {
  
  static readonly COMMANDS = {
    0x00: 'V3_SWAP_EXACT_IN',
    0x01: 'V3_SWAP_EXACT_OUT', 
    0x02: 'PERMIT2_TRANSFER_FROM',
    0x03: 'PERMIT2_PERMIT_BATCH',
    0x04: 'SWEEP',
    0x05: 'TRANSFER',
    0x06: 'PAY_PORTION',
    0x08: 'V2_SWAP_EXACT_IN',
    0x09: 'V2_SWAP_EXACT_OUT',
    0x0a: 'PERMIT2_PERMIT',
    0x0b: 'WRAP_ETH',
    0x0c: 'UNWRAP_WETH',
    0x0d: 'PERMIT2_TRANSFER_FROM_BATCH',
    0x0e: 'BALANCE_CHECK_ERC20',
    0x10: 'V4_SWAP',
    0x11: 'V3_POSITION_MANAGER_PERMIT',
    0x12: 'V3_POSITION_MANAGER_CALL',
    0x13: 'V4_INITIALIZE_POOL',
    0x14: 'V4_POSITION_MANAGER_CALL',
    0x21: 'EXECUTE_SUB_PLAN'
  } as const;

  static readonly V4_ACTIONS = {
    0x06: 'SWAP_EXACT_IN_SINGLE',
    0x07: 'SWAP_EXACT_IN', // Multi-hop
    0x08: 'SWAP_EXACT_OUT_SINGLE',
    0x09: 'SWAP_EXACT_OUT',
    0x0b: 'SETTLE', // Single currency
    0x0c: 'SETTLE_ALL',
    0x0e: 'TAKE',
    0x0f: 'TAKE_ALL',
    0x10: 'TAKE_PORTION',
  } as const;

  /**
   * Decode Universal Router execute() call
   */
  static decodeExecuteCall(calldata: string): {
    commands: string;
    inputs: string[];
    deadline?: bigint;
  } {
    const iface = new ethers.Interface([
      'function execute(bytes commands, bytes[] inputs, uint256 deadline)',
      'function execute(bytes commands, bytes[] inputs)'
    ]);

    try {
      // Try with deadline first
      const decoded = iface.decodeFunctionData('execute(bytes,bytes[],uint256)', calldata);
      return {
        commands: decoded[0],
        inputs: decoded[1],
        deadline: decoded[2]
      };
    } catch {
      // Try without deadline
      const decoded = iface.decodeFunctionData('execute(bytes,bytes[])', calldata);
      return {
        commands: decoded[0],
        inputs: decoded[1]
      };
    }
  }

  /**
   * Parse command bytes into individual commands
   */
  static parseCommands(commands: string): Array<{
    byte: number;
    allowRevert: boolean;
    command: number;
    commandName: string;
  }> {
    const commandBytes = ethers.getBytes(commands);
    
    return Array.from(commandBytes).map(byte => {
      const allowRevert = (byte & 0x80) !== 0; // First bit
      const command = byte & 0x1F; // Last 5 bits
      
      return {
        byte,
        allowRevert,
        command,
        commandName: (this.COMMANDS as any)[command] || `UNKNOWN_${command.toString(16)}`
      };
    });
  }

  /**
   * Decode V4_SWAP input data
   */
  static decodeV4SwapInput(input: string): {
    actions: string;
    params: string[];
    actionDetails: Array<{
      action: number;
      actionName: string;
    }>;
  } {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], input);
    
    const actionBytes = ethers.getBytes(actions);
    const actionDetails = Array.from(actionBytes).map(action => ({
      action,
      actionName: (this.V4_ACTIONS as any)[action] || `UNKNOWN_${action.toString(16)}`
    }));

    return {
      actions,
      params,
      actionDetails
    };
  }

  /**
   * Decode ExactInputSingleParams
   */
  static decodeExactInputSingleParams(paramData: string) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    try {
      const [decoded] = abiCoder.decode([
        'tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)'
      ], paramData);

      return {
        poolKey: {
          currency0: decoded[0][0],
          currency1: decoded[0][1], 
          fee: decoded[0][2],
          tickSpacing: decoded[0][3],
          hooks: decoded[0][4]
        },
        zeroForOne: decoded[1],
        amountIn: decoded[2],
        amountOutMinimum: decoded[3],
        hookData: decoded[4]
      };
    } catch (error) {
      console.error('Failed to decode ExactInputSingleParams:', error);
      return null;
    }
  }

  /**
   * Analyze a failed transaction 
   */
  static analyzeFailedTransaction(txData: {
    commands: string;
    inputs: string[];
    deadline?: bigint;
  }): {
    analysis: string[];
    warnings: string[];
    recommendations: string[];
  } {
    const analysis: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    const parsedCommands = this.parseCommands(txData.commands);
    analysis.push(`Found ${parsedCommands.length} command(s):`);
    
    parsedCommands.forEach((cmd, idx) => {
      analysis.push(`  ${idx}: ${cmd.commandName} (0x${cmd.command.toString(16)}) - Allow Revert: ${cmd.allowRevert}`);
      
      if (cmd.commandName === 'V4_SWAP' && txData.inputs[idx]) {
        try {
          const v4Data = this.decodeV4SwapInput(txData.inputs[idx]);
          analysis.push(`    V4_SWAP Actions: [${v4Data.actionDetails.map(a => a.actionName).join(', ')}]`);
          
          // Check for common issues
          if (v4Data.actionDetails.length !== v4Data.params.length) {
            warnings.push(`Action count (${v4Data.actionDetails.length}) doesn't match param count (${v4Data.params.length})`);
          }

          // Check for incorrect action ordering
          const actionOrder = v4Data.actionDetails.map(a => a.action);
          if (actionOrder.includes(0x01)) { // Old incorrect SWAP_EXACT_IN_SINGLE
            warnings.push('Using incorrect action code 0x01 for SWAP_EXACT_IN_SINGLE (should be 0x06)');
            recommendations.push('Change SWAP_EXACT_IN_SINGLE action from 0x01 to 0x06');
          }
          
          if (actionOrder.includes(0x04)) { // Old incorrect SETTLE_ALL  
            warnings.push('Using incorrect action code 0x04 for SETTLE_ALL (should be 0x0c)');
            recommendations.push('Change SETTLE_ALL action from 0x04 to 0x0c');
          }

          if (actionOrder.includes(0x02)) { // Old incorrect TAKE_ALL
            warnings.push('Using incorrect action code 0x02 for TAKE_ALL (should be 0x0f)');  
            recommendations.push('Change TAKE_ALL action from 0x02 to 0x0f');
          }

        } catch (error) {
          warnings.push(`Failed to decode V4_SWAP input: ${(error as Error).message}`);
        }
      }
    });

    // Check deadline
    if (txData.deadline) {
      const now = Math.floor(Date.now() / 1000);
      if (Number(txData.deadline) < now) {
        warnings.push('Transaction deadline has already passed');
        recommendations.push('Use a future timestamp for deadline');
      }
    }

    return { analysis, warnings, recommendations };
  }

  /**
   * Generate a diagnostic report for debugging
   */
  static generateDiagnosticReport(calldata: string): string {
    try {
      const decoded = this.decodeExecuteCall(calldata);
      const analysis = this.analyzeFailedTransaction(decoded);
      
      let report = '=== Universal Router Diagnostic Report ===\n\n';
      
      report += 'ANALYSIS:\n';
      analysis.analysis.forEach(line => report += `${line}\n`);
      
      if (analysis.warnings.length > 0) {
        report += '\nWARNINGS:\n';
        analysis.warnings.forEach(warning => report += `⚠️  ${warning}\n`);
      }
      
      if (analysis.recommendations.length > 0) {
        report += '\nRECOMMENDATIONS:\n';
        analysis.recommendations.forEach(rec => report += `💡 ${rec}\n`);
      }
      
      return report;
      
    } catch (error) {
      return `Failed to analyze transaction: ${(error as Error).message}`;
    }
  }
}

// Export a simple function to use in console
export function debugUniversalRouter(calldata: string): void {
  console.log(UniversalRouterDebugger.generateDiagnosticReport(calldata));
} 