export class ProtocolMetadataError extends Error {
    constructor(metadataName: string) {
        super(`Protocol metadata ${metadataName} is invalid (forgot handshake or not ready state).`);
    }
}
