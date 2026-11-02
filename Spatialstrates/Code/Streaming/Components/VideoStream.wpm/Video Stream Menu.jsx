import React from 'react';
const { useState, useEffect } = React;

import { addSubMenu, addItemToSubMenu, MenuSpacer, MenuButton } from '#Menu .default';
import { addControllerSubMenu, addItemToControllerSubMenu, ControllerMenuButton } from '#ControllerMenu .default';



// Import in order to start the manager
import VideoStreamManager from '#VideoStreamManager .default';
import { streamShare } from '#VideoStreamManager .default';



addSubMenu('media-sharing', 500, false);
addItemToSubMenu('media-sharing', 'share-video', <MenuButton onClick={window.shareMyVideo}>Share Video</MenuButton>, 300);
addItemToSubMenu('media-sharing', 'stop-video', <MenuButton onClick={window.stopSharingMyVideo}>Stop Video</MenuButton>, 400);
addItemToSubMenu('media-sharing', 'spacer2', <MenuSpacer />, 450);

// Tracks whether this client is currently sharing its camera
function useIsSharingMyVideo() {
    const [sharing, setSharing] = useState(streamShare.clientStreams.has(webstrate.clientId));

    useEffect(() => {
        const onAdded = (client) => {
            if (client === webstrate.clientId) setSharing(true);
        };
        const onRemoved = (client) => {
            if (client === webstrate.clientId) setSharing(false);
        };

        streamShare.addStreamAddedListener(onAdded);
        streamShare.addStreamRemovedListener(onRemoved);

        return () => {
            streamShare.removeStreamAddedListener(onAdded);
            streamShare.removeStreamRemovedListener(onRemoved);
        };
    }, []);

    return sharing;
}

function VideoToggleControllerButton() {
    const sharing = useIsSharingMyVideo();
    const [pending, setPending] = useState(false);

    const toggleVideo = async () => {
        if (pending) return;
        setPending(true);
        try {
            if (sharing) {
                await window.stopSharingMyVideo();
            } else {
                await window.shareMyVideo();
            }
        } catch (error) {
            console.warn('Could not toggle video:', error);
        } finally {
            setPending(false);
        }
    };

    return <ControllerMenuButton onClick={toggleVideo} toggled={sharing ? 'true' : null}>Toggle Video ({sharing ? 'On' : 'Off'})</ControllerMenuButton>;
}

addControllerSubMenu('media-sharing', 500, false);
addItemToControllerSubMenu('media-sharing', 'toggle-video', <VideoToggleControllerButton />, 300);
