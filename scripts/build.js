const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: [path.resolve(__dirname, '../src/extension.ts')],
    bundle: true,
    outfile: path.resolve(__dirname, '../out/extension.js'),
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    minify: false,
    logLevel: 'info'
};

async function run() {
    if (isWatch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[build] Watching for file changes...');
    } else {
        await esbuild.build(buildOptions);
        console.log('[build] Build completed successfully -> out/extension.js');
    }
}

run().catch(err => {
    console.error('[build] Build failed:', err);
    process.exit(1);
});
