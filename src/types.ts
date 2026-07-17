export interface PeerIdentity {
  name: string;
  avatar: string;
  color: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface TransferState {
  name: string;
  size: number;
  progress: number;
  type: "send" | "receive";
  speed: number; // in KB/s
  elapsed: number; // in seconds
  bytesTransferred: number;
}

export interface TextMessage {
  id: string;
  text: string;
  sender: "me" | "peer";
  timestamp: number;
}
