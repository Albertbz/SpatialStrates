import { Vector3, Quaternion, Euler } from 'three';



export const devicePositionWithOffset = (device, offset = 0) => {
    let x = 0;
    let y = 0;
    let z = 0;

    if (device) {
        // World transforms are used, as devices can be nested, e.g., the XR camera inside the XR origin
        const position = device.getWorldPosition(new Vector3());

        // If the distance option is given we move the position in the direction the device is looking
        if (offset != 0) {
            const direction = new Vector3(0, 0, -1);
            direction.applyQuaternion(device.getWorldQuaternion(new Quaternion()));
            position.add(direction.multiplyScalar(offset));
        }

        x = position.x;
        y = position.y;
        z = position.z;
    }

    return [x, y, z];
};

export const deviceRotation = (device) => {
    let x = 0;
    let y = 0;
    let z = 0;

    if (device) {
        const rotation = new Euler().setFromQuaternion(device.getWorldQuaternion(new Quaternion()), device.rotation.order);
        x = rotation.x;
        y = rotation.y;
        z = rotation.z;
    }

    return [x, y, z];
};

export const getDeviceFromInputEvent = (e) => {
    let device;

    if (e.nativeEvent?.inputSource?.handedness) {
        if (e.nativeEvent?.inputSource?.hand === null) {
            device = e.nativeEvent.inputSource.handedness === 'right' ? window.moduleDeviceManager.controllerRight?.object : window.moduleDeviceManager.controllerLeft?.object;
        } else {
            device = e.nativeEvent.inputSource.handedness === 'right' ? window.moduleDeviceManager.handRight?.object : window.moduleDeviceManager.handLeft?.object;
        }
    } else {
        device = window.moduleDeviceManager.camera;
    }

    if (!device) {
        console.warn('No device found.');
        return;
    } else {
        return device;
    }
};
