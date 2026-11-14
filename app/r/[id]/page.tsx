"use client";

import { useParams } from "next/navigation";
import ReceiveFiles from "@/components/ReceiveFiles";

export default function ReceivePage() {
  const { id: roomId } = useParams<{ id: string }>();
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:items-center sm:px-6 sm:py-16">
      <ReceiveFiles roomId={roomId} />
    </main>
  );
}
