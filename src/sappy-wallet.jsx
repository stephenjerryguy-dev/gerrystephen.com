import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DynamicContextProvider,
  DynamicWidget,
  dynamicEvents,
  useDynamicContext,
  useDynamicModals,
  useUserWallets,
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

const SAPPY_DYNAMIC_ENV_ID = window.SAPPY_DYNAMIC_ENV_ID || import.meta.env.VITE_SAPPY_DYNAMIC_ENV_ID || 'b62527ee-ec89-4502-86b3-37987b5720d4';
const DYNAMIC_AUTH_OPTIONS = {
  initializeWalletConnect: true,
  clearErrors: true,
  performMultiWalletChecks: false,
};
function fallbackOpenDynamic() {
  const widgetButton = document.querySelector('#sappy-dynamic-widget button');
  if (widgetButton) {
    widgetButton.click();
    return;
  }
  window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic is still loading. Try again in a moment.' } }));
}
window.sappyOpenDynamic = fallbackOpenDynamic;

const settings = {
  appName: 'Sappy Sealfolio',
  appLogoUrl: `${window.location.origin}/sappy/assets/sappy-seal-emoji.webp`,
  apiBaseUrl: `${window.location.origin}/dynamic-api`,
  environmentId: SAPPY_DYNAMIC_ENV_ID,
  initialAuthenticationMode: 'connect-only',
  enableVisitTrackingOnConnectOnly: true,
  theme: 'light',
  walletConnectors: [EthereumWalletConnectors],
  defaultNumberOfWalletsToShow: 8,
  events: {
    onAuthFlowOpen: () => window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic wallet modal open' } })),
    onAuthInit: () => window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Connecting with Dynamic' } })),
    onAuthSuccess: () => window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic wallet connected' } })),
    onAuthFailure: () => window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic connect needs another try' } })),
    onAuthCancel: () => window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Wallet connect cancelled' } })),
    onLogout: () => window.dispatchEvent(new CustomEvent('sappy-wallet-connected', { detail: { address: '' } })),
  },
  cssOverrides: `
    .dynamic-shadow-dom { --dynamic-font-family-primary: Archivo, Inter, system-ui, sans-serif; }
    :host {
      --dynamic-brand-primary-color: #1E93D6;
      --dynamic-brand-secondary-color: #3FB97C;
      --dynamic-connect-button-background: #1E93D6;
      --dynamic-connect-button-background-hover: #15689B;
      --dynamic-connect-button-color: #ffffff;
      --dynamic-button-primary-background: #1E93D6;
      --dynamic-border-radius: 16px;
    }
  `,
};

function short(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

function SappyDynamicBridge() {
  const { setShowAuthFlow, handleLogOut, user, primaryWallet } = useDynamicContext();
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const wallets = useUserWallets();

  useEffect(() => {
    window.sappyOpenDynamic = () => {
      const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
      if (authenticated) {
        setShowLinkNewWalletModal?.(true);
        return;
      }
      setShowAuthFlow?.(true, DYNAMIC_AUTH_OPTIONS);
    };
    window.sappyLogoutDynamic = async () => {
      await handleLogOut?.();
      window.dispatchEvent(new CustomEvent('sappy-wallet-connected', { detail: { address: '' } }));
    };
    window.dispatchEvent(new CustomEvent('sappy-dynamic-ready'));
    return () => {
      window.sappyOpenDynamic = fallbackOpenDynamic;
      delete window.sappyLogoutDynamic;
    };
  }, [setShowAuthFlow, setShowLinkNewWalletModal, handleLogOut, user, primaryWallet, wallets]);

  useEffect(() => {
    const wallet = wallets?.find?.((item) => /^EVM|ETH$/i.test(String(item?.chain || ''))) || wallets?.[0] || primaryWallet;
    if (!wallet?.address) return;
    window.dispatchEvent(new CustomEvent('sappy-wallet-connected', {
      detail: { address: wallet.address, label: short(wallet.address), source: 'dynamic' },
    }));
  }, [primaryWallet, wallets]);

  useEffect(() => {
    const syncFromDynamic = (params) => {
      const wallet = params?.userWallets?.find?.((item) => /^EVM|ETH$/i.test(String(item?.chain || ''))) || params?.userWallets?.[0];
      if (wallet?.address) {
        window.dispatchEvent(new CustomEvent('sappy-wallet-connected', {
          detail: { address: wallet.address, label: short(wallet.address), source: 'dynamic' },
        }));
      }
    };
    try { dynamicEvents.on('userWalletsChanged', syncFromDynamic); } catch (_) {}
    try { dynamicEvents.on('walletAdded', (_wallet, userWallets) => syncFromDynamic({ userWallets })); } catch (_) {}
    try { dynamicEvents.on('walletRemoved', (_wallet, userWallets) => syncFromDynamic({ userWallets })); } catch (_) {}
    return () => {
      try { dynamicEvents.off('userWalletsChanged', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('walletAdded', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('walletRemoved', syncFromDynamic); } catch (_) {}
    };
  }, []);

  return null;
}

function SappyWalletRoot() {
    return (
    <DynamicContextProvider settings={settings}>
      <div id="sappy-dynamic-widget" aria-hidden="true" style={{ position: 'fixed', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0.01 }}>
        <DynamicWidget />
      </div>
      <SappyDynamicBridge />
    </DynamicContextProvider>
  );
}

const mount = document.createElement('div');
mount.id = 'sappy-dynamic-root';
document.body.appendChild(mount);
createRoot(mount).render(<SappyWalletRoot />);
