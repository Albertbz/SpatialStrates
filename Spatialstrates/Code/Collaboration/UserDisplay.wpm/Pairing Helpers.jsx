import React from 'react';
const { useEffect } = React;
import { useProperty } from '#VarvReact';



const MERGE_DELAY = 1000;

export const findLocalCameraAvatar = async () => {
    const localAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
        and: [
            { property: 'client', equals: webstrate.clientId },
            { property: 'type', equals: 'camera' }
        ]
    }));
    return localAvatars[0];
};

export const getLocalDeviceClass = (xrPlatform) => {
    return xrPlatform && xrPlatform !== 'None' ? 'xr-browser' : 'laptop';
};

// Merging is only allowed between an XR-capable device and a non-XR-capable device
export const canMergeDeviceClasses = (deviceClassA, deviceClassB) => {
    const deviceClasses = [deviceClassA, deviceClassB];
    return deviceClasses.includes('xr-browser') && deviceClasses.includes('laptop');
};

// A pair is stale when the paired avatar is gone or its client has left
const isPairStale = async (avatarConcept, avatarUUID) => {
    const pairedAvatar = await avatarConcept.getPropertyValue(avatarUUID, 'pairedAvatar');
    if (!pairedAvatar) return true;

    const avatars = await VarvEngine.lookupInstances('Avatar');
    if (!avatars.includes(pairedAvatar)) return true;

    const pairedClient = await avatarConcept.getPropertyValue(pairedAvatar, 'client');
    return !webstrate.clients.includes(pairedClient);
};

// Each avatar can only be paired or merged with one other avatar at a time
const isAvailableForPairing = async (avatarConcept, avatarUUID) => {
    if (await avatarConcept.getPropertyValue(avatarUUID, 'mergeState') === 'unpaired') return true;
    return isPairStale(avatarConcept, avatarUUID);
};

const resetPairState = async (avatarConcept, avatarUUID) => {
    await avatarConcept.setPropertyValue(avatarUUID, 'pairedAvatar', '');
    await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'unpaired');
    await avatarConcept.setPropertyValue(avatarUUID, 'mergeRole', 'none');
};

export const pairWithAvatar = async (avatarUUID) => {
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const localAvatar = await findLocalCameraAvatar();
    if (!localAvatar || localAvatar === avatarUUID) return false;

    const localDeviceClass = await avatarConcept.getPropertyValue(localAvatar, 'deviceClass');
    const remoteDeviceClass = await avatarConcept.getPropertyValue(avatarUUID, 'deviceClass');
    if (!canMergeDeviceClasses(localDeviceClass, remoteDeviceClass)) return false;

    if (!await isAvailableForPairing(avatarConcept, localAvatar)) return false;
    if (!await isAvailableForPairing(avatarConcept, avatarUUID)) return false;

    await avatarConcept.setPropertyValue(localAvatar, 'pairedAvatar', avatarUUID);
    await avatarConcept.setPropertyValue(localAvatar, 'mergeState', 'paired');
    await avatarConcept.setPropertyValue(avatarUUID, 'pairedAvatar', localAvatar);
    await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'paired');
    return true;
};

export const mergeWithAvatar = async (avatarUUID) => {
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const localAvatar = await findLocalCameraAvatar();
    if (!localAvatar || localAvatar === avatarUUID) return false;
    if (await avatarConcept.getPropertyValue(avatarUUID, 'mergeState') !== 'paired') return false;
    if (await avatarConcept.getPropertyValue(avatarUUID, 'pairedAvatar') !== localAvatar) return false;

    const client = await avatarConcept.getPropertyValue(avatarUUID, 'client');
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
        const currentLocalAvatar = await findLocalCameraAvatar();
        if (!currentLocalAvatar) return;
        // The devices may have been unmerged in the meantime
        if (await avatarConcept.getPropertyValue(currentLocalAvatar, 'mergeState') !== 'merging') return;
        if (await avatarConcept.getPropertyValue(avatarUUID, 'mergeState') !== 'merging') return;

        await avatarConcept.setPropertyValue(currentLocalAvatar, 'mergeState', 'merged');
        await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'merged');
    }, MERGE_DELAY);
    return true;
};

export const unmergeAvatar = async () => {
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const localAvatar = await findLocalCameraAvatar();
    if (!localAvatar) return false;

    const pairedAvatar = await avatarConcept.getPropertyValue(localAvatar, 'pairedAvatar');
    await resetPairState(avatarConcept, localAvatar);

    const avatars = await VarvEngine.lookupInstances('Avatar');
    if (pairedAvatar && avatars.includes(pairedAvatar) &&
        await avatarConcept.getPropertyValue(pairedAvatar, 'pairedAvatar') === localAvatar) {
        await resetPairState(avatarConcept, pairedAvatar);
    }
    return true;
};

// Frees the local avatar again when the device it was paired with leaves
export function useStalePairCleanup() {
    useEffect(() => {
        const cleanup = async () => {
            const avatarConcept = VarvEngine.getConceptFromType('Avatar');
            const localAvatar = await findLocalCameraAvatar();
            if (!localAvatar) return;
            if (await avatarConcept.getPropertyValue(localAvatar, 'mergeState') === 'unpaired') return;

            if (await isPairStale(avatarConcept, localAvatar)) {
                await resetPairState(avatarConcept, localAvatar);
            }
        };

        webstrate.on('clientPart', cleanup);
        cleanup();
        return () => webstrate.off('clientPart', cleanup);
    }, []);
}

export function LocalAvatarReporter({ setLocalAvatar }) {
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

export const getDeviceLabel = (deviceType, deviceClass) => {
    const modeLabel = deviceType === 'vr' ? 'VR' : deviceType === 'ar' ? 'AR' : 'Browser';
    if (deviceType !== 'browser') return modeLabel;
    return deviceClass === 'xr-browser' ? `${modeLabel} (XR-capable)` : `${modeLabel} (Laptop)`;
};
