'use client'

import { WagmiConfig, createConfig, configureChains } from 'wagmi'
import { xLayer } from 'wagmi/chains'
import { publicProvider } from 'wagmi/providers/public'
import { MetaMaskConnector } from 'wagmi/connectors/metaMask'
import { InjectedConnector } from 'wagmi/connectors/injected'

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [xLayer],
  [publicProvider()]
)

const config = createConfig({
  autoConnect: true,
  connectors: [
    new MetaMaskConnector({ chains }),
    new InjectedConnector({ chains }),
  ],
  publicClient,
  webSocketPublicClient,
})

export function Providers({ children }) {
  return <WagmiConfig config={config}>{children}</WagmiConfig>
}
