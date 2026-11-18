import React from 'react';
const { useEffect, useRef, useState } = React;
import { Varv, useProperty } from '#VarvReact';

import { doIfClicked } from '#StreamManager .default';
import { streamShare } from '#VideoStreamManager .default';



export function WebcamTile({ client, userName, inXR, partnerInXR, presenting, onClick, style }) {
    const videoRef = useRef(null);

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

        const detachStream = (streamClient) => {
            if (streamClient !== client || !videoRef.current) return;
            videoRef.current.srcObject = null;
        };

        streamShare.addStreamAddedListener(attachStream);
        streamShare.addStreamRemovedListener(detachStream);

        return () => {
            streamShare.removeStreamAddedListener(attachStream);
            streamShare.removeStreamRemovedListener(detachStream);
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, [client]);

    return <div
        className={`webcam-tile ${presenting ? 'presenting' : ''} ${onClick ? 'clickable' : ''}`}
        style={style}
        onClick={onClick}
        title={onClick ? `Watch ${userName || 'This User'}` : undefined}>
        <video ref={videoRef} autoPlay muted playsInline />
        {/* Headsets stop sending camera frames during an immersive session, so their stream turns black */}
        {inXR && <div className="in-xr-overlay">
            <span className="material-icons">view_in_ar</span>
            In XR
        </div>}
        {/* The video comes from a laptop merged with a headset that is currently in XR */}
        {!inXR && partnerInXR && <span className="tile-badge">
            <span className="material-icons">view_in_ar</span>
            In XR
        </span>}
        {presenting && <span className="tile-badge presenting-badge">
            <span className="material-icons">present_to_all</span>
            Presenting
        </span>}
        <span className="tile-name">{userName || client}</span>
    </div>;
}

const isInXR = (avatar) => avatar.deviceType === 'vr' || avatar.deviceType === 'ar';

// Picks one stream per user, preferring XR devices, so 2D and XR show the same webcam tiles
export async function loadWebcamTiles() {
    const videoConcept = VarvEngine.getConceptFromType('VideoStream');
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const videoInstances = await VarvEngine.lookupInstances('VideoStream');
    const avatarInstances = await VarvEngine.lookupInstances('Avatar');
    const avatars = [];

    for (const avatar of avatarInstances) {
        if (await avatarConcept.getPropertyValue(avatar, 'type') !== 'camera') continue;
        if (!await avatarConcept.getPropertyValue(avatar, 'active')) continue;
        avatars.push({
            uuid: avatar,
            client: await avatarConcept.getPropertyValue(avatar, 'client'),
            user: await avatarConcept.getPropertyValue(avatar, 'user'),
            userName: await avatarConcept.getPropertyValue(avatar, 'userName'),
            pairedAvatar: await avatarConcept.getPropertyValue(avatar, 'pairedAvatar'),
            mergeState: await avatarConcept.getPropertyValue(avatar, 'mergeState'),
            mergeRole: await avatarConcept.getPropertyValue(avatar, 'mergeRole'),
            deviceType: await avatarConcept.getPropertyValue(avatar, 'deviceType'),
            deviceClass: await avatarConcept.getPropertyValue(avatar, 'deviceClass'),
            view: await avatarConcept.getPropertyValue(avatar, 'view')
        });
    }

    const avatarByClient = new Map();
    for (const avatar of avatars) {
        const existing = avatarByClient.get(avatar.client);
        if (!existing || (existing.deviceType === 'browser' && avatar.deviceType !== 'browser')) {
            avatarByClient.set(avatar.client, avatar);
        }
    }
    const groups = new Map();
    for (const instance of videoInstances) {
        const client = await videoConcept.getPropertyValue(instance, 'client');
        const avatar = avatarByClient.get(client);
        if (!avatar) continue;

        const isMerged = avatar.mergeState === 'merged' && avatar.pairedAvatar;
        const groupKey = isMerged ? [avatar.uuid, avatar.pairedAvatar].sort().join(':') : client;
        const group = groups.get(groupKey) || { candidates: [] };
        group.candidates.push({ client, avatar });
        groups.set(groupKey, group);
    }

    const nextTiles = [...groups.values()].map(group => {
        group.candidates.sort((left, right) => {
            const devicePriority = { browser: 0, ar: 1, vr: 1 };
            const leftDevicePriority = devicePriority[left.avatar.deviceType] ?? 0;
            const rightDevicePriority = devicePriority[right.avatar.deviceType] ?? 0;
            if (leftDevicePriority !== rightDevicePriority) {
                return rightDevicePriority - leftDevicePriority;
            }
            if (left.avatar.deviceType === 'browser') {
                const leftClassPriority = left.avatar.deviceClass === 'laptop' ? 1 : 0;
                const rightClassPriority = right.avatar.deviceClass === 'laptop' ? 1 : 0;
                if (leftClassPriority !== rightClassPriority) {
                    return rightClassPriority - leftClassPriority;
                }
            }
            if (left.avatar.mergeRole === 'target') return -1;
            if (right.avatar.mergeRole === 'target') return 1;
            return 0;
        });
        // Prefer a device outside of XR, as headsets only send black frames while immersive
        const streaming = group.candidates.filter(candidate => streamShare.clientStreams.has(candidate.client));
        const selected = streaming.find(candidate => !isInXR(candidate.avatar)) || streaming[0];
        if (!selected) return null;

        // The merged headset does not need to share video itself to be shown as in XR
        const partner = selected.avatar.mergeState === 'merged'
            ? avatars.find(avatar => avatar.uuid === selected.avatar.pairedAvatar)
            : null;
        return {
            client: selected.client,
            user: selected.avatar.user,
            userName: selected.avatar.userName,
            inXR: isInXR(selected.avatar),
            partnerInXR: Boolean(partner && isInXR(partner)),
            key: selected.client
        };
    }).filter(Boolean);

    return nextTiles;
}

export function useWebcamTiles() {
    const [tiles, setTiles] = useState([]);

    useEffect(() => {
        let cancelled = false;
        const refreshTiles = async () => {
            const nextTiles = await loadWebcamTiles();
            if (!cancelled) setTiles(nextTiles);
        };

        refreshTiles().catch(error => console.error('Could not load webcam tiles:', error));
        const interval = setInterval(() => {
            refreshTiles().catch(error => console.error('Could not refresh webcam tiles:', error));
        }, 500);
        streamShare.addStreamAddedListener(refreshTiles);
        streamShare.addStreamRemovedListener(refreshTiles);

        return () => {
            cancelled = true;
            clearInterval(interval);
            streamShare.removeStreamAddedListener(refreshTiles);
            streamShare.removeStreamRemovedListener(refreshTiles);
        };
    }, []);

    return tiles;
}

// The grid is a sidebar next to the 2D canvas or the 3D view, like the participant panel of a video call
function WebcamGrid() {
    const tiles = useWebcamTiles();
    const [presenters] = useProperty('presenters'); // AvatarManager
    const [followedUser, setFollowedUser] = useProperty('followedUser'); // AvatarManager
    const [followMode, setFollowMode] = useProperty('followMode'); // AvatarManager

    const presenterUsers = Array.isArray(presenters) ? presenters : [];

    // The 2D canvas and the 3D view only make room for the sidebar while it has tiles
    const showSidebar = tiles.length > 0;
    useEffect(() => {
        document.body.classList.toggle('has-webcam-sidebar', showSidebar);
        return () => document.body.classList.remove('has-webcam-sidebar');
    }, [showSidebar]);

    // Clicking the tile of a presenter watches them
    const watchPresenter = (user) => {
        setFollowedUser(user);
        if (followMode === 'off') setFollowMode('pip');
    };

    return <div className="webcam-grid-panel">
        {tiles.map(tile => {
            const presenting = !!tile.user && presenterUsers.includes(tile.user);
            const canWatch = presenting && (tile.user !== followedUser || followMode === 'off');
            return <WebcamTile
                key={tile.key}
                client={tile.client}
                userName={tile.userName}
                inXR={tile.inXR}
                partnerInXR={tile.partnerInXR}
                presenting={presenting}
                onClick={canWatch ? () => watchPresenter(tile.user) : undefined} />;
        })}
    </div>;
}

export function Main() {
    return <Varv concept="SpaceManager">
        <Varv concept="AvatarManager">
            <WebcamGrid />
        </Varv>
    </Varv>;
}
