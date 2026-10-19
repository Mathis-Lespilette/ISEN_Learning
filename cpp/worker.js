// Compilateur C++ (clang/LLVM en WebAssembly, paquet @yowasp/clang) : tourne dans un Worker.
import { runClang } from './bundle.js';
const dec = new TextDecoder();
const txt = b => (b == null ? '' : typeof b === 'string' ? b : dec.decode(b));
self.onmessage = async e => {
  const { id, code } = e.data;
  let err = '';
  try {
    const files = await runClang(
      ['clang++', '-std=c++17', '-O1', '-Wall', '-fno-exceptions', 'main.cpp', '-o', 'prog',
       '-Wl,--max-memory=268435456', '-Wl,-z,stack-size=1048576'],
      { 'main.cpp': code },
      {
        stderr: b => { err += txt(b); },
        stdout: b => { err += txt(b); },
        fetchProgress: p => postMessage({ id, type: 'progress', done: p.doneLength, total: p.totalLength })
      });
    const wasm = files.prog;
    postMessage({ id, type: 'done', ok: true, wasm, warn: err }, [wasm.buffer]);
  } catch (ex) {
    postMessage({ id, type: 'done', ok: false, err: err.trim() || String((ex && ex.message) || ex) });
  }
};
