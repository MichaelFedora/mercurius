declare module '*.vue' {
  import Vue from 'vue';
  export default Vue;
}

declare module '*.css' {
  const css: string;
  export default css;
}
