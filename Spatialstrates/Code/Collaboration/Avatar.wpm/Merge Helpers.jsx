import React from 'react';
const { useState, useEffect } = React;
import { Vector3, Quaternion, Euler } from 'three';
import { create } from 'zustand';



export const MERGE_SYNC_INTERVAL = 100;

// How quickly the laptop camera catches up with the followed headset, avatar poses only arrive every few hundred milliseconds
const FOLLOW_SMOOTHING = 6;

const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempEuler = new Euler(0, 0, 0, 'YXZ');
const tempRotation = new Euler();

export const isXRDeviceType = (deviceType) => deviceType === 'vr' || deviceType === 'ar';

// Mouse look would fight with a followed view
export const stopMouseLook = () => {
    window.moduleCameraControls?.controlsRef?.current?.unlock?.();
};

// Moves the laptop camera smoothly towards a followed headset pose
export const followPose = (cameraObject, position, rotation, delta) => {
    // Head roll is dropped, as it is uncomfortable to watch on a screen
    tempQuaternion.setFromEuler(tempRotation.set(rotation[0], rotation[1], rotation[2]));
    tempEuler.setFromQuaternion(tempQuaternion, 'YXZ');
    tempEuler.z = 0;
    tempQuaternion.setFromEuler(tempEuler);

    const alpha = 1 - Math.exp(-FOLLOW_SMOOTHING * delta);
    cameraObject.position.lerp(tempPosition.fromArray(position), alpha);
    cameraObject.quaternion.slerp(tempQuaternion, alpha);
    cameraObject.updateMatrixWorld(true);
};

// Shared between the follow status GUI, which looks up the presenter, and the scene, which moves the camera.
// Each fragment that imports this module gets its own instance, so the store has to live on the window.
if (!window.moduleFollowStore) {
    window.moduleFollowStore = create(() => ({
        status: 'none',
        presenterName: '',
        presenterClient: null,
        position: null,
        rotation: null
    }));
}
export const useFollowStore = window.moduleFollowStore;

// Returns the presenting user and their camera avatar while it is in VR or AR, or null when nobody is presenting
export const getPresenterInfo = async () => {
    const managers = await VarvEngine.lookupInstances('AvatarManager');
    if (managers.length === 0) return null;
    const presenterUser = await VarvEngine.getConceptFromType('AvatarManager').getPropertyValue(managers[0], 'presenterUser');
    if (!presenterUser) return null;

    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const userAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
        and: [
            { property: 'user', equals: presenterUser },
            { property: 'type', equals: 'camera' }
        ]
    }));

    let presenterAvatar = null;
    for (const avatar of userAvatars) {
        if (!await avatarConcept.getPropertyValue(avatar, 'active')) continue;
        if (!webstrate.clients.includes(await avatarConcept.getPropertyValue(avatar, 'client'))) continue;
        if (!isXRDeviceType(await avatarConcept.getPropertyValue(avatar, 'deviceType'))) continue;
        presenterAvatar = avatar;
        break;
    }

    return {
        user: presenterUser,
        userName: await VarvEngine.getConceptFromType('User').getPropertyValue(presenterUser, 'name'),
        avatar: presenterAvatar ? {
            client: await avatarConcept.getPropertyValue(presenterAvatar, 'client'),
            position: await avatarConcept.getPropertyValue(presenterAvatar, 'position'),
            rotation: await avatarConcept.getPropertyValue(presenterAvatar, 'rotation'),
            space: await avatarConcept.getPropertyValue(presenterAvatar, 'space')
        } : null
    };
};

// Returns the local camera avatar and its merge partner, or null when this device is not merged
export const getMergeInfo = async () => {
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const localAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
        and: [
            { property: 'client', equals: webstrate.clientId },
            { property: 'type', equals: 'camera' }
        ]
    }));
    const localAvatar = localAvatars[0];
    if (!localAvatar) return null;
    if (await avatarConcept.getPropertyValue(localAvatar, 'mergeState') !== 'merged') return null;

    const partnerAvatar = await avatarConcept.getPropertyValue(localAvatar, 'pairedAvatar');
    if (!partnerAvatar) return null;
    const avatars = await VarvEngine.lookupInstances('Avatar');
    if (!avatars.includes(partnerAvatar)) return null;
    if (await avatarConcept.getPropertyValue(partnerAvatar, 'pairedAvatar') !== localAvatar) return null;

    return {
        localAvatar,
        localRole: await avatarConcept.getPropertyValue(localAvatar, 'mergeRole'),
        partnerAvatar,
        partner: {
            client: await avatarConcept.getPropertyValue(partnerAvatar, 'client'),
            position: await avatarConcept.getPropertyValue(partnerAvatar, 'position'),
            rotation: await avatarConcept.getPropertyValue(partnerAvatar, 'rotation'),
            space: await avatarConcept.getPropertyValue(partnerAvatar, 'space'),
            deviceType: await avatarConcept.getPropertyValue(partnerAvatar, 'deviceType'),
            view: await avatarConcept.getPropertyValue(partnerAvatar, 'view')
        }
    };
};

// The client of the device this device is merged with, or null when this device is not merged
export function useMergePartnerClient() {
    const [partnerClient, setPartnerClient] = useState(null);

    useEffect(() => {
        let running = false;
        const interval = setInterval(async () => {
            if (running) return;
            running = true;
            try {
                const mergeInfo = await getMergeInfo();
                setPartnerClient(mergeInfo?.partner.client || null);
            } finally {
                running = false;
            }
        }, MERGE_SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    return partnerClient;
}
