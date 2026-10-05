import { useEffect, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { useBalance, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from 'wagmi'
import { supportedChains } from '../domain/chains'
import { walletConnectProjectId } from './config'
import type { WalletSession } from '../domain/types'

export function useWalletSession(): WalletSession {
  const { address, chainId, connector, status } = useConnection()
  return { ecosystem: 'evm', address, chainId, connector: connector?.name, status }
}
export function WalletPanel() {
  const connection = useConnection()
  const connect = useConnect()
  const connectors = useConnectors()
  const disconnect = useDisconnect()
  const switchChain = useSwitchChain()
  const supported = supportedChains.find(chain => chain.id === connection.chainId)
  const balance = useBalance({ address: connection.address, chainId: supported?.id,
    query: { enabled: connection.status === 'connected' && !!supported, refetchInterval: 20_000, retry: 1 },
  })
  const [notice, setNotice] = useState('')
  const previous = useRef({ address: connection.address, chainId: connection.chainId })
  useEffect(() => {
    const messages = []
    if (previous.current.address && connection.address && previous.current.address !== connection.address) messages.push('Wallet account changed. Balance now follows the selected account.')
    if (previous.current.chainId && connection.chainId && previous.current.chainId !== connection.chainId) messages.push('Wallet network changed. Transfer form fields remain your manual choices.')
    if (messages.length) setNotice(messages.join(' '))
    if (connection.status === 'disconnected') setNotice('')
    previous.current = { address: connection.address, chainId: connection.chainId }
  }, [connection.address, connection.chainId, connection.status])
  const error = connect.error || switchChain.error || disconnect.error
  return <section className="wallet-panel" aria-label="Wallet connection">
    <div className="section-top"><h2>EVM wallet</h2><span className={`badge ${connection.isConnected ? 'good' : ''}`}><span className="dot" />{connection.status}</span></div>
    {connection.isConnected ? <>
      <p className="address">{connection.address}</p>
      <p className="muted">{connection.connector?.name} · {supported?.name ?? `Unsupported chain (${connection.chainId})`}</p>
      <div className="balance" aria-live="polite"><span>Native gas-token balance</span>
        {!supported ? <strong>Unavailable on this chain</strong> : balance.isError ? <span role="alert">Could not read balance. {balance.error.message}</span> : balance.isPending ? <strong>Reading {supported.name}…</strong> : balance.data ? <strong>{formatUnits(balance.data.value, balance.data.decimals)} {balance.data.symbol}</strong> : <strong>Balance unavailable</strong>}
        {supported && <small>{supported.name} · chain ID {supported.id}{balance.isFetching && !balance.isPending ? ' · refreshing' : ''}</small>}
      </div>
      {!supported && <p className="error" role="alert">This demo supports Base Sepolia and Arbitrum Sepolia. Switch to read a balance.</p>}
      <div className="actions">{supportedChains.filter(chain => chain.id !== connection.chainId).map(chain => <button className="secondary" key={chain.id} disabled={switchChain.isPending} onClick={() => { switchChain.reset(); switchChain.mutate({ chainId: chain.id }) }}>Switch to {chain.name}</button>)}
        {supported && <button className="secondary" onClick={() => void balance.refetch()} disabled={balance.isFetching}>Refresh balance</button>}
        <button className="text-button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Disconnect</button>
      </div>
    </> : <>
      <p className="muted">Connect to view your address and testnet ETH balance. Connection does not authorize a transfer.</p>
      <div className="actions">{connectors.map(connector => <button key={connector.uid} disabled={connect.isPending || connection.isReconnecting} onClick={() => { connect.reset(); connect.mutate({ connector }) }}>{connector.type === 'injected' ? 'Connect browser wallet' : connector.name}</button>)}</div>
      {connect.isPending && <p role="status">Waiting for wallet approval…</p>}
      {!walletConnectProjectId && <small>WalletConnect is unavailable until a project ID is set. Browser wallet connection works independently.</small>}
    </>}
    {error && <p className="error" role="alert">Wallet action failed or was rejected: {error.message}</p>}
    <p className="wallet-notice" role="status">{notice}</p>
  </section>
}
