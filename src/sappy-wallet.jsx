import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DynamicContextProvider,
  DynamicWidget,
  dynamicEvents,
  useDynamicContext,
  useDynamicModals,
  useSocialAccounts,
  useUserWallets,
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { ProviderEnum } from '@dynamic-labs/sdk-api-core';

const SAPPY_DYNAMIC_ENV_ID = window.SAPPY_DYNAMIC_ENV_ID || import.meta.env.VITE_SAPPY_DYNAMIC_ENV_ID || '7f5ed078-ee9f-49aa-b9d6-8a90434aaf40';
const DYNAMIC_AUTH_OPTIONS = {
  initializeWalletConnect: true,
  clearErrors: true,
  performMultiWalletChecks: false,
  authMode: 'connect-and-sign',
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

function fallbackOpenDynamicSocial(provider) {
  window.__sappyPendingDynamicSocial = provider || 'twitter';
  window.dispatchEvent(new CustomEvent('sappy-wallet-status', {
    detail: { status: `Dynamic ${provider || 'social'} connect is loading. Try again in a moment.` },
  }));
}
fallbackOpenDynamicSocial.isFallback = true;
window.sappyOpenDynamicSocial = fallbackOpenDynamicSocial;

const settings = {
  appName: 'Sappy Sealfolio',
  appLogoUrl: `${window.location.origin}/sappy/assets/sappy-seal-emoji.webp`,
  apiBaseUrl: `${window.location.origin}/dynamic-api`,
  environmentId: SAPPY_DYNAMIC_ENV_ID,
  initialAuthenticationMode: 'connect-and-sign',
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

const SOCIAL_PROVIDERS = {
  discord: ProviderEnum.Discord,
  x: ProviderEnum.Twitter,
  twitter: ProviderEnum.Twitter,
};

function socialDetail(provider, account) {
  const handle = account?.username || account?.publicIdentifier || account?.displayName || '';
  const accountId = account?.accountId || account?.id || '';
  return {
    provider,
    accountId,
    avatar: account?.avatar || '',
    displayName: account?.displayName || handle,
    handle: handle ? handle.replace(/^@/, '') : '',
    publicIdentifier: account?.publicIdentifier || '',
    connected: Boolean(accountId || handle),
    source: 'dynamic',
  };
}

function SappyDynamicBridge() {
  const { setShowAuthFlow, handleLogOut, user, primaryWallet } = useDynamicContext();
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const {
    getLinkedAccountInformation,
    getLinkedAccounts,
    linkSocialAccount,
    signInWithSocialAccount,
  } = useSocialAccounts({
    onError: (error) => {
      const message = error?.message || error?.code || 'Dynamic social connect needs another try.';
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: message } }));
    },
  });
  const wallets = useUserWallets();

  const clearLocalWallet = () => {
    try {
      localStorage.removeItem('sappy_wallet');
      localStorage.removeItem('sappy_wallet_label');
    } catch (_) {}
  };

  useEffect(() => {
    const openWallet = () => {
      try {
        sessionStorage.setItem('sappy_dynamic_connecting', String(Date.now()));
        sessionStorage.setItem('sappy_dynamic_next', window.location.href);
      } catch (_) {}
      const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
      if (authenticated) {
        setShowLinkNewWalletModal?.(true);
        return;
      }
      setShowAuthFlow?.(true, DYNAMIC_AUTH_OPTIONS);
    };
    window.sappyOpenDynamic = openWallet;
    window.sappyLogoutDynamic = async () => {
      await handleLogOut?.();
      window.dispatchEvent(new CustomEvent('sappy-wallet-connected', { detail: { address: '' } }));
    };
    const openSocial = async (providerKey) => {
      const provider = SOCIAL_PROVIDERS[String(providerKey || '').toLowerCase()];
      if (!provider) {
        window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'That Dynamic social provider is not supported yet.' } }));
        return;
      }
      try {
        sessionStorage.setItem(`sappy_dynamic_${provider}_connecting`, String(Date.now()));
        sessionStorage.setItem('sappy_dynamic_next', window.location.href);
      } catch (_) {}
      const existing = getLinkedAccountInformation?.(provider) || getLinkedAccounts?.(provider)?.[0];
      if (existing) {
        window.dispatchEvent(new CustomEvent('sappy-social-connected', { detail: socialDetail(provider, existing) }));
        return;
      }
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: `Opening Dynamic ${provider === ProviderEnum.Twitter ? 'X' : 'Discord'} connect...` } }));
      const options = {
        forcePopup: true,
        redirectUrl: window.location.href,
        showWidgetAfterConnection: false,
      };
      if (user || primaryWallet?.address || wallets?.length) {
        await linkSocialAccount?.(provider, options);
      } else {
        await signInWithSocialAccount?.(provider, options);
      }
      window.setTimeout(() => {
        const account = getLinkedAccountInformation?.(provider) || getLinkedAccounts?.(provider)?.[0];
        if (account) {
          window.dispatchEvent(new CustomEvent('sappy-social-connected', { detail: socialDetail(provider, account) }));
        } else {
          window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: `${provider === ProviderEnum.Twitter ? 'X' : 'Discord'} connect did not finish. Complete it in Dynamic and try again.` } }));
        }
      }, 500);
    };
    openSocial.isFallback = false;
    window.sappyOpenDynamicSocial = openSocial;
    const onWalletRequest = () => openWallet();
    const onSocialRequest = (event) => openSocial(event.detail?.provider || event.detail);
    window.addEventListener('sappy-dynamic-wallet-request', onWalletRequest);
    window.addEventListener('sappy-dynamic-social-request', onSocialRequest);
    const pendingSocial = window.__sappyPendingDynamicSocial;
    if (pendingSocial) {
      delete window.__sappyPendingDynamicSocial;
      window.setTimeout(() => openSocial(pendingSocial), 0);
    }
    window.dispatchEvent(new CustomEvent('sappy-dynamic-ready'));
    return () => {
      window.removeEventListener('sappy-dynamic-wallet-request', onWalletRequest);
      window.removeEventListener('sappy-dynamic-social-request', onSocialRequest);
      window.sappyOpenDynamic = fallbackOpenDynamic;
      window.sappyOpenDynamicSocial = fallbackOpenDynamicSocial;
      delete window.sappyLogoutDynamic;
    };
  }, [setShowAuthFlow, setShowLinkNewWalletModal, handleLogOut, user, primaryWallet, wallets, getLinkedAccountInformation, getLinkedAccounts, linkSocialAccount, signInWithSocialAccount]);

  useEffect(() => {
    [ProviderEnum.Twitter, ProviderEnum.Discord].forEach((provider) => {
      const account = getLinkedAccountInformation?.(provider) || getLinkedAccounts?.(provider)?.[0];
      if (account) {
        window.dispatchEvent(new CustomEvent('sappy-social-connected', { detail: socialDetail(provider, account) }));
      }
    });
  }, [user, getLinkedAccountInformation, getLinkedAccounts]);

  useEffect(() => {
    clearLocalWallet();
  }, [primaryWallet, wallets]);

  useEffect(() => {
    const wallet = wallets?.find?.((item) => /^EVM|ETH$/i.test(String(item?.chain || ''))) || wallets?.[0] || primaryWallet;
    if (!wallet?.address) return;
    let next = '';
    try {
      next = sessionStorage.getItem('sappy_dynamic_next') || '';
      sessionStorage.removeItem('sappy_dynamic_connecting');
      sessionStorage.removeItem('sappy_dynamic_next');
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('sappy-wallet-connected', {
      detail: { address: wallet.address, label: short(wallet.address), source: 'dynamic' },
    }));
    if (next && next !== window.location.href && next.startsWith(window.location.origin)) {
      window.location.href = next;
    }
  }, [primaryWallet, wallets]);

  useEffect(() => {
    const syncFromDynamic = (params) => {
      const userWallets = Array.isArray(params?.userWallets) ? params.userWallets : Array.isArray(params) ? params : [];
      const wallet = userWallets?.find?.((item) => /^EVM|ETH$/i.test(String(item?.chain || ''))) || userWallets?.[0] || params?.wallet || params?.primaryWallet;
      if (wallet?.address) {
        window.dispatchEvent(new CustomEvent('sappy-wallet-connected', {
          detail: { address: wallet.address, label: short(wallet.address), source: 'dynamic' },
        }));
      }
    };
    try { dynamicEvents.on('userWalletsChanged', syncFromDynamic); } catch (_) {}
    const syncPrimaryWallet = (wallet) => syncFromDynamic({ wallet });
    const syncWalletFailure = () => {
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic wallet connect did not finish. Please try again.' } }));
    };
    try { dynamicEvents.on('userWalletsPopulated', syncFromDynamic); } catch (_) {}
    try { dynamicEvents.on('primaryWalletChanged', syncPrimaryWallet); } catch (_) {}
    try { dynamicEvents.on('walletAdded', (_wallet, userWallets) => syncFromDynamic({ userWallets })); } catch (_) {}
    try { dynamicEvents.on('walletRemoved', (_wallet, userWallets) => syncFromDynamic({ userWallets })); } catch (_) {}
    try { dynamicEvents.on('walletConnectionFailed', syncWalletFailure); } catch (_) {}
    return () => {
      try { dynamicEvents.off('userWalletsChanged', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('userWalletsPopulated', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('primaryWalletChanged', syncPrimaryWallet); } catch (_) {}
      try { dynamicEvents.off('walletAdded', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('walletRemoved', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('walletConnectionFailed', syncWalletFailure); } catch (_) {}
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
