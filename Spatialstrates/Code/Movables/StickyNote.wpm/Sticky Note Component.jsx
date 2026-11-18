import React from 'react';
const { useState, useMemo } = React;
import { ErrorBoundary } from 'react-error-boundary';
import { MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Container, Text as UIText } from '@react-three/uikit';
import { Panel, Button } from '@react-three/uikit-horizon';
import { useProperty } from '#VarvReact';

import { Movable } from '#Spatialstrates .movable';
import { Text } from '#Spatialstrates .text';



const frameGeometry = new RoundedBoxGeometry(0.15, 0.15, 0.005, 1);

const frameMaterialMap = new Map();
frameMaterialMap.set('red', new MeshStandardMaterial({ color: 'hsl(0, 95%, 60%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialMap.set('green', new MeshStandardMaterial({ color: 'hsl(120, 95%, 60%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialMap.set('blue', new MeshStandardMaterial({ color: 'hsl(204, 95%, 60%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialMap.set('yellow', new MeshStandardMaterial({ color: 'hsl(49, 98%, 60%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialMap.set('purple', new MeshStandardMaterial({ color: 'hsl(250, 85%, 60%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialMap.set('orange', new MeshStandardMaterial({ color: 'hsl(28, 95%, 60%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialMap.set('pink', new MeshStandardMaterial({ color: 'hsl(310, 95%, 60%)', metalness: 0.2, roughness: 0.5 }));

const frameMaterialHoveredMap = new Map();
frameMaterialHoveredMap.set('red', new MeshStandardMaterial({ color: 'hsl(0, 95%, 70%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialHoveredMap.set('green', new MeshStandardMaterial({ color: 'hsl(120, 95%, 70%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialHoveredMap.set('blue', new MeshStandardMaterial({ color: 'hsl(204, 95%, 70%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialHoveredMap.set('yellow', new MeshStandardMaterial({ color: 'hsl(49, 98%, 70%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialHoveredMap.set('purple', new MeshStandardMaterial({ color: 'hsl(250, 85%, 70%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialHoveredMap.set('orange', new MeshStandardMaterial({ color: 'hsl(28, 95%, 70%)', metalness: 0.2, roughness: 0.5 }));
frameMaterialHoveredMap.set('pink', new MeshStandardMaterial({ color: 'hsl(310, 95%, 70%)', metalness: 0.2, roughness: 0.5 }));

const KEYBOARD_LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];



function StickyNoteKeyboard({ shiftActive, onToggleShift, onCharacter, onSpace, onNewline, onDelete }) {
    return <Panel anchorX="center" anchorY="top" padding={8} gap={4} flexDirection="column" pixelSize={0.0005}>
        {KEYBOARD_LETTER_ROWS.map(row => <Container key={row} flexDirection="row" gap={4} justifyContent="center">
            {[...row].map(character => {
                const label = shiftActive ? character.toUpperCase() : character;
                return <Button key={character} variant="tertiary" onClick={() => onCharacter(label)}>
                    <UIText>{label}</UIText>
                </Button>;
            })}
        </Container>)}
        <Container flexDirection="row" gap={4} justifyContent="center">
            <Button variant={shiftActive ? 'primary' : 'secondary'} onClick={onToggleShift}>
                <UIText>Shift</UIText>
            </Button>
            <Button variant="tertiary" onClick={onSpace}>
                <UIText>Space</UIText>
            </Button>
            <Button variant="tertiary" onClick={onNewline}>
                <UIText>Enter</UIText>
            </Button>
            <Button variant="secondary" onClick={onDelete}>
                <UIText>Delete</UIText>
            </Button>
        </Container>
    </Panel>;
}

function StickyNote() {
    const [text, setText] = useProperty('text');
    const [selected] = useProperty('selected');
    const [hovered] = useProperty('hovered');
    const [color, setColor] = useProperty('color');
    const [showColorOptions, setShowColorOptions] = useState(false);
    const [shiftActive, setShiftActive] = useState(false);

    function typeText(addition) {
        setText((text || '') + addition);
    }

    function typeCharacter(character) {
        typeText(character);
        setShiftActive(false);
    }

    function deleteCharacter() {
        setText((text || '').slice(0, -1));
    }

    const handle = useMemo(() => <mesh
        geometry={frameGeometry}
        material={hovered ? frameMaterialHoveredMap.get(color || 'yellow') : frameMaterialMap.get(color || 'yellow')}
        position={[0, 0.025, 0]}
        autoUpdateMatrix={false}
    />, [hovered, selected, color]);

    return <Movable handle={handle} upright={false}>
        <Text
            position={[0, 0.025, 0.003]} autoUpdateMatrix={false}
            maxWidth={0.13}
            textAlign='center'
            anchorX='center'
            anchorY='middle'
            color='black'
            fontSize={0.01}>
            {text}
        </Text>
        {selected ? <>
            <group position={[0, -0.06, 0]} rotation={[0, 0, 0]}>
                <Panel anchorX="center" anchorY="top" padding={16} gap={8} flexDirection="row" pixelSize={0.0005}>
                    <Button variant="secondary" onClick={() => setShowColorOptions(!showColorOptions)}>
                        <UIText>Show Colors</UIText>
                    </Button>
                    {showColorOptions ? (<>
                        <Button variant={color === 'red' ? 'primary' : 'tertiary'} onClick={() => setColor('red')}>
                            <UIText>Red</UIText>
                        </Button>
                        <Button variant={color === 'green' ? 'primary' : 'tertiary'} onClick={() => setColor('green')}>
                            <UIText>Green</UIText>
                        </Button>
                        <Button variant={color === 'blue' ? 'primary' : 'tertiary'} onClick={() => setColor('blue')}>
                            <UIText>Blue</UIText>
                        </Button>
                        <Button variant={color === 'yellow' ? 'primary' : 'tertiary'} onClick={() => setColor('yellow')}>
                            <UIText>Yellow</UIText>
                        </Button>
                        <Button variant={color === 'purple' ? 'primary' : 'tertiary'} onClick={() => setColor('purple')}>
                            <UIText>Purple</UIText>
                        </Button>
                        <Button variant={color === 'orange' ? 'primary' : 'tertiary'} onClick={() => setColor('orange')}>
                            <UIText>Orange</UIText>
                        </Button>
                        <Button variant={color === 'pink' ? 'primary' : 'tertiary'} onClick={() => setColor('pink')}>
                            <UIText>Pink</UIText>
                        </Button>
                    </>) : null}
                </Panel>
            </group>
            <group position={[0, -0.14, 0]} rotation={[0, 0, 0]}>
                <StickyNoteKeyboard
                    shiftActive={shiftActive}
                    onToggleShift={() => setShiftActive(!shiftActive)}
                    onCharacter={typeCharacter}
                    onSpace={() => typeText(' ')}
                    onNewline={() => typeText('\n')}
                    onDelete={deleteCharacter} />
            </group>
        </> : null}
    </Movable>;
}

export function Main() {
    const [conceptType] = useProperty('concept::name');
    return conceptType === 'StickyNote' ? <ErrorBoundary fallback={null}>
        <StickyNote />
    </ErrorBoundary> : null;
}
