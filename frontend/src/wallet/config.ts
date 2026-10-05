import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from '@wagmi/connectors'
import { supportedChains } from '../domain/chains'

export const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()
export const walletConfig = createConfig({
  chains: supportedChains,
  batch: { multicall: false }, // Native balance reads use eth_getBalance directly.
  connectors: [
    injected(),
    ...(walletConnectProjectId ? [walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: { name: 'Relay thesis router', description: 'Testnet wallet connection and transfer request review', url: window.location.origin, icons: [] },
    })] : []),
  ],
  transports: {
    [supportedChains[0].id]: http(undefined, { timeout: 12_000 }),
    [supportedChains[1].id]: http(undefined, { timeout: 12_000 }),
  },
})
