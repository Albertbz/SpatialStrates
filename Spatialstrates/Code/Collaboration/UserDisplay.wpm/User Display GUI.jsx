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
import { isXRDeviceType, useFollowStore } from '#Avatar .merge-helpers';



function UserIcon({ localAvatar }) {
    const [localUser] = useProperty('localUser');
    const [presenters] = useProperty('presenters'); // AvatarManager
    const [, setFollowedUser] = useProperty('followedUser'); // AvatarManager
    const [followMode, setFollowMode] = useProperty('followMode'); // AvatarManager
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
    // The store has the resolved presenter, as no choice means the most recent presenter
    const watchedUser = useFollowStore(state => ['pip', 'following', 'waiting'].includes(state.status) ? state.followedUser : null);

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

    // XR users choose to present themselves, laptops only choose which presenter they watch
    const isPresenter = !!user && Array.isArray(presenters) && presenters.includes(user);
    const canWatch = isPresenter && !isLocalAvatar && localUser !== user && isXRDeviceType(deviceType);
    const watching = watchedUser === user;

    const watchUser = (event) => {
        event.stopPropagation();
        setFollowedUser(user);
        if (followMode === 'off') setFollowMode('pip');
    };

    return <div className={`user-icon ${localUser === user ? 'local-user' : ''} ${isPresenter ? 'presenter' : ''}`}>
        <span>{name || ''}</span>
        <small>{deviceLabel}</small>
        {canPair && action}
        {canWatch && (watching
            ? <button disabled>Watching</button>
            : <button onClick={watchUser} title={`Watch the view of ${name || 'this user'}`}>Watch</button>)}
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
