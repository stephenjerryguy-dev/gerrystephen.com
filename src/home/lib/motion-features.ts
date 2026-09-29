// Loaded after first paint via <LazyMotion>, keeping Framer Motion's animation
// engine out of the critical bundle. domMax adds layout animations (the tab pill).
export { domMax as default } from 'framer-motion';
