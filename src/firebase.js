// Firebase Configuration & Services for Patas & Memórias • NFC Multi-Pet Edition
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
 * Extracts and sanitizes the active capsule ID from the URL.
 * Supports:
 * - Query parameters: `?pet=rex`, `?p=pote-123`, `?c=luna`, `?pote=001`
 * - Path parameters: `/p/rex` or `/pet/rex`
 * Defaults to 'bento' if no parameter is provided.
 */
export function getCurrentCapsuleId() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramId =
      urlParams.get('pet') ||
      urlParams.get('p') ||
      urlParams.get('c') ||
      urlParams.get('pote') ||
      urlParams.get('id');

    if (paramId && paramId.trim()) {
      return sanitizeCapsuleId(paramId);
    }

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const reservedWords = [
      'index.html',
      'assets',
      'src',
      'public',
      'api',
      'dist',
      'favicon.ico',
      'manifest.json',
      'robots.txt'
    ];

    // Formato /pet/nome ou /p/nome
    if (
      pathParts.length >= 2 &&
      (pathParts[0].toLowerCase() === 'p' || pathParts[0].toLowerCase() === 'pet')
    ) {
      return sanitizeCapsuleId(pathParts[1]);
    }

    // Formato ultra-amigável direto na raiz: /nome-do-pet (ex: /thor, /luna, /bento)
    if (pathParts.length === 1 && !reservedWords.includes(pathParts[0].toLowerCase())) {
      return sanitizeCapsuleId(pathParts[0]);
    }
  } catch (e) {
    console.warn('Erro ao resolver capsuleId da URL:', e);
  }

  return 'bento';
}

/**
 * Sanitizes a string for use as a Firestore document ID / NFC URL slug.
 */
export function sanitizeCapsuleId(str) {
  if (!str) return 'bento';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9_-]/g, '-')    // caracteres seguros
    .replace(/-+/g, '-')             // remove duplicatas
    .slice(0, 64) || 'bento';
}

/**
 * Generates the clean direct NFC / Shareable URL for the given capsule ID.
 * Produces clean friendly URLs: e.g. https://patas.com.br/thor or https://patas.com.br/luna
 */
export function getCapsuleShareUrl(capsuleId) {
  const origin = window.location.origin;
  const id = sanitizeCapsuleId(capsuleId);
  return id === 'bento' ? `${origin}/` : `${origin}/${encodeURIComponent(id)}`;
}

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
 * Subscribes to real-time updates of the pet capsule document in Cloud Firestore.
 * Supports the multi-pet `/capsules/{capsuleId}` collection with transparent
 * fallback to legacy `/capsule/profile` for backwards compatibility with Bento.
 */
export function subscribeToCapsuleProfile(capsuleId, onUpdate, onError) {
  const safeId = sanitizeCapsuleId(capsuleId);
  const capsuleDocRef = doc(db, 'capsules', safeId);

  return onSnapshot(
    capsuleDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate({ id: docSnap.id, ...docSnap.data() });
      } else if (safeId === 'bento') {
        // Fallback transparent to legacy profile document for existing Bento capsule
        const legacyRef = doc(db, 'capsule', 'profile');
        onSnapshot(
          legacyRef,
          (legacySnap) => {
            if (legacySnap.exists()) {
              onUpdate({ id: 'bento', ...legacySnap.data() });
            } else {
              onUpdate(null);
            }
          },
          (legacyErr) => {
            console.error('Erro ao ler legado:', legacyErr);
            onUpdate(null);
          }
        );
      } else {
        // Tag scanned for the first time; capsule not yet initialized
        onUpdate(null);
      }
    },
    (error) => {
      console.error(`Erro ao escutar perfil da cápsula [${safeId}]:`, error);
      if (onError) onError(error);
    }
  );
}

/**
 * Saves or updates a pet profile document (`/capsules/{capsuleId}`).
 */
export async function saveCapsuleProfile(capsuleId, { name, years, subtitle, epitaph, photo, adminPin }) {
  const user = await ensureAuthenticated();
  const safeId = sanitizeCapsuleId(capsuleId);
  const profileRef = doc(db, 'capsules', safeId);

  const payload = {
    name: String(name || '').trim(),
    years: String(years || '').trim(),
    subtitle: String(subtitle || '').trim(),
    epitaph: String(epitaph || '').trim(),
    photo: String(photo || '').trim(),
    claimed: true,
    updatedAt: Date.now(),
    updatedBy: user.uid
  };

  if (adminPin && String(adminPin).trim()) {
    payload.adminPin = String(adminPin).trim();
  }

  await setDoc(profileRef, payload, { merge: true });

  // Keep legacy doc updated if Bento to preserve backward compatibility
  if (safeId === 'bento') {
    try {
      const legacyRef = doc(db, 'capsule', 'profile');
      await setDoc(legacyRef, payload, { merge: true });
    } catch (e) {
      console.warn('Sync legado opcional ignorado:', e);
    }
  }

  return payload;
}

/**
 * Subscribes to memories of a specific pet capsule (`/capsules/{capsuleId}/memories`).
 * If 'bento', checks legacy collection `/memories` if subcollection is empty.
 */
export function subscribeToMemories(capsuleId, onUpdate, onError) {
  const safeId = sanitizeCapsuleId(capsuleId);
  const memoriesRef = collection(db, 'capsules', safeId, 'memories');
  const q = query(memoriesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          capsuleId: safeId,
          ...docSnap.data()
        }));
        onUpdate(items);
      } else if (safeId === 'bento') {
        // Check legacy flat `/memories` collection for backward compatibility
        const legacyRef = collection(db, 'memories');
        const legacyQuery = query(legacyRef, orderBy('createdAt', 'desc'));
        onSnapshot(
          legacyQuery,
          (legacySnap) => {
            const legacyItems = legacySnap.docs.map((docSnap) => ({
              id: docSnap.id,
              capsuleId: 'bento',
              ...docSnap.data()
            }));
            onUpdate(legacyItems);
          },
          (legacyErr) => {
            if (onError) onError(legacyErr);
          }
        );
      } else {
        onUpdate([]);
      }
    },
    (error) => {
      console.error(`Erro ao escutar memórias de [${safeId}]:`, error);
      if (onError) onError(error);
    }
  );
}

/**
 * Creates a new memory document scoped to a pet capsule.
 */
export async function createMemory(capsuleId, { title, date, category, story, photo, isFavorite }) {
  const user = await ensureAuthenticated();
  const safeId = sanitizeCapsuleId(capsuleId);
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

  const subColRef = collection(db, 'capsules', safeId, 'memories');
  const docRef = await addDoc(subColRef, payload);
  return { id: docRef.id, capsuleId: safeId, ...payload };
}

/**
 * Toggles or updates the favorite status of a memory in Cloud Firestore.
 */
export async function toggleMemoryFavorite(capsuleId, memoryId, isFavorite) {
  await ensureAuthenticated();
  const safeId = sanitizeCapsuleId(capsuleId);

  try {
    const memRef = doc(db, 'capsules', safeId, 'memories', memoryId);
    await updateDoc(memRef, {
      isFavorite: Boolean(isFavorite),
      updatedAt: Date.now()
    });
  } catch (err) {
    // If it was from legacy bento collection
    if (safeId === 'bento') {
      const legacyDocRef = doc(db, 'memories', memoryId);
      await updateDoc(legacyDocRef, {
        isFavorite: Boolean(isFavorite),
        updatedAt: Date.now()
      });
    } else {
      throw err;
    }
  }
}

/**
 * Deletes a memory document from Cloud Firestore.
 */
export async function deleteMemoryById(capsuleId, memoryId) {
  await ensureAuthenticated();
  const safeId = sanitizeCapsuleId(capsuleId);

  try {
    const memRef = doc(db, 'capsules', safeId, 'memories', memoryId);
    await deleteDoc(memRef);
  } catch (err) {
    // If it was from legacy bento collection
    if (safeId === 'bento') {
      const legacyDocRef = doc(db, 'memories', memoryId);
      await deleteDoc(legacyDocRef);
    } else {
      throw err;
    }
  }
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
