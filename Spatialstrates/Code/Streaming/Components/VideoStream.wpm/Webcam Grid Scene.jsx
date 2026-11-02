import React from 'react';
const { useState, useEffect, useMemo, useRef, Suspense } = React;
import { Vector3, Quaternion, VideoTexture, SRGBColorSpace } from 'three';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Plane } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';

import { Text } from '#Spatialstrates .text';
import { QUERY_PREFIX, streamShare } from '#VideoStreamManager .default';
import { useWebcamTiles } from '#VideoStream .webcam-grid';



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

function WebcamTile({ client, userName, position }) {
    const video = useStreamVideo(client);

    const texture = useMemo(() => {
        if (!video) return null;
        const videoTexture = new VideoTexture(video);
        videoTexture.colorSpace = SRGBColorSpace;
        return videoTexture;
    }, [video]);

    // Crop the video to fill the tile, like object-fit: cover in the 2D grid
    useEffect(() => {
        if (!video || !texture) return;

        const updateCrop = () => {
            if (!video.videoWidth || !video.videoHeight) return;
            const videoAspect = video.videoWidth / video.videoHeight;
            if (videoAspect > TILE_ASPECT) {
                texture.repeat.set(TILE_ASPECT / videoAspect, 1);
            } else {
                texture.repeat.set(1, videoAspect / TILE_ASPECT);
            }
            texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
        };

        updateCrop();
        video.addEventListener('loadedmetadata', updateCrop);
        video.addEventListener('resize', updateCrop);

        return () => {
            video.removeEventListener('loadedmetadata', updateCrop);
            video.removeEventListener('resize', updateCrop);
            texture.dispose();
        };
    }, [video, texture]);

    return <group position={position}>
        <Plane args={[TILE_WIDTH + TILE_BORDER * 2, TILE_HEIGHT + TILE_BORDER * 2]} position={[0, 0, -0.001]}>
            <meshBasicMaterial color="#636363" transparent opacity={0.44} />
        </Plane>
        <Plane args={[TILE_WIDTH, TILE_HEIGHT]}>
            <meshBasicMaterial key={texture ? texture.uuid : 'empty'} toneMapped={false} color={texture ? 'white' : '#202020'} map={texture} />
        </Plane>
        <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
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

    const positions = useMemo(() => getTilePositions(tiles.length), [tiles.length]);

    // The group stays mounted while there are no tiles, so it keeps following the head
    return <group ref={groupRef} pointerEvents="none">
        <group position={GRID_OFFSET} rotation={[GRID_TILT, 0, 0]}>
            {tiles.map((tile, index) => <WebcamTile key={tile.key} client={tile.client} userName={tile.userName} position={positions[index]} />)}
        </group>
    </group>;
}

// The 2D webcam grid cannot be seen in an immersive session, so the same tiles are shown in the scene instead
function XRWebcamGrid() {
    const session = useXR((xr) => xr.session);
    return session ? <WebcamGridScene /> : null;
}

export function Main() {
    return <ErrorBoundary fallback={null}>
        <XRWebcamGrid />
    </ErrorBoundary>;
}
