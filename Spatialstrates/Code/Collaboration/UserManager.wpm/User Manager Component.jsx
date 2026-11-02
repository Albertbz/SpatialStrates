import React from 'react';
const { useState, useEffect, useCallback, useRef } = React;
import { Varv, useProperty } from '#VarvReact';

import { Dialog } from '#Dialog .default';



const LOCAL_USER_RETRY_DELAY = 500;



function UserRenamer() {
    const [name, setName] = useProperty('name');
    return <label>
        Rename User
        <input value={name ? name : ''} onChange={e => setName(e.target.value)} title='Rename User' />
    </label>;
}

// A user is in use when another connected device has chosen it
const isClaimedByOtherClient = (claimedBy, clients) => {
    return !!claimedBy && claimedBy !== webstrate.clientId && clients.includes(claimedBy);
};

// Users created before claiming existed may not have a claim stored yet
const getClaimedBy = async (userConcept, userId) => {
    try {
        return await userConcept.getPropertyValue(userId, 'claimedBy') || '';
    } catch (e) {
        return '';
    }
};

function useConnectedClients() {
    const [clients, setClients] = useState(() => [...webstrate.clients]);

    useEffect(() => {
        const updateClients = () => setClients([...webstrate.clients]);
        webstrate.on('clientJoin', updateClients);
        webstrate.on('clientPart', updateClients);
        return () => {
            webstrate.off('clientJoin', updateClients);
            webstrate.off('clientPart', updateClients);
        };
    }, []);

    return clients;
}

function UserSelector({ selectUser, clients }) {
    const [name] = useProperty('name');
    const [claimedBy] = useProperty('claimedBy');
    const [localUser] = useProperty('localUser');
    const [uuid] = useProperty('concept::uuid');

    const isLocal = localUser == uuid;
    const inUse = isClaimedByOtherClient(claimedBy, clients);

    const deleteUser = (e) => {
        e.stopPropagation();
        VarvEngine.getConceptFromType('User').delete(uuid);
    };

    return <div
        className='user'
        local={isLocal ? 'true' : null}
        in-use={inUse ? 'true' : null}
        onClick={() => !inUse && selectUser(uuid)}
        title={inUse ? name + ' Is Used on Another Device' : 'Select User ' + name}>
        <span className="user-name">{name}</span>
        {inUse
            ? <span className="in-use-label">In Use</span>
            : <span className="delete-icon material-icons-outlined" onClick={deleteUser} title="Delete User">delete</span>}
    </div>;
}

// Claims the local user for this device and detects when another device has claimed it instead
function LocalUserClaimWatcher({ clients, onConflict }) {
    const [claimedBy, setClaimedBy] = useProperty('claimedBy');
    const inUse = isClaimedByOtherClient(claimedBy, clients);

    useEffect(() => {
        if (inUse) {
            onConflict();
        } else if (claimedBy !== webstrate.clientId) {
            // The Varv binding may not be ready yet, the effect runs again once the claim is loaded
            setClaimedBy(webstrate.clientId).catch(() => {});
        }
    }, [inUse, claimedBy, setClaimedBy, onConflict]);

    return null;
}

function UserManager() {
    const [visible, setVisible] = useState(false);
    const [conflict, setConflict] = useState(false);
    const [localUser, setLocalUser] = useProperty('localUser');
    const clients = useConnectedClients();
    const userConcept = VarvEngine.getConceptFromType('User');

    const promptForUser = useCallback(() => {
        setConflict(true);
        setVisible(true);
    }, []);

    const claimUser = async (userId) => {
        const claimedBy = await getClaimedBy(userConcept, userId);
        if (isClaimedByOtherClient(claimedBy, webstrate.clients)) return false;

        const previousUser = localUser;
        await userConcept.setPropertyValue(userId, 'claimedBy', webstrate.clientId);
        await setLocalUser(userId);
        setConflict(false);

        // Release the previous user after switching, so other devices can choose it
        if (previousUser && previousUser !== userId &&
            await getClaimedBy(userConcept, previousUser) === webstrate.clientId) {
            await userConcept.setPropertyValue(previousUser, 'claimedBy', '');
        }
        return true;
    };

    // The setters from useProperty change on every render, so retries use the latest claimUser through a ref
    const claimUserRef = useRef(claimUser);
    claimUserRef.current = claimUser;
    const promptedRef = useRef(false);

    useEffect(() => {
        if (localUser) return;
        // Only prompt once, so the dialog can be closed without choosing a user
        if (promptedRef.current) return;

        let cancelled = false;
        let retryTimeout = null;
        let guestUser = null;

        const prompt = () => {
            if (cancelled) return;
            promptedRef.current = true;
            promptForUser();
        };

        const runAsync = async () => {
            try {
                const users = await VarvEngine.lookupInstances('User');
                if (users.length > 0) {
                    const claims = await Promise.all(users.map(user => getClaimedBy(userConcept, user)));
                    if (claims.some(claimedBy => isClaimedByOtherClient(claimedBy, webstrate.clients))) {
                        // Someone else has already chosen a user, so let this device choose its own
                        prompt();
                        return;
                    }
                    if (!await claimUserRef.current(users[0])) prompt();
                } else {
                    // Reuse the guest from a failed attempt instead of creating another one
                    if (!guestUser) guestUser = await userConcept.create(null, { name: 'Guest' });
                    await claimUserRef.current(guestUser);
                }
            } catch (e) {
                // Sometimes there are timing issues with `setLocalUser`, so retry until it succeeds
                if (!cancelled) retryTimeout = setTimeout(runAsync, LOCAL_USER_RETRY_DELAY);
            }
        };

        runAsync();
        return () => {
            cancelled = true;
            clearTimeout(retryTimeout);
        };
    }, [localUser]);

    const addUser = async () => {
        try {
            await claimUser(await userConcept.create(null, { name: 'New User ' + Math.floor(Math.random() * 1000) }));
        } catch (e) {
            console.error('Could not add user:', e);
        }
    };

    const selectUser = async (userId) => {
        try {
            await claimUser(userId);
        } catch (e) {
            console.error('Could not select user:', e);
        }
    };

    return <>
        <Dialog className="user-manager" visible={visible} setVisible={setVisible}>
            <div className="user-headline">User Manager</div>
            {conflict ? <div className="user-notice">
                <span className="material-icons">info</span>
                {localUser
                    ? 'Your user is already in use on another device. Choose a different user or create a new one.'
                    : 'Another device has already chosen a user. Choose a different user or create a new one.'}
            </div> : null}
            <div className="user-menu">
                <button title="Add User" onClick={addUser}>Add User</button>
                {conflict ? null : <Varv property="localUser">
                    <UserRenamer />
                </Varv>}
            </div>
            <div className="user-list">
                <Varv concept="User">
                    <UserSelector selectUser={selectUser} clients={clients} />
                </Varv>
            </div>
        </Dialog>

        {conflict ? null : <Varv property="localUser">
            <LocalUserClaimWatcher clients={clients} onConflict={promptForUser} />
        </Varv>}

        <div className="user-manager-button" onClick={() => setVisible(true)}>User Manager</div>
    </>;
}

export function Main() {
    return <Varv concept="UserManager">
        <UserManager />
    </Varv>;
}
