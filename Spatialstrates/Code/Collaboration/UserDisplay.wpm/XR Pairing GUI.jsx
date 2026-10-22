import React from 'react';
const { useState, useEffect } = React;
import { IfSessionModeSupported } from '@react-three/xr';
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



const SESSION_POLL_INTERVAL = 500;

// The XR store is created by the scene view and is not reactive outside of it
function useXRSessionActive() {
    const [sessionActive, setSessionActive] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setSessionActive(!!window.xrStore?.getState?.()?.session);
        }, SESSION_POLL_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    return sessionActive;
}

const enterSession = (mode) => {
    if (!window.xrStore) {
        console.warn('No xrStore found');
        return;
    }
    if (mode === 'immersive-ar') {
        window.xrStore.enterAR();
    } else {
        window.xrStore.enterVR();
    }
};

function PairingCandidate({ localAvatar, setLocalUser }) {
    const [locationHash] = useProperty('locationHash'); // SpaceManager
    const [xrPlatform] = useProperty('xrPlatform'); // SpaceManager
    const [space] = useProperty('space');
    const [type] = useProperty('type');
    const [active] = useProperty('active');
    const [client] = useProperty('client');
    const [uuid] = useProperty('concept::uuid');
    const [user] = useProperty('user');
    const [name] = useProperty('userName');
    const [deviceType] = useProperty('deviceType');
    const [deviceClass] = useProperty('deviceClass');
    const [mergeState] = useProperty('mergeState');
    const [mergeRole] = useProperty('mergeRole');
    const [pairedAvatar] = useProperty('pairedAvatar');

    if (type !== 'camera' || !active || space !== locationHash || client === webstrate.clientId) return null;
    // Only devices that are not XR-capable can be merged with this one
    if (!canMergeDeviceClasses(getLocalDeviceClass(xrPlatform), deviceClass)) return null;

    const pairedWithMe = !!localAvatar?.uuid && pairedAvatar === localAvatar.uuid;
    // Devices that are merged into someone else are represented by their merge target
    if (mergeState === 'merged' && mergeRole === 'source' && !pairedWithMe) return null;

    // This device can only be paired and merged with one user at a time
    const localBusy = !!localAvatar && localAvatar.mergeState !== 'unpaired' && !pairedWithMe;
    const remoteBusy = mergeState !== 'unpaired' && !pairedWithMe;

    const pairAndMerge = async () => {
        if (!localAvatar || localBusy || remoteBusy) return;

        // Adopt the identity of the chosen user, so that both devices belong to the same user
        if (user) await setLocalUser(user);
        if (pairedWithMe || await pairWithAvatar(uuid)) {
            await mergeWithAvatar(uuid);
        }
    };

    let action;
    if (pairedWithMe && mergeState === 'merging') {
        action = <button disabled>Merging</button>;
    } else if (pairedWithMe && mergeState === 'merged') {
        action = <button className="unmerge" onClick={unmergeAvatar} title={`Unmerge from ${name || 'This Device'}`}>
            <span className="material-icons">link_off</span>Unmerge
        </button>;
    } else if (pairedWithMe) {
        action = <button onClick={pairAndMerge} title={`Merge with ${name || 'This Device'}`}>Merge</button>;
    } else if (remoteBusy) {
        action = <button disabled>Already Merged</button>;
    } else {
        action = <button onClick={pairAndMerge} disabled={!localAvatar || localBusy} title={`Pair and Merge with ${name || 'This Device'}`}>
            Pair and Merge
        </button>;
    }

    return <div className={`xr-pairing-user${pairedWithMe ? ' paired' : ''}${localBusy || remoteBusy ? ' unavailable' : ''}`}>
        <span className="material-icons">{pairedWithMe && mergeState === 'merged' ? 'link' : 'person'}</span>
        <span className="xr-pairing-user-name">{name || 'Unnamed User'}</span>
        <small>{getDeviceLabel(deviceType, deviceClass)}</small>
        {action}
    </div>;
}

function AvatarsDisabledNotice() {
    const [enabled, setEnabled] = useProperty('enabled');
    if (enabled) return null;

    return <div className="xr-pairing-notice">
        <p>Avatars are turned off, so other devices cannot be found.</p>
        <button onClick={() => setEnabled(true)}>Turn On Avatars</button>
    </div>;
}

const DEFAULT_OWN_USER_NAME = 'XR User';

function OwnUserRenamer() {
    const [name, setName] = useProperty('name');
    return <input
        value={name || ''}
        onChange={e => setName(e.target.value)}
        placeholder="Your Name"
        title="Rename User" />;
}

// Lets the XR-capable device act as its own user instead of merging with a laptop user
function OwnUserOption({ ownUser, setOwnUser, localUser, setLocalUser, localAvatar }) {
    const [newName, setNewName] = useState(DEFAULT_OWN_USER_NAME);
    const usingOwnUser = !!ownUser && localUser === ownUser;
    const paired = !!localAvatar && localAvatar.mergeState !== 'unpaired';

    const useOwnUser = async () => {
        if (paired) return;

        // Reuse the user created earlier on this device instead of creating a new one every time
        if (ownUser) {
            await setLocalUser(ownUser);
            return;
        }

        const uuid = await VarvEngine.getConceptFromType('User').create(null, {
            name: newName.trim() || DEFAULT_OWN_USER_NAME
        });
        setOwnUser(uuid);
        await setLocalUser(uuid);
    };

    if (usingOwnUser && !paired) {
        return <div className="xr-pairing-own-user active">
            <span className="material-icons">person</span>
            <span>Using This Device as</span>
            <Varv concept="UserManager">
                <Varv property="localUser">
                    <OwnUserRenamer />
                </Varv>
            </Varv>
        </div>;
    }

    return <div className={`xr-pairing-own-user${paired ? ' unavailable' : ''}`}>
        <span className="material-icons">person_add</span>
        {ownUser
            ? <span className="xr-pairing-own-user-label">Use This Device as Its Own User</span>
            : <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Your Name"
                disabled={paired}
                title="Name of Own User" />}
        <button onClick={useOwnUser} disabled={paired} title={paired ? 'Unmerge First to Use as Own User' : 'Use as Own User'}>
            Use as Own User
        </button>
    </div>;
}

function XRPairing() {
    const [localUser, setLocalUser] = useProperty('localUser');
    const [ownUser, setOwnUser] = useState(null);
    const [currentView, setCurrentView] = useProperty('currentView');
    const [localAvatar, setLocalAvatar] = useState(null);
    const sessionActive = useXRSessionActive();
    useStalePairCleanup();

    // The local camera avatar is only transmitted from the 3D scene view
    useEffect(() => {
        if (currentView && currentView !== '3D') setCurrentView('3D');
    }, [currentView, setCurrentView]);

    if (sessionActive) return null;

    const merged = localAvatar?.mergeState === 'merged';
    const usingOwnUser = !!ownUser && localUser === ownUser && localAvatar?.mergeState === 'unpaired';

    return <div className="xr-pairing">
        <div className="xr-pairing-panel">
            <div className="xr-pairing-headline">Pair With a User</div>
            <p>Choose the laptop user in this space whose device you want to pair and merge with. You can merge with one user at a time.</p>

            <Varv concept="AvatarManager">
                <AvatarsDisabledNotice />
            </Varv>

            <div className="xr-pairing-list">
                <Varv concept="Avatar">
                    <PairingCandidate localAvatar={localAvatar} setLocalUser={setLocalUser} />
                </Varv>
            </div>

            <div className="xr-pairing-subheadline">Or Use This Device on Its Own</div>
            <OwnUserOption
                ownUser={ownUser}
                setOwnUser={setOwnUser}
                localUser={localUser}
                setLocalUser={setLocalUser}
                localAvatar={localAvatar} />

            <Varv concept="Avatar">
                <LocalAvatarReporter setLocalAvatar={setLocalAvatar} />
            </Varv>

            {merged || usingOwnUser ? <div className="xr-pairing-actions">
                <IfSessionModeSupported mode="immersive-vr">
                    <button onClick={() => enterSession('immersive-vr')}>
                        <span className="material-icons">view_in_ar</span>Enter VR
                    </button>
                </IfSessionModeSupported>
                <IfSessionModeSupported mode="immersive-ar">
                    <button onClick={() => enterSession('immersive-ar')}>
                        <span className="material-icons">visibility</span>Enter AR
                    </button>
                </IfSessionModeSupported>
            </div> : null}
        </div>
    </div>;
}

export function Main() {
    return <Varv concept="UserManager">
        <Varv concept="SpaceManager">
            <XRPairing />
        </Varv>
    </Varv>;
}
