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

export const pairWithAvatar = async (avatarUUID) => {
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const localAvatar = await findLocalCameraAvatar();
    if (!localAvatar || localAvatar === avatarUUID) return false;

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

        await avatarConcept.setPropertyValue(currentLocalAvatar, 'mergeState', 'merged');
        await avatarConcept.setPropertyValue(avatarUUID, 'mergeState', 'merged');
    }, MERGE_DELAY);
    return true;
};

export const getDeviceLabel = (deviceType, deviceClass) => {
    const modeLabel = deviceType === 'vr' ? 'VR' : deviceType === 'ar' ? 'AR' : 'Browser';
    if (deviceType !== 'browser') return modeLabel;
    return deviceClass === 'xr-browser' ? `${modeLabel} (XR-capable)` : `${modeLabel} (Laptop)`;
};
