import React from 'react';
const { useState, useEffect, useMemo, Suspense } = React;
import { ErrorBoundary } from 'react-error-boundary';
import { MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Varv, useProperty } from '#VarvReact';

import { Movable } from '#Spatialstrates .movable';
import { Text } from '#Spatialstrates .text';
import { useWebcamTiles } from '#VideoStream .webcam-grid';
import { WebcamGridTiles, getGridSize } from '#VideoStream .webcam-grid-scene';



const FRAME_PADDING = 0.015;
const FRAME_DEPTH = 0.01;
const EMPTY_SIZE = [0.16, 0.09];

const frameGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
const frameMaterial = new MeshStandardMaterial({ color: '#303030', metalness: 0.2, roughness: 0.5 });
const frameMaterialHovered = new MeshStandardMaterial({ color: '#505050', metalness: 0.2, roughness: 0.5 });



function WebcamGrid() {
    const tiles = useWebcamTiles();
    const [hovered] = useProperty('hovered');

    const [width, height] = tiles.length > 0 ? getGridSize(tiles.length) : EMPTY_SIZE;

    // The frame behind the tiles is the handle, so the grid can be grabbed anywhere
    const handle = useMemo(() => <mesh
        geometry={frameGeometry}
        material={hovered ? frameMaterialHovered : frameMaterial}
        position={[0, 0, -FRAME_DEPTH / 2 - 0.001]}
        scale={[width + FRAME_PADDING * 2, height + FRAME_PADDING * 2, FRAME_DEPTH]}
    />, [hovered, width, height]);

    return <Movable handle={handle}>
        {/* The tiles stack upwards from their origin, so they are moved down to be centered on the frame */}
        <group position={[0, -height / 2, 0]} pointerEvents="none">
            <WebcamGridTiles tiles={tiles} />
        </group>
        {tiles.length === 0 && <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
                <Text
                    position={[0, 0, 0.001]}
                    anchorX="center"
                    anchorY="middle"
                    color="#ffffffcc"
                    fontSize={0.01}
                    pointerEvents="none">
                    No Webcams
                </Text>
            </Suspense>
        </ErrorBoundary>}
    </Movable>;
}

function ModeReporter({ onModeChange }) {
    const [mode] = useProperty('mode');
    useEffect(() => onModeChange(mode), [mode, onModeChange]);
    return null;
}

// The mode is read in a sibling scope, as nesting the manager scope would hide the movable's own concept::uuid
function WebcamGridInMode() {
    const [mode, setMode] = useState(null);

    return <>
        <Varv concept="WebcamGridManager">
            <ModeReporter onModeChange={setMode} />
        </Varv>
        {mode === 'movable' ? <WebcamGrid /> : null}
    </>;
}

export function Main() {
    const [conceptType] = useProperty('concept::name');
    return conceptType === 'WebcamGrid' ? <ErrorBoundary fallback={null}>
        <WebcamGridInMode />
    </ErrorBoundary> : null;
}
