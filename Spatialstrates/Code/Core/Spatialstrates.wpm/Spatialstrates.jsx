import React from 'react';
const { useMemo, useEffect, useRef, useState } = React;
import { Varv, useProperty } from '#VarvReact';

import { DynamicComponents, useDynamicModules } from '#Spatialstrates .dynamic-components';
import { GlobalEventProvider } from '#Spatialstrates .global-events';
import { SceneView } from '#Spatialstrates .scene-view';
import { CanvasView } from '#Spatialstrates .canvas-view';



// Only these devices can be detected as XR platforms, so all others are known not to be one without waiting for WebXR
const mightBeXRPlatform = () => {
    return typeof window.HTMLModelElement !== 'undefined' ||
        navigator.userAgent.includes('OculusBrowser') ||
        navigator.userAgent.includes('Android');
};

// Detect the XR platform type once, so the GUI does not have to wait for it to be written to Varv
const detectXRPlatform = async () => {
    if (!navigator.xr || !mightBeXRPlatform()) return 'None';

    const supportsImmersiveAR = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar');
    const supportsImmersiveVR = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr');

    const isAndroid = navigator.userAgent.includes('Android');
    const isOculusBrowser = navigator.userAgent.includes('OculusBrowser');

    const supportsModelElement = typeof window.HTMLModelElement !== 'undefined';

    if (supportsModelElement && supportsImmersiveVR) return 'Vision Pro';
    if (isOculusBrowser && supportsImmersiveVR) return 'Quest';
    if (isAndroid && supportsImmersiveAR) return 'Android Mobile';
    return 'None';
};

const xrPlatformPromise = detectXRPlatform().catch(() => 'None');

function SpaceView() {
    const [currentView] = useProperty('currentView');
    const [currentSpace, setCurrentSpace] = useProperty('locationHash');
    const [, setXRPlatform] = useProperty('xrPlatform');

    // Store the detected XR platform type
    useEffect(() => {
        if (typeof setXRPlatform !== 'function') return;

        let cancelled = false;
        xrPlatformPromise.then(async xrPlatform => {
            if (cancelled) return;
            try {
                await setXRPlatform(xrPlatform);
            } catch (e) {
                // The Varv binding may not be ready yet, the effect runs again with the next setter
            }
        });
        return () => {
            cancelled = true;
        };
    }, [setXRPlatform]);

    // Initialize the current space if it is not set
    const initSpaceTimeout = useRef(null);
    useEffect(() => {
        if (initSpaceTimeout.current) {
            clearTimeout(initSpaceTimeout.current);
            initSpaceTimeout.current = null;
        }
        if (!currentSpace) {
            initSpaceTimeout.current = setTimeout(async () => {
                const spaceUUIDs = await VarvEngine.getAllUUIDsFromType('Space');

                if (spaceUUIDs.length > 0) {
                    setCurrentSpace(spaceUUIDs[0]);
                } else {
                    setCurrentSpace(await VarvEngine.getConceptFromType('Space').create(null, { name: 'New Space' }));
                }
                initSpaceTimeout.current = null;
            }, 1000);
        }
    }, [currentSpace, setCurrentSpace]);

    // Load shape utils and movables here to cache them between switching views
    const shapeUtils = useDynamicModules('.dynamic-shape-component');
    const movableSceneComponents = useDynamicModules('.dynamic-movable-scene-component');

    const view = useMemo(() => {
        switch (currentView) {
            case '3D':
                return <SceneView movableSceneComponents={movableSceneComponents} />;
            case '2D':
                return <CanvasView shapeUtils={shapeUtils} />;
            default:
                return null;
        }
    }, [currentView, shapeUtils, movableSceneComponents]);

    return currentSpace ? view : null;
}

// XR-capable devices only get the reduced XR GUI, all other devices get the full GUI
function GUIComponents() {
    // Laptops get the full GUI immediately, XR-capable devices wait for detection
    const [xrPlatform, setXRPlatform] = useState(() => mightBeXRPlatform() ? null : 'None');

    useEffect(() => {
        let cancelled = false;
        xrPlatformPromise.then(detectedXRPlatform => {
            if (!cancelled) setXRPlatform(detectedXRPlatform);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!xrPlatform) return null;
    return xrPlatform === 'None'
        ? <DynamicComponents key="gui" selector=".dynamic-gui-component" />
        : <DynamicComponents key="xr-gui" selector=".dynamic-xr-gui-component" />;
}

export function App() {
    return <GlobalEventProvider>
        <Varv concept="SpaceManager">
            <GUIComponents />
            <SpaceView />
        </Varv>
    </GlobalEventProvider>;
}
