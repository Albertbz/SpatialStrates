# AGENTS.md

Webstrates + Codestrates + Fragment Filesystem Sync — Agents Documentation — V2.2


## Fragment Filesystem Sync

This folder contains synchronized fragments from a codestrate as plain files. Code cannot be executed locally and there is no build step — editing files here syncs changes back to the live webstrate.

### Fragment Files and Folders

Files correspond to `<code-fragment>` elements in the DOM. The supported types are: `.html`, `.css`, `.scss`, `.js`, `.jsx`, `.json`, `.md`.

Folders correspond to `<code-folder>` elements, and folders ending in `.wpm` correspond to `<wpm-package>` elements. The folder structure on disk mirrors the DOM hierarchy of fragments and folders in the webstrate.

The file- and foldername comes from the `name=""` attribute on the fragment element.

### Control Files

Fragment Filesystem Sync stores its control files in the `.ffs` folder in the workspace root. This folder is reserved and does not represent a folder in the codestrate DOM.

The `.ffs/ffs.attributes.json` file contains a nested JSON tree mirroring the filesystem hierarchy. Each entry can have an `_attributes` key with the tracked DOM attributes (`auto`, `data-type`, `class`, `id`) for that fragment or folder.

- Read this file to understand which CSS classes and IDs are assigned to each fragment
- Edit attribute values here and they will be synced to the DOM automatically on the next tick
- Do not add or remove file/folder entries in this JSON — only modify attribute values
- The `.ffs/ffs.meta` file contains internal synchronization state and must never be edited manually

The `.ffs/ffs.dom-order.json` file contains arrays describing the DOM order of synchronized fragments and folders under each filesystem directory path.

- Reorder existing generated array entries to change DOM sibling order; do not invent paths or entry names
- Changing an array moves the corresponding elements in the live DOM on the next sync tick
- Wait for a newly created or renamed file/folder to appear after a sync tick before changing its order
- JSON property order in `.ffs/ffs.attributes.json` does not control DOM order

The `.ffs/wpm.bootconfig.json` file contains the exact text of the WPM boot configuration from `head script[type="text/json+bootconfig"]`.

- Changes are synchronized in both directions without JSON validation or reformatting
- If both disk and DOM change between ticks, the disk content wins
- Deleting the file regenerates it from the DOM
- Changing it affects WPM on the next page boot; it does not reload packages in the current session

### Creating, Renaming, and Deleting Files

Files and folders can be created, renamed, and deleted on disk, and the changes will sync to the DOM:

- **Renaming** a file or folder may cause its attributes (`class`, `id`, `auto`) to be lost — re-add them in `.ffs/ffs.attributes.json` after renaming
- **Creating** a new file or folder will initially have no attributes — wait approximately one sync tick for its entry to appear in `.ffs/ffs.attributes.json`, then add or modify only the required keys inside its generated `_attributes` object
- **Ordering** a new or renamed file/folder requires waiting for it to appear in `.ffs/ffs.dom-order.json`, then moving its existing array entry
- Never create the file/folder entry in `.ffs/ffs.attributes.json` manually; Fragment Filesystem Sync owns the tree structure
- CSS and SCSS fragments need `auto: ""` to be active, and importable JavaScript or JSX fragments need the appropriate `class` or `id`


## Development

- You should only edit files in the `Code` folder unless the user asks for other changes explicitely
- `.ffs/ffs.attributes.json` and `.ffs/ffs.dom-order.json` are the permitted exceptions when a Code change requires assigning attributes or changing DOM order; only edit generated attribute keys/values or reorder generated array entries
- Refrain from making edits to files by deleting and recreating them, as this removes attributes from fragments and reorders fragments in the DOM

### Importing and Exporting

- Imports between fragments use DOM query selectors under the hood, not the filesystem path
- **Exporting** a value from a fragment:
    - Use standard ES module `export` syntax.
    - The fragment must have an `id` or `class` attribute set in `.ffs/ffs.attributes.json` that the importer can reference
- **Importing** from another fragment:
    - Use `import MyComponent from '#PackageId .fragmentClass';` — where `PackageId` is the `id` of the `.wpm` folder and `fragmentClass` is the `class` on the fragment file
    - The `.default` portion of a selector refers to the fragment's CSS class, not to a JavaScript default export
    - Match the import syntax to the fragment's actual ES module export: use `import { MyComponent } from '#MyPackage .default';` for a named export
    - Do **not** use relative imports like `import MyComponent from '../MyComponent';`
    - Do **not** use filesystem folder paths like `import MyComponent from '#Code/MyComponent';`
- CSS and SCSS files cannot export and import values

### WPM Descriptors and Assets

- List every package dependency and asset in the package's `descriptor.json`
- Shared repository packages must declare their own transitive package dependencies rather than relying on the consuming app to install them
- Assets are not fragment files and may not appear in the synchronized package folder; after an asset has been added to the WPM package, list its filename in `assets` and reference it with a package-relative URL such as `example.svg`

### Code Style

- Use 4 spaces for indentation
- Use single quotes for strings
- Use semicolons at the end of statements
- Use camelCase for variable and function names
- Use PascalCase for React component names
- Use descriptive names for variables and functions
- Add a newline at the end of files
- Titles on, e.g., buttons should be in Title Case, e.g., "Submit Query"
- Use material icons over emojis by giving an element the "material-icons" class
- Do not use BEM class naming (e.g. `block__element--modifier`); use SCSS nesting instead


## Platform Documentation

- Webstrates: https://www.webstrates.net/
    - Webstrates API: https://webstrates.github.io/userguide/api.html
- Codestrates: https://codestrates.projects.cavi.au.dk/
    - Codestrates API: https://codestrates.projects.cavi.au.dk/api/codestrates/
    - Cauldron API: https://codestrates.projects.cavi.au.dk/api/cauldron/
    - Webstrates Package Manager (WPM): https://codestrates.projects.cavi.au.dk/api/wpm/
- cQuery: https://codestrates.projects.cavi.au.dk/api/cquery/cQuery.html

### Webstrates API

Collaborative web document editing platform with real-time synchronization capabilities:
- **Events**: Subscribe to document loading, element changes, and user interactions
- **Data Management**: Transient data (temporary), cookies (persistent across devices), and oplog (operation history)
- **Collaboration**: Asset management with versioning, client monitoring, signaling between users
- **Advanced Features**: Performance optimization, protected mode, permissions/access control, invite keys, version control and restoration

### Codestrates API

Built on Webstrates, enables persistent DOM changes with multi-language fragment support:
- **Editors**: Multiple editor types (AceEditor, CodemirrorEditor, MonacoEditor) with common methods like getValue(), setValue(), insertText(), deleteText()
- **Fragments**: Support for various languages (HTML, CSS, JavaScript, Python, etc.) with text insertion/deletion handlers
- **Event System**: Editor events for blur, focus, and selection changes
- **Programming Languages**: Multi-language fragment execution and management

### Cauldron API

Browser-based IDE for editing Webstrates directly in the browser:
- **Core Classes**: Cauldron (open/close/createComponent), CauldronEditor (editing), CauldronInspector (content binding), CauldronSettings (configuration)
- **Events**: Initialization, open/close, and fragment editor events
- **Features**: Direct web editing without developer tools, component management, settings configuration
- **Status**: No stable release yet, extensible IDE-like tool for web document manipulation

### WPM (Webstrates Package Manager) v2 API

Comprehensive package management system for web-based applications:
- **Core Classes**: WPMv2 (primary package management), WPMInterface (package events and interactions)
- **Repository Management**: Register/unregister repositories, package discovery and installation
- **Dependencies**: Dependency resolution, package metadata management, external requirements
- **Key Methods**: registerRepository(), installWPMInto(), getCurrentlyInstalledPackages(), requireAll()

<!-- End Base AGENTS.md File -->



# Spatialstrates

## Development

- The `Spatialstrates.jsx` file is the entry point of the application
- Always create React components, do not use regular classes
- Some WPM packages have multiple exports, identified by CSS class — check `ffs.attributes.json` to see class assignments, or refer to the Importing and Exporting section above


## Library Documentation

- React Three Fiber: https://docs.pmnd.rs/react-three-fiber
- React Three Drei: https://docs.pmnd.rs/drei
- React Three XR: https://docs.pmnd.rs/xr
    - Handles API: https://pmndrs.github.io/xr/docs/handles/introduction
- React Three UIKit: https://docs.pmnd.rs/uikit


## Movable Components

Spatialstrates movables should be small WPM packages with one Varv concept, one 3D scene component, one 2D tldraw shape, and one menu/uploader fragment. Use existing packages such as `Code/Movables/StickyNote.wpm`, `Code/Movables/Flashlight.wpm`, `Code/Datavisualization/Components/VisShelf.wpm`, and `Code/Datavisualization/Components/VisPiece.wpm` as templates.

### Structure

- `descriptor.json`: dependencies and assets.
- `<Name> Concepts.json`: Varv schema with `extensions.inject: [ "Movable" ]`.
- `<Name> Component.jsx`: 3D React Three Fiber representation.
- `<Name> Shape.jsx`: 2D tldraw representation.
- `<Name> Menu.jsx` or uploader/menu fragment: creates instances from desktop and controller menus.
- Optional `Style.scss`: 2D or DOM styling.

### Varv Concept

Varv is the source of truth. Store persistent state, configuration, and relationships in the concept schema, and inject `Movable` for anything that should appear in space. Use `useProperty` for normal reads/writes and `VarvEngine` only for creation, deletion, grouping, cross-instance updates, or callbacks.

For families of related movables, use an intermediate concept when it avoids duplication. The visualization components use `VisMovable` for shared state, then inject both `Movable` and `VisMovable` into `VisPiece` and `VisGroup`.

### 3D Scene Component

Export `Main`, check `concept::name`, and return `null` for other concept types. Wrap the actual component in `ErrorBoundary fallback={null}` and wrap visible 3D content in `<Movable handle={handle}>...</Movable>`.

The `handle` should be the selection/drag target. Pass `upright={false}` for freely rotating movables, and use `onDragStart`, `onDragging`, or `onDragEnd` for movement-related behavior such as grouping or proximity authoring. Keep transient 3D UI in React state, but persist user choices in Varv.

### 2D Canvas Shape

Export `Main` as a `MovableShapeUtil` subclass with `static type` matching the Varv concept name. Render custom shape UI inside `<MovableVarvScope shape={shape}>` so `useProperty` targets the represented concept instance.

Use `getDefaultProps()` with `CANVAS_SCALE` for size, `HTMLContainer` for DOM UI, and `stopEventPropagation` on interactive inputs. Keep 2D and 3D behavior equivalent where practical.

### Menu and Creation

Menu fragments should be small auto-run fragments that register entries with `#Menu .default` and, when relevant, `#ControllerMenu .default`. Use `createMovable('<ConceptName>', initialProperties)` from `#Spatialstrates .movable-helpers`; it initializes position/rotation from the current view, selects the new instance, and adds it to the current space. Use stable IDs such as `movables` and `add-<name>`, and Title Case labels like `New Sticky Note`.

### Fragment Attributes and Dynamic Loading

- Concept fragments: `auto: ""`, `data-type: "text/varv"`.
- 3D component fragments: `class: "default dynamic-movable-scene-component"` unless there are intentional multiple exports.
- 2D shape fragments: `class: "dynamic-shape-component"`.
- Menu, uploader, and SCSS fragments that must run automatically: `auto: ""`.
- WPM folder: `id` matching the import selector, such as `StickyNote`, `VisShelf`, or `VisPiece`.

### Implementation Practices

- Use selector imports, not relative filesystem imports.
- Keep 3D component, 2D shape, Varv concept, and menu responsibilities separate.
- For cloned, grouped, or generated movables, update both the concept instance and owning space/group relationship.
- Clean up callbacks, subscriptions, and external listeners in `useEffect` cleanup functions.
- Keep geometry, materials, and GLTF loading out of hot render paths with module constants, `useMemo`, and `useGLTF.preload`.
