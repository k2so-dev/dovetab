function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export function openStore<V>(dbName: string, store: string) {
  let db: Promise<IDBDatabase> | undefined
  const open = () =>
    (db ??= new Promise((res, rej) => {
      const r = indexedDB.open(dbName, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(store)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    }))
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(store, mode).objectStore(store)

  return {
    get: async (key: string) => req<V | undefined>((await tx('readonly')).get(key)),
    set: async (key: string, value: V) => void (await req((await tx('readwrite')).put(value, key))),
    del: async (key: string) => void (await req((await tx('readwrite')).delete(key))),
    clear: async () => void (await req((await tx('readwrite')).clear())),
    async entries(): Promise<[string, V][]> {
      const s = await tx('readonly')
      const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())])
      return keys.map((k, i) => [String(k), values[i] as V])
    },
  }
}
