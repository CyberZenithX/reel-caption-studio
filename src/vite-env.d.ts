/// <reference types="vite/client" />

// TypeScript 5.5's bundled lib.dom.d.ts ships the WebCodecs video types
// (VideoEncoder, VideoFrame, EncodedVideoChunk, ...) but not the audio side
// yet (AudioEncoder, AudioData, EncodedAudioChunk). Declare the minimal
// surface used in src/lib/webcodecsExport.ts. Safe no-op if a future
// TypeScript version starts shipping these itself (redeclaration of an
// identical shape is allowed).
interface AudioDataInit {
  format: 'u8' | 's16' | 's32' | 'f32' | 'u8-planar' | 's16-planar' | 's32-planar' | 'f32-planar';
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: AllowSharedBufferSource;
  transfer?: ArrayBuffer[];
}

interface AudioData {
  readonly format: string | null;
  readonly sampleRate: number;
  readonly numberOfFrames: number;
  readonly numberOfChannels: number;
  readonly duration: number;
  readonly timestamp: number;
  close(): void;
}

declare var AudioData: {
  prototype: AudioData;
  new (init: AudioDataInit): AudioData;
};

interface AudioDecoderConfig {
  codec: string;
  sampleRate?: number;
  numberOfChannels?: number;
  description?: AllowSharedBufferSource;
}

interface EncodedAudioChunkMetadata {
  decoderConfig?: AudioDecoderConfig;
}

interface EncodedAudioChunkInit {
  type: 'key' | 'delta';
  timestamp: number;
  duration?: number;
  data: AllowSharedBufferSource;
}

interface EncodedAudioChunk {
  readonly byteLength: number;
  readonly duration: number | null;
  readonly timestamp: number;
  readonly type: 'key' | 'delta';
  copyTo(destination: AllowSharedBufferSource): void;
}

declare var EncodedAudioChunk: {
  prototype: EncodedAudioChunk;
  new (init: EncodedAudioChunkInit): EncodedAudioChunk;
};

interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
  bitrateMode?: 'constant' | 'variable';
}

interface AudioEncoderSupport {
  supported?: boolean;
  config?: AudioEncoderConfig;
}

interface AudioEncoderInit {
  error: WebCodecsErrorCallback;
  output: (chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void;
}

interface AudioEncoder extends EventTarget {
  readonly encodeQueueSize: number;
  ondequeue: ((this: AudioEncoder, ev: Event) => any) | null;
  readonly state: CodecState;
  close(): void;
  configure(config: AudioEncoderConfig): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  reset(): void;
}

declare var AudioEncoder: {
  prototype: AudioEncoder;
  new (init: AudioEncoderInit): AudioEncoder;
  isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport>;
};
