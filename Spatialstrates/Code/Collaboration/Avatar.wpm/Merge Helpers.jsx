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

// Shared between the follow status GUI, which looks up the presenters, the scene, which moves the camera, and the
// presenter view. Each fragment that imports this module gets its own instance, so the store has to live on the window.
if (!window.moduleFollowStore) {
    window.moduleFollowStore = create(() => ({
        status: 'none',
        target: 'view',
        gridMissing: false,
        presenters: [],
        followedUser: null,
        presenterName: '',
        presenterClient: null,
        space: null,
        position: null,
        rotation: null
    }));
}
export const useFollowStore = window.moduleFollowStore;

// Set by the presenter view to the client whose head its camera is in, so only that view hides the presenter's head.
// Like the store, the context has to be shared between the module instances of each importing fragment.
if (!window.modulePresenterViewContext) {
    window.modulePresenterViewContext = React.createContext(null);
}
export const PresenterViewContext = window.modulePresenterViewContext;

const getAvatarManager = async () => {
    const managers = await VarvEngine.lookupInstances('AvatarManager');
    return managers[0] || null;
};

// The users presenting their view, the most recent presenter last
export const getPresenterUsers = async () => {
    const manager = await getAvatarManager();
    if (!manager) return [];
    const presenters = await VarvEngine.getConceptFromType('AvatarManager').getPropertyValue(manager, 'presenters');
    return Array.isArray(presenters) ? presenters.filter(Boolean) : [];
};

export const setPresenting = async (user, presenting) => {
    const manager = await getAvatarManager();
    if (!manager || !user) return;
    const presenters = (await getPresenterUsers()).filter(presenter => presenter !== user);
    if (presenting) presenters.push(user);
    await VarvEngine.getConceptFromType('AvatarManager').setPropertyValue(manager, 'presenters', presenters);
};

// Returns every presenting user, with their camera avatar while it is in VR or AR, or null for the avatar otherwise
export const getPresenters = async () => {
    const presenterUsers = await getPresenterUsers();
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const userConcept = VarvEngine.getConceptFromType('User');
    const presenters = [];

    for (const user of presenterUsers) {
        const userAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
            and: [
                { property: 'user', equals: user },
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

        presenters.push({
            user,
            userName: await userConcept.getPropertyValue(user, 'name'),
            avatar: presenterAvatar ? {
                client: await avatarConcept.getPropertyValue(presenterAvatar, 'client'),
                position: await avatarConcept.getPropertyValue(presenterAvatar, 'position'),
                rotation: await avatarConcept.getPropertyValue(presenterAvatar, 'rotation'),
                space: await avatarConcept.getPropertyValue(presenterAvatar, 'space')
            } : null
        });
    }

    return presenters;
};

// The presenter this device watches: the chosen one while they present, otherwise the most recent one in XR
export const resolveFollowedPresenter = (presenters, followedUser) => {
    const chosen = presenters.find(presenter => presenter.user === followedUser);
    if (chosen) return chosen;
    const inXR = presenters.filter(presenter => presenter.avatar);
    return inXR[inXR.length - 1] || presenters[presenters.length - 1] || null;
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
