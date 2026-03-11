import type { JSX as ReactJSX } from 'react';

declare global {
    // Re-export JSX namespace globally for React 19 compatibility
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type Element = ReactJSX.Element;
        type IntrinsicElements = ReactJSX.IntrinsicElements;
    }
}

export {};
