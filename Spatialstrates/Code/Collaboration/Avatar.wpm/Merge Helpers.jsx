import React from 'react';
const { useState, useEffect } = React;



export const MERGE_SYNC_INTERVAL = 200;

// Returns the local camera avatar and its merge partner, or null when this device is not merged
export const getMergeInfo = async () => {
    const avatarConcept = VarvEngine.getConceptFromType('Avatar');
    const localAvatars = await VarvEngine.lookupInstances('Avatar', FilterAction.constructFilter({
        and: [
            { property: 'client', equals: webstrate.clientId },
            { property: 'type', equals: 'camera' }
        ]
    }));
    const localAvatar = localAvatars[0];
    if (!localAvatar) return null;
    if (await avatarConcept.getPropertyValue(localAvatar, 'mergeState') !== 'merged') return null;

    const partnerAvatar = await avatarConcept.getPropertyValue(localAvatar, 'pairedAvatar');
    if (!partnerAvatar) return null;
    const avatars = await VarvEngine.lookupInstances('Avatar');
    if (!avatars.includes(partnerAvatar)) return null;
    if (await avatarConcept.getPropertyValue(partnerAvatar, 'pairedAvatar') !== localAvatar) return null;

    return {
        localAvatar,
        localRole: await avatarConcept.getPropertyValue(localAvatar, 'mergeRole'),
        partnerAvatar,
        partner: {
            client: await avatarConcept.getPropertyValue(partnerAvatar, 'client'),
            position: await avatarConcept.getPropertyValue(partnerAvatar, 'position'),
            rotation: await avatarConcept.getPropertyValue(partnerAvatar, 'rotation'),
            space: await avatarConcept.getPropertyValue(partnerAvatar, 'space'),
            deviceType: await avatarConcept.getPropertyValue(partnerAvatar, 'deviceType'),
            view: await avatarConcept.getPropertyValue(partnerAvatar, 'view')
        }
    };
};

// The client of the device this device is merged with, or null when this device is not merged
export function useMergePartnerClient() {
    const [partnerClient, setPartnerClient] = useState(null);

    useEffect(() => {
        let running = false;
        const interval = setInterval(async () => {
            if (running) return;
            running = true;
            try {
                const mergeInfo = await getMergeInfo();
                setPartnerClient(mergeInfo?.partner.client || null);
            } finally {
                running = false;
            }
        }, MERGE_SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    return partnerClient;
}
