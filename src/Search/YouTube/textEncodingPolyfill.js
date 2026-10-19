import {Buffer} from 'buffer';

const toUint8Array = input => {
  if (input == null) return new Uint8Array(0);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input);
};

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = class TextEncoderPolyfill {
    get encoding() {
      return 'utf-8';
    }

    encode(value = '') {
      return Buffer.from(String(value), 'utf8');
    }
  };
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = class TextDecoderPolyfill {
    constructor(label = 'utf-8', options = {}) {
      if (!/^utf-?8$/i.test(label)) {
        throw new RangeError(`Unsupported text encoding: ${label}`);
      }
      this.fatal = Boolean(options.fatal);
    }

    decode(input = new Uint8Array(0)) {
      const bytes = toUint8Array(input);
      const decoded = Buffer.from(bytes).toString('utf8');

      if (this.fatal) {
        const encoded = Buffer.from(decoded, 'utf8');
        if (!encoded.equals(Buffer.from(bytes))) {
          throw new TypeError('The encoded data was not valid UTF-8.');
        }
      }

      return decoded;
    }
  };
}
