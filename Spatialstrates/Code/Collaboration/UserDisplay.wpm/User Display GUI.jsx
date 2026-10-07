import React from 'react';
import { Varv, useProperty } from '#VarvReact';



function UserIcon() {
    const [localUser] = useProperty('localUser');
    const [locationHash] = useProperty('locationHash'); // SpaceManager
    const [space] = useProperty('space');
    const [user] = useProperty('user');
    const [name] = useProperty('userName');
    const [deviceType] = useProperty('deviceType');
    const [type] = useProperty('type');
    const [active] = useProperty('active');

    if (type !== 'camera' || !active || space !== locationHash) return null;

    const deviceLabel = deviceType === 'vr' ? 'VR' : deviceType === 'ar' ? 'AR' : 'Browser';
    return <div className={`user-icon ${localUser === user ? 'local-user' : ''}`}>
        <span>{name || ''}</span>
        <small>{deviceLabel}</small>
    </div>;
}

export function Main() {
    return <Varv concept="UserManager">
        <Varv concept="SpaceManager">
            <div className="user-display">
                <Varv concept="Avatar">
                    <UserIcon />
                </Varv>
            </div>
        </Varv>
    </Varv>;
}
