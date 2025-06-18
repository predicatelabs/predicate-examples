import { NextRequest, NextResponse } from 'next/server';
import { PredicateClient, PredicateRequest } from '@predicate/core';

const predicateClient = new PredicateClient({
  apiUrl: 'https://api.predicate.io/',
  apiKey: 'dkyNG1tUUiGy7jusTiFP2NBdKLdnMEF1tXk6G560'
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to, data, msg_value } = body;

    const predicateRequest: PredicateRequest = {
      from,
      to,
      data,
      msg_value
    };

    console.log('🔍 Evaluating policy with Predicate API:', predicateRequest);
    
    const evaluationResult = await predicateClient.evaluatePolicy(predicateRequest);
    
    console.log('✅ Policy evaluation result:', evaluationResult);
    
    return NextResponse.json(evaluationResult);
  } catch (error) {
    console.error('❌ Error evaluating policy:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to evaluate policy', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 