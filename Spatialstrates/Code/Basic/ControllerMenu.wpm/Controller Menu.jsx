import React from 'react';
const { useState, useEffect, useMemo, useRef } = React;
import { Color, Matrix4 } from 'three';
import { createPortal, useFrame } from '@react-three/fiber';
import { useXR, useXRInputSourceState, useGetXRSpaceMatrix } from '@react-three/xr';
import { Container, Text as UIText } from '@react-three/uikit';
import { Label } from '@react-three/uikit-default';
import { Panel, Button } from '@react-three/uikit-horizon';
import { MenuIcon, XIcon } from '@react-three/uikit-lucide';



const COLORS = {
    red: '#ff3333',
    green: '#66ff66',
    blue: '#6666ff',
    yellow: '#ffcc66',
    purple: '#ff66ff',
    orange: '#ff9966',
    pink: '#ff3399',
};



function hsl(h, s, l) {
    return new Color().setHSL(h / 360, s / 100, l / 100, 'srgb')
}

if (!window.moduleControllerMenu) {
    window.moduleControllerMenu = {
        subMenus: new Map(),
        menuNeedsUpdate: true
    };
}

class MenuItem {
    constructor(id, element, weight) {
        this.id = id;
        this.element = element;
        this.weight = weight;
    }
}

class SubMenu {
    constructor(id, weight, alwaysVisible = false) {
        this.id = id;
        this.weight = weight;
        this.alwaysVisible = alwaysVisible; // Does not do anything yet
        this.items = new Map();
    }

    addItem(item) {
        this.items.set(item.id, item);
    }
}

export const addControllerSubMenu = (id, weight, alwaysVisible) => {
    if (window.moduleControllerMenu.subMenus.has(id)) {
        return window.moduleControllerMenu.subMenus.get(id);
    }
    const subMenu = new SubMenu(id, weight, alwaysVisible);
    window.moduleControllerMenu.subMenus.set(id, subMenu);
    window.moduleControllerMenu.menuNeedsUpdate = true;
    return subMenu;
};

export const addItemToControllerSubMenu = (subMenuId, id, element, weight) => {
    const menuItem = new MenuItem(id, element, weight);
    const subMenu = window.moduleControllerMenu.subMenus.get(subMenuId);
    if (!subMenu) {
        console.error(`SubMenu ${subMenuId} not found`);
        return;
    }
    subMenu.addItem(menuItem);
    window.moduleControllerMenu.menuNeedsUpdate = true;
    return menuItem;
};

export function ControllerMenuTitle({ title }) {
    return <Label>
        <UIText
            fontSize={18}
            padding={16}>{title}</UIText>
    </Label>;
}

export function ControllerMenuSpacer() {
    return <Label>
        <UIText color={hsl(0, 0, 30)}>|</UIText>
    </Label>;
}

export function ControllerMenuButton({ onClick, toggled, children }) {
    return <Button
        variant={toggled ? 'primary' : 'secondary'}
        flexGrow={1}
        onClick={onClick}>
        <UIText textAlign="center">{children}</UIText>
    </Button>;
}

function SubMenuComponent({ key, children }) {
    return <Container key={key}
        maxWidth={800}
        padding={16}
        flexDirection="row"
        flexWrap="wrap"
        gap={8}>
        {children}
    </Container>
}

function SubMenus() {
    const [showMenu, setShowMenu] = useState(false);
    const [output, setOutput] = useState(null);

    const updateMenu = () => {
        const subMenus = Array.from(window.moduleControllerMenu.subMenus.values());
        subMenus.sort((a, b) => a.weight - b.weight);

        setOutput(<>
            {subMenus.map(subMenu => {
                const items = Array.from(subMenu.items.values());
                items.sort((a, b) => a.weight - b.weight);
                return <SubMenuComponent key={subMenu.id}>
                    {items.map((item, index) => (React.cloneElement(item.element, { key: index })))}
                </SubMenuComponent>;
            })}
        </>);
    }

    useEffect(() => {
        if (window.moduleControllerMenu.menuNeedsUpdate) {
            window.moduleControllerMenu.menuNeedsUpdate = false;
            updateMenu();
        }
    });

    useEffect(() => {
        updateMenu();
    }, []);

    return <Panel
        anchorX="center"
        anchorY="bottom"
        pixelSize={0.0005}
        padding={16}
        gap={16}
        flexDirection="column">
        {showMenu ? output : null}
        <Button
            variant="primary"
            flexDirection="row"
            alignItems="center"
            gap={8}
            onClick={() => setShowMenu(!showMenu)}>
            {showMenu ? <XIcon width={20} height={20} /> : <MenuIcon width={20} height={20} />}
            <UIText>{showMenu ? 'Close Menu' : 'Open Menu'}</UIText>
        </Button>
    </Panel>;
}

// Keep the menu at its last pose for a moment when tracking drops, so short dropouts do not make it flicker
const TRACKING_LOST_GRACE_PERIOD = 500;

const tempTargetRayMatrix = new Matrix4();
const tempWristMatrix = new Matrix4();

function ControllerMenu() {
    const controllerLeft = useXRInputSourceState('controller', 'left');
    const handLeft = useXRInputSourceState('hand', 'left');
    const origin = useXR((xr) => xr.origin);
    const session = useXR((xr) => xr.session);
    const anchorRef = useRef(null);
    const lastTrackedTime = useRef(-Infinity);
    const wristToTargetRay = useRef(null);

    // Controllers follow the grip space, as the controller model does. The models themselves are replaced or
    // unmounted when tracking is lost, so the menu must not be attached to them.
    const getControllerMatrix = useGetXRSpaceMatrix(controllerLeft
        ? controllerLeft.inputSource.gripSpace ?? controllerLeft.inputSource.targetRaySpace
        : undefined);

    // A hand's target ray is an aiming ray that is not rigidly attached to the hand, and it is re-estimated when
    // tracking is regained. The hand menu therefore follows the wrist joint, using the offset between the wrist
    // and the target ray captured once per session, so it keeps its initial placement relative to the hand.
    const getHandTargetRayMatrix = useGetXRSpaceMatrix(controllerLeft ? undefined : handLeft?.inputSource.targetRaySpace);
    const getWristMatrix = useGetXRSpaceMatrix(controllerLeft ? undefined : handLeft?.inputSource.hand?.get('wrist'));

    useEffect(() => {
        wristToTargetRay.current = null;
    }, [session]);

    const updateHandMatrix = (target, frame) => {
        if (!getWristMatrix?.(tempWristMatrix, frame)) return false;

        if (!wristToTargetRay.current) {
            if (!getHandTargetRayMatrix?.(tempTargetRayMatrix, frame)) return false;
            wristToTargetRay.current = tempWristMatrix.clone().invert().multiply(tempTargetRayMatrix);
        }

        target.multiplyMatrices(tempWristMatrix, wristToTargetRay.current);
        return true;
    };

    useFrame((_state, _delta, frame) => {
        const anchor = anchorRef.current;
        if (!anchor) return;

        const tracked = controllerLeft
            ? getControllerMatrix?.(anchor.matrix, frame)
            : updateHandMatrix(anchor.matrix, frame);

        if (tracked) {
            lastTrackedTime.current = performance.now();
            anchor.visible = true;
        } else {
            anchor.visible = performance.now() - lastTrackedTime.current < TRACKING_LOST_GRACE_PERIOD;
        }
        // Invisible objects still receive pointer events, so stop pointers from hitting the hidden menu
        anchor.intersectChildren = anchor.visible;
    }, -100);

    // The menu stays mounted while tracking is lost, so it keeps its state and reappears as soon as tracking returns
    const submenus = useMemo(() => <SubMenus />, []);

    if (!origin || !session) return null;

    return createPortal(<group ref={anchorRef} matrixAutoUpdate={false} visible={false}>
        <group
            position={controllerLeft ? [0, 0.11, 0.06] : [-0.02, 0.06, 0.11]}
            rotation={controllerLeft ? [-Math.PI / 2, 0, 0] : [-0.2, 0.2, -0.5]}>
            {submenus}
        </group>
    </group>, origin);
}



export function Main() {
    return <ControllerMenu />;
}
