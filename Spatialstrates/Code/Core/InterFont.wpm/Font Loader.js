// The server hangs when serving larger files from inside a zip asset, so the font is
// unpacked here instead of being referenced as `inter-font.zip/...` in an @font-face rule
const INTER_FONT_ZIP = 'inter-font.zip';

const FONT_FACES = [
    { fileName: 'InterVariable.woff2', style: 'normal' },
    { fileName: 'InterVariable-Italic.woff2', style: 'italic' }
];

const loadInterFont = async () => {
    const { unzipSync } = await import('fflate');

    const response = await fetch(INTER_FONT_ZIP);
    if (!response.ok) throw new Error('Status ' + response.status);
    const fileNames = FONT_FACES.map(fontFace => fontFace.fileName);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
        filter: file => fileNames.includes(file.name)
    });

    await Promise.all(FONT_FACES.map(async ({ fileName, style }) => {
        if (!files[fileName]) throw new Error(fileName + ' is missing in ' + INTER_FONT_ZIP);

        const fontFace = new FontFace('Inter', files[fileName], {
            style: style,
            weight: '100 900',
            display: 'swap'
        });
        document.fonts.add(await fontFace.load());
    }));
};

loadInterFont().catch(error => {
    console.warn('Could not load the Inter font:', error);
});
