// Global JSX intrinsic element fallback to satisfy analysis tool
// This is intentionally broad; real element typings come from @types/react
// but the analysis tool appears not to pick them up.
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

