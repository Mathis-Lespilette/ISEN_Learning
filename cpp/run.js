// Exécution d'un programme compilé (wasm32-wasi) : mini WASI, stdin/stdout en mémoire. Terminé par le site après un délai.
self.onmessage = async e => {
  const { wasm, stdin } = e.data;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const MAX = 65536;
  let out = '', err = '', cut = false, code = 0, mem = null, crash = false;
  const inp = enc.encode(stdin || ''); let ip = 0;
  const dv = () => new DataView(mem.buffer);
  const add = (fd, bytes) => {
    const s = dec.decode(bytes, { stream: true });
    if (fd === 1) { if (out.length < MAX) out += s; else cut = true; }
    else if (err.length < MAX) err += s;
  };
  class Exit { constructor(c) { this.c = c; } }
  const W = {
    args_sizes_get: (a, b) => { const v = dv(); v.setUint32(a, 1, true); v.setUint32(b, 5, true); return 0; },
    args_get: (a, b) => { const v = dv(); v.setUint32(a, b, true); new Uint8Array(mem.buffer, b, 5).set(enc.encode('prog\0')); return 0; },
    environ_sizes_get: (a, b) => { const v = dv(); v.setUint32(a, 0, true); v.setUint32(b, 0, true); return 0; },
    environ_get: () => 0,
    fd_write: (fd, iovs, n, np) => {
      if (fd !== 1 && fd !== 2) return 8;
      const v = dv(); let tot = 0;
      for (let i = 0; i < n; i++) {
        const p = v.getUint32(iovs + i * 8, true), l = v.getUint32(iovs + i * 8 + 4, true);
        add(fd, new Uint8Array(mem.buffer, p, l)); tot += l;
      }
      v.setUint32(np, tot, true); return 0;
    },
    fd_read: (fd, iovs, n, np) => {
      if (fd !== 0) return 8;
      const v = dv(); let tot = 0;
      for (let i = 0; i < n; i++) {
        const p = v.getUint32(iovs + i * 8, true), l = v.getUint32(iovs + i * 8 + 4, true);
        const k = Math.min(l, inp.length - ip);
        if (k > 0) { new Uint8Array(mem.buffer, p, k).set(inp.subarray(ip, ip + k)); ip += k; tot += k; }
        if (k < l) break;
      }
      v.setUint32(np, tot, true); return 0;
    },
    fd_fdstat_get: (fd, buf) => {
      if (fd > 2) return 8;
      const v = dv(); v.setUint8(buf, 2); v.setUint8(buf + 1, 0); v.setUint16(buf + 2, 0, true);
      v.setBigUint64(buf + 8, 0xFFFFFFFFn, true); v.setBigUint64(buf + 16, 0xFFFFFFFFn, true); return 0;
    },
    fd_prestat_get: () => 8,
    fd_prestat_dir_name: () => 8,
    fd_close: () => 0,
    fd_seek: () => 70,
    fd_fdstat_set_flags: () => 0,
    sched_yield: () => 0,
    clock_time_get: (id, prec, ptr) => { dv().setBigUint64(ptr, BigInt(Math.round((id === 0 ? Date.now() : performance.now()) * 1e6)), true); return 0; },
    clock_res_get: (id, ptr) => { dv().setBigUint64(ptr, 1000000n, true); return 0; },
    random_get: (p, l) => { for (let o = 0; o < l; o += 65536) crypto.getRandomValues(new Uint8Array(mem.buffer, p + o, Math.min(65536, l - o))); return 0; },
    proc_exit: c => { throw new Exit(c); }
  };
  try {
    const mod = await WebAssembly.compile(wasm);
    const imports = { wasi_snapshot_preview1: {} };
    for (const im of WebAssembly.Module.imports(mod)) {
      if (im.module === 'wasi_snapshot_preview1') imports.wasi_snapshot_preview1[im.name] = W[im.name] || (() => 52);
    }
    const inst = await WebAssembly.instantiate(mod, imports);
    mem = inst.exports.memory;
    try { inst.exports._start(); } catch (x) { if (x instanceof Exit) code = x.c; else throw x; }
    add(1, new Uint8Array(0));
  } catch (x) {
    err += (err ? '\n' : '') + 'Le programme s\'est arrêté de façon anormale : ' + (x && x.message ? x.message : x);
    code = code || 1; crash = true;
  }
  postMessage({ out, err, code, cut, crash });
};
