import React from 'react';
const { useEffect, useRef } = React;
import { Vector3, Quaternion, Euler } from 'three';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Varv, useProperty } from '#VarvReact';

import { getMergeInfo, getPresenters, resolveFollowedPresenter, isXRDeviceType, followPose, stopMouseLook, useFollowStore, MERGE_SYNC_INTERVAL } from '#Avatar .merge-helpers';



const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempForward = new Vector3();
const upAxis = new Vector3(0, 1, 0);

const getYaw = (quaternion) => {
    tempForward.set(0, 0, -1).applyQuaternion(quaternion);
    return Math.atan2(-tempForward.x, -tempForward.z);
};

const quaternionFromRotation = (rotation, target) => {
    return target.setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
};

// How far to the side of the presenter a remote user starts in VR, so they do not stand inside the people in the room
const PRESENTER_SIDE_OFFSET = 1;

// Where an unmerged headset starts in VR: where the user's laptop looks from in 3D, otherwise beside the presenter
const getEntryPose = async () => {
    const userManagers = await VarvEngine.lookupInstances('UserManager');
    const localUser = userManagers[0]
        ? await VarvEngine.getConceptFromType('UserManager').getPropertyValue(userManagers[0], 'localUser')
        : null;
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');

    if (localUser) {
        const userAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
            and: [
                { property: 'user', equals: localUser },
                { property: 'type', equals: 'camera' }
            ]
        }));
        for (const avatar of userAvatars) {
            const client = await avatarConcept.getPropertyValue(avatar, 'client');
            if (client === webstrate.clientId || !webstrate.clients.includes(client)) continue;
            if (!await avatarConcept.getPropertyValue(avatar, 'active')) continue;
            if (isXRDeviceType(await avatarConcept.getPropertyValue(avatar, 'deviceType'))) continue;
            if (await avatarConcept.getPropertyValue(avatar, 'view') !== '3D') continue;
            // A laptop following the presenter looks out from the presenter's head
            if (await avatarConcept.getPropertyValue(avatar, 'followingPresenter')) continue;
            return {
                position: await avatarConcept.getPropertyValue(avatar, 'position'),
                rotation: await avatarConcept.getPropertyValue(avatar, 'rotation')
            };
        }
    }

    const presenters = (await getPresenters()).filter(presenter => presenter.user !== localUser && presenter.avatar);
    const presenter = resolveFollowedPresenter(presenters, useFollowStore.getState().followedUser);
    if (!presenter) return null;

    const yaw = getYaw(quaternionFromRotation(presenter.avatar.rotation, new Quaternion()));
    const side = new Vector3(PRESENTER_SIDE_OFFSET, 0, 0).applyAxisAngle(upAxis, yaw);
    return {
        position: [presenter.avatar.position[0] + side.x, presenter.avatar.position[1], presenter.avatar.position[2] + side.z],
        rotation: [0, yaw, 0]
    };
};

function MergeViewSync() {
    const session = useXR((xr) => xr.session);
    const mode = useXR((xr) => xr.mode);
    const referenceSpace = useXR((xr) => xr.originReferenceSpace);
    const [currentView] = useProperty('currentView');
    const mergeInfo = useRef(null);
    const needsAlignment = useRef(false);
    const following = useRef(false);

    useEffect(() => {
        let running = false;
        const interval = setInterval(async () => {
            if (running) return;
            running = true;
            try {
                mergeInfo.current = await getMergeInfo();
            } finally {
                running = false;
            }
        }, MERGE_SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    // The entry pose of an unmerged headset is looked up once per session, and is undefined until it is known
    const entryPose = useRef(null);
    useEffect(() => {
        needsAlignment.current = !!session;
        entryPose.current = undefined;
        if (!session) return;

        let cancelled = false;
        getEntryPose().then(pose => {
            if (!cancelled) entryPose.current = pose;
        }).catch(error => {
            console.warn('Could not find where to start in VR:', error);
            if (!cancelled) entryPose.current = null;
        });
        return () => {
            cancelled = true;
        };
    }, [session]);

    // Starts a VR session where the merged laptop was looking from, so the view continues across devices.
    // Unmerged headsets start where the user's laptop looks from, or beside the presenter.
    // AR sessions are not moved, as the virtual content has to stay registered with the physical room.
    const alignXROrigin = (frame) => {
        needsAlignment.current = false;

        const info = mergeInfo.current;
        const origin = window.moduleDeviceManager?.origin;
        if (mode !== 'immersive-vr' || !origin) return;

        let target;
        if (info) {
            if (info.partner.view !== '3D' || !info.partner.position || !info.partner.rotation) return;
            target = info.partner;
        } else if (entryPose.current === undefined) {
            // The entry pose is still being looked up, try again next frame
            needsAlignment.current = true;
            return;
        } else if (entryPose.current?.position && entryPose.current?.rotation) {
            target = entryPose.current;
        } else {
            return;
        }

        const viewerPose = frame.getViewerPose(referenceSpace);
        if (!viewerPose) {
            // Tracking is not ready yet, try again next frame
            needsAlignment.current = true;
            return;
        }

        const { position: headPosition, orientation: headOrientation } = viewerPose.transform;
        const headYaw = getYaw(tempQuaternion.set(headOrientation.x, headOrientation.y, headOrientation.z, headOrientation.w));
        const targetYaw = getYaw(quaternionFromRotation(target.rotation, tempQuaternion));
        const originYaw = targetYaw - headYaw;

        // Keep the floor height of the physical room, but match the horizontal position and the viewing direction
        tempPosition.set(headPosition.x, 0, headPosition.z).applyAxisAngle(upAxis, originYaw);
        origin.position.set(target.position[0] - tempPosition.x, 0, target.position[2] - tempPosition.z);
        origin.rotation.set(0, originYaw, 0);
    };

    // While the merged headset is in VR or AR, the laptop camera follows the headset's view
    const followPartner = (delta) => {
        const info = mergeInfo.current;
        const shouldFollow = !!info &&
            info.localRole === 'source' &&
            ['vr', 'ar'].includes(info.partner.deviceType) &&
            currentView === '3D' &&
            !!info.partner.position &&
            !!info.partner.rotation;

        if (!shouldFollow) {
            following.current = false;
            return;
        }

        const cameraObject = window.moduleCameraControls?.getCameraObject?.();
        if (!cameraObject) return;

        if (!following.current) {
            following.current = true;
            stopMouseLook();
        }

        followPose(cameraObject, info.partner.position, info.partner.rotation, delta);
    };

    useFrame((_state, delta, frame) => {
        if (session) {
            if (needsAlignment.current && frame && referenceSpace) {
                alignXROrigin(frame);
            }
            return;
        }

        followPartner(delta);
    }, -99);

    return null;
}

// While following the presenter, the laptop camera moves along with the presenter's headset
function FollowViewSync() {
    const session = useXR((xr) => xr.session);
    const following = useRef(false);

    useFrame((_state, delta) => {
        const { status, position, rotation } = useFollowStore.getState();
        const cameraObject = window.moduleCameraControls?.getCameraObject?.();

        if (session || status !== 'following' || !position || !rotation || !cameraObject) {
            following.current = false;
            return;
        }

        if (!following.current) {
            following.current = true;
            stopMouseLook();
        }

        followPose(cameraObject, position, rotation, delta);
    }, -99);

    return null;
}

export function Main() {
    return <>
        <Varv concept="SpaceManager">
            <MergeViewSync />
        </Varv>
        <FollowViewSync />
    </>;
}
