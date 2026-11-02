import React from 'react';
const { useState } = React;
import { Varv, useProperty } from '#VarvReact';

import {
    pairWithAvatar,
    mergeWithAvatar,
    unmergeAvatar,
    getDeviceLabel,
    getLocalDeviceClass,
    canMergeDeviceClasses,
    useStalePairCleanup,
    LocalAvatarReporter
} from '#UserDisplay .pairing-helpers';
import { isXRDeviceType } from '#Avatar .merge-helpers';



function UserIcon({ localAvatar }) {
    const [localUser] = useProperty('localUser');
    const [presenterUser, setPresenterUser] = useProperty('presenterUser'); // AvatarManager
    const [, setFollowPresenter] = useProperty('followPresenter'); // AvatarManager
    const [locationHash] = useProperty('locationHash'); // SpaceManager
    const [xrPlatform] = useProperty('xrPlatform'); // SpaceManager
    const [space] = useProperty('space');
    const [user] = useProperty('user');
    const [avatarUUID] = useProperty('concept::uuid');
    const [client] = useProperty('client');
    const [name] = useProperty('userName');
    const [deviceType] = useProperty('deviceType');
    const [deviceClass] = useProperty('deviceClass');
    const [mergeRole] = useProperty('mergeRole');
    const [mergeState] = useProperty('mergeState');
    const [pairedAvatar] = useProperty('pairedAvatar');
    const [type] = useProperty('type');
    const [active] = useProperty('active');

    const isLocalAvatar = client === webstrate.clientId;
    const pairedWithMe = !!localAvatar?.uuid && pairedAvatar === localAvatar.uuid;

    if (type !== 'camera' || !active || space !== locationHash) return null;
    // Merged sources are represented by their target, except the device merged with oneself, so it can be unmerged
    if (mergeState === 'merged' && mergeRole === 'source' && !pairedWithMe) return null;

    const deviceLabel = getDeviceLabel(deviceType, deviceClass);
    const canPair = localUser === user && !isLocalAvatar &&
        canMergeDeviceClasses(getLocalDeviceClass(xrPlatform), deviceClass);

    // Each device can only be paired and merged with one other device at a time
    const localBusy = !!localAvatar && localAvatar.mergeState !== 'unpaired' && !pairedWithMe;
    const remoteBusy = mergeState !== 'unpaired' && !pairedWithMe;

    const pairWithDevice = (event) => {
        event.stopPropagation();
        pairWithAvatar(avatarUUID);
    };

    const mergeWithDevice = (event) => {
        event.stopPropagation();
        mergeWithAvatar(avatarUUID);
    };

    const unmergeDevice = (event) => {
        event.stopPropagation();
        unmergeAvatar();
    };

    let action;
    if (pairedWithMe && mergeState === 'paired') {
        action = <button onClick={mergeWithDevice} title={`Merge with ${name || 'this device'}`}>Merge</button>;
    } else if (pairedWithMe && mergeState === 'merging') {
        action = <button disabled>Merging</button>;
    } else if (pairedWithMe && mergeState === 'merged') {
        action = <button onClick={unmergeDevice} title={`Unmerge from ${name || 'this device'}`}>Unmerge</button>;
    } else if (remoteBusy) {
        action = <button disabled>Merged</button>;
    } else {
        action = <button onClick={pairWithDevice} disabled={!localAvatar || localBusy} title={`Pair with ${name || 'this device'}`}>Pair</button>;
    }

    // Anyone in XR can be followed like the presenter of a video call
    const isPresenter = !!user && presenterUser === user;
    const canFollow = !!user && !isLocalAvatar && localUser !== user && isXRDeviceType(deviceType);

    const followUser = (event) => {
        event.stopPropagation();
        setPresenterUser(user);
        setFollowPresenter(true);
    };

    const stopPresenting = (event) => {
        event.stopPropagation();
        setPresenterUser('');
    };

    return <div className={`user-icon ${localUser === user ? 'local-user' : ''} ${isPresenter ? 'presenter' : ''}`}>
        <span>{name || ''}</span>
        <small>{deviceLabel}</small>
        {canPair && action}
        {canFollow && (isPresenter
            ? <button onClick={stopPresenting} title={`Stop following ${name || 'this user'} for everyone`}>Presenting</button>
            : <button onClick={followUser} title={`Make everyone follow ${name || 'this user'}`}>Follow</button>)}
    </div>;
}

function UserDisplay() {
    const [localAvatar, setLocalAvatar] = useState(null);
    useStalePairCleanup();

    return <div className="user-display">
        <Varv concept="Avatar">
            <UserIcon localAvatar={localAvatar} />
        </Varv>
        <Varv concept="Avatar">
            <LocalAvatarReporter setLocalAvatar={setLocalAvatar} />
        </Varv>
    </div>;
}

export function Main() {
    return <Varv concept="UserManager">
        <Varv concept="SpaceManager">
            <Varv concept="AvatarManager">
                <UserDisplay />
            </Varv>
        </Varv>
    </Varv>;
}
