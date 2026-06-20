import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DynamicContextProvider,
  dynamicEvents,
  useDynamicContext,
  useDynamicModals,
  useUserWallets
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { defineChain } from 'viem';

const ENVIRONMENT_ID = '794ab3a5-8cf5-43fb-963a-9a81e4a3dae7';
const MONAD_NETWORK = {
  chainId: 143,
  chainName: 'Monad Mainnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.monad.xyz'],
  blockExplorerUrls: ['https://monadscan.com']
};
const monadMainnet = defineChain({
  id: MONAD_NETWORK.chainId,
  name: MONAD_NETWORK.chainName,
  nativeCurrency: MONAD_NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: MONAD_NETWORK.rpcUrls },
    public: { http: MONAD_NETWORK.rpcUrls }
  },
  blockExplorers: {
    default: { name: 'MonadScan', url: MONAD_NETWORK.blockExplorerUrls[0] }
  }
});
const queryClient = new QueryClient();
const wagmiConfig = createConfig({
  chains: [monadMainnet],
  transports: { [monadMainnet.id]: http(MONAD_NETWORK.rpcUrls[0]) }
});

function walletsFilter(options = []) {
  return (Array.isArray(options) ? options : []).filter((option) => {
    const supported = option?.walletConnector?.supportedChains;
    if (Array.isArray(supported) && supported.includes('EVM')) return true;
    const key = String(option?.key ?? option?.walletKey ?? '').toLowerCase();
    const group = String(option?.chainGroup ?? option?.walletGroup ?? '').toLowerCase();
    return group.includes('evm') || group.includes('eth') || /metamask|walletconnect|coinbase|rainbow|rabby|zerion|trust|okx|phantom/.test(key);
  });
}

const settings = {
  appName: 'Monerge',
  appLogoUrl: `${window.location.origin}/assets/monerge-icon-512.png`,
  environmentId: ENVIRONMENT_ID,
  initialAuthenticationMode: 'connect-and-sign',
  enableVisitTrackingOnConnectOnly: true,
  theme: 'dark',
  defaultNumberOfWalletsToShow: 8,
  overrides: {
    evmNetworks: [{
      blockExplorerUrls: MONAD_NETWORK.blockExplorerUrls,
      chainId: MONAD_NETWORK.chainId,
      chainName: MONAD_NETWORK.chainName,
      key: 'monad',
      name: MONAD_NETWORK.chainName,
      nativeCurrency: MONAD_NETWORK.nativeCurrency,
      networkId: MONAD_NETWORK.chainId,
      rpcUrls: MONAD_NETWORK.rpcUrls,
      shortName: 'monad',
      vanityName: 'Monad'
    }]
  },
  walletConnectors: [EthereumWalletConnectors],
  walletsFilter,
  events: {
    onAuthFlowOpen: () => emitStatus('Dynamic wallet modal open'),
    onAuthInit: () => emitStatus('Connecting with Dynamic'),
    onAuthSuccess: () => emitStatus('Dynamic wallet connected'),
    onAuthFailure: () => emitStatus('Dynamic connect needs another try'),
    onAuthCancel: () => emitStatus('Wallet connect cancelled'),
    onLogout: () => emitWallet({ address: '' })
  },
  cssOverrides: `
    .dynamic-shadow-dom { --dynamic-font-family-primary: inherit; }
    :host {
      --dynamic-brand-primary-color: #8f6bff;
      --dynamic-brand-secondary-color: #7fd2e7;
      --dynamic-background-color: #160f36;
      --dynamic-base-1: #160f36;
      --dynamic-base-2: #24184f;
      --dynamic-base-3: #332263;
      --dynamic-base-4: #493078;
      --dynamic-overlay: rgba(8,7,24,0.76);
      --dynamic-modal-backdrop-background: rgba(8,7,24,0.76);
      --dynamic-header-background: #160f36;
      --dynamic-footer-background: #160f36;
      --dynamic-wallet-list-tile-background: rgba(255,255,255,0.08);
      --dynamic-wallet-list-tile-background-hover: rgba(127,210,231,0.18);
      --dynamic-wallet-list-tile-border: 1px solid rgba(238,246,251,0.16);
      --dynamic-wallet-list-tile-border-hover: 1px solid rgba(127,210,231,0.38);
      --dynamic-connect-button-background: linear-gradient(135deg, #8f6bff, #7fd2e7);
      --dynamic-connect-button-background-hover: linear-gradient(135deg, #a68bff, #8cf7f0);
      --dynamic-connect-button-color: #0e1f2c;
      --dynamic-text-primary: #ffffff;
      --dynamic-text-primary-color: #ffffff;
      --dynamic-text-secondary: rgba(255,255,255,0.74);
      --dynamic-text-secondary-color: rgba(255,255,255,0.74);
      --dynamic-text-link: #7fd2e7;
      --dynamic-border-color: rgba(255,255,255,0.12);
      --dynamic-border-radius: 16px;
      --dynamic-shadow-down-3: 0 24px 48px rgba(0,0,0,0.55);
    }
  `
};

function emitStatus(status) {
  window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status } }));
}

function emitWallet(detail) {
  window.dispatchEvent(new CustomEvent('monerge-wallet', { detail }));
}

function clearWalletCache() {
  try {
    Object.keys(window.localStorage || {}).forEach((key) => {
      if (/^dynamic_|^@dynamic|walletconnect|wallet-connect|wc@|appkit|w3m/i.test(key)) {
        window.localStorage.removeItem(key);
      }
    });
  } catch (_) {}
}

function DynamicBridge() {
  const context = useDynamicContext();
  const { setShowAuthFlow, handleLogOut, user, primaryWallet, sdkHasLoaded, projectSettings, showAuthFlow } = context;
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const wallets = useUserWallets();

  useEffect(() => {
    const open = () => {
      const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
      if (authenticated && setShowLinkNewWalletModal) {
        setShowLinkNewWalletModal(true);
        return;
      }
      setShowAuthFlow?.(true, {
        initializeWalletConnect: true,
        clearErrors: true,
        performMultiWalletChecks: false
      });
    };
    window.__monergeWalletBridge = {
      open,
      logout: async () => {
        await handleLogOut?.();
        clearWalletCache();
      },
      session: () => ({ primaryWallet, user, sdkHasLoaded, projectSettings, showAuthFlow })
    };
    window.dispatchEvent(new Event('monerge-wallet-bridge-ready'));
    emitWallet({
      address: primaryWallet?.address || wallets?.[0]?.address || '',
      primaryWallet,
      user,
      sdkHasLoaded,
      projectSettings,
      showAuthFlow
    });
    return () => {
      if (window.__monergeWalletBridge?.open === open) delete window.__monergeWalletBridge;
    };
  }, [handleLogOut, primaryWallet, projectSettings, sdkHasLoaded, setShowAuthFlow, setShowLinkNewWalletModal, showAuthFlow, user, wallets]);

  useEffect(() => {
    const sync = (params) => {
      const userWallets = Array.isArray(params?.userWallets) ? params.userWallets : Array.isArray(params) ? params : [];
      const wallet = userWallets.find?.((item) => /^EVM|ETH$/i.test(String(item?.chain || ''))) || userWallets[0] || params?.wallet || params?.primaryWallet;
      emitWallet({ address: wallet?.address || '', primaryWallet: wallet, user, sdkHasLoaded, projectSettings, showAuthFlow });
    };
    const logout = () => emitWallet({ address: '' });
    const failed = () => emitStatus('Dynamic wallet connect did not finish. Please try again.');
    const primaryChanged = (wallet) => sync({ wallet });
    try { dynamicEvents.on('userWalletsChanged', sync); } catch (_) {}
    try { dynamicEvents.on('userWalletsPopulated', sync); } catch (_) {}
    try { dynamicEvents.on('primaryWalletChanged', primaryChanged); } catch (_) {}
    try { dynamicEvents.on('walletConnectionFailed', failed); } catch (_) {}
    try { dynamicEvents.on('logout', logout); } catch (_) {}
    return () => {
      try { dynamicEvents.off('userWalletsChanged', sync); } catch (_) {}
      try { dynamicEvents.off('userWalletsPopulated', sync); } catch (_) {}
      try { dynamicEvents.off('primaryWalletChanged', primaryChanged); } catch (_) {}
      try { dynamicEvents.off('walletConnectionFailed', failed); } catch (_) {}
      try { dynamicEvents.off('logout', logout); } catch (_) {}
    };
  }, [projectSettings, sdkHasLoaded, showAuthFlow, user]);

  return null;
}

function WalletHost() {
  return (
    <DynamicContextProvider settings={settings}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            <DynamicBridge />
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}

let mountPromise;

export function mountMonergeWallet() {
  if (window.__monergeWalletBridge) return Promise.resolve(window.__monergeWalletBridge);
  if (mountPromise) return mountPromise;
  mountPromise = new Promise((resolve, reject) => {
    const ready = () => {
      window.removeEventListener('monerge-wallet-bridge-ready', ready);
      resolve(window.__monergeWalletBridge);
    };
    window.addEventListener('monerge-wallet-bridge-ready', ready, { once: true });
    let host = document.getElementById('monerge-wallet-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'monerge-wallet-host';
      document.body.appendChild(host);
      createRoot(host).render(<WalletHost />);
    }
    window.setTimeout(() => {
      if (window.__monergeWalletBridge) ready();
      else reject(new Error('Dynamic wallet took too long to initialize.'));
    }, 10000);
  }).catch((error) => {
    mountPromise = undefined;
    throw error;
  });
  return mountPromise;
}

export async function openMonergeWallet() {
  const bridge = await mountMonergeWallet();
  bridge?.open?.();
}

export async function logoutMonergeWallet() {
  const bridge = window.__monergeWalletBridge || await mountMonergeWallet();
  await bridge?.logout?.();
}
