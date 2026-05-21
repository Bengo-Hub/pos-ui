/**
 * Order page segment layout.
 * The parent <main> is overflow-y-auto by default. Setting height via CSS on a child
 * of a scroll container doesn't work cleanly. Instead the order page takes 100% of
 * the available remaining viewport height using a CSS calc trick anchored to the
 * --header-height CSS variable set on <body> (or just hardcodes the 80px header).
 */
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}


