/**
 * Build it and run it in the simulator, without opening Xcode.
 *
 *   npm run sim              the iPhone 17 Pro
 *   npm run sim -- "iPhone Air"
 *
 * For a real phone it is `npm run app`, which opens Xcode — a device needs a
 * signature and a signature needs an account, and neither of those is something
 * a script should be picking on your behalf.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const device = process.argv[2] || "iPhone 17 Pro";
const build = "/private/tmp/rayl-ios";
const app = `${build}/Build/Products/Debug-iphonesimulator/App.app`;

const run = (command, args, options = {}) => {
  const done = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (done.status !== 0) process.exit(done.status ?? 1);
};

run("npm", ["run", "build"]);
run("npx", ["cap", "sync", "ios"]);
run(
  "xcodebuild",
  [
    "-project",
    "ios/App/App.xcodeproj",
    "-scheme",
    "App",
    "-sdk",
    "iphonesimulator",
    "-configuration",
    "Debug",
    "-destination",
    `platform=iOS Simulator,name=${device}`,
    "-derivedDataPath",
    build,
    "CODE_SIGNING_ALLOWED=NO",
    "build",
  ],
  { stdio: "ignore" },
);

spawnSync("xcrun", ["simctl", "boot", device], { stdio: "ignore" });
spawnSync("open", ["-a", "Simulator"], { stdio: "ignore" });
run("xcrun", ["simctl", "install", device, app]);
spawnSync("xcrun", ["simctl", "terminate", device, "be.aboutcontact.rayl"], {
  stdio: "ignore",
});
run("xcrun", ["simctl", "launch", device, "be.aboutcontact.rayl"]);
console.log(`\nRunning on the ${device} simulator.`);
