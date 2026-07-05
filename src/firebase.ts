import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEveTsJbktafJn55YJUodt18FVCMnLfZA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "test-daf45.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://test-daf45.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "test-daf45",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "test-daf45.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1031494863014",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1031494863014:web:21ae3b11a2a019c7d40c67",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4J25PKTGME"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
