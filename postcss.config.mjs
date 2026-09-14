// .mjs is an ES Module regardless of package.json's "type" field, so this
// must use `export default`, not `module.exports` (that would throw).
//
// autoprefixer is deliberately NOT listed here — it's not in your real
// package.json's devDependencies, so referencing it would throw
// "Cannot find module 'autoprefixer'". Tailwind v3 works without it;
// add it back only if you actually `npm install autoprefixer` too.
export default {
  plugins: {
    tailwindcss: {},
  },
};
