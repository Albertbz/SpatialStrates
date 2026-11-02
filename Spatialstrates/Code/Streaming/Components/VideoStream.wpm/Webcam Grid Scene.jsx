import React from 'react';
const { useState, useEffect, useMemo, useRef, Suspense } = React;
import { Vector3, Quaternion, Euler, VideoTexture, CanvasTexture, SRGBColorSpace } from 'three';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Plane } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import { Varv, useProperty } from '#VarvReact';

import { Text } from '#Spatialstrates .text';
import { QUERY_PREFIX, streamShare } from '#VideoStreamManager .default';
import { useWebcamTiles, loadWebcamTiles } from '#VideoStream .webcam-grid';



const TILE_WIDTH = 0.16;
const TILE_ASPECT = 16 / 9;
const TILE_HEIGHT = TILE_WIDTH / TILE_ASPECT;
const TILE_GAP = 0.01;
const TILE_BORDER = 0.002;
const MAX_COLUMNS = 4;

// Where the grid sits relative to the head, below the line of sight like the grid at the bottom of the 2D GUI
const GRID_OFFSET = [0, -0.28, -0.9];
const GRID_TILT = 0.3;
const FOLLOW_SPEED = 4;

// How far in front of its tile a laptop following the grid looks out from
const VIEWPOINT_DISTANCE = 0.02;
const turnAroundQuaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();



// The Video Stream Manager keeps a hidden video element playing for every received stream
function useStreamVideo(client) {
    const [video, setVideo] = useState(() => document.querySelector(QUERY_PREFIX + client));

    useEffect(() => {
        const onAdded = (streamClient) => {
            if (streamClient === client) setVideo(document.querySelector(QUERY_PREFIX + client));
        };
        const onRemoved = (streamClient) => {
            if (streamClient === client) setVideo(null);
        };

        setVideo(document.querySelector(QUERY_PREFIX + client));
        streamShare.addStreamAddedListener(onAdded);
        streamShare.addStreamRemovedListener(onRemoved);

        return () => {
            streamShare.removeStreamAddedListener(onAdded);
            streamShare.removeStreamRemovedListener(onRemoved);
        };
    }, [client]);

    return video;
}

function useStream(client) {
    const [stream, setStream] = useState(() => streamShare.clientStreams.get(client) || null);

    useEffect(() => {
        const onAdded = (streamClient, addedStream) => {
            if (streamClient === client) setStream(addedStream);
        };
        const onRemoved = (streamClient) => {
            if (streamClient === client) setStream(null);
        };

        setStream(streamShare.clientStreams.get(client) || null);
        streamShare.addStreamAddedListener(onAdded);
        streamShare.addStreamRemovedListener(onRemoved);

        return () => {
            streamShare.removeStreamAddedListener(onAdded);
            streamShare.removeStreamRemovedListener(onRemoved);
        };
    }, [client]);

    return stream;
}

// Crops the video to fill the tile, like object-fit: cover in the 2D grid
function cropToTile(texture, width, height) {
    if (!width || !height) return;
    const videoAspect = width / height;
    if (videoAspect > TILE_ASPECT) {
        texture.repeat.set(TILE_ASPECT / videoAspect, 1);
    } else {
        texture.repeat.set(1, videoAspect / TILE_ASPECT);
    }
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
}

// The hidden video elements stop rendering frames once the page is behind an immersive session, so frames are read
// straight from the stream's video track instead, which keeps decoding
function useTrackTexture(stream) {
    const [texture, setTexture] = useState(null);

    useEffect(() => {
        const track = stream?.getVideoTracks()[0];
        if (!track || !window.MediaStreamTrackProcessor) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const canvasTexture = new CanvasTexture(canvas);
        canvasTexture.colorSpace = SRGBColorSpace;
        const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
        let cancelled = false;

        const readFrames = async () => {
            while (!cancelled) {
                const { value: frame, done } = await reader.read();
                if (done) break;
                if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
                    canvas.width = frame.displayWidth;
                    canvas.height = frame.displayHeight;
                    // Resizing the canvas requires a new GPU texture
                    canvasTexture.dispose();
                    cropToTile(canvasTexture, canvas.width, canvas.height);
                    setTexture(canvasTexture);
                }
                context.drawImage(frame, 0, 0);
                frame.close();
                canvasTexture.needsUpdate = true;
            }
        };
        readFrames().catch(error => {
            if (!cancelled) console.warn('Could not read webcam frames:', error);
        });

        return () => {
            cancelled = true;
            reader.cancel().catch(() => { });
            canvasTexture.dispose();
            setTexture(null);
        };
    }, [stream]);

    return texture;
}

// Fallback for browsers without MediaStreamTrackProcessor, which only updates outside of immersive sessions
function useVideoElementTexture(video) {
    const texture = useMemo(() => {
        if (!video || window.MediaStreamTrackProcessor) return null;
        const videoTexture = new VideoTexture(video);
        videoTexture.colorSpace = SRGBColorSpace;
        return videoTexture;
    }, [video]);

    useEffect(() => {
        if (!video || !texture) return;

        const updateCrop = () => cropToTile(texture, video.videoWidth, video.videoHeight);
        updateCrop();
        video.addEventListener('loadedmetadata', updateCrop);
        video.addEventListener('resize', updateCrop);

        return () => {
            video.removeEventListener('loadedmetadata', updateCrop);
            video.removeEventListener('resize', updateCrop);
            texture.dispose();
        };
    }, [video, texture]);

    return texture;
}

function WebcamTile({ client, userName, inXR, partnerInXR, position }) {
    const video = useStreamVideo(client);
    const stream = useStream(client);
    // Headsets stop sending camera frames during an immersive session, so their stream is not shown
    const trackTexture = useTrackTexture(inXR ? null : stream);
    const videoElementTexture = useVideoElementTexture(inXR ? null : video);
    const texture = trackTexture || videoElementTexture;

    return <group position={position}>
        <Plane args={[TILE_WIDTH + TILE_BORDER * 2, TILE_HEIGHT + TILE_BORDER * 2]} position={[0, 0, -0.001]}>
            <meshBasicMaterial color="#636363" transparent opacity={0.44} />
        </Plane>
        <Plane args={[TILE_WIDTH, TILE_HEIGHT]}>
            <meshBasicMaterial key={texture ? texture.uuid : 'empty'} toneMapped={false} color={texture ? 'white' : '#202020'} map={texture} />
        </Plane>
        <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
                {inXR && <Text
                    position={[0, 0, 0.001]}
                    anchorX="center"
                    anchorY="middle"
                    color="#ffffffcc"
                    fontSize={0.01}>
                    In XR
                </Text>}
                {!inXR && partnerInXR && <Text
                    position={[-TILE_WIDTH / 2 + 0.008, TILE_HEIGHT / 2 - 0.006, 0.001]}
                    anchorX="left"
                    anchorY="top"
                    color="white"
                    outlineWidth="5%"
                    outlineColor="black"
                    fontSize={0.008}>
                    In XR
                </Text>}
                <Text
                    position={[-TILE_WIDTH / 2 + 0.008, -TILE_HEIGHT / 2 + 0.006, 0.001]}
                    anchorX="left"
                    anchorY="bottom"
                    maxWidth={TILE_WIDTH - 0.016}
                    whiteSpace="nowrap"
                    clipRect={[0, -Infinity, TILE_WIDTH - 0.016, Infinity]}
                    color="white"
                    outlineWidth="5%"
                    outlineColor="black"
                    fontSize={0.008}>
                    {userName || client}
                </Text>
            </Suspense>
        </ErrorBoundary>
    </group>;
}

// Lays out the tiles in centered rows that stack upwards from the bottom, like the 2D grid
function getTilePositions(count) {
    const columns = Math.min(count, MAX_COLUMNS);
    const rows = Math.ceil(count / MAX_COLUMNS);
    const positions = [];

    for (let index = 0; index < count; index++) {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const tilesInRow = row === rows - 1 ? count - row * columns : columns;
        const x = (column - (tilesInRow - 1) / 2) * (TILE_WIDTH + TILE_GAP);
        const y = (rows - 1 - row) * (TILE_HEIGHT + TILE_GAP) + TILE_HEIGHT / 2;
        positions.push([x, y, 0]);
    }

    return positions;
}

export function getGridSize(count) {
    const columns = Math.min(count, MAX_COLUMNS);
    const rows = Math.ceil(count / MAX_COLUMNS);
    return [
        columns * TILE_WIDTH + Math.max(columns - 1, 0) * TILE_GAP,
        rows * TILE_HEIGHT + Math.max(rows - 1, 0) * TILE_GAP
    ];
}

// Where a laptop looks out from the movable webcam grid in a space, from its own tile if it has one, or null without a grid
export async function getWebcamGridViewpoint(space, client) {
    const managers = await VarvEngine.lookupInstances('WebcamGridManager');
    if (managers.length === 0) return null;
    if (await VarvEngine.getConceptFromType('WebcamGridManager').getPropertyValue(managers[0], 'mode') !== 'movable') return null;

    const gridConcept = VarvEngine.getConceptFromType('WebcamGrid');
    let grid = null;
    for (const uuid of await VarvEngine.lookupInstances('WebcamGrid')) {
        if (await gridConcept.getPropertyValue(uuid, 'space') === space) {
            grid = uuid;
            break;
        }
    }
    if (!grid) return null;

    // The movable grid centers its tiles vertically, see the Webcam Grid Component
    const tiles = await loadWebcamTiles();
    const index = tiles.findIndex(tile => tile.client === client);
    const position = new Vector3(0, 0, VIEWPOINT_DISTANCE);
    if (index >= 0) {
        const [x, y] = getTilePositions(tiles.length)[index];
        const [, height] = getGridSize(tiles.length);
        position.x = x;
        position.y = y - height / 2;
    }

    const gridPosition = await gridConcept.getPropertyValue(grid, 'position');
    const gridRotation = await gridConcept.getPropertyValue(grid, 'rotation');
    const quaternion = new Quaternion().setFromEuler(new Euler(gridRotation[0], gridRotation[1], gridRotation[2]));
    position.applyQuaternion(quaternion).add(new Vector3(gridPosition[0], gridPosition[1], gridPosition[2]));

    // The tiles face the room, so the camera is turned around to look the same way
    const rotation = new Euler().setFromQuaternion(quaternion.multiply(turnAroundQuaternion));
    return {
        position: position.toArray(),
        rotation: [rotation.x, rotation.y, rotation.z]
    };
}

export function WebcamGridTiles({ tiles }) {
    const positions = useMemo(() => getTilePositions(tiles.length), [tiles.length]);

    return tiles.map((tile, index) => <WebcamTile key={tile.key} client={tile.client} userName={tile.userName} inXR={tile.inXR} partnerInXR={tile.partnerInXR} position={positions[index]} />);
}

function WebcamGridScene() {
    const tiles = useWebcamTiles();
    const groupRef = useRef(null);
    const placed = useRef(false);

    // Follow the head lazily, so the grid stays in view without being rigidly attached to it
    useFrame((state, delta) => {
        const group = groupRef.current;
        if (!group) return;

        state.camera.getWorldQuaternion(tempQuaternion);
        state.camera.getWorldPosition(tempPosition);

        if (!placed.current) {
            group.position.copy(tempPosition);
            group.quaternion.copy(tempQuaternion);
            placed.current = true;
            return;
        }

        const alpha = 1 - Math.exp(-FOLLOW_SPEED * delta);
        group.position.lerp(tempPosition, alpha);
        group.quaternion.slerp(tempQuaternion, alpha);
    });

    // The group stays mounted while there are no tiles, so it keeps following the head
    return <group ref={groupRef} pointerEvents="none">
        <group position={GRID_OFFSET} rotation={[GRID_TILT, 0, 0]}>
            <WebcamGridTiles tiles={tiles} />
        </group>
    </group>;
}

// The 2D webcam grid cannot be seen in an immersive session, so the same tiles are shown in the scene instead
function XRWebcamGrid() {
    const session = useXR((xr) => xr.session);
    const [mode] = useProperty('mode');
    // In movable mode the grid is shown by the Webcam Grid movable instead
    return session && mode !== 'movable' ? <WebcamGridScene /> : null;
}

export function Main() {
    return <ErrorBoundary fallback={null}>
        <Varv concept="WebcamGridManager">
            <XRWebcamGrid />
        </Varv>
    </ErrorBoundary>;
}
