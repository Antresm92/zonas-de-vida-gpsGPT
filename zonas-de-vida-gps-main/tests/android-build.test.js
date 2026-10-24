const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('Android patch keeps debug debuggable and leaves release unsigned without release credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zv-android-build-'));
  const scriptsDir = path.join(root, 'scripts');
  const appDir = path.join(root, 'android', 'app');
  const manifestDir = path.join(appDir, 'src', 'main');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'scripts', 'patch-android.js'),
    path.join(scriptsDir, 'patch-android.js')
  );
  fs.writeFileSync(path.join(manifestDir, 'AndroidManifest.xml'), '<manifest><application></application></manifest>');
  const gradlePath = path.join(appDir, 'build.gradle');
  fs.writeFileSync(gradlePath, `android {
    buildTypes {
        debug {
            debuggable true
        }
        release {
            debuggable true
            signingConfig signingConfigs.debug
        }
    }
}
`);

  try {
    execFileSync(process.execPath, [path.join(scriptsDir, 'patch-android.js')], { stdio: 'ignore' });
    const firstPatch = fs.readFileSync(gradlePath, 'utf8');
    execFileSync(process.execPath, [path.join(scriptsDir, 'patch-android.js')], { stdio: 'ignore' });
    const gradle = fs.readFileSync(gradlePath, 'utf8');

    assert.match(gradle, /debug\s*\{\s*debuggable true\s*\}/);
    assert.match(gradle, /release\s*\{\s*if \(releaseSigningConfigured\) signingConfig signingConfigs\.getByName\('release'\)\s*debuggable false/);
    assert.match(gradle, /'ANDROID_KEYSTORE_BASE64'/);
    assert.match(gradle, /'ANDROID_KEYSTORE_PASSWORD'/);
    assert.match(gradle, /'ANDROID_KEY_ALIAS'/);
    assert.match(gradle, /'ANDROID_KEY_PASSWORD'/);
    assert.match(gradle, /releaseSigning\.storeFile = file\('release\.keystore'\)/);
    assert.doesNotMatch(gradle, /signingConfig signingConfigs\.debug/);
    assert.equal(gradle, firstPatch, 'patch should be idempotent');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GitHub Actions builds and publishes an installable debug APK artifact', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'android.yml'),
    'utf8'
  );

  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(workflow, /name: APK_DiagramaH_iA3/);
  assert.match(workflow, /APK_DiagramaH_iA3\.apk/);
});
