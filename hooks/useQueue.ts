"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueueToken } from "@/types";
import { queueService } from "@/services/queue/queueService";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export function useQueue(doctorId?: string) {
  const [tokens, setTokens] = useState<QueueToken[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await queueService.list(doctorId);
      setTokens(data);
    } catch (error) {
      console.error("Queue refresh failed:", error);
    }
  }, [doctorId]);

  useEffect(() => {
    let active = true;
    let unsubscribeQueue: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!active) return;

      // Clean up any existing queue subscription
      if (unsubscribeQueue) {
        unsubscribeQueue();
        unsubscribeQueue = undefined;
      }

      if (!firebaseUser) {
        setTokens(null);
        return;
      }

      // Initial HTTP fetch
      refresh();

      // Start live onSnapshot listener
      queueService
        .subscribeToQueue(
          (updatedTokens) => {
            if (active) {
              setTokens(updatedTokens);
            }
          },
          (error) => {
            console.error("Real-time queue listener notice:", error);
            // Fallback to HTTP refresh if real-time listener fails (e.g. security rules)
            refresh();
          }
        )
        .then((stopListening) => {
          if (active) {
            unsubscribeQueue = stopListening;
          } else {
            stopListening();
          }
        })
        .catch((error) => {
          console.error("Queue subscription setup notice:", error);
          refresh();
        });
    });

    return () => {
      active = false;
      unsubscribeAuth();
      unsubscribeQueue?.();
    };
  }, [doctorId, refresh]);

  return { tokens, refresh };
}