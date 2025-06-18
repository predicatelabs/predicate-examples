'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';

const ConnectButton = dynamic(
  () => import('@rainbow-me/rainbowkit').then(mod => ({ default: mod.ConnectButton })),
  { ssr: false }
);

const SwapInterface = dynamic(
  () => import('@/components/SwapInterface').then(mod => ({ default: mod.SwapInterface })),
  { 
    ssr: false,
    loading: () => (
      <div className="w-96 mx-auto border-2 font-mono p-6" style={{
        backgroundColor: '#FFFFFF',
        borderColor: '#101010'
      }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto mb-4"></div>
          <p className="text-sm font-black" style={{color: '#486765'}}>Loading swap interface...</p>
        </div>
      </div>
    )
  }
);

export default function Home() {
  return (
    <div className="h-screen flex flex-col" style={{
      fontFamily: 'monospace',
      backgroundColor: '#FFFFFF'
    }}>
      <header className="border-b-2" style={{
        backgroundColor: '#486765',
        borderColor: '#101010'
      }}>
        <div className="mx-auto px-8">
          <div className="flex justify-between items-center py-4">
            <Image
              src="/Predicate.png"
              alt="Predicate"
              width={72}
              height={20}
              className="h-5 w-auto"
              style={{ objectFit: 'contain' }}
            />
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-8">
            <h2 className="text-2xl font-black mb-2" style={{color: '#101010'}}>
              TOKEN SWAP
            </h2>
            <p className="text-sm font-black" style={{color: '#486765'}}>
              USDC ↔ USDT • POLICY-COMPLIANT
            </p>
          </div>

          <SwapInterface />
        </div>
      </main>
    </div>
  );
}
