let store = "directoryHandles";
let controlDirectoryName = '.ffs';
let metaFileName = 'ffs.meta';
let attributesFileName = 'ffs.attributes.json';
let domOrderFileName = 'ffs.dom-order.json';
let bootConfigFileName = 'wpm.bootconfig.json';
let bootConfigSelector = 'head script[type="text/json+bootconfig"]';
let folderElements = ["CODE-FOLDER", "WPM-PACKAGE"];
let extensionTypes = {
    "text/javascript": "js",
    "text/javascript+babel": "jsx",
    "text/slopscript+babel": "slop",
    "text/x-typescript": "ts",
    "text/python": "py",
    "text/ruby": "rb",
    "application/x-lua": "lua",
    "text/html": "html",
    "text/markdown": "md",
    "text/x-latex": "tex",
    "image/svg+xml": "svg",
    "application/json": "json",
    "wpm/descriptor": "json",
    "text/varv": "json",
    "text/css": "css",
    "text/x-scss": "scss"
}
let autoCloneAttributes = ["id", "data-repository", "auto", "class"];
let trackedAttributes = ['auto', 'data-type', 'class', 'id'];

class FragmentFilesystemSync {
    static isSupported() {
        if (!window) return false;
        if (!window.showDirectoryPicker) return false;
        if (!window.indexedDB) return false;
        if (!window.MutationObserver) return false;
        if (!window.BroadcastChannel) return false;
        if (!navigator.locks?.request) return false;
        return true;
    }

    constructor(dbname) {
        let self = this;
        this.isSyncing = false;
        this.isEnabled = false;
        this.syncState = 'disabled';
        this.fragmentLinks = [];
        this.directoryHandle = false;
        this.controlDirectoryHandle = false;
        this.pathMapping = new Map();
        this.nodeMapping = new Map();
        this.pendingFragmentLinkTimeouts = new Set();
        this.workerGeneration = 0;
        this.workerActive = false;
        this.lockRequestPromise = false;
        this.lockAbortController = false;
        this.syncDelayResolver = false;
        this.updater = false;
        this.isDestroyed = false;
        this.coordinationGeneration = 0;
        this.dbname = dbname;
        this.coordinationName = 'fragment-filesystem-sync:' + dbname + ':' + location.pathname;

        const request = indexedDB.open(dbname);
        request.onerror = (event) => {
            console.error("Failed to open filesystem sync IndexedDB", event);
        };
        request.onsuccess = (event) => {
            self.db = event.target.result;
            self.initializeCoordinationChannel();
            self.onPageLoad();
        };
        request.onupgradeneeded = (event) => {
            self.db = event.target.result;

            // Create an objectStore to hold file handles to directories
            self.db.createObjectStore(store, { keyPath: "webstrate" });
        }
    }

    get syncState() {
        return this._syncState;
    }

    set syncState(syncState) {
        if (this._syncState === syncState) return;
        this._syncState = syncState;
        try {
            this.onSyncStateChanged?.(syncState);
        } catch (error) {
            console.warn('Could not update the Fragment Filesystem Sync menu state', error);
        }
    }

    async onPageLoad() {
        let coordinationGeneration = this.coordinationGeneration;
        let directoryHandle = await this.getSavedHandle();
        if (coordinationGeneration !== this.coordinationGeneration) return;
        this.directoryHandle = directoryHandle;
        if (this.directoryHandle && !this.isDestroyed) {
            // Sync immediately
            this.isEnabled = true;
            this.syncState = 'waiting';
            this.enableSyncing();
        }
    }

    initializeCoordinationChannel() {
        if (this.coordinationChannel || this.isDestroyed) return;
        this.coordinationChannel = new BroadcastChannel(this.coordinationName);
        this.coordinationChannel.onmessage = (event) => {
            let coordinationGeneration = ++this.coordinationGeneration;
            this.onCoordinationMessage(event.data, coordinationGeneration);
        };
    }

    async onCoordinationMessage(message, coordinationGeneration) {
        if (this.isDestroyed || !message) return;

        if (message.type === 'enabled') {
            try {
                let handle = await this.getSavedHandle();
                if (!handle || this.isDestroyed || coordinationGeneration !== this.coordinationGeneration) return;
                let previousLockRequest = this.lockRequestPromise;
                if (previousLockRequest) {
                    this.disableSyncing();
                    await previousLockRequest;
                }
                if (this.isDestroyed || coordinationGeneration !== this.coordinationGeneration) return;
                this.directoryHandle = handle;
                this.isEnabled = true;
                this.syncState = 'waiting';
                this.enableSyncing();
            } catch (error) {
                console.error('Failed to enable Fragment Filesystem Sync in this tab', error);
                this.syncState = 'error';
            }
        } else if (message.type === 'disabled') {
            this.disableSyncing();
        }
    }

    getSavedHandle() {
        return new Promise((resolve, reject) => {
            let request = this.db.transaction(store).objectStore(store).get(location.pathname);
            request.onerror = (event) => {
                reject(event);
            };
            request.onsuccess = (event) => {
                resolve(request.result?.handle);
            };
        });
    }

    setDirectory(handle = false) {
        if (handle || !this.isSyncing) this.directoryHandle = handle;
        return new Promise((resolve, reject) => {
            let request;
            if (handle) {
                request = this.db.transaction(store, "readwrite").objectStore(store).put(
                    {
                        webstrate: location.pathname,
                        handle: handle
                    }
                );
            } else {
                request = this.db.transaction(store, "readwrite").objectStore(store).delete(location.pathname);
            }
            request.onerror = (event) => { reject(event); };
            request.onsuccess = resolve;
        });
    }

    async popupDirectoryPicker() {
        let directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        if (!directoryHandle) return;

        let needConfirm = true;

        // Check if folder is empty then it is ok
        let fileCount = 0;
        for await (const key of directoryHandle.keys()) {
            fileCount++;
        }
        if (fileCount === 0) needConfirm = false;

        // Check if folder already contains metadata for this webstrate then it is also ok
        try {
            let controlDirectoryHandle = await directoryHandle.getDirectoryHandle(controlDirectoryName);
            let metaFileHandle = await controlDirectoryHandle.getFileHandle(metaFileName);
            let metaFile = await metaFileHandle.getFile();
            if (JSON.parse(await metaFile.text()).location == location.pathname) needConfirm = false;
        } catch (ex) {
            // ignore
        }

        if (needConfirm && !window.confirm('Warning: The folder ' + directoryHandle.name + ' will be aligned with the fragments in this codestrate. Differing managed files will be overwritten, and files or folders not represented in the codestrate will be deleted.')) return;
        return directoryHandle;
    }

    async enableSyncingAcrossTabs(directoryHandle) {
        this.coordinationGeneration++;
        let previousLockRequest = this.lockRequestPromise;
        if (previousLockRequest) {
            this.disableSyncing();
            await previousLockRequest;
        }
        if (this.isDestroyed) return;
        await this.setDirectory(directoryHandle);
        this.isEnabled = true;
        this.syncState = 'waiting';
        this.coordinationChannel?.postMessage({ type: 'enabled' });
        this.enableSyncing();
    }

    async disableSyncingAcrossTabs() {
        this.coordinationGeneration++;
        await this.setDirectory(false);
        this.coordinationChannel?.postMessage({ type: 'disabled' });
        this.disableSyncing();
    }

    enableSyncing() {
        if (this.isDestroyed) return;
        if (!this.directoryHandle) {
            this.syncState = 'error';
            console.error('Cannot start Fragment Filesystem Sync without a directory');
            return;
        }

        this.isEnabled = true;
        if (this.isSyncing || this.lockRequestPromise) return this.lockRequestPromise;

        this.syncState = 'waiting';
        let abortController = new AbortController();
        this.lockAbortController = abortController;

        let lockRequest = navigator.locks.request(this.coordinationName, {
            mode: 'exclusive',
            signal: abortController.signal
        }, async () => {
            if (!this.isEnabled || this.isDestroyed) return;

            let savedHandle = await this.getSavedHandle();
            if (!savedHandle) {
                this.directoryHandle = false;
                this.isEnabled = false;
                this.syncState = 'disabled';
                return;
            }
            this.directoryHandle = savedHandle;

            let permission = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') throw new Error('Must have read/write access to the sync directory');
            if (!this.isEnabled || this.isDestroyed) return;

            console.log('Starting Fragment Filesystem Sync in this tab');
            this.isSyncing = true;
            this.syncState = 'syncing';

            try {
                await this.runSyncWorker();
            } finally {
                this.isSyncing = false;
                if (this.isEnabled && this.syncState === 'syncing') this.syncState = 'waiting';
            }
        });

        let trackedLockRequest = lockRequest.catch((error) => {
            if (error?.name === 'AbortError') return;
            console.error('Fragment Filesystem Sync could not acquire or use the sync lock', error);
            if (this.isEnabled && !this.isDestroyed) this.syncState = 'error';
        }).finally(() => {
            if (this.lockAbortController === abortController) this.lockAbortController = false;
            if (this.lockRequestPromise === trackedLockRequest) this.lockRequestPromise = false;

            if (this.isEnabled && !this.isDestroyed && this.syncState !== 'error') {
                setTimeout(() => this.enableSyncing(), 0);
            }
        });
        this.lockRequestPromise = trackedLockRequest;
        return trackedLockRequest;
    }

    async prepareSyncDirectory() {
        try {
            this.controlDirectoryHandle = await this.directoryHandle.getDirectoryHandle(controlDirectoryName, { create: true });
        } catch (error) {
            if (error?.name !== 'TypeMismatchError') throw error;
            await this.directoryHandle.removeEntry(controlDirectoryName, { recursive: true });
            this.controlDirectoryHandle = await this.directoryHandle.getDirectoryHandle(controlDirectoryName, { create: true });
        }
    }

    async waitForInitialFragmentLinks() {
        while (this.workerActive) {
            await new Promise((resolve) => setTimeout(resolve, 1));
            if (!this.workerActive) return;
            let fragmentElements = Array.from(document.querySelectorAll('body code-fragment'));
            let fragmentLinkMap = new Map();
            this.fragmentLinks.forEach((link) => fragmentLinkMap.set(link.fragment.element, link));

            fragmentElements.forEach((fragmentElement) => {
                if (!fragmentLinkMap.has(fragmentElement) && fragmentElement.fragment) {
                    let link = new FragmentLink(fragmentElement.fragment);
                    this.fragmentLinks.push(link);
                    fragmentLinkMap.set(fragmentElement, link);
                }
            });

            if (fragmentElements.every((fragmentElement) => fragmentLinkMap.has(fragmentElement))) {
                await Promise.all(this.fragmentLinks.map((link) => link.ready));
                return;
            }
        }
    }

    async runSyncWorker() {
        let self = this;
        this.workerActive = true;
        this.workerGeneration++;
        this.lastKnownDiskAttributes = {};
        this.lastKnownDiskDomOrder = undefined;
        this.lastInvalidDiskDomOrder = undefined;
        this.lastKnownDiskBootConfig = undefined;

        try {
            await this.prepareSyncDirectory();
            if (!this.workerActive || !this.controlDirectoryHandle) return;

            // Observe when fragments are added/removed
            this.observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === "childList") {
                        for (const addedNode of mutation.addedNodes) {
                            if (addedNode.matches && addedNode.matches("code-fragment")) {
                                self.onWSFragmentElementAdded(addedNode);
                            } else if (addedNode.querySelectorAll) {
                                addedNode.querySelectorAll("code-fragment").forEach((node) => {
                                    self.onWSFragmentElementAdded(node);
                                })
                            }
                        }
                        for (const removedNode of mutation.removedNodes) {
                            if (removedNode.matches && removedNode.matches("code-fragment")) {
                                self.onWSFragmentElementRemoved(removedNode);
                            } else if (removedNode.querySelectorAll) {
                                removedNode.querySelectorAll("code-fragment").forEach((node) => {
                                    self.onWSFragmentElementRemoved(node);
                                })
                            }
                        }
                    }
                }
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
            document.querySelectorAll("body code-fragment").forEach((fragment) => {
                self.onWSFragmentElementAdded(fragment);
            });

            await this.waitForInitialFragmentLinks();
            let authoritativeSyncPending = true;
            while (this.workerActive) {
                try {
                    await this.synchronizeTick(authoritativeSyncPending);
                    authoritativeSyncPending = false;
                    if (this.isEnabled) this.syncState = 'syncing';
                } catch (error) {
                    console.error('Fragment Filesystem Sync tick failed; retrying', error);
                    if (this.isEnabled) this.syncState = 'error';
                }
                if (this.workerActive) await this.waitForNextSyncTick();
            }
        } finally {
            this.cleanupSyncWorker();
        }
    }

    disableSyncing() {
        let wasEnabled = this.isEnabled || this.isSyncing || this.lockRequestPromise;
        this.isEnabled = false;
        this.syncState = 'disabled';
        this.lockAbortController?.abort();
        this.requestSyncWorkerStop();
        if (!this.isSyncing) this.directoryHandle = false;
        if (wasEnabled) console.log('Stopped Fragment Filesystem Sync in this tab');
    }

    requestSyncWorkerStop() {
        this.workerActive = false;
        this.observer?.disconnect();
        if (this.updater) clearTimeout(this.updater);
        this.updater = false;
        if (this.syncDelayResolver) {
            let resolve = this.syncDelayResolver;
            this.syncDelayResolver = false;
            resolve();
        }
    }

    waitForNextSyncTick() {
        return new Promise((resolve) => {
            this.syncDelayResolver = resolve;
            this.updater = setTimeout(() => {
                this.updater = false;
                this.syncDelayResolver = false;
                resolve();
            }, 1000);
        });
    }

    cleanupSyncWorker() {
        this.requestSyncWorkerStop();
        this.workerGeneration++;
        this.pendingFragmentLinkTimeouts.forEach((timeout) => clearTimeout(timeout));
        this.pendingFragmentLinkTimeouts.clear();
        this.observer = false;
        this.fragmentLinks = [];
        this.pathMapping = new Map();
        this.nodeMapping = new Map();
        this.lastKnownDiskAttributes = {};
        this.lastKnownDiskDomOrder = undefined;
        this.lastInvalidDiskDomOrder = undefined;
        this.lastKnownDiskBootConfig = undefined;
        this.controlDirectoryHandle = false;
        if (!this.isEnabled) this.directoryHandle = false;
    }

    destroy() {
        this.isDestroyed = true;
        this.disableSyncing();
        this.coordinationChannel?.close();
        this.coordinationChannel = false;
    }

    onWSFragmentElementAdded(fragmentElement) {
        let workerGeneration = this.workerGeneration;
        let timeout = setTimeout(() => {
            this.pendingFragmentLinkTimeouts.delete(timeout);
            if (!this.workerActive || workerGeneration !== this.workerGeneration) return;
            if (!fragmentElement.fragment) return;
            if (this.fragmentLinks.some((link) => link.fragment.element === fragmentElement)) return;
            this.fragmentLinks.push(new FragmentLink(fragmentElement.fragment));
        }, 1);
        this.pendingFragmentLinkTimeouts.add(timeout);
    }
    onWSFragmentElementRemoved(fragmentElement) {
        if (document.body.contains(fragmentElement)) return;
        this.fragmentLinks = this.fragmentLinks.filter((link) => link.fragment.element !== fragmentElement);
    }

    async synchronizeTick(webstrateAuthoritative = false) {
        let metaFileHandle = await getOrCreateFSFile(this.controlDirectoryHandle, metaFileName, webstrateAuthoritative);
        let metaFile = await metaFileHandle.getFile();
        let oldMeta = {};
        try {
            oldMeta = JSON.parse(await metaFile.text());
        } catch (error) {
            // Ignore this, just create a new one.
        }
        let metaChangeDetector = JSON.stringify(oldMeta.paths);
        this.restorePathMappingsFromMeta(oldMeta);

        // Sync FS and WS
        if (!webstrateAuthoritative && oldMeta.paths) await this.synchronizeFSOperations(oldMeta);
        await this.synchronizeWSFragments(webstrateAuthoritative, oldMeta);
        await this.synchronizeDomOrder(webstrateAuthoritative);
        await this.synchronizeAttributes(webstrateAuthoritative);
        await this.synchronizeBootConfig(webstrateAuthoritative);

        // Generate new meta file for advanced merging functionality
        let meta = { metaVersion: 3, version: webstrate.version, lastMetaSync: new Date().getTime(), paths: {}, location: location.pathname };
        for (const [path, part] of this.pathMapping) {
            let entryMeta = { wid: part.node.webstrate.id, basePath: part.basePath };
            if (part.link) {
                entryMeta.type = "fragment";
                entryMeta.fragmentLastModified = part.link.elementLastModified;
                // The contents both sides agreed on, plus the file stats they were observed with
                entryMeta.hash = part.syncedHash;
                entryMeta.fileLastModified = part.fileLastModified;
                entryMeta.fileSize = part.fileSize;
            } else {
                entryMeta.type = "directory";
            }
            // Snapshot of the attributes that a file renamed on disk gets back, matched on the
            // content hash. ffs.attributes.json cannot recover them because it is keyed by path.
            autoCloneAttributes.forEach(attr => {
                if (part.node.hasAttribute(attr)) entryMeta[attr] = part.node.getAttribute(attr);
            })
            meta.paths[path] = entryMeta;
        };
        if (webstrateAuthoritative || metaChangeDetector != JSON.stringify(meta.paths)) {
            // Meta needs to be rewritten
            await writeFile(metaFileHandle, JSON.stringify(meta));
        }
    }

    restorePathMappingsFromMeta(meta) {
        if (this.pathMapping.size > 0 || meta.location !== location.pathname || !meta.paths) return;

        let fragmentLinkMap = new Map();
        this.fragmentLinks.forEach((link) => fragmentLinkMap.set(link.fragment.element, link));
        for (const [path, entry] of Object.entries(meta.paths)) {
            let node;
            let link;
            if (entry.type === 'directory') {
                node = findFolderNodeByWSID(entry.wid);
            } else if (entry.type === 'fragment') {
                node = findFragmentNodeByWSID(entry.wid);
                link = fragmentLinkMap.get(node);
                if (!link) continue;
            }
            if (!node) continue;
            this.pathMapping.set(path, { node: node, link: link, basePath: entry.basePath });
            this.nodeMapping.set(node, path);
        }
    }

    async synchronizeFSOperations(oldMeta) {
        async function addElementFromOldFS(path, element, type) {
            let parentPath = path.substring(0, path.lastIndexOf("/"));
            let parentNode = false;
            if (parentPath == "") {
                parentNode = document.body;
            } else if (oldMeta.paths[parentPath]) { // Try to find node by WSID
                let wsNode = findFolderNodeByWSID(oldMeta.paths[parentPath].wid);
                if (wsNode) parentNode = wsNode;
            }

            if (!parentNode) {
                console.log("Couldn't map parent folder, giving up on adding", path);
            } else {
                // TODO: Check for collisions/duplicates here
                let name = path.split("/");
                name = name[name.length - 1];
                let extensionLocation = name.lastIndexOf(".");
                name = name.substring(0, (extensionLocation != -1) ? extensionLocation : undefined);

                element.setAttribute("name", name);
                parentNode.appendChild(element);
                WPMv2.stripProtection(element);

                // continue after webstrates id generation
                await new Promise(resolve => setTimeout(resolve, 0));
                oldMeta.paths[path] = {
                    wid: element.webstrate.id,
                    type: type
                };
            }
        }

        // Check if any new files/dirs in FS with the old mapping from FS
        await traverseDirectoryStructure("", this.directoryHandle, async (path, name, parent, entry) => {
            if (path === '/' + controlDirectoryName) return false;

            if (!oldMeta.paths[path]) {
                // A new directory, create it in the webstrate
                let newFolderElement;
                if (name.endsWith(".wpm")) {
                    newFolderElement = document.createElement("wpm-package");
                } else {
                    newFolderElement = document.createElement("code-folder");
                }
                await addElementFromOldFS(path, newFolderElement, "directory");
            }

            // Check again and flag as seen if it exists now
            if (oldMeta.paths[path]) oldMeta.paths[path].seen = true;
            return true;
        }, async (path, name, parent, entry) => {
            if (!oldMeta.paths[path]) {
                // A new file, create the fragment
                if (path === '/ffs.meta' || path === '/ffs.attributes.json' || path === '/ffs.dom-order.json') return; // Ignore legacy control files
                let extension = name.substring(name.lastIndexOf(".") + 1);
                let type = Object.keys(extensionTypes).find(key => extensionTypes[key] == extension);
                if (FragmentFilesystemSync.DEBUG) console.log("New file spotted", extension, type, path, name, parent, entry);
                if (type) {
                    // Recognized fragment type
                    let fragmentElement = document.createElement("code-fragment");
                    fragmentElement.setAttribute("data-type", type);
                    await addElementFromOldFS(path, fragmentElement, "fragment");

                    // Check if this is a move/rename op
                    let file = await entry.getFile();
                    let contents = await file.text();
                    if (contents.length > 0) {
                        let hash = await sha256(contents);
                        if (FragmentFilesystemSync.DEBUG) console.log("Looking for ", hash);
                        let collision = Object.values(oldMeta.paths).find((p) => { return p.type == "fragment" && p.hash == hash; });
                        if (collision) {
                            // Copy over old attributes
                            if (FragmentFilesystemSync.DEBUG) console.log("Found")
                            autoCloneAttributes.forEach(attr => {
                                if (FragmentFilesystemSync.DEBUG) console.log("Adding attrs")
                                if (collision[attr] === undefined) {
                                    if (FragmentFilesystemSync.DEBUG) console.log("removing attrs", attr);
                                    fragmentElement.removeAttribute(attr);
                                } else {
                                    if (FragmentFilesystemSync.DEBUG) console.log("added attrs", attr, collision[attr]);
                                    fragmentElement.setAttribute(attr, collision[attr]);
                                }
                            })
                        }
                    }
                }
            }

            // Check file existance again and flag as seen if it exists now. Contents are
            // synchronized in synchronizeWSFragments, where both sides of the file are known.
            if (oldMeta.paths[path]) oldMeta.paths[path].seen = true;
        });

        // Check if any deleted files in FS with the old mapping from FS
        for (const [path, entry] of Object.entries(oldMeta.paths)) {
            if (!entry.seen) {
                if (FragmentFilesystemSync.DEBUG) console.log("Detected deleted path in FS", path);
                switch (entry.type) {
                    case "directory":
                        let wsDirNode = findFolderNodeByWSID(entry.wid);
                        if (!wsDirNode) {
                            console.log("Couldn't find deleted directory in webstrate", entry);
                        } else {
                            wsDirNode.remove();
                        }
                        break;
                    case "fragment":
                        let wsFragNode = findFragmentNodeByWSID(entry.wid);
                        if (!wsFragNode) {
                            console.log("Couldn't find deleted fragment in webstrate", entry);
                        } else {
                            wsFragNode.remove();
                        }
                        break;
                    default:
                        console.log("Unknown entry type deleted", entry)
                }
            }
        }

        // Yield, to trigger mutation observers for deletions before continueing
        await new Promise(resolve => setTimeout(resolve, 1));
    }

    async synchronizeWSFragments(webstrateAuthoritative = false, oldMeta = {}) {
        // Create new filename and directory mapping for fragment links
        let sanitizeFileName = (rawName) => rawName.replace(/[^()a-z0-9.#\-_ ]/gi, '_');
        let previousPathMapping = this.pathMapping;
        let previousNodeMapping = this.nodeMapping;
        let reservedPreviousPaths = new Set(previousNodeMapping.values());
        let newPathMapping = new Map();
        let newNodeMapping = new Map();

        // Build element-to-FragmentLink lookup for quick access during traversal
        let fragmentLinks = this.fragmentLinks;
        let fragmentLinkMap = new Map();
        fragmentLinks.forEach((link) => {
            fragmentLinkMap.set(link.fragment.element, link);
        });

        let allocatePath = function allocatePath(node, basePath, createCandidate) {
            let previousPath = previousNodeMapping.get(node);
            let previousPart = previousPathMapping.get(previousPath);
            let matchesPreviousBase = previousPart?.basePath === basePath ||
                (previousPart?.basePath === undefined && isCollisionPathVariant(previousPath, basePath));
            if (previousPath && matchesPreviousBase && !newPathMapping.has(previousPath)) {
                return previousPath;
            }

            let path;
            let counter = 0;
            do {
                path = createCandidate(counter);
                counter++;
            } while (newPathMapping.has(path) || reservedPreviousPaths.has(path) || path === '/' + controlDirectoryName);
            return path;
        };

        // Recurse through DOM in order, registering both folders and fragments
        let registerElements = function registerElements(currentPath, currentElement) {
            if (folderElements.includes(currentElement.nodeName)) {
                // This is a folder
                let extension = '';
                if (currentElement.nodeName === 'WPM-PACKAGE') extension = '.wpm';
                let pathName = sanitizeFileName(getNodeName(currentElement));
                let basePath = currentPath + '/' + pathName + extension;
                let path = allocatePath(currentElement, basePath, (counter) => {
                    return currentPath + '/' + pathName + (counter > 0 ? '_' + counter : '') + extension;
                });
                newPathMapping.set(path, { node: currentElement, basePath: basePath });
                newNodeMapping.set(currentElement, path);
                currentPath = path;
            } else if (currentElement.nodeName === "CODE-FRAGMENT") {
                // This is a fragment
                let link = fragmentLinkMap.get(currentElement);
                if (!link && currentElement.fragment) {
                    // Pick up fragments that appeared after the last mutation callback ran
                    link = new FragmentLink(currentElement.fragment);
                    fragmentLinks.push(link);
                    fragmentLinkMap.set(currentElement, link);
                }
                if (link) {
                    let pathName = sanitizeFileName(link.getRawName());
                    let extension = '.' + link.getExtension();
                    let basePath = currentPath + '/' + pathName + extension;
                    let fragmentPath = allocatePath(currentElement, basePath, (counter) => {
                        return currentPath + '/' + pathName + (counter > 0 ? '_' + counter : '') + extension;
                    });
                    newPathMapping.set(fragmentPath, { node: link.fragment.element, link: link, basePath: basePath });
                    newNodeMapping.set(link.fragment.element, fragmentPath);
                }
            }
            for (let i = 0; i < currentElement.children.length; i++) {
                registerElements(currentPath, currentElement.children[i]);
            }
        };
        registerElements("", document.body);
        this.nodeMapping = newNodeMapping;
        this.pathMapping = newPathMapping;




        // Check if there are new dirs that need to be pushed to FS
        let paths = Array.from(this.pathMapping.keys()).sort();
        let sortedDirs = [{ path: "", handle: this.directoryHandle }];
        for (const path of paths) {
            let entity = this.pathMapping.get(path);
            if (!entity.link) {
                // Directory
                sortedDirs.push({ path: path, handle: await getOrCreateFSDirectory(this.directoryHandle, path, webstrateAuthoritative) });
            }
        }

        // Check fragments to push to FS
        for (const dir of sortedDirs) {
            if (!dir.handle) {
                console.log("Skipping file sync because directory could not be found", dir);
                continue;
            }
            for (const path of paths) {
                if (path.substr(0, path.lastIndexOf("/")) == dir.path) {
                    let entity = this.pathMapping.get(path);
                    if (entity.link) {
                        // File in this dir
                        let previousEntry = oldMeta.paths?.[path];
                        if (previousEntry?.type === 'fragment') {
                            // Carry the last known sync state over in case the file cannot be opened below
                            entity.syncedHash = previousEntry.hash;
                            entity.fileLastModified = previousEntry.fileLastModified;
                            entity.fileSize = previousEntry.fileSize;
                        } else {
                            previousEntry = undefined;
                        }

                        let fileWasJustCreated = false;
                        let fileName = path.substring(path.lastIndexOf('/') + 1);
                        let fileHandle;
                        try {
                            fileHandle = await dir.handle.getFileHandle(fileName);
                        } catch (ex) {
                            if (webstrateAuthoritative && ex?.name === 'TypeMismatchError') {
                                await dir.handle.removeEntry(fileName, { recursive: true });
                            } else if (ex?.name !== 'NotFoundError') {
                                throw ex;
                            }
                            try {
                                fileHandle = await dir.handle.getFileHandle(fileName, { create: true });
                                if (FragmentFilesystemSync.DEBUG) console.log("Creating new file in FS because it didnt exist", path)
                                fileWasJustCreated = true;
                            } catch (ex2) {
                                console.log("Cannot write file, skipping", path, ex2);
                            }
                        }
                        if (!fileHandle) continue;

                        await synchronizeFragmentContents(entity, fileHandle, previousEntry, fileWasJustCreated, webstrateAuthoritative);
                    }
                }
            }
        };

        // Check if FS has fragments/dirs that should be deleted
        let unknownPathDeleter = async (path, name, parent, entry) => {
            if (path === '/' + controlDirectoryName) return false;
            if (!this.pathMapping.has(path)) {
                await parent.removeEntry(name, { recursive: true }); // Delete it
                return false; // Do not continue into the directory
            }
            return true;
        };
        await traverseDirectoryStructure("", this.directoryHandle, unknownPathDeleter, unknownPathDeleter);
    }

    getDomOrderGroups() {
        let groups = [{ path: '/', node: document.body }];
        for (const [path, part] of this.pathMapping) {
            if (!part.link) groups.push({ path: path, node: part.node });
        }
        return groups.map((group) => {
            return {
                path: group.path,
                node: group.node,
                children: Array.from(group.node.children).filter((child) => {
                    return isManagedElement(child) && this.nodeMapping.has(child);
                })
            };
        });
    }

    buildDomOrder() {
        let domOrder = {};
        this.getDomOrderGroups().forEach((group) => {
            domOrder[group.path] = group.children.map((child) => getPathName(this.nodeMapping.get(child)));
        });
        return domOrder;
    }

    applyDomOrder(diskDomOrder) {
        this.getDomOrderGroups().forEach((group) => {
            if (!Object.prototype.hasOwnProperty.call(diskDomOrder, group.path)) return;

            let childByName = new Map();
            group.children.forEach((child) => childByName.set(getPathName(this.nodeMapping.get(child)), child));
            let seenChildren = new Set();
            let desiredChildren = [];
            diskDomOrder[group.path].forEach((childName) => {
                let child = childByName.get(childName);
                if (!child || seenChildren.has(child)) return;
                seenChildren.add(child);
                desiredChildren.push(child);
            });
            group.children.forEach((child) => {
                if (!seenChildren.has(child)) desiredChildren.push(child);
            });
            reorderManagedChildSlots(group.node, group.children, desiredChildren);
        });
    }

    async synchronizeDomOrder(webstrateAuthoritative = false) {
        let diskRawText;
        let diskDomOrder;
        try {
            let fileHandle = await this.controlDirectoryHandle.getFileHandle(domOrderFileName);
            let file = await fileHandle.getFile();
            diskRawText = await file.text();
        } catch (error) {
            if (error?.name !== 'NotFoundError') throw error;
        }

        if (!webstrateAuthoritative && diskRawText !== undefined) {
            try {
                diskDomOrder = JSON.parse(diskRawText);
                if (!isValidDomOrder(diskDomOrder)) throw new Error('Expected an object whose values are arrays of child names');
            } catch (error) {
                if (diskRawText !== this.lastInvalidDiskDomOrder) {
                    console.warn('Ignoring invalid Fragment Filesystem Sync DOM order file', error);
                }
                this.lastInvalidDiskDomOrder = diskRawText;
                return;
            }
        }
        this.lastInvalidDiskDomOrder = undefined;

        let diskChanged = !webstrateAuthoritative && diskDomOrder !== undefined &&
            JSON.stringify(diskDomOrder) !== JSON.stringify(this.lastKnownDiskDomOrder);
        if (diskChanged) this.applyDomOrder(diskDomOrder);

        let finalDomOrder = this.buildDomOrder();
        let outputJSON = JSON.stringify(finalDomOrder, null, 4) + '\n';
        if (outputJSON !== diskRawText) {
            let fileHandle = await getOrCreateFSFile(this.controlDirectoryHandle, domOrderFileName, webstrateAuthoritative);
            await writeFile(fileHandle, outputJSON);
        }
        this.lastKnownDiskDomOrder = JSON.parse(JSON.stringify(finalDomOrder));
    }

    async synchronizeAttributes(webstrateAuthoritative = false) {
        // Read current attributes file from disk
        let diskRawText = '';
        let diskAttributes = {};
        try {
            let fileHandle = await this.controlDirectoryHandle.getFileHandle(attributesFileName);
            let file = await fileHandle.getFile();
            diskRawText = await file.text();
            if (diskRawText.trim().length > 0) {
                diskAttributes = nestedToFlatAttributes(JSON.parse(diskRawText));
            }
        } catch (ex) {
            // File doesn't exist yet or parse error, treat as empty
        }

        if (!webstrateAuthoritative) {
            // Detect disk changes (user edits) and apply to DOM
            // Only process paths that exist in both disk JSON and current pathMapping
            for (const [path, diskAttrs] of Object.entries(diskAttributes)) {
                let part = this.pathMapping.get(path);
                if (!part) continue; // Path doesn't exist in current mapping, skip
                if (typeof diskAttrs !== 'object' || diskAttrs === null) continue;

                let lastKnown = this.lastKnownDiskAttributes[path] || {};

                for (const attr of trackedAttributes) {
                    let hasDiskValue = diskAttrs.hasOwnProperty(attr);
                    let hasLastKnownValue = lastKnown.hasOwnProperty(attr);
                    let diskValue = hasDiskValue ? diskAttrs[attr] : undefined;
                    let lastKnownValue = hasLastKnownValue ? lastKnown[attr] : undefined;

                    // Only apply if this attribute actually changed on disk since last sync
                    if (hasDiskValue !== hasLastKnownValue || diskValue !== lastKnownValue) {
                        if (!hasDiskValue) {
                            // Attribute was removed from disk JSON entry
                            if (part.node.hasAttribute(attr)) {
                                part.node.removeAttribute(attr);
                            }
                        } else {
                            // Attribute was changed or added on disk
                            let currentDOMValue = part.node.getAttribute(attr);
                            if (currentDOMValue !== diskValue) {
                                part.node.setAttribute(attr, diskValue);
                            }
                        }
                    }
                }
            }
        }

        // Build current DOM attributes from pathMapping (after potential disk-to-DOM updates)
        let finalAttributes = {};
        for (const path of this.pathMapping.keys()) {
            let part = this.pathMapping.get(path);
            let attrs = {};
            for (const attr of trackedAttributes) {
                if (part.node.hasAttribute(attr)) {
                    attrs[attr] = part.node.getAttribute(attr);
                }
            }
            if (Object.keys(attrs).length > 0) {
                finalAttributes[path] = attrs;
            }
        }

        // Write to disk only if the output differs from current file content
        let nestedOutput = flatToNestedAttributes(finalAttributes);
        let outputJSON = JSON.stringify(nestedOutput, null, 4) + '\n';
        if (outputJSON !== diskRawText) {
            let fileHandle = await getOrCreateFSFile(this.controlDirectoryHandle, attributesFileName, webstrateAuthoritative);
            await writeFile(fileHandle, outputJSON);
        }

        // Update last known disk state to detect future user edits
        this.lastKnownDiskAttributes = JSON.parse(JSON.stringify(finalAttributes));
    }

    async synchronizeBootConfig(webstrateAuthoritative = false) {
        let bootConfigElement = document.querySelector(bootConfigSelector);
        if (!bootConfigElement) {
            if (webstrateAuthoritative) {
                try {
                    await this.controlDirectoryHandle.removeEntry(bootConfigFileName, { recursive: true });
                } catch (error) {
                    if (error?.name !== 'NotFoundError') throw error;
                }
                this.lastKnownDiskBootConfig = undefined;
            }
            return;
        }

        let diskRawText;
        try {
            let fileHandle = await this.controlDirectoryHandle.getFileHandle(bootConfigFileName);
            let file = await fileHandle.getFile();
            diskRawText = await file.text();
        } catch (ex) {
            // File does not exist yet, so it will be created from the DOM below
        }

        // A disk edit wins when both disk and DOM changed since the previous tick
        let diskChanged = !webstrateAuthoritative && diskRawText !== undefined && diskRawText !== this.lastKnownDiskBootConfig;
        if (diskChanged && bootConfigElement.textContent !== diskRawText) {
            bootConfigElement.textContent = diskRawText;
        }

        let finalRawText = bootConfigElement.textContent;
        if (diskRawText !== finalRawText) {
            let fileHandle = await getOrCreateFSFile(this.controlDirectoryHandle, bootConfigFileName, webstrateAuthoritative);
            await writeFile(fileHandle, finalRawText);
        }

        this.lastKnownDiskBootConfig = finalRawText;
    }
}

class FragmentLink {
    constructor(fragment) {
        let self = this;
        this.fragment = fragment;
        if (!fragment) throw Error("Cannot construct FragmentLink without a fragment");

        this.elementLastModified = new Date().getTime();
        this.fragment.registerOnFragmentChangedHandler(() => { self.onFragmentUpdated() });
        this.ready = this.onFragmentUpdated();
        if (FragmentFilesystemSync.DEBUG) console.log("Monitoring", fragment);
    }

    async onFragmentUpdated() {
        // Record when the contents genuinely changed, for the metadata file
        let previousHash = this.hash;
        let newHash = await this.getContentHash();
        if (previousHash !== undefined && newHash !== previousHash) {
            this.elementLastModified = new Date().getTime();
        }
    }

    async getContentHash(contents = this.fragment.raw) {
        // Memoized, because every sync tick hashes contents that usually did not change
        if (this.hash === undefined || this.hashedContents !== contents) {
            let hash = await sha256(contents);
            this.hash = hash;
            this.hashedContents = contents;
            return hash;
        }
        return this.hash;
    }

    getRawName() {
        let name = getNodeName(this.fragment.element);
        return name ? name : this.fragment.type.substring(this.fragment.type.lastIndexOf('/') + 1);
    }

    getExtension() {
        let extension = extensionTypes[this.fragment.type];
        if (!extension) extension = "txt";
        return extension;
    }
}


function recordSyncedFragmentState(entity, file, contentHash) {
    entity.syncedHash = contentHash;
    entity.fileLastModified = file.lastModified;
    entity.fileSize = file.size;
}

async function writeFragmentFile(entity, fileHandle, contents, contentHash) {
    await writeFile(fileHandle, contents);
    recordSyncedFragmentState(entity, await fileHandle.getFile(), contentHash);
}

/**
 * Synchronizes the contents of a single fragment and its file in both directions.
 *
 * The side that changed since the previous tick wins, which is decided on content hashes rather
 * than on timestamps: the meta file records the hash of the contents both sides last agreed on.
 * The recorded file stats are only used to skip reading files that were not touched on disk.
 */
async function synchronizeFragmentContents(entity, fileHandle, previousEntry, fileWasJustCreated, webstrateAuthoritative) {
    let fragmentContents = entity.link.fragment.raw;
    let fragmentHash = await entity.link.getContentHash(fragmentContents);
    let syncedHash = previousEntry?.hash;

    if (fileWasJustCreated) {
        await writeFragmentFile(entity, fileHandle, fragmentContents, fragmentHash);
        return;
    }

    let file = await fileHandle.getFile();
    let fileUntouched = syncedHash !== undefined &&
        previousEntry.fileLastModified === file.lastModified &&
        previousEntry.fileSize === file.size;
    if (fileUntouched && !webstrateAuthoritative) {
        // The file still is what we wrote or read last, so only the fragment can have changed
        if (fragmentHash === syncedHash) {
            recordSyncedFragmentState(entity, file, syncedHash);
        } else {
            await writeFragmentFile(entity, fileHandle, fragmentContents, fragmentHash);
        }
        return;
    }

    let fileContents = await file.text();
    if (fileContents === fragmentContents) {
        // Both sides already agree, only the file stats need to be refreshed
        recordSyncedFragmentState(entity, file, fragmentHash);
        return;
    }
    if (webstrateAuthoritative || previousEntry === undefined) {
        // The webstrate wins while resuming, and for files we have no synchronized state for
        await writeFragmentFile(entity, fileHandle, fragmentContents, fragmentHash);
        return;
    }

    let fileHash = await sha256(fileContents);
    if (syncedHash !== undefined && fileHash === syncedHash) {
        // Only the fragment changed since the last tick
        await writeFragmentFile(entity, fileHandle, fragmentContents, fragmentHash);
        return;
    }

    // The file changed on disk, which also wins when the fragment changed as well
    entity.link.fragment.raw = fileContents;
    recordSyncedFragmentState(entity, file, fileHash);
}

function getNodeName(node) {
    let name = node.hasAttribute("name") ? node.getAttribute("name").trim() : "";
    if (name.length > 0) return name;
    let id = node.hasAttribute("id") ? node.getAttribute("id").trim() : "";
    if (id.length > 0) return "#" + id;
    if (folderElements.includes(node.nodeName)) return node.nodeName.toLowerCase();
    return false;
}

function findFolderNodeByWSID(wsid) {
    return Array.from(document.querySelectorAll(folderElements.join(","))).find(element => element.webstrate?.id == wsid);
}
function findFragmentNodeByWSID(wsid) {
    return Array.from(document.querySelectorAll("code-fragment")).find(element => element.webstrate?.id == wsid);
}

function isManagedElement(element) {
    return element.nodeName === 'CODE-FRAGMENT' || folderElements.includes(element.nodeName);
}

function getPathName(path) {
    return path.substring(path.lastIndexOf('/') + 1);
}

function isCollisionPathVariant(path, basePath) {
    if (!path || !basePath) return false;
    if (path === basePath) return true;
    let escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('^' + escapeRegExp(basePath) + '_\\d+$').test(path)) return true;

    let extensionLocation = basePath.lastIndexOf('.');
    let directoryLocation = basePath.lastIndexOf('/');
    if (extensionLocation <= directoryLocation) return false;
    let stem = basePath.substring(0, extensionLocation);
    let extension = basePath.substring(extensionLocation);
    return new RegExp('^' + escapeRegExp(stem) + '_\\d+' + escapeRegExp(extension) + '$').test(path);
}

function isValidDomOrder(domOrder) {
    if (typeof domOrder !== 'object' || domOrder === null || Array.isArray(domOrder)) return false;
    return Object.entries(domOrder).every(([path, childNames]) => {
        return path.startsWith('/') && Array.isArray(childNames) && childNames.every((childName) => typeof childName === 'string');
    });
}

function reorderManagedChildSlots(parentNode, currentChildren, desiredChildren) {
    if (currentChildren.every((child, index) => child === desiredChildren[index])) return;

    let managedChildren = new Set(currentChildren);
    let desiredIndex = 0;
    let finalChildren = Array.from(parentNode.children).map((child) => {
        return managedChildren.has(child) ? desiredChildren[desiredIndex++] : child;
    });
    finalChildren.forEach((child, index) => {
        let currentChild = parentNode.children[index];
        if (currentChild !== child) parentNode.insertBefore(child, currentChild);
    });
}

async function getOrCreateFSDirectory(base, path, replaceMismatchedEntry = false) {
    let directories = path.split("/");
    let currentDir = base;
    for (let directory of directories) {
        if (directory.length === 0) continue; // skip initial slash
        try {
            currentDir = await currentDir.getDirectoryHandle(directory, { create: true })
        } catch (error) {
            if (!replaceMismatchedEntry || error?.name !== 'TypeMismatchError') throw error;
            await currentDir.removeEntry(directory, { recursive: true });
            currentDir = await currentDir.getDirectoryHandle(directory, { create: true });
        }
    }
    return currentDir;
}

async function writeFile(fileHandle, contents) {
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
}

async function getOrCreateFSFile(directoryHandle, fileName, replaceMismatchedEntry = false) {
    try {
        return await directoryHandle.getFileHandle(fileName, { create: true });
    } catch (error) {
        if (!replaceMismatchedEntry || error?.name !== 'TypeMismatchError') throw error;
        await directoryHandle.removeEntry(fileName, { recursive: true });
        return directoryHandle.getFileHandle(fileName, { create: true });
    }
}

async function traverseDirectoryStructure(currentPath, dirHandle, dirCallback, fileCallback) {
    for await (let [name, entry] of dirHandle.entries()) {
        let newPath = currentPath + "/" + name
        if (entry instanceof FileSystemFileHandle) {
            await fileCallback(newPath, name, dirHandle, entry);
        } else if (entry instanceof FileSystemDirectoryHandle) {
            if (await dirCallback(newPath, name, dirHandle, entry)) {
                await traverseDirectoryStructure(newPath, entry, dirCallback, fileCallback);
            }
        }
    }
}

function flatToNestedAttributes(flatObj) {
    let nested = {};
    for (const [path, attrs] of Object.entries(flatObj)) {
        let parts = path.split('/').filter(p => p.length > 0);
        let current = nested;
        for (let i = 0; i < parts.length; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current._attributes = attrs;
    }
    return nested;
}

function nestedToFlatAttributes(nested, currentPath) {
    let flat = {};
    if (currentPath === undefined) currentPath = '';
    for (const [key, value] of Object.entries(nested)) {
        if (key === '_attributes') continue;
        if (typeof value !== 'object' || value === null) continue;
        let path = currentPath + '/' + key;
        if (value._attributes && typeof value._attributes === 'object') {
            flat[path] = value._attributes;
        }
        Object.assign(flat, nestedToFlatAttributes(value, path));
    }
    return flat;
}

async function sha256(input) {
    const sourceBytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", sourceBytes);
    const resultBytes = [...new Uint8Array(digest)];
    return resultBytes.map(x => x.toString(16).padStart(2, '0')).join("");
}

FragmentFilesystemSync.DEBUG = false;
if (FragmentFilesystemSync.isSupported()) {
    Fragment.addAllFragmentsLoadedCallback(() => {
        window.fragmentFilesystemSync = new FragmentFilesystemSync("FragmentFilesystemSync");
        window.FragmentFilesystemSync = FragmentFilesystemSync;

        // Register with Cauldron (when available)
        let items = [];
        fragmentFilesystemSync.onSyncStateChanged = () => {
            let menus = new Set();
            items.forEach((item) => {
                item.menuItemConfig._allMenuItems?.forEach((menuItem) => menus.add(menuItem.menu));
            });
            menus.forEach((menu) => menu.checkUpdate());
        };
        let registerMenuItem = function registerMenuItem() {
            if (items.length > 0) return;

            let onAction = async () => {
                if (fragmentFilesystemSync.isEnabled) {
                    await fragmentFilesystemSync.disableSyncingAcrossTabs();
                } else {
                    let directoryHandle = await fragmentFilesystemSync.popupDirectoryPicker();
                    if (directoryHandle) await fragmentFilesystemSync.enableSyncingAcrossTabs(directoryHandle);
                }
            };
            let menuStates = [
                {
                    state: 'disabled',
                    label: 'Fragments to Disk...',
                    tooltip: 'Choose a local folder and synchronize fragments to disk',
                    checked: false
                },
                {
                    state: 'syncing',
                    label: 'Fragments to Disk — Syncing in This Tab',
                    tooltip: 'This tab is synchronizing fragments to disk. Click to disable synchronization in all tabs',
                    checked: true
                },
                {
                    state: 'waiting',
                    label: 'Fragments to Disk — Syncing in Another Tab',
                    tooltip: 'Another tab is synchronizing fragments to disk. This tab will take over automatically if it closes. Click to disable synchronization in all tabs',
                    checked: true
                },
                {
                    state: 'error',
                    label: 'Fragments to Disk — Sync Paused',
                    tooltip: 'This tab could not access the sync directory. Click to disable synchronization in all tabs',
                    checked: true
                }
            ];

            menuStates.forEach((menuState) => {
                let menuItemConfig = {
                    label: menuState.label,
                    tooltip: menuState.tooltip,
                    group: 'Codestrates',
                    groupOrder: 200,
                    order: 200,
                    checked: () => menuState.checked,
                    onOpen: () => fragmentFilesystemSync.syncState === menuState.state,
                    onAction: onAction
                };
                let registration = MenuSystem.MenuManager.registerMenuItem('Cauldron.File.Sync', menuItemConfig);
                items.push({ registration: registration, menuItemConfig: menuItemConfig });
            });
        }

        // If Cauldron is there already, run it, otherwise wait
        if (typeof MenuSystem != 'undefined') {
            registerMenuItem();
        } else {
            EventSystem.registerEventCallback('Cauldron.OnInit', registerMenuItem);
        }

        wpm.onRemoved(({ detail: packageName }) => {
            fragmentFilesystemSync.destroy();
            items.forEach((item) => item.registration.delete());
            items = [];
        });
    });
}
