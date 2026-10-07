import React from 'react';
import { Varv, useProperty } from '#VarvReact';



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

    const modeLabel = deviceType === 'vr' ? 'VR' : deviceType === 'ar' ? 'AR' : 'Browser';
    const deviceLabel = deviceType === 'browser' && deviceClass === 'xr-browser'
        ? `${modeLabel} (XR-capable)`
        : deviceType === 'browser'
            ? `${modeLabel} (Laptop)`
            : modeLabel;
    const isLocalAvatar = client === webstrate.clientId;
    const canPair = localUser === user && !isLocalAvatar;

    const pairWithDevice = async (event) => {
        event.stopPropagation();
        const avatarConcept = VarvEngine.getConceptFromType('Avatar');
        const localAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
            and: [
                { property: 'client', equals: webstrate.clientId },
                { property: 'type', equals: 'camera' }
            ]
        }));
        const localAvatar = localAvatars[0];
        if (!localAvatar || localAvatar === avatarUUID) return;

        await avatarConcept.setPropertyValue(localAvatar, 'pairedAvatar', avatarUUID);
        await avatarConcept.setPropertyValue(localAvatar, 'mergeState', 'paired');
        await avatarConcept.setPropertyValue(avatarUUID, 'pairedAvatar', localAvatar);
        await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'paired');
    };

    const mergeWithDevice = async (event) => {
        event.stopPropagation();
        const avatarConcept = VarvEngine.getConceptFromType('Avatar');
        const localAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
            and: [
                { property: 'client', equals: webstrate.clientId },
                { property: 'type', equals: 'camera' }
            ]
        }));
        const localAvatar = localAvatars[0];
        if (!localAvatar || localAvatar === avatarUUID || mergeState !== 'paired') return;

        const localDeviceType = await avatarConcept.getPropertyValue(localAvatar, 'deviceType');
        const remoteDeviceType = await avatarConcept.getPropertyValue(avatarUUID, 'deviceType');
        const devicePriority = { browser: 0, ar: 1, vr: 2 };
        const localPriority = devicePriority[localDeviceType] || 0;
        const remotePriority = devicePriority[remoteDeviceType] || 0;
        const localIsTarget = localPriority > remotePriority ||
            (localPriority === remotePriority && webstrate.clientId > client);

        await avatarConcept.setPropertyValue(localAvatar, 'mergeState', 'merging');
        await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'merging');
        await avatarConcept.setPropertyValue(localAvatar, 'mergeRole', localIsTarget ? 'target' : 'source');
        await avatarConcept.setPropertyValue(avatarUUID, 'mergeRole', localIsTarget ? 'source' : 'target');

        setTimeout(async () => {
            const currentLocalAvatar = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
                and: [
                    { property: 'client', equals: webstrate.clientId },
                    { property: 'type', equals: 'camera' }
                ]
            }));
            if (!currentLocalAvatar[0]) return;

            await avatarConcept.setPropertyValue(currentLocalAvatar[0], 'mergeState', 'merged');
            await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'merged');
        }, 1000);
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
