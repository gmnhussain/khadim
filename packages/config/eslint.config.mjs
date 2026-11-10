import { createNodeConfig } from "./eslint/node.mjs";

export default createNodeConfig({ tsconfigRootDir: import.meta.dirname });
