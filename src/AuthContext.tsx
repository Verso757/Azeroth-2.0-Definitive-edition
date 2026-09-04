import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, UserRole } from './types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loginWithGoogle: (isSignup: boolean, providedGuildId?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          if (data.email === 'koferosgroup@gmail.com' && data.role !== 'superadmin') {
             await setDoc(userRef, { role: 'superadmin' }, { merge: true });
             data.role = 'superadmin';
          }
          setProfile(data);
        } else {
          // If profile missing but user exists, potentially re-create
          // This usually happens during signup
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen for guild settings to apply theme color
  useEffect(() => {
    if (!profile?.guildId) {
      document.body.className = 'font-sans text-slate-900 bg-slate-50 theme-blue';
      return;
    }
    const unsub = onSnapshot(doc(db, 'settings', profile.guildId), (docSnap) => {
      const themeColor = docSnap.exists() ? (docSnap.data()?.themeColor || 'blue') : 'blue';
      document.body.className = `font-sans text-slate-900 bg-slate-50 theme-${themeColor}`;
    });
    return () => unsub();
  }, [profile?.guildId]);

  const loginWithGoogle = async (isSignup: boolean, providedGuildId?: string) => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    
    const userRef = doc(db, 'users', cred.user.uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      setProfile(userDoc.data() as UserProfile);
    } else {
      if (!isSignup) {
        await signOut(auth);
        throw new Error('No se encontró una cuenta asociada a este correo. Por favor, únete primero con un Código de Franquicia.');
      }
      
      const cleanGuildId = providedGuildId?.trim().toUpperCase();
      if (!cleanGuildId) {
         await signOut(auth);
         throw new Error('Se requiere un Código de Franquicia válido.');
      }
      
      const { getDocs, query, collection, where, limit } = await import('firebase/firestore');
      
      const isOwnerByEmail = cred.user.email === 'koferosgroup@gmail.com';

      if (!isOwnerByEmail) {
        const guildDoc = await getDoc(doc(db, 'guilds', cleanGuildId));
        if (!guildDoc.exists()) {
          await signOut(auth);
          throw new Error('La Empresa / Franquicia no existe. Registre el código correcto o contacte a administración.');
        }
      }
      
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        displayName: cred.user.displayName || 'Usuario',
        email: cred.user.email || '',
        photoURL: cred.user.photoURL || null,
        guildId: cleanGuildId,
        role: isOwnerByEmail ? 'superadmin' : 'user',
        createdAt: new Date().toISOString()
      };
      await setDoc(userRef, newProfile);
      setProfile(newProfile);
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAdmin: profile?.role === 'admin' || profile?.role === 'superadmin',
      isSuperAdmin: profile?.role === 'superadmin',
      loginWithGoogle,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
