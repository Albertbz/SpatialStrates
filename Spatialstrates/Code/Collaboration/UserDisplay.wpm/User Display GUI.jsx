import React from 'react';
import { Varv, useProperty } from '#VarvReact';

import { pairWithAvatar, mergeWithAvatar, getDeviceLabel } from '#UserDisplay .pairing-helpers';



function UserIcon() {
    const [localUser] = useProperty('localUser');
    const [locationHash] = useProperty('locationHash'); // SpaceManager
    const [space] = useProperty('space');
    const [user] = useProperty('user');
    const [avatarUUID] = useProperty('concept::uuid');
    const [client] = useProperty('client');
    const [name] = useProperty('userName');
    const [deviceType] = useProperty('deviceType');
    const [deviceClass] = useProperty('deviceClass');
    const [mergeRole] = useProperty('mergeRole');
    const [mergeState] = useProperty('mergeState');
    const [type] = useProperty('type');
    const [active] = useProperty('active');

    if (type !== 'camera' || !active || space !== locationHash || (mergeState === 'merged' && mergeRole === 'source')) return null;

    const deviceLabel = getDeviceLabel(deviceType, deviceClass);
    const isLocalAvatar = client === webstrate.clientId;
    const canPair = localUser === user && !isLocalAvatar;

    const pairWithDevice = (event) => {
        event.stopPropagation();
        pairWithAvatar(avatarUUID);
    };

    const mergeWithDevice = (event) => {
        event.stopPropagation();
        mergeWithAvatar(avatarUUID);
    };

    const action = mergeState === 'paired'
        ? <button onClick={mergeWithDevice} title={`Merge with ${name || 'this device'}`}>Merge</button>
        : mergeState === 'merging'
            ? <button disabled>Merging</button>
            : mergeState === 'merged'
                ? <button disabled>Merged</button>
                : <button onClick={pairWithDevice} title={`Pair with ${name || 'this device'}`}>Pair</button>;

    return <div className={`user-icon ${localUser === user ? 'local-user' : ''}`}>
        <span>{name || ''}</span>
        <small>{deviceLabel}</small>
        {canPair && action}
    </div>;
}

export function Main() {
    return <Varv concept="UserManager">
        <Varv concept="SpaceManager">
            <div className="user-display">
                <Varv concept="Avatar">
                    <UserIcon />
                </Varv>
            </div>
        </Varv>
    </Varv>;
}
