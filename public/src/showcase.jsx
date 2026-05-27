/* global React */
// Moncade — real buildanything.so/showcase feed.
// Data scraped from https://buildanything.so/showcase on 2026-05-23.
// To refresh: re-fetch and replace SHOWCASE_FEED (slug is the URL-tail).

const { useState, useMemo } = React;

const SHOWCASE_FEED = [
  { slug: 'mkr-global-83db',                                           title: 'MKR Global',                                                  author: 'mkr-web',              category: 'Mainnet', votes: 8, comments: 0 },
  { slug: '10k-squad-squad-coins-95e1',                                title: '10k squad — Squad Coins',                                     author: '0xaquar',              category: 'Mainnet', votes: 8, comments: 1 },
  { slug: 'flipnago-59d5',                                             title: 'FlipNAGO',                                                    author: 'akba',                 category: 'Hosted',  votes: 7, comments: 0 },
  { slug: 'squad-verse-a2e4',                                          title: 'Squad Verse',                                                 author: 'viletime',             category: 'Mainnet', votes: 7, comments: 0 },
  { slug: '10k-squad-identity-mint-0bfe',                              title: '10k Squad Identity Mint',                                     author: '0xaquar',              category: 'Mainnet', votes: 7, comments: 0 },
  { slug: 'chog-snow-heist-9165',                                      title: 'CHOG SNOW HEIST',                                             author: 'levi',                 category: 'Mainnet', votes: 6, comments: 3 },
  { slug: 'nompay-4266',                                               title: 'Nompay',                                                      author: '0xaquar',              category: 'Testnet', votes: 6, comments: 0 },
  { slug: '10ksquad-mon-prediction-market-85f7',                       title: '10ksquad MON prediction market',                              author: '0xaquar',              category: 'Mainnet', votes: 4, comments: 0 },
  { slug: 'monad-meme-factory-5749',                                   title: 'monad meme factory',                                          author: 'shaikmuneeb',          category: 'Hosted',  votes: 4, comments: 2 },
  { slug: 'monad-merge-39aa',                                          title: 'Monad Merge',                                                 author: 'alexsun',              category: 'Hosted',  votes: 4, comments: 1 },
  { slug: 'monadgift-crypto-gifts-on-x-cba5',                          title: 'MONADGIFT — Crypto Gifts on X',                               author: 'azhen',                category: 'Hosted',  votes: 3, comments: 2 },
  { slug: 'monbird-d2cd',                                              title: 'MONBIRD',                                                     author: 'berry',                category: 'Mainnet', votes: 3, comments: 0 },
  { slug: 'clumsy-ms-paint-5ccf',                                      title: 'clumsy MS Paint',                                             author: 'levi',                 category: 'Hosted',  votes: 3, comments: 0 },
  { slug: 'bobble-trouble-squad-048d',                                 title: 'Bobble Trouble Squad!',                                       author: 'livingliketheboss',    category: 'Hosted',  votes: 3, comments: 0 },
  { slug: 'nadfun-dca-bot-41bd',                                       title: 'NadFun DCA Bot',                                              author: 'maks-coin',            category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'bullet-beak-squad-7f2f',                                    title: 'BULLET BEAK SQUAD',                                           author: 'maks-coin',            category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'monad-wallet-tracker-monad-tracker-5e26',                   title: 'Monad wallet tracker / Monad Tracker',                        author: 'naan',                 category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'monbird-4697',                                              title: 'MONBIRD',                                                     author: 'berry',                category: 'Testnet', votes: 1, comments: 0 },
  { slug: 'monad-pvp-7669',                                            title: 'Monad PvP',                                                   author: '0xaquar',              category: 'Mainnet', votes: 1, comments: 1 },
  { slug: 'monad-mogs-c7a9',                                           title: 'Monad Mogs',                                                  author: 'siyabald',             category: 'Mainnet', votes: 1, comments: 0 },
  { slug: 'chain-detective-fa05',                                      title: 'chain_detective',                                             author: 'swindle',              category: 'Testnet', votes: 1, comments: 0 },
  { slug: 'asteroid-shooting-game-33f4',                               title: 'Asteroid shooting game',                                      author: 'oxchuks',              category: 'Testnet', votes: 1, comments: 1 },
  { slug: 'parrot-card-b71d',                                          title: 'Parrot Card',                                                 author: 'kaivaneth',            category: 'Hosted',  votes: 1, comments: 1 },
  { slug: 'squinder-3813',                                             title: 'Squinder',                                                    author: 'footooree',            category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'squadfun-d26b',                                             title: 'SquadFun',                                                    author: 'elias',                category: 'Testnet', votes: 1, comments: 0 },
  { slug: 'alpha-leak-8992',                                           title: 'Alpha Leak',                                                  author: 'slatro',               category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'zigzagmon-catch-169a',                                      title: 'ZigZagMon Catch',                                             author: 'mitchell-collingridge',category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'pacmonad-629e',                                             title: 'pacmonad',                                                    author: 'rai',                  category: 'Hosted',  votes: 1, comments: 0 },
  { slug: 'social-momentum-9382',                                      title: 'Social Momentum',                                             author: 'mdan',                 category: 'Mainnet', votes: 1, comments: 1 },
  { slug: 'monad-iq-test-by-youtrix-0005',                             title: 'Monad IQ test',                                               author: 'youtrix',              category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'monad-token-tracke-acc8',                                   title: 'Monad Token Tracker',                                         author: 'azhen',                category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'gamon-game-on-monad-bet-to-burn-71be',                      title: 'GAMON — Bet to Burn',                                         author: 'azhen',                category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'send-any-token-d1f0',                                       title: 'SEND ANY TOKEN',                                              author: 'azhen',                category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'mon-batch-sender-512d',                                     title: 'MON BATCH SENDER',                                            author: 'azhen',                category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'squad-games-arcade-hub-fab3',                               title: 'Squad Games Arcade Hub',                                      author: 'macho',                category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'bob-tracker-7a69',                                          title: '$BOB Tracker',                                                author: 'maks-coin',            category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'chog-meme-finder-378d',                                     title: 'Chog Meme-finder',                                            author: 'tranitox',             category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'orbit-commando-08c6',                                       title: 'Orbit Commando',                                              author: 'atubulated',           category: 'Testnet', votes: 0, comments: 0 },
  { slug: 'squad-gallery-d78d',                                        title: 'SQUAD GALLERY',                                               author: 'maha81',               category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'confess-your-love-and-support-for-monad-community-members-dd95', title: 'Confess your love for Monad community',                  author: 'aedan',                category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'barzakh-ai-8ff8',                                           title: 'Barzakh AI',                                                  author: 'kafir',                category: 'Mainnet', votes: 0, comments: 0 },
  { slug: 'lofi-focus-3407',                                           title: 'Lofi-Focus',                                                  author: 'the-bell',             category: 'Testnet', votes: 0, comments: 0 },
  { slug: 'guess-the-monad-mascot-0c97',                               title: 'GUESS THE MONAD MASCOT',                                      author: '0xmjfmjf',             category: 'Mainnet', votes: 0, comments: 0 },
  { slug: '10k-squad-pairing-lab-7826',                                title: '10k Squad Pairing Lab',                                       author: 'mr-wolf',              category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'monad-radar-meme-25fd',                                     title: 'Monad radar meme',                                            author: 'phong-ngo',            category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'squad-pay-64b1',                                            title: 'Squad Pay',                                                   author: 'romulo',               category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'monad-project-directory-9b02',                              title: 'Monad Project Directory',                                     author: 'mr-wolf',              category: 'Hosted',  votes: 0, comments: 0 },
  { slug: 'monad-breakout-f838',                                       title: 'Monad breakout',                                              author: 'samirystememon',       category: 'Hosted',  votes: 0, comments: 0 },
];

// Generate a deterministic color per slug so cards have visual identity.
function colorOf(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const palette = ['#9F7CFF', '#FF4FA1', '#8CF7F0', '#FFE66D', '#2DBFB0', '#C27C46', '#7AC9E8', '#FF7BB1', '#7B49B7'];
  return palette[h % palette.length];
}

function ShowcaseCard({ item }) {
  const color = colorOf(item.slug);
  const url = `https://buildanything.so/showcase/${item.slug}`;
  const cat = item.category.toLowerCase();
  return (
    <a className="sc-card" href={url} target="_blank" rel="noopener noreferrer">
      <div className="sc-art" style={{ background: `linear-gradient(135deg, ${color}33, ${color}0c)` }}>
        <span className={`sc-cat sc-cat-${cat}`}>{item.category}</span>
        <div className="sc-art-glyph" style={{ color }}>{item.title[0]}</div>
        <div className="sc-art-tile" style={{ borderColor: color + '66' }}></div>
        <div className="sc-art-grid" aria-hidden="true"></div>
      </div>
      <div className="sc-body">
        <h4 className="sc-title">{item.title}</h4>
        <div className="sc-by">@{item.author}</div>
        <div className="sc-foot">
          <span className="sc-stat sc-vote">▲ <strong>{item.votes}</strong></span>
          <span className="sc-stat">💬 <strong>{item.comments}</strong></span>
          <span className="sc-link">open ↗</span>
        </div>
      </div>
    </a>
  );
}

function ShowcaseGrid() {
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('top');
  const filtered = useMemo(() => {
    let list = SHOWCASE_FEED.slice();
    if (filter !== 'All') list = list.filter((x) => x.category === filter);
    if (sort === 'top') list.sort((a, b) => b.votes - a.votes);
    if (sort === 'new') list.reverse();
    return list;
  }, [filter, sort]);

  const counts = useMemo(() => {
    const c = { All: SHOWCASE_FEED.length, Hosted: 0, Testnet: 0, Mainnet: 0 };
    SHOWCASE_FEED.forEach((x) => { c[x.category]++; });
    return c;
  }, []);

  return (
    <div>
      <div className="sc-toolbar">
        <div className="sc-tabs">
          {['All', 'Hosted', 'Testnet', 'Mainnet'].map((cat) => (
            <button key={cat} className={`sc-tab ${filter === cat ? 'active' : ''}`} onClick={() => setFilter(cat)}>
              {cat} <span className="sc-tab-n">{counts[cat]}</span>
            </button>
          ))}
        </div>
        <div className="sc-sort">
          <button className={sort === 'top' ? 'active' : ''} onClick={() => setSort('top')}>Top</button>
          <button className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>New</button>
        </div>
      </div>
      <div className="sc-grid">
        {filtered.map((item) => <ShowcaseCard key={item.slug} item={item} />)}
      </div>
    </div>
  );
}

Object.assign(window, { ShowcaseGrid, SHOWCASE_FEED });
