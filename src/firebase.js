// Firebase Configuration & Services for Patas & Memórias
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDROppC6-5gNVwa2lPCRr5oEK7bNmLyKwU',
  authDomain: 'patas-e-memorias-bento.firebaseapp.com',
  projectId: 'patas-e-memorias-bento',
  storageBucket: 'patas-e-memorias-bento.firebasestorage.app',
  messagingSenderId: '163951152194',
  appId: '1:163951152194:web:987de1165ae7ed631bb1db'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Ensures the visitor is signed in via Firebase Anonymous Auth.
 * Resolves with the authenticated Firebase User.
 */
export function ensureAuthenticated() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        unsubscribe();
        if (user) {
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            resolve(cred.user);
          } catch (err) {
            reject(err);
          }
        }
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });
}

/**
 * Subscribes to real-time updates of the 'memories' collection in Cloud Firestore.
 */
export function subscribeToMemories(onUpdate, onError) {
  const memoriesRef = collection(db, 'memories');
  const q = query(memoriesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      onUpdate(items);
    },
    (error) => {
      console.error('Erro no listener de memórias do Firestore:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Creates a new memory document in Cloud Firestore.
 */
export async function createMemory({ title, date, category, story, photo, isFavorite }) {
  const user = await ensureAuthenticated();
  const now = Date.now();

  const payload = {
    title: String(title || '').trim(),
    date: String(date || '').trim(),
    category: String(category || 'Dia a Dia').trim(),
    story: String(story || '').trim(),
    isFavorite: Boolean(isFavorite),
    createdAt: now,
    updatedAt: now,
    authorId: user.uid
  };

  if (photo) {
    payload.photo = String(photo);
  }

  const docRef = await addDoc(collection(db, 'memories'), payload);
  return { id: docRef.id, ...payload };
}

/**
 * Toggles or updates the favorite status of a memory in Cloud Firestore.
 */
export async function toggleMemoryFavorite(memoryId, isFavorite) {
  await ensureAuthenticated();
  const memRef = doc(db, 'memories', memoryId);
  await updateDoc(memRef, {
    isFavorite: Boolean(isFavorite),
    updatedAt: Date.now()
  });
}

/**
 * Deletes a memory document from Cloud Firestore.
 */
export async function deleteMemoryById(memoryId) {
  await ensureAuthenticated();
  const memRef = doc(db, 'memories', memoryId);
  await deleteDoc(memRef);
}

/**
 * Subscribes to the capsule profile document (`capsule/profile`) in Cloud Firestore.
 */
export function subscribeToCapsuleProfile(onUpdate, onError) {
  const profileRef = doc(db, 'capsule', 'profile');
  return onSnapshot(
    profileRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data());
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Erro ao escutar perfil da cápsula no Firestore:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Saves or updates the pet profile document (`capsule/profile`) in Cloud Firestore.
 */
export async function saveCapsuleProfile({ name, years, subtitle, epitaph, photo }) {
  const user = await ensureAuthenticated();
  const profileRef = doc(db, 'capsule', 'profile');
  const payload = {
    name: String(name || '').trim(),
    years: String(years || '').trim(),
    subtitle: String(subtitle || '').trim(),
    epitaph: String(epitaph || '').trim(),
    photo: String(photo || '').trim(),
    updatedAt: Date.now(),
    updatedBy: user.uid
  };
  await setDoc(profileRef, payload, { merge: true });
  return payload;
}

/**
 * Compresses and resizes an uploaded image file to a compact JPEG Data URL
 * so it can be stored safely in Cloud Firestore (< 800KB).
 */
export function compressImageToDataUrl(file, maxWidth = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}
