import * as WebSocket from "ws";
import * as http from "http";
import {
    Action,
    Seed,
    SignedRequest,
    HandshakeStatus,
    NodeMetadata,
    MasterMetadata,
    NodeBlockchainMetadata,
    MasterBlockchainMetadata,
    BandwidthData,
    StorageData,
    Statistics
} from "./contracts";
import { Wire } from "./protocol";

const MASTER_PORT = 50000;
const MASTER_ADDRESS = `ws://127.0.0.1:${MASTER_PORT}`;

const defaultNodeMetadata: NodeMetadata = {
    nodeId: "myNodeId",
    connections: { webrtc: 1, ws: 2, wss: 3 },
    interface: "cli",
    version: "1.0.0",
    airdropAddress: "myAirdropAddress"
};

const defaultMasterMetadata: MasterMetadata = {
    externalIp: "1.2.3.4"
};

const START_TIMESTAMP = Date.now();

let masterServer: http.Server;
let wss: WebSocket.Server;
beforeEach(() => {
    masterServer = http.createServer();
    wss = new WebSocket.Server({ server: masterServer });
});

afterEach(done => {
    TestsHelpers.closeAll(done);
});

namespace TestsHelpers {
    export function closeAll(cb: () => void): void {
        wss.clients.forEach(ws => ws.close());
        masterServer.close(() => {
            cb();
        });
    }

    export function connection(cb: (ws: WebSocket) => void): void {
        wss.on("connection", (ws, req) => {
            cb(ws);
        });
    }

    export function listen(cb: () => void): void {
        masterServer.listen(MASTER_PORT, (err: Error) => {
            if (err) {
                throw new Error(err.message);
            }
            cb();
        });
    }
}

describe("messages from node", () => {
    const wallet = "0x898ba218f0001a197d0e29d678fe53406931d233";
    it("handshakes", done => {
        expect.assertions(8);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", info => {
                expect(info.action).toBe(Action.Handshake);
                expect(info.data.status).toBe(HandshakeStatus.Done);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", info => {
                expect(info.action).toBe(Action.Handshake);
                expect(info.data.status).toBe(HandshakeStatus.Done);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
            });
            nodeWire.handshake();
        });
    });

    it("handshakes (promise)", done => {
        expect.assertions(8);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", info => {
                expect(info.action).toBe(Action.Handshake);
                expect(info.data.status).toBe(HandshakeStatus.Done);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.handshake().then(info => {
                expect(info.action).toBe(Action.Handshake);
                expect(info.data.status).toBe(HandshakeStatus.Done);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
            });
        });
    });

    it("uploaded", done => {
        const bandwidth = 123123;
        const infoHash = "1111111111111111111111111111111111upload";
        const ip = "1.2.3.4";

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(7);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("uploaded", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.action).toBe(Action.Uploaded);
                expect(info.data.infoHash).toBe(infoHash);
                expect(info.data.ip).toBe(ip);
                expect(info.data.uploaded).toBe(bandwidth);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.uploaded(infoHash, ip, bandwidth);
            });
        });
    });

    it("downloaded", done => {
        const bandwidth = 123123;
        const infoHash = "1111111111111111111111111111111111download";
        const ip = "2.3.4.5";

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(7);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("downloaded", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.action).toBe(Action.Downloaded);
                expect(info.data.infoHash).toBe(infoHash);
                expect(info.data.ip).toBe(ip);
                expect(info.data.downloaded).toBe(bandwidth);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.downloaded(infoHash, ip, bandwidth);
            });
        });
    });

    it("bandwidthData", done => {
        const params: BandwidthData = {
            speeds: {
                download: 1,
                upload: 2,
                originalDownload: 3,
                originalUpload: 4
            },
            client: {
                ip: "A",
                lat: 5,
                lon: 6,
                isp: "B",
                isprating: 7,
                rating: 8,
                ispdlavg: 9,
                ispulavg: 10,
                country: "C"
            },
            server: {
                host: "D",
                lat: 11,
                lon: 12,
                location: "E",
                country: "F",
                cc: "G",
                sponsor: "H",
                distance: 13,
                distanceMi: 14,
                ping: 15,
                id: "I"
            }
        };

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(7);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("bandwidthData", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.action).toBe(Action.BandwidthData);
                expect(info.data.speeds).toBeDefined();
                expect(info.data.speeds.download).toBe(params.speeds.download);
                expect(info.data.server.host).toBe(params.server.host);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.bandwidthData(params);
            });
        });
    });

    it("storageData", done => {
        const params: StorageData = {
            available: 5,
            used: 3,
            total: 8
        };

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(6);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("storageData", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.action).toBe(Action.StorageData);
                expect(info.data.available).toBe(params.available);
                expect(info.data.used).toBe(params.used);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.storageData(params);
            });
        });
    });

    it("signed requests (node to master)", done => {
        const params: SignedRequest = {
            type: "accept",
            workOrderAddress: "workOrderAddress",
            extendWorkOrder: false,
            signedRequest: { nonce: 1, sig: "abc" }
        };

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const nodeSignedRequest = jest.fn();
        expect.assertions(6);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("signedRequest", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.action).toBe(Action.SignedRequest);
                expect(info.data.type).toBe(params.type);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(nodeSignedRequest).not.toHaveBeenCalled();
                TestsHelpers.closeAll(done);
            });
            masterWire.handshake();
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.on("signedRequest", info => {
                nodeSignedRequest();
            });
            nodeWire.handshakeResult().then(() => {
                nodeWire.signedRequest(params);
            });
        });
    });

    it("signed requests (master to node)", done => {
        const params: SignedRequest = {
            type: "accept",
            workOrderAddress: "workOrderAddress",
            extendWorkOrder: false,
            signedRequest: { nonce: 1, sig: "abc" }
        };

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const masterSignedRequest = jest.fn();
        expect.assertions(7);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("signedRequest", info => {
                masterSignedRequest();
            });
            masterWire.handshake().then(() => {
                masterWire.signedRequest(params);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.on("signedRequest", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.action).toBe(Action.SignedRequest);
                expect(info.data.type).toBe(params.type);
                expect(info.data.workOrderAddress).toBe(params.workOrderAddress);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(masterSignedRequest).not.toHaveBeenCalled();
                TestsHelpers.closeAll(done);
            });
        });
    });

    test("cached", done => {
        const cacheUrl = "http://example.com/image.jpg";
        const cacheSize = 321;

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(6);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("cached", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.data.source.url).toBe(cacheUrl);
                expect(info.data.size).toBe(cacheSize);
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.cached(cacheUrl, cacheSize);
            });
        });
    });

    test("seeding", done => {
        const seedingInfoHashes = ["seeding111111111111111111111111111111112", "seeding111111111111111111111111111111113"];

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(5);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("seeding", info => {
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(info.data.infoHashes).toEqual(expect.arrayContaining(seedingInfoHashes));
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.seeding(seedingInfoHashes);
            });
        });
    });

    test("cleared", done => {
        const infoHashes = ["1111111111111111111111111111111111clear1", "1111111111111111111111111111111111clear2"];

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const onCleared = jest.fn();

        expect.assertions(6);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", masterHandshake);
            masterWire.on("cleared", info => {
                onCleared();
                expect(nodeHandshake).toHaveBeenCalled();
                expect(masterHandshake).toHaveBeenCalled();
                expect(infoHashes).toEqual(expect.arrayContaining(info.data.infoHashes));
                expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                expect(onCleared).toHaveBeenCalledTimes(1);
                TestsHelpers.closeAll(done);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.cleared(infoHashes);
            });
        });
    });
});

describe("messages from master", () => {
    test("check master params", done => {
        expect.assertions(2);
        const masterMetadata: MasterMetadata = {
            externalIp: "10.11.12.13"
        };

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, masterMetadata);
            masterWire.handshake().then(info => {
                expect((info.data.metadata as NodeMetadata).interface).toBe(defaultNodeMetadata.interface);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.handshakeResult().then(info => {
                expect((info.data.metadata as MasterMetadata).externalIp).toBe(masterMetadata.externalIp);
                TestsHelpers.closeAll(done);
            });
        });
    });

    test("clear", done => {
        const infoHashes = ["1111111111111111111111111111111111clear1", "1111111111111111111111111111111111clear2"];

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(5);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", () => {
                masterHandshake();
                masterWire.clear(infoHashes);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.on("clear", info => {
                    expect(nodeHandshake).toHaveBeenCalled();
                    expect(masterHandshake).toHaveBeenCalled();
                    expect(info.action).toBe(Action.Clear);
                    expect(info.data.infoHashes).toEqual(expect.arrayContaining(infoHashes));
                    expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                    TestsHelpers.closeAll(done);
                });
            });
        });
    });

    test("warning & disconnect", done => {
        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const msg = "Test WebRTC connecton failed. Ports or IP might be unreachable.";
        expect.assertions(3);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", () => {
                masterHandshake();

                masterWire.warning(msg);
            });
        });
        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.on("warning", info => {
                    expect(info.action).toBe(Action.Warning);
                    expect(info.data.message).toBe(msg);
                    expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);

                    TestsHelpers.closeAll(done);
                });
            });
        });
    });

    test("cache", done => {
        const cacheUrl = "http://example.com/image.jpg";

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(6);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", () => {
                masterHandshake();
                masterWire.cache(cacheUrl);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.on("cache", info => {
                    expect(nodeHandshake).toHaveBeenCalled();
                    expect(masterHandshake).toHaveBeenCalled();
                    expect(info.action).toBe(Action.Cache);
                    expect(info.data.source.url).toBe(cacheUrl);
                    expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                    expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                    TestsHelpers.closeAll(done);
                });
            });
        });
    });

    test("work order", done => {
        const workOrderAddress = "0xf911adaf4461a8fc3f4f5d8e2faaeba5d8e3891b";

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(6);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", () => {
                masterHandshake();
                masterWire.workOrder(workOrderAddress);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.on("workOrder", info => {
                    expect(nodeHandshake).toHaveBeenCalled();
                    expect(masterHandshake).toHaveBeenCalled();
                    expect(info.action).toBe(Action.WorkOrder);
                    expect(info.data.address).toBe(workOrderAddress);
                    expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                    expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                    TestsHelpers.closeAll(done);
                });
            });
        });
    });

    test("statistics", done => {
        const stats: Statistics = {
            time: {
                days: 1,
                hours: 2,
                minutes: 3,
                seconds: 4,
                total: 5
            },
            downloaded: 234,
            uploaded: 345
        };

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(8);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", () => {
                masterHandshake();
                masterWire.statistics(stats);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.on("statistics", info => {
                    expect(nodeHandshake).toHaveBeenCalled();
                    expect(masterHandshake).toHaveBeenCalled();
                    expect(info.action).toBe(Action.Statistics);
                    expect(info.data.time).toBe(info.data.time);
                    expect(info.data.downloaded).toBe(info.data.downloaded);
                    expect(info.data.uploaded).toBe(info.data.uploaded);
                    expect(info.timestamp).toBeLessThanOrEqual(Date.now());
                    expect(info.timestamp).toBeGreaterThanOrEqual(START_TIMESTAMP);
                    TestsHelpers.closeAll(done);
                });
            });
        });
    });

    test("seed", done => {
        const metadata: Seed = {
            metadata: {
                infoHash: "123456789123456789",
                pieces: 10
            }
        };

        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        expect.assertions(4);

        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, defaultNodeMetadata);
            masterWire.on("handshake", () => {
                masterHandshake();
                masterWire.seed(metadata);
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, defaultNodeMetadata);
            nodeWire.on("handshake", nodeHandshake);
            nodeWire.handshake().then(() => {
                nodeWire.on("seed", info => {
                    expect(nodeHandshake).toHaveBeenCalled();
                    expect(masterHandshake).toHaveBeenCalled();
                    expect(info.data.metadata.infoHash).toBe(metadata.metadata.infoHash);
                    expect(info.data.metadata.pieces).toBe(metadata.metadata.pieces);
                    TestsHelpers.closeAll(done);
                });
            });
        });
    });
});

describe("handshake validation", () => {
    test("should fail node signature check", done => {
        const masterMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "1" } as Partial<MasterMetadata>);
        const nodeMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "6" } as Partial<NodeMetadata>);
        expect.assertions(4);
        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const masterHandshakeFailed = jest.fn();
        const nodeHandshakeFailed = jest.fn();
        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, masterMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return new Promise<boolean>((resolve, reject) => {
                    resolve(
                        parseInt((receivedMetadata as NodeBlockchainMetadata).msg) ===
                            parseInt((receivedMetadata as NodeBlockchainMetadata).msgSigned) * 2
                    );
                });
            });
            masterWire.on("handshake", () => {
                masterHandshake();
            });
            masterWire.on("handshakeFailed", info => {
                masterHandshakeFailed();
            });
            masterWire
                .handshake()
                .then(() => {
                    return;
                })
                .catch(() => {
                    return;
                });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, nodeMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return new Promise<boolean>((resolve, reject) => {
                    resolve(
                        parseInt((receivedMetadata as MasterBlockchainMetadata).msg) ===
                            parseInt((receivedMetadata as MasterBlockchainMetadata).msgSigned) * 10
                    );
                });
            });
            nodeWire.on("handshake", () => {
                nodeHandshake();
            });
            nodeWire.on("handshakeFailed", info => {
                nodeHandshakeFailed();

                expect(masterHandshake).toHaveBeenCalledTimes(0);
                expect(nodeHandshake).toHaveBeenCalledTimes(0);
                expect(masterHandshakeFailed).toHaveBeenCalledTimes(1);
                expect(nodeHandshakeFailed).toHaveBeenCalledTimes(1);
                TestsHelpers.closeAll(done);
            });
        });
    });

    test("should fail master signature check", done => {
        const masterMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "10" } as Partial<MasterMetadata>);
        const nodeMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "5" } as Partial<NodeMetadata>);
        expect.assertions(4);
        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const masterHandshakeFailed = jest.fn();
        const nodeHandshakeFailed = jest.fn();
        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, masterMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return new Promise<boolean>((resolve, reject) => {
                    resolve(
                        parseInt((receivedMetadata as NodeBlockchainMetadata).msg) ===
                            parseInt((receivedMetadata as NodeBlockchainMetadata).msgSigned) * 2
                    );
                });
            });
            masterWire.on("handshake", () => {
                masterHandshake();
            });
            masterWire.on("handshakeFailed", info => {
                masterHandshakeFailed();

                expect(masterHandshake).toHaveBeenCalledTimes(0);
                expect(nodeHandshake).toHaveBeenCalledTimes(0);
                expect(masterHandshakeFailed).toHaveBeenCalledTimes(1);
                expect(nodeHandshakeFailed).toHaveBeenCalledTimes(1);
                TestsHelpers.closeAll(done);
            });
            masterWire
                .handshake()
                .then(() => {
                    //
                })
                .catch(() => {
                    //
                });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, nodeMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return new Promise<boolean>((resolve, reject) => {
                    resolve(
                        parseInt((receivedMetadata as MasterBlockchainMetadata).msg) ===
                            parseInt((receivedMetadata as MasterBlockchainMetadata).msgSigned) * 10
                    );
                });
            });
            nodeWire.on("handshake", () => {
                nodeHandshake();
            });
            nodeWire.on("handshakeFailed", info => {
                nodeHandshakeFailed();
            });
        });
    });

    test("should fail master and node signature checks", done => {
        const masterMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "10" } as Partial<MasterMetadata>);
        const nodeMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "10" } as Partial<NodeMetadata>);
        expect.assertions(4);
        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const masterHandshakeFailed = jest.fn();
        const nodeHandshakeFailed = jest.fn();
        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, masterMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return new Promise<boolean>((resolve, reject) => {
                    resolve(
                        parseInt((receivedMetadata as NodeBlockchainMetadata).msg) ===
                            parseInt((receivedMetadata as NodeBlockchainMetadata).msgSigned) * 2
                    );
                });
            });
            masterWire.on("handshake", () => {
                masterHandshake();
            });
            masterWire.on("handshakeFailed", info => {
                masterHandshakeFailed();
            });
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, nodeMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return new Promise<boolean>((resolve, reject) => {
                    resolve(
                        parseInt((receivedMetadata as MasterBlockchainMetadata).msg) ===
                            parseInt((receivedMetadata as MasterBlockchainMetadata).msgSigned) * 10
                    );
                });
            });
            nodeWire.on("handshake", () => {
                nodeHandshake();
            });
            nodeWire.on("handshakeFailed", info => {
                nodeHandshakeFailed();

                expect(masterHandshake).toHaveBeenCalledTimes(0);
                expect(nodeHandshake).toHaveBeenCalledTimes(0);
                expect(masterHandshakeFailed).toHaveBeenCalledTimes(1);
                expect(nodeHandshakeFailed).toHaveBeenCalledTimes(1);
                TestsHelpers.closeAll(done);
            });
            nodeWire
                .handshake()
                .then(() => {
                    //
                })
                .catch(() => {
                    //
                });
        });
    });

    test("should pass signatures", done => {
        const masterMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "1" } as Partial<MasterMetadata>);
        const nodeMetadata = Object.assign({}, defaultNodeMetadata, { msg: "10", msgSigned: "5" } as Partial<NodeMetadata>);
        expect.assertions(4);
        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const masterHandshakeFailed = jest.fn();
        const nodeHandshakeFailed = jest.fn();
        TestsHelpers.connection(ws => {
            const masterWire = new Wire(ws, masterMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return (
                    parseInt((receivedMetadata as NodeBlockchainMetadata).msg) ===
                    parseInt((receivedMetadata as NodeBlockchainMetadata).msgSigned) * 2
                );
            });
            masterWire.on("handshake", () => {
                masterHandshake();
            });
            masterWire.on("handshakeFailed", info => {
                masterHandshakeFailed();
            });
            masterWire.handshake();
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire(MASTER_ADDRESS, nodeMetadata, async function signCheck(receivedMetadata): Promise<boolean> {
                return (
                    parseInt((receivedMetadata as MasterBlockchainMetadata).msg) ===
                    parseInt((receivedMetadata as MasterBlockchainMetadata).msgSigned) * 10
                );
            });
            nodeWire.on("handshake", () => {
                nodeHandshake();

                expect(masterHandshake).toHaveBeenCalledTimes(1);
                expect(nodeHandshake).toHaveBeenCalledTimes(1);
                expect(masterHandshakeFailed).toHaveBeenCalledTimes(0);
                expect(nodeHandshakeFailed).toHaveBeenCalledTimes(0);
                TestsHelpers.closeAll(done);
            });
            nodeWire.on("handshakeFailed", info => {
                nodeHandshakeFailed();
            });
        });
    });

    test("should pass signatures (extended)", done => {
        const masterMetadata: MasterBlockchainMetadata = { ...defaultMasterMetadata, ...{ msg: "1", msgSigned: "1" } };
        const nodeMetadata: NodeBlockchainMetadata = {
            ...defaultNodeMetadata,
            ...{
                msg: "1",
                msgSigned: "1",
                version: "123",
                jobPostAddress: "jobPostAddress",
                airdropAddress: "myAirdropAddress",
                workOrderAddress: null,
                walletAddress: "myWalletAddress"
            }
        };
        expect.assertions(4);
        const masterHandshake = jest.fn();
        const nodeHandshake = jest.fn();
        const masterHandshakeFailed = jest.fn();
        const nodeHandshakeFailed = jest.fn();
        TestsHelpers.connection(ws => {
            const masterWire = new Wire<MasterBlockchainMetadata, NodeBlockchainMetadata>(
                ws,
                masterMetadata,
                async remoteMetadata => parseInt(remoteMetadata.msg) === parseInt(remoteMetadata.msgSigned)
            );
            masterWire.on("handshake", () => {
                masterHandshake();
            });
            masterWire.on("handshakeFailed", () => {
                masterHandshakeFailed();
            });
            masterWire.handshake();
        });

        TestsHelpers.listen(() => {
            const nodeWire = new Wire<NodeBlockchainMetadata, MasterBlockchainMetadata>(
                MASTER_ADDRESS,
                nodeMetadata,
                async remoteMetadata => parseInt(remoteMetadata.msg) === parseInt(remoteMetadata.msgSigned)
            );
            nodeWire.on("handshake", () => {
                nodeHandshake();

                expect(masterHandshake).toHaveBeenCalledTimes(1);
                expect(nodeHandshake).toHaveBeenCalledTimes(1);
                expect(masterHandshakeFailed).toHaveBeenCalledTimes(0);
                expect(nodeHandshakeFailed).toHaveBeenCalledTimes(0);
                TestsHelpers.closeAll(done);
            });
            nodeWire.on("handshakeFailed", info => {
                nodeHandshakeFailed();
            });
        });
    });
});
