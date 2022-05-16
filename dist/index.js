/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 50:
/***/ ((__unused_webpack_module, __webpack_exports__, __nccwpck_require__) => {

"use strict";
__nccwpck_require__.r(__webpack_exports__);
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   "DEFAULT_CACHE_VERSION": () => (/* binding */ DEFAULT_CACHE_VERSION),
/* harmony export */   "detectGemfiles": () => (/* binding */ detectGemfiles),
/* harmony export */   "installBundler": () => (/* binding */ installBundler),
/* harmony export */   "bundleInstall": () => (/* binding */ bundleInstall)
/* harmony export */ });
const fs = __nccwpck_require__(147)
const path = __nccwpck_require__(17)
const core = __nccwpck_require__(122)
const exec = __nccwpck_require__(659)
const cache = __nccwpck_require__(314)
const common = __nccwpck_require__(31)

const DEFAULT_CACHE_VERSION = '0'

// The returned gemfile is guaranteed to exist, the lockfile might not exist
function detectGemfiles() {
  const gemfilePath = process.env['BUNDLE_GEMFILE'] || 'Gemfile'
  if (fs.existsSync(gemfilePath)) {
    return [gemfilePath, `${gemfilePath}.lock`]
  } else if (process.env['BUNDLE_GEMFILE']) {
    throw new Error(`$BUNDLE_GEMFILE is set to ${gemfilePath} but does not exist`)
  }

  if (fs.existsSync("gems.rb")) {
    return ["gems.rb", "gems.locked"]
  }

  return [null, null]
}

function readBundledWithFromGemfileLock(lockFile) {
  if (lockFile !== null && fs.existsSync(lockFile)) {
    const contents = fs.readFileSync(lockFile, 'utf8')
    const lines = contents.split(/\r?\n/)
    const bundledWithLine = lines.findIndex(line => /^BUNDLED WITH$/.test(line.trim()))
    if (bundledWithLine !== -1) {
      const nextLine = lines[bundledWithLine+1]
      if (nextLine && /^\d+/.test(nextLine.trim())) {
        const bundlerVersion = nextLine.trim()
        console.log(`Using Bundler ${bundlerVersion} from ${lockFile} BUNDLED WITH ${bundlerVersion}`)
        return bundlerVersion
      }
    }
  }
  return null
}

async function afterLockFile(lockFile, platform, engine, rubyVersion) {
  if (engine.startsWith('truffleruby') && common.floatVersion(rubyVersion) < 21.1 && platform.startsWith('ubuntu-')) {
    const contents = fs.readFileSync(lockFile, 'utf8')
    if (contents.includes('nokogiri')) {
      await common.measure('Installing libxml2-dev libxslt-dev, required to install nokogiri on TruffleRuby < 21.1', async () =>
        exec.exec('sudo', ['apt-get', '-yqq', 'install', 'libxml2-dev', 'libxslt-dev'], { silent: true }))
    }
  }
}

async function installBundler(bundlerVersionInput, rubygemsInputSet, lockFile, platform, rubyPrefix, engine, rubyVersion) {
  let bundlerVersion = bundlerVersionInput

  if (rubygemsInputSet && bundlerVersion === 'default') {
    console.log('Using the Bundler installed by updating RubyGems')
    return 'unknown'
  }

  if (bundlerVersion === 'default' || bundlerVersion === 'Gemfile.lock') {
    bundlerVersion = readBundledWithFromGemfileLock(lockFile)

    if (!bundlerVersion) {
      bundlerVersion = 'latest'
    }
  }

  if (bundlerVersion === 'latest') {
    bundlerVersion = '2'
  }

  if (/^\d+(?:\.\d+){0,2}$/.test(bundlerVersion)) {
    // OK - input is a 1, 2, or 3 part version number
  } else {
    throw new Error(`Cannot parse bundler input: ${bundlerVersion}`)
  }

  const floatVersion = common.floatVersion(rubyVersion)

  // Use Bundler 1 when we know Bundler 2 does not work
  if (bundlerVersion.startsWith('2')) {
    if (engine === 'ruby' && floatVersion <= 2.2) {
      console.log('Bundler 2 requires Ruby 2.3+, using Bundler 1 on Ruby <= 2.2')
      bundlerVersion = '1'
    } else if (engine === 'ruby' && /^2\.3\.[01]/.test(rubyVersion)) {
      console.log('Ruby 2.3.0 and 2.3.1 have shipped with an old rubygems that only works with Bundler 1')
      bundlerVersion = '1'
    } else if (engine === 'jruby' && rubyVersion.startsWith('9.1')) { // JRuby 9.1 targets Ruby 2.3, treat it the same
      console.log('JRuby 9.1 has a bug with Bundler 2 (https://github.com/ruby/setup-ruby/issues/108), using Bundler 1 instead on JRuby 9.1')
      bundlerVersion = '1'
    }
  }

  // Workaround for truffleruby 22.0 + latest Bundler, use shipped Bundler instead: https://github.com/oracle/truffleruby/issues/2586
  const truffleruby22workaround = engine.startsWith('truffleruby') && rubyVersion.startsWith('22.0')
  const useShippedBundler2 = common.isHeadVersion(rubyVersion) || truffleruby22workaround

  if (useShippedBundler2 && common.isBundler2Default(engine, rubyVersion) && bundlerVersion.startsWith('2')) {
    // Avoid installing a newer Bundler version for head versions as it might not work.
    // For releases, even if they ship with Bundler 2 we install the latest Bundler.
    if (truffleruby22workaround) {
      console.log(`Using Bundler 2 shipped with ${engine}-${rubyVersion} (workaround for https://github.com/oracle/truffleruby/issues/2586 on truffleruby 22.0)`)
    } else {
      console.log(`Using Bundler 2 shipped with ${engine}-${rubyVersion} (head versions do not always support the latest Bundler release)`)
    }
  } else if (engine.startsWith('truffleruby') && common.isBundler1Default(engine, rubyVersion) && bundlerVersion.startsWith('1')) {
    console.log(`Using Bundler 1 shipped with ${engine}-${rubyVersion} (required for truffleruby < 21.0)`)
  } else {
    const gem = path.join(rubyPrefix, 'bin', 'gem')
    // Workaround for https://github.com/rubygems/rubygems/issues/5245
    const force = (platform.startsWith('windows-') && engine === 'ruby' && floatVersion >= 3.1) ? ['--force'] : []

    const versionParts = [...bundlerVersion.matchAll(/\d+/g)].length
    const bundlerVersionConstraint = versionParts === 3 ? bundlerVersion : `~> ${bundlerVersion}.0`

    await exec.exec(gem, ['install', 'bundler', ...force, '-v', bundlerVersionConstraint])
  }

  return bundlerVersion
}

async function bundleInstall(gemfile, lockFile, platform, engine, rubyVersion, bundlerVersion, cacheVersion) {
  if (gemfile === null) {
    console.log('Could not determine gemfile path, skipping "bundle install" and caching')
    return false
  }

  let envOptions = {}
  if (bundlerVersion.startsWith('1') && common.isBundler2Default(engine, rubyVersion)) {
    // If Bundler 1 is specified on Rubies which ship with Bundler 2,
    // we need to specify which Bundler version to use explicitly until the lockfile exists.
    console.log(`Setting BUNDLER_VERSION=${bundlerVersion} for "bundle config|lock" commands below to ensure Bundler 1 is used`)
    envOptions = { env: { ...process.env, BUNDLER_VERSION: bundlerVersion } }
  }

  // config
  const cachePath = 'vendor/bundle'
  // An absolute path, so it is reliably under $PWD/vendor/bundle, and not relative to the gemfile's directory
  const bundleCachePath = path.join(process.cwd(), cachePath)

  await exec.exec('bundle', ['config', '--local', 'path', bundleCachePath], envOptions)

  if (fs.existsSync(lockFile)) {
    await exec.exec('bundle', ['config', '--local', 'deployment', 'true'], envOptions)
  } else {
    // Generate the lockfile so we can use it to compute the cache key.
    // This will also automatically pick up the latest gem versions compatible with the Gemfile.
    await exec.exec('bundle', ['lock'], envOptions)
  }

  await afterLockFile(lockFile, platform, engine, rubyVersion)

  // cache key
  const paths = [cachePath]
  const baseKey = await computeBaseKey(platform, engine, rubyVersion, lockFile, cacheVersion)
  const key = `${baseKey}-${await common.hashFile(lockFile)}`
  // If only Gemfile.lock changes we can reuse part of the cache, and clean old gem versions below
  const restoreKeys = [`${baseKey}-`]
  console.log(`Cache key: ${key}`)

  // restore cache & install
  let cachedKey = null
  try {
    cachedKey = await cache.restoreCache(paths, key, restoreKeys)
  } catch (error) {
    if (error.name === cache.ValidationError.name) {
      throw error;
    } else {
      core.info(`[warning] There was an error restoring the cache ${error.message}`)
    }
  }

  if (cachedKey) {
    console.log(`Found cache for key: ${cachedKey}`)
  }

  // Always run 'bundle install' to list the gems
  await exec.exec('bundle', ['install', '--jobs', '4'])

  // @actions/cache only allows to save for non-existing keys
  if (cachedKey !== key) {
    if (cachedKey) { // existing cache but Gemfile.lock differs, clean old gems
      await exec.exec('bundle', ['clean'])
    }

    // Error handling from https://github.com/actions/cache/blob/master/src/save.ts
    console.log('Saving cache')
    try {
      await cache.saveCache(paths, key)
    } catch (error) {
      if (error.name === cache.ValidationError.name) {
        throw error;
      } else if (error.name === cache.ReserveCacheError.name) {
        core.info(error.message);
      } else {
        core.info(`[warning]${error.message}`)
      }
    }
  }

  return true
}

async function computeBaseKey(platform, engine, version, lockFile, cacheVersion) {
  const cacheVersionSuffix = DEFAULT_CACHE_VERSION === cacheVersion ? '' : `-cachever:${cacheVersion}`
  let key = `setup-ruby-bundler-cache-v3-${platform}-${engine}-${version}${cacheVersionSuffix}`

  if (common.isHeadVersion(version)) {
    if (engine !== 'jruby') {
      let print_abi = "print RbConfig::CONFIG['ruby_version']"
      let abi = ''
      await exec.exec('ruby', ['-e', print_abi], {
        silent: true,
        listeners: {
          stdout: (data) => {
            abi += data.toString();
          }
        }
      });
      key += `-ABI-${abi}`
    }
  }

  key += `-${lockFile}`
  return key
}


/***/ }),

/***/ 31:
/***/ ((__unused_webpack_module, __webpack_exports__, __nccwpck_require__) => {

"use strict";
__nccwpck_require__.r(__webpack_exports__);
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   "windows": () => (/* binding */ windows),
/* harmony export */   "drive": () => (/* binding */ drive),
/* harmony export */   "partition": () => (/* binding */ partition),
/* harmony export */   "measure": () => (/* binding */ measure),
/* harmony export */   "isHeadVersion": () => (/* binding */ isHeadVersion),
/* harmony export */   "isStableVersion": () => (/* binding */ isStableVersion),
/* harmony export */   "isBundler1Default": () => (/* binding */ isBundler1Default),
/* harmony export */   "isBundler2Default": () => (/* binding */ isBundler2Default),
/* harmony export */   "floatVersion": () => (/* binding */ floatVersion),
/* harmony export */   "hashFile": () => (/* binding */ hashFile),
/* harmony export */   "supportedPlatforms": () => (/* binding */ supportedPlatforms),
/* harmony export */   "getVirtualEnvironmentName": () => (/* binding */ getVirtualEnvironmentName),
/* harmony export */   "shouldUseToolCache": () => (/* binding */ shouldUseToolCache),
/* harmony export */   "getToolCacheRubyPrefix": () => (/* binding */ getToolCacheRubyPrefix),
/* harmony export */   "createToolCacheCompleteFile": () => (/* binding */ createToolCacheCompleteFile),
/* harmony export */   "win2nix": () => (/* binding */ win2nix),
/* harmony export */   "setupPath": () => (/* binding */ setupPath)
/* harmony export */ });
const os = __nccwpck_require__(37)
const path = __nccwpck_require__(17)
const fs = __nccwpck_require__(147)
const util = __nccwpck_require__(837)
const stream = __nccwpck_require__(781)
const crypto = __nccwpck_require__(113)
const core = __nccwpck_require__(122)
const { performance } = __nccwpck_require__(74)

const windows = (os.platform() === 'win32')
// Extract to SSD on Windows, see https://github.com/ruby/setup-ruby/pull/14
const drive = (windows ? (process.env['GITHUB_WORKSPACE'] || 'C')[0] : undefined)

function partition(string, separator) {
  const i = string.indexOf(separator)
  if (i === -1) {
    throw new Error(`No separator ${separator} in string ${string}`)
  }
  return [string.slice(0, i), string.slice(i + separator.length, string.length)]
}

let inGroup = false

async function measure(name, block) {
  const body = async () => {
    const start = performance.now()
    try {
      return await block()
    } finally {
      const end = performance.now()
      const duration = (end - start) / 1000.0
      console.log(`Took ${duration.toFixed(2).padStart(6)} seconds`)
    }
  }

  if (inGroup) {
    // Nested groups are not yet supported on GitHub Actions
    console.log(`> ${name}`)
    return await body()
  } else {
    inGroup = true
    try {
      return await core.group(name, body)
    } finally {
      inGroup = false
    }
  }
}

function isHeadVersion(rubyVersion) {
  return ['head', 'debug',  'mingw', 'mswin', 'ucrt'].includes(rubyVersion)
}

function isStableVersion(rubyVersion) {
  return /^\d+(\.\d+)*$/.test(rubyVersion)
}

function isBundler1Default(engine, rubyVersion) {
  return !isBundler2Default(engine, rubyVersion)
}

function isBundler2Default(engine, rubyVersion) {
  if (engine === 'ruby') {
    return floatVersion(rubyVersion) >= 2.7
  } else if (engine.startsWith('truffleruby')) {
    return floatVersion(rubyVersion) >= 21.0
  } else if (engine === 'jruby') {
    return floatVersion(rubyVersion) >= 9.3
  } else {
    return false
  }
}

function floatVersion(rubyVersion) {
  const match = rubyVersion.match(/^\d+\.\d+/)
  if (match) {
    return parseFloat(match[0])
  } else if (isHeadVersion(rubyVersion)) {
    return 999.999
  } else {
    throw new Error(`Could not convert version ${rubyVersion} to a float`)
  }
}

async function hashFile(file) {
  // See https://github.com/actions/runner/blob/master/src/Misc/expressionFunc/hashFiles/src/hashFiles.ts
  const hash = crypto.createHash('sha256')
  const pipeline = util.promisify(stream.pipeline)
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

function getImageOS() {
  const imageOS = process.env['ImageOS']
  if (!imageOS) {
    throw new Error('The environment variable ImageOS must be set')
  }
  return imageOS
}

const supportedPlatforms = [
  'ubuntu-18.04',
  'ubuntu-20.04',
  'ubuntu-22.04',
  'macos-10.15',
  'macos-11.0',
  'windows-2019',
  'windows-2022',
  'macos-12.0'
]

function getVirtualEnvironmentName() {
  const imageOS = getImageOS()

  let match = imageOS.match(/^ubuntu(\d+)/) // e.g. ubuntu18
  if (match) {
    return `ubuntu-${match[1]}.04`
  }

  match = imageOS.match(/^macos(\d{2})(\d+)?/) // e.g. macos1015, macos11
  if (match) {
    return `macos-${match[1]}.${match[2] || '0'}`
  }

  match = imageOS.match(/^win(\d+)/) // e.g. win19
  if (match) {
    return `windows-20${match[1]}`
  }

  throw new Error(`Unknown ImageOS ${imageOS}`)
}

function shouldUseToolCache(engine, version) {
  return engine === 'ruby' && !isHeadVersion(version)
}

function getPlatformToolCache(platform) {
  // Hardcode paths rather than using $RUNNER_TOOL_CACHE because the prebuilt Rubies cannot be moved anyway
  if (platform.startsWith('ubuntu-')) {
    return '/opt/hostedtoolcache'
  } else if (platform.startsWith('macos-')) {
    return '/Users/runner/hostedtoolcache'
  } else if (platform.startsWith('windows-')) {
    return 'C:/hostedtoolcache/windows'
  } else {
    throw new Error('Unknown platform')
  }
}

function getToolCacheRubyPrefix(platform, version) {
  const toolCache = getPlatformToolCache(platform)
  return path.join(toolCache, 'Ruby', version, 'x64')
}

function createToolCacheCompleteFile(toolCacheRubyPrefix) {
  const completeFile = `${toolCacheRubyPrefix}.complete`
  fs.writeFileSync(completeFile, '')
}

// convert windows path like C:\Users\runneradmin to /c/Users/runneradmin
function win2nix(path) {
  if (/^[A-Z]:/i.test(path)) {
    // path starts with drive
    path = `/${path[0].toLowerCase()}${partition(path, ':')[1]}`
  }
  return path.replace(/\\/g, '/').replace(/ /g, '\\ ')
}

// JRuby is installed after setupPath is called, so folder doesn't exist
function rubyIsUCRT(path) {
  return !!(fs.existsSync(path) &&
    fs.readdirSync(path, { withFileTypes: true }).find(dirent =>
      dirent.isFile() && dirent.name.match(/^x64-(ucrt|vcruntime\d{3})-ruby\d{3}\.dll$/)))
}

function setupPath(newPathEntries) {
  let msys2Type = null
  const envPath = windows ? 'Path' : 'PATH'
  const originalPath = process.env[envPath].split(path.delimiter)
  let cleanPath = originalPath.filter(entry => !/\bruby\b/i.test(entry))

  core.startGroup(`Modifying ${envPath}`)

  // First remove the conflicting path entries
  if (cleanPath.length !== originalPath.length) {
    console.log(`Entries removed from ${envPath} to avoid conflicts with default Ruby:`)
    for (const entry of originalPath) {
      if (!cleanPath.includes(entry)) {
        console.log(`  ${entry}`)
      }
    }
    core.exportVariable(envPath, cleanPath.join(path.delimiter))
  }

  // Then add new path entries using core.addPath()
  let newPath
  if (windows) {
    // main Ruby dll determines whether mingw or ucrt build
    msys2Type = rubyIsUCRT(newPathEntries[0]) ? 'ucrt64' : 'mingw64'

    // add MSYS2 in path for all Rubies on Windows, as it provides a better bash shell and a native toolchain
    const msys2 = [`C:\\msys64\\${msys2Type}\\bin`, 'C:\\msys64\\usr\\bin']
    newPath = [...newPathEntries, ...msys2]
  } else {
    newPath = newPathEntries
  }
  console.log(`Entries added to ${envPath} to use selected Ruby:`)
  for (const entry of newPath) {
    console.log(`  ${entry}`)
  }
  core.endGroup()

  core.addPath(newPath.join(path.delimiter))
  return msys2Type
}


/***/ }),

/***/ 799:
/***/ ((__unused_webpack_module, __webpack_exports__, __nccwpck_require__) => {

"use strict";
__nccwpck_require__.r(__webpack_exports__);
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   "getAvailableVersions": () => (/* binding */ getAvailableVersions),
/* harmony export */   "install": () => (/* binding */ install)
/* harmony export */ });
const os = __nccwpck_require__(37)
const fs = __nccwpck_require__(147)
const path = __nccwpck_require__(17)
const exec = __nccwpck_require__(659)
const io = __nccwpck_require__(682)
const tc = __nccwpck_require__(980)
const common = __nccwpck_require__(31)
const rubyBuilderVersions = __nccwpck_require__(959)

const builderReleaseTag = 'toolcache'
const releasesURL = 'https://github.com/ruby/ruby-builder/releases'

const windows = common.windows

function getAvailableVersions(platform, engine) {
  if (!common.supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform ${platform}`)
  }

  if (platform === 'ubuntu-22.04') {
    const rubyVersions = rubyBuilderVersions['ruby']
    return {
      ruby: rubyVersions.slice(rubyVersions.indexOf('3.1.0')),
    }[engine]
  }

  return rubyBuilderVersions[engine]
}

async function install(platform, engine, version) {
  let rubyPrefix, inToolCache
  if (common.shouldUseToolCache(engine, version)) {
    inToolCache = tc.find('Ruby', version)
    if (inToolCache) {
      rubyPrefix = inToolCache
    } else {
      rubyPrefix = common.getToolCacheRubyPrefix(platform, version)
    }
  } else if (windows) {
    rubyPrefix = path.join(`${common.drive}:`, `${engine}-${version}`)
  } else {
    rubyPrefix = path.join(os.homedir(), '.rubies', `${engine}-${version}`)
  }

  // Set the PATH now, so the MSYS2 'tar' is in Path on Windows
  common.setupPath([path.join(rubyPrefix, 'bin')])

  if (!inToolCache) {
    await preparePrefix(rubyPrefix)
    if (engine === 'truffleruby+graalvm') {
      await installWithRubyBuild(engine, version, rubyPrefix)
    } else {
      await downloadAndExtract(platform, engine, version, rubyPrefix)
    }
  }

  return rubyPrefix
}

async function preparePrefix(rubyPrefix) {
  const parentDir = path.dirname(rubyPrefix)

  await io.rmRF(rubyPrefix)
  if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
    await io.mkdirP(parentDir)
  }
}

async function installWithRubyBuild(engine, version, rubyPrefix) {
  const tmp = process.env['RUNNER_TEMP'] || os.tmpdir()
  const rubyBuildDir = path.join(tmp, 'ruby-build-for-setup-ruby')
  await common.measure('Cloning ruby-build', async () => {
    await exec.exec('git', ['clone', 'https://github.com/rbenv/ruby-build.git', rubyBuildDir])
  })

  const rubyName = `${engine}-${version === 'head' ? 'dev' : version}`
  await common.measure(`Installing ${engine}-${version} with ruby-build`, async () => {
    await exec.exec(`${rubyBuildDir}/bin/ruby-build`, [rubyName, rubyPrefix])
  })

  await io.rmRF(rubyBuildDir)
}

async function downloadAndExtract(platform, engine, version, rubyPrefix) {
  const parentDir = path.dirname(rubyPrefix)

  const downloadPath = await common.measure('Downloading Ruby', async () => {
    const url = getDownloadURL(platform, engine, version)
    console.log(url)
    return await tc.downloadTool(url)
  })

  await common.measure('Extracting  Ruby', async () => {
    if (windows) {
      // Windows 2016 doesn't have system tar, use MSYS2's, it needs unix style paths
      await exec.exec('tar', ['-xz', '-C', common.win2nix(parentDir), '-f', common.win2nix(downloadPath)])
    } else {
      await exec.exec('tar', ['-xz', '-C', parentDir, '-f', downloadPath])
    }
  })

  if (common.shouldUseToolCache(engine, version)) {
    common.createToolCacheCompleteFile(rubyPrefix)
  }
}

function getDownloadURL(platform, engine, version) {
  let builderPlatform = platform
  if (platform.startsWith('windows-')) {
    builderPlatform = 'windows-latest'
  } else if (platform.startsWith('macos-')) {
    builderPlatform = 'macos-latest'
  }

  if (common.isHeadVersion(version)) {
    return getLatestHeadBuildURL(builderPlatform, engine, version)
  } else {
    return `${releasesURL}/download/${builderReleaseTag}/${engine}-${version}-${builderPlatform}.tar.gz`
  }
}

function getLatestHeadBuildURL(platform, engine, version) {
  return `https://github.com/ruby/${engine}-dev-builder/releases/latest/download/${engine}-${version}-${platform}.tar.gz`
}


/***/ }),

/***/ 657:
/***/ ((__unused_webpack_module, __webpack_exports__, __nccwpck_require__) => {

"use strict";
__nccwpck_require__.r(__webpack_exports__);
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   "rubygemsUpdate": () => (/* binding */ rubygemsUpdate)
/* harmony export */ });
const path = __nccwpck_require__(17)
const exec = __nccwpck_require__(659)
const semver = __nccwpck_require__(914)

async function rubygemsUpdate(rubygemsVersionInput, rubyPrefix) {
  const gem = path.join(rubyPrefix, 'bin', 'gem')

  let gemVersion = ''

  await exec.exec(gem, ['--version'], {
    listeners: {
      stdout: (data) => (gemVersion += data.toString()),
    }
  });

  gemVersion = semver.coerce(gemVersion.trim())
  console.log(`Default RubyGems version is ${gemVersion}`)

  if (rubygemsVersionInput === 'latest') {
    console.log('Updating RubyGems to latest version')
    await exec.exec(gem, ['update', '--system'])
  } else if (semver.gt(rubygemsVersionInput, gemVersion)) {
    console.log(`Updating RubyGems to ${rubygemsVersionInput}`)
    await exec.exec(gem, ['update', '--system', rubygemsVersionInput])
  } else {
    console.log(`Skipping RubyGems update because the given version (${rubygemsVersionInput}) is not newer than the default version (${gemVersion})`)
  }

  return true
}


/***/ }),

/***/ 364:
/***/ ((__unused_webpack_module, __webpack_exports__, __nccwpck_require__) => {

"use strict";
__nccwpck_require__.r(__webpack_exports__);
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   "getAvailableVersions": () => (/* binding */ getAvailableVersions),
/* harmony export */   "install": () => (/* binding */ install),
/* harmony export */   "installJRubyTools": () => (/* binding */ installJRubyTools),
/* harmony export */   "addVCVARSEnv": () => (/* binding */ addVCVARSEnv)
/* harmony export */ });
// Most of this logic is from
// https://github.com/MSP-Greg/actions-ruby/blob/master/lib/main.js

const fs = __nccwpck_require__(147)
const path = __nccwpck_require__(17)
const cp = __nccwpck_require__(81)
const core = __nccwpck_require__(122)
const exec = __nccwpck_require__(659)
const io = __nccwpck_require__(682)
const tc = __nccwpck_require__(980)
const common = __nccwpck_require__(31)
const rubyInstallerVersions = __nccwpck_require__(459)

const drive = common.drive

const msys2BasePath = 'C:\\msys64'

// needed for 2.0-2.3, and mswin, cert file used by Git for Windows
const certFile = 'C:\\Program Files\\Git\\mingw64\\ssl\\cert.pem'

// location & path for old RubyInstaller DevKit (MSYS1), Ruby 2.0-2.3
const msys1 = `${drive}:\\DevKit64`
const msysPathEntries = [`${msys1}\\mingw\\x86_64-w64-mingw32\\bin`, `${msys1}\\mingw\\bin`, `${msys1}\\bin`]

const virtualEnv = common.getVirtualEnvironmentName()

function getAvailableVersions(platform, engine) {
  if (!common.supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform ${platform}`)
  }

  if (engine === 'ruby') {
    return Object.keys(rubyInstallerVersions)
  } else {
    return undefined
  }
}

async function install(platform, engine, version) {
  const url = rubyInstallerVersions[version]

  // The windows-2016 and windows-2019 images have MSYS2 build tools (C:/msys64/usr)
  // and MinGW build tools installed.  The windows-2022 image has neither.
  const hasMSYS2PreInstalled = ['windows-2019', 'windows-2016'].includes(virtualEnv)

  if (!url.endsWith('.7z')) {
    throw new Error(`URL should end in .7z: ${url}`)
  }
  const base = url.slice(url.lastIndexOf('/') + 1, url.length - '.7z'.length)

  let rubyPrefix, inToolCache
  if (common.shouldUseToolCache(engine, version)) {
    inToolCache = tc.find('Ruby', version)
    if (inToolCache) {
      rubyPrefix = inToolCache
    } else {
      rubyPrefix = common.getToolCacheRubyPrefix(platform, version)
    }
  } else {
    rubyPrefix = `${drive}:\\${base}`
  }

  let toolchainPaths = (version === 'mswin') ? await setupMSWin() : await setupMingw(version)

  if (!inToolCache) {
    await downloadAndExtract(engine, version, url, base, rubyPrefix);
  }

  const msys2Type = common.setupPath([`${rubyPrefix}\\bin`, ...toolchainPaths])

  // install msys2 tools for all Ruby versions, only install mingw or ucrt for Rubies >= 2.4

  if (!hasMSYS2PreInstalled) {
    await installMSYS2Tools()
  }

  // windows 2016 and 2019 need ucrt64 installed, 2022 and future images need
  // ucrt64 or mingw64 installed, depending on Ruby version
  if (((msys2Type === 'ucrt64') || !hasMSYS2PreInstalled) && common.floatVersion(version) >= 2.4) {
    await installGCCTools(msys2Type)
  }

  const ridk = `${rubyPrefix}\\bin\\ridk.cmd`
  if (fs.existsSync(ridk)) {
    await common.measure('Adding ridk env variables', async () => addRidkEnv(ridk))
  }

  return rubyPrefix
}

// Actions windows-2022 image does not contain any mingw or ucrt build tools.  Install tools for it,
// and also install ucrt tools on earlier versions, which have msys2 and mingw tools preinstalled.
async function installGCCTools(type) {
  const downloadPath = await common.measure(`Downloading ${type} build tools`, async () => {
    let url = `https://github.com/MSP-Greg/setup-msys2-gcc/releases/download/msys2-gcc-pkgs/${type}.7z`
    console.log(url)
    return await tc.downloadTool(url)
  })

  await common.measure(`Extracting  ${type} build tools`, async () =>
    // -aoa overwrite existing, -bd disable progress indicator
    exec.exec('7z', ['x', downloadPath, '-aoa', '-bd', `-o${msys2BasePath}`], { silent: true }))
}

// Actions windows-2022 image does not contain any MSYS2 build tools.  Install tools for it.
// A subset of the MSYS2 base-devel group
async function installMSYS2Tools() {
  const downloadPath = await common.measure(`Downloading msys2 build tools`, async () => {
    let url = `https://github.com/MSP-Greg/setup-msys2-gcc/releases/download/msys2-gcc-pkgs/msys2.7z`
    console.log(url)
    return await tc.downloadTool(url)
  })

  // need to remove all directories, since they may indicate old packages are installed,
  // otherwise, error of "error: duplicated database entry"
  fs.rmdirSync(`${msys2BasePath}\\var\\lib\\pacman\\local`, { recursive: true, force: true })

  await common.measure(`Extracting  msys2 build tools`, async () =>
    // -aoa overwrite existing, -bd disable progress indicator
    exec.exec('7z', ['x', downloadPath, '-aoa', '-bd', `-o${msys2BasePath}`], { silent: true }))
}

// Windows JRuby can install gems that require compile tools, only needed for
// windows-2022 and later images
async function installJRubyTools() {
  await installMSYS2Tools()
  await installGCCTools('mingw64')
}

async function downloadAndExtract(engine, version, url, base, rubyPrefix) {
  const parentDir = path.dirname(rubyPrefix)

  const downloadPath = await common.measure('Downloading Ruby', async () => {
    console.log(url)
    return await tc.downloadTool(url)
  })

  await common.measure('Extracting  Ruby', async () =>
    // -bd disable progress indicator, -xr extract but exclude share\doc files
    exec.exec('7z', ['x', downloadPath, '-bd', `-xr!${base}\\share\\doc`, `-o${parentDir}`], { silent: true }))

  if (base !== path.basename(rubyPrefix)) {
    await io.mv(path.join(parentDir, base), rubyPrefix)
  }

  if (common.shouldUseToolCache(engine, version)) {
    common.createToolCacheCompleteFile(rubyPrefix)
  }
}

async function setupMingw(version) {
  core.exportVariable('MAKE', 'make.exe')

  // rename these to avoid confusion when Ruby is using OpenSSL 1.0.2.
  // most current extconf files look for 1.1.x dll files first, which is the version of the renamed files
  if (common.floatVersion(version) <= 2.4) {
    renameSystem32Dlls()
  }

  if (common.floatVersion(version) <= 2.3) {
    core.exportVariable('SSL_CERT_FILE', certFile)
    await common.measure('Installing MSYS1', async () => installMSYS1(version))
    return msysPathEntries
  } else {
    return []
  }
}

// Ruby 2.0-2.3
async function installMSYS1(version) {
  const url = 'https://github.com/oneclick/rubyinstaller/releases/download/devkit-4.7.2/DevKit-mingw64-64-4.7.2-20130224-1432-sfx.exe'
  const downloadPath = await tc.downloadTool(url)
  await exec.exec('7z', ['x', downloadPath, `-o${msys1}`], { silent: true })

  // below are set in the old devkit.rb file ?
  core.exportVariable('RI_DEVKIT', msys1)
  core.exportVariable('CC' , 'gcc')
  core.exportVariable('CXX', 'g++')
  core.exportVariable('CPP', 'cpp')
  core.info(`Installed RubyInstaller DevKit for Ruby ${version}`)
}

async function setupMSWin() {
  core.exportVariable('MAKE', 'nmake.exe')

  // All standard MSVC OpenSSL builds use C:\Program Files\Common Files\SSL
  const certsDir = 'C:\\Program Files\\Common Files\\SSL\\certs'
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir)
  }

  // cert.pem location is hard-coded by OpenSSL msvc builds
  const cert = 'C:\\Program Files\\Common Files\\SSL\\cert.pem'
  if (!fs.existsSync(cert)) {
    fs.copyFileSync(certFile, cert)
  }

  return await common.measure('Setting up MSVC environment', async () => addVCVARSEnv())
}

/* Sets MSVC environment for use in Actions
 *   allows steps to run without running vcvars*.bat, also for PowerShell
 *   adds a convenience VCVARS environment variable
 *   this assumes a single Visual Studio version being available in the Windows images */
function addVCVARSEnv() {
  let cmd = 'vswhere -latest -property installationPath'
  let vcVars = `${cp.execSync(cmd).toString().trim()}\\VC\\Auxiliary\\Build\\vcvars64.bat`

  if (!fs.existsSync(vcVars)) {
    throw new Error(`Missing vcVars file: ${vcVars}`)
  }
  core.exportVariable('VCVARS', vcVars)

  cmd = `cmd.exe /c ""${vcVars}" && set"`

  let newEnv = new Map()
  let newSet = cp.execSync(cmd).toString().trim().split(/\r?\n/)
  newSet = newSet.filter(line => /\S=\S/.test(line))
  newSet.forEach(s => {
    let [k,v] = common.partition(s, '=')
    newEnv.set(k,v)
  })

  let newPathEntries = undefined
  for (let [k, v] of newEnv) {
    if (process.env[k] !== v) {
      if (/^Path$/i.test(k)) {
        const newPathStr = v.replace(`${path.delimiter}${process.env['Path']}`, '')
        newPathEntries = newPathStr.split(path.delimiter)
      } else {
        core.exportVariable(k, v)
      }
    }
  }
  return newPathEntries
}

// ssl files cause issues with non RI2 Rubies (<2.4) and ruby/ruby's CI from build folder due to dll resolution
function renameSystem32Dlls() {
  const sys32 = 'C:\\Windows\\System32\\'
  const badFiles = [`${sys32}libcrypto-1_1-x64.dll`, `${sys32}libssl-1_1-x64.dll`]
  const existing = badFiles.filter((dll) => fs.existsSync(dll))
  if (existing.length > 0) {
    console.log(`Renaming ${existing.join(' and ')} to avoid dll resolution conflicts on Ruby <= 2.4`)
    existing.forEach(dll => fs.renameSync(dll, `${dll}_`))
  }
}

// Sets MSYS2 ENV variables set from running `ridk enable`
function addRidkEnv(ridk) {
  let newEnv = new Map()
  let cmd = `cmd.exe /c "${ridk} enable && set"`
  let newSet = cp.execSync(cmd).toString().trim().split(/\r?\n/)
  newSet = newSet.filter(line => /^\S+=\S+/.test(line))
  newSet.forEach(s => {
    let [k, v] = common.partition(s, '=')
    newEnv.set(k, v)
  })

  for (let [k, v] of newEnv) {
    if (process.env[k] !== v) {
      if (!/^Path$/i.test(k)) {
        console.log(`${k}=${v}`)
        core.exportVariable(k, v)
      }
    }
  }
}


/***/ }),

/***/ 314:
/***/ ((module) => {

module.exports = eval("require")("@actions/cache");


/***/ }),

/***/ 122:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 659:
/***/ ((module) => {

module.exports = eval("require")("@actions/exec");


/***/ }),

/***/ 682:
/***/ ((module) => {

module.exports = eval("require")("@actions/io");


/***/ }),

/***/ 980:
/***/ ((module) => {

module.exports = eval("require")("@actions/tool-cache");


/***/ }),

/***/ 914:
/***/ ((module) => {

module.exports = eval("require")("semver");


/***/ }),

/***/ 81:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 113:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 37:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 74:
/***/ ((module) => {

"use strict";
module.exports = require("perf_hooks");

/***/ }),

/***/ 781:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ 837:
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ 959:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"ruby":["1.9.3-p551","2.0.0-p648","2.1.9","2.2.10","2.3.0","2.3.1","2.3.2","2.3.3","2.3.4","2.3.5","2.3.6","2.3.7","2.3.8","2.4.0","2.4.1","2.4.2","2.4.3","2.4.4","2.4.5","2.4.6","2.4.7","2.4.9","2.4.10","2.5.0","2.5.1","2.5.2","2.5.3","2.5.4","2.5.5","2.5.6","2.5.7","2.5.8","2.5.9","2.6.0","2.6.1","2.6.2","2.6.3","2.6.4","2.6.5","2.6.6","2.6.7","2.6.8","2.6.9","2.6.10","2.7.0","2.7.1","2.7.2","2.7.3","2.7.4","2.7.5","2.7.6","3.0.0-preview1","3.0.0-preview2","3.0.0-rc1","3.0.0","3.0.1","3.0.2","3.0.3","3.0.4","3.1.0-preview1","3.1.0","3.1.1","3.1.2","3.2.0-preview1","head","debug"],"jruby":["9.1.17.0","9.2.9.0","9.2.10.0","9.2.11.0","9.2.11.1","9.2.12.0","9.2.13.0","9.2.14.0","9.2.15.0","9.2.16.0","9.2.17.0","9.2.18.0","9.2.19.0","9.2.20.0","9.2.20.1","9.3.0.0","9.3.1.0","9.3.2.0","9.3.3.0","9.3.4.0","head"],"truffleruby":["19.3.0","19.3.1","20.0.0","20.1.0","20.2.0","20.3.0","21.0.0","21.1.0","21.2.0","21.2.0.1","21.3.0","22.0.0.2","22.1.0","head"],"truffleruby+graalvm":["21.2.0","21.3.0","22.0.0.2","22.1.0","head"]}');

/***/ }),

/***/ 459:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"2.0.0":"https://github.com/oneclick/rubyinstaller/releases/download/ruby-2.0.0-p648/ruby-2.0.0-p648-x64-mingw32.7z","2.1.9":"https://github.com/oneclick/rubyinstaller/releases/download/ruby-2.1.9/ruby-2.1.9-x64-mingw32.7z","2.2.6":"https://github.com/oneclick/rubyinstaller/releases/download/ruby-2.2.6/ruby-2.2.6-x64-mingw32.7z","2.3.0":"https://github.com/oneclick/rubyinstaller/releases/download/ruby-2.3.0/ruby-2.3.0-x64-mingw32.7z","2.3.1":"https://github.com/oneclick/rubyinstaller/releases/download/ruby-2.3.1/ruby-2.3.1-x64-mingw32.7z","2.3.3":"https://github.com/oneclick/rubyinstaller/releases/download/ruby-2.3.3/ruby-2.3.3-x64-mingw32.7z","2.4.1":"https://github.com/oneclick/rubyinstaller2/releases/download/2.4.1-2/rubyinstaller-2.4.1-2-x64.7z","2.4.2":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.4.2-2/rubyinstaller-2.4.2-2-x64.7z","2.4.3":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.4.3-2/rubyinstaller-2.4.3-2-x64.7z","2.4.4":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.4.4-2/rubyinstaller-2.4.4-2-x64.7z","2.4.5":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.4.5-1/rubyinstaller-2.4.5-1-x64.7z","2.4.6":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.4.6-1/rubyinstaller-2.4.6-1-x64.7z","2.4.7":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.4.7-1/rubyinstaller-2.4.7-1-x64.7z","2.4.9":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.4.9-1/rubyinstaller-2.4.9-1-x64.7z","2.4.10":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.4.10-1/rubyinstaller-2.4.10-1-x64.7z","2.5.0":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.5.0-2/rubyinstaller-2.5.0-2-x64.7z","2.5.1":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.5.1-2/rubyinstaller-2.5.1-2-x64.7z","2.5.3":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-2.5.3-1/rubyinstaller-2.5.3-1-x64.7z","2.5.5":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.5.5-1/rubyinstaller-2.5.5-1-x64.7z","2.5.6":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.5.6-1/rubyinstaller-2.5.6-1-x64.7z","2.5.7":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.5.7-1/rubyinstaller-2.5.7-1-x64.7z","2.5.8":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.5.8-2/rubyinstaller-2.5.8-2-x64.7z","2.5.9":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.5.9-1/rubyinstaller-2.5.9-1-x64.7z","2.6.0":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.0-1/rubyinstaller-2.6.0-1-x64.7z","2.6.1":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.1-1/rubyinstaller-2.6.1-1-x64.7z","2.6.2":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.2-1/rubyinstaller-2.6.2-1-x64.7z","2.6.3":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.3-1/rubyinstaller-2.6.3-1-x64.7z","2.6.4":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.4-1/rubyinstaller-2.6.4-1-x64.7z","2.6.5":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.5-1/rubyinstaller-2.6.5-1-x64.7z","2.6.6":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.6-2/rubyinstaller-2.6.6-2-x64.7z","2.6.7":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.7-1/rubyinstaller-2.6.7-1-x64.7z","2.6.8":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.8-1/rubyinstaller-2.6.8-1-x64.7z","2.6.9":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.9-1/rubyinstaller-2.6.9-1-x64.7z","2.6.10":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.6.10-1/rubyinstaller-2.6.10-1-x64.7z","2.7.0":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.0-1/rubyinstaller-2.7.0-1-x64.7z","2.7.1":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.1-1/rubyinstaller-2.7.1-1-x64.7z","2.7.2":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.2-1/rubyinstaller-2.7.2-1-x64.7z","2.7.3":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.3-1/rubyinstaller-2.7.3-1-x64.7z","2.7.4":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.4-1/rubyinstaller-2.7.4-1-x64.7z","2.7.5":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.5-1/rubyinstaller-2.7.5-1-x64.7z","2.7.6":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-2.7.6-1/rubyinstaller-2.7.6-1-x64.7z","3.0.0":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.0.0-1/rubyinstaller-3.0.0-1-x64.7z","3.0.1":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.0.1-1/rubyinstaller-3.0.1-1-x64.7z","3.0.2":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.0.2-1/rubyinstaller-3.0.2-1-x64.7z","3.0.3":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.0.3-1/rubyinstaller-3.0.3-1-x64.7z","3.0.4":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.0.4-1/rubyinstaller-3.0.4-1-x64.7z","3.1.0":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.1.0-1/rubyinstaller-3.1.0-1-x64.7z","3.1.1":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.1.1-1/rubyinstaller-3.1.1-1-x64.7z","3.1.2":"https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.1.2-1/rubyinstaller-3.1.2-1-x64.7z","head":"https://github.com/oneclick/rubyinstaller2/releases/download/rubyinstaller-head/rubyinstaller-head-x64.7z","mingw":"https://github.com/MSP-Greg/ruby-loco/releases/download/ruby-master/ruby-mingw.7z","mswin":"https://github.com/MSP-Greg/ruby-loco/releases/download/ruby-master/ruby-mswin.7z","ucrt":"https://github.com/MSP-Greg/ruby-loco/releases/download/ruby-master/ruby-ucrt.7z"}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nccwpck_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
__nccwpck_require__.r(__webpack_exports__);
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   "run": () => (/* binding */ run),
/* harmony export */   "setupRuby": () => (/* binding */ setupRuby)
/* harmony export */ });
const os = __nccwpck_require__(37)
const fs = __nccwpck_require__(147)
const path = __nccwpck_require__(17)
const core = __nccwpck_require__(122)
const exec = __nccwpck_require__(659)
const common = __nccwpck_require__(31)
const rubygems = __nccwpck_require__(657)
const bundler = __nccwpck_require__(50)

const windows = common.windows

const inputDefaults = {
  'ruby-version': 'default',
  'rubygems': 'default',
  'bundler': 'default',
  'bundler-cache': 'false',
  'working-directory': '.',
  'cache-version': bundler.DEFAULT_CACHE_VERSION,
}

// entry point when this action is run on its own
async function run() {
  try {
    await setupRuby()
  } catch (error) {
    core.setFailed(error.stack)
  }
}

// entry point when this action is run from other actions
async function setupRuby(options = {}) {
  const inputs = { ...options }
  for (const key in inputDefaults) {
    if (!Object.prototype.hasOwnProperty.call(inputs, key)) {
      inputs[key] = core.getInput(key) || inputDefaults[key]
    }
  }

  process.chdir(inputs['working-directory'])

  const platform = common.getVirtualEnvironmentName()
  const [engine, parsedVersion] = parseRubyEngineAndVersion(inputs['ruby-version'])

  let installer
  if (platform.startsWith('windows-') && engine === 'ruby') {
    installer = __nccwpck_require__(364)
  } else {
    installer = __nccwpck_require__(799)
  }

  const engineVersions = installer.getAvailableVersions(platform, engine)
  const version = validateRubyEngineAndVersion(platform, engineVersions, engine, parsedVersion)

  createGemRC(engine, version)
  envPreInstall()

  // JRuby can use compiled extension code, so make sure gcc exists.
  // As of Jan-2022, JRuby compiles against msvcrt.
  if (platform.startsWith('windows') && (engine === 'jruby') && 
    !fs.existsSync('C:\\msys64\\mingw64\\bin\\gcc.exe')) {
    await (__nccwpck_require__(364).installJRubyTools)()
  }

  const rubyPrefix = await installer.install(platform, engine, version)

  await common.measure('Print Ruby version', async () =>
    await exec.exec('ruby', ['--version']))

  const rubygemsInputSet = inputs['rubygems'] !== 'default'
  if (rubygemsInputSet) {
    await common.measure('Updating RubyGems', async () =>
      rubygems.rubygemsUpdate(inputs['rubygems'], rubyPrefix))
  }

  // When setup-ruby is used by other actions, this allows code in them to run
  // before 'bundle install'.  Installed dependencies may require additional
  // libraries & headers, build tools, etc.
  if (inputs['afterSetupPathHook'] instanceof Function) {
    await inputs['afterSetupPathHook']({ platform, rubyPrefix, engine, version })
  }

  const [gemfile, lockFile] = bundler.detectGemfiles()
  let bundlerVersion = 'unknown'

  if (inputs['bundler'] !== 'none') {
    bundlerVersion = await common.measure('Installing Bundler', async () =>
      bundler.installBundler(inputs['bundler'], rubygemsInputSet, lockFile, platform, rubyPrefix, engine, version))
  }

  if (inputs['bundler-cache'] === 'true') {
    await common.measure('bundle install', async () =>
      bundler.bundleInstall(gemfile, lockFile, platform, engine, version, bundlerVersion, inputs['cache-version']))
  }

  core.setOutput('ruby-prefix', rubyPrefix)
}

function parseRubyEngineAndVersion(rubyVersion) {
  if (rubyVersion === 'default') {
    if (fs.existsSync('.ruby-version')) {
      rubyVersion = '.ruby-version'
    } else if (fs.existsSync('.tool-versions')) {
      rubyVersion = '.tool-versions'
    } else {
      throw new Error('input ruby-version needs to be specified if no .ruby-version or .tool-versions file exists')
    }
  }

  if (rubyVersion === '.ruby-version') { // Read from .ruby-version
    rubyVersion = fs.readFileSync('.ruby-version', 'utf8').trim()
    console.log(`Using ${rubyVersion} as input from file .ruby-version`)
  } else if (rubyVersion === '.tool-versions') { // Read from .tool-versions
    const toolVersions = fs.readFileSync('.tool-versions', 'utf8').trim()
    const rubyLine = toolVersions.split(/\r?\n/).filter(e => /^ruby\s/.test(e))[0]
    rubyVersion = rubyLine.match(/^ruby\s+(.+)$/)[1]
    console.log(`Using ${rubyVersion} as input from file .tool-versions`)
  }

  let engine, version
  if (/^(\d+)/.test(rubyVersion) || common.isHeadVersion(rubyVersion)) { // X.Y.Z => ruby-X.Y.Z
    engine = 'ruby'
    version = rubyVersion
  } else if (!rubyVersion.includes('-')) { // myruby -> myruby-stableVersion
    engine = rubyVersion
    version = '' // Let the logic in validateRubyEngineAndVersion() find the version
  } else { // engine-X.Y.Z
    [engine, version] = common.partition(rubyVersion, '-')
  }

  return [engine, version]
}

function validateRubyEngineAndVersion(platform, engineVersions, engine, parsedVersion) {
  if (!engineVersions) {
    throw new Error(`Unknown engine ${engine} on ${platform}`)
  }

  let version = parsedVersion
  if (!engineVersions.includes(parsedVersion)) {
    const latestToFirstVersion = engineVersions.slice().reverse()
    // Try to match stable versions first, so an empty version (engine-only) matches the latest stable version
    let found = latestToFirstVersion.find(v => common.isStableVersion(v) && v.startsWith(parsedVersion))
    if (!found) {
      // Exclude head versions, they must be exact matches
      found = latestToFirstVersion.find(v => !common.isHeadVersion(v) && v.startsWith(parsedVersion))
    }

    if (found) {
      version = found
    } else {
      throw new Error(`Unknown version ${parsedVersion} for ${engine} on ${platform}
        available versions for ${engine} on ${platform}: ${engineVersions.join(', ')}
        Make sure you use the latest version of the action with - uses: ruby/setup-ruby@v1
        File an issue at https://github.com/ruby/setup-ruby/issues if you would like support for a new version`)
    }
  }

  return version
}

function createGemRC(engine, version) {
  const gemrc = path.join(os.homedir(), '.gemrc')
  if (!fs.existsSync(gemrc)) {
    if (engine === 'ruby' && common.floatVersion(version) < 2.0) {
      fs.writeFileSync(gemrc, `install: --no-rdoc --no-ri${os.EOL}update: --no-rdoc --no-ri${os.EOL}`)
    } else {
      fs.writeFileSync(gemrc, `gem: --no-document${os.EOL}`)
    }
  }
}

// sets up ENV variables
// currently only used on Windows runners
function envPreInstall() {
  const ENV = process.env
  if (windows) {
    // puts normal Ruby temp folder on SSD
    core.exportVariable('TMPDIR', ENV['RUNNER_TEMP'])
    // bash - sets home to match native windows, normally C:\Users\<user name>
    core.exportVariable('HOME', ENV['HOMEDRIVE'] + ENV['HOMEPATH'])
    // bash - needed to maintain Path from Windows
    core.exportVariable('MSYS2_PATH_TYPE', 'inherit')
  }
}

if (__filename.endsWith('index.js')) { run() }

})();

module.exports = __webpack_exports__;
/******/ })()
;