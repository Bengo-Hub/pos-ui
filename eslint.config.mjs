import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next 16.x ships a NATIVE flat-config array at this subpath — routing it through
// FlatCompat.extends("next/core-web-vitals") (the old Next.js-generated boilerplate, designed for
// legacy eslintrc-SHAPED shareable configs) fed FlatCompat's legacy schema validator an array
// instead of the object it expects. That validation failure's own error-formatting path then
// crashed on eslint-plugin-react's flat config (which self-references itself in `plugins`, a
// normal/safe pattern in real flat config) while trying to JSON.stringify it for the error
// message — masking the real "wrong type" error behind an opaque circular-structure crash.
// Importing the flat array directly needs no compat shim at all.
const eslintConfig = [...nextCoreWebVitals];

export default eslintConfig;
