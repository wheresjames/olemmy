// ES module face of the vendored markdown-it UMD builds, which index.html
// loads first as classic scripts (with SRI) and which set globals.
// See VENDOR.md.

const g = globalThis;

export const markdownit = g.markdownit;
export const sub = g.markdownitSub;
export const sup = g.markdownitSup;
export const footnote = g.markdownitFootnote;
export const container = g.markdownitContainer;
