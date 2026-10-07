# Fragment Filesystem Sync

Synchronizes code fragments from a Codestrates webstrate to a local folder on disk and keeps them in sync bidirectionally.

## Startup and Resume

The webstrate is the source of truth whenever filesystem synchronization starts or a different browser tab takes over synchronization. Before bidirectional synchronization begins, the complete managed state is exported from the webstrate to the selected folder:

- Missing files and folders are created.
- Files with differing contents are overwritten, while matching files are left untouched.
- Files and folders that do not represent elements in the webstrate are removed.
- Fragment attributes, managed DOM order, and the WPM boot configuration are exported from the DOM.
- `.ffs/ffs.meta` is regenerated with the current mapping and synchronization time.

The folder is reconciled path by path and is not cleared and recreated as a whole. This startup reconciliation also runs if `.ffs/ffs.meta` is missing, invalid, or belongs to another webstrate. Changes made only on disk while no browser tab is synchronizing are therefore overwritten or removed when synchronization resumes.

After the startup reconciliation succeeds, synchronization becomes bidirectional and disk edits are applied to the webstrate on the next sync tick.

## Fragment Contents

During bidirectional synchronization, the side that changed since the previous tick decides which contents win. `.ffs/ffs.meta` records the hash of the contents that a fragment and its file last agreed on, together with the modification time and size the file had at that point:

- Only the fragment changed — the file is rewritten.
- Only the file changed — the contents are applied to the fragment.
- Both changed between two ticks — the disk wins, as for the other control files.
- Neither changed — nothing is read or written.

Change detection is based on content rather than on timestamps, so a fragment edit is never reverted by a file that did not change, and a file that is rewritten with identical contents does not create a webstrate version. The recorded modification time and size are only used to skip reading files that were not touched on disk.

> **Important:** Use a dedicated folder for filesystem synchronization. Files and folders that are not represented in the webstrate may be removed during startup or ongoing synchronization.

## Multiple Browser Tabs

Only one browser tab synchronizes a given webstrate pathname to disk at a time. Other tabs wait without accessing the filesystem, and a waiting tab automatically takes over if the synchronizing tab closes or the package is removed from it.

The Cauldron menu indicates whether synchronization is running in the current tab, running in another tab, paused because of an error, or disabled. Enabling and disabling synchronization applies to all open tabs for the same pathname. Query strings and URL fragments do not create separate synchronizers.

## Files on Disk

- **Fragment files** (`.js`, `.jsx`, `.css`, `.scss`, `.json`, `.md`, etc.) — the source code of each `<code-fragment>` element, synchronized in both directions.
- **`.ffs/ffs.meta`** — internal bookkeeping file that tracks webstrate IDs, synchronized content hashes, and file stats. Do not edit manually.
- **`.ffs/ffs.attributes.json`** — a human- and agent-readable JSON file that mirrors the tracked DOM attributes of every fragment and folder. This file is editable: changes made on disk are applied back to the DOM on the next sync tick.
- **`.ffs/ffs.dom-order.json`** — an editable manifest that records the DOM order of synchronized fragments and folders under each managed parent.
- **`.ffs/wpm.bootconfig.json`** — the raw contents of the WPM boot configuration stored in `head script[type="text/json+bootconfig"]`. Changes are synchronized in both directions without parsing or reformatting.

The `.ffs` directory is reserved for synchronization state and is never represented as a folder in the codestrate DOM. Existing root-level FFS control files are not migrated; they are removed when the folder is reconciled with the webstrate.

## Files and Folders

After startup reconciliation, files and folders can be created, renamed, and deleted on disk. The sync will propagate these changes to the DOM:

- **Creating** a file with a recognized extension creates a new `<code-fragment>` in the webstrate.
- **Creating** a folder (or `.wpm` folder) creates a new `<code-folder>` or `<wpm-package>` element.
- **Deleting** a file or folder on disk removes the corresponding element from the DOM.
- **Renaming** is treated as a delete + create. The sync attempts to detect moves by matching content hashes and will carry over attributes like `id` and `class` when possible, but attributes may be lost and need to be re-added in `.ffs/ffs.attributes.json` after the rename.

> **Important:** When creating or renaming files/folders, the new entries will initially have no attributes. You must add the required `_attributes` (such as `class`, `id`, `auto`) in `.ffs/ffs.attributes.json` for the new entries to function correctly with WPM imports and auto-run.

## `.ffs/ffs.attributes.json`

This file uses a nested structure that mirrors the filesystem hierarchy. Each node can have an `_attributes` key containing the tracked DOM attributes for that fragment or folder:

- **`auto`** — the auto-run condition of the fragment (e.g., `""` means auto-run on load, remove the attribute to disable auto-run)
- **`data-type`** — the MIME type / language of the fragment (e.g., `"text/javascript+babel"` for JSX)
- **`class`** — CSS classes on the element, used for WPM exports and component registration
- **`id`** — the element ID, used for WPM package identity and imports

### Example

```json
{
    "Code": {
        "Basic": {
            "Menu.wpm": {
                "_attributes": {
                    "id": "Menu"
                },
                "Menu.jsx": {
                    "_attributes": {
                        "data-type": "text/javascript+babel",
                        "class": "default dynamic-gui-component"
                    }
                },
                "Menu Style.scss": {
                    "_attributes": {
                        "auto": "",
                        "data-type": "text/x-scss"
                    }
                }
            }
        }
    }
}
```

### Editing Rules

- Only change attribute **values** within existing `_attributes` objects, or add/remove attribute keys.
- Do not add new file/folder entries — those are managed by the filesystem sync.
- Changes are applied on the next sync tick (~1 second). Only values that actually differ from the current DOM are written, avoiding unnecessary webstrate versions.
- When synchronization starts or resumes, DOM attributes overwrite disk attributes before bidirectional synchronization begins.
- JSON object property order has no effect on DOM order. Use `.ffs/ffs.dom-order.json` to reorder elements.

## `.ffs/ffs.dom-order.json`

This file records the order of the immediate `<code-fragment>`, `<code-folder>`, and `<wpm-package>` children under `document.body` and every synchronized folder. Object keys are synchronized filesystem directory paths, and each value is an array of immediate child filenames and folder names in DOM order:

```json
{
    "/": ["Code", "Setup.js"],
    "/Code": ["Core", "Components", "App.jsx"],
    "/Code/Core": ["AppShell.wpm", "MaterialColors.wpm"]
}
```

Reordering names in an array moves the corresponding elements in the DOM on the next sync tick. Ordering is recursive: `/` controls managed children directly under the document body, while each folder path controls its own direct managed children. Ordinary HTML children are not listed and retain their positions and relative order. Managed elements nested inside ordinary HTML wrappers are not reordered.

During active synchronization, a disk edit wins if the disk manifest and DOM order both change between ticks. A DOM-only reorder is exported to disk. When synchronization starts or another tab takes over, the webstrate is authoritative and its current DOM order overwrites the disk manifest.

The manifest is reconciled with the synchronized filesystem structure:

- A valid partial array places its known entries first, then retains unlisted children in their current relative order.
- Unknown and duplicate entries are ignored and removed when the canonical manifest is written.
- Creating, deleting, or renaming a file or folder updates the manifest after the filesystem operation is synchronized.
- Deleting the manifest regenerates it from the DOM.
- During active synchronization, invalid JSON or an invalid top-level schema is preserved without changing the DOM. A console warning is emitted, and order synchronization resumes after the file is corrected. Startup reconciliation still replaces it with the authoritative DOM order.
- Collision suffixes such as `_1` remain associated with the same DOM elements when same-named siblings are reordered.

## `.ffs/wpm.bootconfig.json`

This file synchronizes the exact text content of the WPM boot configuration in both directions:

- Editing the file updates the DOM script on the next sync tick.
- Editing the DOM script updates the file on the next sync tick.
- Content is not parsed or validated, so temporarily invalid JSON is still synchronized.
- During active bidirectional synchronization, if disk and DOM both change between ticks, the disk content wins.
- Deleting the file regenerates it from the DOM.
- When synchronization starts or resumes, the DOM content wins. If the boot configuration script is absent, a stale `.ffs/wpm.bootconfig.json` file is removed.
- During active synchronization, boot configuration synchronization is skipped while the DOM script is absent.

Changing the boot configuration does not reload WPM packages in the current page session; WPM consumes the configuration during the next page boot.
