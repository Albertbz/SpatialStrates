import React from 'react';
import { HTMLContainer } from 'tldraw';

import { MovableShapeUtil, MovableVarvScope } from '#Spatialstrates .movable-shape';
import { CANVAS_SCALE } from '#Spatialstrates .projection-helpers';
import { useWebcamTiles, WebcamTile } from '#VideoStream .webcam-grid';



const MAX_COLUMNS = 4;

function WebcamGridShape({ shape }) {
    const tiles = useWebcamTiles();

    return <HTMLContainer title="Webcam Grid" style={{
        transform: 'translate(-50%, -50%)',
        width: shape.props.w + 'px',
        height: shape.props.h + 'px',
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(Math.min(tiles.length, MAX_COLUMNS), 1)}, 1fr)`,
        alignContent: 'center',
        gap: '4px',
        padding: '6px',
        overflow: 'hidden',
        borderRadius: '8px',
        backgroundColor: '#303030',
        boxShadow: 'rgba(100, 100, 111, 0.4) 0px 0px 4px 0px',
        pointerEvents: 'none'
    }}>
        {tiles.length > 0
            ? tiles.map(tile => <WebcamTile key={tile.key} client={tile.client} userName={tile.userName} inXR={tile.inXR} partnerInXR={tile.partnerInXR} style={{
                width: '100%',
                pointerEvents: 'none'
            }} />)
            : <span style={{ color: '#ffffffcc', fontSize: '12px', textAlign: 'center' }}>No Webcams</span>}
    </HTMLContainer>;
}

class WebcamGridShapeUtil extends MovableShapeUtil {
    static type = 'WebcamGrid';

    getDefaultProps() {
        return Object.assign(super.getDefaultProps(), {
            w: CANVAS_SCALE * 0.4,
            h: CANVAS_SCALE * 0.2
        });
    }

    component(shape) {
        return <MovableVarvScope shape={shape}>
            <WebcamGridShape shape={shape} />
        </MovableVarvScope>;
    }
}

export const Main = WebcamGridShapeUtil;
