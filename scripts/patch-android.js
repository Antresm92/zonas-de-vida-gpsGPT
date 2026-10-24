#!/usr/bin/env node
/* Prepara el proyecto Android que crea "cap add android":
 *   1. permisos de ubicación (GPS) en el manifiesto,
 *   2. ícono de la app (todas las densidades + ícono adaptativo).
 * Se puede ejecutar varias veces: no duplica nada. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const releaseSigningMarker = '// ZONAS_DE_VIDA_RELEASE_SIGNING';

function fail(msg) { console.error('patch-android: ' + msg); process.exit(1); }

if (!fs.existsSync(manifestPath)) fail('no existe ' + manifestPath + '. Ejecuta antes: npx cap add android');
if (!fs.existsSync(gradlePath)) fail('no existe ' + gradlePath + '. Ejecuta antes: npx cap add android');

function findBlock(source, name, startAt) {
  const match = new RegExp('\\b' + name + '\\s*\\{').exec(source.slice(startAt || 0));
  if (!match) return null;
  const open = (startAt || 0) + match.index + match[0].lastIndexOf('{');
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return { open, close: i };
  }
  return null;
}

/* ---------- 0. Configuración segura de release ---------- */
let gradle = fs.readFileSync(gradlePath, 'utf8');
const buildTypes = findBlock(gradle, 'buildTypes');
const release = buildTypes && findBlock(gradle, 'release', buildTypes.open + 1);
if (!release || release.close > buildTypes.close) fail('no se encontró buildTypes.release en ' + gradlePath);

if (!gradle.includes(releaseSigningMarker)) {
  const android = findBlock(gradle, 'android');
  if (!android || buildTypes.open > android.close) fail('no se encontró el bloque android en ' + gradlePath);
  const signingSetup = `
    ${releaseSigningMarker}
    def releaseSigningConfigured = [
        'ANDROID_KEYSTORE_BASE64',
        'ANDROID_KEYSTORE_PASSWORD',
        'ANDROID_KEY_ALIAS',
        'ANDROID_KEY_PASSWORD'
    ].every { System.getenv(it)?.trim() } && file('release.keystore').isFile()
    if (releaseSigningConfigured) {
        def releaseSigning = signingConfigs.findByName('release') ?: signingConfigs.create('release')
        releaseSigning.storeFile = file('release.keystore')
        releaseSigning.storePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
        releaseSigning.keyAlias = System.getenv('ANDROID_KEY_ALIAS')
        releaseSigning.keyPassword = System.getenv('ANDROID_KEY_PASSWORD')
    }
`;
  gradle = gradle.slice(0, android.open + 1) + signingSetup + gradle.slice(android.open + 1);
}

const updatedBuildTypes = findBlock(gradle, 'buildTypes');
const updatedRelease = updatedBuildTypes && findBlock(gradle, 'release', updatedBuildTypes.open + 1);
if (!updatedRelease || updatedRelease.close > updatedBuildTypes.close) fail('no se encontró buildTypes.release en ' + gradlePath);

let releaseConfig = gradle.slice(updatedRelease.open + 1, updatedRelease.close);
if (/^\s*debuggable\s+/m.test(releaseConfig)) {
  releaseConfig = releaseConfig.replace(/^(\s*)debuggable\s+\S+/m, '$1debuggable false');
} else {
  releaseConfig = '\n            debuggable false' + releaseConfig;
}
releaseConfig = releaseConfig.replace(/^\s*signingConfig\s+[^\r\n]+(?:\r?\n)?/gm, '');
if (!releaseConfig.includes('if (releaseSigningConfigured)')) {
  releaseConfig = '\n            if (releaseSigningConfigured) signingConfig signingConfigs.getByName(\'release\')' + releaseConfig;
}
gradle = gradle.slice(0, updatedRelease.open + 1) + releaseConfig + gradle.slice(updatedRelease.close);
fs.writeFileSync(gradlePath, gradle);
console.log('patch-android: release no depurable; firma release solo con credenciales configuradas');

/* ---------- 1. Permisos ---------- */
let xml = fs.readFileSync(manifestPath, 'utf8');
const wanted = [
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-feature android:name="android.hardware.location.gps" android:required="false" />'
];
const missing = wanted.filter((line) => !xml.includes(line.match(/android:name="([^"]+)"/)[1]));
if (missing.length) {
  if (!/<application[\s>]/.test(xml)) fail('el manifiesto no tiene <application>');
  xml = xml.replace(/^[ \t]*<application([\s>])/m, (m, c) => '    ' + missing.join('\n    ') + '\n\n    <application' + c);
  fs.writeFileSync(manifestPath, xml);
  console.log('patch-android: permisos agregados (' + missing.length + ')');
} else {
  console.log('patch-android: los permisos ya estaban');
}

/* ---------- 2. Ícono ---------- */
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const iconSrc = path.join(root, 'android-res');
if (fs.existsSync(iconSrc) && fs.existsSync(res)) {
  copyDir(iconSrc, res);
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  fs.writeFileSync(path.join(res, 'values', 'zv_colors.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="zv_icon_bg">#14301F</color>\n</resources>\n');
  const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <background android:drawable="@color/zv_icon_bg"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive);
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive);
  console.log('patch-android: ícono instalado');
} else {
  console.log('patch-android: se omite el ícono (no hay android-res o res)');
}
