export enum HandshakeStatus {
    Done = "done",
    Notified = "notified",
    Received = "received",
    Refused = "refused",
    Sent = "sent"
}

export enum Action {
    BandwidthData = "bandwidth-data",
    Cache = "cache",
    Cached = "cached",
    Clear = "clear",
    Cleared = "cleared",
    Handshake = "handhshake",
    Metadata = "metadata",
    Requested = "requested",
    Response = "response",
    Seed = "seed",
    Seeding = "seeding",
    SignedRequest = "signed-request",
    StorageData = "storage-data",
    Uploaded = "uploaded",
    Downloaded = "downloaded",
    Warning = "warning",
    WorkOrder = "work-order",
    Statistics = "statistics"
}

export type ProtocolEventsTypes =
    | BandwidthData
    | Cache
    | Cached
    | Clear
    | Cleared
    | Handshake
    | Requested
    | Response
    | Seed
    | Seeding
    | SignedRequest
    | StorageData
    | Uploaded
    | Downloaded
    | Warning
    | WorkOrder
    | Statistics;

export interface ProtocolEvent<TType extends ProtocolEventsTypes> {
    action: Action;
    timestamp: number;
    data: TType;
}

export interface Uploaded {
    infoHash: string;
    ip: string;
    uploaded: number;
}

export interface Downloaded {
    infoHash: string;
    ip: string;
    downloaded: number;
}

export interface StorageData {
    total: number;
    used: number;
    available: number;
}

export interface BandwidthData {
    speeds: {
        download: number;
        upload: number;
        originalDownload: number;
        originalUpload: number;
    };
    client: {
        ip: string;
        lat: number;
        lon: number;
        isp: string;
        isprating: number;
        rating: number;
        ispdlavg: number;
        ispulavg: number;
        country: string;
    };
    server: {
        host: string;
        lat: number;
        lon: number;
        location: string;
        country: string;
        cc: string;
        sponsor: string;
        distance: number;
        distanceMi: number;
        ping: number;
        id: string;
    };
}

export interface SignedRequest {
    beneficiary?: string;
    signedRequest?: {
        nonce: number;
        sig: string;
    };
    workOrderAddress: string;
    /**
     * Set true during 'release' stage if NOIA node is willing to get more work to do from master (avoids NOIA node reconnect).
     */
    extendWorkOrder?: boolean;
    type: "accept" | "accepted" | "release" | "released";
    /**
     * Both parties should check if error has occured while handling signed request.
     */
    error?: string;
}

export interface Cached {
    size: number;
    source: { url: string };
}

export interface Cleared {
    infoHashes: string[];
}

export interface Clear {
    infoHashes: string[];
}

export interface Warning {
    message: string;
}

export interface Cache {
    source: {
        url: string;
    };
}

export interface WorkOrder {
    address: string;
}

export interface Statistics {
    /**
     * Online time object.
     */
    time: {
        /**
         * Total in seconds.
         */
        total: number;
        seconds: number;
        minutes: number;
        hours: number;
        days: number;
    };
    /**
     * Bytes node has uploaded.
     */
    uploaded: number;
    /**
     * Bytes node has downloaded.
     */
    downloaded: number;
}

export interface Seed {
    metadata: {
        infoHash: string;
        pieces: number;
    };
}

export interface HandshakeFailed {
    reason: string;
}

export type ClientMetadata = NodeMetadata | MasterMetadata | NodeBlockchainMetadata | MasterBlockchainMetadata;

export enum ConnectionType {
    Ws = "ws",
    Wss = "wss",
    WebRtc = "webrtc"
}

export interface NodeMetadata {
    /**
     * NOIA Node id.
     */
    nodeId: string;
    /**
     * Flag if using CLI or GUI NOIA node.
     */
    interface: "cli" | "gui" | "unspecified";
    /**
     * NOIA Node supported connections.
     */
    connections: {
        ws: number | null;
        wss: number | null;
        webrtc: number | null;
    };
    /**
     * NOIA client external IP address domain. Is required for WSS connection.
     */
    domain?: string;
    /**
     * Node client version.
     */
    version: string;
    /**
     * NOIA node airdrop address.
     */
    airdropAddress: string | null;
}

export interface MasterMetadata {
    /**
     * Node external IP address.
     */
    externalIp: string;
}

export interface NodeBlockchainMetadata extends NodeMetadata {
    /**
     * Job post address.
     */
    jobPostAddress: string;
    /**
     * Work order address.
     */
    workOrderAddress: string | null;
    /**
     * Message to send to signature checking function.
     */
    msg: string;
    /**
     * Signed message to send to signature checking function.
     */
    msgSigned: string;
    /**
     * NOIA node wallet address.
     */
    walletAddress: string;
}

export interface MasterBlockchainMetadata extends MasterMetadata {
    msg: string;
    /**
     * Signed message to send to signature checking function.
     */
    msgSigned: string;
}

export interface Seeding {
    infoHashes: string[];
}

export interface Handshake {
    status: HandshakeStatus;
    metadata: ClientMetadata;
}

export interface ClosedData {
    wasClean: boolean;
    code: number;
    reason: string;
}

export interface Requested {
    piece: number;
    infoHash: string;
}

export interface Response {
    data: string;
}

export interface WebSocketError {
    error: Error;
    message: string;
    type: string;
}
