export class NotReadyError extends Error {
    constructor() {
        super("Connection is not ready. Forgot handshake?");
    }
}
