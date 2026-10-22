import React from 'react';
const { useState, useEffect } = React;
import { IfSessionModeSupported } from '@react-three/xr';
import { Varv, useProperty } from '#VarvReact';

import { pairWithAvatar, mergeWithAvatar, getDeviceLabel } from '#UserDisplay .pairing-helpers';



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

function LocalAvatarReporter({ setLocalAvatar }) {
    const [type] = useProperty('type');
    const [client] = useProperty('client');
    const [uuid] = useProperty('concept::uuid');
    const [mergeState] = useProperty('mergeState');

    const isLocalCamera = type === 'camera' && client === webstrate.clientId;

    useEffect(() => {
        if (!isLocalCamera) return;
        setLocalAvatar({ uuid, mergeState });
    }, [isLocalCamera, uuid, mergeState, setLocalAvatar]);

    return null;
}

function PairingCandidate({ localAvatar, setLocalUser }) {
    const [locationHash] = useProperty('locationHash'); // SpaceManager
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

    const pairedWithMe = !!localAvatar && pairedAvatar === localAvatar;
    // Devices that are merged into someone else are represented by their merge target
    if (mergeState === 'merged' && mergeRole === 'source' && !pairedWithMe) return null;

    const unavailable = mergeState !== 'unpaired' && !pairedWithMe;
    const status = pairedWithMe
        ? { paired: 'Paired', merging: 'Merging', merged: 'Merged' }[mergeState] || 'Paired'
        : unavailable ? 'Already Paired' : 'Pair and Merge';

    const selectUser = async () => {
        if (!localAvatar || unavailable || pairedWithMe) return;

        // Adopt the identity of the chosen user, so that both devices belong to the same user
        if (user) await setLocalUser(user);
        if (await pairWithAvatar(uuid)) {
            await mergeWithAvatar(uuid);
        }
    };

    return <button
        className={`xr-pairing-user${pairedWithMe ? ' paired' : ''}`}
        onClick={selectUser}
        disabled={!localAvatar || unavailable}
        title={`Pair and Merge with ${name || 'This Device'}`}>
        <span className="material-icons">{pairedWithMe && mergeState === 'merged' ? 'link' : 'person'}</span>
        <span className="xr-pairing-user-name">{name || 'Unnamed User'}</span>
        <small>{getDeviceLabel(deviceType, deviceClass)}</small>
        <span className="xr-pairing-user-status">{status}</span>
    </button>;
}

function AvatarsDisabledNotice() {
    const [enabled, setEnabled] = useProperty('enabled');
    if (enabled) return null;

    return <div className="xr-pairing-notice">
        <p>Avatars are turned off, so other devices cannot be found.</p>
        <button onClick={() => setEnabled(true)}>Turn On Avatars</button>
    </div>;
}

function XRPairing() {
    const [, setLocalUser] = useProperty('localUser');
    const [currentView, setCurrentView] = useProperty('currentView');
    const [localAvatar, setLocalAvatar] = useState(null);
    const sessionActive = useXRSessionActive();

    // The local camera avatar is only transmitted from the 3D scene view
    useEffect(() => {
        if (currentView && currentView !== '3D') setCurrentView('3D');
    }, [currentView, setCurrentView]);

    if (sessionActive) return null;

    const merged = localAvatar?.mergeState === 'merged';

    return <div className="xr-pairing">
        <div className="xr-pairing-panel">
            <div className="xr-pairing-headline">Pair With a User</div>
            <p>Choose the user in this space whose device you want to pair and merge with.</p>

            <Varv concept="AvatarManager">
                <AvatarsDisabledNotice />
            </Varv>

            <div className="xr-pairing-list">
                <Varv concept="Avatar">
                    <PairingCandidate localAvatar={localAvatar?.uuid} setLocalUser={setLocalUser} />
                </Varv>
            </div>

            <Varv concept="Avatar">
                <LocalAvatarReporter setLocalAvatar={setLocalAvatar} />
            </Varv>

            {merged ? <div className="xr-pairing-actions">
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
