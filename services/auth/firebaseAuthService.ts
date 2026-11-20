
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser,
  type User as FirebaseUser,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import type { Role, User } from "@/types";

const validRoles: Role[] = [
  "patient",
  "doctor",
  "receptionist",
  "admin",
];

async function getUserProfile(
  firebaseUser: FirebaseUser
): Promise<User | null> {
  const profileRef = doc(db, "users", firebaseUser.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    return null;
  }

  const data = profileSnap.data();

  if (
    !validRoles.includes(data.role) ||
    typeof data.name !== "string" ||
    typeof data.email !== "string"
  ) {
    return null;
  }

  return {
    id: firebaseUser.uid,
    name: data.name,
    email: data.email,
    role: data.role as Role,
    clinicId: typeof data.clinicId === "string" ? data.clinicId : undefined,
    doctorId: typeof data.doctorId === "string" ? data.doctorId : undefined,
  };
}

export const firebaseAuthService = {
  async registerPatient(
    name: string,
    email: string,
    password: string
  ): Promise<User> {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    try {
      const user: User = {
        id: credential.user.uid,
        name: name.trim(),
        email: credential.user.email!,
        role: "patient",
      };

      await setDoc(doc(db, "users", user.id), {
        uid: user.id,
        name: user.name,
        email: user.email,
        role: "patient",
        createdAt: serverTimestamp(),
      });

      return user;
    } catch (error) {
      await deleteUser(credential.user);
      throw error;
    }
  },

  async login(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    const user = await getUserProfile(credential.user);

    if (!user) {
      await signOut(auth);
      throw new Error(
        "Your account profile is missing or invalid. Please contact the administrator."
      );
    }

    return user;
  },

  subscribe(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        callback(null);
        return;
      }

      try {
        const user = await getUserProfile(firebaseUser);

        if (!user) {
          await signOut(auth);
          callback(null);
          return;
        }

        callback(user);
      } catch {
        callback(null);
      }
    });
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },
};
