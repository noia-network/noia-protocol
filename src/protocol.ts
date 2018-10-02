import * as EventEmitter from "events";
import StrictEventEmitter from "strict-event-emitter-types";
import * as WebSocket from "ws";
import * as debug from "debug";
const log: debug.IDebugger = debug("noia-protocol:protocol");

import { Helpers } from "./helpers";
import {
    Action,
    ClosedData,
    ProtocolEvent,
    Uploaded,
    SignedRequest,
    Cleared,
    Clear,
    Cached,
    Cache,
    Seed,
    Seeding,
    Warning,
    WorkOrder,
    Requested,
    Handshake,
    Response,
    HandshakeFailed,
    HandshakeStatus,
    ProtocolEventsTypes,
    ClientMetadata,
    BandwidthData,
    StorageData
} from "./contracts";
import { NotReadyError } from "./not-ready-error";
import { ProtocolMetadataError } from "./errors";

enum ReadyState {
    /**
     * The connection is not yet open.
     */
    Connecting = 0,
    /**
     * The connection is open and ready to communicate.
     */
    Open = 1,
    /**
     * The connection is in the process of closing.
     */
    Closing = 2,
    /**
     * The connection is closed or couldn't be opened.
     */
    Closed = 3
}

enum State {
    None = 0,
    /**
     * Indicated if communication session established.
     */
    Connected = 1 << 0,
    /**
     * Indicates if handshake was successful.
     */
    Ready = 1 << 1,
    /**
     * Indicated if communication session is closed.
     */
    Closed = 1 << 2
}

interface ProtocolEvents {
    bandwidthData: (data: ProtocolEvent<BandwidthData>) => this;
    cache: (data: ProtocolEvent<Cache>) => this;
    cached: (data: ProtocolEvent<Cached>) => this;
    clear: (data: ProtocolEvent<Clear>) => this;
    cleared: (data: ProtocolEvent<Cleared>) => this;
    closed: (data: ClosedData) => this;
    connected: () => this;
    error: (data: Error) => this;
    handshake: (data: ProtocolEvent<Handshake>) => this;
    handshakeFailed: (data: HandshakeFailed) => this;
    requested: (data: ProtocolEvent<Requested>) => this;
    response: (data: ProtocolEvent<Response>) => this;
    seed: (data: ProtocolEvent<Seed>) => this;
    seeding: (data: ProtocolEvent<Seeding>) => this;
    signedRequest: (data: ProtocolEvent<SignedRequest>) => this;
    storageData: (data: ProtocolEvent<StorageData>) => this;
    uploaded: (data: ProtocolEvent<Uploaded>) => this;
    warning: (data: ProtocolEvent<Warning>) => this;
    workOrder: (data: ProtocolEvent<WorkOrder>) => this;
}

const ProtocolEmitter: { new (): StrictEventEmitter<EventEmitter, ProtocolEvents> } = EventEmitter;

export class Wire<TLocalMetadata extends ClientMetadata, TRemoteMetadata extends ClientMetadata> extends ProtocolEmitter {
    constructor(
        /**
         * Address or entire WebSocket to connect to.
         */
        socket: string | WebSocket,
        /**
         * Client metadata to send to receiving signature checking function.
         */
        private readonly localMetadata: TLocalMetadata,
        /**
         * Signature checking function. Should return true if passes metadata check.
         * If signature checking function not implemented, returns true by default.
         */
        public signatureCheck: (
            /**
             * Received client metadata to use in signature checking. Return true if passes.
             */
            remoteMetadata: TRemoteMetadata
        ) => Promise<Boolean> = async (): Promise<boolean> => new Promise<boolean>(resolve => resolve(true))
    ) {
        super();

        this.socket = this.createWebSocket(socket);

        if (this.socket.readyState === ReadyState.Connecting) {
            this.socket.on("open", () => {
                this.state |= State.Connected;
                this.emit("connected");
            });
        } else if (this.socket.readyState === ReadyState.Open) {
            this.state |= State.Connected;
            this.emit("connected");
        } else {
            throw new Error("Something went wrong while opening connection.");
        }

        this.socket.onerror = event => {
            this.emit("error", event.error);
        };

        this.socket.onclose = event => {
            if (this.state & State.Closed) {
                return;
            }
            this.state |= State.Closed;
            const closedData: ClosedData = {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            };
            this.emit("closed", closedData);
        };

        this.socket.on("message", message => {
            const params = Helpers.parseJSON(message as string);
            if (params) {
                this.handleMessage(params as ProtocolEvent<ProtocolEventsTypes>);
            }
        });

        // Communication session heartbeat.
        let isAlive: boolean = true;
        this.socket.on("pong", () => {
            isAlive = true;
        });

        let interval: NodeJS.Timer;
        this.once("connected", () => {
            interval = setInterval(() => {
                if (isAlive === false) {
                    if (!this.socket) {
                        throw new Error("socket is null");
                    }
                    if (!(this.state & State.Closed)) {
                        this.socket.terminate();
                    }
                    clearInterval(interval);
                    return;
                }
                isAlive = false;
                if (!this.socket) {
                    throw new Error("socket is null");
                }
                this.socket.ping(Helpers.noop);
            }, 10000);
        });
    }

    protected state: State = State.None;
    /**
     * Communication session.
     */
    public readonly socket: WebSocket;
    /**
     * Client metadata to received during signature checking.
     */
    private remoteMetadata?: TRemoteMetadata;

    private createWebSocket(socket: string | WebSocket): WebSocket {
        if (typeof socket === "object" && socket.constructor.name === "WebSocket") {
            return socket;
        } else if (typeof socket === "string") {
            return new WebSocket(socket);
        } else {
            throw new Error("Unexpected 'socket' parameter type.");
        }
    }

    public async handshake(): Promise<ProtocolEvent<Handshake>> {
        const handshakeInternal = (): void => {
            const handshake: ProtocolEvent<Handshake> = {
                action: Action.Handshake,
                data: {
                    status: HandshakeStatus.Sent,
                    metadata: this.localMetadata
                },
                timestamp: Date.now()
            };
            this.send(handshake);
        };

        if (this.state & State.Connected) {
            handshakeInternal();
        } else {
            this.on("connected", () => {
                handshakeInternal();
            });
        }
        return this.handshakeResultInternal();
    }

    public async handshakeResult(): Promise<ProtocolEvent<Handshake>> {
        return this.handshakeResultInternal();
    }

    private async handshakeResultInternal(): Promise<ProtocolEvent<Handshake>> {
        return new Promise<ProtocolEvent<Handshake>>((resolve, reject) => {
            this.once("handshake", info => {
                resolve(info);
            });
            this.once("handshakeFailed", info => {
                process.nextTick(() => {
                    // don't close until wire end received handshakeFailed event.
                    if (this.socket) {
                        // FIXME: [ts] Object is possibly "null".
                        this.socket.close(1008);
                    }
                });
                reject(info);
            });
            this.once("closed", info => {
                reject(info);
            });
        });
    }

    public uploaded(infoHash: string, bandwidth: number, ip: string): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const uploaded: ProtocolEvent<Uploaded> = {
            action: Action.Uploaded,
            data: {
                ip: ip,
                infoHash: infoHash,
                uploaded: bandwidth
            },
            timestamp: Date.now()
        };
        this.send(uploaded);
    }

    public bandwidthData(data: BandwidthData): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const metadata: ProtocolEvent<BandwidthData> = {
            action: Action.BandwidthData,
            timestamp: Date.now(),
            data: data
        };
        this.send(metadata);
    }

    public storageData(data: StorageData): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const metadata: ProtocolEvent<StorageData> = {
            action: Action.StorageData,
            timestamp: Date.now(),
            data: data
        };
        this.send(metadata);
    }

    public signedRequest(data: SignedRequest): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const signedRequest: ProtocolEvent<SignedRequest> = {
            action: Action.SignedRequest,
            timestamp: Date.now(),
            data: data
        };
        this.send(signedRequest);
    }

    public cleared(infoHashes: string[]): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const cleared: ProtocolEvent<Cleared> = {
            action: Action.Cleared,
            data: {
                infoHashes: infoHashes
            },
            timestamp: Date.now()
        };
        this.send(cleared);
    }

    public clear(infoHashes: string[]): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        if (!Array.isArray(infoHashes)) {
            infoHashes = [];
        }

        const clear: ProtocolEvent<Clear> = {
            action: Action.Clear,
            data: {
                infoHashes: infoHashes
            },
            timestamp: Date.now()
        };
        this.send(clear);
    }

    public cached(url: string, size: number): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const cached: ProtocolEvent<Cached> = {
            action: Action.Cached,
            data: {
                source: {
                    url: url
                },
                size: size
            },
            timestamp: Date.now()
        };
        this.send(cached);
    }

    public cache(url: string): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const cache: ProtocolEvent<Cache> = {
            action: Action.Cache,
            data: {
                source: {
                    url: url
                }
            },
            timestamp: Date.now()
        };
        this.send(cache);
    }

    public seed(metadata: Seed): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const seed: ProtocolEvent<Seed> = {
            action: Action.Seed,
            data: metadata,
            timestamp: Date.now()
        };
        this.send(seed);
    }

    public seeding(infoHashes: string[]): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const seeding: ProtocolEvent<Seeding> = {
            action: Action.Seeding,
            data: {
                infoHashes: infoHashes
            },
            timestamp: Date.now()
        };
        this.send(seeding);
    }

    public warning(message: string): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const warning: ProtocolEvent<Warning> = {
            action: Action.Warning,
            data: {
                message: message
            },
            timestamp: Date.now()
        };
        this.send(warning);
    }

    public workOrder(address: string): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const workOrder: ProtocolEvent<WorkOrder> = {
            action: Action.WorkOrder,
            data: {
                address: address
            },
            timestamp: Date.now()
        };
        this.send(workOrder);
    }

    public requested(piece: number, infoHash: string): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const requested: ProtocolEvent<Requested> = {
            action: Action.Requested,
            data: {
                piece,
                infoHash
            },
            timestamp: Date.now()
        };
        this.send(requested);
    }

    public response(buffer: Buffer): void {
        if (!(this.state & State.Ready)) {
            throw new NotReadyError();
        }

        const response: ProtocolEvent<Response> = {
            action: Action.Response,
            data: {
                data: buffer.toString("hex")
            },
            timestamp: Date.now()
        };
        this.send(response);
    }

    private handleMessage<TType extends ProtocolEventsTypes>(params: ProtocolEvent<TType>): void {
        switch (params.action) {
            case Action.Handshake:
                this.onHandshake(params as ProtocolEvent<Handshake>);
                break;
            case Action.Uploaded:
                this.onUploaded(params as ProtocolEvent<Uploaded>);
                break;
            case Action.BandwidthData:
                this.onBandwidthData(params as ProtocolEvent<BandwidthData>);
                break;
            case Action.StorageData:
                this.onStorageData(params as ProtocolEvent<StorageData>);
                break;
            case Action.SignedRequest:
                this.onSignedRequest(params as ProtocolEvent<SignedRequest>);
                break;
            case Action.Clear:
                this.onClear(params as ProtocolEvent<Clear>);
                break;
            case Action.Cleared:
                this.onCleared(params as ProtocolEvent<Cleared>);
                break;
            case Action.Cache:
                this.onCache(params as ProtocolEvent<Cache>);
                break;
            case Action.Cached:
                this.onCached(params as ProtocolEvent<Cached>);
                break;
            case Action.Seed:
                this.onSeed(params as ProtocolEvent<Seed>);
                break;
            case Action.Seeding:
                this.onSeeding(params as ProtocolEvent<Seeding>);
                break;
            case Action.Warning:
                this.onWarning(params as ProtocolEvent<Warning>);
                break;
            case Action.WorkOrder:
                this.onWorkOrder(params as ProtocolEvent<WorkOrder>);
                break;
            case Action.Requested:
                this.onRequested(params as ProtocolEvent<Requested>);
                break;
            case Action.Response:
                this.onResponse(params as ProtocolEvent<Response>);
                break;
            default:
                debug(`Unknown action: ${params.action}`);
        }
    }

    public close(code: number, reason: string): void {
        this.socket.close(code, reason);
        const data: ClosedData = {
            wasClean: true,
            code: code,
            reason: reason
        };
        this.emit("closed", data);
    }

    // Outpound

    private send<TType extends ProtocolEventsTypes>(params: ProtocolEvent<TType>): void {
        if (this.state & State.Closed) {
            log("connection is closed");
            return;
        }
        if (!(this.state & State.Connected)) {
            log("not connected");
            return;
        }

        const data = JSON.stringify(params);
        try {
            if (!this.socket) {
                log("socket is null");
                return;
            }
            if (this.socket.readyState === ReadyState.Closing) {
                log("socket is closing, data will not be send");
                return;
            }
            this.socket.send(data);
        } catch (e) {
            log(e); // TODO: retry to send data.
        }
    }

    // Inbound

    private async onHandshake(params: ProtocolEvent<Handshake>): Promise<void> {
        if (params.data.status === HandshakeStatus.Sent) {
            this.remoteMetadata = params.data.metadata as TRemoteMetadata;
            params.data.metadata = this.localMetadata;
            // console.info("HandshakeStatus Sent (node received)", this.remoteMetadata);
            const isValid = await this.signatureCheck(this.remoteMetadata);
            if (isValid) {
                params.data.status = HandshakeStatus.Received;
            } else {
                params.data.status = HandshakeStatus.Refused;
                this.emit("handshakeFailed", {
                    reason: "invalid master signature"
                });
            }
            params.timestamp = Date.now();
            this.send(params);
        } else if (params.data.status === HandshakeStatus.Received) {
            this.remoteMetadata = params.data.metadata as TRemoteMetadata;
            // console.info("HandshakeStatus Received (master received)", params.data.metadata);
            // const isValid = await this.signatureCheck(this.remoteMetadata);
            if (this.remoteMetadata != null && (await this.signatureCheck(this.remoteMetadata))) {
                params.data.status = HandshakeStatus.Notified;
                params.timestamp = Date.now();
                this.send(params);
                params.data.status = HandshakeStatus.Done;
                this.emit("handshake", params);
                this.state |= State.Ready;
            } else {
                params.data.status = HandshakeStatus.Refused;
                this.emit("handshakeFailed", { reason: "invalid node signature" });
                params.timestamp = Date.now();
                this.send(params);
                params.data.status = HandshakeStatus.Done;
                this.state |= State.Ready;
            }
        } else if (params.data.status === HandshakeStatus.Notified) {
            if (this.remoteMetadata) {
                params.data.metadata = this.remoteMetadata;
            }
            // console.info("HandshakeStatus Notified", this.remoteMetadata);
            params.data.status = HandshakeStatus.Done;
            this.state |= State.Ready;
            this.emit("handshake", params);
        } else if (params.data.status === HandshakeStatus.Refused) {
            // console.info("HandshakeStatus Refused", params.data.metadata);
            this.emit("handshakeFailed", { reason: "invalid signature" });
        }
    }

    protected onUploaded(params: ProtocolEvent<Uploaded>): void {
        this.emit("uploaded", params);
    }

    protected onBandwidthData(params: ProtocolEvent<BandwidthData>): void {
        this.emit("bandwidthData", params);
    }

    protected onStorageData(params: ProtocolEvent<StorageData>): void {
        this.emit("storageData", params);
    }

    protected onSignedRequest(params: ProtocolEvent<SignedRequest>): void {
        this.emit("signedRequest", params);
    }

    protected onCleared(params: ProtocolEvent<Cleared>): void {
        this.emit("cleared", params);
    }

    protected onClear(params: ProtocolEvent<Clear>): void {
        this.emit("clear", params);
    }

    protected onCache(params: ProtocolEvent<Cache>): void {
        this.emit("cache", params);
    }

    protected onCached(params: ProtocolEvent<Cached>): void {
        this.emit("cached", params);
    }

    protected onSeed(params: ProtocolEvent<Seed>): void {
        this.emit("seed", params);
    }

    protected onSeeding(params: ProtocolEvent<Seeding>): void {
        this.emit("seeding", params);
    }

    protected onWarning(params: ProtocolEvent<Warning>): void {
        this.emit("warning", params);
    }

    protected onWorkOrder(params: ProtocolEvent<WorkOrder>): void {
        this.emit("workOrder", params);
    }

    protected onRequested(params: ProtocolEvent<Requested>): void {
        this.emit("requested", params);
    }

    protected onResponse(params: ProtocolEvent<Response>): void {
        this.emit("response", params);
    }

    public isConnected(): boolean {
        if (this.state & State.Connected) {
            return true;
        }
        return false;
    }

    public getLocalMetadata(): TLocalMetadata {
        if (this.localMetadata == null) {
            throw new ProtocolMetadataError("localMetadata");
        }
        return this.localMetadata;
    }

    public getRemoteMetadata(): TRemoteMetadata {
        if (this.remoteMetadata == null) {
            throw new ProtocolMetadataError("remoteMetadata");
        }
        return this.remoteMetadata;
    }
}
