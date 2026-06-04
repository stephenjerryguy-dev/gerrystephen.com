import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DynamicContextProvider,
  DynamicWidget,
  dynamicEvents,
  useDynamicContext,
  useDynamicModals,
  useRefreshUser,
  useSocialAccounts,
  useUserWallets,
} from '@dynamic-labs/sdk-react-core';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { ProviderEnum } from '@dynamic-labs/sdk-api-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { mainnet } from 'viem/chains';
import { createConfig, WagmiProvider } from 'wagmi';

const SAPPY_DYNAMIC_ENV_ID = window.SAPPY_DYNAMIC_ENV_ID || import.meta.env.VITE_SAPPY_DYNAMIC_ENV_ID || '7f5ed078-ee9f-49aa-b9d6-8a90434aaf40';
const wagmiConfig = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: false,
  transports: {
    [mainnet.id]: http(),
  },
});
const queryClient = new QueryClient();

function fallbackOpenDynamic() {
  const widgetButton = document.querySelector('#dynamic-widget')?.shadowRoot?.querySelector('button, [role="button"]')
    || document.querySelector('#sappy-dynamic-widget .dynamic-shadow-dom')?.shadowRoot?.querySelector('button, [role="button"]')
    || document.querySelector('#sappy-dynamic-widget button, #sappy-dynamic-widget [role="button"], #dynamic-widget button, #dynamic-widget [role="button"]');
  if (widgetButton) {
    widgetButton.click();
    return;
  }
  const widgetHost = document.querySelector('#dynamic-widget, #sappy-dynamic-widget .dynamic-shadow-dom');
  if (widgetHost) {
    widgetHost.click();
    return;
  }
  window.dispatchEvent(new CustomEvent('sappy-dynamic-init-failed', {
    detail: { status: 'Dynamic did not render yet. Check the Dynamic environment domain settings and reload.' },
  }));
}
window.sappyOpenDynamic = fallbackOpenDynamic;

function dynamicModalVisible() {
  return Boolean(
    document.querySelector('[data-testid*="dynamic"], [class*="dynamic-modal"], [class*="DynamicModal"], [id*="dynamic-modal"]')
  );
}

function fallbackOpenDynamicSocial(provider) {
  window.__sappyPendingDynamicSocial = provider || 'twitter';
  window.dispatchEvent(new CustomEvent('sappy-wallet-status', {
    detail: { status: `Dynamic ${provider || 'social'} connect is loading. Try again in a moment.` },
  }));
}
fallbackOpenDynamicSocial.isFallback = true;
window.sappyOpenDynamicSocial = fallbackOpenDynamicSocial;

function reportDynamicInitIssue(status) {
  window.dispatchEvent(new CustomEvent('sappy-dynamic-init-failed', {
    detail: { status: status || 'Dynamic could not initialize for this page.' },
  }));
}

window.addEventListener('unhandledrejection', (event) => {
  const message = String(event?.reason?.message || event?.reason || '');
  if (/DynamicSDK|sdkSettings|prefetch nonces|getEnvironmentSettings|dynamicauth|Failed to fetch/i.test(message)) {
    reportDynamicInitIssue('Dynamic API failed before the widget rendered. Make sure this exact domain is allowed in Dynamic.');
  }
});

window.addEventListener('error', (event) => {
  const message = String(event?.message || '');
  if (/DynamicSDK|sdkSettings|prefetch nonces|getEnvironmentSettings|dynamicauth|Failed to fetch/i.test(message)) {
    reportDynamicInitIssue('Dynamic API failed before the widget rendered. Make sure this exact domain is allowed in Dynamic.');
  }
});

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
    onAuthFlowOpen: () => {
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic wallet modal open' } }));
    },
    onAuthInit: () => window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Connecting with Dynamic' } })),
    onAuthSuccess: () => {
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic wallet connected' } }));
    },
    onAuthFailure: () => {
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Dynamic connect needs another try' } }));
    },
    onAuthCancel: () => {
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Wallet connect cancelled' } }));
    },
    onLogout: () => {
      window.dispatchEvent(new CustomEvent('sappy-wallet-connected', { detail: { address: '' } }));
    },
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

function socialDetailFromUser(provider, dynamicUser) {
  const credential = dynamicUser?.verifiedCredentials?.find?.((item) => (
    item?.format === 'oauth' && (item?.oauthProvider === provider || item?.provider === provider)
  ));
  if (!credential) return null;
  return socialDetail(provider, {
    accountId: credential.oauthAccountId,
    avatar: credential.oauthAccountPhotos?.[0],
    displayName: credential.oauthDisplayName,
    id: credential.id,
    publicIdentifier: credential.publicIdentifier,
    username: credential.oauthUsername,
  });
}

function SappyDynamicBridge() {
  const { setShowAuthFlow, handleLogOut, user, primaryWallet } = useDynamicContext();
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const refreshUser = useRefreshUser();
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
  const allowThisPageAuthRef = useRef(false);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      const widgetHost = document.querySelector('#dynamic-widget, #sappy-dynamic-widget .dynamic-shadow-dom');
      const visibleHost = widgetHost && widgetHost.getBoundingClientRect?.().width > 20 && widgetHost.getBoundingClientRect?.().height > 20;
      if (!visibleHost) {
        reportDynamicInitIssue('Dynamic widget did not render. Check Dynamic allowed domains and enabled wallet providers.');
      }
    }, 4000);
    return () => {
      window.clearTimeout(initTimer);
    };
  }, []);

  const clearLocalWallet = () => {
    try {
      localStorage.removeItem('sappy_wallet');
      localStorage.removeItem('sappy_wallet_label');
    } catch (_) {}
  };

  const hasRecentDynamicFlow = () => {
    try {
      const markers = [
        'sappy_dynamic_connecting',
        `sappy_dynamic_${ProviderEnum.Twitter}_connecting`,
        `sappy_dynamic_${ProviderEnum.Discord}_connecting`,
      ];
      return markers.some((key) => {
        const timestamp = Number(sessionStorage.getItem(key) || 0);
        return timestamp && Date.now() - timestamp < 180000;
      });
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
    if (!authenticated) return;
    if (hasRecentDynamicFlow()) {
      allowThisPageAuthRef.current = true;
      return;
    }
    if (!allowThisPageAuthRef.current) {
      handleLogOut?.();
      clearLocalWallet();
      window.dispatchEvent(new CustomEvent('sappy-wallet-connected', { detail: { address: '' } }));
      window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Session reset. Connect and sign again to claim your Sealfolio.' } }));
    }
  }, [user, primaryWallet, wallets, handleLogOut]);

  useEffect(() => {
    const clearOnPageExit = () => {
      if (hasRecentDynamicFlow()) return;
      clearLocalWallet();
      if (user || primaryWallet?.address || wallets?.length) handleLogOut?.();
    };
    window.addEventListener('pagehide', clearOnPageExit);
    return () => window.removeEventListener('pagehide', clearOnPageExit);
  }, [user, primaryWallet, wallets, handleLogOut]);

  useEffect(() => {
    const openWallet = () => {
      delete window.__sappyPendingDynamicWallet;
      try {
        sessionStorage.setItem('sappy_dynamic_connecting', String(Date.now()));
        sessionStorage.setItem('sappy_dynamic_next', window.location.href);
      } catch (_) {}
      allowThisPageAuthRef.current = true;
      const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
      if (authenticated) {
        setShowLinkNewWalletModal?.(true);
        window.setTimeout(() => {
          if (!dynamicModalVisible()) fallbackOpenDynamic();
        }, 250);
        return;
      }
      setShowAuthFlow?.(true);
      window.setTimeout(() => {
        if (!dynamicModalVisible()) fallbackOpenDynamic();
      }, 250);
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
      const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
      if (!authenticated) {
        window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: 'Create your Sealfolio with your wallet first. Then link X or Discord for next-time login.' } }));
        openWallet();
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
      await linkSocialAccount?.(provider, options);
      const label = provider === ProviderEnum.Twitter ? 'X' : 'Discord';
      let connected = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const refreshedUser = await refreshUser?.().catch(() => null);
        const refreshed = socialDetailFromUser(provider, refreshedUser);
        const account = refreshed ? null : (getLinkedAccountInformation?.(provider) || getLinkedAccounts?.(provider)?.[0]);
        const detail = refreshed || socialDetail(provider, account);
        if (detail.connected) {
          connected = true;
          window.dispatchEvent(new CustomEvent('sappy-social-connected', { detail }));
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (!connected) {
        window.dispatchEvent(new CustomEvent('sappy-wallet-status', { detail: { status: `${label} opened in Dynamic. Finish the popup and the linked profile will appear here.` } }));
      }
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
    if (window.__sappyPendingDynamicWallet) {
      window.setTimeout(() => openWallet(), 0);
    }
    window.dispatchEvent(new CustomEvent('sappy-dynamic-ready'));
    return () => {
      window.removeEventListener('sappy-dynamic-wallet-request', onWalletRequest);
      window.removeEventListener('sappy-dynamic-social-request', onSocialRequest);
      window.sappyOpenDynamic = fallbackOpenDynamic;
      window.sappyOpenDynamicSocial = fallbackOpenDynamicSocial;
      delete window.sappyLogoutDynamic;
    };
  }, [setShowAuthFlow, setShowLinkNewWalletModal, handleLogOut, user, primaryWallet, wallets, getLinkedAccountInformation, getLinkedAccounts, linkSocialAccount, signInWithSocialAccount, refreshUser]);

  useEffect(() => {
    [ProviderEnum.Twitter, ProviderEnum.Discord].forEach((provider) => {
      const account = getLinkedAccountInformation?.(provider) || getLinkedAccounts?.(provider)?.[0];
      if (account) {
        window.dispatchEvent(new CustomEvent('sappy-social-connected', { detail: socialDetail(provider, account) }));
      }
    });
  }, [user, getLinkedAccountInformation, getLinkedAccounts]);

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
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            <div id="sappy-dynamic-widget" className="sappy-dynamic-dock">
              <DynamicWidget />
            </div>
            <SappyDynamicBridge />
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}

const mount = document.createElement('div');
mount.id = 'sappy-dynamic-root';
document.body.appendChild(mount);
createRoot(mount).render(<SappyWalletRoot />);
