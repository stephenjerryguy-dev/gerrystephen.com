export type NavLink = { href: string; label: string; external?: boolean };

export const NAV_LINKS: NavLink[] = [
  { href: '#journey', label: 'Journey' },
  { href: '#nfts', label: 'Communities' },
  { href: '#inkfinity', label: 'Inkfinity' },
  { href: '#monerge', label: 'Biome' },
  { href: '#now', label: 'Now' },
  { href: '#ventures', label: 'Hospitality' },
  { href: 'https://sappy.gerrystephen.com', label: 'Sappy', external: true },
  { href: '#contact', label: 'Contact' },
];

export const HERO_VALUES = ['God first', 'Husband', 'Father', 'Builder'];

export const MARQUEE_ITEMS = [
  'gerrystephen.eth',
  'inkfinity canvas',
  'great terriers',
  'sappy seals',
  'pudgy penguins',
  'web3 since 2021',
  'building IRL',
  'hot weather, iced coffee',
];

export type TimelineEntry = { year: string; tag: string; body: string };

export const TIMELINE: TimelineEntry[] = [
  { year: '2021', tag: 'First NFT purchase · Sappy Seals', body: 'The rabbit hole opened through community, identity, and the feeling that ownership could become culture.' },
  { year: '2021', tag: 'Permanent work', body: 'ericgoodguy signed canvases, and gerrydoteth curated. Now the Inkfinity Canvas craft lives on-chain.' },
  { year: '2022', tag: 'The Guy standard', body: 'Fifteen years beside my dad taught me how real work gets scoped, built, and carried forward. After his passing, his legacy now lives on forever.' },
  { year: '2022', tag: 'Lil Pudgy chapter', body: 'I had a Lil Pudgy early, sold it, and kept circling the ecosystem from the outside.' },
  { year: '2023', tag: 'Community & tools', body: 'I kept showing up for Sappy Seals with constant memes across X, Instagram, TikTok, and YouTube Shorts while supporting the whole ecosystem. I still do.' },
  { year: '2024', tag: 'Zeppole Dolci Café', body: 'My wife and I launched Zeppole Dolci Café from scratch: a food, hospitality, and community layer that became a great addition to Blue Star, founded in 2018.' },
  { year: '2025', tag: 'AI expansion', body: 'The huge uptick in AI capability changed what I could build: operations, memes, trades, and Great Terriers, a collection I started in 2022.' },
  { year: '2026', tag: 'Actual Pudgy era', body: 'This is when I became an actual Pudgy Penguin holder. The iglu finally had its mascot.' },
];

export type InkPiece = { title: string; tag: string; note: string; image: string; featured?: boolean };

export const INKFINITY: InkPiece[] = [
  { title: 'NFTVisionary', tag: 'Featured', note: 'The piece that started it.', featured: true, image: '/assets/opt/inkfinity-visionary.webp' },
  { title: 'NuttyProfessor', tag: 'Canvas', note: 'Pen on paper. Signed E. Guy.', image: '/assets/opt/inkfinity-professor.webp' },
  { title: 'ThunderOfThoughts', tag: 'Canvas', note: 'A crowded mind, distilled.', image: '/assets/opt/inkfinity-thoughts.webp' },
];

export const STATS = [
  { value: 5, suffix: '', label: 'years on-chain' },
  { value: 15, suffix: '', label: 'years building beside Eric' },
  { value: 1, suffix: '', label: 'penguin in a flat cap' },
  { value: 40, suffix: '+', label: 'family construction craft' },
];

export type NowCard = { title: string; note: string; logo: string; alt: string; href: string; site?: string; tone: 'ice' | 'blue' | 'sand' | 'terrier' };

export const NOW_BUILDING: NowCard[] = [
  { title: 'AI Agents', note: 'Autonomous workers for hospitality ops, content systems, trading bots, and the useful glue between them.', site: 'gerrystephen.com/agents', logo: '/assets/opt/pudgy-penguin-cutout.webp', alt: 'Gerry Stephen Pudgy Penguin', href: '/agents', tone: 'ice' },
  { title: 'Blue Star Web3', note: 'Live now: ecosystem-holder benefits for vacation, worcation, and nomadic stays.', logo: '/assets/opt/bluestar-logo.webp', alt: 'Blue Star Apartments & Hotel logo', href: 'https://x.com/bluestarstay', tone: 'blue' },
  { title: 'Seal Stay', note: 'Where Web3 meets hospitality. Stay tuned for the next stay layer.', logo: '/assets/opt/seal-stay-logo.webp', alt: 'Seal Stay logo', href: 'https://x.com/sappylifestyle', tone: 'sand' },
  { title: 'Great Terriers', note: 'Coming soon: the AI-native collection featuring my dog, Reo. It started as a 2022 idea and keeps moving forward.', logo: '/assets/opt/great-terriers-coming-soon.webp', alt: 'Great Terriers coming soon artwork', href: 'https://x.com/greatterriers', tone: 'terrier' },
];

export type Monanimal = { name: string; note: string; image: string };

export const MONANIMALS: Monanimal[] = [
  { name: 'Chog', note: 'starter focus', image: '/assets/opt/chog-official-sprite.webp' },
  { name: 'Molandak', note: 'purple charge', image: '/assets/opt/molandak-official-sprite.webp' },
  { name: 'Mouch', note: 'quick reaction', image: '/assets/opt/mouch-sprite-tight.webp' },
  { name: 'Mokadel', note: 'deep-lore monanimal', image: '/assets/opt/mokadel-sprite-tight.webp' },
  { name: 'Salmonad', note: 'salmoposting power', image: '/assets/opt/salmonad-sprite-tight.webp' },
  { name: 'Emonad', note: 'final iglu state', image: '/assets/opt/emonad-sprite.webp' },
];

export const BUILDANYTHING_STATS = [
  { label: 'Total XP', value: '6,100' },
  { label: 'Lessons', value: '23' },
  { label: 'Tracks', value: '2' },
  { label: 'Student ID', value: '#1517' },
];

export type Venture = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  photo: string;
  photoAlt: string;
  logo: string;
  logoAlt: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  tone: 'blue' | 'warm';
  callout?: { label: string; body: string; href: string };
};

export const VENTURES: Venture[] = [
  {
    id: 'bluestar',
    kicker: 'Hospitality · Web3 live',
    title: 'Blue Star Apartments & Hotel',
    body: 'Blue Star is part of the Guy family build story: construction roots, island hospitality, and years of work turned into a place people can actually stay in Grenada.',
    bullets: ['Long & short-stay suites', 'Sea-facing balconies', 'Local hospitality with digital-native operations'],
    photo: '/assets/opt/bluestar-property.webp',
    photoAlt: 'Blue Star Apartments and Hotel property and pool',
    logo: '/assets/opt/bluestar-logo.webp',
    logoAlt: 'Blue Star Apartments & Hotel logo',
    primary: { label: 'Book a stay', href: 'https://www.bluestarstay.com/web3' },
    secondary: { label: 'Instagram', href: 'https://www.instagram.com/bluestarstay/' },
    tone: 'blue',
    callout: {
      label: 'Web3 stays are live',
      body: 'Sappy Seals and Pudgy ecosystem holders get booking benefits. Inkfinity Canvas holders sit in the founders tier.',
      href: 'https://www.bluestarstay.com/web3',
    },
  },
  {
    id: 'zeppole',
    kicker: 'Café · eatery · bakery',
    title: 'Zeppole Dolci',
    body: 'Sugar, dough, a small machine that makes espresso. A café that takes pastry seriously and itself less so. Fried to order. Cornetti at sunrise.',
    bullets: ['Fresh pastries, daily', 'American/Italian cuisine - Brunch!', 'Catering and events'],
    photo: '/assets/opt/zeppole-shop.webp',
    photoAlt: 'Zeppole Dolci outdoor seating and shopfront',
    logo: '/assets/opt/zeppole-logo.webp',
    logoAlt: 'Zeppole Dolci logo',
    primary: { label: 'Order now', href: 'https://zeppoledolci.com/' },
    secondary: { label: 'Instagram', href: 'https://www.instagram.com/zeppoledolci/' },
    tone: 'warm',
  },
];

export type ContactCard = { kind: string; handle: string; note: string; href: string; warm?: boolean };

export const CONTACT_CARDS: ContactCard[] = [
  { kind: '◈ biome', handle: 'biome.gerrystephen.com', note: 'The creature-game ecosystem on Monad. A proof-of-play game coming soon.', href: 'https://biome.gerrystephen.com' },
  { kind: '◆ sappy', handle: 'sappy.gerrystephen.com', note: 'The Sappy-side home base for the ecosystem, memes, and collector trail.', href: 'https://sappy.gerrystephen.com' },
  { kind: '★ bluestar', handle: '@bluestarstay', note: 'Family-built hospitality in Grenada.', href: 'https://www.instagram.com/bluestarstay/', warm: true },
  { kind: '● zeppole', handle: '@zeppoledolci', note: 'Cafe, eatery, bakery, and the daily coffee ritual.', href: 'https://www.instagram.com/zeppoledolci/', warm: true },
];

export type SocialName = 'X' | 'Instagram' | 'TikTok' | 'Farcaster' | 'LinkedIn' | 'Telegram' | 'Twitch';

export const SOCIALS: { name: SocialName; href: string }[] = [
  { name: 'X', href: 'https://x.com/gerrydoteth' },
  { name: 'Instagram', href: 'https://www.instagram.com/gerrydoteth/' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@gerrydoteth' },
  { name: 'Farcaster', href: 'https://warpcast.com/gerrydoteth' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/gerrydoteth/' },
  { name: 'Telegram', href: 'https://t.me/gerrydoteth' },
  { name: 'Twitch', href: 'https://www.twitch.tv/gerrydoteth' },
];
