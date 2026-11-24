// zooid.js
// The page the menu opens. It builds Stolon's tool app with every Zooid tool, the dashboard first.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

export default function (view) {
    zooidModule.createZooidApp(view);
}
