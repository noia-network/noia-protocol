import WebSocket from "ws";
import http from "http";
import Wire from "./index";

const masterHost: any = "127.0.0.1";
const masterPort = "6565";
const masterAddress = `ws://${masterHost}:${masterPort}`;

const nodeHost = "123.1.12.23";
const nodePort = "12123";

const startTimestamp = Date.now();

let masterServer: http.Server;
let wss: WebSocket.Server;
beforeEach(() => {
  masterServer = http.createServer();
  wss = new WebSocket.Server({ server: masterServer });
});

afterEach(done => {
  _closeAll(done);
});

function _closeAll(cb: () => void) {
  wss.clients.forEach(ws => ws.close());
  masterServer.close(() => {
    cb();
  });
}

function _connection(cb: (ws: WebSocket) => void) {
  wss.on("connection", (ws, req) => {
    cb(ws);
  });
}

function _listen(cb: () => void) {
  masterServer.listen(masterPort, masterHost, (err: Error) => {
    if (err) {
      throw new Error(err.message);
    }
    cb();
  });
}

describe("messages from node", () => {
  const wallet = "0x898ba218f0001a197d0e29d678fe53406931d233";
  it("handshakes", done => {
    expect.assertions(8);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", (info: any) => {
        expect(info.action).toBe(Wire.Actions.HANDSHAKE);
        expect(info.status).toBe(Wire.Handshake.DONE);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", (info: any) => {
        expect(info.action).toBe(Wire.Actions.HANDSHAKE);
        expect(info.status).toBe(Wire.Handshake.DONE);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
      });
      nodeWire.handshake();
    });
  });

  it("handshakes (promise)", done => {
    expect.assertions(8);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", (info: any) => {
        expect(info.action).toBe(Wire.Actions.HANDSHAKE);
        expect(info.status).toBe(Wire.Handshake.DONE);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.handshake().then((info: any) => {
        expect(info.action).toBe(Wire.Actions.HANDSHAKE);
        expect(info.status).toBe(Wire.Handshake.DONE);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
      });
    });
  });

  it("uploaded", done => {
    const bandwidth = 123123;
    const infoHash = "1111111111111111111111111111111111upload";

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(7);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", masterHandshake);
      masterWire.on("uploaded", (info: any) => {
        expect(nodeHandshake).toHaveBeenCalled();
        expect(masterHandshake).toHaveBeenCalled();
        expect(info.action).toBe(Wire.Actions.UPLOADED);
        expect(info.ip).toBe(nodeHost);
        expect(info.infoHash).toBe(infoHash);
        expect(info.uploaded).toBe(bandwidth);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.uploaded(infoHash, bandwidth, nodeHost);
      });
    });
  });

  it("metadata", done => {
    const params = {
      param1: "param1Val",
      param2: 2
    };

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(6);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", masterHandshake);
      masterWire.on("metadata", (info: any) => {
        expect(nodeHandshake).toHaveBeenCalled();
        expect(masterHandshake).toHaveBeenCalled();
        expect(info.action).toBe(Wire.Actions.METADATA);
        expect(info.param1).toBe(params.param1);
        expect(info.param2).toBe(params.param2);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.metadata(params);
      });
    });
  });

  test.skip("cached", done => {
    const cacheUrl = "http://example.com/image.jpg";
    const cacheSize = 321;

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(6);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", masterHandshake);
      masterWire.on("cached", (info: any) => {
        expect(nodeHandshake).toHaveBeenCalled();
        expect(masterHandshake).toHaveBeenCalled();
        expect(info.source.url).toBe(cacheUrl);
        expect(info.size).toBe(cacheSize);
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.cached(cacheUrl, cacheSize);
      });
    });
  });

  test("seeding", done => {
    const seedingInfoHashes = [
      "seeding111111111111111111111111111111112",
      "seeding111111111111111111111111111111113"
    ];

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(5);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", masterHandshake);
      masterWire.on("seeding", (info: any) => {
        expect(nodeHandshake).toHaveBeenCalled();
        expect(masterHandshake).toHaveBeenCalled();
        expect(info.infoHashes).toEqual(
          expect.arrayContaining(seedingInfoHashes)
        );
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.seeding(seedingInfoHashes);
      });
    });
  });

  test("cleared", done => {
    const infoHashes = [
      "1111111111111111111111111111111111clear1",
      "1111111111111111111111111111111111clear2"
    ];

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    const onCleared = jest.fn();

    expect.assertions(11);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", masterHandshake);
      masterWire.on("cleared", (info: any) => {
        onCleared();
        expect(nodeHandshake).toHaveBeenCalled();
        expect(masterHandshake).toHaveBeenCalled();
        expect(infoHashes).toEqual(expect.arrayContaining([info.infoHash]));
        expect(info.timestamp).toBeLessThanOrEqual(Date.now());
        expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
        infoHashes.splice(info.infoHash, 1);

        if (infoHashes.length === 0) {
          expect(onCleared).toHaveBeenCalledTimes(2);
          _closeAll(done);
        }
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        infoHashes.forEach(infoHash => nodeWire.cleared(infoHash));
      });
    });
  });
});

describe("messages from master", () => {
  test("check master params", done => {
    expect.assertions(1);
    const externalIp = "a.b.c.d";

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.handshake({
        externalIP: externalIp
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.handshakeResult().then((info: any) => {
          expect(info.params.externalIP).toBe(externalIp);
        _closeAll(done);
      });
    });
  });

  test("clear", done => {
    const infoHashes = [
      "1111111111111111111111111111111111clear1",
      "1111111111111111111111111111111111clear2"
    ];

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(5);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", () => {
        masterHandshake();
        masterWire.clear(infoHashes);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.on("clear", (info: any) => {
          expect(nodeHandshake).toHaveBeenCalled();
          expect(masterHandshake).toHaveBeenCalled();
          expect(info.action).toBe(Wire.Actions.CLEAR);
          expect(info.infoHashes).toEqual(expect.arrayContaining(infoHashes));
          expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
          _closeAll(done);
        });
      });
    });
  });

  test("warning & disconnect", done => {
    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(4);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", () => {
        masterHandshake();

        masterWire.warning(Wire.WARNING_MSG_ID.OLD_NODE_VERSION);
      });
    });
    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.on("warning", (info: any) => {
          expect(info.action).toBe(Wire.Actions.WARNING);
          expect(info.messageId).toBe(Wire.WARNING_MSG_ID.OLD_NODE_VERSION);
          expect(info.message).toBe(
            Wire.WARNING_MSG[Wire.WARNING_MSG_ID.OLD_NODE_VERSION]
          );
          expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);

          _closeAll(done);
        });
      });
    });
  });

  test("cache", done => {
    const cacheUrl = "http://example.com/image.jpg";

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(6);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", () => {
        masterHandshake();
        masterWire.cache(cacheUrl);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.on("cache", (info: any) => {
          expect(nodeHandshake).toHaveBeenCalled();
          expect(masterHandshake).toHaveBeenCalled();
          expect(info.action).toBe(Wire.Actions.CACHE);
          expect(info.source.url).toBe(cacheUrl);
          expect(info.timestamp).toBeLessThanOrEqual(Date.now());
          expect(info.timestamp).toBeGreaterThanOrEqual(startTimestamp);
          _closeAll(done);
        });
      });
    });
  });

  test("seed", done => {
    const metadata = {
      infoHash: "123456789123456789",
      pieces: "10"
    };

    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    expect.assertions(4);

    _connection(ws => {
      const masterWire = new Wire(ws);
      masterWire.on("handshake", () => {
        masterHandshake();
        masterWire.seed(metadata);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(masterAddress);
      nodeWire.on("handshake", nodeHandshake);
      nodeWire.handshake().then(() => {
        nodeWire.on("seed", (info: any) => {
          expect(nodeHandshake).toHaveBeenCalled();
          expect(masterHandshake).toHaveBeenCalled();
          expect(info.metadata.infoHash).toBe(metadata.infoHash);
          expect(info.metadata.pieces).toBe(metadata.pieces);
          _closeAll(done);
        });
      });
    });
  });
});

describe("handshake validation", () => {
  test("should fail node signature check", done => {
    const msgToNode = 10;
    const msgSignedToNode = 1;
    const msgToMaster = 10;
    const msgSignedToMaster = 6;
    expect.assertions(4);
    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    const masterHandshakeFailed = jest.fn();
    const nodeHandshakeFailed = jest.fn();
    _connection(ws => {
      const masterWire = new Wire(
        ws,
        msgToNode,
        msgSignedToNode,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 2);
          });
        }
      );
      masterWire.on("handshake", () => {
        masterHandshake();
      });
      masterWire.on("handshakeFailed", (info: any) => {
        masterHandshakeFailed();
      });
    });

    _listen(() => {
      const nodeWire = new Wire(
        masterAddress,
        msgToMaster,
        msgSignedToMaster,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 10);
          });
        }
      );
      nodeWire.on("handshake", () => {
        nodeHandshake();
      });
      nodeWire.on("handshakeFailed", (info: any) => {
        nodeHandshakeFailed();

        expect(masterHandshake).toHaveBeenCalledTimes(0);
        expect(nodeHandshake).toHaveBeenCalledTimes(0);
        expect(masterHandshakeFailed).toHaveBeenCalledTimes(1);
        expect(nodeHandshakeFailed).toHaveBeenCalledTimes(1);
        _closeAll(done);
      });
      nodeWire
        .handshake()
        .then(() => {})
        .catch(() => {});
    });
  });

  test("should fail master signature check", done => {
    const msgToNode = 10;
    const msgSignedToNode = 10;
    const msgToMaster = 10;
    const msgSignedToMaster = 5;
    expect.assertions(4);
    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    const masterHandshakeFailed = jest.fn();
    const nodeHandshakeFailed = jest.fn();
    _connection(ws => {
      const masterWire = new Wire(
        ws,
        msgToNode,
        msgSignedToNode,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 2);
          });
        }
      );
      masterWire.on("handshake", () => {
        masterHandshake();
      });
      masterWire.on("handshakeFailed", (info: any) => {
        masterHandshakeFailed();
        console.log("masterHandshakeFailed");

        expect(masterHandshake).toHaveBeenCalledTimes(0);
        expect(nodeHandshake).toHaveBeenCalledTimes(0);
        expect(masterHandshakeFailed).toHaveBeenCalledTimes(1);
        expect(nodeHandshakeFailed).toHaveBeenCalledTimes(1);
        _closeAll(done);
      });
    });

    _listen(() => {
      const nodeWire = new Wire(
        masterAddress,
        msgToMaster,
        msgSignedToMaster,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 10);
          });
        }
      );
      nodeWire.on("handshake", () => {
        nodeHandshake();
      });
      nodeWire.on("handshakeFailed", (info: any) => {
        nodeHandshakeFailed();
        console.log("nodeHandshakeFailed");
      });
      nodeWire
        .handshake()
        .then(() => {})
        .catch(() => {});
    });
  });

  test("should fail master and node signature checks", done => {
    const msgToNode = 10;
    const msgSignedToNode = 10;
    const msgToMaster = 10;
    const msgSignedToMaster = 10;
    expect.assertions(4);
    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    const masterHandshakeFailed = jest.fn();
    const nodeHandshakeFailed = jest.fn();
    _connection(ws => {
      const masterWire = new Wire(
        ws,
        msgToNode,
        msgSignedToNode,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 2);
          });
        }
      );
      masterWire.on("handshake", () => {
        masterHandshake();
      });
      masterWire.on("handshakeFailed", (info: any) => {
        masterHandshakeFailed();
      });
    });

    _listen(() => {
      const nodeWire = new Wire(
        masterAddress,
        msgToMaster,
        msgSignedToMaster,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 10);
          });
        }
      );
      nodeWire.on("handshake", () => {
        nodeHandshake();
      });
      nodeWire.on("handshakeFailed", (info: any) => {
        nodeHandshakeFailed();

        expect(masterHandshake).toHaveBeenCalledTimes(0);
        expect(nodeHandshake).toHaveBeenCalledTimes(0);
        expect(masterHandshakeFailed).toHaveBeenCalledTimes(1);
        expect(nodeHandshakeFailed).toHaveBeenCalledTimes(1);
        _closeAll(done);
      });
      nodeWire
        .handshake()
        .then(() => {})
        .catch(() => {});
    });
  });

  test("should pass signatures", done => {
    const msgToNode = 10;
    const msgSignedToNode = 1;
    const msgToMaster = 10;
    const msgSignedToMaster = 5;
    expect.assertions(4);
    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    const masterHandshakeFailed = jest.fn();
    const nodeHandshakeFailed = jest.fn();
    _connection(ws => {
      const masterWire = new Wire(
        ws,
        msgToNode,
        msgSignedToNode,
        function signCheck(msgFrom: any, msgSignedFrom: any, address?: string) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 2);
          });
        }
      );
      masterWire.on("handshake", () => {
        masterHandshake();
        expect(masterHandshake).toHaveBeenCalledTimes(1);
        expect(nodeHandshake).toHaveBeenCalledTimes(1);
        expect(masterHandshakeFailed).toHaveBeenCalledTimes(0);
        expect(nodeHandshakeFailed).toHaveBeenCalledTimes(0);
        _closeAll(done);
      });
      masterWire.on("handshakeFailed", (info: any) => {
        masterHandshakeFailed();
      });
    });

    _listen(() => {
      const nodeWire = new Wire(
        masterAddress,
        msgToMaster,
        msgSignedToMaster,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom * 10);
          });
        }
      );
      nodeWire.on("handshake", () => {
        nodeHandshake();
      });
      nodeWire.on("handshakeFailed", (info: any) => {
        nodeHandshakeFailed();
      });
      nodeWire
        .handshake()
        .then(() => {})
        .catch(() => {});
    });
  });

  test("should pass signatures", done => {
    const msgToNode = 1;
    const msgSignedToNode = 1;
    const msgToMaster = 1;
    const msgSignedToMaster = 1;
    const myAddress = "abc";
    const myVersion = "123";
    expect.assertions(6);
    const masterHandshake = jest.fn();
    const nodeHandshake = jest.fn();
    const masterHandshakeFailed = jest.fn();
    const nodeHandshakeFailed = jest.fn();
    _connection(ws => {
      const masterWire = new Wire(
        ws,
        msgToNode,
        msgSignedToNode,
        function signCheck(
          msgFrom: any,
          msgSignedFrom: any,
          address: any,
          version: string
        ) {
          return new Promise((resolve, reject) => {
            expect(address).toBe(myAddress);
            expect(version).toBe(myVersion);
            resolve(msgFrom === msgSignedFrom);
          });
        }
      );
      masterWire.on("handshake", () => {
        masterHandshake();
        expect(masterHandshake).toHaveBeenCalledTimes(1);
        expect(nodeHandshake).toHaveBeenCalledTimes(1);
        expect(masterHandshakeFailed).toHaveBeenCalledTimes(0);
        expect(nodeHandshakeFailed).toHaveBeenCalledTimes(0);
        _closeAll(done);
      });
      masterWire.on("handshakeFailed", (info: any) => {
        masterHandshakeFailed();
      });
    });

    _listen(() => {
      const nodeWire = new Wire(
        masterAddress,
        msgToMaster,
        msgSignedToMaster,
        function signCheck(msgFrom: any, msgSignedFrom: any) {
          return new Promise((resolve, reject) => {
            resolve(msgFrom === msgSignedFrom);
          });
        },
        myAddress,
        myVersion
      );
      nodeWire.on("handshake", () => {
        nodeHandshake();
      });
      nodeWire.on("handshakeFailed", (info: any) => {
        nodeHandshakeFailed();
      });
      nodeWire
        .handshake()
        .then(() => {})
        .catch(() => {});
    });
  });
});
