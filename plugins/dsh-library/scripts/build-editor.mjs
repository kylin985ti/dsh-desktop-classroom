import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const inlineCss = { name: 'bundle-editor-css', setup(builder) {
  builder.onLoad({ filter: /\.css$/ }, async args => {
    const result = await build({ entryPoints: [args.path], bundle: true, write: false, minify: true,
      outfile: 'editor.css', loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' } });
    const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
    if (/@import\b/.test(css)) throw new Error('Editor CSS must not depend on external stylesheets');
    return { contents: 'export default ' + JSON.stringify(css), loader: 'js' };
  });
} };
const compiled = await build({ absWorkingDir: process.cwd(), entryPoints: ['src/markdown-editor.js'], bundle: true, write: false, format: 'iife', globalName: 'DSHMarkdownEditor', target: 'es2022', minify: true, plugins: [inlineCss], legalComments: 'inline' });
const uiStyles = await readFile('src/library-ui.css', 'utf8');
const client = (await readFile('src/client-base.js', 'utf8')).replace('__LIBRARY_UI_CSS__', () => JSON.stringify(uiStyles));
if (client.includes('__LIBRARY_UI_CSS__')) throw new Error('Library UI styles were not embedded');
await writeFile('lib/client.js', compiled.outputFiles[0].text + '\n' + client);
