// Un solo paso antes de salir: lee el DHN, arma el sitio, lo sirve y abre el navegador.
// Uso: npm run hoy [puerto]
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = process.argv[2] ?? '8080';

function paso(titulo, script) {
  console.log(`\n▶ ${titulo}`);
  return spawnSync(process.execPath, [path.join(raiz, script)], { cwd: raiz, stdio: 'inherit' }).status === 0;
}

// Si el DHN no responde seguimos con el último dhn.json: la página avisa cuando está desactualizado.
if (!paso('Leyendo el aviso y los boletines del DHN…', 'job/run.js')) {
  console.warn('\n⚠ No pude leer el DHN. Sigo con los últimos datos guardados (la página avisará si están viejos).');
}
if (!paso('Armando el sitio…', 'scripts/build-site.mjs')) {
  console.error('\n✖ No pude armar el sitio.');
  process.exit(1);
}

console.log(`\n▶ Abriendo http://localhost:${puerto} (Ctrl+C para cerrar)`);
const servidor = spawn(process.execPath, [path.join(raiz, 'scripts/serve.mjs'), puerto], { cwd: raiz, stdio: 'inherit' });
servidor.on('exit', (codigo) => process.exit(codigo ?? 0));

const url = `http://localhost:${puerto}`;
setTimeout(() => {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}, 800);
