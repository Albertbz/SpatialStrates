import React from 'react';
let { useState, useEffect, useRef, Suspense } = React;
import { ErrorBoundary } from 'react-error-boundary';
import { Vector3, Quaternion, Euler } from 'three';
import { useFrame } from '@react-three/fiber';
import { Cone, Gltf, useGLTF, Box, Billboard } from '@react-three/drei';
import { unzipSync } from 'fflate';
import { Varv, useProperty } from '#VarvReact';

import { Text } from '#Spatialstrates .text';
import { useMergePartnerClient, useFollowStore } from '#Avatar .merge-helpers';



let AudioStream;
if (Fragment.one('#AudioStream .default')) {
    const audioStreamModule = await Fragment.one('#AudioStream .default').require();
    AudioStream = audioStreamModule.AudioStream;
}


// The server hangs when serving larger files from inside a zip asset, so the whole zip is downloaded and unpacked here
const AVATAR_MODELS_ZIP = 'avatar-models.zip';
const avatarModelUrls = {};
try {
    const response = await fetch(AVATAR_MODELS_ZIP);
    if (!response.ok) throw new Error('Status ' + response.status);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    Object.entries(files).forEach(([fileName, data]) => {
        avatarModelUrls[fileName] = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }));
    });
} catch (e) {
    console.warn('Could not unpack the avatar models, falling back to loading them individually:', e);
}
const avatarModelUrl = (fileName) => avatarModelUrls[fileName] || AVATAR_MODELS_ZIP + '/' + fileName;

useGLTF.preload(avatarModelUrl('model-camera.glb'));
useGLTF.preload(avatarModelUrl('model-phone.glb'));
useGLTF.preload(avatarModelUrl('model-headset-quest.glb'));
useGLTF.preload(avatarModelUrl('model-headset-vision-pro.glb'));
useGLTF.preload('https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/meta-quest-touch-plus/left.glb');
useGLTF.preload('https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/meta-quest-touch-plus/right.glb');
useGLTF.preload('https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/left.glb');
useGLTF.preload('https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/right.glb');

const cameraModel = <Gltf src={avatarModelUrl('model-camera.glb')} scale={1} rotation={[0, Math.PI, 0]} />;
const phoneModel = <Gltf src={avatarModelUrl('model-phone.glb')} scale={0.01} />;
const headsetQuestModel = <Gltf src={avatarModelUrl('model-headset-quest.glb')} scale={0.9} rotation={[0, Math.PI, 0]} position={[0, 0.04, 0.11]} />;
const headsetVisionProModel = <Gltf src={avatarModelUrl('model-headset-vision-pro.glb')} scale={0.32} rotation={[0, Math.PI / 2, 0]} position={[0, -0.01, 0.115]} />;

const controllerLeftModel = <Gltf src='https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/meta-quest-touch-plus/left.glb' />;
const controllerRightModel = <Gltf src='https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/meta-quest-touch-plus/right.glb' />;
const handLeftModel = <Gltf src='https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/left.glb' rotation={[Math.PI / 2, -Math.PI / 2, -Math.PI / 8]} />;
const handRightModel = <Gltf src='https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/right.glb' rotation={[Math.PI / 2, Math.PI / 2, Math.PI / 8]} />;

const viewCone = <Cone args={[0.1, 0.1, 32]} position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
    <meshStandardMaterial color="skyblue" transparent={true} opacity={0.66} />
</Cone>;

// How quickly avatars catch up with their latest synced pose, poses only arrive every 100 milliseconds
const POSE_SMOOTHING = 15;

const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempEuler = new Euler();

const cursorModel = <Box args={[0.005, 0.005, 2]} position={[0, 0, 0]}>
    <meshBasicMaterial color="skyblue" />
</Box>;



function AvatarModel() {
    const [userName] = useProperty('userName');
    const [client] = useProperty('client');
    const [view] = useProperty('view');
    const [type] = useProperty('type');
    const [avatarXRPlatform] = useProperty('avatarXRPlatform');
    const [inputSourceProfile] = useProperty('inputSourceProfile');

    const [model, setModel] = useState(cameraModel);

    useEffect(() => {
        switch (type) {
            case 'camera':
                if (avatarXRPlatform === 'Quest') {
                    setModel(<> {headsetQuestModel} {viewCone} </>);
                } else if (avatarXRPlatform === 'Vision Pro') {
                    setModel(<> {headsetVisionProModel} {viewCone} </>);
                } else if (avatarXRPlatform === 'Android Mobile') {
                    setModel(<> {phoneModel} {viewCone} </>);
                } else {
                    setModel(<> {cameraModel} {viewCone} </>);
                }
                break;
            // TODO: Use the inputSourceProfile to determine the correct model
            case 'controllerLeft':
                setModel(controllerLeftModel);
                break;
            case 'controllerRight':
                setModel(controllerRightModel);
                break;
            case 'handLeft':
                setModel(handLeftModel);
                break;
            case 'handRight':
                setModel(handRightModel);
                break;
            case 'cursor':
                setModel(cursorModel);
                break;
            default:
                setModel(cameraModel);
        }
    }, [type, avatarXRPlatform, inputSourceProfile]);

    // TODO: This feature needs to be re-implemented
    // const [remoteControlled, setRemoteControlled] = useProperty('remoteControlled');
    // const [remoteControllingClient, setRemoteControllingClient] = useProperty('remoteControllingClient');

    // const remoteControlCallback = (newValue) => {
    //     setRemoteControlled(newValue);
    //     setRemoteControllingClient(newValue ? webstrate.clientId : '');
    // };

    return <>
        {view == '3D' || type == 'cursor' ? <>
            {/* {type == 'camera' ? <group
                onPointerDown={() => remoteControlCallback(true)}
                onPointerUp={() => remoteControlCallback(false)}> */}
            {/* Models and the name font load lazily, so a slow or failing download only affects this avatar */}
            <ErrorBoundary fallback={null}>
                <Suspense fallback={null}>
                    {model}
                </Suspense>
            </ErrorBoundary>
            {/* </group> : model} */}
            {type == 'camera' || type == 'cursor' ? <ErrorBoundary fallback={null}>
                <Suspense fallback={null}>
                    <Billboard position={type == 'camera' ? [0, 0.11, 0] : [0, 0.05, 0.0]}>
                        <Text
                            textAlign="center"
                            anchorX="center"
                            anchorY="middle"
                            color="black"
                            outlineWidth="5%"
                            outlineColor="white"
                            fontSize={0.05}>
                            {userName}
                        </Text>
                    </Billboard>
                </Suspense>
            </ErrorBoundary> : null}
        </> : null}
        {AudioStream ? <Varv property="clientAudioStream">
            <AudioStream client={client} />
        </Varv> : null}
    </>;
}

// Eases towards the latest synced pose instead of jumping to it when a new update arrives
function SmoothedGroup({ position, rotation, children }) {
    const groupRef = useRef();
    const initialized = useRef(false);

    useFrame((_state, delta) => {
        const group = groupRef.current;
        if (!group || !position || !rotation) return;

        tempPosition.fromArray(position);
        tempQuaternion.setFromEuler(tempEuler.set(rotation[0], rotation[1], rotation[2]));

        if (!initialized.current) {
            initialized.current = true;
            group.position.copy(tempPosition);
            group.quaternion.copy(tempQuaternion);
            return;
        }

        const alpha = 1 - Math.exp(-POSE_SMOOTHING * delta);
        group.position.lerp(tempPosition, alpha);
        group.quaternion.slerp(tempQuaternion, alpha);
    });

    return <group ref={groupRef}>
        {children}
    </group>;
}

function AvatarInSameSpace() {
    const [position] = useProperty('position');
    const [rotation] = useProperty('rotation');

    return <SmoothedGroup position={position} rotation={rotation}>
        <AvatarModel />
    </SmoothedGroup>;
}

// FIXME: Skip this case for now as it requires to also work in the other direction
// function AvatarInOtherSpace() {
//     const [boundaryOrigin] = useProperty('boundaryOrigin');
//     const [otherSpaceRelativePosition] = useProperty('otherSpaceRelativePosition');
//     const [otherSpaceRelativeRotation] = useProperty('otherSpaceRelativeRotation');

//     return <group position={boundaryOrigin}>
//         <group position={otherSpaceRelativePosition} rotation={otherSpaceRelativeRotation}>
//             <AvatarModel />
//         </group>
//     </group>;
// }

function AvatarInOtherContainer() {
    const [position] = useProperty('position'); // From container
    const [rotation] = useProperty('rotation'); // From container
    const [otherSpaceRelativePosition] = useProperty('otherSpaceRelativePosition');
    const [otherSpaceRelativeRotation] = useProperty('otherSpaceRelativeRotation');

    return <group position={position} rotation={rotation}>
        <SmoothedGroup position={otherSpaceRelativePosition} rotation={otherSpaceRelativeRotation}>
            <AvatarModel />
        </SmoothedGroup>
    </group>;
}

function Avatar({ hiddenClient, hiddenCameraClient }) {
    const [client] = useProperty('client');
    const [type] = useProperty('type');
    const [space] = useProperty('space');
    const [otherSpace] = useProperty('otherSpace');
    const [currentSpace] = useProperty('locationHash');
    const [active] = useProperty('active');
    const [mergeState] = useProperty('mergeState');
    const [mergeRole] = useProperty('mergeRole');

    const [location, setLocation] = useState('');
    const [targetContainer, setTargetContainer] = useState(null);

    useEffect(() => {
        if (!space || !currentSpace) {
            setLocation('');
            return;
        }

        const runAsync = async () => {
            if (space == currentSpace) {
                // Avatar is in the current space
                setLocation('same');
            } else if (otherSpace == currentSpace) {
                // Avatar is in another space but close to a container
                // that contains the current space
                setLocation('other');
            } else {
                const containerConcept = await VarvEngine.getConceptFromType('Container');

                const containersInCurrentSpace = await VarvEngine.lookupInstances(['Container'], FilterAction.constructFilter({
                    and: [
                        { property: 'space', equals: currentSpace },
                        { property: 'containedSpace', unequals: '' },
                        { property: 'collaborationLevel', equals: 'close' }
                    ]
                }));

                const containersWithOtherSpace = await Promise.all(containersInCurrentSpace.map(async container => {
                    return {
                        container: container,
                        containedSpace: await containerConcept.getPropertyValue(container, 'containedSpace')
                    };
                })).then(containers => containers.filter(container => {
                    return otherSpace == container.containedSpace;
                }));

                const newTargetContainer = containersWithOtherSpace.find(container => container.containedSpace == otherSpace);


                if (newTargetContainer) {
                    // Avatar is in another space but close to a container
                    // that contained space is also contained in the current scene
                    setTargetContainer(newTargetContainer.container);
                    setLocation('otherContainer');
                } else {
                    // Avatar is not visible
                    setTargetContainer(null);
                    setLocation('');
                }
            }
        };

        runAsync();
    }, [space, otherSpace, currentSpace]);

    if (mergeState === 'merged' && mergeRole === 'source') return null;
    // The device this device is merged with is part of the same user, so it would only obstruct the view
    if (hiddenClient && client === hiddenClient) return null;
    // The followed presenter's head is where the camera is, but their hands and controllers stay visible
    if (hiddenCameraClient && client === hiddenCameraClient && type === 'camera') return null;

    return active && location ? <>
        {location == 'same' ? <AvatarInSameSpace /> : null}
        {/* {location == 'other' ? <Varv property="locationHash">
            <AvatarInOtherSpace />
        </Varv> : null} */}
        {location == 'otherContainer' ? <Varv target={targetContainer}>
            <AvatarInOtherContainer />
        </Varv> : null}
    </> : null;
}

// FIXME: This does not work with the container case anymore
// function AvatarRemoteController() {
//     const [remoteControlled] = useProperty('remoteControlled');
//     const [position] = useProperty('position');
//     const [rotation] = useProperty('rotation');

//     const camera = useThree(state => state.camera);

//     useFrame(() => {
//         if (remoteControlled) {
//             camera.position.set(position[0], position[1], position[2]);
//             camera.rotation.set(rotation[0], rotation[1], rotation[2]);
//         }
//     });
// }

function Avatars() {
    const partnerClient = useMergePartnerClient();
    const followedClient = useFollowStore(state => state.status === 'following' ? state.presenterClient : null);

    return <>
        <Varv concept="Avatar" if="!isMine">
            <Avatar hiddenClient={partnerClient} hiddenCameraClient={followedClient} />
        </Varv>
        {/* <Varv concept="Avatar" if="isMine">
            <AvatarRemoteController />
        </Varv> */}
    </>;
}



export function Main() {
    return <Varv concept="AvatarManager" if="enabled">
        <Avatars />
    </Varv>;
}
