import React from 'react';
const { useEffect, useRef } = React;
import { Vector3, Quaternion, Euler } from 'three';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Varv, useProperty } from '#VarvReact';

import { getMergeInfo, MERGE_SYNC_INTERVAL } from '#Avatar .merge-helpers';



// How quickly the laptop camera catches up with the headset, avatar poses only arrive every few hundred milliseconds
const FOLLOW_SMOOTHING = 6;

const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempEuler = new Euler(0, 0, 0, 'YXZ');
const tempForward = new Vector3();
const upAxis = new Vector3(0, 1, 0);

const getYaw = (quaternion) => {
    tempForward.set(0, 0, -1).applyQuaternion(quaternion);
    return Math.atan2(-tempForward.x, -tempForward.z);
};

const quaternionFromRotation = (rotation, target) => {
    return target.setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
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

    useEffect(() => {
        needsAlignment.current = !!session;
    }, [session]);

    // Starts a VR session where the merged laptop was looking from, so the view continues across devices.
    // AR sessions are not moved, as the virtual content has to stay registered with the physical room.
    const alignXROrigin = (frame) => {
        needsAlignment.current = false;

        const info = mergeInfo.current;
        const origin = window.moduleDeviceManager?.origin;
        if (mode !== 'immersive-vr' || !info || !origin) return;
        if (info.partner.view !== '3D' || !info.partner.position || !info.partner.rotation) return;

        const viewerPose = frame.getViewerPose(referenceSpace);
        if (!viewerPose) {
            // Tracking is not ready yet, try again next frame
            needsAlignment.current = true;
            return;
        }

        const { position: headPosition, orientation: headOrientation } = viewerPose.transform;
        const headYaw = getYaw(tempQuaternion.set(headOrientation.x, headOrientation.y, headOrientation.z, headOrientation.w));
        const partnerYaw = getYaw(quaternionFromRotation(info.partner.rotation, tempQuaternion));
        const originYaw = partnerYaw - headYaw;

        // Keep the floor height of the physical room, but match the horizontal position and the viewing direction
        tempPosition.set(headPosition.x, 0, headPosition.z).applyAxisAngle(upAxis, originYaw);
        origin.position.set(info.partner.position[0] - tempPosition.x, 0, info.partner.position[2] - tempPosition.z);
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
            // Mouse look would fight with the followed view
            window.moduleCameraControls?.controlsRef?.current?.unlock?.();
        }

        // Head roll is dropped, as it is uncomfortable to watch on a screen
        quaternionFromRotation(info.partner.rotation, tempQuaternion);
        tempEuler.setFromQuaternion(tempQuaternion, 'YXZ');
        tempEuler.z = 0;
        tempQuaternion.setFromEuler(tempEuler);

        const alpha = 1 - Math.exp(-FOLLOW_SMOOTHING * delta);
        cameraObject.position.lerp(tempPosition.fromArray(info.partner.position), alpha);
        cameraObject.quaternion.slerp(tempQuaternion, alpha);
        cameraObject.updateMatrixWorld(true);
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

export function Main() {
    return <Varv concept="SpaceManager">
        <MergeViewSync />
    </Varv>;
}
