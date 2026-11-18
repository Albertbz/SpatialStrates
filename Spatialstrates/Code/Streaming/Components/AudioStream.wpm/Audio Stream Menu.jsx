import React from 'react';

import { addSubMenu, addItemToSubMenu, MenuSpacer, MenuButton } from '#Menu .default';
import { addControllerSubMenu, addItemToControllerSubMenu, ControllerMenuSpacer, ControllerMenuButton } from '#ControllerMenu .default';



// Import in order to start the manager
import AudioStreamManager from '#AudioStreamManager .default';



addSubMenu('media-sharing', 500, false);
// Whether this client currently shares its microphone, kept in sync by the manager
function useIsSharingAudio() {
    const [sharing, setSharing] = React.useState(() => !!window.moduleAudioStreamManager.streamShare.currentStream);
    React.useEffect(() => {
        const update = () => setSharing(!!window.moduleAudioStreamManager.streamShare.currentStream);
        window.addEventListener('audio-share-changed', update);
        return () => window.removeEventListener('audio-share-changed', update);
    }, []);
    return sharing;
}

function ShareAudioButton() {
    const sharing = useIsSharingAudio();
    const toggleSharing = () => sharing ? window.stopSharingMyAudio() : window.shareMyAudio();
    return <MenuButton onClick={toggleSharing} toggled={sharing ? 'true' : null}>Share Audio ({sharing ? 'On' : 'Off'})</MenuButton>;
}

function ShareAudioControllerButton() {
    const sharing = useIsSharingAudio();
    const toggleSharing = () => sharing ? window.stopSharingMyAudio() : window.shareMyAudio();
    return <ControllerMenuButton onClick={toggleSharing} toggled={sharing ? 'true' : null}>Share Audio ({sharing ? 'On' : 'Off'})</ControllerMenuButton>;
}

addItemToSubMenu('media-sharing', 'share-audio', <ShareAudioButton />, 500);
addItemToSubMenu('media-sharing', 'spacer3', <MenuSpacer />, 700);

addControllerSubMenu('media-sharing', 500, false);
addItemToControllerSubMenu('media-sharing', 'share-audio', <ShareAudioControllerButton />, 500);
addItemToControllerSubMenu('media-sharing', 'spacer3', <ControllerMenuSpacer />, 700);
