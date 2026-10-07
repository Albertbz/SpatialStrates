const DEBUG = false;



export class StreamShare {
    /**
     * Creates a streamshare using the given element to signal
     * addition and removal of streams. Up to one stream per client
     * is possible for each element.
     */
    constructor(element) {
        let self = this;
        this.clientStreams = new Map();
        this.addedListeners = [];
        this.removedListeners = [];
        if (!element) throw new Error('Must provide an actual DOM element for signalling, was ', element);
        if (element.parentElement === undefined) throw new Error('StreamShare element must be in DOM');
        this.supported = true;
        if (!(element.webstrate && element.webstrate.signalStream)) {
            this.supported = false;
            if (DEBUG) console.log('StreamShare: The webstrate implementation or element does not support webstrate stream signalling, stream sharing is disabled', element);
            return;
        }
        this.element = element;

        this.element.webstrate.on('signalStream', function onSignalStream(clientId, meta, accept) {
            let con = accept(function (stream) {
                if (self.clientStreams.get(clientId)) {
                    if (DEBUG) console.log('StreamShare: Warning: Only one stream per client is supported per element but ' + clientId + ' shared another one...');
                }
                self.clientStreams.set(clientId, stream);
                self._onStreamAdded(clientId, stream);
            });
        });

        window.moduleStreamManager.streamShares.add(this);
    }

    stopSharing() {
        if (this.currentSignallingFunction) {
            this.element.webstrate.stopStreamSignal(this.currentSignallingFunction);
            this.currentSignallingFunction = null;
        }
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        this._onStreamRemoved(webstrate.clientId);
    }

    async shareStream(media, displayOptions = null) {
        let self = this;
        if (!this.supported) {
            console.log('Tried to share a stream on an unsupported StreamShare, see previous warnings');
            return;
        }

        // Get the stream
        if (!displayOptions) {
            console.error('displayOptions are required to share a stream.');
        }

        if (this.currentStream) {
            this.stopSharing();
        }
        if (media == 'displayMedia') {
            this.currentStream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
        } else {
            this.currentStream = await navigator.mediaDevices.getUserMedia(displayOptions);
        }
        this.currentSignallingFunction = function signalStream(clientId, accept) {
            let con = accept(self.currentStream, {}, () => {
                if (DEBUG) console.log('StreamShare: client ' + clientId + ' started receiving our streamshare');
            });
            con.onclose(() => {
                if (DEBUG) console.log('StreamShare: client ' + clientId + ' stopped receiving our streamshare');
            });
        };

        // Register the stream on the element
        if (DEBUG) console.log('StreamShare: Starting streamshare');
        this._onStreamAdded(webstrate.clientId, this.currentStream);
        this.element.webstrate.signalStream(this.currentSignallingFunction);
        return this.currentStream;
    }

    _onStreamAdded(client, stream) {
        // Notify listeners
        this.clientStreams.set(client, stream);
        this.addedListeners.forEach(listener => {
            listener(client, stream);
        });
    }
    _onStreamRemoved(client) {
        if (!this.clientStreams.has(client)) return;

        this.clientStreams.delete(client);
        this.removedListeners.forEach(listener => {
            listener(client);
        });
    }
    addStreamAddedListener(listener) {
        this.addedListeners.push(listener);

        // Backfill with current streams
        for (let [key, value] of this.clientStreams) {
            listener(key, value);
        }
    }
    removeStreamAddedListener(listener) {
        const index = this.addedListeners.indexOf(listener);
        if (index > -1) {
            this.addedListeners.splice(index, 1);
        }
    }
    addStreamRemovedListener(listener) {
        this.removedListeners.push(listener);
    }
    removeStreamRemovedListener(listener) {
        const index = this.removedListeners.indexOf(listener);
        if (index > -1) {
            this.removedListeners.splice(index, 1);
        }
    }
}

if (!window.moduleStreamManager) {
    window.moduleStreamManager = {
        clicked: false,
        cleanupConceptTypes: [],
        streamShares: new Set()
    };
    document.addEventListener('click', () => { window.moduleStreamManager.clicked = true; });

    const cleanup = async () => {
        // Remove stream metadata when a client leaves or joins
        for (const conceptType of window.moduleStreamManager.cleanupConceptTypes) {
            if (webstrate.clients.length < 1) return;
            let concept = VarvEngine.getConceptFromType(conceptType);
            let shares = await (VarvEngine.lookupInstances(conceptType));
            for (const share of shares) {
                const client = await concept.getPropertyValue(share, 'client');
                if (!webstrate.clients.includes(client)) {
                    await concept.delete(share);
                }
            }
        }
    };

    webstrate.on('clientPart', (clientId) => {
        window.moduleStreamManager.streamShares.forEach(streamShare => {
            streamShare._onStreamRemoved(clientId);
        });
        cleanup();
    });
    webstrate.on('clientJoin', cleanup);
}

export const doIfClicked = (callback) => {
    if (window.moduleStreamManager.clicked) {
        setTimeout(() => {
            callback();
        }, 200);
    } else {
        let called = false;
        document.addEventListener('click', () => {
            if (called) return;
            called = true;
            callback();
        });
    }
};

export const addCleanupConceptType = (type) => {
    window.moduleStreamManager.cleanupConceptTypes.push(type);
};
