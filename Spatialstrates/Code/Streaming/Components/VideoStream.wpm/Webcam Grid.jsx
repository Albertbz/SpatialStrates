import React from 'react';
const { useEffect, useRef, useState } = React;
import { Varv, useProperty } from '#VarvReact';

import { doIfClicked } from '#StreamManager .default';
import { streamShare } from '#VideoStreamManager .default';



function WebcamTile() {
    const [client] = useProperty('client');
    const [userName, setUserName] = useState('');
    const videoRef = useRef(null);

    useEffect(() => {
        if (!client) return;

        let cancelled = false;
        setUserName(client);

        const loadUserName = async () => {
            const avatarConcept = VarvEngine.getConceptFromType('Avatar');
            const avatarUUIDs = await VarvEngine.lookupInstances(
                'Avatar',
                new FilterProperty('client', FilterOps.equals, client)
            );

            let avatarUUID = avatarUUIDs[0];
            for (const uuid of avatarUUIDs) {
                if (await avatarConcept.getPropertyValue(uuid, 'type') === 'camera') {
                    avatarUUID = uuid;
                    break;
                }
            }

            if (!avatarUUID) return;

            const avatarUserName = await avatarConcept.getPropertyValue(avatarUUID, 'userName');
            if (!cancelled && avatarUserName) {
                setUserName(avatarUserName);
            }
        };

        loadUserName().catch((error) => {
            if (!cancelled) {
                console.error(`Could not load avatar name for webcam client ${client}:`, error);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [client]);

    useEffect(() => {
        if (!client) return;

        const attachStream = (streamClient, stream) => {
            if (streamClient !== client || !videoRef.current) return;

            videoRef.current.srcObject = stream;
            doIfClicked(() => {
                videoRef.current?.play().catch((error) => {
                    console.warn(`Could not play webcam stream for ${client}:`, error);
                });
            });
        };

        streamShare.addStreamAddedListener(attachStream);

        return () => {
            streamShare.removeStreamAddedListener(attachStream);
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, [client]);

    return <div className="webcam-tile" style={{
        position: 'relative',
        width: 'clamp(140px, 16vw, 240px)',
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        border: '1px solid #63636370',
        borderRadius: '8px',
        backgroundColor: '#202020',
        boxShadow: '0 2px 8px #00000055',
        pointerEvents: 'auto'
    }}>
        <video ref={videoRef} autoPlay muted playsInline style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
        }} />
        <span style={{
            position: 'absolute',
            left: '8px',
            bottom: '6px',
            maxWidth: 'calc(100% - 16px)',
            overflow: 'hidden',
            color: 'white',
            fontSize: '12px',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px black'
        }}>{userName}</span>
    </div>;
}

function WebcamGrid() {
    return <div className="webcam-grid" style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: '80px',
        zIndex: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 240px))',
        maxHeight: '35vh',
        justifyContent: 'center',
        gap: '8px',
        overflow: 'auto',
        pointerEvents: 'none'
    }}>
        <Varv concept="VideoStream">
            <WebcamTile />
        </Varv>
    </div>;
}

export function Main() {
    return <WebcamGrid />;
}
