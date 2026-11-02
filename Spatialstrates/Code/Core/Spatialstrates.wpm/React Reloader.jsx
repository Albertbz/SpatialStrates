import React from 'react';
import { createRoot } from 'react-dom/client';



// Automatically reload this view if certain other fragments change
const WATCHED_FRAGMENTS = [
    '#Spatialstrates [data-type="text/javascript+babel"]'
];



// Varv bindings in useProperty are only created on mount and die when the engine reloads,
// so the app is remounted with a new key after every engine reload
let engineGeneration = 0;

async function render() {
    if (!window.cachedAppRoot) {
        const element = document.createElement('transient');
        element.id = 'app-root';
        document.body.appendChild(element);
        window.cachedAppRoot = createRoot(element);
    }

    const content = await Fragment.one("#Spatialstrates .spatialstrates").require();
    window.cachedAppRoot.render(React.createElement(content.App, { key: engineGeneration }));
};

let reloadTimer;
const reload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(render, 1000);
};

WATCHED_FRAGMENTS.forEach(frag => {
    const lookedUpFragments = Fragment.find(frag);
    lookedUpFragments.forEach((lookedUpFragment) => {
        lookedUpFragment.registerOnFragmentChangedHandler(() => {
            reload();
        });
    });
});

if (VarvEngine) {
    VarvEngine.registerEventCallback('engineReloaded', () => {
        engineGeneration++;
        reload();
    });
}

window.reloadApp = () => {
    reload();
};
