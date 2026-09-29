import { useLayoutEffect, type DependencyList, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
// Mobile URL bars resize the viewport while scrolling; don't re-measure on that.
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs GSAP setup scoped to `scope` and reverts every tween/ScrollTrigger it
 * created on unmount. Animation state lives in GSAP, never in React state, so
 * scrolling does not re-render the page.
 */
export function useGsap(setup: (context: gsap.Context) => void | (() => void), scope: RefObject<HTMLElement | null>, deps: DependencyList = []) {
  useLayoutEffect(() => {
    const context = gsap.context(setup, scope.current ?? undefined);
    return () => context.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
