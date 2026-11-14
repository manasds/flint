"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deviceKind, loadDeviceName, newDeviceId, saveDeviceName } from "@/lib/device";
import { createLobby, type Lobby, type LobbyHandlers } from "@/lib/lobby";
import type { Device } from "@/lib/types";

type InviteHandlers = Pick<LobbyHandlers, "onInvite" | "onInviteCancel" | "onInviteBusy">;

/** Joins this network's lobby for the lifetime of the component. */
export function useNearby(handlers: InviteHandlers) {
  const [me, setMe] = useState<Device | null>(null);
  const [peers, setPeers] = useState<Device[]>([]);
  const [online, setOnline] = useState(false);
  const lobbyRef = useRef<Lobby | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const device: Device = { id: newDeviceId(), name: loadDeviceName(), kind: deviceKind() };
    // The device name comes from the user agent and storage, so it must be read on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMe(device);
    const lobby = createLobby(device, {
      onPeers: setPeers,
      onOpen: setOnline,
      onInvite: (m) => handlersRef.current.onInvite(m),
      onInviteCancel: (from, roomId) => handlersRef.current.onInviteCancel(from, roomId),
      onInviteBusy: (from, roomId) => handlersRef.current.onInviteBusy(from, roomId),
    });
    lobbyRef.current = lobby;
    return () => {
      lobby.close();
      lobbyRef.current = null;
    };
  }, []);

  const send = useCallback<Lobby["send"]>((msg) => lobbyRef.current?.send(msg), []);

  const rename = useCallback((name: string) => {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) return;
    saveDeviceName(clean);
    setMe((cur) => (cur ? { ...cur, name: clean } : cur));
    lobbyRef.current?.rename(clean);
  }, []);

  return { me, peers, online, send, rename };
}
