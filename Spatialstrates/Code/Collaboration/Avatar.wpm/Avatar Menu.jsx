import React from 'react';
import { Varv, useProperty } from '#VarvReact';

import { addSubMenu, addItemToSubMenu, MenuTitle, MenuSpacer, MenuButton } from '#Menu .default';
import { addControllerSubMenu, addItemToControllerSubMenu, ControllerMenuTitle, ControllerMenuButton } from '#ControllerMenu .default';



function AvatarToggleButton() {
    const [enabled, setEnabled] = useProperty('enabled');
    return <MenuButton onClick={() => setEnabled(!enabled)} toggled={enabled ? 'true' : null}>Toggle Avatars ({enabled ? 'On' : 'Off'})</MenuButton>;
}

function FollowPresenterToggleButton() {
    const [followPresenter, setFollowPresenter] = useProperty('followPresenter');
    return <MenuButton onClick={() => setFollowPresenter(!followPresenter)} toggled={followPresenter ? 'true' : null}>Follow Presenter ({followPresenter ? 'On' : 'Off'})</MenuButton>;
}

function StopPresentingButton() {
    const [presenterUser, setPresenterUser] = useProperty('presenterUser');
    return presenterUser ? <MenuButton onClick={() => setPresenterUser('')}>Stop Presenting</MenuButton> : null;
}

addSubMenu('media-sharing', 500, false);
addItemToSubMenu('media-sharing', 'title', <MenuTitle title="Media Sharing" />, 0);
addItemToSubMenu('media-sharing', 'avatars', <Varv concept="AvatarManager">
    <AvatarToggleButton />
</Varv>, 750);
addItemToSubMenu('media-sharing', 'follow-presenter', <Varv concept="AvatarManager">
    <FollowPresenterToggleButton />
</Varv>, 760);
addItemToSubMenu('media-sharing', 'stop-presenting', <Varv concept="AvatarManager">
    <StopPresentingButton />
</Varv>, 770);
addItemToSubMenu('media-sharing', 'spacer4', <MenuSpacer />, 800);

function AvatarToggleControllerButton() {
    const [enabled, setEnabled] = useProperty('enabled');
    return <ControllerMenuButton onClick={() => setEnabled(!enabled)} toggled={enabled ? 'true' : null}>Toggle Avatars ({enabled ? 'On' : 'Off'})</ControllerMenuButton>;
}

// Makes this user the presenter that laptops follow, or stops presenting
function PresentMyViewControllerButton() {
    const [localUser] = useProperty('localUser'); // UserManager
    const [presenterUser, setPresenterUser] = useProperty('presenterUser'); // AvatarManager
    const presenting = !!localUser && presenterUser === localUser;

    const togglePresenting = () => {
        if (presenting) {
            setPresenterUser('');
        } else if (localUser) {
            setPresenterUser(localUser);
        }
    };

    return <ControllerMenuButton onClick={togglePresenting} toggled={presenting ? 'true' : null}>Present My View ({presenting ? 'On' : 'Off'})</ControllerMenuButton>;
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
