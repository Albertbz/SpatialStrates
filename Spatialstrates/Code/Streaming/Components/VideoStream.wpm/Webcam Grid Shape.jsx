import React from 'react';
import { HTMLContainer } from 'tldraw';

import { MovableShapeUtil, MovableVarvScope } from '#Spatialstrates .movable-shape';
import { CANVAS_SCALE } from '#Spatialstrates .projection-helpers';
import { useWebcamTiles, WebcamTile } from '#VideoStream .webcam-grid';



// The sizes below are in meters, as in the 3D Webcam Grid Scene, and CANVAS_SCALE canvas units are one meter.
// That way the 2D grid keeps the same size relative to the sticky notes, which are 0.15 meters wide.
const UNITS_PER_METER = CANVAS_SCALE;
const MAX_COLUMNS = 4;
const TILE_WIDTH = 0.16 * UNITS_PER_METER;
const TILE_HEIGHT = TILE_WIDTH * 9 / 16;
const TILE_GAP = 0.01 * UNITS_PER_METER;
const FRAME_PADDING = 0.015 * UNITS_PER_METER;

// The outer size of the grid frame for a number of tiles, the same layout as getGridSize in the 3D scene
function getFrameSize(count) {
    const columns = Math.min(count, MAX_COLUMNS);
    const rows = Math.ceil(count / MAX_COLUMNS);
    return [
        columns * TILE_WIDTH + Math.max(columns - 1, 0) * TILE_GAP + FRAME_PADDING * 2,
        rows * TILE_HEIGHT + Math.max(rows - 1, 0) * TILE_GAP + FRAME_PADDING * 2
    ];
}

function WebcamGridShape({ shape }) {
    const tiles = useWebcamTiles();
    const [frameWidth, frameHeight] = getFrameSize(Math.max(tiles.length, 1));

    // The shape is the movable's bounds, while the frame hugs the tiles and is centered on the shape
    return <HTMLContainer title="Webcam Grid" style={{
        transform: 'translate(-50%, -50%)',
        width: shape.props.w + 'px',
        height: shape.props.h + 'px',
        overflow: 'visible',
        pointerEvents: 'none'
    }}>
        <div className="webcam-grid-shape" style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: frameWidth + 'px',
            height: frameHeight + 'px',
            boxSizing: 'border-box',
            padding: FRAME_PADDING + 'px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignContent: 'center',
            gap: TILE_GAP + 'px',
            borderRadius: '8px',
            backgroundColor: '#303030',
            boxShadow: 'rgba(100, 100, 111, 0.4) 0px 0px 4px 0px',
            pointerEvents: 'none'
        }}>
            {tiles.length > 0
                ? tiles.map(tile => <WebcamTile key={tile.key} client={tile.client} userName={tile.userName} inXR={tile.inXR} partnerInXR={tile.partnerInXR} style={{
                    width: TILE_WIDTH + 'px',
                    pointerEvents: 'none'
                }} />)
                : <span style={{ color: '#ffffffcc', fontSize: '8px', textAlign: 'center' }}>No Webcams</span>}
        </div>
    </HTMLContainer>;
}

class WebcamGridShapeUtil extends MovableShapeUtil {
    static type = 'WebcamGrid';

    getDefaultProps() {
        // The default bounds fit a single tile, which is the smallest grid
        const [width, height] = getFrameSize(1);
        return Object.assign(super.getDefaultProps(), {
            w: width,
            h: height
        });
    }

    component(shape) {
        return <MovableVarvScope shape={shape}>
            <WebcamGridShape shape={shape} />
        </MovableVarvScope>;
    }
}

export const Main = WebcamGridShapeUtil;
