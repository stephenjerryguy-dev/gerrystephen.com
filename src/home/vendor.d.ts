// hls.js ships the light build without a `types` export condition; it shares the full build's API.
declare module 'hls.js/light' {
  export { default } from 'hls.js';
}
