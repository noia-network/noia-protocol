export interface ContentResponse {
    data?: {
        buffer: Buffer;
        contentId: string;
        index: number;
        offset: number;
    };
    error?: string;
    status: number;
}

export interface ContentRequest {
    contentId: string;
    index: number;
    offset: number;
}

export interface Peer {
    host: string;
    secretKey: string | null;
    ports: {
        ws?: number;
        wss?: number;
        webrtc?: number;
    };
    location: {
        latitude: number;
        longitude: number;
        countryCode: string;
        city: string;
    };
}

export interface ClientResponse {
    data?: {
        src: string;
        peers: Peer[];
        metadata: {
            contentId: string;
            bufferLength: number;
            pieceBufferLength: number;
            piecesIntegrity: string[];
        };
        settings: {
            proxyControlAddress?: string;
        };
    };
    error?: string;
    status: number;
}

export interface ClientRequest {
    src: string;
    connectionTypes: string[];
}
