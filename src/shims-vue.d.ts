declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const Component: DefineComponent;
  export default Component;
}

declare module '*.css' {
  const css: string;
  export default css;
}
