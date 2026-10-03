// 큰 파일(내 음악)은 localStorage에 못 넣어서 IndexedDB에 보관한다
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('homet', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}

export const saveBlob = (key, blob) => tx('readwrite', (s) => s.put(blob, key));
export const loadBlob = (key) => tx('readonly', (s) => s.get(key));
export const deleteBlob = (key) => tx('readwrite', (s) => s.delete(key));
