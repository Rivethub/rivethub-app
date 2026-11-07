import { registerRootComponent } from "expo";
import { App } from "./App";
import { installRuntimePolyfills } from "./src/polyfill";

installRuntimePolyfills();
registerRootComponent(App);
