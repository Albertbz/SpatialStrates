const initConcept = async () => {
    try {
        const managers = await VarvEngine.lookupInstances('WebcamGridManager');
        if (managers.length == 0) {
            await VarvEngine.getConceptFromType('WebcamGridManager').create(null, {});
        }
    } catch (e) {
        // Ignore
    }
};

VarvEngine.registerEventCallback('engineReloaded', () => {
    initConcept();
});
