import React from 'react';
const { useEffect, useRef, Suspense } = React;
import { Canvas, useFrame } from '@react-three/fiber';
import { XR, createXRStore, noEvents } from '@react-three/xr';
import { Environment } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import { Varv, useProperty } from '#VarvReact';

import { useDynamicModules } from '#Spatialstrates .dynamic-components';
import { VirtualSceneEnvironment } from '#Spatialstrates .scene-view .basic-environment';
import { SpaceMovables } from '#Spatialstrates .scene-movables';
import { Container } from '#Spatialstrates .container';
import { Main as Avatars } from '#Avatar .avatar-component';
import { getMergeInfo, getPresenters, resolveFollowedPresenter, setPresenting, isXRDeviceType, followPose, useFollowStore, PresenterViewContext, MERGE_SYNC_INTERVAL } from '#Avatar .merge-helpers';
import { getWebcamGridViewpoint } from '#VideoStream .webcam-grid-scene';



// Merged devices act as one user, so the merge source always follows the space of the merge target
function MergeSpaceSync() {
    const [locationHash, setLocationHash] = useProperty('locationHash');
    const locationHashRef = useRef(locationHash);
    locationHashRef.current = locationHash;

    useEffect(() => {
        if (typeof setLocationHash !== 'function') return;

        let running = false;
        const interval = setInterval(async () => {
            if (running) return;
            running = true;
            try {
                const mergeInfo = await getMergeInfo();
                if (mergeInfo?.localRole !== 'source') return;

                const partnerSpace = mergeInfo.partner.space;
                if (partnerSpace && partnerSpace !== locationHashRef.current) {
                    setLocationHash(partnerSpace);
                }
            } finally {
                running = false;
            }
        }, MERGE_SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, [setLocationHash]);

    return null;
}

const getLocalCameraAvatar = async () => {
    const localAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
        and: [
            { property: 'client', equals: webstrate.clientId },
            { property: 'type', equals: 'camera' }
        ]
    }));
    return localAvatars[0] || null;
};

// Decides whether and how this device watches a presenter, and keeps it in the presenter's space while it does.
// In picture-in-picture, the presenter's view is shown in a small window next to the own view or the 2D canvas,
// in full view, the laptop camera follows the presenter in 3D.
function useFollowPresenter() {
    const [localUser] = useProperty('localUser'); // UserManager
    const [currentView] = useProperty('currentView'); // SpaceManager
    const [locationHash, setLocationHash] = useProperty('locationHash'); // SpaceManager
    const [followedUser] = useProperty('followedUser'); // AvatarManager
    const [followMode] = useProperty('followMode'); // AvatarManager
    const [followTarget] = useProperty('followTarget'); // AvatarManager

    const stateRef = useRef({});
    stateRef.current = { localUser, currentView, locationHash, followedUser, followMode, followTarget, setLocationHash };

    useEffect(() => {
        let running = false;
        const update = async () => {
            const { localUser, currentView, locationHash, followedUser, followMode, followTarget, setLocationHash } = stateRef.current;
            const presenters = await getPresenters();
            const mergeInfo = await getMergeInfo();
            const avatarConcept = VarvEngine.getConceptFromType('Avatar');
            const localAvatar = await getLocalCameraAvatar();
            const localDeviceType = localAvatar ? await avatarConcept.getPropertyValue(localAvatar, 'deviceType') : null;

            // Others can be watched while presenting oneself, e.g., from the laptop of a presenting user
            const others = presenters.filter(presenter => presenter.user !== localUser);
            const presenter = resolveFollowedPresenter(others, followedUser);
            const localPresenting = presenters.some(presenter => presenter.user === localUser);

            let status;
            if (presenters.length === 0 || isXRDeviceType(localDeviceType) || mergeInfo?.localRole === 'source') {
                // Devices in XR and laptops merged with a headset have their own view
                status = 'none';
            } else if (!presenter) {
                status = 'presenting';
            } else if (followMode === 'off') {
                status = 'paused';
            } else if (!presenter.avatar) {
                status = 'waiting';
            } else if (followMode === 'full' && currentView === '3D') {
                status = 'following';
            } else {
                status = 'pip';
            }

            // Others hide the avatar of a following laptop, as it sits in the presenter's head or in front of its tile
            if (localAvatar && await avatarConcept.getPropertyValue(localAvatar, 'followingPresenter') !== (status === 'following')) {
                await avatarConcept.setPropertyValue(localAvatar, 'followingPresenter', status === 'following');
            }

            const watching = ['following', 'pip'].includes(status);
            if (watching && presenter.avatar.space && presenter.avatar.space !== locationHash && typeof setLocationHash === 'function') {
                setLocationHash(presenter.avatar.space);
            }

            // Laptops can look out from their tile in the movable webcam grid instead of from the presenter's head
            const gridViewpoint = status === 'following' && followTarget === 'grid'
                ? await getWebcamGridViewpoint(presenter.avatar.space, webstrate.clientId)
                : null;

            useFollowStore.setState({
                status,
                localPresenting,
                target: gridViewpoint ? 'grid' : 'view',
                gridMissing: status === 'following' && followTarget === 'grid' && !gridViewpoint,
                presenters: others.map(other => ({ user: other.user, userName: other.userName, inXR: !!other.avatar })),
                followedUser: presenter?.user || null,
                presenterName: presenter?.userName || '',
                presenterClient: presenter?.avatar?.client || null,
                space: presenter?.avatar?.space || null,
                // The presenter view always shows the presenter's head, only the full view can follow the grid
                presenterPosition: presenter?.avatar?.position || null,
                presenterRotation: presenter?.avatar?.rotation || null,
                position: gridViewpoint?.position || presenter?.avatar?.position || null,
                rotation: gridViewpoint?.rotation || presenter?.avatar?.rotation || null
            });
        };

        const interval = setInterval(async () => {
            if (running) return;
            running = true;
            try {
                await update();
            } catch (error) {
                console.error('Could not update the followed presenter:', error);
            } finally {
                running = false;
            }
        }, MERGE_SYNC_INTERVAL);

        return () => {
            clearInterval(interval);
            useFollowStore.setState({ status: 'none' });
        };
    }, []);
}

// Picks which of several presenters to watch, only this device changes
function PresenterSwitcher() {
    const presenters = useFollowStore(state => state.presenters);
    const followedUser = useFollowStore(state => state.followedUser);
    const [, setFollowedUser] = useProperty('followedUser');

    if (presenters.length < 2) return null;
    return <select value={followedUser || ''} onChange={event => setFollowedUser(event.target.value)} title="Choose Presenter">
        {presenters.map(presenter => <option key={presenter.user} value={presenter.user}>
            {presenter.userName || 'Someone'}{presenter.inXR ? '' : ' (Not in XR)'}
        </option>)}
    </select>;
}

// Shows who is presenting, and lets this laptop choose how to watch them
function FollowStatus() {
    useFollowPresenter();
    const status = useFollowStore(state => state.status);
    const localPresenting = useFollowStore(state => state.localPresenting);
    const presenterCount = useFollowStore(state => state.presenters.length);
    const presenterName = useFollowStore(state => state.presenterName) || 'Someone';
    const target = useFollowStore(state => state.target);
    const gridMissing = useFollowStore(state => state.gridMissing);
    const [localUser] = useProperty('localUser'); // UserManager
    const [currentView] = useProperty('currentView'); // SpaceManager
    const [, setFollowMode] = useProperty('followMode'); // AvatarManager

    const stopPresentingButton = localPresenting
        ? <button onClick={() => setPresenting(localUser, false)}>Stop Presenting</button>
        : null;

    let message;
    let actions;
    switch (status) {
        case 'presenting':
            message = 'You are presenting your view';
            actions = stopPresentingButton;
            break;
        case 'paused':
            message = presenterCount > 1 ? `${presenterCount} people are presenting` : `${presenterName} is presenting`;
            actions = <button onClick={() => setFollowMode('pip')}>Watch</button>;
            break;
        case 'waiting':
            message = `Waiting for ${presenterName} to enter XR`;
            actions = <button onClick={() => setFollowMode('off')}>Stop Watching</button>;
            break;
        case 'pip':
            message = `Watching ${presenterName}`;
            actions = <>
                <button onClick={() => setFollowMode('full')}>{currentView === '3D' ? 'Follow View' : 'Full Screen'}</button>
                <button onClick={() => setFollowMode('off')}>Stop Watching</button>
            </>;
            break;
        case 'following':
            if (target === 'grid') {
                message = 'Following the webcam grid';
            } else if (gridMissing) {
                message = `Following ${presenterName} (no movable webcam grid)`;
            } else {
                message = `Following ${presenterName}`;
            }
            actions = <>
                <button onClick={() => setFollowMode('pip')}>Own View</button>
                <button onClick={() => setFollowMode('off')}>Stop Watching</button>
            </>;
            break;
        default:
            return null;
    }

    return <div className={`follow-status ${status}`}>
        <span className="material-icons">{status === 'presenting' ? 'present_to_all' : 'visibility'}</span>
        <span className="follow-status-message">{message}</span>
        {['pip', 'following', 'waiting'].includes(status) && <PresenterSwitcher />}
        {actions}
        {status !== 'presenting' && stopPresentingButton}
    </div>;
}

// The presenter view never enters a session, the store only lets XR-aware components render in it
const presenterViewStore = createXRStore({ emulate: false });

const CAMERA_SETTINGS = { fov: 70, near: 0.01, far: 200 };



// Looks out from the presenter's head, smoothed like a laptop following the presenter
function PresenterCamera() {
    const placed = useRef(false);

    useFrame((state, delta) => {
        const { presenterPosition, presenterRotation } = useFollowStore.getState();
        if (!presenterPosition || !presenterRotation) return;

        if (!placed.current) {
            state.camera.position.fromArray(presenterPosition);
            state.camera.rotation.set(presenterRotation[0], presenterRotation[1], presenterRotation[2]);
            placed.current = true;
        }
        followPose(state.camera, presenterPosition, presenterRotation, delta);
    });

    return null;
}

// A view-only copy of the scene in the presenter's space, without the transmitters and menus of the main scene
function PresenterScene() {
    const movableSceneComponents = useDynamicModules('.dynamic-movable-scene-component');
    const presenterClient = useFollowStore(state => state.presenterClient);

    return <PresenterViewContext.Provider value={presenterClient}>
        <PresenterCamera />
        <Environment preset="city" />
        <VirtualSceneEnvironment />
        <ErrorBoundary fallback={null}>
            <Avatars />
        </ErrorBoundary>
        <Varv property="locationHash">
            <SpaceMovables>
                {movableSceneComponents.map((Component, index) => (<Component key={index} />))}
                <Container movableSceneComponents={movableSceneComponents} />
            </SpaceMovables>
        </Varv>
    </PresenterViewContext.Provider>;
}

// The sidebar leaves room for the presenter view above the webcam tiles
function useSidebarSpace(reserve) {
    useEffect(() => {
        document.body.classList.toggle('has-presenter-view', reserve);
        return () => document.body.classList.remove('has-presenter-view');
    }, [reserve]);
}

function PresenterView() {
    const status = useFollowStore(state => state.status);
    const presenterName = useFollowStore(state => state.presenterName) || 'Someone';
    const [currentView] = useProperty('currentView'); // SpaceManager
    const [followMode, setFollowMode] = useProperty('followMode'); // AvatarManager

    const visible = status === 'pip';
    const expanded = visible && currentView === '2D' && followMode === 'full';
    useSidebarSpace(visible && !expanded);

    if (!visible) return null;

    const layout = expanded ? 'expanded' : 'sidebar';

    return <div className={`presenter-view-panel ${layout}`}>
        <div className="presenter-view-header">
            <span className="material-icons">visibility</span>
            <span className="presenter-view-name">{presenterName}</span>
            {currentView === '2D' && <button
                className="material-icons"
                onClick={() => setFollowMode(expanded ? 'pip' : 'full')}
                title={expanded ? 'Shrink View' : 'Expand View'}>
                {expanded ? 'close_fullscreen' : 'open_in_full'}
            </button>}
            <button className="material-icons" onClick={() => setFollowMode('off')} title="Stop Watching">close</button>
        </div>
        <div className="presenter-view-canvas">
            <Canvas dpr={1} camera={CAMERA_SETTINGS} gl={{ localClippingEnabled: true }} events={noEvents}>
                <Suspense fallback={null}>
                    <XR store={presenterViewStore}>
                        <PresenterScene />
                    </XR>
                </Suspense>
            </Canvas>
        </div>
    </div>;
}

export function Main() {
    return <>
        <Varv concept="SpaceManager">
            <MergeSpaceSync />
        </Varv>
        <Varv concept="UserManager">
            <Varv concept="SpaceManager">
                <Varv concept="AvatarManager">
                    <FollowStatus />
                    <ErrorBoundary fallback={null}>
                        <PresenterView />
                    </ErrorBoundary>
                </Varv>
            </Varv>
        </Varv>
    </>;
}
