import * as debug from "debug";
const log: debug.IDebugger = debug("noia-protocol:helpers");

export namespace Helpers {
    export function parseJSON(json: string): object {
        try {
            return JSON.parse(json);
        } catch (e) {
            log(e);
        }
        return {};
    }

    export function noop(): void {
        return;
    }
}
