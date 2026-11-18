import React from 'react';
import { Varv, useProperty } from '#VarvReact';

import { addSubMenu, addItemToSubMenu, MenuTitle, MenuSpacer, MenuButton } from '#Menu .default';
import { addControllerSubMenu, addItemToControllerSubMenu, ControllerMenuTitle, ControllerMenuButton } from '#ControllerMenu .default';
import { setPresenting } from '#Avatar .merge-helpers';



function AvatarToggleButton() {
    const [enabled, setEnabled] = useProperty('enabled');
    return <MenuButton onClick={() => setEnabled(!enabled)} toggled={enabled ? 'true' : null}>Toggle Avatars ({enabled ? 'On' : 'Off'})</MenuButton>;
}

const FOLLOW_MODE_LABELS = { off: 'Off', pip: 'Picture-in-Picture', full: 'Full View' };
const NEXT_FOLLOW_MODE = { pip: 'full', full: 'off', off: 'pip' };

// Only this device changes how it watches presenters
function FollowModeButton() {
    const [followMode, setFollowMode] = useProperty('followMode');
    const mode = FOLLOW_MODE_LABELS[followMode] ? followMode : 'pip';
    return <MenuButton onClick={() => setFollowMode(NEXT_FOLLOW_MODE[mode])} toggled={mode !== 'off' ? 'true' : null}>Watch Presenters ({FOLLOW_MODE_LABELS[mode]})</MenuButton>;
}

// Shared for everyone: following laptops look out from their tile in the movable webcam grid instead of the presenter's view
function FollowWebcamGridToggleButton() {
    const [followTarget, setFollowTarget] = useProperty('followTarget');
    const followGrid = followTarget === 'grid';
    return <MenuButton onClick={() => setFollowTarget(followGrid ? 'view' : 'grid')} toggled={followGrid ? 'true' : null}>Follow Webcam Grid ({followGrid ? 'On' : 'Off'})</MenuButton>;
}

function StopPresentingButton() {
    const [localUser] = useProperty('localUser'); // UserManager
    const [presenters] = useProperty('presenters'); // AvatarManager
    const presenting = !!localUser && Array.isArray(presenters) && presenters.includes(localUser);
    return presenting ? <MenuButton onClick={() => setPresenting(localUser, false)}>Stop Presenting</MenuButton> : null;
}

addSubMenu('media-sharing', 500, false);
addItemToSubMenu('media-sharing', 'title', <MenuTitle title="Media Sharing" />, 0);
addItemToSubMenu('media-sharing', 'avatars', <Varv concept="AvatarManager">
    <AvatarToggleButton />
</Varv>, 750);
addItemToSubMenu('media-sharing', 'follow-presenter', <Varv concept="AvatarManager">
    <FollowModeButton />
</Varv>, 760);
addItemToSubMenu('media-sharing', 'follow-webcam-grid', <Varv concept="AvatarManager">
    <FollowWebcamGridToggleButton />
</Varv>, 765);
addItemToSubMenu('media-sharing', 'stop-presenting', <Varv concept="UserManager">
    <Varv concept="AvatarManager">
        <StopPresentingButton />
    </Varv>
</Varv>, 770);
addItemToSubMenu('media-sharing', 'spacer4', <MenuSpacer />, 800);

function AvatarToggleControllerButton() {
    const [enabled, setEnabled] = useProperty('enabled');
    return <ControllerMenuButton onClick={() => setEnabled(!enabled)} toggled={enabled ? 'true' : null}>Toggle Avatars ({enabled ? 'On' : 'Off'})</ControllerMenuButton>;
}

// Makes this user the presenter that laptops follow, or stops presenting
function PresentMyViewControllerButton() {
    const [localUser] = useProperty('localUser'); // UserManager
    const [presenters] = useProperty('presenters'); // AvatarManager
    const presenting = !!localUser && Array.isArray(presenters) && presenters.includes(localUser);

    // Several users can present at the same time, each laptop chooses whom to watch
    const togglePresenting = () => {
        if (localUser) setPresenting(localUser, !presenting);
    };

    return <ControllerMenuButton onClick={togglePresenting} toggled={presenting ? 'true' : null}>Present My View ({presenting ? 'On' : 'Off'})</ControllerMenuButton>;
}

function FollowWebcamGridToggleControllerButton() {
    const [followTarget, setFollowTarget] = useProperty('followTarget');
    const followGrid = followTarget === 'grid';
    return <ControllerMenuButton onClick={() => setFollowTarget(followGrid ? 'view' : 'grid')} toggled={followGrid ? 'true' : null}>Laptops Follow Grid ({followGrid ? 'On' : 'Off'})</ControllerMenuButton>;
}

addControllerSubMenu('media-sharing', 500, false);
addItemToControllerSubMenu('media-sharing', 'title', <ControllerMenuTitle title="Media Sharing" />, 0);
addItemToControllerSubMenu('media-sharing', 'avatars', <Varv concept="AvatarManager">
    <AvatarToggleControllerButton />
</Varv>, 750);
addItemToControllerSubMenu('media-sharing', 'present-my-view', <Varv concept="UserManager">
    <Varv concept="AvatarManager">
        <PresentMyViewControllerButton />
    </Varv>
</Varv>, 760);
addItemToControllerSubMenu('media-sharing', 'follow-webcam-grid', <Varv concept="AvatarManager">
    <FollowWebcamGridToggleControllerButton />
</Varv>, 765);
