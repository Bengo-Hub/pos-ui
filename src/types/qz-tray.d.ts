// qz-tray ships no TypeScript types. We use it through a thin `any` wrapper in
// src/lib/pos/printer-discovery.ts, so a minimal module declaration is sufficient.
declare module 'qz-tray' {
  const qz: any;
  export default qz;
}
