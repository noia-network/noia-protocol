import EventEmitter from "events";
import WebSocket from "ws";
const debug = require("debug")("noia-protocol:index");

const READY_STATE_CONNECTING = 0;
const READY_STATE_OPEN = 1;
const READY_STATE_CLOSING = 2;
const READY_STATE_CLOSED = 3;

function noop() {}

enum Actions {
  HANDSHAKE = "HANDSHAKE",
  UPLOADED = "UPLOADED",
  METADATA = "METADATA",
  SIGNED_REQUEST = "SIGNED_REQUEST",
  CLEAR = "CLEAR",
  CLEARED = "CLEARED",
  CACHE = "CACHE",
  CACHED = "CACHED",
  SEED = "SEED",
  SEEDING = "SEEDING",
  WARNING = "WARNING",
  WORK_ORDER = "WORK_ORDER",
  REQUESTED = "REQUESTED",
  RESPONSE = "RESPONSE"
}
enum WARNING_MSG_ID {
  OLD_NODE_VERSION = "#0001",
  OLD_MSTER_VERSION = "#0002",
  NEW_NODE_VERSION = "#0003",
  NEW_MASTER_VERSION = "#0004",
  WEBRTC_TEST_FAILED = "#0005"
}
enum WARNING_MSG {
  "#0001" = "Node version is too old.",
  "#0002" = "Master version is too old.",
  "#0003" = "Node has newer version",
  "#0004" = "Master has newer version",
  "#0005" = "Test WebRTC connecton failed. Ports or IP might be unreachable."
}
enum Handshake {
  SENT = "SENT",
  RECEIVED = "RECEIVED",
  NOTIFIED = "NOTIFIED",
  DONE = "DONE",
  REFUSED = "REFUSED"
}

export = class Wire extends EventEmitter {
  static Handshake = Handshake;
  static Actions = Actions;

  private connected: boolean;
  private conn: null | WebSocket;

  public port: null | string;
  public host: null | string;
  public ready: boolean;
  public closed: boolean;
  public msg: string;
  public msgSigned: string;
  public clientAddress: string;
  public address: null | string;
  public version: string;
  public isAlive: boolean;
  static WARNING_MSG_ID = WARNING_MSG_ID;
  static WARNING_MSG = WARNING_MSG;
  public signCheck: (
    msg: string,
    msgSigned: string,
    clientAddress: string,
    version: string
  ) => Promise<Boolean>;

  constructor(
    conn: string | WebSocket,
    msg?: any,
    msgSigned?: any,
    signCheck?: (
      msg: string,
      msgSigned: string,
      clientAddress?: any,
      version?: any
    ) => Promise<Boolean>,
    clientAddress?: any,
    version?: any
  ) {
    super();

    this.connected = false;
    this.ready = false;
    this.closed = false;

    this.host = null;
    this.port = null;
    this.address = null;
    this.conn = null;
    this.isAlive = true;
    this.version = version;
    this.msg = msg;
    this.msgSigned = msgSigned;
    this.clientAddress = clientAddress;
    if (!signCheck) {
      this.signCheck = () => {
        return new Promise(resolve => resolve(true));
      };
    } else {
      this.signCheck = signCheck;
    }

    if (conn instanceof WebSocket) {
      this.conn = conn;
    } else if (typeof conn === "string") {
      this.address = conn;
      this.conn = new WebSocket(this.address);
    } else {
      debug(`Unexpected conn type=${typeof conn}`);
      return;
    }

    if (this.conn.readyState === READY_STATE_CONNECTING) {
      this.conn.on("open", () => {
        this.connected = true;
        this.emit("connected");
      });
    } else if (this.conn.readyState === READY_STATE_OPEN) {
      this.connected = true;
      this.emit("connected");
    } else {
      throw new Error("something went wrong while opening connection");
    }

    this.conn.onerror = (error: any) => {
      if (error.error) {
        error = error.error; // FIXME: check why sometimes ErrorEvent emited.
      }
      this.emit("error", error);
    };

    this.conn.onclose = event => {
      if (this.closed) return;
      this.closed = true;
      this.emit("closed", { reason: event.reason, code: event.code });
    };

    this.conn.on("message", message => {
      const params = parseJSON(message);
      if (params) {
        this._handleMessage(params);
      }
    });

    // heartbeat
    this.conn.on("pong", () => {
      this.isAlive = true;
    });

    let interval: NodeJS.Timer;
    this.once("connected", () => {
      setInterval(() => {
        if (this.isAlive === false) {
          if (!this.conn) {
            throw new Error("conn is null");
          }
          if (!this.closed) {
            this.conn.terminate();
          }
          clearInterval(interval);
          return;
        }
        this.isAlive = false;
        if (!this.conn) {
          throw new Error("conn is null");
        }
        this.conn.ping(noop);
      }, 10000);
    });
  }

  // TODO: refactor.
  handshake(params?: any) {
    if (this.connected) {
      this._handshake(params);
    } else {
      this.on("connected", () => {
        this._handshake(params);
      });
    }
    return this._handshakeResult();
  }

  handshakeResult() {
    return this._handshakeResult();
  }

  _handshakeResult() {
    return new Promise((resolve, reject) => {
      this.once("handshake", (info: any) => {
        resolve(info);
      });
      this.once("handshakeFailed", (info: any) => {
        process.nextTick(() => {
          // don't close until wire end received handshakeFailed event.
          if (this.conn) this.conn.close(1008); // FIXME: [ts] Object is possibly "null".
        });
        reject(info);
      });
      this.once("refused", (info: any) => {
        reject(info);
      });
      this.once("reset", (info: any) => {
        reject(info);
      });
      this.once("closed", (info: any) => {
        reject(info);
      });
    });
  }

  uploaded(infoHash: string, bandwidth: number, ip: string) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    self._send({
      action: Actions.UPLOADED,
      ip: ip,
      infoHash: infoHash,
      uploaded: bandwidth,
      timestamp: Date.now()
    });
  }

  metadata(params: { [key: string]: any }) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    // Make sure action and timestamp is not overwritten by accident.
    const metadata = Object.assign(params, {
      action: Actions.METADATA,
      timestamp: Date.now()
    });

    self._send(metadata);
  }

  signedRequest(params: { [key: string]: any }) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    // Make sure action and timestamp is not overwritten by accident.
    const signedRequest = Object.assign(params, {
      action: Actions.SIGNED_REQUEST,
      timestamp: Date.now()
    });

    self._send(signedRequest);
  }

  cleared(infoHash: string) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    self._send({
      action: Actions.CLEARED,
      infoHash: infoHash,
      timestamp: Date.now()
    });
  }

  clear(infoHashes: Array<string>) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    if (!Array.isArray(infoHashes)) {
      infoHashes = [];
    }

    const data = {
      action: Actions.CLEAR,
      infoHashes: infoHashes,
      timestamp: Date.now()
    };

    self._send(data);
  }

  cached(url: string, size: number) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.CACHED,
      source: {
        url: url
      },
      size: size,
      timestamp: Date.now()
    };

    self._send(data);
  }

  cache(url: string) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.CACHE,
      source: {
        url: url
      },
      timestamp: Date.now()
    };

    self._send(data);
  }

  seed(metadata: any) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.SEED,
      metadata: metadata,
      timestamp: Date.now()
    };

    self._send(data);
  }

  seeding(infoHashes: Array<string>) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.SEEDING,
      infoHashes,
      timestamp: Date.now()
    };

    self._send(data);
  }
  warning(messageId: WARNING_MSG_ID) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.WARNING,
      messageId,
      message: WARNING_MSG[messageId],
      timestamp: Date.now()
    };

    self._send(data);
  }

  workOrder(address: string) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.WORK_ORDER,
      address: address,
      timestamp: Date.now()
    };

    self._send(data);
  }

  requested(piece: number, infoHash: string) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.REQUESTED,
      piece,
      infoHash,
      timestamp: Date.now()
    };

    self._send(data);
  }

  response(buffer: Buffer) {
    const self = this;

    if (!self.ready) {
      throw new Error("not ready. Forgot handshake?");
    }

    const data = {
      action: Actions.RESPONSE,
      data: buffer.toString("hex"),
      timestamp: Date.now()
    };

    self._send(data);
  }

  _handleMessage(params: any) {
    const self = this;

    switch (params.action) {
      case Actions.HANDSHAKE:
        return self._onHandshake(params);
      case Actions.UPLOADED:
        return self._onUploaded(params);
      case Actions.METADATA:
        return self._onMetadata(params);
      case Actions.SIGNED_REQUEST:
        return self._onSignedRequest(params);
      case Actions.CLEAR:
        return self._onClear(params);
      case Actions.CLEARED:
        return self._onCleared(params);
      case Actions.CACHE:
        return self._onCache(params);
      case Actions.CACHED:
        return self._onCached(params);
      case Actions.SEED:
        return self._onSeed(params);
      case Actions.SEEDING:
        return self._onSeeding(params);
      case Actions.WARNING:
        return self._onWarning(params);
      case Actions.WORK_ORDER:
        return self._onWorkOrder(params);
      case Actions.REQUESTED:
        return self._onRequested(params);
      case Actions.RESPONSE:
        return self._onResponse(params);
      // default:
      //   throw new Error(`Unknown action: ${params.action}`)
    }
  }

  close(code?: number, reason?: string) {
    const self = this;

    if (!self.conn) {
      throw new Error("conn is null");
    }
    self.conn.close(code, reason);
    self.emit("closed");
  }

  // Outpound

  _handshake(params: any) {
    const self = this;

    const data = {
      params: params,
      action: Actions.HANDSHAKE,
      status: Handshake.SENT,
      msg: self.msg,
      msgSigned: self.msgSigned,
      clientAddress: self.clientAddress,
      version: self.version,
      timestamp: Date.now()
    };
    self._send(data);
  }

  _send(params: any) {
    const self = this;

    if (self.closed) return debug("connection is closed");
    if (!self.connected) {
      throw new Error("not connected");
    }

    const data = JSON.stringify(params);
    try {
      if (!self.conn) {
        throw new Error("conn is null");
      }
      self.conn.send(data);
    } catch (e) {
      debug(e); // TODO: retry to send data.
    }
  }

  // Inbound

  _onHandshake(params: any) {
    const self = this;
    if (params.status === Handshake.SENT) {
      self
        .signCheck(
          params.msg,
          params.msgSigned,
          params.clientAddress,
          params.version
        )
        .then(isValid => {
          if (isValid) {
            params.status = Handshake.RECEIVED;
          } else {
            params.status = Handshake.REFUSED;
            self.emit("handshakeFailed", {
              reason: "invalid master signature"
            });
          }
          params.msg = self.msg;
          params.msgSigned = self.msgSigned;
          params.clientAddress = self.clientAddress;
          params.version = self.version;
          params.timestamp = Date.now();
          self._send(params);
        });
    } else if (params.status === Handshake.RECEIVED) {
      // self.signCheck(params.msg, params.msgSigned)
      self
        .signCheck(
          params.msg,
          params.msgSigned,
          params.clientAddress,
          params.version
        )
        .then(isValid => {
          if (isValid) {
            params.status = Handshake.NOTIFIED;
            params.timestamp = Date.now();
            self._send(params);
            params.status = Handshake.DONE;
            self.emit("handshake", params);
            self.host = params.host;
            self.port = params.port;
            self.ready = true;
          } else {
            params.status = Handshake.REFUSED;
            self.emit("handshakeFailed", { reason: "invalid node signature" });
            params.timestamp = Date.now();
            self._send(params);
            params.status = Handshake.DONE;
            self.host = params.host;
            self.port = params.port;
            self.ready = true;
          }
        });
    } else if (params.status === Handshake.NOTIFIED) {
      params.status = Handshake.DONE;
      self.host = params.host;
      self.port = params.port;
      self.ready = true;
      self.emit("handshake", params);
    } else if (params.status === Handshake.REFUSED) {
      self.emit("handshakeFailed", { reason: "invalid signature" });
    }
  }

  _onUploaded(params: any) {
    const self = this;

    self.emit("uploaded", params);
  }

  _onMetadata(params: any) {
    const self = this;

    self.emit("metadata", params);
  }

  _onSignedRequest(params: any) {
    const self = this;

    self.emit("signedRequest", params);
  }

  _onCleared(params: any) {
    const self = this;

    self.emit("cleared", params);
  }

  _onClear(params: any) {
    const self = this;

    self.emit("clear", params);
  }

  _onCache(params: any) {
    const self = this;

    self.emit("cache", params);
  }

  _onCached(params: any) {
    const self = this;

    self.emit("cached", params);
  }

  _onSeed(params: any) {
    const self = this;

    self.emit("seed", params);
  }

  _onSeeding(params: any) {
    const self = this;

    self.emit("seeding", params);
  }

  _onWarning(params: any) {
    const self = this;

    self.emit("warning", params);
  }

  _onWorkOrder(params: any) {
    const self = this;

    self.emit("workOrder", params);
  }

  _onRequested(params: any) {
    const self = this;

    self.emit("requested", params);
  }

  _onResponse(params: any) {
    const self = this;

    self.emit("response", params);
  }
};

function parseJSON(json: any) {
  try {
    return JSON.parse(json);
  } catch (e) {
    debug(e);
  }
  return null;
}
