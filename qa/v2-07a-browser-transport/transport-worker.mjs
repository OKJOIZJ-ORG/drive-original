import { createBundleTransport } from './bundle-registry.mjs';
import { BUNDLES } from './generated-bundles.mjs';

const serveBundle = createBundleTransport(BUNDLES);

export default {
  fetch(request) {
    return serveBundle(request);
  }
};
