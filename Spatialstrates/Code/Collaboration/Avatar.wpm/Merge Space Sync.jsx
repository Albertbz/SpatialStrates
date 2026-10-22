import React from 'react';
const { useEffect, useRef } = React;
import { Varv, useProperty } from '#VarvReact';

import { getMergeInfo, MERGE_SYNC_INTERVAL } from '#Avatar .merge-helpers';



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

export function Main() {
    return <Varv concept="SpaceManager">
        <MergeSpaceSync />
    </Varv>;
}
