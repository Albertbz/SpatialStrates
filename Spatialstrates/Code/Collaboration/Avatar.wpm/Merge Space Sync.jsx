import React from 'react';
const { useEffect, useRef } = React;
import { Varv, useProperty } from '#VarvReact';

import { getMergeInfo, getPresenterInfo, isXRDeviceType, useFollowStore, MERGE_SYNC_INTERVAL } from '#Avatar .merge-helpers';



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

// Decides whether this device follows the presenter, and keeps it in the presenter's space while it does
function useFollowPresenter() {
    const [localUser] = useProperty('localUser'); // UserManager
    const [currentView] = useProperty('currentView'); // SpaceManager
    const [locationHash, setLocationHash] = useProperty('locationHash'); // SpaceManager
    const [followPresenter] = useProperty('followPresenter'); // AvatarManager

    const stateRef = useRef({});
    stateRef.current = { localUser, currentView, locationHash, followPresenter, setLocationHash };

    useEffect(() => {
        let running = false;
        const update = async () => {
            const { localUser, currentView, locationHash, followPresenter, setLocationHash } = stateRef.current;
            const presenter = await getPresenterInfo();
            const mergeInfo = await getMergeInfo();
            const avatarConcept = VarvEngine.getConceptFromType('Avatar');
            const localAvatar = await getLocalCameraAvatar();
            const localDeviceType = localAvatar ? await avatarConcept.getPropertyValue(localAvatar, 'deviceType') : null;

            let status;
            if (!presenter || isXRDeviceType(localDeviceType) || mergeInfo?.localRole === 'source') {
                // Devices in XR and laptops merged with a headset have their own view
                status = 'none';
            } else if (presenter.user === localUser) {
                status = 'presenting';
            } else if (!followPresenter) {
                status = 'paused';
            } else if (!presenter.avatar) {
                status = 'waiting';
            } else if (currentView !== '3D') {
                status = 'view2D';
            } else {
                status = 'following';
            }

            // Others hide the avatar of a following laptop, as it sits right in the presenter's head
            if (localAvatar && await avatarConcept.getPropertyValue(localAvatar, 'followingPresenter') !== (status === 'following')) {
                await avatarConcept.setPropertyValue(localAvatar, 'followingPresenter', status === 'following');
            }

            const following = ['following', 'view2D'].includes(status);
            if (following && presenter.avatar.space && presenter.avatar.space !== locationHash && typeof setLocationHash === 'function') {
                setLocationHash(presenter.avatar.space);
            }

            useFollowStore.setState({
                status,
                presenterName: presenter?.userName || '',
                presenterClient: presenter?.avatar?.client || null,
                position: presenter?.avatar?.position || null,
                rotation: presenter?.avatar?.rotation || null
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

// Shows who is presenting, and lets this laptop stop or start following them
function FollowStatus() {
    useFollowPresenter();
    const status = useFollowStore(state => state.status);
    const presenterName = useFollowStore(state => state.presenterName) || 'Someone';
    const [, setFollowPresenter] = useProperty('followPresenter');
    const [, setPresenterUser] = useProperty('presenterUser');
    const [, setCurrentView] = useProperty('currentView');

    let message;
    let action;
    switch (status) {
        case 'presenting':
            message = 'You are presenting your view';
            action = <button onClick={() => setPresenterUser('')}>Stop Presenting</button>;
            break;
        case 'paused':
            message = `${presenterName} is presenting`;
            action = <button onClick={() => setFollowPresenter(true)}>Follow</button>;
            break;
        case 'waiting':
            message = `Waiting for ${presenterName} to enter XR`;
            action = <button onClick={() => setFollowPresenter(false)}>Stop Following</button>;
            break;
        case 'view2D':
            message = `Switch to 3D to follow ${presenterName}`;
            action = <button onClick={() => setCurrentView('3D')}>Switch to 3D</button>;
            break;
        case 'following':
            message = `Following ${presenterName}`;
            action = <button onClick={() => setFollowPresenter(false)}>Stop Following</button>;
            break;
        default:
            return null;
    }

    return <div className={`follow-status ${status}`}>
        <span className="material-icons">{status === 'presenting' ? 'present_to_all' : 'visibility'}</span>
        <span className="follow-status-message">{message}</span>
        {action}
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
                </Varv>
            </Varv>
        </Varv>
    </>;
}
