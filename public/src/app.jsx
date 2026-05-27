/* global React, ReactDOM, Lobby, SnakeGame, BlobGame, MergeGame,
          MongeonGame, MonclashGame, MonabaGame, MoncardsGame, MonpartyGame,
          ChatPanel, useWallet, useTwitter, ToastStack */
// Moncade root — hash-routed.

const { useState, useEffect, useCallback } = React;

const ROUTES = ['snake', 'blob', 'monerge', 'mongeon', 'monclash', 'monaba', 'moncards', 'monparty'];

function App() {
  const wallet = useWallet();
  const twitter = useTwitter();
  const [route, setRoute] = useState(getRouteFromHash);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRoom, setChatRoom] = useState('lobby');

  useEffect(() => {
    const onHash = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goTo = useCallback((r) => {
    window.location.hash = r === 'lobby' ? '#/' : `#/${r}`;
  }, []);

  const onPlay = useCallback((cab) => {
    if (cab.external) {
      window.open(cab.external, '_blank', 'noopener');
      return;
    }
    goTo(cab.id);
    // when entering a game, surface that game's chat room
    if (cab.id) setChatRoom(cab.id);
  }, [goTo]);

  // Sync chat room with game route automatically (without forcing chat open)
  useEffect(() => {
    if (route !== 'lobby' && ROUTES.includes(route)) setChatRoom(route);
  }, [route]);

  // Smoothly hide the backdrop sun when in-game.
  useEffect(() => {
    const bd = document.querySelector('.arcade-backdrop');
    if (!bd) return;
    bd.style.opacity = (route === 'lobby') ? '1' : '0.35';
  }, [route]);

  const gameComp = {
    snake:    SnakeGame,
    blob:     BlobGame,
    monerge:  MergeGame,
    mongeon:  MongeonGame,
    monclash: MonclashGame,
    monaba:   MonabaGame,
    moncards: MoncardsGame,
    monparty: MonpartyGame,
  }[route];

  return (
    <>
      {route === 'lobby' && (
        <Lobby
          wallet={wallet}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          onPlay={onPlay}
          twitter={twitter}
          onConnectTwitter={twitter.connect}
          onDisconnectTwitter={twitter.disconnect}
          chatOpen={chatOpen}
          setChatOpen={setChatOpen}
          chatRoom={chatRoom}
          setChatRoom={setChatRoom}
        />
      )}
      {gameComp && (
        <>
          {React.createElement(gameComp, { wallet, onExit: () => goTo('lobby') })}
          <button className="ingame-chat-tab" onClick={() => setChatOpen((o) => !o)}>
            <span className="dot live"></span>
            {chatOpen ? 'Hide chat' : 'Open chat'}
          </button>
          {chatOpen && (
            <ChatPanel
              twitter={twitter}
              wallet={wallet}
              onConnectTwitter={twitter.connect}
              onDisconnectTwitter={twitter.disconnect}
              currentRoom={chatRoom}
              setCurrentRoom={setChatRoom}
              onClose={() => setChatOpen(false)}
            />
          )}
        </>
      )}
      <ToastStack />
    </>
  );
}

function getRouteFromHash() {
  const h = (window.location.hash || '').replace(/^#\/?/, '');
  if (ROUTES.includes(h)) return h;
  return 'lobby';
}

ReactDOM.createRoot(document.getElementById('root').appendChild(document.createElement('div'))).render(<App />);
