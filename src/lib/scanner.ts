// Barcode reading for ISBNs. Uses the browser's own BarcodeDetector where it
// exists (Android Chrome); elsewhere (e.g. iPhone Safari) loads a bundled
// WebAssembly reader on first use. Nothing is fetched from other sites.
export interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

type NativeDetectorClass = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

let cached: Promise<Detector> | null = null;

export function getDetector(): Promise<Detector> {
  cached ??= create().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

async function create(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('ean_13')) return new Native({ formats: ['ean_13'] });
    } catch {
      /* fall through to the bundled reader */
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  });
  return new BarcodeDetector({ formats: ['ean_13'] });
}
