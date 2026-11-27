/* Фейковий Firebase для тестів app.js (замість js/firebase.js): окремий auth на кожен appName, спільна «хмара» (Map
   шлях → документ) і доступ, як у firestore.rules: users/{uid}/… — лише екземпляру з входом саме цього uid.
   onAuthStateChanged повідомляє поточний стан асинхронно після підписки, як справжній SDK. */
export function fakeCloud({ accounts = {} } = {}) {
  const docs = new Map(), apps = new Map(), users = new Map(Object.entries(accounts));
  const calls = { signIn: [], signUp: [], signOut: [], setDoc: [], reset: [] };
  const mode = { getDoc: 'ok', getDocs: 'ok', setDoc: 'ok', auth: null, reset: 'ok', signOut: 'ok' };
  const fail = code => Object.assign(new Error(code), { code });

  const app = (name = '[DEFAULT]') => {
    if (!apps.has(name)) {
      const auth = { appName: name, currentUser: null, listeners: [] };
      apps.set(name, { auth, db: { appName: name } });
    }
    return apps.get(name);
  };
  const emit = async name => { const { auth } = app(name); for (const cb of auth.listeners) await cb(auth.currentUser); };
  const userFor = email => {
    const key = email.trim().toLowerCase();
    if (!users.has(key)) users.set(key, `uid_${users.size + 1}`);
    return { uid: users.get(key), email: key };
  };
  const enter = list => async (auth, email, password) => {
    list.push({ appName: auth.appName, email, password });
    if (mode.auth) throw fail(mode.auth);
    auth.currentUser = userFor(email);
    for (const cb of auth.listeners) await cb(auth.currentUser);
    return { user: auth.currentUser };
  };
  const allowed = ref => {
    const uid = ref.path.split('/')[1];
    if (app(ref.appName).auth.currentUser?.uid !== uid) throw fail('permission-denied');
  };
  const refOf = (db, p) => ({ appName: db.appName, path: p.join('/') });

  const stub = {
    instance: app,
    onAuthStateChanged: (auth, cb) => { auth.listeners.push(cb); queueMicrotask(() => cb(auth.currentUser)); },
    signInWithEmailAndPassword: enter(calls.signIn),
    createUserWithEmailAndPassword: enter(calls.signUp),
    signOut: async auth => {
      calls.signOut.push(auth.appName);
      if (mode.signOut !== 'ok') throw fail(mode.signOut);
      auth.currentUser = null;
      for (const cb of auth.listeners) await cb(null);
    },
    sendPasswordResetEmail: async (auth, email) => {
      calls.reset.push({ email, lang: auth.languageCode, appName: auth.appName });
      if (mode.reset !== 'ok') throw fail(mode.reset);
    },
    doc: (db, ...p) => refOf(db, p),
    collection: (db, ...p) => refOf(db, p),
    getDoc: async ref => {
      if (mode.getDoc !== 'ok') throw fail('unavailable');
      allowed(ref);
      const d = docs.get(ref.path); return { exists: () => !!d, data: () => d };
    },
    setDoc: async (ref, data) => {
      calls.setDoc.push({ path: ref.path, data, appName: ref.appName });
      if (mode.setDoc === 'hang') return new Promise(() => {});
      if (mode.setDoc !== 'ok') throw fail('unavailable');
      allowed(ref);
      docs.set(ref.path, { ...docs.get(ref.path), ...data });
    },
    getDocs: async ref => {
      if (mode.getDocs !== 'ok') throw fail('unavailable');
      allowed(ref);
      return { forEach(cb) { for (const [p, d] of docs) if (p.startsWith(ref.path + '/')) cb({ id: p.slice(ref.path.length + 1), data: () => d }); } };
    }
  };
  return { stub, docs, calls, mode, app, emit, auth: name => app(name).auth };
}
