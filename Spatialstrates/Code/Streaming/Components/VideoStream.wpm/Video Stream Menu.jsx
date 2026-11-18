import React from 'react';
import { Varv, useProperty } from '#VarvReact';

import { addSubMenu, addItemToSubMenu, MenuSpacer, MenuButton } from '#Menu .default';
import { addControllerSubMenu, addItemToControllerSubMenu, ControllerMenuButton } from '#ControllerMenu .default';
import { createMovable, deleteMovable } from '#Spatialstrates .movable-helpers';
import { getCurrentSpaceUUID } from '#Spatialstrates .space-helpers';



// Import in order to start the manager
import VideoStreamManager from '#VideoStreamManager .default';



addSubMenu('media-sharing', 500, false);
// Whether this client currently shares its camera, kept in sync by the manager
function useIsSharingVideo() {
    const [sharing, setSharing] = React.useState(() => !!window.moduleVideoStreamManager.streamShare.currentStream);
    React.useEffect(() => {
        const update = () => setSharing(!!window.moduleVideoStreamManager.streamShare.currentStream);
        window.addEventListener('video-share-changed', update);
        return () => window.removeEventListener('video-share-changed', update);
    }, []);
    return sharing;
}

function ShareVideoButton() {
    const sharing = useIsSharingVideo();
    const toggleSharing = () => sharing ? window.stopSharingMyVideo() : window.shareMyVideo();
    return <MenuButton onClick={toggleSharing} toggled={sharing ? 'true' : null}>Share Video ({sharing ? 'On' : 'Off'})</MenuButton>;
}
addItemToSubMenu('media-sharing', 'share-video', <ShareVideoButton />, 300);
addItemToSubMenu('media-sharing', 'spacer2', <MenuSpacer />, 450);

// Switches everyone between the grid following each XR user's head and a shared grid that can be moved around
async function setWebcamGridMode(setMode, mode) {
    const gridUUIDs = await VarvEngine.getAllUUIDsFromType('WebcamGrid');

    if (mode === 'movable') {
        const currentSpace = await getCurrentSpaceUUID();
        let hasGridInSpace = false;
        for (const uuid of gridUUIDs) {
            if (await VarvEngine.getConceptFromUUID(uuid).getPropertyValue(uuid, 'space') === currentSpace) hasGridInSpace = true;
        }
        if (!hasGridInSpace) await createMovable('WebcamGrid');
    } else {
        for (const uuid of gridUUIDs) {
            await deleteMovable(uuid);
        }
    }

    setMode(mode);
}

function WebcamGridModeButton() {
    const [mode, setMode] = useProperty('mode');
    const movable = mode === 'movable';
    return <MenuButton onClick={() => setWebcamGridMode(setMode, movable ? 'head' : 'movable')} toggled={movable ? 'true' : null}>Movable Webcam Grid ({movable ? 'On' : 'Off'})</MenuButton>;
}
addItemToSubMenu('media-sharing', 'webcam-grid-mode', <Varv concept="WebcamGridManager">
    <WebcamGridModeButton />
</Varv>, 425);

function WebcamGridModeControllerButton() {
    const [mode, setMode] = useProperty('mode');
    const movable = mode === 'movable';
    return <ControllerMenuButton onClick={() => setWebcamGridMode(setMode, movable ? 'head' : 'movable')} toggled={movable ? 'true' : null}>Movable Webcam Grid ({movable ? 'On' : 'Off'})</ControllerMenuButton>;
}
addControllerSubMenu('media-sharing', 500, false);
addItemToControllerSubMenu('media-sharing', 'webcam-grid-mode', <Varv concept="WebcamGridManager">
    <WebcamGridModeControllerButton />
</Varv>, 425);
