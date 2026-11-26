import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBJG3cc6T9FY-DK2PXOSgWiUCydQ6HeDX0',
  authDomain: 'gjoe-video-editor.firebaseapp.com',
  projectId: 'gjoe-video-editor',
  storageBucket: 'gjoe-video-editor.firebasestorage.app',
  messagingSenderId: '1076746734114',
  appId: '1:1076746734114:web:898b5ba2a2a1a6da18587b',
  measurementId: 'G-R57NBLQRHL'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let user = null;
let taskUnsubscribe = null;
let authGeneration = 0;
const userPath = (uid, area) => collection(db, 'users', uid, area);
const ready = new Promise(resolve => {
  onAuthStateChanged(auth, next => {
    const generation = ++authGeneration;
    user = next;
    taskUnsubscribe?.();
    taskUnsubscribe = null;
    window.dispatchEvent(new CustomEvent('frameforge-cloud-tasks', { detail: null }));
    window.dispatchEvent(new CustomEvent('frameforge-editor-project', { detail: null }));
    if (user) {
      const uid = user.uid;
      taskUnsubscribe = onSnapshot(userPath(uid, 'tasks'), snapshot => {
        if (auth.currentUser?.uid !== uid) return;
        window.dispatchEvent(new CustomEvent('frameforge-cloud-tasks', { detail: snapshot.docs.map(item => ({ id: item.id, ...item.data() })) }));
      }, error => window.dispatchEvent(new CustomEvent('frameforge-cloud-error', { detail: error })));
      getDoc(doc(db, 'users', uid, 'projects', 'editor')).then(snapshot => {
        if (generation !== authGeneration || auth.currentUser?.uid !== uid) return;
        window.dispatchEvent(new CustomEvent('frameforge-editor-project', { detail: snapshot.exists() ? snapshot.data() : null }));
      }).catch(error => window.dispatchEvent(new CustomEvent('frameforge-cloud-error', { detail: error })));
    }
    window.dispatchEvent(new CustomEvent('frameforge-auth-state', { detail: user }));
    resolve(user);
  });
});

async function requireUser() {
  await ready;
  if (!user) throw new Error('Sign in to sync this data.');
  return user;
}

window.FrameforgeFirebase = {
  ready,
  get user() { return user; },
  async getIdToken() { return (await requireUser()).getIdToken(); },
  async signUp(email, password) { return createUserWithEmailAndPassword(auth, email, password); },
  async signIn(email, password) { return signInWithEmailAndPassword(auth, email, password); },
  async signOut() { return signOut(auth); },
  async saveTask(task) {
    const current = await requireUser();
    const { id, text, status, createdAt } = task;
    const attachments = Array.isArray(task.attachments) ? task.attachments.map(({ id: attachmentId, name, type, size }) => ({ id: attachmentId, name, type, size })) : [];
    const assistantResult = task.assistantResult && typeof task.assistantResult.text === 'string'
      ? {
          text: task.assistantResult.text.slice(0, 12000),
          images: Array.isArray(task.assistantResult.images) ? task.assistantResult.images.slice(0, 5).map(image => ({ id: Number(image.id) || 0, tags: String(image.tags || '').slice(0, 160), previewURL: String(image.previewURL || '').slice(0, 2000), pageURL: String(image.pageURL || '').slice(0, 2000) })) : [],
          videos: Array.isArray(task.assistantResult.videos) ? task.assistantResult.videos.slice(0, 5).map(video => ({ id: Number(video.id) || 0, tags: String(video.tags || '').slice(0, 160), videoURL: String(video.videoURL || '').slice(0, 2000), thumbnailURL: String(video.thumbnailURL || '').slice(0, 2000), pageURL: String(video.pageURL || '').slice(0, 2000), duration: Number(video.duration) || 0, width: Number(video.width) || 0, height: Number(video.height) || 0 })) : [],
          pixabayExpiresAt: Number(task.assistantResult.pixabayExpiresAt) || null,
          sources: Array.isArray(task.assistantResult.sources) ? task.assistantResult.sources.slice(0, 3).map(source => ({ url: String(source.url || '').slice(0, 2000), error: source.error ? String(source.error).slice(0, 200) : '' })) : [],
        }
      : null;
    await setDoc(doc(db, 'users', current.uid, 'tasks', id), { text, status, createdAt, attachments, ...(assistantResult ? { assistantResult } : {}), updatedAt: serverTimestamp() });
  },
  async updateTask(task) { return this.saveTask(task); },
  async deleteTask(id) {
    const current = await requireUser();
    await deleteDoc(doc(db, 'users', current.uid, 'tasks', id));
  },
  async saveEditorProject(project) {
    const current = await requireUser();
    const safeProject = JSON.parse(JSON.stringify(project));
    await setDoc(doc(db, 'users', current.uid, 'projects', 'editor'), { ...safeProject, updatedAt: serverTimestamp() });
  },
  async loadEditorProject() {
    const current = await requireUser();
    const snapshot = await getDoc(doc(db, 'users', current.uid, 'projects', 'editor'));
    return snapshot.exists() ? snapshot.data() : null;
  }
};
