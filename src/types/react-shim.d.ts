// Minimal React typings used ONLY when @types/react is not installed (offline build environment).
// With network access, `npm i` installs @types/react and this file can be deleted.
declare module 'react' {
  export type ReactNode = any; export type ReactElement = any;
  export function createElement(...args: any[]): any;
}
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module 'react-dom/server' { export function renderToStaticMarkup(el: any): string; }
declare namespace JSX { interface IntrinsicElements { [el: string]: any } interface Element {} interface ElementChildrenAttribute { children: {} } interface IntrinsicAttributes { key?: any } }
